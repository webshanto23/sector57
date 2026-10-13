import { z } from 'zod';
import { optionalMoneySchema } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { isoDay, placeSchema } from './members.js';
import { addDays } from './reports.js';

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

/** `facilities.kind`; labels in i18n (`Facilities.kind.*`). */
export const FACILITY_KINDS = ['hall', 'mosque', 'playground', 'generator', 'water_pump', 'office', 'other'] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];
export const toFacilityKind = (value: string): FacilityKind =>
  (FACILITY_KINDS as readonly string[]).includes(value) ? (value as FacilityKind) : 'other';

/** Which facilities a list shows: those in use (the default) or the archived ones. */
export const FACILITY_STATES = ['current', 'archived'] as const;
export type FacilityState = (typeof FACILITY_STATES)[number];

const name = { bn: text(100), en: optionalText(100) };

/**
 * `POST /facilities`. `fundId` (its own fund) only while separate facility funds are on
 * (409 `separate_funds_off`), never the default fund (409 `fund_default`) or a closed one.
 * Names are unique among facilities in use (409 `facility_name_taken`).
 */
export const facilityCreateSchema = z.object({
  locationId: z.uuid(),
  nameBn: name.bn,
  nameEn: name.en,
  kind: z.enum(FACILITY_KINDS),
  bookable: z.boolean().default(false),
  fundId: z.uuid().nullable().default(null),
  note: optionalText(500),
});
export type FacilityCreateInput = z.infer<typeof facilityCreateSchema>;

/** `PATCH /facilities/:id` (not while archived). Moving it moves the assets kept there. */
export const facilityUpdateSchema = z.object({
  locationId: z.uuid().optional(),
  nameBn: name.bn.optional(),
  nameEn: name.en.optional(),
  kind: z.enum(FACILITY_KINDS).optional(),
  bookable: z.boolean().optional(),
  fundId: z.uuid().nullable().optional(),
  note: optionalText(500).optional(),
});
export type FacilityUpdateInput = z.infer<typeof facilityUpdateSchema>;

const search = z.string().transform(cleanText).pipe(z.string().max(100)).optional();

/** `GET /facilities`: in the caller's `facilities.view` area. */
export const facilityListQuery = pagination.extend({
  q: search,
  kind: z.enum(FACILITY_KINDS).optional(),
  state: z.enum(FACILITY_STATES).default('current'),
});
export type FacilityListQuery = z.infer<typeof facilityListQuery>;

const bilingual = z.object({ bn: z.string(), en: z.string().nullable() });

