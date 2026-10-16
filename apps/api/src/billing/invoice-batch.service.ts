import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  billSpan,
  duplicateBills,
  MAX_BILLABLE_UNITS,
  periodDays,
  splitByFund,
  type BatchWarning,
  type BillableUnits,
  type InvoiceBatch,
  type InvoiceBatchCheck,
  type InvoiceBatchResult,
  type InvoicePrint,
} from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import { fundClosed, toFundOption } from '../finance/funds.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, beyondPermissions, TreeService } from '../property/tree.service.js';
import { BillToService, type BillableUnit } from './bill-to.service.js';
import { canSeeBill, invoiceNotFound, invoiceSelect, InvoicesService } from './invoices.service.js';

type Client = Pick<PrismaService, 'units' | 'charge_types'>;
type ChargeTypeRow = { id: string; name_bn: string; name_en: string | null; fund: ReturnType<typeof toFundOption> };

/** A whole batch may take a while: every bill is written in one transaction. */
const BATCH_TIMEOUT_MS = 2 * 60_000;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const bad = (code: string, message: string) => new BadRequestException({ code, message });

/** The unit an error is about, for the form to point at. */
function aboutUnit(error: unknown, unitId: string): unknown {
  if (!(error instanceof HttpException)) return error;
  const body = error.getResponse();
  if (typeof body !== 'object') return error;
  const details = (body as { details?: object }).details ?? {};
  return new HttpException({ ...body, details: { ...details, unitId } }, error.getStatus());
}

/**
 * Bills for several units at once, each with lines of its own (Step 27), and printing a
 * set of bills together. Each bill goes through `InvoicesService.issueRegularIn`, so it
 * gets the same checks, numbering and audit as a single bill. A unit's lines are split
 * into one bill per fund.
 */
