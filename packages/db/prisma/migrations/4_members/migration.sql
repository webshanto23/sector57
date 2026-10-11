-- Step 10: members (people, owners, renters and households).

-- When a person's record last changed.
ALTER TABLE "persons" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- Fuzzy search on English names and organisation names, like persons_name_trgm on Bangla names.
CREATE INDEX "persons_name_en_trgm" ON "persons" USING GIN ("full_name_en" gin_trgm_ops);
CREATE INDEX "organisations_name_trgm" ON "organisations" USING GIN ("name" gin_trgm_ops);

-- Relations are fixed keys (labels live in i18n), as committee positions are.
ALTER TABLE "occupants" ADD CONSTRAINT "occupants_relation_check" CHECK (
  relation IN ('head','spouse','child','parent','sibling','relative','co_renter','domestic_help','driver','other')
);

-- At most one open tenancy per unit. It replaces the plain index on the same rows.
DROP INDEX IF EXISTS "tenancies_unit_idx";
CREATE UNIQUE INDEX "tenancies_open_unit_uq" ON "tenancies"("unit_id")
  WHERE (status = ANY (ARRAY['pending'::text, 'active'::text, 'moving_out'::text]));
