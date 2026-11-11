"""Interview Prep agent: likely questions for this job, each paired with a STAR story from your facts.

Deterministic core (always on):
  role fit     "Tell me about yourself" (a 30-second pitch built from your top facts), "Why this role?"
  technical    one question per must-have you can evidence, answered with the fact that proves it
  behavioral   classic prompts (impact, leadership, collaboration, hard problems, failure) matched to
               facts by signal words
  gap          must-haves you can't evidence yet: how to answer honestly
Stories take Action and Result from a real fact; Situation and Task are left for the candidate unless
Claude can fill them from the facts. Every generated sentence passes the grounding check.

The practice grader scores a typed answer for STAR completeness, ownership, a measurable result,
spoken length and job keywords.
"""

from __future__ import annotations

import json
import re

from app.agents.llm import LLMClient, untrusted
from app.agents.verifier import verify_text
from app.ats import taxonomy
from app.ats.dates import months_between
from app.schemas.jd import JDAnalysis
from app.schemas.prep import AnswerFeedback, InterviewPrep, PrepQuestion, StarStory, StoryDrafts
from app.schemas.profile import CareerProfile, ProfileBullet, ProfileExperience

RESULT_SPLIT = re.compile(
    # "..., cutting latency by 40%"  |  "... that reduced load time by 3x"
    r",\s+(?=(?:cutting|reducing|raising|increasing|improving|saving|growing|lowering|lifting|doubling|"
    r"halving|resulting|which|so that|enabling|driving)\b)"
    r"|\s+(?:that|which)\s+(?=(?:cut|reduced|raised|increased|improved|saved|grew|lowered|lifted|doubled|"
    r"halved|enabled|drove|eliminated|sped)\b)",
    re.I,
)
NUMBER = re.compile(r"\d")

BEHAVIORAL = [
    ("impact", "Tell me about a time you made a measurable improvement to a system or process.",
     "They want proof you drive outcomes, not just complete tasks.",
     re.compile(r"\b(cut|reduc|improv|rais|increas|sav|optimi|tun|faster|latency|cost)", re.I)),
    ("leadership", "Tell me about a time you led others or mentored someone.",
     "Senior roles are judged on how you multiply the team.",
     re.compile(r"\b(led|lead|mentor|coach|manag|onboard|design review)", re.I)),
    ("collaboration", "Describe a project where you worked across teams to ship something.",
     "They are checking how you handle stakeholders and trade-offs.",
     re.compile(r"\b(collaborat|cross-functional|partner|stakeholder|product and design|with product)", re.I)),
    ("hard_problem", "Tell me about the hardest technical problem you've solved.",
     "They want to hear how you reason under ambiguity.",
     re.compile(r"\b(migrat|incident|debug|on-call|outage|scal|rebuil|architect|re-architect)", re.I)),
]

QUESTIONS_TO_ASK = [
    "What would success look like for this role in the first 90 days?",
    "What's the biggest challenge the team is facing right now?",
    "How do you decide what the team works on, and how are trade-offs made?",
    "What do the people who do best on this team have in common?",
]

STORY_SYSTEM = """You help a candidate prepare STAR interview stories. For each item you get one question and
the source facts behind the story (its Action and Result are already taken from them). Write a short
Situation (the context) and Task (the goal or problem) and restate the Result in one sentence.
Use only what the source facts state or directly imply; never add numbers, names, tools, team sizes or
outcomes. If the facts don't say what the situation or task was, return an empty string for it."""


def _split_fact(text: str) -> tuple[str, str]:
    parts = RESULT_SPLIT.split(text.rstrip("."), maxsplit=1)
    if len(parts) == 2:
        action, result = parts
        return action.strip(), result[:1].upper() + result[1:].strip() + "."
    return text.rstrip(".") + ".", ""


