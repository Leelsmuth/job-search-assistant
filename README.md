# Private-First Job Search Assistant

Evidence-backed job matching, application preparation, and tracking.

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

In **Project Settings → Database → Connection string → URI** (use **Session pooler** for serverless/Vercel, or **Direct** for local dev):

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres` |

Optional in **API** tab:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin tasks (not needed for MVP) |
| `OPENAI_API_KEY` | AI extraction/drafting (heuristics work without it) |
| `CRON_SECRET` | Protect `/api/cron/discover` in production |

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

Open [http://localhost:3000](http://localhost:3000) → sign up at `/login`.

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
| `DATABASE_URL` | `POSTGRES_URL` |

The app accepts **either** name for each row. After connecting:

1. In Vercel → **Environment Variables**, confirm vars exist for **Production** and **Preview** (edit each → check both boxes)
2. **Redeploy** (env changes do not apply to existing deployments)
3. In Supabase **SQL Editor**, run migrations [`0002`](drizzle/migrations/0002_rls_policies.sql) → [`0005`](drizzle/migrations/0005_discovery_dedup.sql)
4. Sign up at `/login` on the deployed URL (prod has a separate user table from local)

### Option B: Manual env vars

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase `anon` public key |
| `DATABASE_URL` | Yes | Supabase **Session pooler** URI (port 6543) for serverless |

Optional: `OPENAI_API_KEY`, `CRON_SECRET`

If env vars are missing, `/jobs` redirects to `/login` with a configuration notice instead of a 500 error.

---

## Daily workflow

1. **Profile** — confirm skills, experience, preferences at `/profile`
2. **Discovery** — save ATS board URLs at `/settings` (Greenhouse, Lever, Ashby)
3. **Import jobs** — paste descriptions or URLs at `/jobs/import` (manual)
4. **Review feed** — scan match scores and gaps at `/jobs` (filter by discovered vs manual)
5. **Prepare** — tailoring + Q&A on job detail pages
6. **Track** — move saved jobs through statuses at `/applications`

## Automated discovery (V1)

Discovery polls **saved ATS boards** daily — it does not search the open web.

1. Add board URLs in **Settings** (`/settings`) — e.g. `https://boards.greenhouse.io/stripe`
2. Set `CRON_SECRET` in Vercel (and `.env.local` for manual testing)
3. Vercel cron runs daily at **08:00 UTC** (`vercel.json` → `/api/cron/discover`)

Manual poll (single board): use **Poll now** in Settings.

Manual cron trigger:

```bash
curl -X POST "https://your-app.vercel.app/api/cron/discover" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Cron response includes `{ newJobs, skipped, matched, filtered }` for monitoring.

## Company catalog (Discovery V2)

Settings includes a **Browse Company Catalog** with ~100 verified Greenhouse, Lever, and Ashby boards (Canada/remote-friendly tech employers). One-click **Add** saves the board to your account for daily polling.

### Maintaining the seed file

| Command | Description |
|---------|-------------|
| `pnpm build:seed` | Regenerate `data/company-sources.seed.json` from `scripts/seed-candidates.ts` |
| `pnpm verify:boards` | Dry-run verify all enabled boards (hits live ATS APIs) |
| `pnpm verify:boards --write` | Update `verifiedAt`, `lastJobCount`, disable failures |
| `pnpm verify:boards --write --id=stripe` | Re-verify a single entry |
| `pnpm prune:seed` | Keep only verified enabled entries |

To add a company manually, edit `data/company-sources.seed.json` (or add to `scripts/seed-candidates.ts` and run `build:seed`), then run `pnpm verify:boards --write`.

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
| `pnpm db:push` | Push Drizzle schema to database |
| `pnpm db:seed` | Seed profile (requires `SEED_USER_ID`) |
| `pnpm fixtures:pdf` | Regenerate text-based PDF test fixture |
| `pnpm build:seed` | Build company catalog JSON from seed candidates |
| `pnpm verify:boards` | Verify ATS board URLs in catalog seed file |
| `pnpm prune:seed` | Remove unverified entries from catalog seed |

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

E2E tests require `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` in the environment.

## Stack

Next.js 15 · Supabase · Drizzle · OpenAI · Vitest · Playwright
