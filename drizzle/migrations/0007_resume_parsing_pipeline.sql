-- Resume parsing pipeline (Phase 1+)

DO $$ BEGIN
  ALTER TYPE evidence_source_type ADD VALUE IF NOT EXISTS 'certification';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE evidence_source_type ADD VALUE IF NOT EXISTS 'summary';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE parsed_resume_status AS ENUM (
  'pending_review',
  'approved',
  'rejected',
  'superseded',
  'failed'
);

ALTER TABLE resume_documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE resume_documents ADD COLUMN IF NOT EXISTS validation_warnings_json jsonb;
ALTER TABLE resume_documents ADD COLUMN IF NOT EXISTS latest_extraction_id uuid;

ALTER TABLE candidate_education ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE candidate_education ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE candidate_experience_bullets ADD COLUMN IF NOT EXISTS source_evidence_json jsonb;

CREATE TABLE IF NOT EXISTS candidate_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuer text,
  issued_date_text text,
  expiration_date_text text,
  credential_id text,
  credential_url text,
  source_evidence_json jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resume_document_id uuid NOT NULL REFERENCES resume_documents(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  extractor_version text NOT NULL,
  page_count integer,
  item_count integer,
  extracted_document_json jsonb NOT NULL,
  normalized_text text NOT NULL,
  normalization_version text NOT NULL,
  extraction_hash text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS parsed_resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resume_extraction_id uuid NOT NULL REFERENCES resume_extractions(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1,
  parser_version text NOT NULL,
  prompt_version text NOT NULL,
  model text,
  parsed_json jsonb NOT NULL,
  confidence_json jsonb,
  warnings_json jsonb,
  status parsed_resume_status NOT NULL DEFAULT 'pending_review',
  approved_at timestamptz,
  extraction_hash text NOT NULL,
  parse_duration_ms integer,
  token_usage_json jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_extractions_document
  ON resume_extractions(resume_document_id);

CREATE INDEX IF NOT EXISTS idx_parsed_resume_versions_user_hash
  ON parsed_resume_versions(user_id, extraction_hash, parser_version);

CREATE INDEX IF NOT EXISTS idx_parsed_resume_versions_extraction
  ON parsed_resume_versions(resume_extraction_id);

CREATE INDEX IF NOT EXISTS idx_candidate_certifications_profile
  ON candidate_certifications(profile_id);