export const facilityRowSchema = z.object({
  id: z.uuid(),
  name: bilingual,
  kind: z.enum(FACILITY_KINDS),
  place: placeSchema,
  bookable: z.boolean(),
  fund: z.object({ id: z.uuid(), name: bilingual }).nullable(),
  /** Assets kept there that are in use or under repair. */
  assets: z.number().int().min(0),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type FacilityRow = z.infer<typeof facilityRowSchema>;

export const facilityListSchema = z.object({
  items: z.array(facilityRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  can: z.object({ create: z.boolean() }),
});
export type FacilityList = z.infer<typeof facilityListSchema>;

/** `GET /facilities/:id`. */
export const facilityDetailSchema = facilityRowSchema.extend({
  note: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  can: z.object({
    edit: z.boolean(),
    /** Archive (only with nothing in use or under repair kept there) or bring back. */
    archive: z.boolean(),
    /** Add an asset here. */
    addAsset: z.boolean(),
  }),
});
export type FacilityDetail = z.infer<typeof facilityDetailSchema>;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** `assets.status`; labels in i18n (`Assets.status.*`). Retired and lost carry a day and a reason. */
export const ASSET_STATUSES = ['in_use', 'repair', 'retired', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const toAssetStatus = (value: string): AssetStatus =>
  (ASSET_STATUSES as readonly string[]).includes(value) ? (value as AssetStatus) : 'in_use';
/** Statuses an asset is out of service for good in (until an approver puts it back). */
export const isAssetGone = (status: AssetStatus): boolean => status === 'retired' || status === 'lost';

/** What a list shows: in use or under repair (the default), one status, or everything. */
export const ASSET_STATES = ['active', ...ASSET_STATUSES, 'all'] as const;
export type AssetState = (typeof ASSET_STATES)[number];

/**
 * The status changes an asset may make, and the permission each needs: between in use and
 * repair with `facilities.edit`; retiring, losing, or putting a retired or lost one back with
 * `facilities.approve`.
 */
export function assetStatusMoves(from: AssetStatus): { to: AssetStatus; needs: 'edit' | 'approve' }[] {
  if (isAssetGone(from)) return [{ to: 'in_use', needs: 'approve' }];
  const other: AssetStatus = from === 'in_use' ? 'repair' : 'in_use';
  return [
    { to: other, needs: 'edit' },
    { to: 'retired', needs: 'approve' },
    { to: 'lost', needs: 'approve' },
  ];
}

/** Where an asset is kept: at a facility, or straight on a place in the tree (exactly one). */
export const assetPlaceSchema = z
  .object({ facilityId: z.uuid().nullable().default(null), locationId: z.uuid().nullable().default(null) })
  .refine((place) => (place.facilityId === null) !== (place.locationId === null), { message: 'place_required', path: ['locationId'] });
export type AssetPlaceInput = z.infer<typeof assetPlaceSchema>;

const nullableDay = isoDay.nullable().default(null);

const assetFields = {
  nameBn: name.bn,
  nameEn: name.en,
  /** Typed freely ("পাম্প", "চেয়ার"); the ones in use are suggested. */
  category: text(60),
  /** A current staff member who looks after it (`GET /assets/custodians`). */
  custodianStaffId: z.uuid().nullable().default(null),
  purchasedOn: nullableDay,
  purchaseCost: optionalMoneySchema,
  vendorId: z.uuid().nullable().default(null),
  /** The voucher number of the paid expense that bought it (`EXP-26-0001`); blank for none. */
  expenseVoucherNo: optionalText(30),
  warrantyUntil: nullableDay,
  note: optionalText(500),
};

const warrantyAfterPurchase = (input: { purchasedOn?: string | null; warrantyUntil?: string | null }) =>
  !input.purchasedOn || !input.warrantyUntil || input.warrantyUntil >= input.purchasedOn;

/** `POST /assets`. The number (`AST-0001`) is drawn when it is saved. */
export const assetCreateSchema = z
  .object({ ...assetFields, place: assetPlaceSchema })
  .refine(warrantyAfterPurchase, { message: 'warranty_before_purchase', path: ['warrantyUntil'] });
export type AssetCreateInput = z.infer<typeof assetCreateSchema>;

/**
 * `PATCH /assets/:id` (not while retired or lost: 409 `asset_gone`). A new `place` needs
 * `facilities.edit` there as well.
 */
export const assetUpdateSchema = z
  .object({
    nameBn: name.bn.optional(),
    nameEn: name.en.optional(),
    category: text(60).optional(),
    place: assetPlaceSchema.optional(),
    custodianStaffId: z.uuid().nullable().optional(),
    purchasedOn: isoDay.nullable().optional(),
    purchaseCost: optionalMoneySchema.optional(),
    vendorId: z.uuid().nullable().optional(),
    expenseVoucherNo: optionalText(30).optional(),
    warrantyUntil: isoDay.nullable().optional(),
    note: optionalText(500).optional(),
  })
  .refine(warrantyAfterPurchase, { message: 'warranty_before_purchase', path: ['warrantyUntil'] });
export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>;

/**
 * `POST /assets/:id/status`. Retired and lost need the day (not in the future) and why; the
 * others take an optional note. See `assetStatusMoves` for who may make each change.
 */
export const assetStatusSchema = z
  .object({
    status: z.enum(ASSET_STATUSES),
    on: isoDay.nullable().default(null),
    reason: optionalText(300),
  })
  .refine((input) => !isAssetGone(input.status) || (input.on !== null && input.reason !== null), {
    message: 'reason_required',
    path: ['reason'],
  });
export type AssetStatusInput = z.infer<typeof assetStatusSchema>;

/** `GET /assets`: in the caller's `facilities.view` area. */
export const assetListQuery = pagination.extend({
  /** Name, number (`AST-0012` or just `12`, either digit form) or category. */
  q: search,
  state: z.enum(ASSET_STATES).default('active'),
  category: z.string().transform(cleanText).pipe(z.string().max(60)).optional(),
  facilityId: z.uuid().optional(),
  /** Assets kept at or under this place. */
  areaId: z.uuid().optional(),
});
export type AssetListQuery = z.infer<typeof assetListQuery>;

/** The CSV takes the list's filters (no paging). */
export const assetCsvQuery = assetListQuery.omit({ page: true, pageSize: true });
export type AssetCsvQuery = z.infer<typeof assetCsvQuery>;

const staffRef = z.object({ id: z.uuid(), staffNo: z.number().int(), name: z.string(), nameEn: z.string().nullable() });

export const assetRowSchema = z.object({
  id: z.uuid(),
  assetNo: z.string(),
  name: bilingual,
  category: z.string(),
  facility: z.object({ id: z.uuid(), name: bilingual }).nullable(),
  place: placeSchema,
  custodian: staffRef.nullable(),
  status: z.enum(ASSET_STATUSES),
  /** The thumbnail, when there is a photo. */
  thumbUrl: z.string().nullable(),
  /** The soonest upkeep due among its open plans. */
  nextDueOn: isoDay.nullable(),
});
export type AssetRow = z.infer<typeof assetRowSchema>;

export const assetListSchema = z.object({
  items: z.array(assetRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** In the caller's area, filters ignored. `due`: upkeep due within `MAINTENANCE_SOON_DAYS` (or overdue). */
  counts: z.object({ inUse: z.number().int().min(0), repair: z.number().int().min(0), due: z.number().int().min(0) }),
  /** Categories in use in the caller's area, for the filter and the form. */
  categories: z.array(z.string()),
  can: z.object({ create: z.boolean(), export: z.boolean() }),
});
export type AssetList = z.infer<typeof assetListSchema>;

const userRef = z.object({ id: z.uuid(), name: z.string() });

export const maintenancePlanSchema = z.object({
  id: z.uuid(),
  task: bilingual,
  everyMonths: z.number().int().min(1),
  nextDueOn: isoDay,
  lastDoneOn: isoDay.nullable(),
});
export type MaintenancePlan = z.infer<typeof maintenancePlanSchema>;

/** `asset_events.kind`; labels in i18n (`Assets.event.*`). */
export const ASSET_EVENT_KINDS = ['created', 'updated', 'moved', 'custodian', 'status', 'maintenance', 'photo', 'work_order'] as const;
export type AssetEventKind = (typeof ASSET_EVENT_KINDS)[number];

/** What an event recorded, as it was then (names, not ids, so the history reads right later). */
export const assetEventDetailSchema = z.object({
  status: z.enum(ASSET_STATUSES).optional(),
  /** Where it was moved to, as an address line. */
  place: z.string().optional(),
  /** The new custodian's name; null when cleared. */
  custodian: z.string().nullable().optional(),
  /** The upkeep task done, in Bangla, and on which day. */
  task: z.string().optional(),
  doneOn: isoDay.optional(),
  /** Retired or lost on this day. */
  on: isoDay.optional(),
  /** The fields an edit changed. */
  fields: z.array(z.string()).optional(),
  /** For `work_order`: the number of the work order raised on it. */
  workOrderNo: z.string().optional(),
});
export type AssetEventDetail = z.infer<typeof assetEventDetailSchema>;

export const assetEventSchema = z.object({
  id: z.uuid(),
  kind: z.enum(ASSET_EVENT_KINDS),
  detail: assetEventDetailSchema,
  note: z.string().nullable(),
  by: userRef.nullable(),
  at: z.iso.datetime({ offset: true }),
});
export type AssetEvent = z.infer<typeof assetEventSchema>;

/** `GET /assets/:id`. */
export const assetDetailSchema = assetRowSchema.extend({
  photoUrl: z.string().nullable(),
  purchasedOn: isoDay.nullable(),
  purchaseCost: z.string().nullable(),
  vendor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** The expense that bought it; `open` when the caller may open it in Expenses. */
  expense: z.object({ id: z.uuid(), voucherNo: z.string().nullable(), amount: z.string(), open: z.boolean() }).nullable(),
  warrantyUntil: isoDay.nullable(),
  retiredOn: isoDay.nullable(),
  retiredReason: z.string().nullable(),
  note: z.string().nullable(),
  plans: z.array(maintenancePlanSchema),
  /** Newest first. */
  history: z.array(assetEventSchema),
  createdAt: z.iso.datetime({ offset: true }),
  can: z.object({
    /** Change details, place, photo and upkeep plans (not while retired or lost). */
    edit: z.boolean(),
    /** The status changes the caller may make now. */
    statuses: z.array(z.enum(ASSET_STATUSES)),
  }),
});
export type AssetDetail = z.infer<typeof assetDetailSchema>;

/** `GET /assets/options`: what the asset form offers, within the caller's area. */
export const assetOptionsSchema = z.object({
  facilities: z.array(z.object({ id: z.uuid(), name: bilingual, place: z.string() })),
  categories: z.array(z.string()),
  vendors: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type AssetOptions = z.infer<typeof assetOptionsSchema>;

/** `GET /facilities/funds`: funds a facility may take (empty while separate funds are off). */
export const facilityFundsSchema = z.object({
  separateFunds: z.boolean(),
  funds: z.array(z.object({ id: z.uuid(), name: bilingual })),
});
export type FacilityFunds = z.infer<typeof facilityFundsSchema>;

/**
 * `GET /assets/custodians?q=`: current staff who may look after assets in the caller's area,
 * those posted inside it or above it (a sector guard keeps a block's pump). Names and
 * designations only.
 */
export const custodianQuery = z.object({ q: search });
export type CustodianQuery = z.infer<typeof custodianQuery>;
export const custodianListSchema = z.object({
  items: z.array(staffRef.extend({ designation: bilingual })),
});
export type CustodianList = z.infer<typeof custodianListSchema>;

// ---------------------------------------------------------------------------
// Upkeep
// ---------------------------------------------------------------------------

/** Most upkeep plans one asset keeps open. */
export const MAX_ASSET_PLANS = 20;
/** "Due soon" on the lists: within this many days, or overdue. */
export const MAINTENANCE_SOON_DAYS = 30;

const task = { bn: text(150), en: optionalText(150) };

/** `POST /assets/:id/plans`: a task every few months, first due on `nextDueOn`. */
export const maintenancePlanCreateSchema = z.object({
  taskBn: task.bn,
  taskEn: task.en,
  everyMonths: z.number().int().min(1).max(120),
  nextDueOn: isoDay,
});
export type MaintenancePlanCreateInput = z.infer<typeof maintenancePlanCreateSchema>;

/** `PATCH /assets/plans/:id`. */
export const maintenancePlanUpdateSchema = z.object({
  taskBn: task.bn.optional(),
  taskEn: task.en.optional(),
  everyMonths: z.number().int().min(1).max(120).optional(),
  nextDueOn: isoDay.optional(),
});
export type MaintenancePlanUpdateInput = z.infer<typeof maintenancePlanUpdateSchema>;

/**
 * `POST /assets/plans/:id/done`: done on a day (not in the future, not before the last time);
 * the next due day becomes `everyMonths` after it.
 */
export const maintenanceDoneSchema = z.object({ doneOn: isoDay, note: optionalText(300) });
export type MaintenanceDoneInput = z.infer<typeof maintenanceDoneSchema>;

/** `GET /assets/maintenance-due?within=`: open plans due within that many days (and overdue ones). */
export const maintenanceDueQuery = z.object({
  within: z.coerce.number().int().min(0).max(366).default(MAINTENANCE_SOON_DAYS),
  areaId: z.uuid().optional(),
});
export type MaintenanceDueQuery = z.infer<typeof maintenanceDueQuery>;

export const maintenanceDueSchema = z.object({
  today: isoDay,
  items: z.array(
    z.object({
      plan: maintenancePlanSchema,
      asset: z.object({
        id: z.uuid(),
        assetNo: z.string(),
        name: bilingual,
        status: z.enum(ASSET_STATUSES),
        facility: bilingual.nullable(),
        place: placeSchema,
        custodian: staffRef.nullable(),
      }),
      /** May the caller mark it done? */
      canMark: z.boolean(),
    }),
  ),
  /** More were due than the list carries. */
  truncated: z.boolean(),
});
export type MaintenanceDue = z.infer<typeof maintenanceDueSchema>;

/**
 * `day` moved by whole months, keeping the day of the month where it exists and taking the
 * month's last day otherwise (`2026-01-31` + 1 = `2026-02-28`).
 */
export function monthsAfter(day: string, months: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const last = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`;
}

/** The last day the "due soon" lists reach, `within` days after `today`. */
export const dueBy = (today: string, within: number = MAINTENANCE_SOON_DAYS): string => addDays(today, within);

/** Overdue (due before today), due (within the window) or fine. */
export function upkeepState(nextDueOn: string, today: string, within: number = MAINTENANCE_SOON_DAYS): 'overdue' | 'due' | 'ok' {
  if (nextDueOn < today) return 'overdue';
  return nextDueOn <= dueBy(today, within) ? 'due' : 'ok';
}

/** The digits of an asset number typed as `AST-0012`, `ast12` or `12`; null when it isn't one. */
export function assetNumberOf(term: string): number | null {
  const match = /^(?:ast[\s-]*)?0*(\d{1,9})$/i.exec(term.trim());
  return match ? Number(match[1]) : null;
}
