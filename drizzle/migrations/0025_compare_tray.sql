-- Compare tray and ranked priorities for the job feed (src/modules/compare).
-- Apply in the Supabase SQL editor. Do not run this against production from CI.
--
-- Both live on search_preferences, one row per user, so the existing
-- "Users own their search preferences" policy (0011) already limits them to
-- the signed-in user: the anon key cannot read them, and authenticated
-- queries must pass (select auth.uid()) = user_id.
--
-- compare_slots: the tray, slot by slot: a job id (text) or null, at most
--   four. Slots keep the place each job was dropped in, gaps included, e.g.
--   ["<job id>", null, "<job id>", null]. Ids are checked against the user's
--   own jobs on every save and read, so a deleted job simply drops out.
-- compare_priorities: the ranked priorities, most important first, e.g.
--   ["salary","fit","location","remote","freshness"]. Null until the user
--   changes the suggested order.
--
-- Safe to run more than once.

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS compare_slots jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE search_preferences
  ADD COLUMN IF NOT EXISTS compare_priorities jsonb;

ALTER TABLE search_preferences
  DROP CONSTRAINT IF EXISTS search_preferences_compare_slots_check;
ALTER TABLE search_preferences
  ADD CONSTRAINT search_preferences_compare_slots_check CHECK (
    jsonb_typeof(compare_slots) = 'array' AND jsonb_array_length(compare_slots) <= 4
  );

ALTER TABLE search_preferences
  DROP CONSTRAINT IF EXISTS search_preferences_compare_priorities_check;
ALTER TABLE search_preferences
  ADD CONSTRAINT search_preferences_compare_priorities_check CHECK (
    compare_priorities IS NULL
    OR (jsonb_typeof(compare_priorities) = 'array' AND jsonb_array_length(compare_priorities) <= 10)
  );
