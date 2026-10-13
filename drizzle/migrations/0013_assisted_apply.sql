-- Assisted apply: reusable application profile and per-job form cache.
-- Apply in the Supabase SQL editor. Do not run this against production from CI.
--
-- application_profiles is one row per user. job_application_forms caches the
-- employer questions for a job the user owns. The anon key cannot read either
-- table. Authenticated queries still have to pass RLS.

CREATE TABLE IF NOT EXISTS application_profiles (
  user_id uuid PRIMARY KEY,
  legal_name text,
  email text,
  phone text,
  city text,
  province text,
  linkedin_url text,
  github_url text,
  portfolio_url text,
  work_authorization text NOT NULL DEFAULT 'Canadian citizen',
  requires_sponsorship boolean NOT NULL DEFAULT false,
  willing_to_relocate boolean NOT NULL DEFAULT false,
  earliest_start_date text,
  salary_expectation_cad integer,
  pronouns text,
  how_did_you_hear text,
  eeo_gender text NOT NULL DEFAULT 'Prefer not to say',
  eeo_race text NOT NULL DEFAULT 'Prefer not to say',
  eeo_veteran text NOT NULL DEFAULT 'Prefer not to say',
  eeo_disability text NOT NULL DEFAULT 'Prefer not to say',
  saved_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT application_profiles_work_authorization_check CHECK (
    char_length(work_authorization) BETWEEN 1 AND 200
  ),
  CONSTRAINT application_profiles_salary_check CHECK (
    salary_expectation_cad IS NULL
    OR (salary_expectation_cad >= 0 AND salary_expectation_cad <= 2000000)
  ),
  CONSTRAINT application_profiles_eeo_gender_check CHECK (char_length(eeo_gender) BETWEEN 1 AND 200),
  CONSTRAINT application_profiles_eeo_race_check CHECK (char_length(eeo_race) BETWEEN 1 AND 200),
  CONSTRAINT application_profiles_eeo_veteran_check CHECK (char_length(eeo_veteran) BETWEEN 1 AND 200),
  CONSTRAINT application_profiles_eeo_disability_check CHECK (char_length(eeo_disability) BETWEEN 1 AND 200),
  CONSTRAINT application_profiles_saved_answers_check CHECK (jsonb_typeof(saved_answers) = 'array'),
  CONSTRAINT application_profiles_email_check CHECK (
    email IS NULL OR email = '' OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  CONSTRAINT application_profiles_start_date_check CHECK (
    earliest_start_date IS NULL OR earliest_start_date ~ '^\d{4}-\d{2}-\d{2}$'
  )
);

ALTER TABLE application_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE application_profiles FROM PUBLIC;
REVOKE ALL ON TABLE application_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE application_profiles TO authenticated;

DROP POLICY IF EXISTS "Users own their application profile" ON application_profiles;
CREATE POLICY "Users own their application profile"
  ON application_profiles
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS job_application_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL,
  apply_url text,
  note text,
  fetch_error text,
  fetched_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT job_application_forms_provider_check CHECK (
    provider IN ('greenhouse', 'lever', 'ashby', 'workday', 'unknown')
  ),
  CONSTRAINT job_application_forms_source_check CHECK (source IN ('api', 'standard')),
  CONSTRAINT job_application_forms_questions_check CHECK (jsonb_typeof(questions) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS job_application_forms_user_job_unique
  ON job_application_forms (user_id, job_id);

ALTER TABLE job_application_forms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE job_application_forms FROM PUBLIC;
REVOKE ALL ON TABLE job_application_forms FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE job_application_forms TO authenticated;

DROP POLICY IF EXISTS "Users own their job application forms" ON job_application_forms;
CREATE POLICY "Users own their job application forms"
  ON job_application_forms
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND job_id IN (SELECT id FROM jobs WHERE user_id = (select auth.uid()))
  );

ALTER TABLE application_events ADD COLUMN IF NOT EXISTS payload jsonb;
