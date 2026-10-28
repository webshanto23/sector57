import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  asciiDigits,
  FORM_KEYS,
  FORM_STATUSES,
  membershipDataSchema,
  OPEN_FORM_STATUSES,
  renterDataSchema,
  type FormApprove,
  type FormDetail,
  type FormKey,
  type FormList,
  type FormListQuery,
  type FormMatch,
  type FormRejectInput,
  type FormReviewInput,
  type FormRow,
  type FormStatus,
  type PermissionAction,
  type PermissionModule,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, TreeService } from '../property/tree.service.js';
import { MemberRowsService, personPartySelect, placeSelect } from '../members/member-rows.service.js';
import { MembershipsService } from '../members/memberships.service.js';
import { OwnershipsService } from '../members/ownerships.service.js';
import { auditOf, canOnParty, PartiesService } from '../members/parties.service.js';
import { TenanciesService } from '../members/tenancies.service.js';
import { documentContentType } from '../storage/document.js';
import { PrivateFilesService } from '../storage/private-files.service.js';

type Tx = Prisma.TransactionClient;

const notFound = () => new NotFoundException({ code: 'form_not_found', message: 'Application not found' });
const fileNotFound = () => new NotFoundException({ code: 'file_not_found', message: 'File not found' });
const formClosed = () => new ConflictException({ code: 'form_closed', message: 'This application has already been decided' });
const placeUnavailable = () =>
  new ConflictException({ code: 'location_inactive', message: 'The place of this application is inactive or gone' });
const ownershipNotAsked = () =>
  new BadRequestException({ code: 'validation_failed', message: 'An owner can only be recorded for a membership application' });

const FORM_FILE = 'form_submission';
const OPEN = [...OPEN_FORM_STATUSES];

const rowSelect = {
  id: true,
  reference: true,
  form_key: true,
  status: true,
  phone: true,
  data: true,
  submitted_at: true,
  reviewed_at: true,
  review_note: true,
  person_id: true,
  locations: { select: { ...placeSelect, is_active: true } },
  users: { select: { phone: true, persons: { select: { full_name: true } } } },
} satisfies Prisma.form_submissionsSelect;
type Row = Prisma.form_submissionsGetPayload<{ select: typeof rowSelect }>;

const toFormKey = (value: string): FormKey => ((FORM_KEYS as readonly string[]).includes(value) ? (value as FormKey) : 'membership');
const toFormStatus = (value: string): FormStatus =>
  (FORM_STATUSES as readonly string[]).includes(value) ? (value as FormStatus) : 'new';

/** The applicant's name and NID from a stored form, whichever form it is. */
function applicantOf(formKey: FormKey, data: Prisma.JsonValue): { name: string; nid: string | null } {
  const applicant = (data as { applicant?: { fullName?: unknown; nid?: unknown }; renter?: { fullName?: unknown; nid?: unknown } } | null)?.[
    formKey === 'membership' ? 'applicant' : 'renter'
  ];
  return {
    name: typeof applicant?.fullName === 'string' ? applicant.fullName : '',
    nid: typeof applicant?.nid === 'string' ? applicant.nid : null,
  };
}

/** The permission approving needs at the place, besides `forms.approve`. */
const approveNeeds = (formKey: FormKey): PermissionModule => (formKey === 'membership' ? 'members' : 'tenancies');

