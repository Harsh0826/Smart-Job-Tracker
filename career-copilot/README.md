# Career Copilot

A multi-agent career assistant that tailors a resume to a job description. It never invents a
claim, and it checks that the result survives an ATS parser. It lives alongside the Smart Job Tracker
(`../client`, `../server`) in this repository.

## The guided journey

1. **Resume:** upload a PDF/DOCX/TXT file or paste text. It becomes your career profile, where every line
   is a citable fact.
2. **Target job:** paste the posting. Agents extract what the employer screens for, then tailor and
   verify.
3. **Review & edit:** interview readiness (60% ATS match + 40% bullet impact), what the ATS sees,
   skill gaps, and an inline editor. Every bullet shows an impact grade with concrete fixes, plus a ✨
   AI rewrite button (grounded suggestions only). Your edits are saved as your own claims and
   re-checked live.
4. **Strengthen:** the Gap Interviewer asks about missing skills, unquantified bullets and hard
   requirements. Answers become facts, the resume is re-tailored, and you see the score change.
5. **Cover letter:** 250–400 words built on your strongest matching evidence, every claim
   grounded. Copy or download.

## What the pipeline does

```
upload resume ─► Document Parser ─► Career Profile (every bullet has a fact id, e.g. e1.b2)
paste job    ─► JD Analyzer ─► weighted keywords
                       │
                       ▼
               Resume Tailor ──► Truthfulness Verifier ──(rejects: rewrite, max 2)──┐
                       ▲                                                            │
                       └────────────────────────────────────────────────────────────┘
                       │ passes
                       ▼
               Renderer (DOCX) ─► ATS Linter + parse round-trip ─► ATS Scorer ─► download
```

| Agent | File | LLM? |
| --- | --- | --- |
| Document Parser | `backend/app/agents/document_parser.py` | no |
| JD Analyzer | `backend/app/agents/jd_analyzer.py` | Claude Haiku 5.5 (heuristic fallback) |
| Resume Tailor | `backend/app/agents/resume_tailor.py` | Claude Opus 5.5 (heuristic fallback) |
| Truthfulness Verifier | `backend/app/agents/verifier.py` | no (rules) |
| Renderer | `backend/app/agents/renderer.py` | no |
| ATS Linter | `backend/app/agents/ats_linter.py` | no |
| ATS Scorer | `backend/app/agents/ats_scorer.py` | no |
| Bullet Coach | `backend/app/agents/bullet_coach.py` | grading: no · rewrites: Claude Opus 5.5 |
| Gap Interviewer | `backend/app/agents/gap_interviewer.py` | questions: rules · wording: Claude Haiku 5.5 |
| Cover Letter Writer | `backend/app/agents/cover_letter.py` | Claude Opus 5.5 (factual offline draft) |
| PII Guard + LLM gateway | `backend/app/agents/pii_guard.py`, `llm.py` | wraps all model calls |
| Orchestrator | `backend/app/orchestrator/workflow.py` | no |

Guarantees enforced in code, each covered by tests:

- The tailor can only write bullets, the summary and skill order. Titles, employers, dates and
  education are copied from the profile, so the model cannot change them.
- Every bullet must cite profile facts from the same role. Every number must appear in the cited
  facts. Every recognised skill must exist in the profile. Otherwise the draft is rejected, and after
  two rewrites it goes to the user instead of being exported.
- Export is blocked on tables, text boxes, images, header/footer text, multi-column layouts,
  hidden or white text, non-standard fonts, or a parse round-trip below 95% field accuracy.
- Missing JD keywords are shown as skill gaps and are never inserted.
- Contact details are never sent to the model. Other text passes through PII redaction, and job
  postings are wrapped as untrusted data.

## Run it

Backend (Python 3.12+, [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
uv sync
uv run pytest
uv run uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000, upload a PDF/DOCX/TXT resume, paste a job description, and press
**Tailor resume**.

### Using Claude

Without credentials the app runs fully offline: heuristic JD extraction, and tailoring by
relevance reordering. To use Claude, copy `backend/.env.example` to `backend/.env` and set
`ANTHROPIC_API_KEY`, or set `LLM_MODE=anthropic` to use an `ant auth login` profile.

- Main tier `claude-opus-5-5` (tailoring) runs with structured outputs, prompt caching on the
  system prompt, `effort: high`, and server-side refusal fallback (`fallbacks: "default"`).
- Worker tier `claude-haiku-5-5` (JD extraction) runs with `effort: low`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Status and active LLM mode |
| POST | `/api/profile/parse` | Multipart resume upload → `CareerProfile` |
| POST | `/api/jd/analyze` | `{text}` → `JDAnalysis` |
| POST | `/api/tailor` | `{profile, jd_text}` → resume, verification, lint, score, export URL |
| POST | `/api/score` | `{resume, jd}` → `ATSScore` |
| POST | `/api/resume/review` | Re-check a user-edited resume (edits become user-stated facts) |
| POST | `/api/interview/questions` | `{profile, jd}` → gap questions |
| POST | `/api/interview/answers` | `{profile, answers}` → updated profile + what changed |
| POST | `/api/coach/rewrite` | Grounded rewrite suggestions for one bullet (needs Claude) |
| POST | `/api/cover-letter` | `{profile, jd, company, company_notes, tone}` → letter + grounding issues |
| POST | `/api/resume/export` | `{profile, resume, jd}` → DOCX rendered on demand (re-verified; nothing stored) |

Interactive docs: http://localhost:8000/docs

## Next steps (from the roadmap)

- **Persistence:** Postgres + pgvector for profiles, versions and artifacts (today the profile lives
  in the browser and exports are rendered on demand). S3 + KMS once files need to be stored.
- **PDF export:** text-layer PDF via Typst or headless Chromium.
- **Verifier:** an LLM-as-judge pass for paraphrase drift ("led" vs "contributed to").
- **Matching:** TF-IDF weighting over a JD corpus. A real taxonomy (ESCO / O*NET / Lightcast)
  plus embeddings in place of the in-code synonym table.
- **Beta agents:** Job Sourcing (Greenhouse/Lever board APIs, Adzuna, USAJobs), Job Matcher,
  Interview Prep (likely questions + STAR stories from your facts), Application tracker.
- **Orchestration:** Temporal workflows, auth, golden-set evals in CI.
