# Smart Job Tracker — Technical Audit & Roadmap

_Audit date: 2026-11-16 · Branch: `feature/job-discovery-engine` (from `add-career-copilot`)_

## 1. Architecture as found

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React 19 + Vite + TypeScript (`client/`) | Pages: login, register, applications, application detail, analytics. Axios client with Bearer token from `localStorage`. Deployed on Vercel. |
| Backend | Node.js + Express 5 + TypeScript (`server/`) | Routes: `/api/auth`, `/api/applications`, `/api/resumes`, `/api/ai`, `/api/analytics`. |
| Database | Supabase Postgres via `@supabase/supabase-js` with the **service-role key** | Tables used in code: `applications`, `resumes`, `application_analyses`, view `active_applications`. **No schema or migrations in the repo.** |
| Auth | Supabase Auth (`auth.getUser(token)`) | Not custom JWT; root `package.json` lists `bcrypt`/`jsonwebtoken` but nothing uses them. |
| Files | AWS S3 presigned PUT/GET (`terraform/` provisions a private, versioned, encrypted bucket) | PDF only, 10 MB limit checked after upload. |
| AI | `openai` SDK pointed at OpenRouter (`openai/gpt-oss-120b:free`) | One prompt: resume vs. JD → match score, skills, suggestions. |
| Career Copilot | Python FastAPI + Next.js (`career-copilot/`) | Resume parser → JD analyzer → tailor → truthfulness verifier → DOCX renderer → ATS linter/scorer, cover letter, interview prep. 47 tests, all passing. Not connected to the tracker. |
| Tests | Tracker: none. Copilot: 47 (pytest). | |

## 2. Findings

### Works
- Application CRUD with soft delete, per-user scoping on applications/resumes/AI routes.
- Presigned S3 upload/download with key-prefix and content-type checks.
- Resume-vs-JD AI analysis stored per application.
- Career Copilot's zero-hallucination tailoring pipeline (verifier rejects unsupported claims and numbers).

### Security issues (fixed on this branch)
| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| S1 | **Critical** | `/api/analytics/*` had no auth and queried **all users'** applications. | Auth required; queries scoped to `user_id`, excluding deleted rows. |
| S2 | **Critical** | `client/.env.example` told you to set `VITE_SUPABASE_SERVICE_ROLE_KEY`. Every `VITE_*` value is bundled into public JS; the service-role key bypasses all RLS. | Removed the variable and the unused `client/src/api/supabase.ts`. **If that variable was ever set in Vercel, rotate the service-role key in Supabase.** |
| S3 | High | `PATCH /api/applications/:id` spread `req.body` into the update: a client could rewrite `user_id`, `deleted_at`, `id`. | Field whitelist + status validation. |
| S4 | Medium | Error handler returned DB `details`/`hint`/`code` to clients and turned every error (incl. not-found / bad input) into 500. | 400/404/409 mapping; internals hidden when `NODE_ENV=production`. |
| S5 | Medium | No rate limiting on `/api/auth` (password guessing). | 20 req / 15 min per IP; discovery run 2 / 10 min per user. |
| S6 | Low | `Content-Disposition` built from the raw stored file name. | Quotes/CR/LF stripped. |

### Bugs
- **B1 (fixed):** analytics counted `SCREENING`, but the real status is `PHONE_SCREEN`, so "Screening" was always 0.
- **B2 (fixed):** 358 `node_modules` files were committed at the repo root. Now untracked + `.gitignore`.
- **B3 (open):** uploading a resume sets `is_active=false` on **all** of a user's resumes and **deletes the previous S3 object**, which loses resume history. Not changed yet because it alters existing behaviour. Recommended: stop deleting, rely on bucket versioning.
- **B4 (open):** `README` says `gpt-4o-mini`; code uses a free OpenRouter model. Free-tier models are rate-limited and may change.
- **B5 (open, pre-existing):** client lint has 4 errors (`any` in login/register, `setState` in effect in navbar).

