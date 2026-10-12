-- Step 21: the documents library. Society papers (minutes, circulars, licences) and files kept
-- with a person or a place get a title; nothing is deleted, a document is archived instead.
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "title"       TEXT,
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "archived_by" UUID REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Archived says when and by whom, together.
ALTER TABLE "documents" ADD CONSTRAINT "documents_archive_fields_check" CHECK (("archived_at" IS NULL) = ("archived_by" IS NULL));

CREATE INDEX "documents_society_entity_idx" ON "documents"("society_id", "entity_type", "uploaded_at" DESC);
