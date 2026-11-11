"""Truthfulness Verifier agent (deterministic rules).

Blocks any generated claim the Career Profile does not support:
- roles must match the profile exactly (title, company, dates): the tailor cannot promote anyone
- every bullet cites profile bullets from the same role
- every number in a bullet appears in the bullets it cites
- every recognised skill/tool in a bullet, the summary or the skills list exists in the profile
- education and certifications are a subset of the profile

An LLM-as-judge pass for paraphrase drift ("led" vs "contributed to") is the next layer to add.
"""

from __future__ import annotations

import re

from app.ats import taxonomy
from app.schemas.profile import CareerProfile
from app.schemas.reports import Issue, VerificationReport
from app.schemas.resume import Resume

NUMBER = re.compile(r"\$?\d[\d,]*(?:\.\d+)?\s?(?:%|[kKmMbB]\b|x\b)?")


def _numbers(text: str) -> set[str]:
    out = set()
    for raw in NUMBER.findall(text):
        n = raw.replace(",", "").replace(" ", "").lower()
        out.add(n)
        out.add(n.lstrip("$"))
    return out


def _skills_in(text: str) -> set[str]:
    return {taxonomy.canonical(s) for s in taxonomy.TECH_SKILLS if taxonomy.contains(s, text)}


def _profile_skills(profile: CareerProfile) -> set[str]:
    return _skills_in(profile.all_text()) | {taxonomy.canonical(s) for s in profile.skills}


def verify_text(text: str, cited_texts: list[str], profile: CareerProfile, where: str) -> list[Issue]:
    """Grounding check for any generated sentence: numbers must be in the cited facts, recognised
    skills must exist in the profile. Shared by the coach, cover letter and resume checks."""
    issues = []
    for n in sorted(_numbers(text) - _numbers(" ".join(cited_texts))):
        issues.append(Issue(rule="unsupported_number", severity="error", location=where,
                            message=f"Number '{n}' is not in the cited facts"))
    for skill in sorted(_skills_in(text) - _profile_skills(profile)):
        issues.append(Issue(rule="unsupported_skill", severity="error", location=where,
                            message=f"'{skill}' does not appear anywhere in the profile"))
    return issues


def verify(resume: Resume, profile: CareerProfile) -> VerificationReport:
    issues: list[Issue] = []
    index = profile.bullet_index()
    profile_text = profile.all_text()
    profile_skills = _skills_in(profile_text) | {taxonomy.canonical(s) for s in profile.skills}

    def unsupported_skills(text: str, where: str) -> None:
        for skill in sorted(_skills_in(text) - profile_skills):
            issues.append(Issue(rule="unsupported_skill", severity="error", location=where,
                                message=f"'{skill}' does not appear anywhere in the profile"))

    for exp in resume.experiences:
        src = profile.experience(exp.id)
        if src is None:
            issues.append(Issue(rule="unknown_role", severity="error", location=exp.id,
                                message="Role does not exist in the profile"))
            continue
        for attr in ("title", "company", "start", "end"):
            if getattr(exp, attr) != getattr(src, attr):
                issues.append(Issue(rule="role_changed", severity="error", location=exp.id,
                                    message=f"{attr} changed from {getattr(src, attr)!r} to {getattr(exp, attr)!r}"))
        for i, bullet in enumerate(exp.bullets):
            where = f"{exp.id}.bullets[{i}]"
            if not bullet.source_ids:
                issues.append(Issue(rule="uncited", severity="error", location=where,
                                    message="Bullet cites no profile facts"))
                continue
            cited_text = []
            for sid in bullet.source_ids:
                hit = index.get(sid)
                if hit is None:
                    issues.append(Issue(rule="unknown_source", severity="error", location=where,
                                        message=f"Cites unknown fact '{sid}'"))
                elif hit[0].id != exp.id:
                    issues.append(Issue(rule="cross_role_source", severity="error", location=where,
                                        message=f"Cites '{sid}' from a different role"))
                else:
                    cited_text.append(hit[1].text)
            if cited_text:
                for n in sorted(_numbers(bullet.text) - _numbers(" ".join(cited_text))):
                    issues.append(Issue(rule="unsupported_number", severity="error", location=where,
                                        message=f"Number '{n}' is not in the cited facts"))
            unsupported_skills(bullet.text, where)

    if resume.summary:
        for n in sorted(_numbers(resume.summary) - _numbers(profile_text)):
            issues.append(Issue(rule="unsupported_number", severity="error", location="summary",
                                message=f"Number '{n}' is not in the profile"))
        unsupported_skills(resume.summary, "summary")

    for skill in resume.skills:
        key = taxonomy.canonical(skill)
        if key not in profile_skills and not taxonomy.contains(skill, profile_text):
            issues.append(Issue(rule="unsupported_skill", severity="error", location="skills",
                                message=f"Skill '{skill}' has no evidence in the profile"))

    known_edu = {(e.institution, e.degree) for e in profile.education}
    for edu in resume.education:
        if (edu.institution, edu.degree) not in known_edu:
            issues.append(Issue(rule="unknown_education", severity="error", location=edu.id,
                                message=f"Education '{edu.degree}, {edu.institution}' is not in the profile"))
    for cert in set(resume.certifications) - set(profile.certifications):
        issues.append(Issue(rule="unknown_certification", severity="error", location="certifications",
                            message=f"Certification '{cert}' is not in the profile"))
    return VerificationReport(issues=issues)


class TruthfulnessVerifier:
    name = "truthfulness_verifier"

    def run(self, resume: Resume, profile: CareerProfile) -> VerificationReport:
        return verify(resume, profile)
