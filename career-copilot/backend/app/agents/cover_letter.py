"""Cover Letter Writer agent.

A 250-400 word letter built on the 2-3 profile facts most relevant to the job. Each paragraph
cites the facts it uses, and every paragraph passes the same grounding check as resume bullets.
Offline it assembles a plain, factual letter from those facts; with Claude it writes a natural one.
"""

from __future__ import annotations

import json

from app.agents.llm import LLMClient, untrusted
from app.agents.verifier import verify_text
from app.ats import taxonomy
from app.schemas.coaching import CoverLetter, CoverLetterParagraph, CoverLetterResult
from app.schemas.jd import JDAnalysis
from app.schemas.profile import CareerProfile, ProfileBullet, ProfileExperience

SYSTEM = """You write cover letters that get candidates interviews. 250-400 words, four short paragraphs:
1. The role, and in one sentence why this candidate fits it.
2-3. Two or three concrete achievements from the profile that map to the job's top requirements.
   Lead with the result. Cite in source_ids the profile fact ids each paragraph uses.
4. A short, confident close asking for a conversation.
Use only facts in the profile: never add numbers, tools, employers or outcomes it does not state.
If company notes are given, use them only for why this company. No clichés ("I am writing to
express my interest", "passionate", "team player"), no flattery, no restating the whole resume."""

TONES = {"confident", "warm", "concise"}


def _evidence(profile: CareerProfile, jd: JDAnalysis, k: int = 3) -> list[tuple[ProfileExperience, ProfileBullet]]:
    """Top facts by JD relevance, spread across roles so the letter shows a track record."""

    def score(b: ProfileBullet) -> float:
        return sum(kw.weight for kw in jd.keywords if taxonomy.contains(kw.term, b.text))

    ranked = sorted(((e, b) for e in profile.experiences for b in e.bullets), key=lambda eb: -score(eb[1]))
    relevant = [eb for eb in ranked if score(eb[1]) > 0] or ranked[:2]
    picked: list[tuple[ProfileExperience, ProfileBullet]] = []
    for exp, b in relevant:  # best fact per role first
        if exp.id not in {e.id for e, _ in picked}:
            picked.append((exp, b))
    picked += [eb for eb in relevant if eb not in picked]
    picked = picked[:k]
    order = {e.id: i for i, e in enumerate(profile.experiences)}
    return sorted(picked, key=lambda eb: order[eb[0].id])


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + f" and {items[-1]}"


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text[:2] != text[:2].upper() else text


def heuristic_letter(
    profile: CareerProfile, jd: JDAnalysis, company: str | None, company_notes: str | None = None
) -> CoverLetter:
    target = company or "your team"
    matched = [k.term for k in jd.keywords if k.category in {"must_have", "tool"}
               and taxonomy.contains(k.term, profile.all_text())][:3]
    current = profile.experiences[0] if profile.experiences else None
    intro = f"I'm applying for the {jd.title} role at {target}."
    if current and matched:
        intro += (f" In my current role as {current.title} at {current.company}, I work hands-on with "
                  f"{_join(matched)}, the core of what this role asks for.")
    elif current:
        intro += f" I currently work as {current.title} at {current.company}."
    paragraphs = [CoverLetterParagraph(text=intro)]
    by_company: dict[str, list[ProfileBullet]] = {}
    for exp, b in _evidence(profile, jd):
        by_company.setdefault(exp.company, []).append(b)
    connectors = ["I also", "Beyond that, I"]
    for n, (company_name, facts) in enumerate(by_company.items()):
        lead = "At" if n == 0 else "Before that, at"
        sentences = [f"{lead} {company_name}, I {_lower_first(facts[0].text.rstrip('.'))}."]
        sentences += [f"{connectors[min(i, 1)]} {_lower_first(f.text.rstrip('.'))}." for i, f in enumerate(facts[1:])]
        paragraphs.append(CoverLetterParagraph(text=" ".join(sentences), source_ids=[f.id for f in facts]))
    close = f"I'd welcome a conversation about how I can bring the same results to {target}."
    if company_notes and company_notes.strip():
        close = f"What draws me to {target}: {company_notes.strip().rstrip('.')}. " + close
    paragraphs.append(CoverLetterParagraph(text=close + " Thank you for your time and consideration."))
    return CoverLetter(greeting="Dear Hiring Manager,", paragraphs=paragraphs,
                       closing=f"Sincerely,\n{profile.contact.name}")


def render_text(letter: CoverLetter) -> str:
    return "\n\n".join([letter.greeting, *(p.text for p in letter.paragraphs), letter.closing])


def check_letter(letter: CoverLetter, profile: CareerProfile):
    index = profile.bullet_index()
    issues = []
    for i, p in enumerate(letter.paragraphs):
        cited = [index[s][1].text for s in p.source_ids if s in index]
        # Uncited paragraphs (intro/close) may only use numbers that exist somewhere in the profile.
        issues += verify_text(p.text, cited or [profile.all_text()], profile, f"paragraph {i + 1}")
    return issues


def write_cover_letter(
    profile: CareerProfile, jd: JDAnalysis, llm: LLMClient | None = None, company: str | None = None,
    company_notes: str | None = None, tone: str = "confident",
) -> CoverLetterResult:
    if llm is None:
        letter = heuristic_letter(profile, jd, company, company_notes)
    else:
        user = "\n\n".join([
            "<candidate_profile>\n" + json.dumps(profile.for_llm(), indent=1) + "\n</candidate_profile>",
            f"<candidate_name>{profile.contact.name}</candidate_name>",
            untrusted("job_analysis", jd.model_dump_json(indent=1)),
            f"<company>{company or 'not given'}</company>",
            untrusted("company_notes", company_notes) if company_notes else "",
            f"<tone>{tone if tone in TONES else 'confident'}</tone>",
        ])
        letter = llm.structured(system=SYSTEM, user=user, schema=CoverLetter, tier="main", effort="high")
    text = render_text(letter)
    return CoverLetterResult(letter=letter, text=text, issues=check_letter(letter, profile),
                             word_count=len(text.split()))
