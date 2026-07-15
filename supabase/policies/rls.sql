-- Row Level Security policies for multi-tenant isolation
-- Apply after migrations: psql $DATABASE_URL -f supabase/policies/rls.sql

-- Enable RLS on all user-owned tables
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_experience_bullets ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_category_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirement_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailoring_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_boards ENABLE ROW LEVEL SECURITY;

-- candidate_profiles
CREATE POLICY "Users own their profiles" ON candidate_profiles
  FOR ALL USING (auth.uid() = user_id);

-- candidate_skills (via profile)
CREATE POLICY "Users own their skills" ON candidate_skills
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );

-- candidate_experiences
CREATE POLICY "Users own their experiences" ON candidate_experiences
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );

-- candidate_experience_bullets
CREATE POLICY "Users own their bullets" ON candidate_experience_bullets
  FOR ALL USING (
    experience_id IN (
      SELECT e.id FROM candidate_experiences e
      JOIN candidate_profiles p ON e.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

-- candidate_projects
CREATE POLICY "Users own their projects" ON candidate_projects
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );

-- candidate_education
CREATE POLICY "Users own their education" ON candidate_education
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );

-- resume_documents
CREATE POLICY "Users own their resumes" ON resume_documents
  FOR ALL USING (auth.uid() = user_id);

-- resume_versions
CREATE POLICY "Users own their resume versions" ON resume_versions
  FOR ALL USING (auth.uid() = user_id);

-- profile_evidence
CREATE POLICY "Users own their evidence" ON profile_evidence
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );

-- jobs
CREATE POLICY "Users own their jobs" ON jobs
  FOR ALL USING (auth.uid() = user_id);

-- job_requirements
CREATE POLICY "Users own their job requirements" ON job_requirements
  FOR ALL USING (
    job_id IN (SELECT id FROM jobs WHERE user_id = auth.uid())
  );

-- match_analyses
CREATE POLICY "Users own their match analyses" ON match_analyses
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );

-- match_category_scores
CREATE POLICY "Users own their category scores" ON match_category_scores
  FOR ALL USING (
    match_analysis_id IN (
      SELECT ma.id FROM match_analyses ma
      JOIN candidate_profiles p ON ma.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

-- requirement_matches
CREATE POLICY "Users own their requirement matches" ON requirement_matches
  FOR ALL USING (
    match_analysis_id IN (
      SELECT ma.id FROM match_analyses ma
      JOIN candidate_profiles p ON ma.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

-- applications
CREATE POLICY "Users own their applications" ON applications
  FOR ALL USING (auth.uid() = user_id);

-- application_events
CREATE POLICY "Users own their application events" ON application_events
  FOR ALL USING (
    application_id IN (SELECT id FROM applications WHERE user_id = auth.uid())
  );

-- application_answers
CREATE POLICY "Users own their application answers" ON application_answers
  FOR ALL USING (
    application_id IN (SELECT id FROM applications WHERE user_id = auth.uid())
  );

-- tailoring_suggestions
CREATE POLICY "Users own their tailoring suggestions" ON tailoring_suggestions
  FOR ALL USING (
    profile_id IN (SELECT id FROM candidate_profiles WHERE user_id = auth.uid())
  );

-- ai_runs
CREATE POLICY "Users own their ai runs" ON ai_runs
  FOR ALL USING (auth.uid() = user_id);

-- saved_boards
CREATE POLICY "Users own their saved boards" ON saved_boards
  FOR ALL USING (auth.uid() = user_id);

-- companies table is shared reference data (no RLS needed for MVP)
-- job_sources can be shared (no user_id)