def _story(exp: ProfileExperience, fact: ProfileBullet) -> StarStory:
    action, result = _split_fact(fact.text)
    missing = ["task: what problem or goal prompted this?"]
    if not result:
        missing.append("result: what changed because of it? Use a number if you can.")
    return StarStory(
        situation=f"As {exp.title} at {exp.company}.",
        task="",
        action=action if action.endswith(".") else action + ".",
        result=result,
        source_ids=[fact.id],
        missing=missing,
    )


def _facts(profile: CareerProfile):
    return [(e, b) for e in profile.experiences for b in e.bullets]


def _relevance(text: str, jd: JDAnalysis) -> float:
    return sum(k.weight for k in jd.keywords if taxonomy.contains(k.term, text))


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text[:2] != text[:2].upper() else text


def elevator_pitch(profile: CareerProfile, jd: JDAnalysis) -> tuple[str, list[str]]:
    if not profile.experiences:
        return "", []
    current = profile.experiences[0]
    years = sum(months_between(e.start, e.end) for e in profile.experiences) // 12
    matched = [k.term for k in jd.keywords if k.category in {"must_have", "tool"}
               and taxonomy.contains(k.term, profile.all_text())][:3]
    skills = (", ".join(matched[:-1]) + f" and {matched[-1]}") if len(matched) > 1 else (matched[0] if matched else "")
    first = f"I'm a {current.title} at {current.company}" if not current.title[:1].lower() in "aeiou" else \
        f"I'm an {current.title} at {current.company}"
    first += f" with {years}+ years of experience" if years else ""
    first += f", mostly in {skills}." if skills else "."
    sentences, ids = [first], []
    best_current = max(current.bullets, key=lambda b: _relevance(b.text, jd), default=None)
    if best_current:
        sentences.append(f"Most recently, I {_lower_first(best_current.text.rstrip('.'))}.")
        ids.append(best_current.id)
    if len(profile.experiences) > 1:
        prev = profile.experiences[1]
        best_prev = max(prev.bullets, key=lambda b: _relevance(b.text, jd), default=None)
        if best_prev:
            sentences.append(f"Before that, at {prev.company}, I {_lower_first(best_prev.text.rstrip('.'))}.")
            ids.append(best_prev.id)
    sentences.append(f"I'm looking for a {jd.title} role where I can keep building on that.")
    return " ".join(sentences), ids


