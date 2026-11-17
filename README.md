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

**Import CSV** on the demo tracker brings in a spreadsheet the visitor already keeps (Google Sheets, Excel, Numbers, or Notion exported as CSV; comma, semicolon, or tab delimited; UTF-8 or Excel's legacy Windows-1252). The file is read in the browser and never uploaded. The dialog walks through five steps: **choose a file** (up to 1 MB and 500 rows; `.xlsx` gets a "save as CSV" message), **map columns** (headers like "Company Name", "Position", or "Date Applied" are matched automatically and can be changed; only company and role are required, and numeric dates ask for day/month order when the file is ambiguous), **preview** (every row, with rows missing a company or role marked as skipped and unreadable statuses, dates, workplaces, or links explained rather than silently dropped; click any row, or its **Fix**/**Edit** button, to edit its values in place before importing: each change is re-checked as you type with the same rules as the file, messages sit next to the field they are about, and the file itself is never changed), **duplicates** (rows with the same job link, or the same company and role, as a tracked application or an earlier row; each can be skipped, which is the default, used to update the tracked application with a preview of exactly what changes, or imported anyway), and **confirm**. The last screen offers **Undo import** and **Export CSV**. Imported rows behave like any other tracker row; because they have no sample job page, their title is plain text and **Job posting** links to the URL from the file. A row that names a sample job not yet tracked becomes that job's application. **Export CSV** downloads every demo application as `job-applications-YYYY-MM-DD.csv` with the same column names the importer recognizes, ISO dates, a UTF-8 byte order mark for Excel, and formula-like cells (`=`, `+`, `-`, `@`) prefixed with `'` so spreadsheets do not run them; an exported file imports back unchanged. Imported applications count as demo changes, so **Reset demo** removes them. The signed-in tracker has the same **Import CSV** and **Export CSV** (see [Spreadsheet import and export](#spreadsheet-import-and-export)). The dialog is shared (`src/components/applications/import/`); the parsing, mapping, and duplicate logic is pure and lives in `src/modules/applications/csv.ts` and `tracker-csv.ts`; the demo-specific part is `src/modules/demo/demo-import.ts`.

**Load live jobs** on the demo feed pulls up to 6 real postings from one preselected public Greenhouse board (Tailscale; change `DEMO_LIVE_BOARD` in `src/modules/demo/live-jobs.ts`). They appear above the sample jobs with a **Live** label and no fit score, follow the feed's search and workplace filters, and **Open posting** goes to the employer's page in a new tab. **Save** on a live job does not touch the demo tracker: it asks the visitor to create an account (`/login?mode=signup`) or sign in. Live jobs are kept in `sessionStorage` under `jsa:demo-live:v1`, so they last through reloads in that tab and are gone in new tabs or once the tab closes. They are not demo changes, so they never enable **Reset demo** or switch the landing page to **Continue exploring**. The browser calls `GET /api/demo/live-jobs`, which takes no input, reads only that board's job list (no descriptions), keeps the most frontend- and Canada-relevant roles, and caches the batch for 10 minutes per server instance and at the CDN (`s-maxage`). If Greenhouse fails, the route serves the last batch for up to an hour, waits 30 seconds before retrying, and otherwise answers 502 while the sample jobs keep working. No env vars are needed. The server log line `[demo] live jobs unavailable …` says why a load failed (HTTP status and body, network error code, or timeout). Run `pnpm check:demo-live` to test the board from any machine.

If the dev server cannot reach Greenhouse (a sandbox or an offline laptop), set `DEMO_LIVE_JOBS_SNAPSHOT=1` in `.env.local` to serve the bundled sample response (`src/modules/demo/snapshots/greenhouse-tailscale.json`; illustrative jobs, links to the real board page), or set it to the path of a saved real response, e.g. from `curl -o tmp/greenhouse.json https://boards-api.greenhouse.io/v1/boards/tailscale/jobs` on a machine with internet. The file goes through the same selection as live data, is re-read on every load, and is shown with a **Snapshot** label and a "Development snapshot, not live data" notice. It only works under `pnpm dev`: production builds, including Vercel previews, ignore the variable, log a warning, and call Greenhouse.

**Compare** on the demo feed puts two to four sample jobs side by side. Drag a job card into the **Compare roles** tray docked at the bottom of the feed (the card travels as a small chip shaped like a tray slot, so it never covers the tray), or use the job's **Compare** button (the keyboard and touch alternative; phones cannot drag, so the tray only appears there once a role is added). The tray has four numbered slots, and a dragged job lands in the slot it is dropped on: drop it on slot 3 and it sits in slot 3, with any gaps left as they are. Dropping on a taken slot puts the job there and shifts the jobs in the way one slot towards the nearest empty slot, so nothing is pushed out. While dragging, the slot under the pointer lights up and the tray says what letting go will do ("Drop into slot 3; Senior Frontend Engineer moves over"). Drag a slot, or a job already in the tray, onto another slot to move it. The **Compare** button and drops outside the slots use the first empty slot. Removing a job empties its slot without moving the others, and the comparison's columns follow slot order. A fifth role is shown as refused while it is dragged, and the tray explains why on drop. **Compare** stays disabled until two roles are in. The comparison dialog lines the roles up by fit, salary, eligibility, location, posting age, why each fits, the top gap, requirements, nice-to-haves, tech stack (skills on the sample profile are ticked), and tracker status, and marks the best fit, highest salary, and newest posting. Salaries in different currencies are not ranked against each other. Live jobs cannot be compared, since they have no fit score, salary, or requirements. The tray is kept in `sessionStorage` under `jsa:demo-compare:v1` as four slots, with `null` for an empty one (an older plain list of ids still loads), so it survives opening a job and coming back, and like live jobs it is not a demo change. The rules are pure and shared with the signed-in feed (`src/modules/compare/`; the demo binds them to its sample jobs in `src/modules/demo/demo-compare.ts`). The tray, dialog, and ranker are shared too (`src/components/compare/`); `src/app/demo/demo-compare-adapter.tsx` backs them with the demo's browser stores. See [Comparing roles](#comparing-roles-on-the-job-feed) for the signed-in version.

**Priorities** turn the comparison into a ranking matrix. The visitor ranks five priorities (fit, salary, location, remote, and freshness) by dragging them (mouse anywhere on an item, touch on its grip; the arrow buttons do the same from the keyboard). #1 is worth 5 points and #5 is worth 1, and each compared role earns a share of every priority's points: its fit score as a percentage, its top salary against the best-paying role, all or nothing for location (no points when it needs US work authorization or is out of area), all, half, or none for remote, hybrid, or on-site, and freshness fading to nothing over 30 days. The **Your score** row shows each role's total and per-priority points, and a note at the top names the best role for those priorities and what it leads on. We suggest fit first and say why when fit drops below #2, and when the winner is not the role the visitor fits best, the note says which one is; a winner with a location blocker gets a warning. The visitor's order always decides the winner. Salary is left out of the score when the roles pay in different currencies. Anything a posting does not say (salary, work arrangement, location) and a role without a fit score yet earns half that priority's points, shown as "(half points)" under a lighter bar: unknown is neutral, neither rewarded nor punished. Priorities can be set from the tray's **Priorities** button before comparing, or changed inside the comparison, where the score updates as they move. The order is kept in `localStorage` under `jsa:demo-priorities:v1`, so a returning visitor gets their own order rather than the suggestion; it is a preference, so **Reset demo** leaves it alone. A line under the list says where the order stands: before any change, that changes are saved in this browser; after one, **Saved just now in this browser**, settling to **Saved in this browser, so it's here next time**. If the browser refuses the write (private windows, blocked site data), it says the order lasts only until reload instead of claiming it saved. Scoring is pure and lives in `src/modules/compare/priorities.ts`; the ranker is `src/components/compare/priorities.tsx`.

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
4. **Review feed** — search, filter, save/dismiss, and compare roles against your priorities at `/jobs`
5. **Prepare** — tailoring, per-job resume and cover letter, and Prepare application on the job page
6. **Track** — table or Kanban at `/applications`

## Comparing roles on the job feed

Signed-in users get the same **Compare** tray, comparison, and **Priorities** ranking as the demo (see [the demo section](#try-it-without-setup) for how dragging, slots, scoring, and the note on the best role work). Differences:

- **Kept on the account.** The tray (slot by slot, gaps included) and the ranked priorities are saved on the user's `search_preferences` row (`compare_slots`, `compare_priorities`), so they follow the user across tabs and devices. Changes show at once and save in the background, one at a time; the priorities panel says **Saving…**, then **Saved just now to your account**. If a tray save fails, the tray goes back to how it was last saved and says so; if a priorities save fails, the new order stays for the page and the panel says it is not saved. Saving never touches `updated_at` and never rescores jobs.
- **The user's own numbers.** Fit is the number the feed shows (the stored fit score, or the same live score the feed computes when none is stored; both come from `enrichJobListItem` in `src/modules/jobs/jobs-feed-service.ts`). Location follows the user's Settings: Remote-Canada, and hybrid or on-site in their area when those are turned on, earn the points; needing US work authorization, remote outside Canada, or out of area earn none. Most job boards do not publish salaries, so a role without one earns half the salary points. The comparison also shows the match analysis label and gap when a role has been analysed ("Not analysed yet" otherwise) and a **Resume match** row when the user has a resume.
- **Only the user's jobs.** Every save and load checks the ids against the user's own jobs (and RLS applies on top), so other ids become empty slots, and a job deleted since it was added drops out. Feed filters do not touch the tray.

**Apply [`drizzle/migrations/0025_compare_tray.sql`](drizzle/migrations/0025_compare_tray.sql) in the Supabase SQL editor before deploying this.** Drizzle names every column of `search_preferences` when it inserts a row, so until the columns exist, saving Settings (and alerts, digest, and discovery settings) fails with "column does not exist". The feed itself keeps working without the migration: the tray and ranking work for the page and say they are not saved. The migration only adds two columns and their checks; the existing "Users own their search preferences" policy covers them. No environment variables are needed.

Code: `src/modules/compare/` (rules, scoring, and `compare-db.ts` for the database), `src/server/actions/compare-actions.ts`, `src/app/(dashboard)/jobs/account-compare.tsx` (the account-backed provider), and the shared UI in `src/components/compare/`. Server logs start with `[compare]`.

## Spreadsheet import and export

**Import CSV** on `/applications` brings in a tracker the user already keeps in a spreadsheet, with the same five-step dialog as the demo (choose a file, map columns, preview and fix rows, resolve duplicates, confirm). **Export CSV** downloads every tracked application in the same columns, so a file can be exported, edited, and imported back. No migration or environment variable is needed.

What happens on the server (`importTrackedApplications` in `src/server/actions/application-tracker-actions.ts`, `src/modules/applications/import-store.ts`):

- **Validated again.** The browser sends only the rows it can import and the duplicate choices. The server checks every value against the same limits as the file parser (`parseImportRequest` in `tracker-import.ts`: 500 rows, company 160 / role 200 / location 200 / notes 8,000 characters, real calendar dates, `http(s)` links only, known statuses) and never takes application ids from the request: duplicates and update targets are worked out from the database.
- **All or nothing.** The import runs in one `withUserDb` transaction, as the signed-in user under RLS. Any error rolls back every row, and the user is told nothing was imported.
- **One at a time, never twice.** A per-user advisory lock makes a second import (another tab) wait, then see the first one's rows as duplicates. Each import has an id, stored in its history events; a retry with the same id (say, after a dropped connection) is answered "already imported" and changes nothing.
- **Job links are optional.** Rows without a link import with none; every page that shows a link already handles a missing one.
- **Imported jobs are tracker records, not discoveries.** They are created with `match_pipeline_status = 'imported'` (`src/modules/jobs/imported-jobs.ts`) and left out of the job feed, the daily digest, dashboard job counts, getting-started progress, and rescoring; the match queue never picks them up. Applications from an import count everywhere applications count. If discovery later finds the same posting, it takes the job over as a normal discovered job. A row whose link matches a job the user has but does not track (from the feed, say) becomes that job's application instead of a second copy.
- **History.** Each new application gets an "Imported from spreadsheet" event (file name and row); each update gets "Updated from spreadsheet" with what changed. "Update" writes non-blank values only, never writes a guessed status, and changes a job's location, workplace, or link only for jobs the user entered (manually or by import), never for discovered ones.
- **No invented dates.** An applied date is set only when the file has one. Last activity starts at the import, so the 14-day "no activity" flag applies from then.
- **Limits.** The page allows 60 seconds (`maxDuration`); rows are written in batches of 100, so 500 rows take about 30 statements. Failures (another import still running, a timeout, a session that ended) come back as messages, not thrown errors, because Next.js hides thrown messages in production. Server logs start with `[import]`.

There is no undo for a signed-in import. Applications can be removed one at a time by deleting the job.

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

### Spreadsheet import database test (optional)

`src/test/integration/tracker-import-db.test.ts` runs the signed-in import against a real Postgres through `withUserDb`, with RLS: rollback, retries, concurrent imports, isolation between users, duplicates, and the feed and digest exclusions. Point it at a throwaway database set up as in [Supabase setup](#5-apply-security-policies-and-indexes) (`pnpm db:push`, then the SQL migrations). It writes and deletes its own rows.

```bash
RUN_DB_INTEGRATION=true DATABASE_URL=postgresql://… pnpm test src/test/integration/tracker-import-db.test.ts
```

### Compare tray database test (optional)

`src/test/integration/compare-db.test.ts` runs the signed-in compare tray and priorities against a real Postgres through `withUserDb`, with RLS: slot positions, the roles' numbers, location settings, other users' jobs and rows, deleted jobs, the four-slot check, and that saving leaves the rest of `search_preferences` alone. Set the database up as above, including `0025_compare_tray.sql`.

```bash
RUN_DB_INTEGRATION=true DATABASE_URL=postgresql://… pnpm test src/test/integration/compare-db.test.ts
```

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

Signed-in E2E tests require `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` in the environment. The demo E2E tests (`src/test/e2e/demo.spec.ts` and `demo-compare.spec.ts`) need no env vars.

## Stack

Next.js 15 · Supabase · Drizzle · OpenAI · Vitest · Playwright

## License

MIT — see [LICENSE](LICENSE).
