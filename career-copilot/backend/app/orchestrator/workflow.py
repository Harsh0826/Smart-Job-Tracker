"""Orchestration for the tailor journey.

TailorWorkflow:  JD analysis -> tailor -> verify (rewrite loop) -> review
review():        verify -> coach -> render -> ATS lint + round-trip -> score -> readiness
                 (also used when the user edits the resume in the review screen)

Each step is a pure function of typed inputs, so moving steps onto Temporal activities later is a
wrapper, not a rewrite.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.agents.ats_linter import ATSLinter
from app.agents.ats_scorer import score_resume
from app.agents.bullet_coach import coach_resume
from app.agents.jd_analyzer import JDAnalyzer
from app.agents.renderer import render_docx
from app.agents.resume_tailor import ResumeTailor
from app.agents.verifier import verify
from app.ats import taxonomy
from app.schemas.coaching import CoachReport
from app.schemas.jd import JDAnalysis
from app.schemas.profile import CareerProfile, ProfileBullet
from app.schemas.reports import ATSScore, LintReport, VerificationReport
from app.schemas.resume import Resume

Status = Literal["ready", "needs_user_review"]
READINESS_WEIGHTS = (0.6, 0.4)  # ATS match, bullet impact


@dataclass
class StepLog:
    agent: str
    detail: str


@dataclass
class TailorResult:
    status: Status
    jd: JDAnalysis
    profile: CareerProfile
    resume: Resume
    verification: VerificationReport
    lint: LintReport | None
    score: ATSScore
    coach: CoachReport
    readiness: float
    docx: bytes | None
    attempts: int = 1
    log: list[StepLog] = field(default_factory=list)


def absorb_user_edits(profile: CareerProfile, resume: Resume) -> tuple[CareerProfile, Resume]:
    """Bullets the user wrote or edited become user-stated facts, so they stay verifiable."""
    profile, resume = profile.model_copy(deep=True), resume.model_copy(deep=True)
    profile.skills = taxonomy.dedupe(profile.skills)
    resume.skills = taxonomy.dedupe(resume.skills)
    index = profile.bullet_index()
    for exp in resume.experiences:
        src = profile.experience(exp.id)
        exp.bullets = [b for b in exp.bullets if b.text.strip()]
        if src is None:
            continue
        for b in exp.bullets:
            b.text = b.text.strip()
            if not b.user_edited:
                continue
            b.user_edited = False
            if b.text in [index[s][1].text for s in b.source_ids if s in index]:
                continue
            n = sum(x.id.startswith(f"{src.id}.u") for x in src.bullets) + 1
            fact = ProfileBullet(id=f"{src.id}.u{n}", text=b.text, source="user_stated")
            src.bullets.append(fact)
            b.source_ids = [fact.id]
    return profile, resume


def review(
    profile: CareerProfile, resume: Resume, jd: JDAnalysis, attempts: int = 1, log: list[StepLog] | None = None
) -> TailorResult:
    log = list(log or [])
    verification = verify(resume, profile)
    coach = coach_resume(resume)
    unmet = [k for k in jd.knockout_criteria if profile.attestations.get(k) is False]
    lint = docx = None
    if verification.passed:
        docx = render_docx(resume)
        lint = ATSLinter().run(resume, docx)
        log.append(StepLog("ats_linter", f"parse fidelity {lint.parse_fidelity:.0%}, passed={lint.passed}"))
    score = score_resume(resume, jd, lint, unmet)
    readiness = round(READINESS_WEIGHTS[0] * score.total + READINESS_WEIGHTS[1] * coach.overall, 1)
    log.append(StepLog("ats_scorer", f"{score.total} ({score.band})"))
    log.append(StepLog("bullet_coach", f"impact {coach.overall}"))
    ready = verification.passed and lint is not None and lint.passed
    return TailorResult(
        status="ready" if ready else "needs_user_review",
        jd=jd, profile=profile, resume=resume, verification=verification, lint=lint, score=score,
        coach=coach, readiness=readiness, docx=docx if ready else None, attempts=attempts, log=log,
    )


class TailorWorkflow:
    def __init__(self, analyzer: JDAnalyzer, tailor: ResumeTailor, max_rewrites: int = 2):
        self.analyzer = analyzer
        self.tailor = tailor
        self.max_rewrites = max_rewrites

    def run(self, profile: CareerProfile, jd_text: str | None = None, jd: JDAnalysis | None = None) -> TailorResult:
        log: list[StepLog] = []
        profile = profile.model_copy(update={"skills": taxonomy.dedupe(profile.skills)})
        if jd is None:
            jd = self.analyzer.run(jd_text or "")
            log.append(StepLog("jd_analyzer", f"{len(jd.keywords)} keywords"))

        feedback: list[str] | None = None
        attempts = 0
        resume = None
        for attempts in range(1, self.max_rewrites + 2):
            resume = self.tailor.run(profile, jd, feedback)
            verification = verify(resume, profile)
            log.append(StepLog("truthfulness_verifier",
                               f"attempt {attempts}: {len(verification.feedback())} unsupported claims"))
            if verification.passed:
                break
            feedback = verification.feedback()
        assert resume is not None
        # Never export unverified claims: if rewrites ran out, review() returns needs_user_review
        # with the flagged spans for the user to fix in the editor.
        return review(profile, resume, jd, attempts, log)