def heuristic_prep(profile: CareerProfile, jd: JDAnalysis, company: str | None = None) -> InterviewPrep:
    pitch, pitch_ids = elevator_pitch(profile, jd)
    target = company or "this company"
    facts = _facts(profile)
    used: set[str] = set()
    questions: list[PrepQuestion] = [
        PrepQuestion(
            id="fit:about", category="role_fit", question="Tell me about yourself.",
            why_they_ask="The opener. They want a 30-60 second story of who you are and why you fit this role.",
            talking_points=["Present → past → why this role", "End on what you want next, tied to the job",
                            "Practice it out loud until it takes under a minute"],
        ),
        PrepQuestion(
            id="fit:why", category="role_fit", question=f"Why do you want this role at {target}?",
            why_they_ask="They are checking motivation and whether you researched them.",
            talking_points=[
                "The work matches what you do best: "
                + ", ".join([k.term for k in jd.keywords if k.category == "must_have"][:3]),
                f"One specific thing about {target} (product, mission, recent news) — research before the call",
                "What you want to learn or own next, and how this role offers it",
            ],
        ),
    ]

    # Technical: one per evidenced must-have / tool, answered with the strongest fact that proves it.
    for k in [k for k in jd.keywords if k.category in {"must_have", "tool"}][:5]:
        proof = [(e, b) for e, b in facts if taxonomy.contains(k.term, b.text)]
        if not proof:
            continue
        exp, fact = max(proof, key=lambda eb: (bool(NUMBER.search(eb[1].text)), _relevance(eb[1].text, jd)))
        used.add(fact.id)
        questions.append(PrepQuestion(
            id=f"tech:{taxonomy.canonical(k.term)}", category="technical", keyword=k.term,
            question=f"Walk me through how you've used {k.term} in production.",
            why_they_ask=f"{k.term} is a core requirement; they will probe depth, trade-offs and what you'd do differently.",
            story=_story(exp, fact),
            talking_points=["Why that approach over the alternatives", "What broke or surprised you",
                            "What you'd change with hindsight"],
        ))

    # Behavioral: match classic prompts to facts by signal words; prefer facts not used yet.
    for key, question, why, signal in BEHAVIORAL:
        candidates = [(e, b) for e, b in facts if signal.search(b.text)]
        if not candidates:
            continue
        candidates.sort(key=lambda eb: (eb[1].id in used, not NUMBER.search(eb[1].text), -_relevance(eb[1].text, jd)))
        exp, fact = candidates[0]
        used.add(fact.id)
        questions.append(PrepQuestion(
            id=f"behav:{key}", category="behavioral", question=question, why_they_ask=why,
            story=_story(exp, fact), talking_points=["Say “I” for your part, “we” for the team’s",
                                                     "Spend most of the time on Action and Result"],
        ))
    questions.append(PrepQuestion(
        id="behav:failure", category="behavioral",
        question="Tell me about a time something you owned didn't go to plan.",
        why_they_ask="They want self-awareness and evidence that you learn and change course.",
        talking_points=["Pick a real, moderate mistake — not a disguised strength",
                        "Own your part in one sentence", "Spend most of the answer on what you changed afterwards"],
    ))

    # Gaps: requirements you can't evidence — answer honestly and bridge.
    text = profile.all_text()
    strengths = [s for s in profile.skills][:3]
    for k in [k for k in jd.keywords if k.category in {"must_have", "nice_to_have", "tool"}
              and not taxonomy.contains(k.term, text)][:3]:
        questions.append(PrepQuestion(
            id=f"gap:{taxonomy.canonical(k.term)}", category="gap", keyword=k.term,
            question=f"What's your experience with {k.term}?",
            why_they_ask=f"Your resume doesn't show {k.term}; expect them to ask. Honesty plus a plan beats bluffing.",
            talking_points=[
                f"Be direct: say what you have and haven't done with {k.term}",
                f"Bridge to the closest thing you have done ({', '.join(strengths)})" if strengths
                else "Bridge to the closest thing you have done",
                f"Show how you'd ramp up: docs, a small project, pairing — and how fast you learned a past tool",
            ],
        ))

    to_ask = list(QUESTIONS_TO_ASK)
    top = next((k.term for k in jd.keywords if k.category == "must_have"), None)
    if top:
        to_ask.insert(1, f"How does the team use {top} today, and what would you change about it?")
    return InterviewPrep(role=jd.title, elevator_pitch=pitch, pitch_source_ids=pitch_ids,
                         questions=questions, questions_to_ask=to_ask[:5])


def enrich_stories(prep: InterviewPrep, profile: CareerProfile, llm: LLMClient) -> InterviewPrep:
    """Let Claude write Situation/Task/Result from the facts; keep only grounded sentences."""
    index = profile.bullet_index()
    items = []
    for q in prep.questions:
        if q.story and q.story.source_ids:
            exp, _ = index[q.story.source_ids[0]]
            facts = [f"{b.id}: {b.text}" for b in exp.bullets]
            items.append({"question_id": q.id, "question": q.question, "role": f"{exp.title}, {exp.company}",
                          "story_fact": q.story.source_ids[0], "role_facts": facts})
    if not items:
        return prep
    user = "<items>\n" + json.dumps(items, indent=1) + "\n</items>"
    drafts = llm.structured(system=STORY_SYSTEM, user=user, schema=StoryDrafts, tier="main", effort="medium")
    by_id = {d.question_id: d for d in drafts.stories}
    out = prep.model_copy(deep=True)
    for q in out.questions:
        d = by_id.get(q.id)
        if not (d and q.story):
            continue
        exp, _ = index[q.story.source_ids[0]]
        role_facts = [b.text for b in exp.bullets]
        for field in ("situation", "task", "result"):
            value = getattr(d, field).strip()
            if value and not verify_text(value, role_facts, profile, field):
                setattr(q.story, field, value)
                q.story.missing = [m for m in q.story.missing if not m.startswith(field)]
    return out


