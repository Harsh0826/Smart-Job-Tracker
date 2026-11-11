"""Contracts for the coaching agents: Bullet Coach, Gap Interviewer, Cover Letter Writer."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.reports import Issue
from app.schemas.resume import ResumeBullet


class BulletFeedback(BaseModel):
    experience_id: str
    index: int
    text: str
    score: int = Field(description="0-100 impact quality")
    strengths: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    tip: str | None = None


class CoachReport(BaseModel):
    overall: float
    bullets: list[BulletFeedback] = Field(default_factory=list)
    top_actions: list[str] = Field(default_factory=list)


QuestionKind = Literal["skill_gap", "quantify", "confirm"]


class GapQuestion(BaseModel):
    id: str
    kind: QuestionKind
    prompt: str
    why: str = Field(description="Why answering helps the application")
    keyword: str | None = None
    experience_id: str | None = None
    bullet_id: str | None = None
    prefill: str | None = None


class QuestionSet(BaseModel):
    questions: list[GapQuestion]


class GapAnswer(BaseModel):
    question: GapQuestion
    answer: str
    experience_id: str | None = Field(default=None, description="Role the answer belongs to (skill gaps)")


class RewriteSuggestions(BaseModel):
    suggestions: list[ResumeBullet]


class CoverLetterParagraph(BaseModel):
    text: str
    source_ids: list[str] = Field(default_factory=list)


class CoverLetter(BaseModel):
    greeting: str
    paragraphs: list[CoverLetterParagraph]
    closing: str


class CoverLetterResult(BaseModel):
    letter: CoverLetter
    text: str
    issues: list[Issue] = Field(default_factory=list)
    word_count: int
