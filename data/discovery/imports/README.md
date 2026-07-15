# ATS URL imports

Drop JSON files here to add discovery candidates. Each file can be:

**Array format:**
```json
[
  {
    "companyName": "Example Co",
    "atsProvider": "greenhouse",
    "boardSlug": "exampleco",
    "boardUrl": "https://boards.greenhouse.io/exampleco",
    "headquartersCountry": "CA",
    "industries": ["saas"]
  }
]
```

**Or wrapped:**
```json
{
  "candidates": [ ... ]
}
```

Run `pnpm discover:companies` to merge imports into the registry, then `pnpm verify:registry --write` to verify boards.

Sources for URLs: career page inspection, search results, curated lists, job postings. Do not fabricate slugs.
