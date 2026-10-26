-- Step 31: how money is paid. Every receipt, paid expense and paid payroll run records a method
-- (cash, bank deposit or transfer, cheque, mobile wallet) and, for a cheque or a mobile wallet,
-- a reference (cheque number, or provider and transaction ID). Only cash sits in the cash
-- account; every other method lands in the bank account. No gateway is involved.

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_method_check";
ALTER TABLE "payments" ADD COLUMN "method_ref" TEXT;
-- The API only ever took cash, but rows entered by hand may say otherwise; '-' marks a
-- reference nobody recorded.
UPDATE "payments" SET "method_ref" = '-' WHERE "method" IN ('cheque','mobile');
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_method_check" CHECK ("method" IN ('cash','bank','cheque','mobile')),
  -- Cash never has a reference; a cheque or a mobile wallet always does.
  ADD CONSTRAINT "payments_method_ref_check" CHECK (
    ("method" <> 'cash' OR "method_ref" IS NULL)
    AND ("method" NOT IN ('cheque','mobile') OR "method_ref" IS NOT NULL)
  );

ALTER TABLE "expenses"
  ADD COLUMN "paid_method"     TEXT,
  ADD COLUMN "paid_method_ref" TEXT;
UPDATE "expenses" SET "paid_method" = "paid_account" WHERE "paid_account" IS NOT NULL;
ALTER TABLE "expenses"
  -- The method comes with the account, and decides it: cash from cash, the rest from the bank.
  ADD CONSTRAINT "expenses_paid_method_check" CHECK (
    ("paid_method" IS NULL) = ("paid_account" IS NULL)
    AND ("paid_method" IS NULL OR "paid_method" IN ('cash','bank','cheque','mobile'))
    AND ("paid_method" IS NULL OR ("paid_method" = 'cash') = ("paid_account" = 'cash'))
    AND ("paid_method" IS DISTINCT FROM 'cash' OR "paid_method_ref" IS NULL)
    AND ("paid_method" IS NULL OR "paid_method" NOT IN ('cheque','mobile') OR "paid_method_ref" IS NOT NULL)
    AND ("paid_method" IS NOT NULL OR "paid_method_ref" IS NULL)
  );

ALTER TABLE "payroll_runs"
  ADD COLUMN "paid_method"     TEXT,
  ADD COLUMN "paid_method_ref" TEXT;
-- The guard refuses any change to a void run; this backfill only copies the account it was paid from.
ALTER TABLE "payroll_runs" DISABLE TRIGGER "payroll_runs_guard";
UPDATE "payroll_runs" SET "paid_method" = "paid_account" WHERE "paid_account" IS NOT NULL;
ALTER TABLE "payroll_runs" ENABLE TRIGGER "payroll_runs_guard";
ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_paid_method_check" CHECK (
    ("paid_method" IS NULL) = ("paid_account" IS NULL)
    AND ("paid_method" IS NULL OR "paid_method" IN ('cash','bank','cheque','mobile'))
    AND ("paid_method" IS NULL OR ("paid_method" = 'cash') = ("paid_account" = 'cash'))
    AND ("paid_method" IS DISTINCT FROM 'cash' OR "paid_method_ref" IS NULL)
    AND ("paid_method" IS NULL OR "paid_method" NOT IN ('cheque','mobile') OR "paid_method_ref" IS NOT NULL)
    AND ("paid_method" IS NOT NULL OR "paid_method_ref" IS NULL)
  );
