"""Job description analysis contracts."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

KeywordCategory = Literal["must_have", "nice_to_have", "tool", "certification", "soft_skill"]


class JDExtraction(BaseModel):
    """What the JD Analyzer's LLM (or heuristic fallback) extracts. Weights are applied in code."""

    title: str
    seniority: str | None = None
    years_required: int | None = None
    must_have: list[str] = Field(default_factory=list)
    nice_to_have: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    soft_skills: list[str] = Field(default_factory=list)
    knockout_criteria: list[str] = Field(
        default_factory=list,
        description="Hard requirements such as clearance, licence or work authorization",
    )


class Keyword(BaseModel):
    term: str
    category: KeywordCategory
    weight: float


class JDAnalysis(BaseModel):
    title: str
    seniority: str | None = None
    years_required: int | None = None
    keywords: list[Keyword] = Field(default_factory=list)
    knockout_criteria: list[str] = Field(default_factory=list)
