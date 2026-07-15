-- Phase 4: Q&A trust metadata + tailoring bullet traceability
ALTER TABLE application_answers
  ADD COLUMN IF NOT EXISTS unsupported_claims jsonb DEFAULT '[]'::jsonb;

ALTER TABLE tailoring_suggestions
  ADD COLUMN IF NOT EXISTS bullet_id uuid;
