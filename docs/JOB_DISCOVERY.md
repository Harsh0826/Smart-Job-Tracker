# Job Discovery Engine

Finds jobs **posted in the last 24 hours** on employer job boards, scores them against your Master
Resume, and saves the best 3–5 (score ≥ 70) into the tracker as `DISCOVERED`.

## How a posting is evaluated

```
fetch board (Greenhouse / Lever / Ashby public API)
  → normalize (posting-date provenance recorded)
  → Canada? ───────────── no → not_canada (not stored)
  → listed? ───────────── no → unlisted
  → original post time? ─ no → unverified_date
  → ≤ 24h old? ────────── no → stale
  → evergreen/talent pool? ─ yes → evergreen
  → already stored / repost / other-board duplicate? → duplicate | repost
  → score (35% skills · 20% experience · 20% responsibilities · 15% role · 10% location)
  → role relevance 0? ─── yes → irrelevant_role
  → score < 70? ───────── yes → below_threshold
  → shortlisted (top 5 by score, then recency) → tracker row (DISCOVERED)
```

| Source | Posting time used | Never used |
| --- | --- | --- |
| Greenhouse | `first_published` | `updated_at` (changes on every edit) |
| Lever | `createdAt` (publish ≥ create, so it's conservative) | — |
| Ashby | `publishedAt` | — |

Applicant counts are always stored as `null` and shown as "Unknown": none of these APIs expose them.

Repost detection is conservative. If a company has two live openings with the identical title and
city, the newer one is flagged as a repost.

## Setup

1. **Apply the migration.** In the Supabase dashboard, open the SQL editor and run
   `server/supabase/migrations/20261116000000_job_discovery.sql`. Or with the CLI:
   ```bash
   supabase db push
   ```
   It is additive and safe to re-run. It was tested on Postgres with `applications.status` as an enum,
   as a CHECK-constrained text column, and with uuid or bigint ids.
2. **Install and test.**
   ```bash
   cd server && npm install && npm test
   ```
3. **Upload your Master Resume profile.** This is the career-copilot `CareerProfile` JSON. Parse your
   resume with career-copilot (`POST /api/profile/parse`), review it, then:
   ```bash
   curl -X PUT "$API/api/profile/master" -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" -d '{"profile": {...}, "sourceFileName": "resume.pdf"}'
   ```
   Every save creates a new version; old versions are kept.
4. **Run it.**
   - Dashboard: **Discover → Run job search now**
   - CLI: `npm run discovery` (needs `DISCOVERY_USER_ID` and the Supabase env vars)
   - Preview without writing anything: `npm run discovery -- --dry-run --profile ./profile.json`

## Daily schedule (08:00 America/Toronto)

Pick **one** of these:

| Host | How |
| --- | --- |
| Always-on server (VM, Railway, Render paid, Fly) | `DISCOVERY_SCHEDULE_ENABLED=true` and `DISCOVERY_USER_ID=<uuid>` |
| Serverless / sleeping host | `.github/workflows/daily-discovery.yml`: add repo secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCOVERY_USER_ID` |
| Any cron | `cd server && npm run build && npm run discovery:prod` at 08:00 Toronto |

Runs are idempotent: a posting already stored is only touched (`last_seen_at`), never re-shortlisted
or overwritten. A per-user lock prevents overlapping runs.

## API (all require `Authorization: Bearer <supabase access token>`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/discovery/run` | Run now (rate-limited: 2 per 10 min) |
| GET | `/api/discovery/runs` | Last 20 runs with counts and board errors |
| GET | `/api/discovery/summary` | Dashboard counts |
| GET | `/api/discovery/jobs` | List. Query: `shortlisted=true\|false\|all`, `minScore`, `q`, `company`, `location`, `workArrangement`, `skill`, `postedWithinHours`, `includeArchived`, `limit`, `offset` |
| GET | `/api/discovery/jobs/:id` | Full record incl. stored JD and score breakdown |
| POST | `/api/discovery/jobs/:id/promote` | Add to tracker (idempotent; links an existing row with the same URL) |
| POST | `/api/discovery/jobs/:id/archive` | `{ "archived": true \| false }` |
| GET / PUT | `/api/profile/master` | Current Master Resume profile / save a new version |

Example `POST /api/discovery/run` response:
```json
{
  "runId": "4b0c…",
  "boardsQueried": 62,
  "boardErrors": [],
  "postingsFetched": 6562,
  "rejectedCounts": { "not_canada": 4548, "stale": 1966, "irrelevant_role": 29, "repost": 9, "below_threshold": 6 },
  "inserted": 2014,
  "closedPostings": 0,
  "expiredApplications": 0,
  "shortlisted": [
    {
      "discoveredJobId": "…", "applicationId": "…", "company": "…", "title": "…",
      "location": "Toronto, ON", "workArrangement": "hybrid", "postedAt": "2026-11-16T10:05:31.000Z",
      "ageHours": 2.9, "matchScore": 78, "applyUrl": "https://…", "workAuthorizationFlags": []
    }
  ],
  "nearMisses": [{ "company": "…", "title": "…", "matchScore": 64, "reason": "Score 64 < 70" }]
}
```

## Environment variables (server)

| Name | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes | Existing |
| `DISCOVERY_USER_ID` | for scheduler / CLI | Owner of the tracker |
| `DISCOVERY_SCHEDULE_ENABLED` | no (`false`) | In-process daily run |
| `DISCOVERY_SCHEDULE_TIME` / `DISCOVERY_SCHEDULE_TZ` | no (`08:00` / `America/Toronto`) | |
| `DISCOVERY_BOARDS_FILE` | no | Replace `src/discovery/board-list.json` |
| `NODE_ENV` | recommended `production` in prod | Hides DB error internals |

## Adding boards

Add `{ "provider": "greenhouse|lever|ashby", "token": "<slug>", "company": "Name", "website": "https://…" }`
to `server/src/discovery/board-list.json`. Find the slug in the company's careers links:
`job-boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>`.
