-- Membership IDs (Anis, 2026-10-28). Every membership gets an ID that is unique across all
-- societies: the society's short code, a dash and the member number padded to six digits
-- (S15-000042). Triggers fill both, so every insert path (approval, the office's "Add member",
-- seeds and tests) gets them without passing them in.

-- A society's short code: uppercase letters and digits. Defaults to its slug without
-- punctuation; set it on purpose before the first member is added, since issued IDs keep it.
ALTER TABLE "societies" ADD COLUMN "code" text;

CREATE FUNCTION societies_default_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."code" IS NULL THEN
    NEW."code" := upper(regexp_replace(NEW."slug", '[^A-Za-z0-9]', '', 'g'));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER societies_default_code BEFORE INSERT ON "societies"
  FOR EACH ROW EXECUTE FUNCTION societies_default_code();

UPDATE "societies" SET "code" = upper(regexp_replace("slug", '[^A-Za-z0-9]', '', 'g'));
ALTER TABLE "societies" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "societies" ADD CONSTRAINT "societies_code_ck" CHECK ("code" ~ '^[A-Z0-9]{2,64}$');
CREATE UNIQUE INDEX "societies_code_uq" ON "societies" ("code");

-- The membership's global ID, kept in step with its society code and member number.
ALTER TABLE "memberships" ADD COLUMN "membership_code" text;

CREATE FUNCTION memberships_set_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT s."code" || '-' || lpad(NEW."member_no"::text, greatest(6, length(NEW."member_no"::text)), '0')
    INTO NEW."membership_code"
    FROM "societies" s WHERE s."id" = NEW."society_id";
  RETURN NEW;
END $$;

CREATE TRIGGER memberships_set_code BEFORE INSERT OR UPDATE OF "member_no", "society_id" ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION memberships_set_code();

UPDATE "memberships" m
SET "membership_code" = s."code" || '-' || lpad(m."member_no"::text, greatest(6, length(m."member_no"::text)), '0')
FROM "societies" s WHERE s."id" = m."society_id";
ALTER TABLE "memberships" ALTER COLUMN "membership_code" SET NOT NULL;
CREATE UNIQUE INDEX "memberships_membership_code_uq" ON "memberships" ("membership_code");
