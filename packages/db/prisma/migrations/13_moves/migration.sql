-- Step 20: move-in and move-out checklists on `move_events` (unused until now).

-- A move is open until it is done (the tenancy started or ended) or cancelled.
ALTER TABLE "move_events"
  ADD COLUMN IF NOT EXISTS "status"       TEXT           NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','done','cancelled')),
  ADD COLUMN IF NOT EXISTS "note"         TEXT,
  ADD COLUMN IF NOT EXISTS "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "completed_by" UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "cancelled_by" UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Done has a completion time, cancelled a cancel time, and never both.
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_status_fields_check" CHECK (
  ("status" = 'done') = ("completed_at" IS NOT NULL) AND ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)
);

-- One open move per tenancy.
CREATE UNIQUE INDEX "move_events_open_uq" ON "move_events"("tenancy_id") WHERE "status" = 'open';
CREATE INDEX "move_events_society_idx" ON "move_events"("society_id", "status", "planned_date");
CREATE INDEX "move_events_tenancy_idx" ON "move_events"("tenancy_id");
