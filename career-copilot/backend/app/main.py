"""HTTP API for the guided journey: resume -> job -> review & score -> strengthen -> cover letter."""

from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from app.agents.ats_scorer import score_resume
from app.agents.bullet_coach import suggest_rewrites
from app.agents.cover_letter import write_cover_letter
from app.agents.document_parser import DocumentParser, UnsupportedFileType
from app.agents.gap_interviewer import apply_answers, generate_questions
from app.agents.interview_prep import build_prep, grade_answer
from app.schemas.prep import AnswerFeedback, InterviewPrep
from app.agents.jd_analyzer import JDAnalyzer
from app.agents.llm import LLMError, build_llm
from app.agents.renderer import DOCX_MEDIA_TYPE, export_filename
from app.agents.resume_tailor import ResumeTailor
from app.config import get_settings
from app.orchestrator.workflow import TailorResult, TailorWorkflow, absorb_user_edits, review
from app.schemas.coaching import CoachReport, CoverLetterResult, GapAnswer, GapQuestion
from app.schemas.jd import JDAnalysis
from app.schemas.profile import CareerProfile
from app.schemas.reports import ATSScore, LintReport, VerificationReport
from app.schemas.resume import Resume, ResumeBullet

MAX_UPLOAD_BYTES = 5 * 1024 * 1024

settings = get_settings()
llm = build_llm(settings)
app = FastAPI(title="Career Copilot API", version="0.2.0")
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"]
)


class JDRequest(BaseModel):
    text: str


class TailorRequest(BaseModel):
    profile: CareerProfile
    jd_text: str | None = None
    jd: JDAnalysis | None = None


class ReviewRequest(BaseModel):
    profile: CareerProfile
    resume: Resume
    jd: JDAnalysis


class ScoreRequest(BaseModel):
    resume: Resume
    jd: JDAnalysis


class QuestionsRequest(BaseModel):
    profile: CareerProfile
    jd: JDAnalysis


class AnswersRequest(BaseModel):
    profile: CareerProfile
    answers: list[GapAnswer]


class AnswersResponse(BaseModel):
    profile: CareerProfile
    applied: list[str]


class RewriteRequest(BaseModel):
    profile: CareerProfile
    experience_id: str
    bullet: ResumeBullet
    jd: JDAnalysis


class RewriteResponse(BaseModel):
    available: bool
    suggestions: list[ResumeBullet]
    message: str | None = None


class CoverLetterRequest(BaseModel):
    profile: CareerProfile
    jd: JDAnalysis
    company: str | None = None
    company_notes: str | None = None
    tone: str = "confident"


class TailorResponse(BaseModel):
    status: str
    attempts: int
    jd: JDAnalysis
    profile: CareerProfile
    resume: Resume
    verification: VerificationReport
    lint: LintReport | None
    score: ATSScore
    coach: CoachReport
    readiness: float
    exportable: bool
    log: list[str]


def _respond(result: TailorResult) -> TailorResponse:
    return TailorResponse(
        status=result.status, attempts=result.attempts, jd=result.jd, profile=result.profile,
        resume=result.resume, verification=result.verification, lint=result.lint, score=result.score,
        coach=result.coach, readiness=result.readiness, exportable=result.docx is not None,
        log=[f"{s.agent}: {s.detail}" for s in result.log],
    )


@app.exception_handler(LLMError)
def _llm_error(_, exc: LLMError):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=502, content={"detail": f"AI step failed: {exc}"})


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm": "anthropic" if llm else "heuristic"}


@app.post("/api/profile/parse", response_model=CareerProfile)
async def parse_profile(file: UploadFile = File(...)) -> CareerProfile:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 5 MB")
    try:
        return DocumentParser().run(file.filename or "upload", data)
    except UnsupportedFileType as e:
        raise HTTPException(415, str(e)) from e


@app.post("/api/jd/analyze", response_model=JDAnalysis)
def analyze_jd(req: JDRequest) -> JDAnalysis:
    return JDAnalyzer(llm).run(req.text)


