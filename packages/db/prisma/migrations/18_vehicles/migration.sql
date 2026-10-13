-- Step 25: vehicles, stickers and parking. A vehicle (যানবাহন) belongs to a person at a unit;
-- a sticker is the society's pass for it, valid to the end of the calendar or fiscal year
-- (setting `vehicle_stickers`). Nothing here is deleted: vehicles and parking slots are
-- removed (`removed_at`), stickers revoked or replaced. Not gate management: no entry log.

-- Sticker numbers never restart; the prefix is the society's setting.
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_kind_check";
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_kind_check" CHECK ("kind" IN ('invoice','receipt','voucher','asset','ticket','work_order','sticker'));

CREATE TABLE "vehicles" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"    UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  -- As typed (NFC), e.g. "ঢাকা মেট্রো-গ ১২-৩৪৫৬".
  "reg_no"        TEXT           NOT NULL,
  -- For matching: English digits, no spaces, dashes or dots, Latin letters in capitals (`regNoKey`).
  "reg_key"       TEXT           NOT NULL CHECK ("reg_key" <> ''),
  "kind"          TEXT           NOT NULL CHECK ("kind" IN ('car','motorcycle','microbus','cng','bicycle','other')),
  "make"          TEXT,
  "colour"        TEXT,
  -- The unit it belongs to (scopes access) and its owner, renter or resident there.
  "unit_id"       UUID           NOT NULL REFERENCES "units"("location_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "person_id"     UUID           NOT NULL REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "note"          TEXT,
  "created_by"    UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "removed_at"    TIMESTAMPTZ(6),
  "remove_reason" TEXT,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicles_removed_check" CHECK (("removed_at" IS NULL) = ("remove_reason" IS NULL))
);
-- One registration number per society among vehicles still on file.
CREATE UNIQUE INDEX "vehicles_reg_uq" ON "vehicles"("society_id", "reg_key") WHERE "removed_at" IS NULL;
CREATE INDEX "vehicles_society_idx" ON "vehicles"("society_id", "removed_at");
CREATE INDEX "vehicles_unit_idx" ON "vehicles"("unit_id");
CREATE INDEX "vehicles_person_idx" ON "vehicles"("person_id");
CREATE INDEX "vehicles_reg_key_idx" ON "vehicles"("society_id", "reg_key");

CREATE TABLE "stickers" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"    UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  -- `<prefix>-NNNN`, drawn from `document_sequences` kind `sticker`.
  "sticker_no"    TEXT           NOT NULL,
  "vehicle_id"    UUID           NOT NULL REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- Last day it is valid (Dhaka); expired is derived, never stored.
  "valid_until"   DATE           NOT NULL,
  -- Why it was issued: a first sticker, next year's, or one in place of a lost or damaged one.
  "reason"        TEXT           NOT NULL DEFAULT 'new' CHECK ("reason" IN ('new','renewal','replacement')),
  "status"        TEXT           NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','revoked','replaced')),
  -- The sticker this one took over from (renewal or replacement); that one is now `replaced`.
  "replaces_id"   UUID           REFERENCES "stickers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- The bill for the fee, when the society charges one (setting `vehicle_stickers`).
  "invoice_id"    UUID           REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "issued_by"     UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "issued_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "revoked_at"    TIMESTAMPTZ(6),
  "revoke_reason" TEXT,
  CONSTRAINT "stickers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stickers_replaces_check" CHECK (("reason" = 'new') = ("replaces_id" IS NULL)),
  CONSTRAINT "stickers_revoked_check" CHECK (
    ("status" = 'revoked') = ("revoked_at" IS NOT NULL) AND ("revoked_at" IS NULL) = ("revoke_reason" IS NULL)
  )
);
CREATE UNIQUE INDEX "stickers_no_uq" ON "stickers"("society_id", "sticker_no");
-- At most one sticker in force per vehicle, and each sticker is taken over only once.
CREATE UNIQUE INDEX "stickers_active_uq" ON "stickers"("vehicle_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX "stickers_replaces_uq" ON "stickers"("replaces_id") WHERE "replaces_id" IS NOT NULL;
CREATE UNIQUE INDEX "stickers_invoice_uq" ON "stickers"("invoice_id") WHERE "invoice_id" IS NOT NULL;
CREATE INDEX "stickers_society_idx" ON "stickers"("society_id", "status", "valid_until");

CREATE TABLE "parking_slots" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"    UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  -- Where the slot is (a building's garage, a road); scopes access.
  "location_id"   UUID           NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "code"          TEXT           NOT NULL CHECK ("code" <> ''),
  "note"          TEXT,
  -- Given to a unit or to one vehicle (never both), or free.
  "unit_id"       UUID           REFERENCES "units"("location_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "vehicle_id"    UUID           REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_by"    UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "removed_at"    TIMESTAMPTZ(6),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "parking_slots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parking_slots_assignee_check" CHECK ("unit_id" IS NULL OR "vehicle_id" IS NULL),
  CONSTRAINT "parking_slots_removed_check" CHECK ("removed_at" IS NULL OR ("unit_id" IS NULL AND "vehicle_id" IS NULL))
);
-- Codes are unique within a place among slots still in use (two garages may each have "P1").
CREATE UNIQUE INDEX "parking_slots_code_uq" ON "parking_slots"("location_id", lower("code")) WHERE "removed_at" IS NULL;
-- A vehicle holds at most one slot.
CREATE UNIQUE INDEX "parking_slots_vehicle_uq" ON "parking_slots"("vehicle_id") WHERE "vehicle_id" IS NOT NULL;
CREATE INDEX "parking_slots_society_idx" ON "parking_slots"("society_id", "removed_at");
CREATE INDEX "parking_slots_location_idx" ON "parking_slots"("location_id");
CREATE INDEX "parking_slots_unit_idx" ON "parking_slots"("unit_id");
