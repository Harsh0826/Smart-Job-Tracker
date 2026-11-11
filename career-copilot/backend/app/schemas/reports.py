"""Reports produced by the quality-gate agents."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, computed_field

from app.schemas.jd import Keyword

Severity = Literal["error", "warning"]


class Issue(BaseModel):
    rule: str
    severity: Severity
    message: str
    location: str | None = Field(default=None, description="e.g. 'e1.bullets[2]' or 'skills'")


class VerificationReport(BaseModel):
    issues: list[Issue] = Field(default_factory=list)

    @computed_field
    @property
    def passed(self) -> bool:
        return not any(i.severity == "error" for i in self.issues)

    def feedback(self) -> list[str]:
        return [f"{i.location}: {i.message}" for i in self.issues if i.severity == "error"]


class LintReport(BaseModel):
    violations: list[Issue] = Field(default_factory=list)
    parse_fidelity: float = 1.0

    @computed_field
    @property
    def passed(self) -> bool:
        return self.parse_fidelity >= 0.95 and not any(
            v.severity == "error" for v in self.violations
        )


class ATSScore(BaseModel):
    total: float
    band: Literal["strong", "tailor_further", "weak_fit"]
    components: dict[str, float]
    missing_keywords: list[Keyword] = Field(default_factory=list)
    stuffed_terms: list[str] = Field(default_factory=list)
    knockouts_to_confirm: list[str] = Field(default_factory=list)
    label: str = "Estimated parseability and keyword match"
