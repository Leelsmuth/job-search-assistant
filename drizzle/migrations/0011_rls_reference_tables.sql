-- RLS for shared reference tables, and initplan-friendly uid checks.
-- Apply in the Supabase SQL editor. Do not rely on the dashboard to infer policies.
--
-- companies and job_sources have no user_id. Server actions and the discovery cron
-- read and insert them after SET LOCAL ROLE authenticated (see src/db/user-context.ts),
-- including job-feed joins and persistDiscoveredJob ... RETURNING. The anon role
-- gets no grants and no policies, so the public API key cannot read them.
--
-- company_job_sources is a server-only catalog. loadCompanyRegistry uses the
-- database owner connection, which bypasses RLS. API roles are denied.
--
-- Manual follow-up, not SQL: turn on leaked-password protection in
-- Supabase Dashboard → Authentication → Settings.

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_job_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE companies FROM anon;
REVOKE ALL ON TABLE job_sources FROM anon;
REVOKE ALL ON TABLE company_job_sources FROM anon, authenticated;

GRANT SELECT, INSERT ON TABLE companies TO authenticated;
GRANT SELECT, INSERT ON TABLE job_sources TO authenticated;

DROP POLICY IF EXISTS "Authenticated read companies" ON companies;
CREATE POLICY "Authenticated read companies"
  ON companies
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated insert companies" ON companies;
CREATE POLICY "Authenticated insert companies"
  ON companies
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated read job sources" ON job_sources;
CREATE POLICY "Authenticated read job sources"
  ON job_sources
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated insert job sources" ON job_sources;
CREATE POLICY "Authenticated insert job sources"
  ON job_sources
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "No API access to company job sources" ON company_job_sources;
CREATE POLICY "No API access to company job sources"
  ON company_job_sources
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Recreate existing policies so the uid helper is planned once per statement.
-- Safe: the helper does not depend on the current row.

DROP POLICY IF EXISTS "Users own their profiles" ON candidate_profiles;
CREATE POLICY "Users own their profiles" ON candidate_profiles
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their skills" ON candidate_skills;
CREATE POLICY "Users own their skills" ON candidate_skills
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their experiences" ON candidate_experiences;
CREATE POLICY "Users own their experiences" ON candidate_experiences
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their bullets" ON candidate_experience_bullets;
CREATE POLICY "Users own their bullets" ON candidate_experience_bullets
  FOR ALL
  TO authenticated
  USING (
    experience_id IN (
      SELECT e.id FROM candidate_experiences e
      JOIN candidate_profiles p ON e.profile_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    experience_id IN (
      SELECT e.id FROM candidate_experiences e
      JOIN candidate_profiles p ON e.profile_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users own their projects" ON candidate_projects;
CREATE POLICY "Users own their projects" ON candidate_projects
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their education" ON candidate_education;
CREATE POLICY "Users own their education" ON candidate_education
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their resumes" ON resume_documents;
CREATE POLICY "Users own their resumes" ON resume_documents
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their resume versions" ON resume_versions;
CREATE POLICY "Users own their resume versions" ON resume_versions
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their evidence" ON profile_evidence;
CREATE POLICY "Users own their evidence" ON profile_evidence
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their jobs" ON jobs;
CREATE POLICY "Users own their jobs" ON jobs
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their job requirements" ON job_requirements;
CREATE POLICY "Users own their job requirements" ON job_requirements
  FOR ALL
  TO authenticated
  USING (
    job_id IN (SELECT id FROM jobs WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    job_id IN (SELECT id FROM jobs WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their match analyses" ON match_analyses;
CREATE POLICY "Users own their match analyses" ON match_analyses
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their category scores" ON match_category_scores;
CREATE POLICY "Users own their category scores" ON match_category_scores
  FOR ALL
  TO authenticated
  USING (
    match_analysis_id IN (
      SELECT ma.id FROM match_analyses ma
      JOIN candidate_profiles p ON ma.profile_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    match_analysis_id IN (
      SELECT ma.id FROM match_analyses ma
      JOIN candidate_profiles p ON ma.profile_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users own their requirement matches" ON requirement_matches;
CREATE POLICY "Users own their requirement matches" ON requirement_matches
  FOR ALL
  TO authenticated
  USING (
    match_analysis_id IN (
      SELECT ma.id FROM match_analyses ma
      JOIN candidate_profiles p ON ma.profile_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    match_analysis_id IN (
      SELECT ma.id FROM match_analyses ma
      JOIN candidate_profiles p ON ma.profile_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users own their applications" ON applications;
CREATE POLICY "Users own their applications" ON applications
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their application events" ON application_events;
CREATE POLICY "Users own their application events" ON application_events
  FOR ALL
  TO authenticated
  USING (
    application_id IN (SELECT id FROM applications WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    application_id IN (SELECT id FROM applications WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their application answers" ON application_answers;
CREATE POLICY "Users own their application answers" ON application_answers
  FOR ALL
  TO authenticated
  USING (
    application_id IN (SELECT id FROM applications WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    application_id IN (SELECT id FROM applications WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their tailoring suggestions" ON tailoring_suggestions;
CREATE POLICY "Users own their tailoring suggestions" ON tailoring_suggestions
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own their ai runs" ON ai_runs;
CREATE POLICY "Users own their ai runs" ON ai_runs
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their saved boards" ON saved_boards;
CREATE POLICY "Users own their saved boards" ON saved_boards
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their resume extractions" ON resume_extractions;
CREATE POLICY "Users own their resume extractions" ON resume_extractions
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their parsed resume versions" ON parsed_resume_versions;
CREATE POLICY "Users own their parsed resume versions" ON parsed_resume_versions
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users own their certifications" ON candidate_certifications;
CREATE POLICY "Users own their certifications" ON candidate_certifications
  FOR ALL
  TO authenticated
  USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Users own board poll runs" ON board_poll_runs;
CREATE POLICY "Users own board poll runs" ON board_poll_runs
  FOR ALL
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users upload own resumes" ON storage.objects;
CREATE POLICY "Users upload own resumes"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users read own resumes" ON storage.objects;
CREATE POLICY "Users read own resumes"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users delete own resumes" ON storage.objects;
CREATE POLICY "Users delete own resumes"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
