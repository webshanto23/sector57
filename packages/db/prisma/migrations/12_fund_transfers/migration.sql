-- Step 17: fund transfers and bank deposits.

-- Money moved between funds, or between a fund's cash box and its bank account (a deposit is
-- the same fund, cash to bank; a withdrawal is bank to cash). Each transfer writes two ledger
-- rows (`source_type = 'transfer'`, `source_id` = this row): `out` from the source, `in` to the
-- destination. Never deleted: a void writes the two reversing rows and fills the void fields.
CREATE TABLE "fund_transfers" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"   UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "from_fund_id" UUID           NOT NULL REFERENCES "funds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "from_account" TEXT           NOT NULL CHECK ("from_account" IN ('cash','bank')),
  "to_fund_id"   UUID           NOT NULL REFERENCES "funds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "to_account"   TEXT           NOT NULL CHECK ("to_account" IN ('cash','bank')),
  "amount"       DECIMAL(14,2)  NOT NULL CHECK ("amount" > 0),
  "transfer_date" DATE          NOT NULL,
  "memo"         TEXT,
  "created_by"   UUID           NOT NULL REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "voided_at"    TIMESTAMPTZ(6),
  "voided_by"    UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "void_reason"  TEXT,
  CONSTRAINT "fund_transfers_pkey" PRIMARY KEY ("id"),
  -- Something must move: another fund, another account, or both.
  CONSTRAINT "fund_transfers_moves_check" CHECK ("from_fund_id" <> "to_fund_id" OR "from_account" <> "to_account"),
  -- Void says by whom, when and why, all together.
  CONSTRAINT "fund_transfers_void_check" CHECK (
    ("voided_at" IS NULL) = ("voided_by" IS NULL) AND ("voided_by" IS NULL) = ("void_reason" IS NULL)
  )
);

CREATE INDEX "fund_transfers_society_idx" ON "fund_transfers"("society_id", "transfer_date" DESC);

-- Only the void fields ever change; deleting is refused except when the society goes.
CREATE FUNCTION "fund_transfers_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'fund_transfers rows are never deleted'
      USING ERRCODE = 'restrict_violation', HINT = 'Void the transfer instead.';
  END IF;
  IF (NEW."society_id", NEW."from_fund_id", NEW."from_account", NEW."to_fund_id", NEW."to_account", NEW."amount",
      NEW."transfer_date", NEW."memo", NEW."created_by", NEW."created_at")
     IS DISTINCT FROM
     (OLD."society_id", OLD."from_fund_id", OLD."from_account", OLD."to_fund_id", OLD."to_account", OLD."amount",
      OLD."transfer_date", OLD."memo", OLD."created_by", OLD."created_at")
     OR OLD."voided_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a fund transfer is only ever voided, once'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "fund_transfers_no_change"
  BEFORE UPDATE OR DELETE ON "fund_transfers"
  FOR EACH ROW EXECUTE FUNCTION "fund_transfers_guard"();

-- The audit log viewer filters by who and by what, newest first.
CREATE INDEX "audit_user_time_idx" ON "audit_logs"("society_id", "user_id", "created_at" DESC);
CREATE INDEX "audit_type_time_idx" ON "audit_logs"("society_id", "entity_type", "created_at" DESC);
