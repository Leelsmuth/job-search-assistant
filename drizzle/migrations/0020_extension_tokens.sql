-- Browser extension tokens. Apply in the Supabase SQL editor before merge.
-- Do not run this against production from CI.
--
-- The extension authenticates with a bearer token. Only the SHA-256 hash is
-- stored. Plaintext is shown once in Settings and never written here.
-- The anon key cannot read this table. Authenticated queries still pass RLS.

CREATE TABLE IF NOT EXISTS extension_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  token_prefix text NOT NULL,
  scopes jsonb NOT NULL,
  expires_at timestamp NOT NULL,
  revoked_at timestamp,
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT extension_tokens_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT extension_tokens_prefix_check CHECK (char_length(token_prefix) BETWEEN 8 AND 24),
  CONSTRAINT extension_tokens_scopes_check CHECK (
    jsonb_typeof(scopes) = 'array'
    AND jsonb_array_length(scopes) BETWEEN 1 AND 3
    AND scopes <@ '["profile:read","answers:read","tracker:write"]'::jsonb
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS extension_tokens_token_hash_unique
  ON extension_tokens (token_hash);

CREATE INDEX IF NOT EXISTS extension_tokens_user_id_idx
  ON extension_tokens (user_id);

ALTER TABLE extension_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE extension_tokens FROM PUBLIC;
REVOKE ALL ON TABLE extension_tokens FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE extension_tokens TO authenticated;

DROP POLICY IF EXISTS "Users own their extension tokens" ON extension_tokens;
CREATE POLICY "Users own their extension tokens"
  ON extension_tokens
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
