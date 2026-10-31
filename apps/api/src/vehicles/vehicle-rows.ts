import { Prisma } from '@s57/db';
import { stickerStateOf, type Place, type StickerRef, type StickerStatus, type VehicleKind, type VehicleRow } from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { placeSelect } from '../members/member-rows.service.js';

/** A vehicle's latest sticker. */
export const latestSticker = {
  select: { id: true, sticker_no: true, valid_until: true, status: true },
  orderBy: [{ issued_at: 'desc' }, { id: 'desc' }],
  take: 1,
} satisfies Prisma.vehicles$stickersArgs;

export const vehicleSelect = {
  id: true,
  reg_no: true,
  kind: true,
  make: true,
  colour: true,
  note: true,
  removed_at: true,
  remove_reason: true,
  created_at: true,
  units: { select: { locations: { select: placeSelect } } },
  persons: { select: { id: true, full_name: true, full_name_en: true } },
  organisations: { select: { id: true, name: true } },
  stickers: latestSticker,
} satisfies Prisma.vehiclesSelect;
export type VehicleSelected = Prisma.vehiclesGetPayload<{ select: typeof vehicleSelect }>;

type StickerSelected = VehicleSelected['stickers'][number];

/** Who a vehicle belongs to: a person or an organisation, the other null. */
export type VehicleHolder = { personId: string | null; organisationId: string | null };

export const holderOf = (row: Pick<VehicleSelected, 'persons' | 'organisations'>): VehicleHolder => ({
  personId: row.persons?.id ?? null,
  organisationId: row.organisations?.id ?? null,
});

/** `today` is the Dhaka day (`YYYY-MM-DD`) that decides whether a sticker has expired. */
export const stickerRefOf = (row: StickerSelected | undefined, today: string): StickerRef | null => {
  if (!row) return null;
  const validUntil = isoDate(row.valid_until);
  return { id: row.id, stickerNo: row.sticker_no, validUntil, state: stickerStateOf(row.status as StickerStatus, validUntil, today) };
};

/** One vehicle as a list shows it; `place` comes from `MemberRowsService.places`. */
export function vehicleRowOf(row: VehicleSelected, place: Place, today: string): VehicleRow {
  return {
    id: row.id,
    regNo: row.reg_no,
    kind: row.kind as VehicleKind,
    make: row.make,
    colour: row.colour,
    place,
    person: row.persons && { id: row.persons.id, name: row.persons.full_name, nameEn: row.persons.full_name_en },
    organisation: row.organisations && { id: row.organisations.id, name: row.organisations.name },
    sticker: stickerRefOf(row.stickers[0], today),
    removedAt: row.removed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

/** What an audit row keeps of a vehicle. */
export const vehicleSnapshot = (row: VehicleSelected) => ({
  regNo: row.reg_no,
  kind: row.kind,
  make: row.make,
  colour: row.colour,
  unitId: row.units.locations.id,
  ...holderOf(row),
  note: row.note,
  removeReason: row.remove_reason,
});
