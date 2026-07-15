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

## Daily workflow

1. **Profile** — confirm skills, experience, preferences at `/profile`
2. **Import jobs** — paste descriptions or URLs at `/jobs/import`
3. **Review feed** — scan match scores and gaps at `/jobs`
4. **Prepare** — tailoring + Q&A on job detail pages
5. **Track** — move saved jobs through statuses at `/applications`

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

## Stack

Next.js 15 · Supabase · Drizzle · OpenAI · Vitest · Playwright