### Architecture / scalability
- No migrations means schema drift can't be reviewed. New tables ship as a SQL migration (`server/supabase/migrations/`). Recommended: `supabase db pull` once, to capture the existing schema too.
- Service-role key everywhere: RLS is bypassed, so per-user scoping depends on every query remembering `.eq("user_id")`. New tables also get owner-only RLS policies as defence in depth.
- The tracker (Node) and Copilot (Python) share no data. The integration plan is below (Priority 3).

## 3. Implemented on this branch

**Priority 1–2: Foundation & intelligence (done, tested)**
- Job discovery engine (`server/src/discovery/`): Greenhouse, Lever and Ashby public board APIs, with 62 verified boards that have Canadian jobs.
- Strict 24h freshness. A posting is fresh only if the source exposes the original publish time (`first_published` / `createdAt` / `publishedAt`). `updated_at` is never used. Unknown dates are rejected as *unverified*.
- Evergreen/talent-pool detection, repost detection (same requisition, or same company+title+city seen earlier), cross-board duplicates, URL canonicalisation.
- Transparent 35/20/20/15/10 scoring with per-dimension explanations. The threshold is hard-floored at 70 and the shortlist caps at 5. Missing data never earns credit.
- Work-authorization flags (citizenship, PR, clearance, sponsorship wording) surfaced for manual review against your PGWP. The engine does not decide eligibility.
- Applicant counts are always `null` / "Unknown". No public API exposes them.
- Persistence: `discovered_jobs`, `discovery_runs`, `master_profiles` (versioned), `tailored_resumes` (versioned, schema ready), `application_events` (audit trail). Atomic, idempotent `promote_discovered_job` RPC creates the tracker row with status `DISCOVERED`. If you already added the same URL by hand, it links to that row instead of duplicating it.
- Lifecycle statuses added: `DISCOVERED, UNDER_REVIEW, READY_TO_APPLY, ASSESSMENT, FINAL_INTERVIEW, EXPIRED`. Existing values are untouched.
- Postings that disappear from a board are marked closed, and a linked tracker row that is still pre-application becomes `EXPIRED`.
- Daily 08:00 America/Toronto scheduling, in two forms: in-process (always-on hosts), or the CLI from GitHub Actions or a platform cron.
- Discover page: stats, filters, "Run job search now", score breakdown, missing skills, work-auth flags, the stored JD, and Add to tracker.

## 4. Roadmap (next)

| Priority | Item | Blocked on |
| --- | --- | --- |
| **P3** | Master Resume ingestion: upload → Copilot `/api/profile/parse` → review → `PUT /api/profile/master`. | **Your Master Resume.** |
| P3 | Tailored resume per shortlisted job via Copilot `/api/tailor` (verifier-gated). Store the result in `tailored_resumes` + S3: `resumes/{Company}/{Role}/vN/resume.{md,docx,pdf}` + `analysis.json`. | Master Resume. PDF needs a renderer (Copilot roadmap: Typst/Chromium). |
| P3 | ATS report (Copilot ATS scorer and linter) shown per job. Labelled a heuristic estimate. | Master Resume |
| P4 | Outreach kit: recruiter/EM search queries (no invented names), a ≤300-char connection note and a ≤150-word message grounded in verified facts. Cover letter via Copilot. | Master Resume |
| P4 | "Ready to Apply" checklist plus an explicit, logged approval step (`application_events`). No auto-submission. | — |
| P5 | Dashboard KPIs from real data: applications by week, conversion rates, top requested skills, sources. Resume comparison view. | — |
| P6 | Notifications (email/web push) for new ≥85 matches, closed postings and resumes ready for review. | Email provider choice |
| — | More sources: Workday (relative dates only, so always "unverified") and SmartRecruiters. LinkedIn/Indeed are **not** planned: no public job-search API, and their terms prohibit scraping. | — |
| — | Fix B3 (resume history), B5 (lint), capture the existing schema as a migration. | — |
