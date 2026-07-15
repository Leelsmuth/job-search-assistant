# Private-First Job Search Assistant Product Spec

## Product Positioning

This application helps a job seeker review, match, prepare, and track job applications with evidence-backed AI assistance. It is not an auto-apply bot and should not optimize for submitting the largest possible number of applications.

The first product should optimize for one high-value loop:

1. Maintain a structured candidate profile.
2. Import a real job post.
3. Extract the role's requirements.
4. Compare requirements against verified candidate evidence.
5. Explain fit, gaps, and application preparation steps.
6. Track the role through the application process.

## Primary User

The initial user is a frontend-focused software engineer with strong React and TypeScript experience.

Initial search preferences:

- Remote Canada preferred
- Primarily remote roles
- Canadian roles preferred
- Frontend Engineer, Senior Frontend Engineer, or Software Engineer roles with meaningful frontend ownership
- Full stack only when frontend remains central
- React and TypeScript ecosystem preferred

The product must make this profile editable. These values can seed the MVP, but they should not become permanent hardcoded assumptions.

## Product Principles

- Private-first: resume, work history, and application answers are sensitive personal data.
- Human-reviewed: the user reviews generated matches, resumes, and answers before using them.
- Evidence-backed: every positive claim about the candidate should trace to resume/profile evidence.
- Transparent scoring: match scores must be explainable and decomposed by category.
- No fabricated experience: if evidence is missing, say that it is missing.
- Practical ingestion: prioritize job sources with public APIs or stable public job pages.
- SaaS-capable later: design for user isolation and relational ownership, but do not overbuild billing, teams, or admin features in the MVP.

## MVP Scope

The MVP should include:

- Authentication
- Candidate profile
- Resume upload/import for PDF and DOCX
- Editable extracted profile suggestions
- Manual job import by URL or pasted description
- Normalized job records
- Requirement extraction
- Transparent match analysis
- Evidence mapping
- Job feed
- Job detail page
- Saved jobs
- Basic application tracker
- Resume tailoring suggestions
- Application question drafting

The MVP should not include automated recurring job discovery. Add that only after manual import and matching are useful.

## MVP Non-Goals

Do not build these yet:

- Mass auto-apply
- LinkedIn scraping dependency
- Browser extension
- Playwright-driven form submission
- Fully generated tailored resume documents
- Multi-user SaaS billing
- Team or organization accounts
- Recruiter CRM features
- Email automation
- Complex analytics dashboard
- Company enrichment datasets
- Automated networking recommendations
- Advanced browser-assisted application workflows

## User Workflows

### 1. Onboarding

The user signs in and creates or imports their profile.

MVP flow:

1. Sign in.
2. Upload resume or skip.
3. Extract resume text.
4. Generate structured profile suggestions.
5. Review and edit extracted details.
6. Save candidate profile.

The user must see extracted data before it affects matching.

### 2. Candidate Profile Management

The profile should be structured, not one large text blob.

Profile sections:

- Personal basics
- Location and work authorization
- Target titles
- Seniority preferences
- Remote/location preferences
- Salary preferences, optional
- Skills
- Frameworks and libraries
- Languages
- Testing tools
- Cloud/platform experience
- Employment history
- Projects
- Achievements
- Education
- Deal breakers
- Raw resume text

Each profile fact that could support a match should be able to link to an evidence record.

### 3. Resume Import

Supported MVP formats:

- PDF
- DOCX

Resume import should produce:

- Original uploaded file
- Extracted text
- Parsed structured suggestions
- User-approved profile updates

MVP should support one master resume document. Multiple resume versions can be represented lightly as metadata, but full resume version management is V1.

### 4. Manual Job Import

The user can add a job by:

- Pasting a job URL
- Pasting a job description
- Manually creating a job record

For URLs, the system attempts to detect the source adapter. If no adapter matches, fallback to generic page extraction or user-provided description.

### 5. Job Normalization

Imported jobs should normalize into:

- Company
- Title
- Location
- Workplace type
- Salary range
- Job URL
- Source
- Source job ID
- Date posted
- Description
- Responsibilities
- Required qualifications
- Preferred qualifications
- Technologies
- Experience requirements
- Education requirements
- Employment type

The app should preserve raw source data for debugging and future reprocessing.

