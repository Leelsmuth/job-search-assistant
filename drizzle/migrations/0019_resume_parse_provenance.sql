-- Resume parse provenance. Apply this migration before merging.
-- It is not applied by this pull request.

DO $$ BEGIN
  ALTER TYPE evidence_source_type ADD VALUE IF NOT EXISTS 'skill';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE profile_evidence
  ADD COLUMN IF NOT EXISTS provenance_json jsonb;
