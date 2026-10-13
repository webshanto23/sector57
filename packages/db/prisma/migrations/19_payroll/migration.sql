-- Step 26: payroll. One run per society and month (a voided run makes room for a new one).
-- A run is prepared as a draft from staff pay and attendance, approved by someone else, and
-- paid through expenses (one per fund), so the ledger has no new source. Nothing here is ever
-- deleted; payslips and their lines are frozen once the run leaves draft.
-- Plain foreign keys are checked at commit (DEFERRABLE INITIALLY DEFERRED): they still refuse to
-- remove a fund, staff row, expense or user in use, but let a whole society cascade away in any order.

CREATE TABLE "payroll_runs" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"      UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  -- The first day of the month paid.
  "month"           DATE           NOT NULL CHECK (EXTRACT(DAY FROM "month") = 1),
  "status"          TEXT           NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','approved','paid','void')),
  "prepared_by"     UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "prepared_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "approved_by"     UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "approved_at"     TIMESTAMPTZ(6),
  "paid_by"         UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "paid_at"         TIMESTAMPTZ(6),
  "paid_account"    TEXT           CHECK ("paid_account" IN ('cash','bank')),
  -- The expense head the salaries were booked under, chosen when paying.
  "expense_head_id" UUID           REFERENCES "expense_heads"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "voided_by"       UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "voided_at"       TIMESTAMPTZ(6),
  "void_reason"     TEXT,
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_runs_approved_check" CHECK (("approved_at" IS NULL) = ("approved_by" IS NULL)),
  CONSTRAINT "payroll_runs_paid_check" CHECK (
    ("paid_at" IS NULL) = ("paid_by" IS NULL)
    AND ("paid_at" IS NULL) = ("paid_account" IS NULL)
    AND ("paid_at" IS NULL) = ("expense_head_id" IS NULL)
    AND ("paid_at" IS NULL OR "approved_at" IS NOT NULL)
  ),
  CONSTRAINT "payroll_runs_void_check" CHECK (
    ("status" = 'void') = ("voided_at" IS NOT NULL)
    AND ("voided_at" IS NULL) = ("voided_by" IS NULL)
    AND ("voided_at" IS NULL) = ("void_reason" IS NULL)
  ),
  CONSTRAINT "payroll_runs_stage_check" CHECK (
    CASE "status"
      WHEN 'draft' THEN "approved_at" IS NULL AND "paid_at" IS NULL
      WHEN 'approved' THEN "approved_at" IS NOT NULL AND "paid_at" IS NULL
      WHEN 'paid' THEN "paid_at" IS NOT NULL
      ELSE TRUE
    END
  )
);
-- One live run per month; voided ones stay for the record.
CREATE UNIQUE INDEX "payroll_runs_month_uq" ON "payroll_runs"("society_id", "month") WHERE "status" <> 'void';
CREATE INDEX "payroll_runs_society_idx" ON "payroll_runs"("society_id", "month" DESC);

-- One per staff stint in the run. Kind, rate and the month's counts are copied, so a payslip
-- reads the same after the staff row or attendance changes.
CREATE TABLE "payslips" (
  "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
  "society_id"           UUID          NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "run_id"               UUID          NOT NULL REFERENCES "payroll_runs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "staff_id"             UUID          NOT NULL REFERENCES "staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "fund_id"              UUID          NOT NULL REFERENCES "funds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "kind"                 TEXT          NOT NULL CHECK ("kind" IN ('permanent','contract','daily')),
  -- The monthly salary, or the daily rate for a daily worker; 0 when none was set.
  "rate"                 NUMERIC(14,2) NOT NULL CHECK ("rate" >= 0),
  "days_in_month"        SMALLINT      NOT NULL CHECK ("days_in_month" BETWEEN 28 AND 31),
  -- Days of the month inside the stint.
  "days_employed"        SMALLINT      NOT NULL CHECK ("days_employed" BETWEEN 1 AND 31),
  "present_days"         SMALLINT      NOT NULL CHECK ("present_days" >= 0),
  "half_days"            SMALLINT      NOT NULL CHECK ("half_days" >= 0),
  "absent_days"          SMALLINT      NOT NULL CHECK ("absent_days" >= 0),
  "base"                 NUMERIC(14,2) NOT NULL CHECK ("base" >= 0),
  "attendance_deduction" NUMERIC(14,2) NOT NULL CHECK ("attendance_deduction" >= 0 AND "attendance_deduction" <= "base"),
  "allowances"           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK ("allowances" >= 0),
  "deductions"           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK ("deductions" >= 0),
  "net"                  NUMERIC(14,2) NOT NULL CHECK ("net" >= 0),
  "note"                 TEXT,
  "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "payslips_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payslips_counts_check" CHECK ("days_employed" <= "days_in_month" AND "present_days" + "half_days" + "absent_days" <= "days_employed"),
  CONSTRAINT "payslips_sum_check" CHECK ("net" = "base" - "attendance_deduction" + "allowances" - "deductions")
);
CREATE UNIQUE INDEX "payslips_run_staff_uq" ON "payslips"("run_id", "staff_id");
CREATE INDEX "payslips_staff_idx" ON "payslips"("staff_id");

