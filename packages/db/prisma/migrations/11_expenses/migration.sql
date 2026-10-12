-- Step 16: expenses and budgets.

-- Heads and vendors are archived, never deleted: old expenses keep pointing at them.
ALTER TABLE "expense_heads"
  ADD COLUMN "archived_at" TIMESTAMPTZ(6),
  ADD COLUMN "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now();

ALTER TABLE "vendors"
  ADD COLUMN "archived_at" TIMESTAMPTZ(6),
  ADD COLUMN "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now();
CREATE INDEX "vendors_society_idx" ON "vendors"("society_id", "name");

-- An expense is requested, then approved or rejected by someone else, then paid (a voucher
-- number, the account it left, an `out` ledger row). A paid expense is only voided, with a
-- reversing ledger row; an approved one not yet paid may be voided too.
ALTER TABLE "expenses"
  ADD COLUMN "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  ADD COLUMN "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  ADD COLUMN "rejected_by"   UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "rejected_at"   TIMESTAMPTZ(6),
  ADD COLUMN "reject_reason" TEXT,
  ADD COLUMN "voucher_no"    TEXT,
  ADD COLUMN "paid_at"       TIMESTAMPTZ(6),
  ADD COLUMN "paid_by"       UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "paid_account"  TEXT,
  ADD COLUMN "voided_at"     TIMESTAMPTZ(6),
  ADD COLUMN "voided_by"     UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "void_reason"   TEXT;

ALTER TABLE "expenses" DROP CONSTRAINT "expenses_status_check";
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_status_check" CHECK ("status" IN ('pending','approved','rejected','paid','void')),
  ADD CONSTRAINT "expenses_paid_account_check" CHECK ("paid_account" IS NULL OR "paid_account" IN ('cash','bank')),
  -- Payment details come together; a paid expense has them, one never paid has none (a void may have either).
  ADD CONSTRAINT "expenses_paid_check" CHECK (
    (("voucher_no" IS NULL) = ("paid_at" IS NULL) AND ("paid_at" IS NULL) = ("paid_by" IS NULL) AND ("paid_by" IS NULL) = ("paid_account" IS NULL))
    AND ("status" <> 'paid' OR "paid_at" IS NOT NULL)
    AND ("status" NOT IN ('pending','approved','rejected') OR "paid_at" IS NULL)
  ),
  -- Approved (and later paid) means someone approved it, and never the requester.
  ADD CONSTRAINT "expenses_approved_check" CHECK (
    ("approved_by" IS NULL) = ("approved_at" IS NULL)
    AND ("status" NOT IN ('approved','paid') OR "approved_at" IS NOT NULL)
    AND ("approved_by" IS NULL OR "requested_by" IS NULL OR "approved_by" <> "requested_by")
  ),
  -- Rejected says by whom, when and why; nothing else carries those.
  ADD CONSTRAINT "expenses_rejected_check" CHECK (
    ("status" = 'rejected') = ("rejected_at" IS NOT NULL)
    AND ("rejected_at" IS NULL) = ("rejected_by" IS NULL) AND ("rejected_by" IS NULL) = ("reject_reason" IS NULL)
    AND ("rejected_by" IS NULL OR "requested_by" IS NULL OR "rejected_by" <> "requested_by")
  ),
  -- Void says by whom, when and why; nothing else carries those.
  ADD CONSTRAINT "expenses_void_check" CHECK (
    ("status" = 'void') = ("voided_at" IS NOT NULL)
    AND ("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_by" IS NULL) = ("void_reason" IS NULL)
  );

CREATE UNIQUE INDEX "expenses_voucher_uq" ON "expenses"("society_id", "voucher_no") WHERE "voucher_no" IS NOT NULL;
CREATE INDEX "expenses_society_idx" ON "expenses"("society_id", "spent_on" DESC);
CREATE INDEX "expenses_status_idx" ON "expenses"("society_id", "status");
CREATE INDEX "expenses_head_idx" ON "expenses"("expense_head_id");
CREATE INDEX "expenses_fund_idx" ON "expenses"("fund_id");

-- Who last set a budget line, and when.
ALTER TABLE "budgets"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  ADD COLUMN "updated_by" UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
