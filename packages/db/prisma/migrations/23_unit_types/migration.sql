-- Step 34: unit types are the society's own list, not a fixed set. A unit keeps its type as a
-- text code (`units.unit_type`), now pointing at `unit_types` of the same society; the five old
-- codes stay, so charge schedules (`unit_types text[]`) and existing units need no change.
-- New types get a generated code; only the names are shown.

CREATE TABLE "unit_types" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "society_id" UUID NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE,
  "code"       TEXT NOT NULL CHECK ("code" ~ '^[a-z0-9_]{1,40}$'),
  "name_bn"    TEXT NOT NULL,
  "name_en"    TEXT,
  "sort_order" SMALLINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "unit_types_society_id_code_key" UNIQUE ("society_id", "code"),
  CONSTRAINT "unit_types_society_id_name_bn_key" UNIQUE ("society_id", "name_bn")
);

-- Every society starts with the five types the app used to fix in code.
CREATE FUNCTION "unit_types_defaults"(society UUID) RETURNS void LANGUAGE sql AS $$
  INSERT INTO "unit_types" ("society_id", "code", "name_bn", "name_en", "sort_order") VALUES
    (society, 'residential', 'আবাসিক', 'Residential', 1),
    (society, 'shop',        'দোকান',  'Shop',        2),
    (society, 'office',      'অফিস',   'Office',      3),
    (society, 'warehouse',   'গুদাম',  'Warehouse',   4),
    (society, 'other',       'অন্যান্য', 'Other',       5)
  ON CONFLICT ("society_id", "code") DO NOTHING;
$$;

SELECT "unit_types_defaults"("id") FROM "societies";

CREATE FUNCTION "societies_unit_types"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "unit_types_defaults"(NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER "societies_unit_types" AFTER INSERT ON "societies"
  FOR EACH ROW EXECUTE FUNCTION "societies_unit_types"();

-- The fixed list goes; the society's own list takes over. A type in use can't be deleted (checked at the
-- end of the statement, so deleting a whole society still cascades).
ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "units_unit_type_check";
ALTER TABLE "units"
  ADD CONSTRAINT "units_society_id_unit_type_fkey" FOREIGN KEY ("society_id", "unit_type")
  REFERENCES "unit_types"("society_id", "code") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "units_society_id_unit_type_idx" ON "units"("society_id", "unit_type");
