# Performance Baseline

Captured after Phase 1 instrumentation (`measureOperation`, `requestId`, `PERF_LOG=1`). Re-run locally after significant changes and update this document.

## How to capture

1. Start dev server with structured perf logs:
   ```bash
   PERF_LOG=1 pnpm dev
   ```
2. Open DevTools → Network for browser payload sizes.
3. Trigger each flow once; copy `type: "perf"` JSON lines from the terminal.

## Performance budgets (p95 targets, local dev)

| Flow | Server target | Payload target |
|------|---------------|----------------|
| Jobs feed (≤100 jobs) | DB+server < 500ms | < 150KB gzip |
| Job detail (single job) | < 800ms | 1 auth/transaction batch |
| Resume upload (cache hit) | < 2s | measure `payloadBytes` in action response |
| Resume upload (cache miss) | HTTP returns after extract; parse async | poll until `status !== processing` |
| Poll one board | User action returns immediately | match runs in background queue |

## Baseline snapshots

### Jobs feed (`action.getJobsFeed`)

| Metric | Before optimization | After Phase 1–2 |
|--------|---------------------|-----------------|
| Duration (ms) | _run and fill_ | _run and fill_ |
| DB query count | _run and fill_ | _run and fill_ |
| Payload bytes | _run and fill_ | _run and fill_ |
| Jobs returned | _run and fill_ | ≤50 per page |

**Notes:** Single fetch on `/jobs` page; `JobListItem` DTO excludes full descriptions and `raw_payload`.

### Job detail (`action.getJobDetailPageData`)

| Metric | Before | After |
|--------|--------|-------|
| Duration (ms) | _run and fill_ | _run and fill_ |
| Auth/transaction cycles | 6+ separate actions | 1 batched action |
| Tailoring/Q&A | Loaded upfront | Lazy-loaded on tab |

### Resume upload (`action.uploadResume`)

| Scenario | Duration (ms) | Notes |
|----------|---------------|-------|
| Cache hit | _run and fill_ | Re-upload same file hash |
| Cache miss (HTTP) | _run and fill_ | Returns while `processing`; OpenAI in `after()` |
| Background parse (`resume.completeParse`) | _run and fill_ | OpenAI 1–2 calls |

### Board poll (`action.pollSavedBoardNow`)

| Metric | Before | After |
|--------|--------|-------|
| User-facing duration | tens of seconds (sync match) | < 500ms (enqueue only) |
| Match processing | inline per job | `processMatchQueue` concurrency 3 |

## Database indexes (migration `0009_performance_pipeline.sql`)

- `match_analyses(job_id, created_at DESC)`
- `applications(user_id, job_id)`
- `jobs(user_id, match_pipeline_status)` partial where `match_pending`

Run on Supabase:

```sql
-- See drizzle/migrations/0009_performance_pipeline.sql
```

## EXPLAIN ANALYZE checklist

Run in Supabase SQL editor:

1. Latest match per job for feed pattern
2. Applications by user + job
3. Parsed resume cache lookup by `extraction_hash` + `parser_version`

## Regression guards

- `src/test/unit/performance-architecture.test.ts` — pagination, hash skip, async poll
- `src/test/unit/profile-wipe.test.ts` — FK detach before evidence delete
- `pnpm test` in CI

## Load fixtures

Seed synthetic data for manual profiling:

```bash
pnpm seed:performance-fixtures
```

Defaults: 200 jobs, 5 saved boards (metadata only; no live ATS calls).
