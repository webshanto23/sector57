-- Step 37: combining units (3A + 4A into one duplex). The kept unit carries on; each retired
-- unit becomes inactive and records which unit it went into and when. Its bills, receipts
-- and documents stay with it as history.

ALTER TABLE "units"
  ADD COLUMN "merged_into" UUID REFERENCES "units"("location_id") ON DELETE NO ACTION,
  ADD COLUMN "merged_on" DATE,
  ADD CONSTRAINT "units_merged_not_self" CHECK ("merged_into" <> "location_id"),
  ADD CONSTRAINT "units_merged_both" CHECK (("merged_into" IS NULL) = ("merged_on" IS NULL));

CREATE INDEX "units_merged_into_idx" ON "units" ("merged_into") WHERE "merged_into" IS NOT NULL;
