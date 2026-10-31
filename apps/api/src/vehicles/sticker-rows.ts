import { Prisma } from '@s57/db';
import { stickerStateOf, type Place, type StickerReason, type StickerRow, type StickerStatus, type VehicleKind } from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { placeSelect } from '../members/member-rows.service.js';

export const stickerSelect = {
  id: true,
  sticker_no: true,
  reason: true,
  status: true,
  valid_until: true,
  issued_at: true,
  revoked_at: true,
  revoke_reason: true,
  vehicles: { select: { id: true, reg_no: true, kind: true, removed_at: true, unit_id: true, person_id: true, organisation_id: true, units: { select: { locations: { select: placeSelect } } } } },
  replaces: { select: { id: true, sticker_no: true } },
  invoices: { select: { id: true, invoice_no: true } },
} satisfies Prisma.stickersSelect;
export type StickerSelected = Prisma.stickersGetPayload<{ select: typeof stickerSelect }>;

/** The unit a sticker's vehicle belongs to (what scopes it). */
export const stickerPlace = (row: StickerSelected) => row.vehicles.units.locations;

/** One sticker as a list shows it; `today` (Dhaka, `YYYY-MM-DD`) decides expired. */
export function stickerRowOf(row: StickerSelected, place: Place, today: string): StickerRow {
  const validUntil = isoDate(row.valid_until);
  const status = row.status as StickerStatus;
  return {
    id: row.id,
    stickerNo: row.sticker_no,
    reason: row.reason as StickerReason,
    status,
    state: stickerStateOf(status, validUntil, today),
    validUntil,
    vehicle: { id: row.vehicles.id, regNo: row.vehicles.reg_no, kind: row.vehicles.kind as VehicleKind, removed: row.vehicles.removed_at !== null },
    place,
    replaces: row.replaces && { id: row.replaces.id, stickerNo: row.replaces.sticker_no },
    invoice: row.invoices && { id: row.invoices.id, invoiceNo: row.invoices.invoice_no },
    issuedAt: row.issued_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    revokeReason: row.revoke_reason,
  };
}