### 6. Match Analysis

Match analysis should answer:

- Is this worth reviewing?
- Why is it a fit?
- What are the strongest matches?
- What is only partially supported?
- What is missing from the candidate evidence?
- Are there hard blockers?
- What resume/application preparation would help?

The UI should distinguish:

- Confirmed experience
- Inferred transferable experience
- Missing evidence
- Actual qualification gap
- Hard requirement warning

### 7. Job Feed

The feed should help review many roles quickly.

Job card fields:

- Title
- Company
- Location
- Remote/hybrid status
- Salary, if known
- Source
- Posted/discovered date
- Match classification
- Match score
- Top matching skills
- Top concern or gap
- Saved state
- Application status

Filters:

- Minimum match score
- Match classification
- Remote only
- Canada only
- Title
- Seniority
- Technology
- Company
- Date posted
- Has salary
- Source
- Application status

Sorting:

- Best match
- Most recent
- Highest salary
- Recently discovered

### 8. Job Detail

The detail page should show:

- Normalized job data
- Original description
- Overall match
- Category score breakdown
- Hard filter warnings
- Strong matches
- Partial matches
- Gaps
- Evidence from candidate profile
- Tailoring suggestions
- Application question drafts
- Application tracking controls

### 9. Resume Tailoring Suggestions

The MVP should not generate a complete resume document.

It should generate reviewable suggestions:

- Which existing bullets to emphasize
- Suggested factual rewrites
- Suggested ordering changes
- Missing evidence warnings
- Role-specific keywords already supported by evidence
- Role-specific keywords not supported by evidence

Each suggestion should include:

- Original text
- Suggested text
- Evidence source
- Confidence
- User decision: pending, accepted, rejected

### 10. Application Question Assistant

The user can paste or enter application questions.

The system drafts answers using:

- Candidate profile
- Evidence records
- Job description
- Company/job context available from the imported post

Every draft should be editable and should avoid unsupported claims.

### 11. Application Tracking

Statuses:

- Discovered
- Reviewing
- Saved
- Preparing
- Ready to Apply
- Applied
- Recruiter Screen
- Technical Interview
- Final Interview
- Offer
- Rejected
- Withdrawn

Track:

- Date discovered
- Date saved
- Date applied
- Resume used
- Job URL
- Notes
- Recruiter
- Interview dates
- Salary
- Follow-up date

MVP should provide a table/list. Kanban is useful but can follow once the data model is stable.

## V1 Features

Add after the MVP proves the manual import and match loop:

- Greenhouse ingestion adapter
- Lever ingestion adapter
- Ashby ingestion adapter, if spike succeeds
- Saved company list
- Lightweight recurring discovery from selected ATS boards
- Multiple resume versions
- Accept/reject tailoring workflow
- Kanban tracker
- Basic dashboard metrics
- Match analysis re-run/version history
- Search across imported jobs
- Export application data

## Later Features

- Browser extension
- Browser-assisted application workflow
- Direct ATS application helpers where explicitly supported
- Workday adapter if practical
- Advanced company enrichment
- Recruiter/contact tracking
- Email/calendar integrations
- SaaS billing
- Team/admin features
- Multi-tenant admin console
- Mobile app

## Success Criteria For MVP

The MVP is successful if the user can:

- Import their resume.
- Approve a structured profile.
- Import 10-20 real job posts manually.
- See trustworthy match analysis for each.
- Quickly sort jobs into worth applying, maybe, or skip.
- See exactly what evidence supports each match.
- Generate useful resume tailoring suggestions without fabricated experience.
- Track applications through basic statuses.

## Product Risks

- Match scores feel arbitrary.
- AI invents experience.
- Resume parsing quality is poor.
- Job extraction fails on messy posts.
- The app becomes a tracker before matching is useful.
- Automated discovery distracts from core product fit.
- Sensitive data is sent to services without clear boundaries.
- The product overfits to one candidate and becomes hard to generalize.

## Product Decisions

- Start with manual job import, not automated discovery.
- Start with one master resume, not full resume version management.
- Start with suggestions, not complete resume generation.
- Start with list/table tracking, not a polished analytics dashboard.
- Make evidence mapping a first-class concept from the beginning.
- Treat AI as an assistant inside a deterministic product, not the product itself.
