# What We've Built So Far

A summary of everything implemented in the **Private Job Search Assistant** to date — from MVP foundation through automated discovery.

**Stack:** Next.js 15 · Supabase Auth · Postgres (Drizzle) · OpenAI (optional) · Vitest · Playwright · Vercel

**Live deploy:** [job-search-assistant-virid.vercel.app](https://job-search-assistant-virid.vercel.app)

---

## Product goal

Help a job seeker **review, match, prepare, and track** applications with evidence-backed AI — not mass auto-apply.

Core loop:

1. Maintain a structured candidate profile  
2. Import or discover real job posts  
3. Extract requirements and compare to verified evidence  
4. Explain fit, gaps, and prep steps  
5. Track applications through statuses  

---

## 1. Foundation & MVP

### Authentication & security

- Email signup/login via Supabase ([`/login`](../src/app/(auth)/login/page.tsx))
- Row-level security on all user tables ([`0002_rls_policies.sql`](../drizzle/migrations/0002_rls_policies.sql))
- `withUserDb()` sets JWT claims per transaction so Postgres RLS matches the signed-in user
- Defense-in-depth ownership checks in server actions ([`helpers.ts`](../src/server/actions/helpers.ts))
- Middleware env guard — misconfigured deploy redirects to login with setup banner instead of 500

### Candidate profile

- **Onboarding** ([`/onboarding`](../src/app/(dashboard)/onboarding/page.tsx)) — upload resume, review extracted data
- **Profile** ([`/profile`](../src/app/(dashboard)/profile/page.tsx)) — editable skills, experience, preferences, target titles, remote/location prefs
- Profile options for seniority, work authorization, deal-breakers, etc.

### Resume handling

- Upload PDF/DOCX to private Supabase **`resumes`** bucket ([`0003_storage_resumes_bucket.sql`](../drizzle/migrations/0003_storage_resumes_bucket.sql))
- Text extraction (pdf-parse, mammoth) with quality checks
- AI-assisted profile extraction (OpenAI when configured; heuristics as fallback)
- **Resumes** page ([`/resumes`](../src/app/(dashboard)/resumes/page.tsx)) — list/delete files, optional wipe of extracted profile data

### Database schema

Drizzle schema in [`src/db/schema.ts`](../src/db/schema.ts) includes:

| Area | Tables |
|------|--------|
| Profile | `candidate_profiles`, skills, experiences, bullets, projects, education, evidence |
| Jobs | `jobs`, `job_sources`, `job_requirements`, `companies` |
| Matching | `match_analyses`, category scores, requirement matches |
| Applications | `applications`, `application_answers`, `tailoring_suggestions` |
| Discovery | `saved_boards` |
| Resumes | `resume_documents`, `resume_versions` |

Migrations applied in order: `0001` indexes → `0002` RLS → `0003` storage → `0004` Phase 4 → `0005` discovery dedup.

---

## 2. Job import & ingestion

### Manual import

- **Import page** ([`/jobs/import`](../src/app/(dashboard)/jobs/import/page.tsx)) — paste URL or job description
- Two-step flow: preview → confirm (`previewJobImportAction` → `confirmJobImportAction`)

### ATS adapters

| Provider | Source | Status |
|----------|--------|--------|
| Greenhouse | Public Job Board API | Single job + board |
| Lever | Postings API | Single job + board |
| Ashby | Public job board API | Single job + board |
| Generic URL | HTML fetch + text extract | Fallback |
| Pasted description | Heuristic parse | Always available |

Files: [`greenhouse.ts`](../src/modules/ingestion/greenhouse.ts), [`lever.ts`](../src/modules/ingestion/lever.ts), [`ashby.ts`](../src/modules/ingestion/ashby.ts), [`adapters.ts`](../src/modules/ingestion/adapters.ts)

### Normalization & extraction

- HTML → plain text, title sanitization
- Requirement extraction (skills, experience, responsibilities)
- Structured `job_requirements` rows for matching
- Board-level split via `normalizeBoardJobs()` (no more “Multiple Positions” stub for boards)

---

## 3. Match analysis

### Transparent scoring engine

[`src/modules/matching/engine.ts`](../src/modules/matching/engine.ts)

- Category-weighted scores (core skills, frameworks, experience, seniority, location, etc.)
- Hard filters (remote preference, location blockers, seniority stretch warnings)
- Requirement-level status: confirmed, transferable, missing evidence, gap, blocked
- Evidence mapping to profile bullets/skills
- Classifications: excellent → poor

### Match UX

- **Job feed** ([`/jobs`](../src/app/(dashboard)/jobs/page.tsx)) — score, classification badge, top concern, stale/low-extraction badges
- **Job detail** ([`/jobs/[jobId]`](../src/app/(dashboard)/jobs/[jobId]/page.tsx)) — grouped match sections, extraction confidence, **Run analysis** / rematch
- Feed filters: min score, classification, remote, Canada, sort, **discovered vs manual** source

### Stale detection

Match marked stale when profile updated after analysis was run — prompts rematch.

---

## 4. Application preparation (Phase 4)

### Resume tailoring

- Generate bullet-level tailoring suggestions tied to job requirements
- `bulletId` traceability ([`0004_phase4_qa_tailoring.sql`](../drizzle/migrations/0004_phase4_qa_tailoring.sql))
- Accept/reject per suggestion in job detail UI

### Application Q&A

- Draft answers from profile evidence + job context
- **Unsupported claims detection** — flags when draft asserts skills not in evidence
- `unsupported_claims` persisted on save; restored on reload
- Custom questions supported
- Save-time claim re-check

### Profile update feedback

Toasts when profile changes affect match relevance.

---

## 5. Application tracking

- **Applications** ([`/applications`](../src/app/(dashboard)/applications/page.tsx)) — table with status workflow
- Statuses: discovered → reviewing → saved → preparing → ready_to_apply → applied → interview stages → offer/rejected/withdrawn
- Per-job application resolution (get or create application for job)
- Dashboard stats (applications submitted, interviews, offers)

---

## 6. Production deployment

### Vercel + Supabase

- Deployed to Vercel with Supabase integration
- **Env resolution** ([`src/lib/env.ts`](../src/lib/env.ts)) — accepts Vercel/Supabase integration names (`POSTGRES_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) as aliases
- Login page shows configuration banner when env is missing
- README documents manual and integration setup paths

### Cron (Vercel)

[`vercel.json`](../vercel.json) — daily discovery at **08:00 UTC**

Requires self-generated `CRON_SECRET` in Vercel env.

---

## 7. Automated discovery (V1 + V2)

> Detailed technical doc: [DISCOVERY.md](./DISCOVERY.md)

### Discovery V1 — User-saved board polling

- Save Greenhouse / Lever / Ashby board URLs in **Settings**
- Daily cron + per-board **Poll now**
- Flow: fetch board → normalize each job → dedupe → persist → match → feed
- Dedup index on `(user_id, source_job_id)` ([`0005_discovery_dedup.sql`](../drizzle/migrations/0005_discovery_dedup.sql))
- Cron caps: 20 boards/run, 50 new jobs/run (configurable)
- Extended cron response: `{ newJobs, skipped, matched, filtered }`

### Discovery V2 — Company catalog (expanded)

- **1,700 verified** active ATS boards (557 GH · 940 Ashby · 203 Lever)
- Repeatable discovery pipeline from Common Crawl slug lists + import workflow
- Schema v2: separates company metadata, observed job signals, and candidate relevance
- Pre-import filters — skip irrelevant titles/locations before DB insert
- Settings **Browse catalog** with signal-based filters (not `remote-canada` tags)

See **[docs/COMPANY_REGISTRY.md](docs/COMPANY_REGISTRY.md)** for pipeline details.

---

## 8. Pages & routes

| Route | Purpose |
|-------|---------|
| `/login` | Auth |
| `/onboarding` | First-time resume + profile setup |
| `/profile` | Edit candidate profile |
| `/resumes` | Manage uploaded resumes |
| `/jobs` | Match-ranked feed |
| `/jobs/import` | Manual job import |
| `/jobs/[jobId]` | Detail: match, tailoring, Q&A, actions |
| `/applications` | Application tracker |
| `/settings` | Saved boards + company catalog |
| `/dashboard` | Stats overview |
| `/api/cron/discover` | Cron endpoint (GET/POST) |

---

## 9. Testing & quality

| Layer | Coverage |
|-------|----------|
| Unit tests | ~30 test files — matching, ingestion, discovery, resume, schemas, ownership |
| Integration | Import→match, discovery persist, RLS (env-gated) |
| E2E (Playwright) | Basic flow, import flow, job detail |
| Gate | `pnpm test && pnpm lint && pnpm build` green (~108 tests) |

Fixtures: job posts corpus, board JSON samples, PDF resume fixtures (`pnpm fixtures:pdf`).

---

## 10. What is NOT built yet

Deferred per product plan and your prioritization:

| Item | Notes |
|------|-------|
| **Phase 5 feed/tracker UX** | Richer filters, Kanban, notes — after discovery stabilizes |
| **DB-backed company registry** | V2.1 — catalog is JSON file for now |
| **Auto-suggest boards from profile** | Future |
| **LinkedIn / open-web search** | Explicitly out of scope |
| **Auto-apply / browser extension** | Non-goal |
| **Multi-resume versions** | V1 feature, not MVP |
| **SaaS billing / teams** | Later |

---

## 11. Typical user journey today

```
Sign up → Onboarding (resume) → Profile review
    → Settings: add boards from catalog (or paste URL)
    → Poll now / wait for cron
    → /jobs feed: filter discovered, scan scores
    → Job detail: match evidence, tailor resume, draft Q&A
    → Applications: update status as you progress
```

---

## 12. Key commands

```bash
pnpm dev              # Local dev
pnpm test             # Unit + integration tests
pnpm test:e2e         # Playwright (needs E2E_TEST_EMAIL/PASSWORD)
pnpm setup:check      # Validate env + DB
pnpm db:push          # Push schema
pnpm verify:boards    # Verify catalog boards (network)
```

---

## 13. Document index

| Doc | Contents |
|-----|----------|
| [README.md](../README.md) | Setup, deploy, daily workflow |
| [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) | Full product vision & phases |
| [COMPANY_REGISTRY.md](./COMPANY_REGISTRY.md) | 1,000+ board discovery & verification pipeline |
| This file | Everything built so far |

---

*Last updated: July 2026 — through Discovery V2 completion.*
