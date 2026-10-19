-- Save the last curated-board poll error.
-- APPLY THIS IN THE SUPABASE SQL EDITOR BEFORE MERGE.
-- Do not run it from CI.
--
-- feed:himalayas and other curated rows only stored last_status = 'error'.
-- last_error keeps the thrown message so the next failure is visible in
-- curated_board_poll_state without Vercel logs.
-- The table stays closed to the API roles (policy from 0017).

ALTER TABLE curated_board_poll_state
  ADD COLUMN IF NOT EXISTS last_error text;
