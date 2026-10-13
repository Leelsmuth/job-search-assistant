-- Per-job tailored resumes and cover letters.
-- Apply in the Supabase SQL editor. Do not run this against production from CI.
--
-- Tailored resumes are resume_versions rows linked to a job. Cover letters are
-- stored separately, one or more per job, and both stay behind RLS. The anon
-- key cannot read cover_letters. Authenticated queries still have to pass
-- (select auth.uid()) = user_id, and writes must point at the caller's job
-- and profile.

ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS content_json jsonb;
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS generation_mode text;
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS unsupported_claims jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE resume_versions DROP CONSTRAINT IF EXISTS resume_versions_generation_mode_check;
ALTER TABLE resume_versions ADD CONSTRAINT resume_versions_generation_mode_check CHECK (
  generation_mode IS NULL OR generation_mode IN ('deterministic', 'llm')
);

CREATE INDEX IF NOT EXISTS idx_resume_versions_user_job
  ON resume_versions (user_id, job_id);

DROP POLICY IF EXISTS "Users own their resume versions" ON resume_versions;
CREATE POLICY "Users own their resume versions"
  ON resume_versions
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      job_id IS NULL
      OR job_id IN (SELECT id FROM jobs WHERE user_id = (select auth.uid()))
    )
  );

CREATE TABLE IF NOT EXISTS cover_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  generation_mode text NOT NULL,
  unsupported_claims jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  word_count integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cover_letters_generation_mode_check CHECK (
    generation_mode IN ('llm', 'template')
  ),
  CONSTRAINT cover_letters_body_length_check CHECK (
    char_length(body) BETWEEN 1 AND 20000
  ),
  CONSTRAINT cover_letters_word_count_check CHECK (
    word_count IS NULL OR word_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_user_job
  ON cover_letters (user_id, job_id, created_at DESC);

ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE cover_letters FROM PUBLIC;
REVOKE ALL ON TABLE cover_letters FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cover_letters TO authenticated;

DROP POLICY IF EXISTS "Users own their cover letters" ON cover_letters;
CREATE POLICY "Users own their cover letters"
  ON cover_letters
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND job_id IN (SELECT id FROM jobs WHERE user_id = (select auth.uid()))
    AND profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );
