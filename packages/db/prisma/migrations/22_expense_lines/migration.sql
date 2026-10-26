-- Step 32: an expense holds several lines. One record keeps one date, one fund, one payment
-- method, one approval, one voucher number and one ledger row for its total; each line has its
-- own head, vendor, description and amount. Budgets and reports count spending per line head.

CREATE TABLE "expense_lines" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "society_id"      UUID          NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "expense_id"      UUID          NOT NULL REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "position"        SMALLINT      NOT NULL CHECK ("position" >= 0),
  "expense_head_id" UUID          NOT NULL REFERENCES "expense_heads"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "vendor_id"       UUID          REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "description"     TEXT          NOT NULL,
  "amount"          DECIMAL(14,2) NOT NULL CHECK ("amount" > 0),
  CONSTRAINT "expense_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_lines_position_uq" UNIQUE ("expense_id", "position")
);

CREATE INDEX "expense_lines_head_idx" ON "expense_lines"("expense_head_id");
CREATE INDEX "expense_lines_vendor_idx" ON "expense_lines"("vendor_id");

-- Every existing expense becomes one line, so it reads the same as before.
INSERT INTO "expense_lines" ("society_id", "expense_id", "position", "expense_head_id", "vendor_id", "description", "amount")
SELECT "society_id", "id", 0, "expense_head_id", "vendor_id", "description", "amount" FROM "expenses";

-- What the record is called on lists and vouchers; without one, its first line's description.
ALTER TABLE "expenses" ADD COLUMN "title" TEXT;

-- How it is to be paid, chosen with the request. Paying records what was really used in
-- `paid_method`; a cheque number or wallet reference may only be known then.
ALTER TABLE "expenses"
  ADD COLUMN "method"     TEXT,
  ADD COLUMN "method_ref" TEXT;
UPDATE "expenses" SET "method" = coalesce("paid_method", 'cash'), "method_ref" = "paid_method_ref";
ALTER TABLE "expenses"
  ALTER COLUMN "method" SET NOT NULL,
  ADD CONSTRAINT "expenses_method_check" CHECK (
    "method" IN ('cash','bank','cheque','mobile') AND ("method" <> 'cash' OR "method_ref" IS NULL)
  );

-- Head, vendor and description now live on the lines.
ALTER TABLE "expenses"
  DROP COLUMN "expense_head_id",
  DROP COLUMN "vendor_id",
  DROP COLUMN "description";

-- Lines change only while the expense can still change (pending, or approved before payroll
-- pays it in the same transaction); a society delete removes them all.
CREATE FUNCTION "expense_lines_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  SELECT "status" INTO current_status FROM "expenses" WHERE "id" = coalesce(NEW."expense_id", OLD."expense_id");
  IF current_status IS NOT NULL AND current_status NOT IN ('pending','approved') THEN
    RAISE EXCEPTION 'expense lines are fixed once the expense is %', current_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER "expense_lines_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "expense_lines"
FOR EACH ROW EXECUTE FUNCTION "expense_lines_guard"();

-- At commit, an expense has at least one line and its amount is their sum.
CREATE FUNCTION "expense_lines_total_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  total DECIMAL(16,2);
  lines INT;
  amount DECIMAL(14,2);
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    target := NEW."id";
  ELSE
    target := coalesce(NEW."expense_id", OLD."expense_id");
  END IF;
  SELECT e."amount" INTO amount FROM "expenses" e WHERE e."id" = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT count(*), coalesce(sum(l."amount"), 0) INTO lines, total FROM "expense_lines" l WHERE l."expense_id" = target;
  IF lines = 0 OR total <> amount THEN
    RAISE EXCEPTION 'expense % amount % does not match its % lines (%)', target, amount, lines, total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "expense_lines_total"
AFTER INSERT OR UPDATE OR DELETE ON "expense_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "expense_lines_total_check"();

CREATE CONSTRAINT TRIGGER "expenses_lines_total"
AFTER INSERT OR UPDATE OF "amount" ON "expenses"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "expense_lines_total_check"();
