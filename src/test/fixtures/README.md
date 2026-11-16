# Test Fixtures

Seed data for development, spikes, and automated tests.

## Files

- `seed-profile.json` — fictional candidate profile for tests and local seeding
- `sample-resume.txt` — plain-text resume for parser tests
- `sample-resume-text.pdf` — text-based PDF generated from `sample-resume.txt` (`pnpm fixtures:pdf`)
- `sample-resume-corrupt.pdf` — invalid PDF for parser error-path tests
- `job-posts/` — 10 representative frontend job posts with expected classifications

## Usage

Fixtures are loaded by Vitest tests and can seed the development database via `pnpm db:seed`.
