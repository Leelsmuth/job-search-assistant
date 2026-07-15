-- Performance indexes for job feed queries
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_date_discovered ON jobs(date_discovered DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_is_saved ON jobs(user_id, is_saved);
CREATE INDEX IF NOT EXISTS idx_match_analyses_job_id ON match_analyses(job_id);
CREATE INDEX IF NOT EXISTS idx_match_analyses_overall_score ON match_analyses(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_candidate_profiles_user_id ON candidate_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_input_hash ON ai_runs(input_hash);
