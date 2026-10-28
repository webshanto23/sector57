-- Step 37: a unit can cover several storeys (a duplex, an office over three floors). The unit
-- lives at its lowest storey as before; each other storey it covers is a row here. Owners,
-- renters and bills stay on the one unit. A covered storey can't be deleted while linked.

CREATE TABLE "unit_storeys" (
  "unit_id"    UUID NOT NULL REFERENCES "units"("location_id") ON DELETE CASCADE,
  "storey_id"  UUID NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION,
  "society_id" UUID NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "unit_storeys_pkey" PRIMARY KEY ("unit_id", "storey_id"),
  CONSTRAINT "unit_storeys_not_self" CHECK ("unit_id" <> "storey_id")
);

CREATE INDEX "unit_storeys_storey_idx" ON "unit_storeys" ("storey_id");
