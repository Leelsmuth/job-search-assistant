# Private-First Job Search Assistant

Evidence-backed job matching, application preparation, and tracking.

## Try it without setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Try the demo**. No `.env.local`, Supabase, Postgres, or OpenAI key is needed.

The demo at `/demo` has the job feed and the application tracker, filled with fictional jobs. You can search and filter the feed, save or dismiss jobs, open a job, and move saved roles through the tracker (list or board) with status, follow-up date, and notes. **Reset demo** in the header restores the sample data, and its toast has an Undo button. It is disabled until you change something. An untouched demo more than a day old is reseeded on load so the sample dates look current; a demo you have changed is never replaced.

Visitors who have changed something in the demo see **Continue exploring your demo** on the landing page instead of **Try the demo**. The demo store keeps a small `jsa:demo-active:v1` marker in `localStorage`, and an inline script reads it before the page paints, so the landing page stays static and never flashes the wrong button.

Demo state lives in the browser's `localStorage` under `jsa:demo-state:v1`. Nothing is sent to the server, and each visitor has their own copy. Demo transitions follow the signed-in tracker: saving a job adds a **Saved** application, unsaving keeps it, and moving to **Applied** stamps the applied date. The demo reuses the signed-in tracker components through `TrackerAdapterProvider` (`src/components/applications/tracker-adapter.tsx`).

**Load live jobs** on the demo feed pulls up to 6 real postings from one preselected public Greenhouse board (Tailscale; change `DEMO_LIVE_BOARD` in `src/modules/demo/live-jobs.ts`). They appear above the sample jobs with a **Live** label and no fit score, follow the feed's search and workplace filters, and **Open posting** goes to the employer's page in a new tab. **Save** on a live job does not touch the demo tracker: it asks the visitor to create an account (`/login?mode=signup`) or sign in. Live jobs are kept in `sessionStorage` under `jsa:demo-live:v1`, so they last through reloads in that tab and are gone in new tabs or once the tab closes. They are not demo changes, so they never enable **Reset demo** or switch the landing page to **Continue exploring**. The browser calls `GET /api/demo/live-jobs`, which takes no input, reads only that board's job list (no descriptions), keeps the most frontend- and Canada-relevant roles, and caches the batch for 10 minutes per server instance and at the CDN (`s-maxage`). If Greenhouse fails, the route serves the last batch for up to an hour, waits 30 seconds before retrying, and otherwise answers 502 while the sample jobs keep working. No env vars are needed. The server log line `[demo] live jobs unavailable …` says why a load failed (HTTP status and body, network error code, or timeout). Run `pnpm check:demo-live` to test the board from any machine.

If the dev server cannot reach Greenhouse (a sandbox or an offline laptop), set `DEMO_LIVE_JOBS_SNAPSHOT=1` in `.env.local` to serve the bundled sample response (`src/modules/demo/snapshots/greenhouse-tailscale.json`; illustrative jobs, links to the real board page), or set it to the path of a saved real response, e.g. from `curl -o tmp/greenhouse.json https://boards-api.greenhouse.io/v1/boards/tailscale/jobs` on a machine with internet. The file goes through the same selection as live data, is re-read on every load, and is shown with a **Snapshot** label and a "Development snapshot, not live data" notice. It only works under `pnpm dev`: production builds, including Vercel previews, ignore the variable, log a warning, and call Greenhouse.

The landing page (`/`), `/demo`, and `/api/demo` are public. Every other page still needs sign-in, and signed-in users who open `/` go straight to `/jobs`. The middleware skips the Supabase session check for `/demo` and `/api/demo`.

## First-time setup

### 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Choose a name, password (save the DB password), and region
3. Wait for the project to finish provisioning (~2 min)

### 2. Get credentials

In **Project Settings → API**:

| Variable | Where to find it |
|----------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |

In **Project Settings → Database → Connection string → URI**, use the **direct** connection (port 5432) for local `DATABASE_URL`. On Vercel, the app runtime uses the **transaction pooler** (`POSTGRES_URL`, port 6543), not the session pooler.

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` |

Optional in **API** tab:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin tasks (not needed for MVP) |
| `OPENAI_API_KEY` | AI extraction, bullet rewrites, and cover letters (selection and templates work without it) |
| `OPENAI_MODEL` | Chat model for every OpenAI call. Defaults to `gpt-4o-mini` |
| `CRON_SECRET` | Protect `/api/cron/discover` and `/api/cron/digest` |
| `RESEND_API_KEY` | Send the morning digest. If unset, the digest is saved in the app and email is skipped |
| `DIGEST_FROM_EMAIL` | From address for Resend, for example `Job Search <onboarding@resend.dev>` |

### 3. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase values
```

