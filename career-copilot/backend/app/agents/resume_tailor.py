"""Resume Tailor agent.

The LLM only writes bullets, the summary and the skills order. Titles, employers, dates and
education are copied from the profile in code, so the model has no way to change them.
Without an LLM it falls back to reordering existing bullets and skills by JD relevance.
"""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from app.agents.llm import LLMClient, untrusted
from app.ats import taxonomy
from app.schemas.jd import JDAnalysis
from app.schemas.profile import CareerProfile
from app.schemas.resume import Resume, ResumeBullet, ResumeExperience

SYSTEM = """You tailor a candidate's resume to one job. You may use only facts in the candidate profile.

- For each role, write 3-6 bullets, most relevant to the job first. In source_ids, list the ids of the
  profile bullets from that same role that the sentence is based on.
- Use the job's terminology only where the cited facts support it. Never add numbers, tools,
  employers, team sizes, scope or outcomes that the cited facts do not state. A job keyword with no
  evidence in the profile is left out; the user sees it as a skill gap instead.
- Write like a top recruiter would want to read: start with a strong past-tense verb, put the
  result early, keep the scale and numbers the facts give, under 200 characters. No "responsible
  for", "helped", buzzwords or first person. Merge two facts into one bullet when they describe the
  same achievement (cite both).
- Prioritise: the 2-3 bullets that best prove the job's must-have requirements come first.
- summary: 2-3 sentences built only from profile facts.
- skills: the profile's skills reordered with the ones this job asks for first. Add no new skills.
- If a feedback list is given, it names claims a verifier rejected in your last draft: fix every one."""


class TailoredRole(BaseModel):
    experience_id: str
    bullets: list[ResumeBullet]


class TailorOutput(BaseModel):
    summary: str
    roles: list[TailoredRole]
    skills: list[str] = Field(default_factory=list)


def _relevance(text: str, jd: JDAnalysis) -> float:
    return sum(k.weight for k in jd.keywords if taxonomy.contains(k.term, text))


def assemble(profile: CareerProfile, output: TailorOutput) -> Resume:
    by_id = {r.experience_id: r for r in output.roles}
    experiences = []
    for exp in profile.experiences:
        role = by_id.get(exp.id)
        bullets = (
            role.bullets
            if role is not None
            else [ResumeBullet(text=b.text, source_ids=[b.id]) for b in exp.bullets]
        )
        experiences.append(
            ResumeExperience(**exp.model_dump(exclude={"bullets"}), bullets=bullets)
        )
    return Resume(
        contact=profile.contact,
        summary=output.summary or profile.summary,
        experiences=experiences,
        education=profile.education,
        # Profiles saved before de-duplication, or an LLM repeating itself, must not yield repeats.
        skills=taxonomy.dedupe(output.skills or profile.skills),
        certifications=taxonomy.dedupe(profile.certifications),
    )


def heuristic_tailor(profile: CareerProfile, jd: JDAnalysis) -> TailorOutput:
    roles = [
        TailoredRole(
            experience_id=exp.id,
            bullets=[
                ResumeBullet(text=b.text, source_ids=[b.id])
                for b in sorted(exp.bullets, key=lambda b: -_relevance(b.text, jd))
            ],
        )
        for exp in profile.experiences
    ]
    skills = sorted(profile.skills, key=lambda s: -_relevance(s, jd))
    return TailorOutput(summary=profile.summary or "", roles=roles, skills=skills)


class ResumeTailor:
    name = "resume_tailor"

    def __init__(self, llm: LLMClient | None = None):
        self.llm = llm

    def run(self, profile: CareerProfile, jd: JDAnalysis, feedback: list[str] | None = None) -> Resume:
        if self.llm is None:
            return assemble(profile, heuristic_tailor(profile, jd))
        user = "\n\n".join(
            [
                "<candidate_profile>\n" + json.dumps(profile.for_llm(), indent=1) + "\n</candidate_profile>",
                untrusted("job_analysis", jd.model_dump_json(indent=1)),
                "<feedback>\n" + "\n".join(feedback) + "\n</feedback>" if feedback else "",
            ]
        )
        output = self.llm.structured(
            system=SYSTEM, user=user, schema=TailorOutput, tier="main", effort="high"
        )
        return assemble(profile, output)
