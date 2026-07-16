# Company Registry (1,000+ Verified ATS Boards)

Technical reference for the ATS company discovery, verification, and registry pipeline.

## Current state (July 2026)

| Metric | Value |
|--------|-------|
| Total registry entries | ~15,700 (candidates + verified + failed) |
| **Verified active boards** | **1,700** |
| Greenhouse verified | 557 |
| Ashby verified | 940 |
| Lever verified | 203 |
| Estimated active jobs (sum `lastJobCount`) | ~45,000+ |
| Schema version | 2 |

Verified distribution reflects **live API results**, not quotas.

## Problem with V1 tags

The original ~96-company seed assigned `remote-canada` and `frontend-heavy` to **every** company by default (`scripts/seed-candidates.ts` `baseTags`). That conflated:

1. **Company metadata** (industry, HQ country) — OK to store statically
2. **Observed job signals** (has Canada jobs, has React jobs) — must come from live job inspection
3. **Candidate relevance** — must be computed at poll/match time, not stored as company tags

Schema v2 removes candidate-specific tags. Signals are derived from published jobs after verification.

## Registry schema (v2)

See [`data/company-sources.schema.ts`](../data/company-sources.schema.ts).

Key fields:

- `companySlug`, `boardSlug`, `atsProvider`, `boardUrl` — identity
- `headquartersCountry`, `industries[]` — company-level metadata only
- `verificationStatus` — `verified | empty | invalid | unavailable | rate_limited | verification_failed`
- `verifiedAt`, `lastJobCount`, `verificationError`, `lastSyncedAt`
- `observedSignals` — counts and booleans from job inspection (not permanent relevance tags)
- `discoverySource` — which pipeline produced the candidate

Runtime catalog reads [`data/company-sources.verified.json`](../data/company-sources.verified.json) (verified-only export) for fast Settings UI loading.

## Pipeline architecture

```
Discovery Sources          Verification              Registry
─────────────────         ─────────────             ────────
SeedFileDiscovery    ──┐
CommonCrawlSlugs     ──┼──► Dedupe (provider+slug) ──► Live API verify ──► Job signal extract ──► seed.json
AtsUrlImport         ──┘                              (per provider)         (deterministic)      verified.json
CareerPage (future)
```

### Discovery sources

| Source | File / path | Description |
|--------|-------------|-------------|
| `existing-seed` | `data/company-sources.seed.json` | Preserves curated entries |
| `feashliaa-common-crawl-*` | `data/discovery/sources/*_slugs.json` | ~15k slugs from [Feashliaa/job-board-aggregator](https://github.com/Feashliaa/job-board-aggregator) Common Crawl harvest — **candidates only** |
| `ats-url-import` | `data/discovery/imports/*.json` | Manual/imported ATS URLs |

### Verification

Each board is checked against the provider public API:

| Provider | Endpoint |
|----------|----------|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` |
| Lever | `api.lever.co/v0/postings/{slug}?mode=json` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{slug}` |

Success requires: board exists, valid JSON structure, **≥1 published job**.

Failed boards are **retained** with status (`invalid`, `empty`, etc.) — not deleted.

### Job signal analysis

[`src/modules/discovery/registry/job-signals.ts`](../src/modules/discovery/registry/job-signals.ts) — deterministic rules on normalized jobs:

- **Canada**: explicit location patterns (Toronto, Ontario, `Remote - Canada`, etc.)
- **Remote classification**: `remote-canada` vs `remote-global` vs `remote-us` vs `remote-unknown` — generic "Remote" does **not** imply Canada
- **Frontend**: title patterns + tech co-occurrence (React/TypeScript in title+description)
- **Counts**: `frontendJobCount`, `canadaJobCount`, `remoteCanadaJobCount`, etc.

### Candidate relevance (not in registry)

Registry → poll jobs → `pre-import-filter.ts` (deterministic) → match engine → AI only for shortlisted jobs.

No OpenAI on all ~28k active jobs.

## Commands

```bash
# Audit + migrate legacy schema/tags
pnpm audit:registry

# Merge discovery candidates into full registry
pnpm discover:companies

# Verify boards (provider-aware targets)
pnpm verify:registry --write --target=1000
pnpm verify:registry --write --provider=greenhouse --target=550
pnpm verify:registry --write --provider=lever --target=200

# Legacy alias
pnpm verify:boards --write
```

## Original seed audit (pre-expansion)

| Finding | Detail |
|---------|--------|
| Total | 96 companies |
| Providers | 59 GH · 34 Ashby · 3 Lever |
| Board duplicate | `lever:palantir` (2 IDs) |
| Bad tags | 96/96 had `remote-canada`, 96/96 `frontend-heavy` (unverified assumptions) |

## Operational risks

| Risk | Mitigation |
|------|------------|
| Ashby rate limits | Lower concurrency (5), 400ms delay |
| Large seed JSON (~200k lines) | Export `company-sources.verified.json` for runtime |
| Common Crawl slug noise | `isPlausibleBoardSlug()` filters junk; verification rejects invalid |
| Stale jobs | `lastSyncedAt` + content hash (future sync phase) |
| Provider churn | Re-run `verify:registry --reverify` periodically |

## Implementation phases

| Phase | Status |
|-------|--------|
| Schema v2 + tag separation | Done |
| Discovery sources + dedup | Done |
| Verification pipeline + signals | Done |
| 1,000+ verified boards | Done (1,001) |
| Provider balance (GH/Lever) | Documented — run scoped `verify:registry` |
| DB-backed registry (V2.1) | Done — JSON fallback + `pnpm seed:company-registry` |
| Background board sync + job hashing | Partial — `description_hash` on import |
| Career page ATS detection source | Deferred |

## Files

| Path | Role |
|------|------|
| `data/company-sources.schema.ts` | Zod schema |
| `data/company-sources.seed.json` | Full registry (all statuses) |
| `data/company-sources.verified.json` | Verified-only catalog export |
| `src/modules/discovery/registry/` | Core pipeline modules |
| `scripts/audit-registry.ts` | Audit + migrate |
| `scripts/discover-companies.ts` | Merge candidates |
| `scripts/verify-registry.ts` | Batch verify + export |