-- Named allowances and deductions; the payslip keeps their sums.
CREATE TABLE "payslip_lines" (
  "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
  "payslip_id" UUID          NOT NULL REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "kind"       TEXT          NOT NULL CHECK ("kind" IN ('allowance','deduction')),
  "label_bn"   TEXT          NOT NULL,
  "label_en"   TEXT,
  "amount"     NUMERIC(14,2) NOT NULL CHECK ("amount" > 0),
  "position"   SMALLINT      NOT NULL CHECK ("position" >= 0),
  CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payslip_lines_payslip_idx" ON "payslip_lines"("payslip_id", "position");

-- The expenses a paid run booked, one per fund.
CREATE TABLE "payroll_run_expenses" (
  "run_id"     UUID NOT NULL REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "expense_id" UUID NOT NULL REFERENCES "expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  "fund_id"    UUID NOT NULL REFERENCES "funds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "payroll_run_expenses_pkey" PRIMARY KEY ("run_id", "expense_id")
);
CREATE UNIQUE INDEX "payroll_run_expenses_expense_uq" ON "payroll_run_expenses"("expense_id");
CREATE UNIQUE INDEX "payroll_run_expenses_fund_uq" ON "payroll_run_expenses"("run_id", "fund_id");

-- Runs are never deleted and move only forward: draft → approved → paid, any of them → void.
-- As for the ledger, the only delete allowed on these tables is a cascade (removing a whole
-- society, or a draft payslip's lines with it), which runs inside a foreign key's trigger, so
-- the depth is above 1.
CREATE FUNCTION "payroll_runs_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payroll runs are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> NEW."status" AND NOT (
    (OLD."status" = 'draft' AND NEW."status" IN ('approved','void'))
    OR (OLD."status" = 'approved' AND NEW."status" IN ('paid','void'))
    OR (OLD."status" = 'paid' AND NEW."status" = 'void')
  ) THEN
    RAISE EXCEPTION 'payroll run cannot go from % to %', OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'void' THEN
    RAISE EXCEPTION 'a void payroll run never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."month" <> NEW."month" OR OLD."society_id" <> NEW."society_id" THEN
    RAISE EXCEPTION 'a payroll run keeps its month' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "payroll_runs_guard" BEFORE UPDATE OR DELETE ON "payroll_runs"
  FOR EACH ROW EXECUTE FUNCTION "payroll_runs_guard"();

-- Payslips and lines change only while their run is a draft.
CREATE FUNCTION "payslips_draft_only"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  SELECT r."status" INTO run_status FROM "payroll_runs" r WHERE r."id" = (CASE WHEN TG_OP = 'DELETE' THEN OLD."run_id" ELSE NEW."run_id" END);
  IF run_status IS DISTINCT FROM 'draft' OR (TG_OP = 'UPDATE' AND OLD."run_id" <> NEW."run_id") THEN
    RAISE EXCEPTION 'payslips change only while the run is a draft' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "payslips_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "payslips"
  FOR EACH ROW EXECUTE FUNCTION "payslips_draft_only"();

CREATE FUNCTION "payslip_lines_draft_only"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  SELECT r."status" INTO run_status
    FROM "payslips" p JOIN "payroll_runs" r ON r."id" = p."run_id"
   WHERE p."id" = (CASE WHEN TG_OP = 'DELETE' THEN OLD."payslip_id" ELSE NEW."payslip_id" END);
  IF run_status IS DISTINCT FROM 'draft' OR (TG_OP = 'UPDATE' AND OLD."payslip_id" <> NEW."payslip_id") THEN
    RAISE EXCEPTION 'payslip lines change only while the run is a draft' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "payslip_lines_draft_only" BEFORE INSERT OR UPDATE OR DELETE ON "payslip_lines"
  FOR EACH ROW EXECUTE FUNCTION "payslip_lines_draft_only"();

-- The run's expenses are written once, when it is paid.
CREATE FUNCTION "payroll_run_expenses_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'payroll run expenses never change' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "payroll_run_expenses_guard" BEFORE UPDATE OR DELETE ON "payroll_run_expenses"
  FOR EACH ROW EXECUTE FUNCTION "payroll_run_expenses_guard"();
