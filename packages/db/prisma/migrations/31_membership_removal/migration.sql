-- Removing a member who has no membership ID yet (Anis, 2026-10-29). Their voided membership
-- fee bills stay (financial rows are never deleted) but no longer point at the membership; the
-- bill's snapshot still names who it was for. Open and paid membership bills keep the link.
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_kind_fields_check";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_kind_fields_check" CHECK (
  CASE WHEN "kind" = 'membership' THEN ("membership_id" IS NOT NULL OR "status" = 'void') AND "unit_id" IS NULL
       ELSE "membership_id" IS NULL AND "unit_id" IS NOT NULL END
);
