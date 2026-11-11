"""Canonical Career Profile: the single source of truth every generated claim must trace back to.

Each profile bullet has a stable id (``e1.b2``). Generated resume bullets cite those ids, which is
what lets the Truthfulness Verifier check every claim deterministically.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

YEAR_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class ContactInfo(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[str] = Field(default_factory=list)


class ProfileBullet(BaseModel):
    id: str = Field(description="Stable fact id, e.g. 'e1.b2'")
    text: str
    source: Literal["resume_upload", "user_stated", "linkedin_export"] = "resume_upload"


class ExperienceBase(BaseModel):
    id: str = Field(description="Stable experience id, e.g. 'e1'")
    title: str
    company: str
    location: str | None = None
    start: str = Field(description="YYYY-MM")
    end: str | None = Field(default=None, description="YYYY-MM, or null for Present")

    @field_validator("start", "end")
    @classmethod
    def _year_month(cls, value: str | None) -> str | None:
        if value is not None and not YEAR_MONTH.match(value):
            raise ValueError(f"date must be YYYY-MM, got {value!r}")
        return value


class ProfileExperience(ExperienceBase):
    bullets: list[ProfileBullet] = Field(default_factory=list)


class Education(BaseModel):
    id: str
    institution: str
    degree: str
    field: str | None = None
    end: str | None = Field(default=None, description="YYYY-MM graduation date")


class CareerProfile(BaseModel):
    version: int = 1
    contact: ContactInfo
    summary: str | None = None
    experiences: list[ProfileExperience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    attestations: dict[str, bool] = Field(
        default_factory=dict, description="Job requirement text -> the user confirmed they meet it"
    )

    def bullet_index(self) -> dict[str, tuple[ProfileExperience, ProfileBullet]]:
        return {b.id: (exp, b) for exp in self.experiences for b in exp.bullets}

    def experience(self, exp_id: str) -> ProfileExperience | None:
        return next((e for e in self.experiences if e.id == exp_id), None)

    def all_text(self) -> str:
        parts = [self.summary or "", *self.skills, *self.certifications]
        for exp in self.experiences:
            parts += [exp.title, exp.company, *(b.text for b in exp.bullets)]
        for edu in self.education:
            parts += [edu.institution, edu.degree, edu.field or ""]
        return "\n".join(parts)

    def for_llm(self) -> dict:
        """Profile without contact details: the writing agents never need PII."""
        return self.model_dump(exclude={"contact"})
