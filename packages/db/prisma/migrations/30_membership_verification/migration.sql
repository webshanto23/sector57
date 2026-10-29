-- Membership IDs only after verification (Anis, 2026-10-29). A membership is created (by the
-- office or by approving an application) without a member number; the number, and with it the
-- membership ID, is issued when its person or organisation is marked as verified. An issued ID
-- is kept when the verification is later removed.

-- Organisations can be verified like people.
ALTER TABLE "organisations" ADD COLUMN "verified_at" timestamptz;

ALTER TABLE "memberships" ALTER COLUMN "member_no" DROP NOT NULL;
ALTER TABLE "memberships" ALTER COLUMN "membership_code" DROP NOT NULL;

-- No number, no ID.
CREATE OR REPLACE FUNCTION memberships_set_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."member_no" IS NULL THEN
    NEW."membership_code" := NULL;
    RETURN NEW;
  END IF;
  SELECT s."code" || '-' || lpad(NEW."member_no"::text, greatest(6, length(NEW."member_no"::text)), '0')
    INTO NEW."membership_code"
    FROM "societies" s WHERE s."id" = NEW."society_id";
  RETURN NEW;
END $$;

-- Anis chose to take the IDs back from current members whose person or organisation isn't
-- verified (no organisation was, before this migration); they get one when verified. Ended
-- memberships keep theirs.
UPDATE "memberships" m SET "member_no" = NULL
WHERE m."status" = 'active'
  AND (m."organisation_id" IS NOT NULL
       OR NOT EXISTS (SELECT 1 FROM "persons" p WHERE p."id" = m."person_id" AND p."verified_at" IS NOT NULL));
