-- A vehicle can belong to an organisation (a company or shop that owns or rents the unit)
-- instead of a person, as a membership can.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "organisation_id" UUID REFERENCES "organisations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "vehicles" ALTER COLUMN "person_id" DROP NOT NULL;
ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_holder_check";
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_holder_check" CHECK (num_nonnulls("person_id", "organisation_id") = 1);
CREATE INDEX IF NOT EXISTS "vehicles_organisation_idx" ON "vehicles"("organisation_id") WHERE ("organisation_id" IS NOT NULL);
