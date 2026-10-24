-- Step 13: recurring charges and billing runs.

-- Schedules get a name to show on bills, how many days after the bill it is due, and when
-- they last changed. Periods are whole months: `starts_on` is the first day of the first
-- month, `ends_on` the last day of the last, and `next_run_on` the first day of the next
-- period to bill (null once ended).
ALTER TABLE "charge_schedules"
  ADD COLUMN "name_bn"    TEXT,
  ADD COLUMN "name_en"    TEXT,
  ADD COLUMN "due_days"   SMALLINT NOT NULL DEFAULT 15 CHECK ("due_days" BETWEEN 0 AND 365),
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
UPDATE "charge_schedules" s SET "name_bn" = ct."name_bn"
  FROM "charge_types" ct WHERE ct."id" = s."charge_type_id" AND s."name_bn" IS NULL;
ALTER TABLE "charge_schedules" ALTER COLUMN "name_bn" SET NOT NULL;
CREATE INDEX "charge_schedules_due_idx" ON "charge_schedules"("society_id", "next_run_on") WHERE "status" = 'active';

-- A schedule's rate for part of the tree (a block, road or building). A unit pays the rate
-- of the nearest location above it on the list, else the schedule's own amount.
CREATE TABLE "charge_schedule_rates" (
  "schedule_id" UUID NOT NULL REFERENCES "charge_schedules"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "amount"      NUMERIC(14,2) NOT NULL CHECK ("amount" > 0),
  CONSTRAINT "charge_schedule_rates_pkey" PRIMARY KEY ("schedule_id", "location_id")
);
CREATE INDEX "charge_schedule_rates_location_idx" ON "charge_schedule_rates"("location_id");

-- One row per billing run, kept for the history. A failed run is recorded on its own,
-- after its bills were rolled back. `period` is the first day of the month billed.
CREATE TABLE "billing_runs" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "society_id"    UUID NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "period"        DATE NOT NULL CHECK (EXTRACT(DAY FROM "period") = 1),
  "trigger"       TEXT NOT NULL CHECK ("trigger" IN ('manual','auto')),
  "status"        TEXT NOT NULL CHECK ("status" IN ('done','failed')),
  "started_by"    UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "started_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "finished_at"   TIMESTAMPTZ(6),
  "invoice_count" INTEGER NOT NULL DEFAULT 0 CHECK ("invoice_count" >= 0),
  "total"         NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK ("total" >= 0),
  "skipped"       JSONB NOT NULL DEFAULT '[]',
  "error"         TEXT,
  CONSTRAINT "billing_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_runs_error_check" CHECK (("status" = 'failed') = ("error" IS NOT NULL))
);
CREATE INDEX "billing_runs_society_idx" ON "billing_runs"("society_id", "started_at" DESC);

ALTER TABLE "invoices" ADD COLUMN "billing_run_id" UUID REFERENCES "billing_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "invoices_billing_run_idx" ON "invoices"("billing_run_id") WHERE "billing_run_id" IS NOT NULL;
