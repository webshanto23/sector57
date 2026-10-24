-- Step 11: finance setup. Numbering, funds that can close, retired charge types,
-- and a ledger that only grows.

-- Gap-free numbers for invoices, receipts and expense vouchers. One row per kind and
-- period ('2610' for invoices of October 2026, '' for receipts, '26' for vouchers of
-- the fiscal year 2026-27). The API increments it inside the transaction that saves
-- the record, so the row stays locked until commit and a rollback gives the number back.
CREATE TABLE "document_sequences" (
  "society_id" UUID NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "kind"       TEXT NOT NULL CHECK ("kind" IN ('invoice','receipt','voucher')),
  "period"     TEXT NOT NULL,
  "next_no"    INTEGER NOT NULL DEFAULT 1 CHECK ("next_no" > 0),
  CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("society_id", "kind", "period")
);

-- Funds are never deleted, only closed (with a zero balance).
ALTER TABLE "funds"
  ADD COLUMN "closed_at"  TIMESTAMPTZ(6),
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();
CREATE UNIQUE INDEX "funds_one_default_uq" ON "funds"("society_id") WHERE "is_default";

-- A charge type that bills have used can't be deleted; it is retired instead.
ALTER TABLE "charge_types" ADD COLUMN "archived_at" TIMESTAMPTZ(6);

-- Ledger: opening balances, where the money sits (cash box or bank), who wrote the
-- row, and which row a correction reverses.
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_source_type_check";
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_type_check" CHECK (
  "source_type" IN ('opening','payment','donation','expense','transfer','adjustment')
);
ALTER TABLE "ledger_entries"
  ADD COLUMN "account"     TEXT NOT NULL DEFAULT 'cash' CHECK ("account" IN ('cash','bank')),
  ADD COLUMN "created_by"  UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "reverses_id" BIGINT REFERENCES "ledger_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
-- A row is reversed at most once.
CREATE UNIQUE INDEX "ledger_reverses_uq" ON "ledger_entries"("reverses_id") WHERE "reverses_id" IS NOT NULL;
CREATE INDEX "ledger_source_idx" ON "ledger_entries"("source_type", "source_id");

-- The ledger is append-only: a mistake is corrected with a reversing row, never by
-- changing or removing one. The only delete allowed is the cascade from removing a
-- whole society (it runs inside the foreign key's trigger, so the depth is above 1).
CREATE FUNCTION "ledger_entries_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ledger_entries is append-only (% refused)', TG_OP
    USING ERRCODE = 'restrict_violation', HINT = 'Write a reversing entry instead.';
END;
$$;

CREATE TRIGGER "ledger_entries_no_update_delete"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "ledger_entries_append_only"();

CREATE TRIGGER "ledger_entries_no_truncate"
  BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "ledger_entries_append_only"();
