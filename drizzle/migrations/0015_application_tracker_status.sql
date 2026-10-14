-- Application tracker pipeline status.
-- Apply in the Supabase SQL editor. Do not run this against production from CI.
--
-- notes, follow_up_date, and application_events.payload already exist.
-- applications and application_events already have RLS enabled (0014) and
-- owner-scoped policies (0010: "Users own their applications" and
-- "Users own their application events"). This migration does not create tables.

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'interviewing' AFTER 'applied';
