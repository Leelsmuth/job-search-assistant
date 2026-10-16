-- Per-job resume ATS scores and cached rewrite suggestions.
-- Apply this migration in the Supabase SQL editor BEFORE merging.
-- This pull request does not apply it.
--
-- resume_job_scores is per user. anon has no access. authenticated rows match
-- (select auth.uid()) = user_id, including SELECT so UPDATE can see the row.

CREATE TABLE IF NOT EXISTS resume_job_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resume_version_id uuid REFERENCES resume_versions(id) ON DELETE SET NULL,
  resume_document_id uuid REFERENCES resume_documents(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'parsed',
  resume_hash text NOT NULL,
  job_hash text NOT NULL,
  overall_score real NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  keywords jsonb NOT NULL DEFAULT '{}'::jsonb,
  ats_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb,
  before_score real,
  after_score real,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT resume_job_scores_source_check CHECK (source IN ('parsed', 'tailored')),
  CONSTRAINT resume_job_scores_overall_check CHECK (overall_score >= 0 AND overall_score <= 100),
  CONSTRAINT resume_job_scores_before_check CHECK (
    before_score IS NULL OR (before_score >= 0 AND before_score <= 100)
  ),
  CONSTRAINT resume_job_scores_after_check CHECK (
    after_score IS NULL OR (after_score >= 0 AND after_score <= 100)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS resume_job_scores_user_job_resume_unique
  ON resume_job_scores (user_id, job_id, resume_hash);

CREATE INDEX IF NOT EXISTS idx_resume_job_scores_user_job
  ON resume_job_scores (user_id, job_id, updated_at DESC);

ALTER TABLE resume_job_scores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE resume_job_scores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE resume_job_scores TO authenticated;

DROP POLICY IF EXISTS "Users own their resume job scores" ON resume_job_scores;
CREATE POLICY "Users own their resume job scores"
  ON resume_job_scores
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
