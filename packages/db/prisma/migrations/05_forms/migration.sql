-- Steps 3 + 8: public membership and renter forms, the office review, and society memberships.

-- Form submissions: where they are about (area scope), a reference for the applicant,
-- the applicant's phone (duplicate and rate checks), and the review.
ALTER TABLE "form_submissions"
  ADD COLUMN "location_id" UUID REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "person_id" UUID REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- Rows from before this step (none in practice) get a reference from their id.
UPDATE "form_submissions" SET "reference" = upper(substr(replace(id::text, '-', ''), 1, 8)) WHERE "reference" IS NULL;
ALTER TABLE "form_submissions" ALTER COLUMN "reference" SET NOT NULL;

-- Form keys are fixed (labels live in i18n), like notice categories.
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_key_check" CHECK (
  form_key IN ('membership','renter_registration')
);

CREATE UNIQUE INDEX "form_submissions_reference_uq" ON "form_submissions"("society_id", "reference");
CREATE INDEX "form_submissions_queue_idx" ON "form_submissions"("society_id", "status", "submitted_at" DESC);
CREATE INDEX "form_submissions_phone_idx" ON "form_submissions"("society_id", "phone", "submitted_at" DESC);
CREATE INDEX "form_submissions_location_idx" ON "form_submissions"("location_id");

-- Registered members of the society ("Member" in docs/glossary.md): applied, approved, numbered.
CREATE TABLE "memberships" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "society_id"    UUID NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "person_id"     UUID NOT NULL REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- The property the membership was granted for (area scope); null for members added without one.
  "location_id"   UUID REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "member_no"     INTEGER NOT NULL CHECK ("member_no" > 0),
  "status"        TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','lapsed','cancelled')),
  "joined_on"     DATE NOT NULL,
  "ended_on"      DATE,
  "submission_id" UUID REFERENCES "form_submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_ended_check" CHECK ("ended_on" IS NULL OR "ended_on" >= "joined_on")
);
CREATE UNIQUE INDEX "memberships_member_no_uq" ON "memberships"("society_id", "member_no");
-- A person holds at most one active membership.
CREATE UNIQUE INDEX "memberships_active_person_uq" ON "memberships"("person_id") WHERE ("status" = 'active');
CREATE INDEX "memberships_location_idx" ON "memberships"("location_id");