### 4. Install and push schema

```bash
pnpm install
pnpm setup:check    # validates .env.local + DB connection
pnpm db:push        # creates all tables in Postgres
```

### 5. Apply security policies and indexes

In Supabase **SQL Editor**, run these files in order:

1. `drizzle/migrations/0002_rls_policies.sql` — row-level security (idempotent)
2. `drizzle/migrations/0001_indexes.sql` — performance indexes
3. `drizzle/migrations/0003_storage_resumes_bucket.sql` — private **`resumes`** storage bucket (required for resume upload)
4. `drizzle/migrations/0004_phase4_qa_tailoring.sql` — Q&A unsupported-claims column + tailoring bullet traceability
5. `drizzle/migrations/0005_discovery_dedup.sql` — unique index for discovered job deduplication
6. `drizzle/migrations/0006_board_health_and_registry.sql` — board poll stats, job dismiss tracking, DB company registry

Alternatively, `supabase/policies/rls.sql` contains the same table policies (use on first setup only).

For storage only, you can also create the bucket in the dashboard: **Storage → New bucket** → name `resumes`, **Private**, max file size 5 MB.

Server actions use `withUserDb()` to set `request.jwt.claims` and `SET LOCAL ROLE authenticated` on each transaction so Postgres RLS (`auth.uid()`) matches the signed-in user. Application code also enforces ownership checks as defense in depth.

### 6. Enable email auth (if not already on)

**Authentication → Providers → Email** — enable Email provider.

For local dev you can disable “Confirm email” under **Authentication → Settings** so signup works immediately.

### 7. Start the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) → **Sign in** → sign up at `/login`.

### 8. Seed your profile (optional)

After signing up, get your user ID from **Authentication → Users** in Supabase, then:

```bash
SEED_USER_ID=your-user-uuid pnpm db:seed
```

Or use **Onboarding** (`/onboarding`) to upload a resume and review extracted data.

### Delete resume data

At **Resumes** (`/resumes`) you can delete uploaded files. Optionally wipe extracted profile data (skills, experience, evidence) when deleting — useful for privacy resets without removing your account.

---

## Deploy to Vercel

The app requires Supabase and Postgres at runtime. Local `.env.local` is **not** uploaded to Vercel.

### Option A: Supabase ↔ Vercel integration (recommended)

If you connected Supabase via **Vercel Marketplace → Supabase**, env vars are synced automatically — but the names differ from `.env.example`:

| This app reads | Supabase integration often sets |
|----------------|----------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `DATABASE_URL` | `POSTGRES_URL` (transaction pooler, port 6543) |

The app accepts **either** name for Supabase URL and anon key. For Postgres, runtime prefers the transaction pooler when both are set. After connecting:

1. In Vercel → **Environment Variables**, confirm vars exist for **Production** and **Preview** (edit each → check both boxes)
2. **Redeploy** (env changes do not apply to existing deployments)
3. In Supabase **SQL Editor**, run migrations [`0002`](drizzle/migrations/0002_rls_policies.sql) → [`0006`](drizzle/migrations/0006_board_health_and_registry.sql)
4. Sign up at `/login` on the deployed URL (prod has a separate user table from local)

### Option B: Manual env vars

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase `anon` public key |
| `POSTGRES_URL` | Yes on Vercel | Supabase **transaction pooler** URI (host `*.pooler.supabase.com`, port **6543**) |
| `DATABASE_URL` | Yes for local dev | Direct Postgres (port 5432). Used at runtime only when no transaction-pooler URL is set |

Optional: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `CRON_SECRET`, `POSTGRES_URL_NON_POOLING` (drizzle-kit against Supabase)

If env vars are missing, `/jobs` redirects to `/login` with a configuration notice instead of a 500 error.

### Which database URL is used

| Env var | Used by |
|---------|---------|
| `POSTGRES_URL` | App runtime on Vercel. Supabase transaction pooler (port 6543). Preferred when it is a pooler URL. |
| `POSTGRES_PRISMA_URL` | Runtime fallback. Prisma-only params (`pgbouncer`, `connection_limit`) are stripped before postgres.js connects. |
| `DATABASE_URL` | Local runtime when no pooler URL is set. Also used by drizzle-kit when it is a direct connection (port 5432). |
| `POSTGRES_URL_NON_POOLING` | `pnpm db:push`, `db:migrate`, and `db:studio`. Direct connection. Not used by the Next.js runtime. |

