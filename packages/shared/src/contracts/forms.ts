import { z } from 'zod';
import { bdPhone, optionalEmail, optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { IMAGE_UPLOAD } from './media.js';
import { isoDay, nidSchema, optionalMoney, optionalPhone, partySchema, placeSchema, sharePercentSchema, type OccupantRelation } from './members.js';

/** `form_submissions.form_key`, checked by the database. Labels live in i18n (`Forms.kinds.*`). */
export const FORM_KEYS = ['membership', 'renter_registration'] as const;
export type FormKey = (typeof FORM_KEYS)[number];

/** Forms shown on the public page as "coming soon" (no submissions yet). Labels in i18n (`Forms.kinds.*`). */
export const UPCOMING_FORMS = ['vehicle_sticker', 'facility_booking', 'noc', 'complaint'] as const;
export type UpcomingForm = (typeof UPCOMING_FORMS)[number];

/** `form_submissions.status`. A submission is open until approved or rejected. */
export const FORM_STATUSES = ['new', 'in_review', 'approved', 'rejected'] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];
export const OPEN_FORM_STATUSES = ['new', 'in_review'] as const satisfies readonly FormStatus[];

/** Relations a renter lists for their household (they themselves are the head). */
export const HOUSEHOLD_RELATIONS = [
  'spouse',
  'child',
  'parent',
  'sibling',
  'relative',
  'co_renter',
  'domestic_help',
  'driver',
  'other',
] as const satisfies readonly Exclude<OccupantRelation, 'head'>[];
const householdRelations = HOUSEHOLD_RELATIONS;

/** Renter types the public form offers (offices and shops register at the office). */
export const PUBLIC_RENTER_TYPES = ['family', 'bachelor'] as const;

/** Limits for a document attached to a form (deed, NID copy). Photos are re-encoded; PDFs are checked and kept. */
export const DOCUMENT_UPLOAD = {
  maxBytes: 5 * 1024 * 1024,
  types: [...IMAGE_UPLOAD.types, 'application/pdf'],
} as const;
export const DOCUMENT_ACCEPT = DOCUMENT_UPLOAD.types.join(',');

/** Hidden field on the public forms. People leave it empty; a bot that fills it gets a receipt but nothing is saved. */
export const FORM_HONEYPOT = 'website';

/** Most household members one renter form lists. */
export const MAX_HOUSEHOLD = 15;

// ---------------------------------------------------------------------------
// Public forms (what an applicant types)
// ---------------------------------------------------------------------------

/** The person filling in a form. The phone is required: the office calls back on it. */
const applicantSchema = z.object({
  fullName: text(200),
  fullNameEn: optionalText(200),
  phone: bdPhone,
  email: optionalEmail,
  nid: nidSchema,
});

/** The NID when the form must have one. */
const requiredNid = nidSchema.pipe(z.string({ error: 'required' }));

/** Membership application: an owner of a plot, building or flat asks to become a member. */
export const membershipFormSchema = z.object({
  applicant: applicantSchema.extend({ nid: requiredNid }),
  /** The place they own: a plot, building or flat. */
  locationId: z.uuid(),
  livesHere: z.boolean(),
});
export type MembershipFormInput = z.input<typeof membershipFormSchema>;
export type MembershipForm = z.output<typeof membershipFormSchema>;

/** Renter registration: a household or bachelor mess renting a flat. */
export const renterFormSchema = z.object({
  renter: applicantSchema,
  occupation: optionalText(100),
  permanentAddress: optionalText(300),
  renterType: z.enum(PUBLIC_RENTER_TYPES),
  unitId: z.uuid(),
  moveInDate: isoDay,
  owner: z.object({ name: text(200), phone: optionalPhone }),
  household: z
    .array(z.object({ fullName: text(200), relation: z.enum(householdRelations) }))
    .max(MAX_HOUSEHOLD)
    .default([]),
});
export type RenterFormInput = z.input<typeof renterFormSchema>;
export type RenterForm = z.output<typeof renterFormSchema>;

/** Renter registration when the society requires an NID of renters (the `requireIdNumbers` setting). */
export const renterFormNidSchema = renterFormSchema.extend({ renter: applicantSchema.extend({ nid: requiredNid }) });

/** The schema each form's `data` field is checked against. */
export const formSchemas = {
  membership: membershipFormSchema,
  renter_registration: renterFormSchema,
} as const satisfies Record<FormKey, z.ZodType>;

/** Forms that require an attached document. */
export const FORM_DOCUMENT_REQUIRED: Record<FormKey, boolean> = { membership: true, renter_registration: false };

/** `POST /public/forms/:formKey` answer: the reference the applicant quotes to the office. */
export const formReceiptSchema = z.object({
  reference: z.string(),
  formKey: z.enum(FORM_KEYS),
  submittedAt: z.iso.datetime({ offset: true }),
});
export type FormReceipt = z.infer<typeof formReceiptSchema>;

/** `GET /public/locations?parentId=`: one step of the address dropdowns. Names only, nothing about who lives there. */
export const publicPlaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  levelBn: z.string(),
  levelEn: z.string().nullable(),
  isUnit: z.boolean(),
  hasChildren: z.boolean(),
});
export type PublicPlace = z.infer<typeof publicPlaceSchema>;
export const publicPlaceListSchema = z.object({ items: z.array(publicPlaceSchema) });
export const publicPlaceQuery = z.object({ parentId: z.uuid().optional() });