@Injectable()
export class InvoiceBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly billTo: BillToService,
    private readonly tree: TreeService,
  ) {}

  /** What the batch would make, unit by unit, with who pays, the bills per fund, and earlier bills that look the same. */
  async check(actor: Actor, input: InvoiceBatch): Promise<InvoiceBatchCheck> {
    const units = await this.units(this.prisma, actor, input.units.map((unit) => unit.unitId));
    const types = await this.chargeTypes(this.prisma, actor.societyId, input);
    const today = isoDate(todayDate());
    const period = periodDays(input.periodFrom, input.periodTo);
    const span = billSpan(period?.start ?? null, period?.end ?? null, today);

    const [choices, names, earlier] = await Promise.all([
      this.billTo.choose(actor.societyId, units),
      this.tree.addressNames(actor.societyId, units.map((unit) => unit.path)),
      this.earlierBills(actor.societyId, input, span),
    ]);
    const parties = await this.billTo.parties([...choices.values()].flatMap((choice) => (choice ? [choice.payer] : [])));
    const unitOf = new Map(units.map((unit) => [unit.id, unit]));

    const rows = input.units.map(({ unitId, lines }) => {
      const unit = unitOf.get(unitId)!;
      const choice = choices.get(unitId) ?? null;
      const party = choice ? parties.get(choice.payer.id) : undefined;
      const bills = splitByFund(lines, (id) => types.get(id)!.fund.id).map((group) => ({
        fund: types.get(group.lines[0]!.chargeTypeId)!.fund,
        lineCount: group.lines.length,
        total: addMoney(...group.lines.map((line) => line.amount)),
      }));
      const warnings: BatchWarning[] = duplicateBills(
        lines.map((line) => line.chargeTypeId),
        span,
        earlier.get(unitId) ?? [],
      ).map((found) => ({
        invoiceId: found.invoiceId,
        invoiceNo: found.invoiceNo,
        charges: found.chargeTypeIds.map((id) => ({ nameBn: types.get(id)!.name_bn, nameEn: types.get(id)!.name_en })),
      }));
      return {
        unitId,
        name: unit.name,
        code: unit.code,
        address: addressOf(unit.path, names),
        billTo: choice && party ? { ...party, role: choice.role } : null,
        bills,
        total: addMoney(...bills.map((bill) => bill.total)),
        warnings,
        problem: !unit.isActive ? ('unit_inactive' as const) : !choice || !party ? ('no_bill_to' as const) : null,
      };
    });
    return {
      units: rows,
      billCount: rows.reduce((count, row) => count + row.bills.length, 0),
      total: addMoney('0', ...rows.map((row) => row.total)),
    };
  }

  /** Makes every bill or none. An error names the unit it is about in `details.unitId`. */
  async create(actor: Actor, input: InvoiceBatch): Promise<InvoiceBatchResult> {
    if (input.dueDate < isoDate(todayDate())) throw bad('due_before_issue', 'The due date is before the bill date');
    const period = periodDays(input.periodFrom, input.periodTo);
    const invoices = await this.prisma.$transaction(
      async (tx) => {
        await this.units(tx, actor, input.units.map((unit) => unit.unitId));
        const types = await this.chargeTypes(tx, actor.societyId, input);
        const made: InvoiceBatchResult['invoices'] = [];
        for (const { unitId, lines } of input.units) {
          for (const group of splitByFund(lines, (id) => types.get(id)!.fund.id)) {
            try {
              const bill = await this.invoices.issueRegularIn(tx, actor, { unitId, dueDate: input.dueDate, period, lines: group.lines });
              made.push({ ...bill, unitId });
            } catch (error) {
              throw aboutUnit(error, unitId);
            }
          }
        }
        return made;
      },
      { timeout: BATCH_TIMEOUT_MS, maxWait: BATCH_TIMEOUT_MS },
    );
    return { invoices };
  }

  /** Every unit the caller may bill, with who a bill would go to now, by address and then name (the batch's unit picker). */
  async billable(actor: Actor): Promise<BillableUnits> {
    const scope = actor.access.paths('create', 'billing');
    const rows = await this.prisma.units.findMany({
      where: {
        society_id: actor.societyId,
        ...(scope === 'all' ? {} : { OR: scope.map((prefix) => ({ locations: { path: { startsWith: prefix } } })) }),
      },
      select: { location_id: true, locations: { select: { name: true, code: true, path: true, is_active: true } } },
      orderBy: [{ locations: { path: 'asc' } }],
      take: MAX_BILLABLE_UNITS + 1,
    });
    const units = rows.slice(0, MAX_BILLABLE_UNITS).map((row) => ({ id: row.location_id, path: row.locations.path }));
    const [choices, names] = await Promise.all([
      this.billTo.choose(actor.societyId, units),
      this.tree.addressNames(actor.societyId, units.map((unit) => unit.path)),
    ]);
    const parties = await this.billTo.parties([...choices.values()].flatMap((choice) => (choice ? [choice.payer] : [])));
    const collator = new Intl.Collator('bn', { numeric: true });
    const items = rows.slice(0, MAX_BILLABLE_UNITS).map((row) => {
      const choice = choices.get(row.location_id) ?? null;
      const party = choice ? parties.get(choice.payer.id) : undefined;
      return {
        id: row.location_id,
        name: row.locations.name,
        code: row.locations.code,
        address: addressOf(row.locations.path, names),
        isActive: row.locations.is_active,
        billTo: choice && party ? { ...party, role: choice.role } : null,
      };
    });
    items.sort((a, b) => collator.compare(a.address.join(' / '), b.address.join(' / ')) || collator.compare(a.name, b.name));
    return { items, truncated: rows.length > MAX_BILLABLE_UNITS };
  }

  /** Full bills to print together, in the order asked. 404 if any is missing or outside the caller's area. */
  async print(actor: Actor, ids: string[]): Promise<InvoicePrint> {
    const rows = await this.prisma.invoices.findMany({ where: { id: { in: ids }, society_id: actor.societyId }, select: invoiceSelect });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.map((id) => {
      const row = byId.get(id);
      if (!row || !canSeeBill(actor.access, row)) throw invoiceNotFound();
      return row;
    });
    return { items: await this.invoices.details(actor, ordered) };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** The units, each in this society and where the caller may make bills; in the order given. */
  private async units(client: Client, actor: Actor, unitIds: string[]): Promise<BillableUnit[]> {
    const rows = await client.units.findMany({
      where: { society_id: actor.societyId, location_id: { in: unitIds } },
      select: { location_id: true, locations: { select: { name: true, code: true, path: true, is_active: true } } },
    });
    const byId = new Map(rows.map((row) => [row.location_id, row]));
    return unitIds.map((unitId) => {
      const row = byId.get(unitId);
      if (!row || !actor.access.can('view', 'billing', { path: row.locations.path })) {
        throw new NotFoundException({ code: 'unit_not_found', message: 'Unit not found', details: { unitId } });
      }
      if (!actor.access.can('create', 'billing', { path: row.locations.path })) throw aboutUnit(beyondPermissions(), unitId);
      return { id: unitId, name: row.locations.name, code: row.locations.code, path: row.locations.path, isActive: row.locations.is_active };
    });
  }

  /** Every charge type the lines name: this society's, in use, and paying into an open fund. */
  private async chargeTypes(client: Client, societyId: string, input: InvoiceBatch): Promise<Map<string, ChargeTypeRow>> {
    const ids = [...new Set(input.units.flatMap((unit) => unit.lines.map((line) => line.chargeTypeId)))];
    const rows = await client.charge_types.findMany({
      where: { id: { in: ids }, society_id: societyId },
      select: { id: true, name_bn: true, name_en: true, archived_at: true, funds: { select: { id: true, name_bn: true, name_en: true, is_default: true, closed_at: true } } },
    });
    if (rows.length !== ids.length) throw bad('invalid_charge_type', 'Unknown charge type');
    if (rows.some((row) => row.archived_at)) throw bad('charge_type_archived', 'This charge type is no longer used');
    if (rows.some((row) => row.funds.closed_at)) throw fundClosed();
    return new Map(rows.map((row) => [row.id, { id: row.id, name_bn: row.name_bn, name_en: row.name_en, fund: toFundOption(row.funds) }]));
  }

  /** The units' earlier bills (not void) with any of the batch's charge types, overlapping `span`, by unit. */
  private async earlierBills(societyId: string, input: InvoiceBatch, span: { start: string; end: string }) {
    const typeIds = [...new Set(input.units.flatMap((unit) => unit.lines.map((line) => line.chargeTypeId)))];
    const rows = await this.prisma.invoices.findMany({
      where: {
        society_id: societyId,
        unit_id: { in: input.units.map((unit) => unit.unitId) },
        status: { not: 'void' },
        invoice_lines: { some: { charge_type_id: { in: typeIds } } },
        OR: [
          { period_start: { lte: day(span.end) }, period_end: { gte: day(span.start) } },
          { period_start: null, issue_date: { gte: day(span.start), lte: day(span.end) } },
        ],
      } satisfies Prisma.invoicesWhereInput,
      select: {
        id: true,
        invoice_no: true,
        unit_id: true,
        period_start: true,
        period_end: true,
        issue_date: true,
        invoice_lines: { select: { charge_type_id: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ issue_date: 'asc' }, { invoice_no: 'asc' }],
    });
    const byUnit = new Map<string, Parameters<typeof duplicateBills>[2]>();
    for (const row of rows) {
      const list = byUnit.get(row.unit_id!) ?? [];
      list.push({
        id: row.id,
        invoiceNo: row.invoice_no,
        span: billSpan(row.period_start && isoDate(row.period_start), row.period_end && isoDate(row.period_end), isoDate(row.issue_date)),
        chargeTypeIds: row.invoice_lines.map((line) => line.charge_type_id),
      });
      byUnit.set(row.unit_id!, list);
    }
    return byUnit;
  }
}
