"""Resume document model: what the tailor produces and the renderer turns into DOCX."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.profile import ContactInfo, Education, ExperienceBase


class ResumeBullet(BaseModel):
    text: str
    source_ids: list[str] = Field(
        default_factory=list, description="Profile bullet ids this sentence is derived from"
    )
    user_edited: bool = Field(
        default=False, description="Written by the user in review; stored as a user-stated fact"
    )


class ResumeExperience(ExperienceBase):
    bullets: list[ResumeBullet] = Field(default_factory=list)


class Resume(BaseModel):
    contact: ContactInfo
    summary: str | None = None
    experiences: list[ResumeExperience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)

    def bullet_text(self) -> list[tuple[int, str]]:
        """(experience index, bullet text) pairs, most recent role first."""
        return [(i, b.text) for i, exp in enumerate(self.experiences) for b in exp.bullets]