// ---------------------------------------------------------------------------
// Office review
// ---------------------------------------------------------------------------

/** One row of the review queue. */
export const formRowSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  formKey: z.enum(FORM_KEYS),
  status: z.enum(FORM_STATUSES),
  name: z.string(),
  phone: z.string().nullable(),
  place: placeSchema.nullable(),
  submittedAt: z.iso.datetime({ offset: true }),
  files: z.number().int().min(0),
});
export type FormRow = z.infer<typeof formRowSchema>;

/** `GET /forms` query. `q` matches the reference, the name (fuzzy) or the phone (either digit form). */
export const formListQuery = pagination.extend({
  status: z.enum(FORM_STATUSES).optional(),
  formKey: z.enum(FORM_KEYS).optional(),
  areaId: z.uuid().optional(),
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
});
export type FormListQuery = z.infer<typeof formListQuery>;

/** `GET /forms`: the queue and the count per status, within the caller's area (other filters ignored). */
export const formListSchema = z.object({
  items: z.array(formRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  counts: z.object({
    new: z.number().int().min(0),
    in_review: z.number().int().min(0),
    approved: z.number().int().min(0),
    rejected: z.number().int().min(0),
  }),
});
export type FormList = z.infer<typeof formListSchema>;

const storedApplicant = z.object({
  fullName: z.string(),
  fullNameEn: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  /** Null when none was given, or when the caller may not edit the application. */
  nid: z.string().nullable(),
});

/** A membership application as stored (the office's view). */
export const membershipDataSchema = z.object({
  applicant: storedApplicant,
  locationId: z.uuid(),
  livesHere: z.boolean(),
});

/** A renter registration as stored (the office's view). */
export const renterDataSchema = z.object({
  renter: storedApplicant,
  occupation: z.string().nullable(),
  permanentAddress: z.string().nullable(),
  renterType: z.enum(PUBLIC_RENTER_TYPES),
  unitId: z.uuid(),
  moveInDate: isoDay,
  owner: z.object({ name: z.string(), phone: z.string().nullable() }),
  household: z.array(z.object({ fullName: z.string(), relation: z.enum(householdRelations) })),
});

/** A file attached to a submission; fetched from `GET /forms/:id/files/:fileId` (office only). */
export const formFileSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  docType: z.string(),
  isImage: z.boolean(),
});
export type FormFile = z.infer<typeof formFileSchema>;

/** Someone already on file with the applicant's phone or NID. `open`: the caller may open their page. */
export const formMatchSchema = z.object({
  personId: z.uuid(),
  name: z.string(),
  by: z.array(z.enum(['phone', 'nid'])),
  open: z.boolean(),
});
export type FormMatch = z.infer<typeof formMatchSchema>;

/** `GET /forms/:id`. */
export const formDetailSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  formKey: z.enum(FORM_KEYS),
  status: z.enum(FORM_STATUSES),
  submittedAt: z.iso.datetime({ offset: true }),
  reviewedAt: z.iso.datetime({ offset: true }).nullable(),
  reviewNote: z.string().nullable(),
  reviewerName: z.string().nullable(),
  place: placeSchema.nullable(),
  /** One of these is set, matching `formKey`. */
  membership: membershipDataSchema.nullable(),
  renter: renterDataSchema.nullable(),
  /** An NID was given but is hidden from this caller. */
  nidHidden: z.boolean(),
  files: z.array(formFileSchema),
  matches: z.array(formMatchSchema),
  /** The person the approval created or reused. */
  person: partySchema.nullable(),
  memberNo: z.number().int().nullable(),
  membershipCode: z.string().nullable(),
  can: z.object({
    review: z.boolean(),
    /** `forms.approve` here, plus what approving creates (a member or a tenancy). */
    approve: z.boolean(),
    /** `forms.approve` here: rejecting needs nothing else. */
    reject: z.boolean(),
    /** Approving a membership may also record the applicant as an owner. */
    addOwnership: z.boolean(),
  }),
});
export type FormDetail = z.infer<typeof formDetailSchema>;

/** `POST /forms/:id/review`: the office has started on it. */
export const formReviewSchema = z.object({ note: optionalText(500) });
export type FormReviewInput = z.infer<typeof formReviewSchema>;

/**
 * `POST /forms/:id/approve`.
 * - Membership: finds or adds the person and makes them a member; `addOwnership` also records
 *   them as an owner of the place with `sharePercent` from `startDate` (default today).
 * - Renter registration: finds or adds the renter and opens a pending tenancy of the flat from
 *   `startDate` (default the move-in date) with the household.
 */
export const formApproveSchema = z.object({
  note: optionalText(500),
  addOwnership: z.boolean().default(false),
  sharePercent: sharePercentSchema.default('100'),
  startDate: isoDay.optional(),
  monthlyRent: optionalMoney,
});
export type FormApproveInput = z.input<typeof formApproveSchema>;
export type FormApprove = z.output<typeof formApproveSchema>;

/** `POST /forms/:id/reject`: the reason is required (the office tells the applicant). */
export const formRejectSchema = z.object({ note: text(500) });
export type FormRejectInput = z.infer<typeof formRejectSchema>;
