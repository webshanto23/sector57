import { z } from 'zod';
import { isZeroMoney } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { documentHeaderSchema } from './finance.js';
import { isoDay, placeSchema, type Place } from './members.js';
import { vehicleUnitPeopleSchema, type UnitTie } from './vehicles.js';

// ---------------------------------------------------------------------------
// Certificates and NOCs (সনদ ও অনাপত্তিপত্র)
// ---------------------------------------------------------------------------

/** `certificates.type`: fixed keys, labels in i18n (`Certificates.type.*`). */
export const CERTIFICATE_TYPES = [
  'noc_sale',
  'noc_rent',
  'noc_utility',
  'noc_renovation',
  'noc_loan',
  'residence',
  'membership',
  'no_dues',
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

/** `certificates.status`: a draft until issued (numbered, frozen); an issued one may be voided. */
export const CERTIFICATE_STATUSES = ['draft', 'issued', 'void'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

/** The language a certificate is written and printed in. */
export const CERTIFICATE_LANGS = ['bn', 'en'] as const;
export type CertificateLang = (typeof CERTIFICATE_LANGS)[number];

/**
 * How the person must be tied to the unit, now, for each type (409 `certificate_person_not_at_unit`).
 * Selling, letting, renovating or borrowing against a unit is for its owner.
 */
export const CERTIFICATE_TIES = {
  noc_sale: ['owner'],
  noc_rent: ['owner'],
  noc_utility: ['owner', 'renter'],
  noc_renovation: ['owner'],
  noc_loan: ['owner'],
  residence: ['owner', 'renter', 'resident'],
  membership: ['owner', 'renter', 'resident'],
  no_dues: ['owner', 'renter'],
} as const satisfies Record<CertificateType, readonly UnitTie[]>;

/** True when one of the person's ties to the unit is enough for the type. */
export const tiedForCertificate = (type: CertificateType, ties: readonly UnitTie[]): boolean =>
  (CERTIFICATE_TIES[type] as readonly UnitTie[]).some((tie) => ties.includes(tie));

// ---------------------------------------------------------------------------
// Letter templates
// ---------------------------------------------------------------------------

/**
 * What a template may say in braces. The API fills them when it shows a draft and freezes the
 * result at issue: `{name}` the person (in the letter's language when there is one), `{unit}`
 * the unit's address, `{society}` the society's name, `{date}` the issue day, `{certNo}` the
 * number, `{memberNo}` the person's membership ID, `{purpose}` and `{addressee}` as typed.
 */
export const CERTIFICATE_PLACEHOLDERS = ['name', 'unit', 'society', 'date', 'certNo', 'memberNo', 'purpose', 'addressee'] as const;
export type CertificatePlaceholder = (typeof CERTIFICATE_PLACEHOLDERS)[number];
export type CertificateValues = Partial<Record<CertificatePlaceholder, string | null>>;

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/** The placeholders a template names that are not in `CERTIFICATE_PLACEHOLDERS`. */
export const unknownPlaceholders = (template: string): string[] =>
  [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1]!))].filter(
    (key) => !(CERTIFICATE_PLACEHOLDERS as readonly string[]).includes(key),
  );

/** The letter with each known placeholder filled; a missing value prints nothing, unknown braces stay. */
export const renderCertificate = (template: string, values: CertificateValues): string =>
  template.replace(PLACEHOLDER, (whole, key: string) =>
    (CERTIFICATE_PLACEHOLDERS as readonly string[]).includes(key) ? (values[key as CertificatePlaceholder] ?? '') : whole,
  );

/** The `society_settings` key holding the office's own templates (`CertificateTemplates`). */
export const CERTIFICATE_TEMPLATES_KEY = 'certificate_templates';

/** Longest template, in characters. */
export const CERTIFICATE_TEMPLATE_MAX = 3000;

const cleanLetter = (value: string): string => cleanText(value.replace(/\r\n?/g, '\n'));

const templateText = z
  .string()
  .transform(cleanLetter)
  .pipe(z.string().min(1).max(CERTIFICATE_TEMPLATE_MAX))
  .refine((value) => unknownPlaceholders(value).length === 0, 'unknown_placeholder');

const templatePair = z.object({ bn: templateText, en: templateText }).strict();
export type CertificateTemplate = { bn: string; en: string };
export type CertificateTemplates = Record<CertificateType, CertificateTemplate>;

/**
 * `PUT /certificates/templates` (`settings.edit`): the types being changed, each in both
 * languages. A type left out keeps its saved text. Changes apply to drafts and to certificates
 * issued afterwards; issued ones keep the text they were issued with.
 */
export const certificateTemplatesInputSchema = z.partialRecord(z.enum(CERTIFICATE_TYPES), templatePair);
export type CertificateTemplatesInput = z.infer<typeof certificateTemplatesInputSchema>;

