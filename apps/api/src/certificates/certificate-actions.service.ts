import { ConflictException, Injectable } from '@nestjs/common';
import {
  CERTIFICATE_PLACEHOLDERS,
  CERTIFICATE_TEMPLATES_KEY,
  CERTIFICATE_TYPES,
  certificateTemplatesOf,
  DEFAULT_CERTIFICATE_TEMPLATES,
  duesDecision,
  type CertificateDetail,
  type CertificateIssueInput,
  type CertificateLang,
  type CertificatePrint,
  type CertificateTemplatesInput,
  type CertificateTemplatesView,
  type CertificateType,
  type CertificateVoidInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { unitDues } from '../billing/unit-dues.js';
import { isoDate, todayDate } from '../common/dates.js';
import { NumberingService } from '../finance/numbering.service.js';
import { SettingsService } from '../finance/settings.service.js';
import { auditOf } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { certificatePlace } from './certificate-rows.js';
import { CertificatesService, certificateNotDraft } from './certificates.service.js';

const notIssued = () => new ConflictException({ code: 'certificate_not_issued', message: 'This certificate has not been issued' });
const alreadyVoid = () => new ConflictException({ code: 'certificate_already_void', message: 'This certificate is already void' });

/**
 * Issuing (numbers the draft and freezes its letter, signer and the unit's dues), voiding, the
 * print data and the letter templates. Each change writes its audit row in the same transaction.
 */
@Injectable()
export class CertificateActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly certificates: CertificatesService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * `certificates.approve` at the unit. The person is checked again (they may have moved out).
   * 409 `certificate_not_draft`, `certificate_person_not_at_unit`, `certificate_not_member`,
   * `certificate_dues_outstanding` (a no-dues certificate while anything is owed) and
   * `certificate_dues_unpaid` (another type without `allowDues`), both with `details.owed`.
   */
  async issue(actor: Actor, id: string, input: CertificateIssueInput): Promise<CertificateDetail> {
    const row = await this.certificates.changeable(actor, id, 'approve');
    if (row.status !== 'draft') throw certificateNotDraft();
    const type = row.type as CertificateType;
    const unit = certificatePlace(row);
    const day = isoDate(todayDate());
    await this.prisma.$transaction(async (tx) => {
      await this.certificates.checkPerson(tx, actor.societyId, type, unit, row.person_id);
      const { owed } = await unitDues(tx, actor.societyId, unit.id);
      const decision = duesDecision(type, owed, input.allowDues);
      if (decision === 'blocked') {
        throw new ConflictException({ code: 'certificate_dues_outstanding', message: 'Bills on this unit are still unpaid', details: { owed } });
      }
      if (decision === 'needs_allow') {
        throw new ConflictException({ code: 'certificate_dues_unpaid', message: 'Bills on this unit are still unpaid; set allowDues to issue anyway', details: { owed } });
      }
      const certNo = (await this.numbering.next(tx, actor.societyId, 'certificate', day)).formatted;
      const body = await this.certificates.letter(tx, actor.societyId, row, day, certNo);
      const { count } = await tx.certificates.updateMany({
        where: { id, status: 'draft' },
        data: {
          status: 'issued',
          cert_no: certNo,
          body,
          signer_name: input.signerName,
          signer_title: input.signerTitle,
          dues_owed: owed,
          issued_at: new Date(),
          issued_by: actor.userId,
          updated_at: new Date(),
        },
      });
      if (count === 0) throw certificateNotDraft();
      await this.audit.record(
        { ...auditOf(actor, 'certificate', 'issue', id), after: { certNo, type, signerName: input.signerName, duesOwed: owed, allowDues: decision === 'allowed' } },
        tx,
      );
    });
    return this.certificates.get(actor, id);
  }

  /** `certificates.approve` at the unit; issued ones only, once. 409 `certificate_not_issued`, `certificate_already_void`. */
  async void(actor: Actor, id: string, input: CertificateVoidInput): Promise<CertificateDetail> {
    const row = await this.certificates.changeable(actor, id, 'approve');
    if (row.status === 'void') throw alreadyVoid();
    if (row.status !== 'issued') throw notIssued();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.certificates.updateMany({
        where: { id, status: 'issued' },
        data: { status: 'void', voided_at: new Date(), voided_by: actor.userId, void_reason: input.reason, updated_at: new Date() },
      });
      if (count === 0) throw alreadyVoid();
      await this.audit.record({ ...auditOf(actor, 'certificate', 'void', id), before: { certNo: row.cert_no, status: 'issued' }, after: { status: 'void', reason: input.reason } }, tx);
    });
    return this.certificates.get(actor, id);
  }

  /** The A4 letter of an issued or void certificate the caller sees. 409 `certificate_not_issued` for a draft. */
  async print(actor: Actor, id: string): Promise<CertificatePrint> {
    const row = await this.certificates.visible(actor, id);
    if (row.status === 'draft' || !row.cert_no || !row.body || !row.signer_name || !row.issued_at) throw notIssued();
    const lang = row.lang as CertificateLang;
    const [header, society] = await Promise.all([
      this.settings.receiptHeader(actor.societyId),
      this.prisma.societies.findUniqueOrThrow({ where: { id: actor.societyId }, select: { name_bn: true, name_en: true } }),
    ]);
    return {
      header,
      society: lang === 'en' ? (society.name_en ?? society.name_bn) : society.name_bn,
      certNo: row.cert_no,
      type: row.type as CertificateType,
      lang,
      status: row.status as 'issued' | 'void',
      issuedOn: isoDate(todayDate(row.issued_at)),
      addressee: row.addressee,
      purpose: row.purpose,
      body: row.body,
      signerName: row.signer_name,
      signerTitle: row.signer_title,
    };
  }

  async templates(actor: Actor): Promise<CertificateTemplatesView> {
    const saved = await this.savedTemplates(actor.societyId);
    const templates = certificateTemplatesOf(saved);
    return {
      templates,
      defaults: DEFAULT_CERTIFICATE_TEMPLATES,
      customised: CERTIFICATE_TYPES.filter(
        (type) => templates[type].bn !== DEFAULT_CERTIFICATE_TEMPLATES[type].bn || templates[type].en !== DEFAULT_CERTIFICATE_TEMPLATES[type].en,
      ),
      placeholders: [...CERTIFICATE_PLACEHOLDERS],
      can: { edit: actor.access.can('edit', 'settings') },
    };
  }

  /** `settings.edit`: the types given replace their saved text; issued certificates keep theirs. */
  async setTemplates(actor: Actor, input: CertificateTemplatesInput): Promise<CertificateTemplatesView> {
    await this.prisma.$transaction(async (tx) => {
      const before = certificateTemplatesOf(await this.savedTemplates(actor.societyId, tx));
      const value = { ...before, ...input };
      await tx.society_settings.upsert({
        where: { society_id_key: { society_id: actor.societyId, key: CERTIFICATE_TEMPLATES_KEY } },
        update: { value, updated_by: actor.userId, updated_at: new Date() },
        create: { society_id: actor.societyId, key: CERTIFICATE_TEMPLATES_KEY, value, updated_by: actor.userId },
      });
      const changed = Object.keys(input) as CertificateType[];
      await this.audit.record(
        {
          ...auditOf(actor, 'setting', 'update', null),
          before: { [CERTIFICATE_TEMPLATES_KEY]: Object.fromEntries(changed.map((type) => [type, before[type]])) },
          after: { [CERTIFICATE_TEMPLATES_KEY]: input },
        },
        tx,
      );
    });
    return this.templates(actor);
  }

  private async savedTemplates(societyId: string, client: Pick<PrismaService, 'society_settings'> = this.prisma): Promise<unknown> {
    const row = await client.society_settings.findUnique({ where: { society_id_key: { society_id: societyId, key: CERTIFICATE_TEMPLATES_KEY } }, select: { value: true } });
    return row?.value;
  }
}