Serverless code keeps one postgres.js client per process (`max: 1`, `idle_timeout`, `prepare: false`). `SET LOCAL ROLE` runs inside `withUserDb()` transactions so it works in transaction pooling. No Vercel variable needs to be renamed if the Supabase integration already set `POSTGRES_URL` to port 6543. Confirm that port — session mode and the direct host use 5432 and will exhaust connection slots. Redeploy after changing any variable.

---

## Tailored resume and cover letter

On a job page, use **Tailor resume** or the **Documents** tab. The app ranks experiences, bullets, projects, and skills from requirement matches and frontend fit. That selection works with no API key. Set `OPENAI_API_KEY` to rewrite bullets and draft a 250–350 word cover letter with `OPENAI_MODEL` (default `gpt-4o-mini`). Rewrites are checked against profile facts. Each model call is stored in `ai_runs` with the model name, including a row with a null model when the key is missing.

Before using this, apply [`drizzle/migrations/0012_tailored_documents.sql`](drizzle/migrations/0012_tailored_documents.sql) in the Supabase SQL editor. Do not run it from CI.

## Assisted apply

On a job page, **Prepare application** loads the employer questions when a public API allows it (Greenhouse `questions=true`, Lever posting fields, Ashby posting form). Workday and unknown boards use a standard question set. Questions are cached per job for seven days. Contact fields, work authorization, sponsorship, relocation, start date, salary, pronouns, “how did you hear,” and voluntary self-ID come from **Settings → Application profile**. Open-ended questions are drafted with `draftApplicationAnswer` (`OPENAI_MODEL`, default `gpt-4o-mini`) and fall back to the deterministic drafter when `OPENAI_API_KEY` is missing. Unsupported claims stay visible. **Open application** only links to the employer URL. **Mark as applied** records the application and stores the answers on an event. The app never submits the employer form.

A bookmarklet at `/settings/apply-assist` can fill known Greenhouse, Lever, and Ashby fields from a copied payload. It skips file uploads and does not click Submit.

Before using this, apply [`drizzle/migrations/0013_assisted_apply.sql`](drizzle/migrations/0013_assisted_apply.sql) in the Supabase SQL editor. Do not run it from CI. No new environment variables are required.

## Browser extension

A Chrome extension in [`extension/`](extension/README.md) fills the current application page from the application profile and from answers already saved by Prepare application. It can save a posting to the tracker and mark a matched job applied. Custom selects, including the Greenhouse phone-country list, are opened and chosen from the options. A question about where you intend to work uses your city, province, and work authorization. It never clicks Submit and never advances a form past the final review step.

Create a token in **Settings → Browser extension**, then load the unpacked build. Apply [`drizzle/migrations/0020_extension_tokens.sql`](drizzle/migrations/0020_extension_tokens.sql) in the Supabase SQL editor before using or merging this. Do not run it from CI. The original uploaded resume file is attached when `SUPABASE_SERVICE_ROLE_KEY` is set on the server; otherwise the extension attaches a PDF rendered from the saved resume text. The key stays on the server.

## Daily workflow

1. **Profile** — confirm skills, experience, preferences at `/profile`
2. **Discovery** — browse the catalog and add boards at `/discovery`
3. **Settings** — poll saved boards, review board health, and save the application profile (`/settings`)
4. **Review feed** — search, filter, save/dismiss from `/jobs`
5. **Prepare** — tailoring, per-job resume and cover letter, and Prepare application on the job page
6. **Track** — table or Kanban at `/applications`

## Automated discovery (V1)

Discovery polls **saved ATS boards** daily — it does not search the open web.

1. Add boards from **Discovery** (`/discovery`) or paste URLs in **Settings**
2. Set `CRON_SECRET` in Vercel (and `.env.local` for manual testing)
3. Vercel cron discovers boards daily at **08:00 UTC** and sends the digest at **12:00 UTC** (`vercel.json`). 12:00 UTC is 8:00 AM in Toronto during daylight time and 7:00 AM during standard time. Hobby cron runs at most once a day, so both jobs stay on a daily UTC schedule.

Manual poll (single board): use **Poll now** in Settings.

Manual cron trigger:

