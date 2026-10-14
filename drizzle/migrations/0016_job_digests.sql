-- Daily job digest snapshots and the email toggle.
-- Apply in the Supabase SQL editor. Do not run this against production from CI.
--
-- The toggle and send cursor live on search_preferences, which already has
-- owner-scoped RLS (0011: "Users own their search preferences").
-- job_digests stores the latest morning snapshot for /digest. The anon key
-- cannot read it. Authenticated queries still have to pass RLS.

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS digest_emails_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS digest_last_sent_at timestamp;

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS digest_last_generated_at timestamp;

CREATE TABLE IF NOT EXISTS job_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  generated_at timestamp NOT NULL DEFAULT now(),
  window_start timestamp NOT NULL,
  window_end timestamp NOT NULL,
  emailed_at timestamp,
  skip_reason text,
  subject text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT job_digests_skip_reason_check CHECK (
    skip_reason IS NULL OR skip_reason IN (
      'emails_disabled',
      'already_sent_today',
      'resend_not_configured',
      'missing_recipient',
      'send_failed'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_job_digests_user_generated
  ON job_digests (user_id, generated_at DESC);

ALTER TABLE job_digests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE job_digests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE job_digests TO authenticated;

DROP POLICY IF EXISTS "Users own their job digests" ON job_digests;
CREATE POLICY "Users own their job digests"
  ON job_digests
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
