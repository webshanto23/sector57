import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  FORM_DOCUMENT_REQUIRED,
  formSchemas,
  OPEN_FORM_STATUSES,
  type FormKey,
  type FormReceipt,
  type MembershipForm,
  type PublicPlace,
  type RenterForm,
} from '@s57/shared';
import { ZodValidationException } from 'nestjs-zod';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TreeService } from '../property/tree.service.js';
import { PrivateFilesService } from '../storage/private-files.service.js';

/** Most submissions one phone number may send in a day, over all forms. */
export const SUBMISSIONS_PER_PHONE_PER_DAY = 3;

/** What a form's attachment is, stored as `documents.doc_type`. */
export const FORM_DOC_TYPE: Record<FormKey, string> = { membership: 'deed', renter_registration: 'nid_copy' };

// Letters and digits that can't be mistaken for each other when read out on the phone.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_PREFIX: Record<FormKey, string> = { membership: 'M', renter_registration: 'R' };

/** `M-7KQ3XP2A`: the form's letter and 8 random characters. */
export const newReference = (formKey: FormKey) =>
  `${REFERENCE_PREFIX[formKey]}-${Array.from({ length: 8 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('')}`;

const invalidPlace = () =>
  new BadRequestException({ code: 'invalid_place', message: 'Choose the place from the list' });
const alreadySubmitted = () =>
  new ConflictException({ code: 'already_submitted', message: 'This application has already been sent and is waiting for the office' });
const tooMany = () =>
  new HttpException({ code: 'too_many_submissions', message: 'Too many applications from this phone today' }, HttpStatus.TOO_MANY_REQUESTS);
const fileRequired = () => new BadRequestException({ code: 'file_required', message: 'Attach the document' });
const badJson = () => new BadRequestException({ code: 'validation_failed', message: 'The request is not valid' });

type ParsedForm = { formKey: 'membership'; form: MembershipForm } | { formKey: 'renter_registration'; form: RenterForm };

/** The applicant's phone and the place a form is about. */
const factsOf = (parsed: ParsedForm) =>
  parsed.formKey === 'membership'
    ? { phone: parsed.form.applicant.phone, locationId: parsed.form.locationId }
    : { phone: parsed.form.renter.phone, locationId: parsed.form.unitId };

/**
 * The public membership and renter forms (no login). Answers are checked against the shared
 * schemas (text NFC-normalised), the place must exist in the society, one phone may send a few
 * a day and never the same open application twice. Attachments go to private storage.
 */
@Injectable()
export class PublicFormsService {
  private readonly logger = new Logger(PublicFormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    private readonly files: PrivateFilesService,
    private readonly audit: AuditService,
  ) {}

  /** The active children of a location (the top of the tree without one): names and levels only. */
  async places(societyId: string, parentId: string | undefined): Promise<PublicPlace[]> {
    if (parentId) {
      const parent = await this.tree.find(societyId, parentId);
      if (!parent || !parent.isActive) return [];
    }
    const nodes = await this.tree.nodes(
      societyId,
      parentId ? Prisma.sql`l.parent_id = ${parentId}::uuid and l.is_active` : Prisma.sql`l.parent_id is null and l.is_active`,
    );
    return nodes.map((node) => ({
      id: node.id,
      name: node.name,
      levelBn: node.levelBn,
      levelEn: node.levelEn,
      isUnit: node.isUnit,
      hasChildren: node.childCount > 0,
    }));
  }

  /** Parses the `data` field of a form post against the form's schema (400 `validation_failed` with issues). */
  parse(formKey: FormKey, data: unknown): ParsedForm {
    let json: unknown;
    try {
      json = typeof data === 'string' ? JSON.parse(data) : undefined;
    } catch {
      throw badJson();
    }
    if (json === undefined || json === null || typeof json !== 'object') throw badJson();
    if (formKey === 'membership') {
      const result = formSchemas.membership.safeParse(json);
      if (!result.success) throw new ZodValidationException(result.error);
      return { formKey, form: result.data };
    }
    const result = formSchemas.renter_registration.safeParse(json);
    if (!result.success) throw new ZodValidationException(result.error);
    return { formKey, form: result.data };
  }

  /**
   * Saves a submission and returns its reference. `honeypot` filled in (a bot): a receipt
   * comes back, nothing is saved.
   */
  async submit(societyId: string, formKey: FormKey, data: unknown, upload: Buffer | undefined, honeypot: unknown, ip: string | null): Promise<FormReceipt> {
    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
      this.logger.warn({ formKey, ip }, 'Form honeypot filled in; nothing saved');
      return { reference: newReference(formKey), formKey, submittedAt: new Date().toISOString() };
    }
    const parsed = this.parse(formKey, data);
    if (FORM_DOCUMENT_REQUIRED[formKey] && !upload?.length) throw fileRequired();
    const { phone, locationId } = factsOf(parsed);

    const place = await this.tree.find(societyId, locationId);
    if (!place || !place.isActive) throw invalidPlace();
    // A renter registers a flat; a member owns a plot, building or flat (not the whole society).
    if (formKey === 'renter_registration' ? !place.isUnit : place.parentId === null) throw invalidPlace();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent, open] = await Promise.all([
      this.prisma.form_submissions.count({ where: { society_id: societyId, phone, submitted_at: { gte: since } } }),
      this.prisma.form_submissions.findFirst({
        where: { society_id: societyId, phone, form_key: formKey, location_id: place.id, status: { in: [...OPEN_FORM_STATUSES] } },
        select: { id: true },
      }),
    ]);
    if (open) throw alreadySubmitted();
    if (recent >= SUBMISSIONS_PER_PHONE_PER_DAY) throw tooMany();

    // The file is checked and written first; it is removed again if the rows can't be saved.
    const stored = upload?.length ? await this.files.saveDocument(societyId, 'forms', upload) : null;
    try {
      const row = await this.insert(societyId, parsed, phone, place.id, stored, ip);
      return { reference: row.reference, formKey, submittedAt: row.submitted_at.toISOString() };
    } catch (error) {
      if (stored) await this.files.removeQuietly(societyId, [stored.key]);
      throw error;
    }
  }

  private async insert(
    societyId: string,
    parsed: ParsedForm,
    phone: string,
    locationId: string,
    stored: { key: string; isImage: boolean } | null,
    ip: string | null,
  ) {
    // A clash of random references is very unlikely; try a few before giving up.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const row = await tx.form_submissions.create({
            data: {
              society_id: societyId,
              form_key: parsed.formKey,
              data: parsed.form as Prisma.InputJsonValue,
              reference: newReference(parsed.formKey),
              phone,
              location_id: locationId,
            },
            select: { id: true, reference: true, submitted_at: true },
          });
          if (stored) {
            const docType = FORM_DOC_TYPE[parsed.formKey];
            await tx.documents.create({
              data: {
                society_id: societyId,
                entity_type: 'form_submission',
                entity_id: row.id,
                doc_type: docType,
                file_url: stored.key,
                file_name: `${docType}.${stored.isImage ? 'webp' : 'pdf'}`,
                visibility: 'office',
              },
            });
          }
          // No personal details in the log: the office reads them on the submission.
          await this.audit.record(
            {
              societyId,
              action: 'submit',
              entityType: 'form_submission',
              entityId: row.id,
              after: { formKey: parsed.formKey, reference: row.reference, locationId, hasFile: stored !== null },
              ip,
            },
            tx,
          );
          return row;
        });
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 3) throw error;
      }
    }
  }
}
