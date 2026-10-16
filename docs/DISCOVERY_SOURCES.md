# Discovery sources

The daily discover cron (08:00 UTC) polls saved boards, the curated Canada list, and the feeds below. Each target stays inside the same time budget as the existing curated batch. A source can be turned off in Settings. Adzuna is off until `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` are set and the user enables it.

Jobs are normalized into the existing job model. The same role from two sources collapses when the company, title, and location match, or when the canonical apply URL matches. A direct ATS link replaces an aggregator link. Job Bank postings stay on their own key because the open data file does not include the employer name.

Location import still uses the existing filter: remote anywhere in Canada (including worldwide remote), or hybrid/onsite in the Toronto/GTA.

## Apply migration 0021 before merge

`drizzle/migrations/0021_discovery_sources.sql` adds the new `job_source_provider` values, `search_preferences.enabled_discovery_sources`, and `jobs.dedupe_key` / `jobs.canonical_apply_url`, and restates row level security. It has not been applied. Run it in the Supabase SQL editor before merging. Do not run it from CI.

## ATS boards (public JSON, RSS, or XML)

Paste a company careers link on Discovery or Settings. Single-posting URLs are rejected.

| Source | Access | Notes |
| --- | --- | --- |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings` and the posting detail. No key for public postings. | Curated poll asks for `country=ca` and fetches at most 8 descriptions. Worldwide-remote roles tagged to another country are not in that list. |
| Workable | `GET https://www.workable.com/api/accounts/{account}?details=true` | Public account endpoint documented by Workable. Not the authenticated SPI. |
| Recruitee | `GET https://{company}.recruitee.com/api/offers/` | Paste only. No Canada employer was verified for the curated list. |
| BambooHR | `GET https://{company}.bamboohr.com/careers/list` and `/careers/{id}/detail` | At most 8 detail pages per board. |
| Teamtailor | `GET https://{subdomain}.teamtailor.com/jobs.rss` | Official jobs RSS. |
| Personio | `GET https://{company}.jobs.personio.de/xml?language=en` (or `.com`) | Official XML feed. Paste only. Personio's own board is EU-heavy and is not curated. |
| Rippling | `GET https://api.rippling.com/platform/api/ats/v1/board/{slug}/jobs` | This is the public job-board feed behind `ats.rippling.com`, not the authenticated Recruiting REST API. Detail fetches prefer Canada or worldwide remote and skip US-only remote. |

Curated additions that were checked against the live boards: Bosch Group (SmartRecruiters), Citylitics, AssistIQ, Export Development Canada, Providius (Workable), d1g1t (BambooHR), Teamtailor, and Rippling.

## Feeds

| Source | Access | ToS / attribution |
| --- | --- | --- |
| Job Bank Canada | Open Government CKAN dataset `ea639e28-c0fc-48bf-b5dd-b8899bd43072`. The cron picks the newest English CSV and reads at most 2 MB / 4,000 rows. | Open Government Licence – Canada. The monthly extract has no employer name and posting URLs can already be gone (HTTP 410). The partner XML feed is not public. The legacy RSS search endpoint is not used. |
| Remotive | `GET https://remotive.com/api/remote-jobs?category=software-dev` | Link to Remotive and name Remotive. Listings are not gated behind an extra email wall. Do not submit the jobs to another board. The API is delayed about 24 hours. |
| We Work Remotely | `https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss` | The stored listing is for this user's private feed. Apply goes to the We Work Remotely item link. WWR's API terms forbid storing the data for a competing public job board. |
| Himalayas | `GET https://himalayas.app/jobs/api/search` | No key on the public allowance. Apply uses the Himalayas `applicationLink`. A visible Himalayas credit is shown. One search page per poll. Empty `locationRestrictions` means worldwide and is kept; otherwise the list must include Canada. |
| Remote OK | `GET https://remoteok.com/api?tag=frontend` | A browser-like User-Agent is sent because the API rejects the default client. The job link is the Remote OK URL, and the card names Remote OK with a followed link. |
| Adzuna | `GET https://api.adzuna.com/v1/api/jobs/ca/search/1` with `app_id` and `app_key` | Off unless both env vars are set and Settings enables it. Each advert is labeled Adzuna and links to `https://www.adzuna.ca`. Predicted salaries are ignored. The key is not logged. |
