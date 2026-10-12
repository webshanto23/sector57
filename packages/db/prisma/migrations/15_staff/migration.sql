-- Step 22: staff and attendance. A staff member is a person plus a `staff` row for one stint
-- of work: leaving is dated, and someone who comes back gets a new row (and a new number).

CREATE TABLE "staff" (
  "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
  "society_id"         UUID          NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "person_id"          UUID          NOT NULL REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "staff_no"           INTEGER       NOT NULL CHECK ("staff_no" > 0),
  "designation_bn"     TEXT          NOT NULL,
  "designation_en"     TEXT,
  "kind"               TEXT          NOT NULL CHECK ("kind" IN ('permanent','contract','daily')),
  -- Where they work; a role limited to an area sees the staff posted inside it.
  "posted_location_id" UUID          NOT NULL REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "joined_on"          DATE          NOT NULL,
  "left_on"            DATE,
  "left_reason"        TEXT,
  "monthly_salary"     NUMERIC(14,2) CHECK ("monthly_salary" >= 0),
  "daily_rate"         NUMERIC(14,2) CHECK ("daily_rate" >= 0),
  "created_by"         UUID          REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "staff_pkey" PRIMARY KEY ("id"),
  -- Left says when and why, together, and never before joining.
  CONSTRAINT "staff_left_check" CHECK (("left_on" IS NULL) = ("left_reason" IS NULL) AND ("left_on" IS NULL OR "left_on" >= "joined_on")),
  -- Daily workers have a daily rate, everyone else a monthly salary (either may be left blank).
  CONSTRAINT "staff_pay_check" CHECK (CASE WHEN "kind" = 'daily' THEN "monthly_salary" IS NULL ELSE "daily_rate" IS NULL END)
);
CREATE UNIQUE INDEX "staff_no_uq" ON "staff"("society_id", "staff_no");
-- A person works at most one current stint.
CREATE UNIQUE INDEX "staff_current_person_uq" ON "staff"("person_id") WHERE "left_on" IS NULL;
CREATE INDEX "staff_society_idx" ON "staff"("society_id", "left_on");
CREATE INDEX "staff_posted_idx" ON "staff"("posted_location_id");

-- One row per staff member and day (Dhaka date). Times only for days they came in.
CREATE TABLE "attendance" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id" UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "staff_id"   UUID           NOT NULL REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "date"       DATE           NOT NULL,
  "status"     TEXT           NOT NULL CHECK ("status" IN ('present','absent','leave','half_day','off')),
  "in_time"    TIME(0),
  "out_time"   TIME(0),
  "note"       TEXT,
  "marked_by"  UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "marked_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_times_check" CHECK ("status" IN ('present','half_day') OR ("in_time" IS NULL AND "out_time" IS NULL))
);
CREATE UNIQUE INDEX "attendance_staff_date_uq" ON "attendance"("staff_id", "date");
CREATE INDEX "attendance_society_date_idx" ON "attendance"("society_id", "date");
