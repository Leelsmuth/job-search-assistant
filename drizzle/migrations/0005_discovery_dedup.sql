-- Discovery V1: dedupe discovered jobs per user by ATS source job id
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_user_source_job
  ON jobs(user_id, source_job_id)
  WHERE source_job_id IS NOT NULL;
