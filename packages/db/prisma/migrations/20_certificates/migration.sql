-- Step 28: certificates and NOCs (সনদ ও অনাপত্তিপত্র). The office drafts a letter for a person
-- at a unit; issuing gives it a number (`CRT-YY-NNNN`, per fiscal year), freezes its text and
-- signer, and records what the unit owed then. An issued certificate is only ever voided; a
-- draft (no number, never printed) may be thrown away.

ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_kind_check";
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_kind_check" CHECK ("kind" IN ('invoice','receipt','voucher','asset','ticket','work_order','sticker','certificate'));

CREATE TABLE "certificates" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "society_id"   UUID           NOT NULL REFERENCES "societies"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  -- Drawn from `document_sequences` kind `certificate` when issued.
  "cert_no"      TEXT,
  "type"         TEXT           NOT NULL CHECK ("type" IN ('noc_sale','noc_rent','noc_utility','noc_renovation','noc_loan','residence','membership','no_dues')),
  -- The language the letter is written and printed in.
  "lang"         TEXT           NOT NULL DEFAULT 'bn' CHECK ("lang" IN ('bn','en')),
  -- Who it is for, and the unit it is about (scopes access).
  "person_id"    UUID           NOT NULL REFERENCES "persons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "unit_id"      UUID           NOT NULL REFERENCES "units"("location_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- e.g. "Manager, X Bank, Uttara branch"; printed under "To".
  "addressee"    TEXT,
  "purpose"      TEXT,
  "status"       TEXT           NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','issued','void')),
  -- Frozen at issue: the letter as printed, who signs it, and what the unit owed then.
  "body"         TEXT,
  "signer_name"  TEXT,
  "signer_title" TEXT,
  "dues_owed"    NUMERIC(14,2)  CHECK ("dues_owed" >= 0),
  "issued_at"    TIMESTAMPTZ(6),
  "issued_by"    UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "voided_at"    TIMESTAMPTZ(6),
  "voided_by"    UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "void_reason"  TEXT,
  "created_by"   UUID           REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "certificates_pkey" PRIMARY KEY ("id"),
  -- A draft has none of the issue fields; issued and void ones have all of them.
  CONSTRAINT "certificates_issued_check" CHECK (
    ("status" = 'draft') = ("cert_no" IS NULL)
    AND ("cert_no" IS NULL) = ("body" IS NULL)
    AND ("cert_no" IS NULL) = ("signer_name" IS NULL)
    AND ("cert_no" IS NULL) = ("dues_owed" IS NULL)
    AND ("cert_no" IS NULL) = ("issued_at" IS NULL)
  ),
  CONSTRAINT "certificates_void_check" CHECK (
    ("status" = 'void') = ("voided_at" IS NOT NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL)
  )
);
CREATE UNIQUE INDEX "certificates_no_uq" ON "certificates"("society_id", "cert_no") WHERE "cert_no" IS NOT NULL;
CREATE INDEX "certificates_society_idx" ON "certificates"("society_id", "status", "created_at" DESC);
CREATE INDEX "certificates_unit_idx" ON "certificates"("unit_id");
CREATE INDEX "certificates_person_idx" ON "certificates"("person_id");

-- Drafts change freely and may be deleted. Issuing is the one way out of a draft; after that
-- only the void fields may be set, once. As for the ledger, a cascade (removing a whole society)
-- runs inside a foreign key's trigger, so the depth is above 1.
CREATE FUNCTION "certificates_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'draft' OR pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'issued certificates are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."society_id" <> NEW."society_id" THEN
    RAISE EXCEPTION 'a certificate keeps its society' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'draft' THEN
    IF NEW."status" NOT IN ('draft','issued') THEN
      RAISE EXCEPTION 'a draft certificate is issued before it is voided' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'void' THEN
    RAISE EXCEPTION 'a void certificate never changes' USING ERRCODE = 'check_violation';
  END IF;
  -- Issued: only the void.
  IF NEW."status" <> 'void'
    OR (to_jsonb(NEW) - ARRAY['status','voided_at','voided_by','void_reason','updated_at'])
       <> (to_jsonb(OLD) - ARRAY['status','voided_at','voided_by','void_reason','updated_at']) THEN
    RAISE EXCEPTION 'an issued certificate can only be voided' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "certificates_guard" BEFORE UPDATE OR DELETE ON "certificates"
  FOR EACH ROW EXECUTE FUNCTION "certificates_guard"();
