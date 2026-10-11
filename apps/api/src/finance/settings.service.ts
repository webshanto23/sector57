import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  receiptHeaderSchema,
  SETTING_KEYS,
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
      shareRentersWithThana: value('shareRentersWithThana') === true,
      separateFacilityFunds: value('separateFacilityFunds') === true,
      fiscalYearStartMonth: society.fiscal_year_start_month,
      fiscalYearLocked: ledgerRow !== null,
      // Until the office saves one, receipts print the society's own name and contacts.
      receiptHeader: header.success
        ? header.data
        : { nameBn: society.name_bn, nameEn: society.name_en, addressBn: society.address, addressEn: null, phone: society.phone },
    };
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
      };
      for (const [key, value] of Object.entries(values) as [SettingKey, Prisma.InputJsonValue | undefined][]) {
        if (value === undefined) continue;
        await tx.society_settings.upsert({
          where: { society_id_key: { society_id: actor.societyId, key: SETTING_KEYS[key] } },
          update: { value, updated_by: actor.userId, updated_at: new Date() },
          create: { society_id: actor.societyId, key: SETTING_KEYS[key], value, updated_by: actor.userId },
        });
      }
      if (month !== undefined) await tx.societies.update({ where: { id: actor.societyId }, data: { fiscal_year_start_month: month } });

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
    if (input.fiscalYearStartMonth !== undefined) this.societies.forget(societySlug);
    return after;
  }
}
