-- Tighten batch_rsvp_jobs RLS: all writes go through /api/batch-rsvp and
-- scripts/process-batch-rsvp.ts using the service role. Users must not be able
-- to insert jobs directly (bypassing the API's email check) or edit their own
-- jobs (e.g. change profile_snapshot.email or reset status to 'pending').
-- Users keep SELECT on their own rows.
DROP POLICY IF EXISTS "batch_rsvp_jobs_insert" ON batch_rsvp_jobs;
DROP POLICY IF EXISTS "batch_rsvp_jobs_update" ON batch_rsvp_jobs;
