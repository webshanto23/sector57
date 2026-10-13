-- Step 23: facilities and assets. A facility is a named place the society runs (a hall, the
-- mosque, a pump house); an asset is a thing it owns, numbered AST-NNNN, kept at a facility or
-- straight on a location. Nothing here is deleted: facilities are archived, assets retired.

-- Asset numbers come from the same gap-free counters as invoices and receipts (never restart).
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_kind_check";
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_kind_check" CHECK ("kind" IN ('invoice','receipt','voucher','asset'));

CREATE TABLE "facilities" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"  UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  -- Where it is; a role limited to an area sees the facilities inside it.
  "location_id" UUID           NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "name_bn"     TEXT           NOT NULL,
  "name_en"     TEXT,
  "kind"        TEXT           NOT NULL CHECK ("kind" IN ('hall','mosque','playground','generator','water_pump','office','other')),
  -- Bookings come later (with the member app); the flag says which facilities will take them.
  "bookable"    BOOLEAN        NOT NULL DEFAULT false,
  -- Its own fund, while separate facility funds are turned on.
  "fund_id"     UUID           REFERENCES "funds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "note"        TEXT,
  "archived_at" TIMESTAMPTZ(6),
  "created_by"  UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);
-- Names are unique among the facilities still in use.
CREATE UNIQUE INDEX "facilities_name_uq" ON "facilities"("society_id", "name_bn") WHERE "archived_at" IS NULL;
CREATE INDEX "facilities_location_idx" ON "facilities"("location_id");

CREATE TABLE "assets" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"         UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "asset_no"           TEXT           NOT NULL,
  "name_bn"            TEXT           NOT NULL,
  "name_en"            TEXT,
  "category"           TEXT           NOT NULL,
  -- At a facility (then `location_id` is the facility's place) or straight on a location.
  "facility_id"        UUID           REFERENCES "facilities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "location_id"        UUID           NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "custodian_staff_id" UUID           REFERENCES "staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "purchased_on"       DATE,
  "purchase_cost"      NUMERIC(14,2)  CHECK ("purchase_cost" >= 0),
  "vendor_id"          UUID           REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- The paid expense that bought it, if it went through the books.
  "expense_id"         UUID           REFERENCES "expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "warranty_until"     DATE,
  "status"             TEXT           NOT NULL DEFAULT 'in_use' CHECK ("status" IN ('in_use','repair','retired','lost')),
  "retired_on"         DATE,
  "retired_reason"     TEXT,
  "photo_url"          TEXT,
  "note"               TEXT,
  "created_by"         UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
  -- Retired or lost says when and why, together; nothing else carries those.
  CONSTRAINT "assets_retired_check" CHECK (
    ("status" IN ('retired','lost')) = ("retired_on" IS NOT NULL) AND ("retired_on" IS NULL) = ("retired_reason" IS NULL)
  ),
  CONSTRAINT "assets_warranty_check" CHECK ("warranty_until" IS NULL OR "purchased_on" IS NULL OR "warranty_until" >= "purchased_on")
);
CREATE UNIQUE INDEX "assets_no_uq" ON "assets"("society_id", "asset_no");
CREATE INDEX "assets_society_idx" ON "assets"("society_id", "status");
CREATE INDEX "assets_location_idx" ON "assets"("location_id");
CREATE INDEX "assets_facility_idx" ON "assets"("facility_id");
CREATE INDEX "assets_custodian_idx" ON "assets"("custodian_staff_id");

-- Upkeep that comes round every few months. Done moves the next due day on; a plan that was
-- never done may be removed, one that was is stopped (archived) so its history stays.
CREATE TABLE "asset_maintenance_plans" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"   UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "asset_id"     UUID           NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "task_bn"      TEXT           NOT NULL,
  "task_en"      TEXT,
  "every_months" INTEGER        NOT NULL CHECK ("every_months" BETWEEN 1 AND 120),
  "next_due_on"  DATE           NOT NULL,
  "last_done_on" DATE,
  "archived_at"  TIMESTAMPTZ(6),
  "created_by"   UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "asset_maintenance_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_plans_asset_idx" ON "asset_maintenance_plans"("asset_id");
CREATE INDEX "asset_plans_due_idx" ON "asset_maintenance_plans"("society_id", "next_due_on") WHERE "archived_at" IS NULL;

-- An asset's history, newest last: added, changed, moved, custodian, status, upkeep done.
-- Only ever added to (Step 24 adds its work orders here too).
CREATE TABLE "asset_events" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id" UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "asset_id"   UUID           NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "kind"       TEXT           NOT NULL CHECK ("kind" IN ('created','updated','moved','custodian','status','maintenance','photo')),
  "detail"     JSONB          NOT NULL DEFAULT '{}',
  "note"       TEXT,
  "created_by" UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "asset_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_events_asset_idx" ON "asset_events"("asset_id", "created_at");
