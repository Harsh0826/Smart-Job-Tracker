"""Skill taxonomy: canonical names, synonyms/acronyms and matching.

MVP: a curated in-code table. Production: back this with ESCO / O*NET / Lightcast plus embeddings.
"""

from __future__ import annotations

import re
from functools import lru_cache

SYNONYMS: dict[str, list[str]] = {
    "ci/cd": ["continuous integration", "continuous delivery", "continuous deployment", "ci cd"],
    "kubernetes": ["k8s"],
    "postgresql": ["postgres"],
    "amazon web services": ["aws"],
    "google cloud platform": ["gcp", "google cloud"],
    "microsoft azure": ["azure"],
    "machine learning": ["ml"],
    "natural language processing": ["nlp"],
    "large language models": ["llm", "llms"],
    "search engine optimization": ["seo"],
    "rest api": ["rest apis", "restful api", "restful apis", "restful"],
    "infrastructure as code": ["iac"],
    "a/b testing": ["ab testing", "split testing"],
    "javascript": ["js"],
    "user experience": ["ux"],
}

_VARIANT_TO_CANONICAL = {v: k for k, vs in SYNONYMS.items() for v in vs}

# Lexicon for the heuristic (no-LLM) JD analyzer and for spotting unsupported skills.
TECH_SKILLS = [
    # Ambiguous English words ("go", "excel") are left out: they cause false matches in prose.
    "python", "java", "javascript", "typescript", "golang", "rust", "c++", "c#", "scala", "kotlin",
    "ruby", "php", "sql", "nosql", "postgresql", "mysql", "mongodb", "redis", "kafka", "spark", "airflow",
    "dbt", "snowflake", "bigquery", "pandas", "numpy", "pytorch", "tensorflow", "scikit-learn",
    "machine learning", "natural language processing", "large language models", "docker", "kubernetes",
    "terraform", "ansible", "amazon web services", "google cloud platform", "microsoft azure", "ci/cd",
    "git", "linux", "react", "next.js", "node.js", "graphql", "rest api", "microservices", "fastapi",
    "django", "flask", "spring", "html", "css", "tableau", "power bi", "figma", "jira",
    "salesforce", "search engine optimization", "a/b testing", "data visualization", "statistics",
    "infrastructure as code", "agile", "scrum", "product management", "user experience",
]
TOOLS = {
    "docker", "kubernetes", "terraform", "ansible", "git", "jira", "tableau", "power bi", "figma",
    "salesforce", "airflow", "dbt", "snowflake", "bigquery", "kafka",
}
SOFT_SKILLS = [
    "communication", "leadership", "collaboration", "mentoring", "problem solving", "ownership",
    "stakeholder management", "cross-functional",
]


DISPLAY: dict[str, str] = {
    "amazon web services": "AWS", "google cloud platform": "GCP", "microsoft azure": "Azure",
    "ci/cd": "CI/CD", "fastapi": "FastAPI", "postgresql": "PostgreSQL", "mysql": "MySQL", "mongodb": "MongoDB",
    "javascript": "JavaScript", "typescript": "TypeScript", "graphql": "GraphQL", "nosql": "NoSQL",
    "sql": "SQL", "html": "HTML", "css": "CSS", "rest api": "REST APIs", "c++": "C++", "c#": "C#",
    "next.js": "Next.js", "node.js": "Node.js", "pytorch": "PyTorch", "tensorflow": "TensorFlow",
    "scikit-learn": "scikit-learn", "bigquery": "BigQuery", "power bi": "Power BI", "dbt": "dbt",
    "large language models": "LLMs", "natural language processing": "NLP", "a/b testing": "A/B testing",
    "search engine optimization": "SEO", "infrastructure as code": "Infrastructure as Code", "php": "PHP",
    "user experience": "UX",
}


def display(term: str) -> str:
    key = canonical(term)
    return DISPLAY.get(key) or (key.title() if key == term.lower() else term)


def canonical(term: str) -> str:
    key = " ".join(term.lower().split())
    return _VARIANT_TO_CANONICAL.get(key, key)


def dedupe(terms: list[str]) -> list[str]:
    """Drop repeats (case, spacing and synonyms: 'AWS' == 'Amazon Web Services'), keeping first spelling."""
    seen: set[str] = set()
    out = []
    for term in terms:
        key = canonical(term)
        if key and key not in seen:
            seen.add(key)
            out.append(term.strip())
    return out


def variants(term: str) -> list[str]:
    base = canonical(term)
    return sorted({base, *SYNONYMS.get(base, [])}, key=len, reverse=True)


_SOFT_SUFFIXES = ("ation", "ing", "ion", "ed", "s")


def _soft_stem(word: str) -> str | None:
    """'mentoring' -> 'mentor' so 'Mentored' counts. Soft skills only: stemming tech terms
    causes false hits ('spring' -> 'spr' would match 'sprint')."""
    if word not in SOFT_SKILLS or " " in word or "-" in word:
        return None
    for suffix in _SOFT_SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 5:
            return word[: -len(suffix)]
    return None


@lru_cache(maxsize=2048)
def _pattern(term: str) -> re.Pattern[str]:
    stem = _soft_stem(canonical(term))
    alts = [re.escape(v) for v in variants(term)] + ([re.escape(stem) + r"\w{0,6}"] if stem else [])
    alternation = "|".join(alts)
    # Edges that also work for terms like "c++", "c#", ".net", "node.js".
    return re.compile(rf"(?<![\w+#]){'(?:' + alternation + ')'}(?![\w+#])", re.IGNORECASE)


def count(term: str, text: str) -> int:
    return len(_pattern(term).findall(text))


def contains(term: str, text: str) -> bool:
    return _pattern(term).search(text) is not None