/** Until the office saves its own. The society's name comes in through `{society}`, never from here. */
export const DEFAULT_CERTIFICATE_TEMPLATES: CertificateTemplates = {
  noc_sale: {
    bn: 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {name} {unit}-এর মালিক। উক্ত ইউনিট বিক্রয়ের বিষয়ে {society}-এর কোনো আপত্তি নেই।',
    en: 'This is to certify that {name} is the owner of {unit}. {society} has no objection to the sale of this unit.',
  },
  noc_rent: {
    bn: 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {name} {unit}-এর মালিক। উক্ত ইউনিট ভাড়া দেওয়ার বিষয়ে {society}-এর কোনো আপত্তি নেই।',
    en: 'This is to certify that {name} is the owner of {unit}. {society} has no objection to this unit being let.',
  },
  noc_utility: {
    bn: '{unit}-এ {name}-এর নামে গ্যাস, বিদ্যুৎ বা পানির সংযোগ গ্রহণের বিষয়ে {society}-এর কোনো আপত্তি নেই।',
    en: '{society} has no objection to {name} taking a gas, electricity or water connection at {unit}.',
  },
  noc_renovation: {
    bn: 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {name} {unit}-এর মালিক। সমিতির নিয়ম মেনে উক্ত ইউনিটে সংস্কার কাজের বিষয়ে {society}-এর কোনো আপত্তি নেই।',
    en: 'This is to certify that {name} is the owner of {unit}. {society} has no objection to renovation work at this unit, carried out under the society’s rules.',
  },
  noc_loan: {
    bn: 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {name} {unit}-এর মালিক। উক্ত ইউনিটের বিপরীতে ঋণ গ্রহণের বিষয়ে {society}-এর কোনো আপত্তি নেই।',
    en: 'This is to certify that {name} is the owner of {unit}. {society} has no objection to a loan being taken against this unit.',
  },
  residence: {
    bn: 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {name} {society}-এর আওতাধীন {unit}-এ বসবাস করেন।',
    en: 'This is to certify that {name} lives at {unit}, within the area of {society}.',
  },
  membership: {
    bn: 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {name} ({unit}) {society}-এর একজন নিবন্ধিত সদস্য। সদস্যপদ আইডি: {memberNo}।',
    en: 'This is to certify that {name} ({unit}) is a registered member of {society}. Membership ID: {memberNo}.',
  },
  no_dues: {
    bn: 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে, {date} তারিখ পর্যন্ত {unit}-এর কাছে {society}-এর কোনো পাওনা বকেয়া নেই।',
    en: 'This is to certify that, as of {date}, nothing is owed to {society} for {unit}.',
  },
};

/** The saved setting over the defaults; a type missing or broken falls back to its default. */
export function certificateTemplatesOf(value: unknown): CertificateTemplates {
  const saved = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    CERTIFICATE_TYPES.map((type) => {
      const pair = templatePair.safeParse(saved[type]);
      return [type, pair.success ? pair.data : DEFAULT_CERTIFICATE_TEMPLATES[type]];
    }),
  ) as CertificateTemplates;
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

/**
 * What issuing does about unpaid bills on the unit: a no-dues certificate is never issued while
 * anything is owed (409 `certificate_dues_outstanding`); any other type needs `allowDues`, which
 * the certificate records with the amount (409 `certificate_dues_unpaid` with `details.owed` otherwise).
 */
export type DuesDecision = 'clear' | 'allowed' | 'blocked' | 'needs_allow';

