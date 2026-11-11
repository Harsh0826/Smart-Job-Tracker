"""Bullet Coach agent: grades every bullet for impact the way a recruiter skims it.

Deterministic grading (always on):
  strong action verb 25 · measurable result 30 · readable length 15 · no weak opener 15
  · no buzzwords 10 · no first person 5
With Claude connected, ``suggest_rewrites`` proposes stronger phrasings grounded in the same facts;
every suggestion passes the Truthfulness Verifier before the user sees it.
"""

from __future__ import annotations

import re

from app.agents.llm import LLMClient, untrusted
from app.agents.verifier import verify_text
from app.schemas.coaching import BulletFeedback, CoachReport, RewriteSuggestions
from app.schemas.jd import JDAnalysis
from app.schemas.profile import CareerProfile
from app.schemas.resume import Resume, ResumeBullet

WEAK_OPENERS = ("responsible for", "worked on", "helped", "assisted", "involved in", "participated in",
                "tasked with", "duties included", "in charge of", "handled")
BUZZWORDS = ("synergy", "go-getter", "hard-working", "hardworking", "detail-oriented", "team player",
             "results-driven", "dynamic", "passionate", "think outside the box", "self-starter", "rockstar")
STRONG_VERBS = {
    "built", "led", "designed", "launched", "reduced", "increased", "cut", "migrated", "shipped", "automated",
    "created", "developed", "drove", "delivered", "improved", "scaled", "grew", "owned", "architected",
    "introduced", "mentored", "tuned", "wrote", "implemented", "optimized", "rebuilt", "negotiated", "won",
    "saved", "streamlined", "established", "spearheaded", "managed", "analyzed", "redesigned", "raised",
    "accelerated", "eliminated", "consolidated", "doubled", "tripled", "halved", "produced", "maintained",
}
METRIC = re.compile(
    r"\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|dozens|hundreds|thousands)\b"
    r"|\bfrom \w+ to \w+",  # "from weekly to daily"
    re.I,
)
FIRST_PERSON = re.compile(r"\b(?:I|my|me|we|our)\b")


def grade(text: str) -> tuple[int, list[str], list[str], str | None]:
    strengths: list[str] = []
    issues: list[str] = []
    score = 0
    words = text.strip().split()
    first = words[0].lower().strip(",.") if words else ""
    low = text.lower().strip()

    if first in STRONG_VERBS or (first.endswith("ed") and len(first) > 4):
        score += 25
        strengths.append("Starts with an action verb")
    else:
        issues.append("Start with a strong past-tense verb (Built, Led, Cut, Launched)")
    if METRIC.search(text):
        score += 30
        strengths.append("Shows a measurable result")
    else:
        issues.append("No number: add scale or result (%, $, time saved, users, team size)")
    if 60 <= len(text) <= 200:
        score += 15
    elif len(text) < 60:
        issues.append("Too thin: say what changed because of your work")
    else:
        issues.append("Over two lines: cut to the action and the result")
    if any(low.startswith(w) for w in WEAK_OPENERS):
        issues.append("Weak opener: describe what you did, not what you were responsible for")
    else:
        score += 15
    if any(b in low for b in BUZZWORDS):
        issues.append("Buzzword: replace with evidence")
    else:
        score += 10
    if FIRST_PERSON.search(text):
        issues.append("Drop first-person words (I, my, we)")
    else:
        score += 5

    tip = None
    if not METRIC.search(text):
        tip = "Answer in the Strengthen step: what changed because of this, and by how much?"
    elif issues:
        tip = issues[0]
    return score, strengths, issues, tip


def coach_resume(resume: Resume) -> CoachReport:
    feedback = []
    for exp in resume.experiences:
        for i, b in enumerate(exp.bullets):
            score, strengths, issues, tip = grade(b.text)
            feedback.append(BulletFeedback(experience_id=exp.id, index=i, text=b.text, score=score,
                                           strengths=strengths, issues=issues, tip=tip))
    overall = round(sum(f.score for f in feedback) / len(feedback), 1) if feedback else 0.0
    unquantified = sum("No number" in " ".join(f.issues) for f in feedback)
    weak = sum(any("Weak opener" in i or "action verb" in i for i in f.issues) for f in feedback)
    actions = []
    if unquantified:
        actions.append(f"Quantify {unquantified} bullet{'s' if unquantified > 1 else ''}: numbers are what recruiters remember")
    if weak:
        actions.append(f"Rewrite {weak} bullet{'s' if weak > 1 else ''} to lead with an action verb")
    if not resume.summary:
        actions.append("Add a 2-sentence summary aimed at this role")
    return CoachReport(overall=overall, bullets=feedback, top_actions=actions)


REWRITE_SYSTEM = """You are a resume coach. Rewrite one resume bullet three ways for the target job.
Use only facts in the cited source facts: never add numbers, tools, scope, team sizes or outcomes they
do not state. Lead with a strong past-tense verb, put the result early, keep each under 200
characters, and use the job's wording only where the facts support it. Set source_ids to the fact ids
you used, all from the same role."""


def suggest_rewrites(
    llm: LLMClient, profile: CareerProfile, experience_id: str, text: str, source_ids: list[str],
    jd: JDAnalysis,
) -> list[ResumeBullet]:
    exp = profile.experience(experience_id)
    if exp is None:
        return []
    facts = "\n".join(f"{b.id}: {b.text}" for b in exp.bullets)
    user = (
        f"<role>{exp.title}, {exp.company}</role>\n<source_facts>\n{facts}\n</source_facts>\n"
        f"<current_bullet cites='{','.join(source_ids)}'>{text}</current_bullet>\n"
        + untrusted("job_analysis", jd.model_dump_json())
    )
    out = llm.structured(system=REWRITE_SYSTEM, user=user, schema=RewriteSuggestions, tier="main", effort="medium")
    index = profile.bullet_index()
    safe = []
    for s in out.suggestions[:3]:
        cited = [index[i][1].text for i in s.source_ids if i in index and index[i][0].id == experience_id]
        if cited and not verify_text(s.text, cited, profile, "suggestion"):
            safe.append(s)
    return safe
