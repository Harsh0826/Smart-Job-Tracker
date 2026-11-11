"""Contracts for the Interview Prep agent and the practice-answer grader."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PrepCategory = Literal["role_fit", "technical", "behavioral", "gap"]


class StarStory(BaseModel):
    situation: str = ""
    task: str = ""
    action: str = ""
    result: str = ""
    source_ids: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list, description="STAR parts the candidate should fill in")


class PrepQuestion(BaseModel):
    id: str
    category: PrepCategory
    question: str
    why_they_ask: str
    story: StarStory | None = None
    talking_points: list[str] = Field(default_factory=list)
    keyword: str | None = None


class InterviewPrep(BaseModel):
    role: str
    elevator_pitch: str
    pitch_source_ids: list[str] = Field(default_factory=list)
    questions: list[PrepQuestion]
    questions_to_ask: list[str]


class StoryDraft(BaseModel):
    question_id: str
    situation: str
    task: str
    result: str


class StoryDrafts(BaseModel):
    stories: list[StoryDraft]


class AnswerFeedback(BaseModel):
    score: int
    star: dict[str, bool]
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    keywords_used: list[str] = Field(default_factory=list)
    word_count: int
    est_seconds: int
