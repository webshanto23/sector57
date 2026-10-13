-- Step 24: helpdesk and work orders. A ticket (অভিযোগ) is a problem someone reported at a place,
-- numbered T-NNNN; the office types in phone and walk-in complaints. A work order (কাজের আদেশ),
-- WO-YY-NNNN, is the job that fixes it, or an asset's repair or upkeep. Nothing here is deleted:
-- tickets are closed or cancelled, work orders done or cancelled.

-- Ticket numbers never restart; work order numbers restart each fiscal year, like vouchers.
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_kind_check";
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_kind_check" CHECK ("kind" IN ('invoice','receipt','voucher','asset','ticket','work_order'));

-- An asset's history also shows the work orders raised on it.
ALTER TABLE "asset_events" DROP CONSTRAINT "asset_events_kind_check";
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_kind_check" CHECK ("kind" IN ('created','updated','moved','custodian','status','maintenance','photo','work_order'));

CREATE TABLE "tickets" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"         UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "ticket_no"          TEXT           NOT NULL,
  -- Where the problem is; a role limited to an area sees the tickets inside it.
  "location_id"        UUID           NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "category"           TEXT           NOT NULL CHECK ("category" IN ('street_light','garbage','water','drainage','electricity','security','noise','repair','other')),
  "title"              TEXT           NOT NULL,
  "description"        TEXT,
  "priority"           TEXT           NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('low','normal','high','urgent')),
  "status"             TEXT           NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','assigned','in_progress','resolved','closed','cancelled')),
  -- Who reported it: a person on record, or a name and phone typed in for a phone-in complaint
  -- (never both). Neither when the office or a staff member noticed it.
  "reporter_person_id" UUID           REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "reporter_name"      TEXT,
  "reporter_phone"     TEXT,
  -- Who typed it in.
  "reported_by"        UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "assigned_staff_id"  UUID           REFERENCES "staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- From the category's SLA when it was opened; overdue is derived (due_at passed, not yet resolved).
  "due_at"             TIMESTAMPTZ(6) NOT NULL,
  "resolved_at"        TIMESTAMPTZ(6),
  "resolution_note"    TEXT,
  -- When it was closed or cancelled.
  "closed_at"          TIMESTAMPTZ(6),
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tickets_reporter_check" CHECK ("reporter_person_id" IS NULL OR ("reporter_name" IS NULL AND "reporter_phone" IS NULL)),
  CONSTRAINT "tickets_assigned_check" CHECK ("status" <> 'assigned' OR "assigned_staff_id" IS NOT NULL),
  -- Resolved (and closed after it) says when and how; a reopened ticket clears both.
  CONSTRAINT "tickets_resolved_check" CHECK (
    ("resolved_at" IS NULL) = ("resolution_note" IS NULL)
    AND ("status" NOT IN ('resolved','closed') OR "resolved_at" IS NOT NULL)
    AND ("status" IN ('resolved','closed') OR "resolved_at" IS NULL)
  ),
  CONSTRAINT "tickets_closed_check" CHECK (("status" IN ('closed','cancelled')) = ("closed_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "tickets_no_uq" ON "tickets"("society_id", "ticket_no");
CREATE INDEX "tickets_society_idx" ON "tickets"("society_id", "status", "due_at");
CREATE INDEX "tickets_location_idx" ON "tickets"("location_id");
CREATE INDEX "tickets_assigned_idx" ON "tickets"("assigned_staff_id");
CREATE INDEX "tickets_reporter_idx" ON "tickets"("reporter_person_id");

-- A ticket's timeline, oldest first: opened, changed, assigned, status, comments, photos and
-- work orders. Only ever added to.
CREATE TABLE "ticket_events" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id" UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "ticket_id"  UUID           NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "kind"       TEXT           NOT NULL CHECK ("kind" IN ('created','updated','assigned','status','comment','photo','work_order')),
  -- Names as they were then (staff, status from and to, the work order's number).
  "detail"     JSONB          NOT NULL DEFAULT '{}',
  "note"       TEXT,
  "photo_url"  TEXT,
  "created_by" UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_events_photo_check" CHECK (("kind" = 'photo') = ("photo_url" IS NOT NULL)),
  CONSTRAINT "ticket_events_comment_check" CHECK ("kind" <> 'comment' OR "note" IS NOT NULL)
);
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events"("ticket_id", "created_at");

CREATE TABLE "work_orders" (
  "id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"        UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "wo_no"             TEXT           NOT NULL,
  -- What it came from: a ticket, an asset, an asset's upkeep plan, or nothing (a job of its own).
  "ticket_id"         UUID           REFERENCES "tickets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "asset_id"          UUID           REFERENCES "assets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "plan_id"           UUID           REFERENCES "asset_maintenance_plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- Where the work is (the ticket's or the asset's place when it came from one); scopes access.
  "location_id"       UUID           NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "title"             TEXT           NOT NULL,
  "description"       TEXT,
  -- Done by a staff member or an outside vendor (never both), or not yet given to anyone.
  "assigned_staff_id" UUID           REFERENCES "staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "vendor_id"         UUID           REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "estimated_cost"    NUMERIC(14,2)  CHECK ("estimated_cost" >= 0),
  "status"            TEXT           NOT NULL DEFAULT 'open' CHECK ("status" IN ('open','in_progress','done','cancelled')),
  "completed_on"      DATE,
  "completion_note"   TEXT,
  -- The pending expense request made when it was finished with a cost; never touches the ledger itself.
  "expense_id"        UUID           REFERENCES "expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "cancelled_at"      TIMESTAMPTZ(6),
  "cancel_reason"     TEXT,
  "created_by"        UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_orders_plan_check" CHECK ("plan_id" IS NULL OR "asset_id" IS NOT NULL),
  CONSTRAINT "work_orders_assignee_check" CHECK ("assigned_staff_id" IS NULL OR "vendor_id" IS NULL),
  CONSTRAINT "work_orders_done_check" CHECK (
    ("status" = 'done') = ("completed_on" IS NOT NULL) AND ("completed_on" IS NULL) = ("completion_note" IS NULL)
  ),
  CONSTRAINT "work_orders_expense_check" CHECK ("expense_id" IS NULL OR "status" = 'done'),
  CONSTRAINT "work_orders_cancelled_check" CHECK (
    ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL) AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)
  )
);
CREATE UNIQUE INDEX "work_orders_no_uq" ON "work_orders"("society_id", "wo_no");
CREATE UNIQUE INDEX "work_orders_expense_uq" ON "work_orders"("expense_id") WHERE "expense_id" IS NOT NULL;
CREATE INDEX "work_orders_society_idx" ON "work_orders"("society_id", "status");
CREATE INDEX "work_orders_location_idx" ON "work_orders"("location_id");
CREATE INDEX "work_orders_ticket_idx" ON "work_orders"("ticket_id");
CREATE INDEX "work_orders_asset_idx" ON "work_orders"("asset_id");
CREATE INDEX "work_orders_plan_idx" ON "work_orders"("plan_id");
CREATE INDEX "work_orders_staff_idx" ON "work_orders"("assigned_staff_id");
