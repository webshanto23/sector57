-- Step 15: donations.

-- A donation is always issued a receipt: a `payments` row with no unit and no allocations,
-- numbered and printed like any other. The receipt carries who took the cash, the donor as
-- on the day (`payer_snapshot`), the note and the void; the donation carries the fund and
-- the purpose, and its own `in` ledger row (the receipt writes none, so nothing counts twice).
ALTER TABLE "donations" ALTER COLUMN "payment_id" SET NOT NULL;

ALTER TABLE "donations"
  -- One receipt per donation.
  ADD CONSTRAINT "donations_payment_uq" UNIQUE ("payment_id"),
  -- A person, an organisation, or neither (anonymous).
  ADD CONSTRAINT "donations_donor_check" CHECK (num_nonnulls("donor_person_id", "donor_organisation_id") <= 1);

CREATE INDEX "donations_received_idx" ON "donations"("society_id", "received_at" DESC);
CREATE INDEX "donations_person_idx" ON "donations"("donor_person_id") WHERE "donor_person_id" IS NOT NULL;
CREATE INDEX "donations_organisation_idx" ON "donations"("donor_organisation_id") WHERE "donor_organisation_id" IS NOT NULL;
CREATE INDEX "donations_fund_idx" ON "donations"("fund_id");
