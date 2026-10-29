-- An application the office typed in from the dashboard (Anis, 2026-10-29) records the user who
-- entered it; null for one sent from the public website.
ALTER TABLE "form_submissions" ADD COLUMN "entered_by" UUID;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_entered_by_fkey"
  FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