```bash
curl -X POST "https://your-app.vercel.app/api/cron/discover" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Cron response includes `{ newJobs, skipped, matched, filtered }` for monitoring.

## Daily digest

`/api/cron/digest` runs at **12:00 UTC**, after discovery. It saves a snapshot of up to 10 new location-eligible frontend matches (scored with the existing deterministic frontend-fit function, no model call) plus tracker reminders: follow-ups due today or overdue in `America/Toronto`, and applications still `applied` with no activity for 14 days. The same snapshot is on `/digest`.

Email uses Resend when `RESEND_API_KEY` and `DIGEST_FROM_EMAIL` are set. The recipient is the account's auth email. If the API key is missing, email is skipped and logged. A day with nothing new and no reminders does not send. Settings can turn email off without hiding `/digest`. The send time is stored so a second run the same Toronto day does not send again.

Apply [`drizzle/migrations/0016_job_digests.sql`](drizzle/migrations/0016_job_digests.sql) in the Supabase SQL editor before the first run. Do not run it from CI.

```bash
curl -X POST "https://your-app.vercel.app/api/cron/digest" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Company catalog (1,000+ verified ATS boards)

**Discovery** (`/discovery`) includes profile-based suggestions and the full verified catalog. Filter by **observed job signals** (Canada jobs, remote Canada, frontend roles). One-click **Add** saves the board for daily polling.

See **[docs/COMPANY_REGISTRY.md](docs/COMPANY_REGISTRY.md)** for the full discovery/verification pipeline.

### Registry maintenance

Re-verify monthly (or after adding Common Crawl slug imports):

```bash
pnpm verify:registry --reverify --write
pnpm audit:registry
```

Expand Greenhouse/Lever coverage:

```bash
pnpm verify:registry --write --provider=greenhouse --target=550
pnpm verify:registry --write --provider=lever --target=250
```

Optional: load catalog into Postgres (after migration `0006`):

```bash
pnpm seed:company-registry
```

Registry re-verify cron hook (returns operator instructions): `GET /api/cron/reverify-registry` with `Authorization: Bearer $CRON_SECRET`.

| Command | Description |
|---------|-------------|
| `pnpm discover:companies` | Merge discovery candidates into `data/company-sources.seed.json` |
| `pnpm verify:registry --write --target=1000` | Verify boards until 1,000+ active |
| `pnpm verify:registry --reverify --write` | Re-check existing verified boards |
| `pnpm verify:registry --write --provider=greenhouse --target=550` | Provider-scoped verification |
| `pnpm audit:registry` | Audit duplicates/tags; migrate schema v2 |
| `pnpm seed:company-registry` | Upsert verified catalog into `company_job_sources` table |
| `pnpm verify:boards --write` | Legacy alias for re-verify |

Import ATS URLs via `data/discovery/imports/*.json`, then run `discover:companies` + `verify:registry`.

### Pre-import filters

During board polling, jobs are filtered **before** database insert using deterministic rules (title, location, remote/Canada). Filtered jobs increment the cron `filtered` count and skip match analysis to control cost.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm setup:check` | Validate env + DB connection |
| `pnpm check:demo-live` | Check that the demo's live jobs board answers from this machine |
| `pnpm db:push` | Push Drizzle schema to database |
| `pnpm db:seed` | Seed profile (requires `SEED_USER_ID`) |
| `pnpm fixtures:pdf` | Regenerate text-based PDF test fixture |
| `pnpm discover:companies` | Merge ATS discovery candidates into registry |
| `pnpm verify:registry` | Batch-verify boards against live ATS APIs |
| `pnpm audit:registry` | Audit registry; migrate schema |
| `pnpm verify:boards` | Legacy verify alias |
| `pnpm seed:company-registry` | Load verified catalog into Postgres |
| `pnpm build:seed` | Build seed from `scripts/seed-candidates.ts` (legacy) |
| `pnpm prune:seed` | Keep only verified entries (legacy) |

### RLS integration test (optional)

After applying `0002_rls_policies.sql`, you can run the database isolation test against your Supabase instance:

```bash
RUN_RLS_INTEGRATION=true pnpm test src/test/integration/rls.test.ts
```

Optional env vars:

| Variable | Purpose |
|----------|---------|
| `RLS_TEST_USER_A` | UUID for user A (defaults to random UUID per run) |
| `RLS_TEST_USER_B` | UUID for user B (defaults to random UUID per run) |

Signed-in E2E tests require `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` in the environment. The demo E2E tests (`src/test/e2e/demo.spec.ts`) need no env vars.

## Stack

Next.js 15 · Supabase · Drizzle · OpenAI · Vitest · Playwright

## License

MIT — see [LICENSE](LICENSE).
