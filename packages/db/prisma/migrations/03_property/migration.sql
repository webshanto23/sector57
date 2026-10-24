-- Step 9: property (location tree and units).

-- Natural order for location names: "Road 2" before "Road 10", in Bangla or ASCII digits.
-- ICU numeric collation, deterministic, so the unique indexes on name keep working.
CREATE COLLATION IF NOT EXISTS natural_sort (provider = icu, locale = 'und-u-kn');
ALTER TABLE locations ALTER COLUMN name TYPE text COLLATE natural_sort;

-- A path is one location's identity in the tree; never two rows with the same one.
CREATE UNIQUE INDEX "locations_path_uq" ON "locations"("society_id", "path");

-- unique (society_id, parent_id, name) treats every null parent as distinct,
-- so top-level names need their own unique index.
CREATE UNIQUE INDEX "locations_root_name_uq" ON "locations"("society_id", "name") WHERE (parent_id IS NULL);

-- Holding numbers are unique within a society when given.
CREATE UNIQUE INDEX "locations_code_uq" ON "locations"("society_id", "code") WHERE (code IS NOT NULL);

-- Fuzzy search on unit and location names (Bangla and English).
CREATE INDEX "locations_name_trgm" ON "locations" USING GIN ("name" gin_trgm_ops);
