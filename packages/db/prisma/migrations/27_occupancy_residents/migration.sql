-- Occupancy follows residents, not ownership (Anis, 2026-10-28). A unit is owner-occupied only
-- while someone of the owner's household (a resident with no tenancy, such as an owner marked
-- "Lives here") lives there; an owner on a plot no longer marks every flat below it. Rented
-- still wins. Recomputes every unit once with the rule `OccupancyService.refresh` now uses.

UPDATE "units" u
SET "occupancy" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "tenancies" t
    WHERE t."unit_id" = u."location_id" AND t."society_id" = u."society_id" AND t."status" IN ('active', 'moving_out')
  ) THEN 'rented'
  WHEN EXISTS (
    SELECT 1 FROM "occupants" oc
    WHERE oc."unit_id" = u."location_id" AND oc."society_id" = u."society_id" AND oc."end_date" IS NULL AND oc."tenancy_id" IS NULL
  ) THEN 'owner_occupied'
  ELSE 'vacant'
END;
