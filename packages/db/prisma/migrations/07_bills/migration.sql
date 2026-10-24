-- Step 12: bills (invoices) and opening arrears.

-- What a bill is: a regular charge, dues from before the system ("opening"), or a
-- membership fee billed to a person with no unit. The fund every line pays into, who
-- and where it was billed to on the day, and how it was voided.
ALTER TABLE "invoices"
  ADD COLUMN "kind"             TEXT NOT NULL DEFAULT 'regular' CHECK ("kind" IN ('regular','opening','membership')),
  ADD COLUMN "fund_id"          UUID REFERENCES "funds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "membership_id"    UUID REFERENCES "memberships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "bill_to_snapshot" JSONB,
  ADD COLUMN "void_reason"      TEXT,
  ADD COLUMN "voided_at"        TIMESTAMPTZ(6),
  ADD COLUMN "voided_by"        UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Bills made before this step (none in practice) belong to the society's default fund.
UPDATE "invoices" i SET "fund_id" = f."id"
  FROM "funds" f WHERE f."society_id" = i."society_id" AND f."is_default" AND i."fund_id" IS NULL;
ALTER TABLE "invoices" ALTER COLUMN "fund_id" SET NOT NULL;

ALTER TABLE "invoices"
  -- Every bill has exactly one payer: a person or an organisation.
  ADD CONSTRAINT "invoices_bill_to_check" CHECK (num_nonnulls("bill_to_person_id", "bill_to_organisation_id") = 1),
  -- A membership fee points at the membership and no unit; every other bill is for a unit.
  ADD CONSTRAINT "invoices_kind_fields_check" CHECK (
    CASE WHEN "kind" = 'membership' THEN "membership_id" IS NOT NULL AND "unit_id" IS NULL
         ELSE "membership_id" IS NULL AND "unit_id" IS NOT NULL END
  ),
  -- A void bill says why, when and by whom; nothing else carries those.
  ADD CONSTRAINT "invoices_void_check" CHECK (
    ("status" = 'void') = ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL AND "voided_by" IS NOT NULL)
  );

-- Earlier dues are entered once per unit; a wrong entry is voided and typed again.
CREATE UNIQUE INDEX "invoices_one_opening_uq" ON "invoices"("unit_id") WHERE "kind" = 'opening' AND "status" <> 'void';
CREATE INDEX "invoices_issue_idx" ON "invoices"("society_id", "issue_date");
CREATE INDEX "invoices_person_idx" ON "invoices"("bill_to_person_id") WHERE "bill_to_person_id" IS NOT NULL;
CREATE INDEX "invoices_organisation_idx" ON "invoices"("bill_to_organisation_id") WHERE "bill_to_organisation_id" IS NOT NULL;
CREATE INDEX "invoices_membership_idx" ON "invoices"("membership_id") WHERE "membership_id" IS NOT NULL;

-- Bill lines in English as well (`description` stays the Bangla text), and their order on the bill.
ALTER TABLE "invoice_lines"
  ADD COLUMN "description_en" TEXT,
  ADD COLUMN "position"       SMALLINT NOT NULL DEFAULT 0;
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines"("invoice_id");
