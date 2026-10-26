import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  brandingOf,
  printFormatsOf,
  receiptHeaderSchema,
  SETTING_KEYS,
  type Branding,
  type BillPrintSettings,
  type DocumentHeader,
  type PrintChoice,
  type PrintFormats,
  type ReceiptHeader,
  type SettingKey,
  type SettingsInput,
  type SocietySettings,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SocietyService } from '../society/society.service.js';
import { lockFinanceSetup } from './numbering.service.js';

// Until the office saves a header, receipts print the society's own name and contacts.
const headerFromSociety = (society: { name_bn: string; name_en: string | null; address: string | null; phone: string | null }): ReceiptHeader => ({
  nameBn: society.name_bn,
  nameEn: society.name_en,
  addressBn: society.address,
  addressEn: null,
  phone: society.phone,
  email: null,
  regNo: null,
  officeHoursBn: null,
  officeHoursEn: null,
});

type Client = Pick<PrismaService, 'societies' | 'society_settings' | 'ledger_entries'>;

/**
 * The president's switches (`society_settings`) and the fiscal year start (`societies`).
 * Only the keys in `SETTING_KEYS` are read or written.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly societies: SocietyService,
  ) {}

  async get(societyId: string, client: Client = this.prisma): Promise<SocietySettings> {
    const [society, rows, ledgerRow] = await Promise.all([
      client.societies.findUniqueOrThrow({
        where: { id: societyId },
        select: { name_bn: true, name_en: true, address: true, phone: true, fiscal_year_start_month: true },
      }),
      client.society_settings.findMany({
        where: { society_id: societyId, key: { in: Object.values(SETTING_KEYS) } },
        select: { key: true, value: true },
      }),
      client.ledger_entries.findFirst({ where: { society_id: societyId }, select: { id: true } }),
    ]);
    const value = (key: SettingKey) => rows.find((row) => row.key === SETTING_KEYS[key])?.value;
    const header = receiptHeaderSchema.safeParse(value('receiptHeader'));
    return {
      printFormats: printFormatsOf(value('printFormats')),
      profile: { nameBn: society.name_bn, nameEn: society.name_en, ...brandingOf(value('branding'), society.name_bn) },
      shareRentersWithThana: value('shareRentersWithThana') === true,
      separateFacilityFunds: value('separateFacilityFunds') === true,
      fiscalYearStartMonth: society.fiscal_year_start_month,
      fiscalYearLocked: ledgerRow !== null,
      receiptHeader: header.success
        ? header.data
        : headerFromSociety(society),
    };
  }

  /** What receipts and printed bills show at the top, with the logo badge. */
  async receiptHeader(societyId: string): Promise<DocumentHeader> {
    const [society, rows] = await Promise.all([
      this.prisma.societies.findUniqueOrThrow({ where: { id: societyId }, select: { name_bn: true, name_en: true, address: true, phone: true } }),
      this.prisma.society_settings.findMany({
        where: { society_id: societyId, key: { in: [SETTING_KEYS.receiptHeader, SETTING_KEYS.branding] } },
        select: { key: true, value: true },
      }),
    ]);
    const value = (key: string) => rows.find((row) => row.key === key)?.value;
    const header = receiptHeaderSchema.safeParse(value(SETTING_KEYS.receiptHeader));
    const { mark } = brandingOf(value(SETTING_KEYS.branding), society.name_bn);
    return header.success
      ? { ...header.data, mark }
      : { ...headerFromSociety(society), mark };
  }

  /** Which papers bills may print on, and the note they carry. */
  async billPrint(societyId: string): Promise<BillPrintSettings> {
    const row = await this.prisma.society_settings.findUnique({
      where: { society_id_key: { society_id: societyId, key: SETTING_KEYS.printFormats } },
      select: { value: true },
    });
    return printFormatsOf(row?.value).bill;
  }

  /** Which papers receipts (bill payments and donations) may print on. */
  async receiptPrint(societyId: string): Promise<PrintChoice> {
    const row = await this.prisma.society_settings.findUnique({
      where: { society_id_key: { society_id: societyId, key: SETTING_KEYS.printFormats } },
      select: { value: true },
    });
    return printFormatsOf(row?.value).receipt;
  }

  /** Is the society keeping facility money (mosque, gym) in funds of their own? */
  async separateFunds(societyId: string, client: Pick<PrismaService, 'society_settings'> = this.prisma): Promise<boolean> {
    const row = await client.society_settings.findUnique({
      where: { society_id_key: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds } },
      select: { value: true },
    });
    return row?.value === true;
  }

  async update(actor: Actor, societySlug: string, input: SettingsInput): Promise<SocietySettings> {
    const after = await this.prisma.$transaction(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const before = await this.get(actor.societyId, tx);

      const month = input.fiscalYearStartMonth;
      if (month !== undefined && month !== before.fiscalYearStartMonth && before.fiscalYearLocked) {
        throw new ConflictException({ code: 'fiscal_year_locked', message: 'The fiscal year cannot move once the ledger has entries' });
      }
      if (input.separateFacilityFunds === false && before.separateFacilityFunds) {
        const open = await tx.funds.count({ where: { society_id: actor.societyId, is_default: false, closed_at: null } });
        if (open > 0) throw new ConflictException({ code: 'funds_open', message: 'Close the other funds first' });
      }

      const values: { [K in SettingKey]?: Prisma.InputJsonValue } = {
        shareRentersWithThana: input.shareRentersWithThana,
        separateFacilityFunds: input.separateFacilityFunds,
        receiptHeader: input.receiptHeader satisfies ReceiptHeader | undefined,
        // Only the documents sent change; the others keep what is saved.
        printFormats: input.printFormats && ({ ...before.printFormats, ...input.printFormats } satisfies PrintFormats),
        branding: input.profile && ({ mark: input.profile.mark, placeBn: input.profile.placeBn, placeEn: input.profile.placeEn } satisfies Branding),
      };
      for (const [key, value] of Object.entries(values) as [SettingKey, Prisma.InputJsonValue | undefined][]) {
        if (value === undefined) continue;
        await tx.society_settings.upsert({
          where: { society_id_key: { society_id: actor.societyId, key: SETTING_KEYS[key] } },
          update: { value, updated_by: actor.userId, updated_at: new Date() },
          create: { society_id: actor.societyId, key: SETTING_KEYS[key], value, updated_by: actor.userId },
        });
      }
      if (month !== undefined || input.profile) {
        await tx.societies.update({
          where: { id: actor.societyId },
          data: {
            fiscal_year_start_month: month,
            name_bn: input.profile?.nameBn,
            ...(input.profile ? { name_en: input.profile.nameEn } : {}),
          },
        });
      }

      const after = await this.get(actor.societyId, tx);
      const changed = (Object.keys(input) as (keyof SettingsInput)[]).filter((key) => input[key] !== undefined);
      await this.audit.record(
        {
          societyId: actor.societyId,
          userId: actor.userId,
          action: 'update',
          entityType: 'society_settings',
          entityId: actor.societyId,
          before: Object.fromEntries(changed.map((key) => [key, before[key]])),
          after: Object.fromEntries(changed.map((key) => [key, after[key]])),
          ip: actor.ip,
        },
        tx,
      );
      return after;
    });
    // The cached society carries the fiscal year, the name and the branding.
    if (input.fiscalYearStartMonth !== undefined || input.profile) this.societies.forget(societySlug);
    return after;
  }
}