def build_prep(profile: CareerProfile, jd: JDAnalysis, llm: LLMClient | None = None,
               company: str | None = None) -> InterviewPrep:
    prep = heuristic_prep(profile, jd, company)
    return enrich_stories(prep, profile, llm) if llm is not None else prep


# --- practice grader -------------------------------------------------------------------------------

SITUATION = re.compile(r"\b(when|at the time|our team|the team|there was|we had|the company|situation|"
                       r"context|problem was|challenge)\b", re.I)
TASK = re.compile(r"\b(my goal|goal was|i was asked|i needed|i had to|we needed|task|objective|"
                  r"responsible for|my job was|to fix|to reduce|to improve)\b", re.I)
# "I" + past-tense verb (regular -ed or common irregulars), optionally "I also/then/quickly …".
ACTION = re.compile(
    r"\bI\s+(?:also\s+|then\s+|\w+ly\s+)?(?!(?:needed|wanted|was|had|hoped|tried)\b)"
    r"(\w+ed|built|led|wrote|rewrote|ran|drove|set|made|took|found|chose|began|brought|kept|spent|taught|"
    r"won|split|cut|put|sped|rebuilt|grew|got|gave|held|met)\b",
    re.I,
)
RESULT = re.compile(r"\b(as a result|result(?:ed)?|which meant|so that|outcome|reduc|increas|improv|cut|"
                    r"saved|grew|dropped|faster|went from)\w*", re.I)


def grade_answer(answer: str, jd: JDAnalysis | None = None) -> AnswerFeedback:
    text = answer.strip()
    words = len(text.split())
    seconds = round(words / 2.5)  # ~150 spoken words per minute
    tail = text[int(len(text) * 0.5):]
    star = {
        "situation": bool(SITUATION.search(text)),
        "task": bool(TASK.search(text)),
        "action": bool(ACTION.search(text)),
        "result": bool(RESULT.search(tail) or NUMBER.search(tail)),
    }
    strengths, improvements = [], []
    score = 20 * sum(star.values())
    labels = {
        "situation": "Open with one line of context: where you were and what was going on.",
        "task": "Say what you were trying to achieve, or the problem you owned.",
        "action": "Describe what *you* did with “I …” and an action verb.",
        "result": "End on the outcome: what changed, ideally with a number.",
    }
    for part, ok in star.items():
        (strengths if ok else improvements).append(f"Clear {part}" if ok else labels[part])

    if NUMBER.search(text):
        score += 10
        strengths.append("Uses a concrete number")
    else:
        improvements.append("Add one number (%, time, users, money) to make the result memorable.")
    if 120 <= words <= 320:
        score += 10
        strengths.append(f"Good length (~{seconds}s spoken)")
    elif words < 120:
        improvements.append(f"Short (~{seconds}s). Aim for 1–2 minutes: more on Action and Result.")
    else:
        improvements.append(f"Long (~{seconds}s). Trim the Situation; keep it under 2 minutes.")

    i_count = len(re.findall(r"\bI\b", text))
    we_count = len(re.findall(r"\bwe\b", text, re.I))
    if we_count > max(2, 2 * i_count):
        score = max(0, score - 10)
        improvements.append("Mostly “we”: make your own part explicit with “I”.")

    used = []
    if jd:
        used = [k.term for k in jd.keywords if taxonomy.contains(k.term, text)]
        if used:
            strengths.append(f"Mentions job keywords: {', '.join(used[:4])}")
    return AnswerFeedback(score=min(100, score), star=star, strengths=strengths, improvements=improvements,
                          keywords_used=used, word_count=words, est_seconds=seconds)
