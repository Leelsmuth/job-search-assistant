-- Allow Workday as a job source provider on saved boards and imported jobs.
ALTER TYPE job_source_provider ADD VALUE IF NOT EXISTS 'workday';
