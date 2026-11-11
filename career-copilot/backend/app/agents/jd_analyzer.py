"""JD Analyzer agent.

LLM path: Claude Haiku 5.5 (worker tier, low effort) extracts a typed JDExtraction.
Offline path: a lexicon + section heuristic. Weights are always applied in code so scoring stays
deterministic: must-have 3, tool/certification 2, nice-to-have 1, soft skill 0.5, x1.5 when the
term repeats in the posting or appears in its title.
"""

from __future__ import annotations

import re

from app.agents.llm import LLMClient, untrusted
from app.ats import taxonomy
from app.schemas.jd import JDAnalysis, JDExtraction, Keyword, KeywordCategory

BASE_WEIGHTS: dict[KeywordCategory, float] = {
    "must_have": 3.0, "tool": 2.0, "certification": 2.0, "nice_to_have": 1.0, "soft_skill": 0.5,
}
REPEAT_BOOST = 1.5

SYSTEM = """You analyze job postings for a resume-tailoring system.
Extract requirements exactly as the posting states them. Use short canonical skill names
("Kubernetes", "PostgreSQL", "CI/CD"), not sentences. must_have = stated as required;
nice_to_have = preferred / bonus / plus. tools = named software the role uses that is not already
listed. knockout_criteria = hard gates such as security clearance, licences, work authorization,
or on-site location requirements. Do not infer requirements the posting does not state."""

MUST_HEADINGS = ("requirement", "qualification", "what you'll need", "what you need", "must have",
                 "you have", "minimum", "about you", "you bring")
NICE_HEADINGS = ("nice to have", "preferred", "bonus", "plus", "good to have")
SENIORITY = ("intern", "junior", "associate", "mid", "senior", "staff", "principal", "lead", "manager",
             "director", "head")
KNOCKOUT = re.compile(r"clearance|authori[sz]ed to work|work authori[sz]ation|sponsorship|licen[cs]e|"
                      r"must (?:be located|reside)|on-?site", re.I)
CERT = re.compile(r"\b(?:AWS Certified [\w -]+|PMP|CISSP|CPA|CFA|CKA|CKAD|Security\+|"
                  r"Google Cloud (?:Professional|Associate) [\w ]+)\b")
YEARS = re.compile(r"(\d+)\s*\+?\s*(?:years|yrs)", re.I)


def heuristic_extract(text: str) -> JDExtraction:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    title = re.sub(r"^(job title|title|role)\s*:\s*", "", lines[0], flags=re.I) if lines else "Unknown"
    must: list[str] = []
    nice: list[str] = []
    elsewhere: list[str] = []
    mode = "other"
    for line in lines[1:]:
        low = line.lower().rstrip(":")
        is_heading = len(line) < 60 and not line.startswith(("-", "•", "*"))
        if is_heading and any(h in low for h in NICE_HEADINGS):
            mode = "nice"
            continue
        if is_heading and any(h in low for h in MUST_HEADINGS):
            mode = "must"
            continue
        if is_heading and line.endswith(":"):
            mode = "other"
            continue
        inline_nice = bool(re.search(r"\b(preferred|a plus|bonus|nice to have)\b", low))
        bucket = nice if mode == "nice" or inline_nice else must if mode == "must" else elsewhere
        bucket += [s for s in taxonomy.TECH_SKILLS if taxonomy.contains(s, line)]

    def dedupe(items: list[str], *exclude: list[str]) -> list[str]:
        seen = {taxonomy.canonical(x) for group in exclude for x in group}
        out = []
        for item in items:
            key = taxonomy.canonical(item)
            if key not in seen:
                seen.add(key)
                out.append(item)
        return out

    must = dedupe(must)
    nice = dedupe(nice, must)
    tools = dedupe([s for s in elsewhere if s in taxonomy.TOOLS], must, nice)
    must, nice, tools = ([taxonomy.display(t) for t in group] for group in (must, nice, tools))
    years = [int(m) for m in YEARS.findall(text)]
    seniority = next((w for w in SENIORITY if re.search(rf"\b{w}\b", title, re.I)), None)
    return JDExtraction(
        title=title,
        seniority=seniority,
        years_required=min(years) if years else None,
        must_have=must,
        nice_to_have=nice,
        tools=tools,
        certifications=sorted(set(CERT.findall(text))),
        soft_skills=[s.capitalize() for s in taxonomy.SOFT_SKILLS if taxonomy.contains(s, text)],
        knockout_criteria=[ln for ln in lines if KNOCKOUT.search(ln)],
    )


def weight(extraction: JDExtraction, text: str) -> JDAnalysis:
    keywords: dict[str, Keyword] = {}
    groups: list[tuple[KeywordCategory, list[str]]] = [
        ("must_have", extraction.must_have),
        ("certification", extraction.certifications),
        ("tool", extraction.tools),
        ("nice_to_have", extraction.nice_to_have),
        ("soft_skill", extraction.soft_skills),
    ]
    for category, terms in groups:
        for term in terms:
            key = taxonomy.canonical(term)
            if not key or key in keywords:
                continue
            w = BASE_WEIGHTS[category]
            if taxonomy.count(term, text) >= 2 or taxonomy.contains(term, extraction.title):
                w *= REPEAT_BOOST
            keywords[key] = Keyword(term=term, category=category, weight=w)
    return JDAnalysis(
        title=extraction.title,
        seniority=extraction.seniority,
        years_required=extraction.years_required,
        keywords=list(keywords.values()),
        knockout_criteria=list(dict.fromkeys(c.strip() for c in extraction.knockout_criteria if c.strip())),
    )


class JDAnalyzer:
    name = "jd_analyzer"

    def __init__(self, llm: LLMClient | None = None):
        self.llm = llm

    def run(self, text: str) -> JDAnalysis:
        if self.llm is None:
            extraction = heuristic_extract(text)
        else:
            extraction = self.llm.structured(
                system=SYSTEM,
                user=untrusted("job_posting", text),
                schema=JDExtraction,
                tier="worker",
                effort="low",
            )
        return weight(extraction, text)
