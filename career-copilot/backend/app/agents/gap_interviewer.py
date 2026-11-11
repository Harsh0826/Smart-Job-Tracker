"""Gap Interviewer agent: turns what the job wants but the profile can't prove into questions.

Answers become ``user_stated`` facts, so the next tailoring pass can use them and the verifier
accepts them. This is the only way a missing keyword gets onto the resume: real evidence first.

Question kinds:
  skill_gap  the job asks for X and the profile never mentions X
  quantify   a high-relevance bullet has no number; the user rewrites it with the result
  confirm    hard requirements (work authorization, clearance, licence) the user must attest
"""

from __future__ import annotations

import json

from app.agents.llm import LLMClient, untrusted
from app.ats import taxonomy
from app.schemas.coaching import GapAnswer, GapQuestion, QuestionSet
from app.schemas.jd import JDAnalysis
from app.schemas.profile import CareerProfile, ProfileBullet

MAX_SKILL_QUESTIONS = 5
MAX_QUANTIFY_QUESTIONS = 3
CATEGORY_ORDER = {"must_have": 0, "certification": 1, "tool": 2, "nice_to_have": 3, "soft_skill": 4}
CATEGORY_PHRASE = {
    "must_have": "as a requirement", "certification": "as a certification", "tool": "among its tools",
    "nice_to_have": "as a nice-to-have", "soft_skill": "as a soft skill",
}
NEGATIVE = {"", "no", "n/a", "na", "none", "not yet", "never", "nope"}

SYSTEM = """You are a career coach interviewing a candidate to close gaps between their profile and a job.
You get the candidate profile, the job analysis and draft questions. Improve each draft's prompt so
it is specific to this candidate and job: name the role where they most likely used the skill, ask
for one concrete example and its result. Keep every id, kind, keyword, experience_id, bullet_id and
prefill exactly as given. One or two sentences per prompt; friendly, direct, no flattery."""


def _missing_keywords(profile: CareerProfile, jd: JDAnalysis):
    text = profile.all_text()
    missing = [k for k in jd.keywords if not taxonomy.contains(k.term, text)]
    return sorted(missing, key=lambda k: (CATEGORY_ORDER[k.category], -k.weight))


def _relevance(text: str, jd: JDAnalysis) -> float:
    return sum(k.weight for k in jd.keywords if taxonomy.contains(k.term, text))


def heuristic_questions(profile: CareerProfile, jd: JDAnalysis) -> list[GapQuestion]:
    from app.agents.bullet_coach import METRIC

    questions: list[GapQuestion] = []
    recent = profile.experiences[0].id if profile.experiences else None
    for k in _missing_keywords(profile, jd)[:MAX_SKILL_QUESTIONS]:
        prompt = (
            f"This job values {k.term.lower()}. Share one example: who or what it involved, and what changed "
            "because of it."
            if k.category == "soft_skill"
            else f"This job lists {k.term} {CATEGORY_PHRASE[k.category]}. Have you used it? If so, describe "
                 f"one thing you did with {k.term} and what it achieved."
        )
        questions.append(GapQuestion(
            id=f"skill:{taxonomy.canonical(k.term)}",
            kind="skill_gap",
            keyword=k.term,
            experience_id=recent,
            prompt=prompt,
            why=f"Your resume can't show {k.term} yet. Leave this blank if you haven't used it: "
                "it stays a gap and is never invented.",
        ))

    candidates = [
        (exp, b) for exp in profile.experiences for b in exp.bullets if not METRIC.search(b.text)
    ]
    candidates.sort(key=lambda eb: -_relevance(eb[1].text, jd))
    for exp, b in candidates[:MAX_QUANTIFY_QUESTIONS]:
        questions.append(GapQuestion(
            id=f"quantify:{b.id}",
            kind="quantify",
            experience_id=exp.id,
            bullet_id=b.id,
            prefill=b.text,
            prompt=f"At {exp.company}: what changed because of this? Edit the sentence to add the result: "
                   "time saved, %, users, revenue, scale or team size.",
            why="Bullets with a measurable result are the ones recruiters remember.",
        ))

    for n, criterion in enumerate(jd.knockout_criteria):
        if criterion not in profile.attestations:
            questions.append(GapQuestion(
                id=f"confirm:{n}:{criterion[:60]}",
                kind="confirm",
                prompt=f"Do you meet this requirement? “{criterion}” (yes / no)",
                why="Hard requirements can screen an application out before a person reads it.",
                prefill=criterion,
            ))
    return questions


def generate_questions(profile: CareerProfile, jd: JDAnalysis, llm: LLMClient | None = None) -> list[GapQuestion]:
    drafts = heuristic_questions(profile, jd)
    if llm is None or not drafts:
        return drafts
    user = "\n\n".join([
        "<candidate_profile>\n" + json.dumps(profile.for_llm(), indent=1) + "\n</candidate_profile>",
        untrusted("job_analysis", jd.model_dump_json(indent=1)),
        "<draft_questions>\n" + QuestionSet(questions=drafts).model_dump_json(indent=1) + "\n</draft_questions>",
    ])
    improved = llm.structured(system=SYSTEM, user=user, schema=QuestionSet, tier="worker", effort="medium")
    by_id = {q.id: q for q in improved.questions}
    # The model may only reword prompts; structure always comes from the deterministic drafts.
    return [d.model_copy(update={"prompt": by_id[d.id].prompt}) if d.id in by_id else d for d in drafts]


def apply_answers(profile: CareerProfile, answers: list[GapAnswer]) -> tuple[CareerProfile, list[str]]:
    updated = profile.model_copy(deep=True)
    applied: list[str] = []
    skills = {taxonomy.canonical(s) for s in updated.skills}
    for a in answers:
        q, text = a.question, a.answer.strip()
        if q.kind == "confirm":
            low = text.lower()
            if low.startswith(("y", "n")) and q.prefill:
                updated.attestations[q.prefill] = low.startswith("y")
                applied.append(f"Recorded: {'meets' if low.startswith('y') else 'does not meet'} “{q.prefill}”")
            continue
        if text.lower() in NEGATIVE:
            continue
        if q.kind == "quantify":
            hit = updated.bullet_index().get(q.bullet_id or "")
            if hit and text != hit[1].text:
                hit[1].text, hit[1].source = text, "user_stated"
                applied.append(f"Updated {q.bullet_id} with your result")
            continue
        exp = updated.experience(a.experience_id or q.experience_id or "") or (
            updated.experiences[0] if updated.experiences else None
        )
        if exp is None:
            continue
        n = sum(b.id.startswith(f"{exp.id}.u") for b in exp.bullets) + 1
        exp.bullets.append(ProfileBullet(id=f"{exp.id}.u{n}", text=text, source="user_stated"))
        msg = f"Added a new fact to {exp.title}, {exp.company}"
        if q.keyword and taxonomy.contains(q.keyword, text) and taxonomy.canonical(q.keyword) not in skills:
            updated.skills.append(q.keyword)
            skills.add(taxonomy.canonical(q.keyword))
            msg += f" and {q.keyword} to your skills"
        applied.append(msg)
    return updated, applied
