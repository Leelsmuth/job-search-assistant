# Private-First Job Search Assistant Technical Spec

## Recommended Stack

- Next.js 15+ App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zod
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Drizzle ORM
- OpenAI API
- pnpm
- Vitest
- Playwright

## Architecture Decision

Start with a single Next.js application.

Do not start with a Turborepo monorepo. The expected future shape may include a worker and browser extension, but the MVP can be implemented cleanly in one app with modular internal boundaries. Extract packages later when the boundaries are real.

## Proposed Repository Structure

```txt
.
|-- PRODUCT_SPEC.md
|-- TECH_SPEC.md
|-- drizzle/
|   `-- migrations/
|-- public/
|-- src/
|   |-- app/
|   |   |-- (auth)/
|   |   |-- (dashboard)/
|   |   |-- api/
|   |   `-- layout.tsx
|   |-- components/
|   |   |-- ui/
|   |   `-- layout/
|   |-- db/
|   |   |-- client.ts
|   |   |-- schema.ts
|   |   `-- queries/
|   |-- modules/
|   |   |-- ai/
|   |   |-- applications/
|   |   |-- candidate/
|   |   |-- ingestion/
|   |   |-- jobs/
|   |   |-- matching/
|   |   `-- resumes/
|   |-- server/
|   |   |-- actions/
|   |   `-- auth/
|   |-- lib/
|   `-- test/
|-- supabase/
|   |-- policies/
|   `-- seed.sql
|-- package.json
|-- pnpm-lock.yaml
`-- drizzle.config.ts
```

## Supabase Vs Firebase

Use Supabase.

Reasons:

- The product is relational: jobs, requirements, evidence, applications, AI runs, and match analyses have many cross-links.
- Postgres is a better fit for filtering, sorting, joins, reporting, and future analytics.
- Row Level Security gives a path to SaaS-style user isolation.
- Supabase Auth integrates with Postgres ownership patterns.
- Supabase Storage can store private resume files.
- Future `pgvector` can be added if embeddings become useful.

Firebase is strong for realtime document apps, but this product would end up fighting Firestore's document model for relational match evidence and application tracking queries.

## ORM Decision

Use Drizzle.

Reasons:

- Type-safe schema and queries.
- Close to SQL, which helps for explainable filtering and matching.
- Good fit for Postgres-specific features.
- Less abstraction when tuning joins and indexes.
- Easier to keep the database model visible and auditable.

Prisma would also work, but Drizzle is a better fit for a system where SQL shape, provenance, and evidence joins matter.

## Core Domain Model

### users

Backed by Supabase Auth. Application tables reference `auth.users.id`.

### candidate_profiles

Stores one editable profile per user initially.

Fields:

- `id`
- `user_id`
- `display_name`
- `location`
- `work_authorization`
- `target_titles`
- `preferred_seniority`
- `remote_preference`
- `preferred_locations`
- `minimum_salary`
- `years_experience`
- `summary`
- `created_at`
- `updated_at`

### candidate_skills

Fields:

- `id`
- `profile_id`
- `name`
- `category`
- `proficiency`
- `years_experience`
- `evidence_level`
- `created_at`

Categories can include:

- language
- framework
- library
- testing
- platform
- architecture
- accessibility
- performance
- process
- domain

### candidate_experiences

Fields:

- `id`
- `profile_id`
- `company`
- `title`
- `start_date`
- `end_date`
- `location`
- `description`
- `created_at`
- `updated_at`

### candidate_experience_bullets

Fields:

- `id`
- `experience_id`
- `text`
- `impact`
- `skills`
- `source_resume_id`
- `created_at`

### candidate_projects

Fields:

- `id`
- `profile_id`
- `name`
- `description`
- `skills`
- `evidence`
- `created_at`

### resume_documents

Fields:

- `id`
- `user_id`
- `storage_path`
- `file_name`
- `file_type`
- `file_size`
- `extracted_text`
- `parser_version`
- `created_at`

### resume_versions

MVP can create one `master` version.

Fields:

- `id`
- `user_id`
- `resume_document_id`
- `name`
- `version_type`
- `content_text`
- `created_at`
- `updated_at`

### profile_evidence

Evidence records are central to safe matching.

Fields:

- `id`
- `profile_id`
- `source_type`
- `source_id`
- `evidence_text`
- `normalized_skills`
- `created_at`

`source_type` examples:

- resume_bullet
- experience
- project
- education
- manual_profile_fact

### companies

Fields:

- `id`
- `name`
- `website`
- `ats_provider`
- `created_at`
- `updated_at`

### job_sources

Fields:

- `id`
- `provider`
- `source_url`
- `source_job_id`
- `raw_payload`
- `fetched_at`

Providers:

- manual
- pasted_description
- greenhouse
- lever
- ashby
- generic_web

### jobs

Fields:

- `id`
- `user_id`
- `company_id`
- `source_id`
- `title`
- `location`
- `workplace_type`
- `salary_min`
- `salary_max`
- `salary_currency`
- `job_url`
- `source_job_id`
- `date_posted`
- `date_discovered`
- `employment_type`
- `description`
- `responsibilities`
- `required_qualifications`
- `preferred_qualifications`
- `technologies`
- `experience_requirements`
- `education_requirements`
- `status`
- `created_at`
- `updated_at`

### job_requirements

Fields:

- `id`
- `job_id`
- `requirement_type`
- `text`
- `normalized_skill`
- `importance`
- `is_hard_requirement`
- `created_at`

Requirement types:

- skill
- experience
- location
- authorization
- seniority
- education
- language
- clearance
- responsibility
- domain

### match_analyses

Fields:

- `id`
- `job_id`
- `profile_id`
- `analysis_version`
- `overall_score`
- `classification`
- `hard_filter_result`
- `summary`
- `created_at`

Classifications:

- excellent
- strong
- possible
- stretch
- poor

### match_category_scores

Fields:

- `id`
- `match_analysis_id`
- `category`
- `score`
- `max_score`
- `explanation`

Categories:

- core_skills
- frameworks_tools
- relevant_experience
- responsibility_alignment
- seniority_leadership
- location_work_arrangement
- education_domain

### requirement_matches

Fields:

- `id`
- `match_analysis_id`
- `job_requirement_id`
- `match_status`
- `confidence`
- `evidence_id`
- `explanation`
- `created_at`

Statuses:

- confirmed
- transferable
- missing_evidence
- gap
- blocked

### applications

Fields:

- `id`
- `user_id`
- `job_id`
- `status`
- `date_saved`
- `date_applied`
- `resume_version_id`
- `notes`
- `recruiter_name`
- `recruiter_email`
- `salary`
- `follow_up_date`
- `created_at`
- `updated_at`

### application_events

Fields:

- `id`
- `application_id`
- `event_type`
- `event_date`
- `notes`
- `created_at`

### application_answers

Fields:

- `id`
- `application_id`
- `question`
- `draft_answer`
- `final_answer`
- `evidence_ids`
- `created_at`
- `updated_at`

### ai_runs

Fields:

- `id`
- `user_id`
- `task_type`
- `prompt_version`
- `model`
- `input_hash`
- `input_summary`
- `output`
- `status`
- `error`
- `token_input_count`
- `token_output_count`
- `cost_estimate`
- `created_at`

## Matching Engine

The matching engine should be deterministic-first with AI-assisted extraction and explanation.

### Step 1: Normalize Inputs

Candidate input:

- Structured profile
- Resume text
- Evidence records
- Skills
- Experience bullets

Job input:

- Normalized job fields
- Extracted requirements
- Technologies
- Responsibilities

### Step 2: Apply Hard Filters

Hard filters:

- Country/location eligibility
- Remote requirement compatibility
- Work authorization
- Required security clearance
- Required spoken/written language
- Required professional licence
- Explicit required years of experience
- Severe title/seniority mismatch

Filter results:

- pass
- warning
- block

Warnings can lower the score. Blocks should classify the job as poor even if skills match.

### Step 3: Score Categories

Recommended weights:

```txt
core_skills: 25
frameworks_tools: 15
relevant_experience: 20
responsibility_alignment: 15
seniority_leadership: 10
location_work_arrangement: 10
education_domain: 5
```

Each category should store a raw score, max score, and explanation.

### Step 4: Classify

```txt
85-100: excellent
75-84: strong
60-74: possible
45-59: stretch
0-44: poor
```

Any hard blocker can force `poor`.

### Step 5: Evidence Map

For each job requirement:

- Identify supporting candidate evidence.
- Label evidence as confirmed, transferable, missing, gap, or blocked.
- Store the evidence link.
- Store an explanation.

### Step 6: Generate User-Facing Explanation

The generated explanation should summarize:

- Strong matches
- Partial matches
- Gaps
- Hard warnings
- Suggested next action

The explanation cannot create unsupported facts. It can say "not evidenced in the current profile."

## AI Architecture

AI should be used as a bounded component.

### AI Tasks

- Resume profile extraction
- Job requirement extraction
- Skill normalization
- Evidence mapping
- Match explanation
- Resume tailoring suggestions
- Application answer drafting

### AI Guardrails

- Use Zod schemas for outputs.
- Version every prompt.
- Store every AI run.
- Cache outputs by input hash.
- Never write unreviewed resume extraction directly into the profile.
- Never treat AI-generated claims as verified evidence.
- Prefer structured outputs over prose.
- Keep final scoring deterministic.

### Prompt Versions

Initial prompt identifiers:

- `resume.extract_profile.v1`
- `job.extract_requirements.v1`
- `matching.map_evidence.v1`
- `matching.explain.v1`
- `resume.tailor_suggestions.v1`
- `application.draft_answer.v1`

## Job Ingestion Architecture

Create an adapter interface:

```ts
type JobSourceAdapter = {
  provider: JobSourceProvider;
  detect(input: string): Promise<{ confidence: number; reason: string }>;
  fetch(input: string): Promise<RawJobSource>;
  normalize(raw: RawJobSource): Promise<NormalizedJob>;
};
```

`NormalizedJob` should be validated with Zod.

### MVP Adapters

- `manualDescriptionAdapter`
- `manualFormAdapter`
- `genericUrlAdapter`

### V1 Adapters

- `greenhouseAdapter`
- `leverAdapter`
- `ashbyAdapter`, after spike

### Later Adapters

- Workday
- Direct company career pages
- Browser extension capture

## Realistic Initial Sources

Start with:

- Manual pasted job descriptions
- Manual URLs
- Greenhouse public job board API
- Lever public postings API

Treat these cautiously:

- Ashby: likely useful, but spike first.
- Workday: later due to variability and brittleness.
- LinkedIn: do not rely on it for MVP.
- Indeed: avoid scraping dependency.

## Routes

```txt
/login
/onboarding
/profile
/resumes
/jobs
/jobs/import
/jobs/[jobId]
/applications
/applications/kanban
/applications/[applicationId]
/settings
/admin/ai-runs
```

`/admin/ai-runs` can be development-only.

## UI Workflows

### Candidate Profile

- Structured form with sections.
- Evidence list attached to experiences and bullets.
- Clear "source" indicators for imported resume data.

### Resume Import

- Upload file.
- Show extraction status.
- Show extracted text preview.
- Show suggested profile updates.
- Let user approve, edit, or reject each section.

### Job Import

- Paste URL or description.
- Show normalized preview.
- Let user edit before saving.
- Run requirement extraction.
- Run match analysis.

### Job Feed

- Dense, scan-friendly table/list.
- Match score and classification visible.
- Top match and top concern on each row/card.
- Filters in a left or top panel.

### Job Detail

- Header with company, title, location, status.
- Tabs or sections:
  - Overview
  - Match
  - Evidence
  - Tailoring
  - Application
  - Notes

### Application Tracker

- MVP table/list grouped by status.
- Add Kanban in V1.

## Privacy And Security

MVP requirements:

- Supabase Auth required for app access.
- RLS enabled on all user-owned tables.
- Private Supabase Storage bucket for resume documents.
- Server-side OpenAI calls only.
- No API keys in client bundles.
- Store only needed AI input summaries in logs, not full sensitive payloads unless necessary.
- User can delete resume files and associated extracted data.
- Use HTTPS in deployed environments.

Future SaaS requirements:

- Organization/user isolation model.
- Data export.
- Data deletion workflow.
- Audit logs for sensitive actions.
- Privacy policy and AI subprocessors disclosure.
- Billing and entitlement checks.

## Testing Strategy

### Unit Tests

Use Vitest for:

- Matching score calculations
- Hard filter logic
- Classification boundaries
- Zod schema validation
- Ingestion normalization
- Evidence mapping post-processing

### Integration Tests

Test:

- Resume import creates document and extraction record.
- Job import creates normalized job and requirements.
- Match analysis persists category scores and requirement matches.
- Application status transitions.

### E2E Tests

Use Playwright for:

- Onboarding
- Resume upload review flow
- Job import flow
- Job feed filtering
- Job detail match view
- Application tracking

### AI Evaluation Fixtures

Maintain test fixtures:

- 5 sample resumes/profile snapshots
- 20 sample frontend job posts
- Expected extracted requirements
- Expected match classifications
- Known unsupported claims that must remain gaps

## Technical Spikes

Do before full implementation:

1. Resume extraction quality
   - Test PDF and DOCX extraction against the user's actual resume.
   - Decide extraction library and fallback strategy.

2. Job extraction schema
   - Run 10-20 real frontend job posts through the extraction schema.
   - Validate requirement granularity.

3. Evidence mapping
   - Seed profile evidence and test if AI can map requirements without hallucinating.

4. ATS adapters
   - Greenhouse: confirm board token detection and normalized output.
   - Lever: confirm posting URL detection and normalized output.
   - Ashby: verify public endpoint viability.

5. RLS model
   - Write policies early and test user isolation.

6. Cost model
   - Estimate token cost per resume parse, job extraction, match analysis, and tailoring request.

7. Embeddings
   - Test whether embeddings improve skill/evidence retrieval enough to justify complexity.

## Implementation Phases

### Phase 0: Planning Artifacts

- Product spec
- Technical spec
- Seed candidate profile definition
- Example job fixtures

### Phase 1: Scaffold

- Create Next.js app.
- Add TypeScript, Tailwind, shadcn/ui.
- Add lint/test setup.
- Add Supabase env configuration.
- Add Drizzle.

### Phase 2: Auth And Shell

- Supabase Auth.
- Protected dashboard layout.
- Basic navigation.
- Empty states.

### Phase 3: Database Foundation

- Drizzle schema.
- Initial migrations.
- RLS policies.
- Seed development profile.

### Phase 4: Candidate Profile

- Profile CRUD.
- Skills and experience forms.
- Evidence record creation.

### Phase 5: Resume Import

- Resume upload.
- Text extraction.
- AI profile extraction suggestions.
- Review and approval UI.

### Phase 6: Manual Job Import

- URL/description import.
- Normalization.
- Editable preview.
- Job persistence.

### Phase 7: Matching Engine

- Requirement extraction.
- Hard filters.
- Deterministic scoring.
- Evidence mapping.
- Match analysis persistence.

### Phase 8: Job Review UX

- Job feed.
- Filters and sorting.
- Job detail page.
- Match breakdown.

### Phase 9: Application Tracking

- Save job.
- Create application.
- Status changes.
- Notes and follow-up fields.

### Phase 10: Application Prep

- Resume tailoring suggestions.
- Application question drafting.
- Accept/reject/edit drafts.

### Phase 11: Source Adapters

- Greenhouse adapter.
- Lever adapter.
- Ashby adapter if spike succeeds.

### Phase 12: Polish And Evaluation

- Fixture-based AI regression tests.
- E2E flows.
- Accessibility pass.
- Performance pass on job feed.

## Cost Drivers

- Resume parsing and profile extraction.
- Job requirement extraction.
- Evidence mapping across many profile facts.
- Match explanation generation.
- Resume tailoring suggestions.
- Application answer drafting.
- Re-running analysis when prompts or profiles change.

Cost controls:

- Cache by input hash.
- Store analysis versions.
- Do not re-run analysis unless profile/job/prompt changes.
- Use smaller models where quality is sufficient.
- Use deterministic preprocessing before AI calls.
- Avoid sending entire database context.

## Legal And Platform Concerns

- Respect terms of service for job boards and ATS platforms.
- Prefer public APIs and user-provided content.
- Avoid bypassing anti-bot protections.
- Avoid automated application submission in MVP.
- Preserve source attribution and job URLs.
- Be careful with application questions involving demographic or legally sensitive data.
- Do not imply the tool applies on the user's behalf unless it actually does with consent.

## Build Readiness Checklist

Before coding the full app, confirm:

- MVP scope is accepted.
- Supabase is accepted as the backend.
- Drizzle is accepted as the ORM.
- Single-app structure is accepted.
- Initial profile seed data is approved.
- Resume parsing spike sample files are available.
- A small set of real job posts is available for extraction testing.