@app.post("/api/score", response_model=ATSScore)
def score(req: ScoreRequest) -> ATSScore:
    return score_resume(req.resume, req.jd)


@app.post("/api/tailor", response_model=TailorResponse)
def tailor(req: TailorRequest) -> TailorResponse:
    if req.jd is None and not (req.jd_text or "").strip():
        raise HTTPException(422, "Provide jd_text or jd")
    workflow = TailorWorkflow(JDAnalyzer(llm), ResumeTailor(llm), settings.max_rewrites)
    return _respond(workflow.run(req.profile, req.jd_text, req.jd))


@app.post("/api/resume/review", response_model=TailorResponse)
def review_resume(req: ReviewRequest) -> TailorResponse:
    """Re-check a resume the user edited: edits become user-stated facts, then verify/lint/score."""
    profile, resume = absorb_user_edits(req.profile, req.resume)
    return _respond(review(profile, resume, req.jd))


@app.post("/api/interview/questions", response_model=list[GapQuestion])
def interview_questions(req: QuestionsRequest) -> list[GapQuestion]:
    return generate_questions(req.profile, req.jd, llm)


@app.post("/api/interview/answers", response_model=AnswersResponse)
def interview_answers(req: AnswersRequest) -> AnswersResponse:
    profile, applied = apply_answers(req.profile, req.answers)
    return AnswersResponse(profile=profile, applied=applied)


@app.post("/api/coach/rewrite", response_model=RewriteResponse)
def coach_rewrite(req: RewriteRequest) -> RewriteResponse:
    if llm is None:
        return RewriteResponse(available=False, suggestions=[],
                               message="Connect Claude (ANTHROPIC_API_KEY) for AI rewrite suggestions.")
    suggestions = suggest_rewrites(llm, req.profile, req.experience_id, req.bullet.text,
                                   req.bullet.source_ids, req.jd)
    return RewriteResponse(available=True, suggestions=suggestions,
                           message=None if suggestions else "No suggestion passed the truthfulness check.")


@app.post("/api/cover-letter", response_model=CoverLetterResult)
def cover_letter(req: CoverLetterRequest) -> CoverLetterResult:
    return write_cover_letter(req.profile, req.jd, llm, req.company, req.company_notes, req.tone)


class PrepRequest(BaseModel):
    profile: CareerProfile
    jd: JDAnalysis
    company: str | None = None


class GradeRequest(BaseModel):
    answer: str
    jd: JDAnalysis | None = None


@app.post("/api/interview-prep", response_model=InterviewPrep)
def interview_prep(req: PrepRequest) -> InterviewPrep:
    return build_prep(req.profile, req.jd, llm, req.company)


@app.post("/api/interview-prep/grade", response_model=AnswerFeedback)
def grade_practice_answer(req: GradeRequest) -> AnswerFeedback:
    if len(req.answer.strip()) < 10:
        raise HTTPException(422, "Write a bit more before asking for feedback")
    return grade_answer(req.answer, req.jd)


@app.post("/api/resume/export")
def export_resume(req: ReviewRequest) -> Response:
    """Render the DOCX on demand from the resume the user is looking at.

    Stateless: nothing is stored server-side, so links never expire and restarts lose nothing.
    The same gates as review apply: unverified claims or ATS-unsafe output are never exported.
    """
    profile, resume = absorb_user_edits(req.profile, req.resume)
    result = review(profile, resume, req.jd)
    if result.docx is None:
        problems = [i.message for i in result.verification.issues if i.severity == "error"]
        problems += [v.message for v in (result.lint.violations if result.lint else []) if v.severity == "error"]
        raise HTTPException(422, "Fix before export: " + "; ".join(problems[:3]))
    filename = export_filename(result.resume, req.jd.title)
    return Response(result.docx, media_type=DOCX_MEDIA_TYPE,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
