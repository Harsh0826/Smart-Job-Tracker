"""ATS Scorer agent (deterministic).

ATS_Score (0-100) =
    40 x weighted_coverage(must_have)
  + 15 x weighted_coverage(nice_to_have + tools + certifications)
  + 15 x placement_score        bullet 1.0 (recency-weighted) > summary 0.7 > skills list 0.5
  + 10 x title_seniority_alignment
  + 10 x parse_fidelity
  + 10 x structure_score
  - stuffing_penalty            any term > 4 occurrences, or repeated-keyword density > 3%
  then capped at 60 when a knockout requirement is confirmed unmet.

This is an estimate: ATS vendors do not publish ranking logic, and recruiters mostly search/filter.
"""

from __future__ import annotations

import re

from app.ats import taxonomy
from app.ats.dates import months_between
from app.schemas.jd import JDAnalysis, Keyword
from app.schemas.reports import ATSScore, LintReport
from app.schemas.resume import Resume

RECENCY = (1.0, 0.85)
RECENCY_FLOOR = 0.7
STUFFING_MAX_OCCURRENCES = 4
STUFFING_PENALTY_PER_TERM = 4.0
STUFFING_PENALTY_CAP = 12.0
DENSITY_LIMIT = 0.03
KNOCKOUT_CAP = 60.0
TITLE_EQUIV = {"developer": "engineer", "sr": "senior", "jr": "junior", "mgr": "manager"}
TITLE_STOP = {"of", "and", "the", "for", "a", "an", "-", "/", "&"}


def _recency(index: int) -> float:
    return RECENCY[index] if index < len(RECENCY) else RECENCY_FLOOR


def _placement(kw: Keyword, resume: Resume) -> float:
    for i, text in resume.bullet_text():
        if taxonomy.contains(kw.term, text):
            return _recency(i)
    if resume.summary and taxonomy.contains(kw.term, resume.summary):
        return 0.7
    if any(taxonomy.contains(kw.term, s) for s in resume.skills):
        return 0.5
    return 0.0


def _coverage(found: dict[str, float], keywords: list[Keyword]) -> float:
    total = sum(k.weight for k in keywords)
    if total == 0:
        return 1.0
    return sum(k.weight for k in keywords if found[k.term] > 0) / total


def _title_tokens(title: str) -> set[str]:
    words = re.findall(r"[a-z0-9+#]+", title.lower())
    return {TITLE_EQUIV.get(w, w) for w in words if w not in TITLE_STOP}


def _alignment(resume: Resume, jd: JDAnalysis) -> float:
    if not resume.experiences:
        return 0.0
    a, b = _title_tokens(jd.title), _title_tokens(resume.experiences[0].title)
    title = len(a & b) / min(len(a), len(b)) if a and b else 0.0
    years = 1.0
    if jd.years_required:
        months = sum(months_between(e.start, e.end) for e in resume.experiences)
        years = min(1.0, months / 12 / jd.years_required)
    return 0.6 * title + 0.4 * years


def _structure(lint: LintReport | None) -> float:
    if lint is None:
        return 1.0
    errors = sum(v.severity == "error" for v in lint.violations)
    warnings = sum(v.severity == "warning" for v in lint.violations)
    return max(0.0, 1.0 - 0.25 * errors - 0.05 * warnings)


def _full_text(resume: Resume) -> str:
    parts = [resume.summary or "", *(t for _, t in resume.bullet_text()), ", ".join(resume.skills)]
    parts += [e.title for e in resume.experiences]
    return "\n".join(parts)


def score_resume(
    resume: Resume,
    jd: JDAnalysis,
    lint: LintReport | None = None,
    unmet_knockouts: list[str] | None = None,
) -> ATSScore:
    found = {k.term: _placement(k, resume) for k in jd.keywords}
    must = [k for k in jd.keywords if k.category == "must_have"]
    other = [k for k in jd.keywords if k.category in {"nice_to_have", "tool", "certification"}]
    total_w = sum(k.weight for k in jd.keywords)
    placement = sum(k.weight * found[k.term] for k in jd.keywords) / total_w if total_w else 1.0

    text = _full_text(resume)
    counts = {k.term: taxonomy.count(k.term, text) for k in jd.keywords}
    stuffed = sorted(t for t, n in counts.items() if n > STUFFING_MAX_OCCURRENCES)
    penalty = min(STUFFING_PENALTY_CAP, STUFFING_PENALTY_PER_TERM * len(stuffed))
    tokens = max(1, len(re.findall(r"\w+", text)))
    if sum(max(0, n - 2) for n in counts.values()) / tokens > DENSITY_LIMIT:
        penalty = min(STUFFING_PENALTY_CAP, penalty + 5.0)

    components = {
        "must_have_coverage": round(_coverage(found, must), 3),
        "other_coverage": round(_coverage(found, other), 3),
        "placement": round(placement, 3),
        "title_seniority_alignment": round(_alignment(resume, jd), 3),
        "parse_fidelity": lint.parse_fidelity if lint else 1.0,
        "structure": round(_structure(lint), 3),
        "stuffing_penalty": penalty,
    }
    total = (
        40 * components["must_have_coverage"]
        + 15 * components["other_coverage"]
        + 15 * components["placement"]
        + 10 * components["title_seniority_alignment"]
        + 10 * components["parse_fidelity"]
        + 10 * components["structure"]
        - penalty
    )
    if unmet_knockouts:
        total = min(total, KNOCKOUT_CAP)
    total = round(max(0.0, min(100.0, total)), 1)
    band = "strong" if total >= 80 else "tailor_further" if total >= 65 else "weak_fit"
    return ATSScore(
        total=total,
        band=band,
        components=components,
        missing_keywords=[k for k in jd.keywords if found[k.term] == 0],
        stuffed_terms=stuffed,
        knockouts_to_confirm=jd.knockout_criteria,
    )


class ATSScorer:
    name = "ats_scorer"

    def run(self, resume: Resume, jd: JDAnalysis, lint: LintReport | None = None) -> ATSScore:
        return score_resume(resume, jd, lint)
