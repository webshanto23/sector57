-- "Owner uses this": the owner uses the unit themselves with nobody living there, such as an
-- office. It counts as owner occupied and is cleared when the owner changes.
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "owner_uses" BOOLEAN NOT NULL DEFAULT false;