/**
 * The office's review of the public forms (`forms` permission, checked at the place the
 * application is about). Approving a membership makes the applicant a numbered member (and
 * optionally an owner); approving a renter registration opens a pending tenancy with the
 * household. Every decision is audited; the NID only reaches callers who may edit.
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly rows: MemberRowsService,
    private readonly parties: PartiesService,
    private readonly tenancies: TenanciesService,
    private readonly ownerships: OwnershipsService,
    private readonly memberships: MembershipsService,
    private readonly files: PrivateFilesService,
  ) {}

  async list(actor: Actor, query: FormListQuery): Promise<FormList> {
    const scope: Prisma.form_submissionsWhereInput = {
      society_id: actor.societyId,
      ...scopeWhere(actor.access, 'view', 'forms', (prefix) => ({ locations: { path: { startsWith: prefix } } })),
    };
    const filters: Prisma.form_submissionsWhereInput[] = [scope];
    if (query.status) filters.push({ status: query.status });
    if (query.formKey) filters.push({ form_key: query.formKey });
    if (query.areaId) {
      const area = await this.tree.visible(actor.access, actor.societyId, 'forms', query.areaId);
      filters.push({ locations: { path: { startsWith: area.path } } });
    }
    if (query.q) {
      const digits = asciiDigits(query.q).replace(/[\s-]/g, '');
      filters.push({
        OR: [
          { reference: { equals: asciiDigits(query.q).toUpperCase() } },
          { data: { path: ['applicant', 'fullName'], string_contains: query.q } },
          { data: { path: ['renter', 'fullName'], string_contains: query.q } },
          ...(/^\d{3,}$/.test(digits) ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    const where: Prisma.form_submissionsWhereInput = { AND: filters };

    const [rows, total, grouped] = await Promise.all([
      this.prisma.form_submissions.findMany({
        where,
        select: rowSelect,
        orderBy: [{ submitted_at: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.form_submissions.count({ where }),
      this.prisma.form_submissions.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    ]);
    const [place, fileCounts] = await Promise.all([
      this.rows.places(actor.societyId, rows.flatMap((row) => (row.locations ? [row.locations] : []))),
      this.prisma.documents.groupBy({
        by: ['entity_id'],
        where: { society_id: actor.societyId, entity_type: FORM_FILE, entity_id: { in: rows.map((row) => row.id) } },
        _count: { _all: true },
      }),
    ]);
    const filesOf = new Map(fileCounts.map((count) => [count.entity_id, count._count._all]));
    const counts = { new: 0, in_review: 0, approved: 0, rejected: 0 };
    for (const group of grouped) counts[toFormStatus(group.status)] += group._count._all;

    const items: FormRow[] = rows.map((row) => {
      const formKey = toFormKey(row.form_key);
      return {
        id: row.id,
        reference: row.reference,
        formKey,
        status: toFormStatus(row.status),
        name: applicantOf(formKey, row.data).name,
        phone: row.phone,
        place: row.locations ? place(row.locations) : null,
        submittedAt: row.submitted_at.toISOString(),
        files: filesOf.get(row.id) ?? 0,
      };
    });
    return { items, total, page: query.page, pageSize: query.pageSize, counts };
  }

  async get(actor: Actor, id: string): Promise<FormDetail> {
    const row = await this.row(actor, id, 'view');
    const formKey = toFormKey(row.form_key);
    const status = toFormStatus(row.status);
    const located = row.locations ? { path: row.locations.path } : null;
    const can = (action: PermissionAction, module: PermissionModule = 'forms') =>
      located ? actor.access.can(action, module, located) : actor.access.paths(action, module) === 'all';
    const mayEdit = can('edit') || can('approve');
    const { nid } = applicantOf(formKey, row.data);
    const open = (OPEN as string[]).includes(status);

    const [place, documents, matches, person, membership] = await Promise.all([
      row.locations ? this.rows.places(actor.societyId, [row.locations]).then((build) => build(row.locations!)) : null,
      this.prisma.documents.findMany({
        where: { society_id: actor.societyId, entity_type: FORM_FILE, entity_id: id },
        select: { id: true, file_name: true, doc_type: true, file_url: true },
        orderBy: { uploaded_at: 'asc' },
      }),
      this.matches(actor, row.phone, nid),
      row.person_id ? this.prisma.persons.findFirst({ where: { id: row.person_id, society_id: actor.societyId }, select: personPartySelect }) : null,
      this.prisma.memberships.findFirst({ where: { submission_id: id, society_id: actor.societyId }, select: { member_no: true } }),
    ]);

    // Stored answers are re-read through the office schemas; the NID is blanked for callers who can't edit.
    const hideNid = (data: Prisma.JsonValue, key: 'applicant' | 'renter') => {
      const value = data as Record<string, Record<string, unknown>>;
      return mayEdit ? value : { ...value, [key]: { ...value[key], nid: null } };
    };
    return {
      id: row.id,
      reference: row.reference,
      formKey,
      status,
      submittedAt: row.submitted_at.toISOString(),
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      reviewNote: row.review_note,
      reviewerName: row.users ? (row.users.persons?.full_name ?? row.users.phone) : null,
      place,
      membership: formKey === 'membership' ? membershipDataSchema.parse(hideNid(row.data, 'applicant')) : null,
      renter: formKey === 'renter_registration' ? renterDataSchema.parse(hideNid(row.data, 'renter')) : null,
      nidHidden: !mayEdit && nid !== null,
      files: documents.map((doc) => ({
        id: doc.id,
        fileName: doc.file_name,
        docType: doc.doc_type,
        isImage: documentContentType(doc.file_url) !== 'application/pdf',
      })),
      matches: mayEdit ? matches : matches.map((match) => ({ ...match, by: match.by.filter((by) => by === 'phone') })).filter((match) => match.by.length > 0),
      person: person ? this.rows.personParty(person) : null,
      memberNo: membership?.member_no ?? null,
      can: {
        review: status === 'new' && can('edit'),
        approve: open && can('approve') && can('create', approveNeeds(formKey)) && (row.locations?.is_active ?? false),
        reject: open && can('approve'),
        addOwnership: formKey === 'membership' && open && can('create', 'ownerships'),
      },
    };
  }

  /** The office has started on it: `new` becomes `in_review`. */
  async review(actor: Actor, id: string, input: FormReviewInput): Promise<FormDetail> {
    const before = await this.row(actor, id, 'edit');
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, ['new'], { status: 'in_review', review_note: input.note ?? before.review_note });
      await this.audit.record({ ...auditOf(actor, 'form_submission', 'review', id), before: { status: before.status }, after: { status: 'in_review' } }, tx);
    });
    return this.get(actor, id);
  }

  async reject(actor: Actor, id: string, input: FormRejectInput): Promise<FormDetail> {
    const before = await this.row(actor, id, 'approve');
    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, OPEN, { status: 'rejected', review_note: input.note, reviewed_by: actor.userId, reviewed_at: new Date() });
      await this.audit.record({ ...auditOf(actor, 'form_submission', 'reject', id), before: { status: before.status }, after: { status: 'rejected' } }, tx);
    });
    return this.get(actor, id);
  }

  /**
   * Approves an open application, all or nothing:
   * - membership: finds or adds the person (by phone, then NID), gives them the next member
   *   number, and with `addOwnership` records them as an owner of the place;
   * - renter registration: opens a pending tenancy of the flat (the renter becomes the head of
   *   the household) and adds the listed household members.
   */
  async approve(actor: Actor, id: string, input: FormApprove): Promise<FormDetail> {
    const row = await this.row(actor, id, 'approve');
    const formKey = toFormKey(row.form_key);
    if (!(OPEN as string[]).includes(row.status)) throw formClosed();
    if (!row.locations) throw placeUnavailable();
    const located = { path: row.locations.path };
    if (!actor.access.can('create', approveNeeds(formKey), located)) throw beyondPermissions();
    if (input.addOwnership && formKey !== 'membership') throw ownershipNotAsked();
    if (input.addOwnership && !actor.access.can('create', 'ownerships', located)) throw beyondPermissions();
    const place = await this.tree.find(actor.societyId, row.locations.id);
    if (!place || !place.isActive) throw placeUnavailable();

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, id, OPEN, { status: 'approved', reviewed_by: actor.userId, reviewed_at: new Date(), review_note: input.note ?? row.review_note });
      const today = todayDate();
      let personId: string;
      const extra: Record<string, unknown> = {};

      if (formKey === 'membership') {
        const form = membershipDataSchema.parse(row.data);
        const person = await this.parties.resolvePerson(tx, actor.societyId, { ...form.applicant, dateOfBirth: null, gender: null });
        personId = person.id;
        const membership = await this.memberships.insert(tx, actor.societyId, {
          personId,
          locationId: place.id,
          joinedOn: today,
          submissionId: id,
        });
        extra['memberNo'] = membership.member_no;
        extra['membershipCode'] = membership.membership_code;
        extra['reusedPerson'] = person.reused;
        if (input.addOwnership) {
          extra['ownershipId'] = await this.ownerships.insert(tx, actor, place, {
            locationId: place.id,
            owner: { kind: 'person', person: { ...form.applicant, dateOfBirth: null, gender: null } },
            sharePercent: input.sharePercent,
            startDate: input.startDate ?? isoDate(today),
          });
        }
      } else {
        const form = renterDataSchema.parse(row.data);
        if (!place.isUnit) throw placeUnavailable();
        const tenancyId = await this.tenancies.insert(tx, actor, place, {
          unitId: place.id,
          renter: { kind: 'person', person: { ...form.renter, dateOfBirth: null, gender: null } },
          renterType: form.renterType,
          status: 'pending',
          startDate: input.startDate ?? form.moveInDate,
          monthlyRent: input.monthlyRent,
          policeFormSubmitted: false,
        });
        const tenancy = await tx.tenancies.findUniqueOrThrow({ where: { id: tenancyId }, select: { primary_person_id: true, start_date: true } });
        personId = tenancy.primary_person_id!;
        // Household members are typed by name only, so each is a new person.
        for (const member of form.household) {
          const created = await tx.persons.create({ data: { society_id: actor.societyId, full_name: member.fullName }, select: { id: true } });
          await tx.occupants.create({
            data: {
              society_id: actor.societyId,
              unit_id: place.id,
              person_id: created.id,
              tenancy_id: tenancyId,
              relation: member.relation,
              start_date: tenancy.start_date,
            },
          });
        }
        extra['tenancyId'] = tenancyId;
        extra['household'] = form.household.length;
      }

      await tx.form_submissions.update({ where: { id }, data: { person_id: personId } });
      await this.audit.record(
        { ...auditOf(actor, 'form_submission', 'approve', id), before: { status: row.status }, after: { status: 'approved', personId, ...extra } },
        tx,
      );
    });
    return this.get(actor, id);
  }

  /** A file of an application, for a caller who may view it. */
  async file(actor: Actor, id: string, fileId: string): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    await this.row(actor, id, 'view');
    const doc = await this.prisma.documents.findFirst({
      where: { id: fileId, society_id: actor.societyId, entity_type: FORM_FILE, entity_id: id },
      select: { file_url: true, file_name: true, doc_type: true },
    });
    if (!doc) throw fileNotFound();
    const data = await this.files.read(actor.societyId, doc.file_url);
    // Who looked at a deed or an NID copy is worth knowing.
    await this.audit.recordQuietly({ ...auditOf(actor, 'form_submission', 'view_file', id), after: { fileId, docType: doc.doc_type } });
    return { data, contentType: documentContentType(doc.file_url), fileName: doc.file_name };
  }

  /** A submission the caller may `view` (else 404) and `action` on (else 403). */
  private async row(actor: Actor, id: string, action: PermissionAction): Promise<Row> {
    const row = await this.prisma.form_submissions.findFirst({ where: { id, society_id: actor.societyId }, select: rowSelect });
    if (!row) throw notFound();
    const allowed = (what: PermissionAction) =>
      row.locations ? actor.access.can(what, 'forms', { path: row.locations.path }) : actor.access.paths(what, 'forms') === 'all';
    if (!allowed('view')) throw notFound();
    if (!allowed(action)) throw beyondPermissions();
    return row;
  }

  /** Moves a submission on only if it is still in one of `from` (someone else may have just decided it). */
  private async claim(tx: Tx, id: string, from: string[], data: Prisma.form_submissionsUncheckedUpdateManyInput): Promise<void> {
    const { count } = await tx.form_submissions.updateMany({ where: { id, status: { in: from } }, data });
    if (count === 0) throw formClosed();
  }

  /** People already on file with the applicant's phone or NID. */
  private async matches(actor: Actor, phone: string | null, nid: string | null): Promise<FormMatch[]> {
    if (!phone && !nid) return [];
    const people = await this.prisma.persons.findMany({
      where: { society_id: actor.societyId, OR: [...(phone ? [{ phone }] : []), ...(nid ? [{ nid }] : [])] },
      select: { id: true, full_name: true, phone: true, nid: true },
      take: 2,
    });
    return Promise.all(
      people.map(async (person) => ({
        personId: person.id,
        name: person.full_name,
        by: [...(phone && person.phone === phone ? ['phone' as const] : []), ...(nid && person.nid === nid ? ['nid' as const] : [])],
        open: canOnParty(actor.access, 'view', await this.parties.currentPaths(actor.societyId, { personId: person.id })),
      })),
    );
  }
}
