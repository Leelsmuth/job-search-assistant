-- Performance pipeline: match queue status, indexes, poll runs, resume processing status

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS match_pipeline_status text DEFAULT 'matched';

UPDATE jobs SET match_pipeline_status = 'matched' WHERE match_pipeline_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_match_analyses_job_created
  ON match_analyses(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_user_job
  ON applications(user_id, job_id);

CREATE INDEX IF NOT EXISTS idx_jobs_user_match_pipeline
  ON jobs(user_id, match_pipeline_status)
  WHERE match_pipeline_status = 'match_pending';

ALTER TYPE parsed_resume_status ADD VALUE IF NOT EXISTS 'processing';

CREATE TABLE IF NOT EXISTS board_poll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  board_id uuid NOT NULL REFERENCES saved_boards(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  stats_json jsonb,
  error_text text,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_board_poll_runs_user_status
  ON board_poll_runs(user_id, status, created_at DESC);

ALTER TABLE board_poll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own board poll runs" ON board_poll_runs;
CREATE POLICY "Users own board poll runs" ON board_poll_runs
  FOR ALL USING (user_id = auth.uid());
