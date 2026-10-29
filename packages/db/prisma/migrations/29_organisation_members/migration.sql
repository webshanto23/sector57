-- Organisations can be members too: a membership belongs to a person or an organisation,
-- numbered in the same sequence and given a membership ID the same way.
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "organisation_id" UUID REFERENCES "organisations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "memberships" ALTER COLUMN "person_id" DROP NOT NULL;
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_party_check";
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_party_check" CHECK (num_nonnulls("person_id", "organisation_id") = 1);
-- An organisation holds at most one active membership, as a person does.
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_active_organisation_uq" ON "memberships"("organisation_id") WHERE ("status" = 'active');
