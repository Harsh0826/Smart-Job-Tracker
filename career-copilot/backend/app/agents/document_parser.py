"""Document Parser agent (deterministic).

Extracts text from PDF/DOCX/TXT and parses it into sections and a draft Career Profile.
The same parser powers the ATS parse round-trip test, so it is deliberately conservative:
a field it cannot recover from a rendered resume is a field a real ATS may lose too.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

from app.ats import taxonomy
from app.ats.dates import DATE_RANGE, parse_date_token
from app.schemas.profile import (
    CareerProfile,
    ContactInfo,
    Education,
    ProfileBullet,
    ProfileExperience,
)

HEADING_ALIASES: dict[str, str] = {
    "summary": "summary", "professional summary": "summary", "profile": "summary",
    "about": "summary", "objective": "summary",
    "experience": "experience", "work experience": "experience",
    "professional experience": "experience", "employment history": "experience",
    "work history": "experience",
    "education": "education",
    "skills": "skills", "technical skills": "skills", "core competencies": "skills",
    "skills & tools": "skills",
    "certifications": "certifications", "licenses & certifications": "certifications",
    "certificates": "certifications",
    "projects": "projects",
}
BULLET_PREFIX = re.compile(r"^\s*[•\-\*▪●◦]\s+")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"\+?\d[\d\s().-]{8,}\d")
LINK = re.compile(r"(?:https?://)?(?:www\.)?(?:linkedin\.com|github\.com)/[\w/.-]+|https?://\S+", re.I)
DEGREE = re.compile(r"\b(B\.?S\.?c?|B\.?A\.?|Bachelor|M\.?S\.?c?|M\.?A\.?|Master|MBA|Ph\.?D|Associate)\b", re.I)


class UnsupportedFileType(ValueError):
    pass


def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if name.endswith(".docx"):
        from docx import Document

        doc = Document(io.BytesIO(data))
        lines = []
        for p in doc.paragraphs:
            style = (p.style.name if p.style is not None else "") or ""
            lines.append(f"• {p.text}" if style.startswith("List") and p.text.strip() else p.text)
        return "\n".join(lines)
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace")
    raise UnsupportedFileType(f"unsupported file type: {filename} (use PDF, DOCX or TXT)")


def _heading(line: str) -> str | None:
    key = line.strip().rstrip(":").strip().lower()
    return HEADING_ALIASES.get(key)


def split_sections(text: str) -> tuple[list[str], dict[str, list[str]]]:
    """Returns (header lines before the first heading, {section: lines})."""
    header: list[str] = []
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if (name := _heading(line)) is not None:
            current = name
            sections.setdefault(name, [])
        elif current is None:
            header.append(line)
        else:
            sections[current].append(line)
    return header, sections


@dataclass
class ParsedExperience:
    title: str
    company: str
    location: str | None
    start: str
    end: str | None
    bullets: list[str] = field(default_factory=list)


@dataclass
class ParsedResume:
    contact: ContactInfo
    summary: str | None
    experiences: list[ParsedExperience]
    education: list[Education]
    skills: list[str]
    certifications: list[str]
    sections_found: list[str]


def _split_header(text: str) -> tuple[str, str]:
    for sep in (" | ", " — ", " – ", " at ", ", "):
        if sep in text:
            left, right = text.split(sep, 1)
            return left.strip(), right.strip()
    return text.strip(), ""


def _parse_experience(lines: list[str]) -> list[ParsedExperience]:
    out: list[ParsedExperience] = []
    pending: list[str] = []
    for line in lines:
        if BULLET_PREFIX.match(line):
            if out:
                out[-1].bullets.append(BULLET_PREFIX.sub("", line).strip())
            continue
        m = DATE_RANGE.search(line)
        if m is None:
            pending.append(line)
            continue
        try:
            start, end = parse_date_token(m.group("start")), parse_date_token(m.group("end"))
        except ValueError:
            pending.append(line)
            continue
        rest = (line[: m.start()] + line[m.end():]).strip(" |,–—-\t")
        if rest:  # "Senior Engineer, Acme   Jan 2020 – Present"
            pending.append(rest)
        if len(pending) >= 2:
            title, company_line = pending[-2], pending[-1]
        elif pending:
            title, company_line = _split_header(pending[-1])
        else:
            title, company_line = "", ""
        company, location = _split_header(company_line) if " | " in company_line else (company_line, None)
        out.append(ParsedExperience(title, company, location or None, start or "1900-01", end))
        pending = []
    return out


def _parse_education(lines: list[str]) -> list[Education]:
    out: list[Education] = []
    for i, line in enumerate(lines):
        if DEGREE.search(line) or BULLET_PREFIX.match(line):
            continue
        degree_line = lines[i + 1] if i + 1 < len(lines) and DEGREE.search(lines[i + 1]) else ""
        degree, _, rest = degree_line.partition(" | ")
        degree_name, _, fld = degree.partition(" in ")
        end = None
        if m := re.search(r"(?:[A-Za-z]{3,9}\.?\s+)?\d{4}", rest):
            try:
                end = parse_date_token(m.group(0))
            except ValueError:
                end = None
        out.append(
            Education(
                id=f"ed{len(out) + 1}",
                institution=line,
                degree=degree_name.strip() or "Unspecified",
                field=fld.strip() or None,
                end=end,
            )
        )
    return out


def _split_list(lines: list[str]) -> list[str]:
    items: list[str] = []
    for line in lines:
        line = BULLET_PREFIX.sub("", line)
        if ":" in line and line.index(":") < 30:  # "Languages: Python, Go"
            line = line.split(":", 1)[1]
        items += [s.strip() for s in re.split(r"[,;|•]", line) if s.strip()]
    return items


def parse_resume_text(text: str) -> ParsedResume:
    header, sections = split_sections(text)
    joined = " ".join(header)
    name = header[0] if header else ""
    email = m.group(0) if (m := EMAIL.search(joined)) else None
    phone = m.group(0).strip() if (m := PHONE.search(joined)) else None
    links = LINK.findall(joined)
    location = None
    for part in re.split(r"\s*\|\s*", " | ".join(header[1:])):
        if re.fullmatch(r"[A-Za-z .'-]+,\s*[A-Za-z .]{2,}", part) and not EMAIL.search(part):
            location = part
            break
    return ParsedResume(
        contact=ContactInfo(name=name, email=email, phone=phone, location=location, links=links),
        summary=" ".join(sections.get("summary", [])) or None,
        experiences=_parse_experience(sections.get("experience", [])),
        education=_parse_education(sections.get("education", [])),
        skills=taxonomy.dedupe(_split_list(sections.get("skills", []))),
        certifications=taxonomy.dedupe(_split_list(sections.get("certifications", []))),
        sections_found=list(sections),
    )


def to_profile(parsed: ParsedResume) -> CareerProfile:
    experiences = []
    for i, exp in enumerate(parsed.experiences, start=1):
        eid = f"e{i}"
        experiences.append(
            ProfileExperience(
                id=eid,
                title=exp.title,
                company=exp.company,
                location=exp.location,
                start=exp.start,
                end=exp.end,
                bullets=[ProfileBullet(id=f"{eid}.b{j}", text=t) for j, t in enumerate(exp.bullets, 1)],
            )
        )
    return CareerProfile(
        contact=parsed.contact,
        summary=parsed.summary,
        experiences=experiences,
        education=parsed.education,
        skills=parsed.skills,
        certifications=parsed.certifications,
    )


class DocumentParser:
    name = "document_parser"

    def run(self, filename: str, data: bytes) -> CareerProfile:
        return to_profile(parse_resume_text(extract_text(filename, data)))
