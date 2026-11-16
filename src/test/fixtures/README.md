# Test Fixtures

Seed data for development, spikes, and automated tests.

## Files

- `seed-profile.json` — fictional candidate profile for tests and local seeding
- `sample-resume.txt` — plain-text resume for parser tests
- `sample-resume-text.pdf` — text-based PDF generated from `sample-resume.txt` (`pnpm fixtures:pdf`)
- `sample-resume-corrupt.pdf` — invalid PDF for parser error-path tests
- `job-posts/` — 10 representative frontend job posts with expected classifications
- `tracker-import/job-tracker.csv` — a personal job-tracker spreadsheet (fictional companies) for trying **Import CSV** on the demo tracker at `/demo/applications`. It exercises every step: headers that need mapping plus two columns to leave out (Salary Range, Recruiter); statuses in spreadsheet wording ("Phone screen", "Offer received", "Wishlist", "Withdrew"); ISO, US, and month-name dates; a multi-line note, a note starting with `-`, and accented text; an empty row; rows missing a company or a role (skipped); unreadable values that import with notes (status "Ghosted", date "next week", workplace "Flexible", link "TBD"); rows matching the demo's two seeded applications (Harbourline, Civic Form) and a repeat of an earlier posting by link; and a row naming an untracked sample job (Northwind Labs). Against a fresh demo, the defaults add 11 applications and skip 3 duplicates and 2 invalid rows. The expected results are pinned in `src/test/unit/demo-import.test.ts`.

## Usage

Fixtures are loaded by Vitest tests and can seed the development database via `pnpm db:seed`.
