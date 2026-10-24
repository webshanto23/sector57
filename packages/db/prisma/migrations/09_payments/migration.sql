-- Step 14: cash collection, receipts and handover.

-- A collector's cash handed to the treasurer. Made by the collector for all their open
-- payments; confirmed by someone else, who types what they counted. `amount_expected` is
-- frozen when confirmed (until then it is the sum of the handover's payments not voided).
CREATE TABLE "cash_handovers" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "society_id"      UUID NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "collector_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "payment_count"   INTEGER NOT NULL CHECK ("payment_count" > 0),
  "amount_expected" NUMERIC(14,2) CHECK ("amount_expected" >= 0),
  "amount_counted"  NUMERIC(14,2) CHECK ("amount_counted" >= 0),
  "note"            TEXT,
  "confirmed_by"    UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "confirmed_at"    TIMESTAMPTZ(6),
  CONSTRAINT "cash_handovers_pkey" PRIMARY KEY ("id"),
  -- Nobody confirms their own cash.
  CONSTRAINT "cash_handovers_not_own_check" CHECK ("confirmed_by" IS NULL OR "confirmed_by" <> "collector_id"),
  -- Confirmed means counted, by whom and when; a pending handover has none of these.
  CONSTRAINT "cash_handovers_confirm_check" CHECK (
    ("confirmed_at" IS NULL AND "confirmed_by" IS NULL AND "amount_counted" IS NULL AND "amount_expected" IS NULL)
    OR ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL AND "amount_counted" IS NOT NULL AND "amount_expected" IS NOT NULL)
  )
);
CREATE INDEX "cash_handovers_society_idx" ON "cash_handovers"("society_id", "created_at" DESC);
CREATE INDEX "cash_handovers_pending_idx" ON "cash_handovers"("society_id") WHERE "confirmed_at" IS NULL;

-- Payments: the unit they were taken for (none for a membership fee), who paid and for
-- what as on the day, a note, how a void happened, which handover took the cash, and how
-- often the receipt was printed (a reprint says "Duplicate").
ALTER TABLE "payments"
  ADD COLUMN "unit_id"        UUID REFERENCES "units"("location_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "payer_snapshot" JSONB,
  ADD COLUMN "note"           TEXT,
  ADD COLUMN "voided_at"      TIMESTAMPTZ(6),
  ADD COLUMN "voided_by"      UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "handover_id"    UUID REFERENCES "cash_handovers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "print_count"    INTEGER NOT NULL DEFAULT 0 CHECK ("print_count" >= 0);

ALTER TABLE "payments"
  -- At most one payer; a donation (Step 15) may be anonymous.
  ADD CONSTRAINT "payments_payer_check" CHECK (num_nonnulls("payer_person_id", "payer_organisation_id") <= 1),
  -- A void payment says why, when and by whom; nothing else carries those.
  ADD CONSTRAINT "payments_void_check" CHECK (
    ("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
    OR ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND "void_reason" IS NOT NULL)
  );

-- Cash in hand: a collector's payments not yet handed over.
CREATE INDEX "payments_in_hand_idx" ON "payments"("society_id", "received_by") WHERE "handover_id" IS NULL AND "voided_at" IS NULL;
CREATE INDEX "payments_received_idx" ON "payments"("society_id", "received_at" DESC);
CREATE INDEX "payments_unit_idx" ON "payments"("unit_id") WHERE "unit_id" IS NOT NULL;
CREATE INDEX "payments_person_idx" ON "payments"("payer_person_id") WHERE "payer_person_id" IS NOT NULL;
CREATE INDEX "payments_handover_idx" ON "payments"("handover_id") WHERE "handover_id" IS NOT NULL;
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations"("invoice_id");