export function duesDecision(type: CertificateType, owed: string, allowDues: boolean): DuesDecision {
  if (isZeroMoney(owed)) return 'clear';
  if (type === 'no_dues') return 'blocked';
  return allowDues ? 'allowed' : 'needs_allow';
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * `POST /certificates` (`certificates.create` at the unit): a draft. The person must be tied to
 * the unit as the type needs (`CERTIFICATE_TIES`); a membership certificate also needs an active
 * membership (409 `certificate_not_member`).
 */
export const certificateCreateSchema = z.object({
  type: z.enum(CERTIFICATE_TYPES),
  lang: z.enum(CERTIFICATE_LANGS).default('bn'),
  personId: z.uuid(),
  unitId: z.uuid(),
  addressee: optionalText(300),
  purpose: optionalText(300),
});
export type CertificateCreateInput = z.infer<typeof certificateCreateSchema>;

/** `PATCH /certificates/:id` (drafts only, `certificates.edit`). The type and unit stay; a new person is checked again. */
export const certificateUpdateSchema = z
  .object({
    lang: z.enum(CERTIFICATE_LANGS),
    personId: z.uuid(),
    addressee: optionalText(300),
    purpose: optionalText(300),
  })
  .partial()
  .strict();
export type CertificateUpdateInput = z.infer<typeof certificateUpdateSchema>;

/**
 * `POST /certificates/:id/issue` (`certificates.approve` at the unit): numbers the draft and
 * freezes its text. The signer prints under the signature line (the issuer's name by default).
 */
export const certificateIssueSchema = z.object({
  signerName: text(100),
  signerTitle: optionalText(100),
  allowDues: z.boolean().default(false),
});
export type CertificateIssueInput = z.infer<typeof certificateIssueSchema>;

/** `POST /certificates/:id/void` (`certificates.approve`): issued ones only, once. */
export const certificateVoidSchema = z.object({ reason: text(300) });
export type CertificateVoidInput = z.infer<typeof certificateVoidSchema>;

/** `GET /certificates`: in the caller's `certificates.view` area, newest first. */
export const certificateListQuery = pagination.extend({
  /** Certificate number, or the person's name or phone. */
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  type: z.enum(CERTIFICATE_TYPES).optional(),
  status: z.enum(CERTIFICATE_STATUSES).optional(),
  locationId: z.uuid().optional(),
  unitId: z.uuid().optional(),
  personId: z.uuid().optional(),
});
export type CertificateListQuery = z.infer<typeof certificateListQuery>;

/** `GET /certificates/unit-people`: who owns (at or above), rents or lives in a unit, with their ties. */
export const certificateUnitPeopleQuery = z.object({ unitId: z.uuid() });
export type CertificateUnitPeopleQuery = z.infer<typeof certificateUnitPeopleQuery>;
export const certificateUnitPeopleSchema = vehicleUnitPeopleSchema;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** A unit as a letter names it: the unit first, then the places above it, nearest first ("A-3, বাড়ি ১২, রোড ৪"). */
export const unitText = (place: Pick<Place, 'name' | 'address'>): string => [place.name, ...[...place.address].reverse()].join(', ');

const instant = z.iso.datetime({ offset: true });
const userRef = z.object({ id: z.uuid(), name: z.string() });
const personRef = z.object({ id: z.uuid(), name: z.string(), nameEn: z.string().nullable() });

export const certificateRowSchema = z.object({
  id: z.uuid(),
  certNo: z.string().nullable(),
  type: z.enum(CERTIFICATE_TYPES),
  lang: z.enum(CERTIFICATE_LANGS),
  status: z.enum(CERTIFICATE_STATUSES),
  person: personRef,
  /** The unit it is about. */
  place: placeSchema,
  purpose: z.string().nullable(),
  issuedAt: instant.nullable(),
  createdAt: instant,
});
export type CertificateRow = z.infer<typeof certificateRowSchema>;

export const certificateListSchema = z.object({
  items: z.array(certificateRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** In the caller's area, filters ignored. */
  counts: z.object({ draft: z.number().int().min(0), issued: z.number().int().min(0), void: z.number().int().min(0) }),
  can: z.object({ create: z.boolean() }),
});
export type CertificateList = z.infer<typeof certificateListSchema>;

export const certificateDetailSchema = certificateRowSchema.extend({
  addressee: z.string().nullable(),
  /** A draft's letter as it would issue today; an issued one's text as printed. */
  body: z.string(),
  signerName: z.string().nullable(),
  signerTitle: z.string().nullable(),
  /** What the unit owed when it was issued (more than zero: issued anyway). */
  duesOwedAtIssue: z.string().nullable(),
  issuedBy: userRef.nullable(),
  voidedAt: instant.nullable(),
  voidedBy: userRef.nullable(),
  voidReason: z.string().nullable(),
  createdBy: userRef.nullable(),
  /** What the unit owes now, for a draft, with `billing.view` at the unit. */
  dues: z.object({ owed: z.string(), bills: z.number().int().min(0) }).nullable(),
  can: z.object({ edit: z.boolean(), delete: z.boolean(), issue: z.boolean(), void: z.boolean() }),
});
export type CertificateDetail = z.infer<typeof certificateDetailSchema>;

/** `GET /certificates/:id/print`: an issued or void certificate (409 `certificate_not_issued` for a draft). */
export const certificatePrintSchema = z.object({
  header: documentHeaderSchema,
  /** The society's name in the letter's language. */
  society: z.string(),
  certNo: z.string(),
  type: z.enum(CERTIFICATE_TYPES),
  lang: z.enum(CERTIFICATE_LANGS),
  status: z.enum(['issued', 'void']),
  issuedOn: isoDay,
  addressee: z.string().nullable(),
  purpose: z.string().nullable(),
  body: z.string(),
  signerName: z.string(),
  signerTitle: z.string().nullable(),
});
export type CertificatePrint = z.infer<typeof certificatePrintSchema>;

/** `GET /certificates/templates`: the text each type issues with, and which ones the office changed. */
const templateOut = z.object({ bn: z.string(), en: z.string() });
/** One template per type, every type present (spelled out so the OpenAPI types know each key). */
const templatesOut = z.object(Object.fromEntries(CERTIFICATE_TYPES.map((type) => [type, templateOut])) as Record<CertificateType, typeof templateOut>);

export const certificateTemplatesViewSchema = z.object({
  templates: templatesOut,
  defaults: templatesOut,
  customised: z.array(z.enum(CERTIFICATE_TYPES)),
  placeholders: z.array(z.enum(CERTIFICATE_PLACEHOLDERS)),
  can: z.object({ edit: z.boolean() }),
});
export type CertificateTemplatesView = z.infer<typeof certificateTemplatesViewSchema>;
