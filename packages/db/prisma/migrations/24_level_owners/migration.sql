-- Step 36: which levels of the tree can have owners (plots, buildings, units), so the map
-- shows "Plot owner: ..." only there and never on sectors, blocks or roads. A society sets
-- it per level in Settings > Levels.

ALTER TABLE "location_levels" ADD COLUMN "can_own" BOOLEAN NOT NULL DEFAULT false;

-- Existing societies: the unit level, and every level that already has an owner recorded.
UPDATE "location_levels" lv
SET "can_own" = true
WHERE lv."is_unit_level"
   OR EXISTS (
     SELECT 1 FROM "ownerships" o JOIN "locations" l ON l."id" = o."location_id"
     WHERE l."level_id" = lv."id"
   );
