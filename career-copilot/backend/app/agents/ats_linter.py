"""ATS Compliance Linter agent (deterministic).

Two passes:
1. Document rules on the rendered DOCX: no tables, text boxes, images, header/footer text,
   multi-column sections, hidden or white text; standard fonts and sizes.
2. Parse round-trip: re-parse the rendered file and diff it against the source model.
   Export is blocked below 95% field accuracy or if any role loses its title or dates.
"""

from __future__ import annotations

import io
import re

from docx import Document
from docx.oxml.ns import qn

from app.agents.document_parser import extract_text, parse_resume_text
from app.ats.dates import months_between
from app.schemas.reports import Issue, LintReport
from app.schemas.resume import Resume

ALLOWED_FONTS = {"calibri", "arial", "garamond", "georgia", "helvetica", "cambria", "times new roman"}
BODY_PT = (10.0, 12.0)
MAX_PT = 16.0
BAD_GLYPHS = re.compile(r"[ﬀ-ﬆ★☆✓✔✖\U0001F300-\U0001FAFF]")


def _norm(s: str | None) -> str:
    return " ".join((s or "").lower().split())


def _effective(run, paragraph, doc, attr: str):
    value = getattr(run.font, attr)
    style = paragraph.style
    while value is None and style is not None:
        value = getattr(style.font, attr)
        style = style.base_style
    if value is None:
        value = getattr(doc.styles["Normal"].font, attr)
    return value


def lint_resume(resume: Resume) -> list[Issue]:
    """Model-level rules that do not need the rendered file."""
    issues: list[Issue] = []
    if not resume.contact.name.strip():
        issues.append(Issue(rule="contact_name", severity="error", message="Name is missing"))
    if not resume.contact.email:
        issues.append(Issue(rule="contact_email", severity="warning", message="No email address"))
    total_months = 0
    for exp in resume.experiences:
        loc = exp.id
        if exp.end is not None and exp.end < exp.start:
            issues.append(Issue(rule="date_order", severity="error", location=loc,
                                message=f"End date {exp.end} is before start date {exp.start}"))
        if not exp.bullets:
            issues.append(Issue(rule="empty_role", severity="warning", location=loc,
                                message="Role has no bullets"))
        for i, b in enumerate(exp.bullets):
            if len(b.text) > 220:
                issues.append(Issue(rule="bullet_length", severity="warning",
                                    location=f"{loc}.bullets[{i}]",
                                    message="Bullet runs past two lines; tighten it"))
        total_months += months_between(exp.start, exp.end)
    text = resume.model_dump_json()
    if BAD_GLYPHS.search(text):
        issues.append(Issue(rule="special_glyphs", severity="error",
                            message="Ligatures, emoji or symbol glyphs break many parsers"))
    lines = 4 + sum(3 + sum(1 + len(b.text) // 100 for b in e.bullets) for e in resume.experiences)
    lines += 3 * len(resume.education) + 4
    pages = lines / 46
    limit = 1 if total_months < 8 * 12 else 2
    if pages > limit:
        issues.append(Issue(rule="length", severity="warning",
                            message=f"About {pages:.1f} pages; aim for {limit} at this experience level"))
    return issues


def lint_docx(data: bytes) -> list[Issue]:
    doc = Document(io.BytesIO(data))
    issues: list[Issue] = []
    body = doc.element.body
    if doc.tables:
        issues.append(Issue(rule="no_tables", severity="error", message="Tables scramble ATS parsing"))
    if body.findall(".//" + qn("w:txbxContent")):
        issues.append(Issue(rule="no_text_boxes", severity="error", message="Text boxes are skipped by many parsers"))
    if doc.inline_shapes or body.findall(".//" + qn("w:drawing")):
        issues.append(Issue(rule="no_graphics", severity="error", message="Remove images, icons and charts"))
    for section in doc.sections:
        for part, label in ((section.header, "header"), (section.footer, "footer")):
            if any(p.text.strip() for p in part.paragraphs):
                issues.append(Issue(rule="header_footer_text", severity="error",
                                    message=f"Text in the page {label} is often ignored; move it to the body"))
        cols = section._sectPr.find(qn("w:cols"))
        if cols is not None and int(cols.get(qn("w:num"), "1")) > 1:
            issues.append(Issue(rule="single_column", severity="error", message="Use a single-column layout"))

    for i, p in enumerate(doc.paragraphs):
        for run in p.runs:
            if not run.text.strip():
                continue
            font = (_effective(run, p, doc, "name") or "").lower()
            size = _effective(run, p, doc, "size")
            pt = size.pt if size is not None else 11.0
            where = f"paragraph {i + 1}"
            if font and font not in ALLOWED_FONTS:
                issues.append(Issue(rule="font_family", severity="error", location=where,
                                    message=f"Non-standard font '{font}'"))
            if pt > MAX_PT or (i > 0 and not BODY_PT[0] <= pt <= BODY_PT[1] and not run.bold):
                issues.append(Issue(rule="font_size", severity="error", location=where,
                                    message=f"Font size {pt:g}pt outside {BODY_PT[0]:g}-{BODY_PT[1]:g}pt body range"))
            if run.font.hidden:
                issues.append(Issue(rule="hidden_text", severity="error", location=where,
                                    message="Hidden text is treated as keyword manipulation"))
            color = run.font.color.rgb if run.font.color is not None and run.font.color.type else None
            if color is not None and str(color).upper() in {"FFFFFF", "FEFEFE"}:
                issues.append(Issue(rule="hidden_text", severity="error", location=where,
                                    message="White text is treated as keyword manipulation"))
    return issues


def parse_fidelity(data: bytes, resume: Resume) -> tuple[float, list[Issue]]:
    parsed = parse_resume_text(extract_text("resume.docx", data))
    issues: list[Issue] = []
    total = matched = 0

    total += 1
    matched += _norm(parsed.contact.name) == _norm(resume.contact.name)
    if resume.contact.email:
        total += 1
        matched += _norm(parsed.contact.email) == _norm(resume.contact.email)

    for exp in resume.experiences:
        hit = next(
            (p for p in parsed.experiences
             if _norm(p.title) == _norm(exp.title) and _norm(p.company) == _norm(exp.company)),
            None,
        )
        fields = 4
        total += fields
        if hit is None:
            issues.append(Issue(rule="role_lost_on_parse", severity="error", location=exp.id,
                                message=f"'{exp.title}' at {exp.company} was not recovered by the parser"))
            continue
        matched += 2 + (hit.start == exp.start) + (hit.end == exp.end)
        if hit.start != exp.start or hit.end != exp.end:
            issues.append(Issue(rule="dates_lost_on_parse", severity="error", location=exp.id,
                                message="Dates were not recovered exactly"))

    if resume.skills:
        total += 1
        found = {_norm(s) for s in parsed.skills}
        matched += sum(_norm(s) in found for s in resume.skills) / len(resume.skills)
    for edu in resume.education:
        total += 1
        matched += any(_norm(e.institution) == _norm(edu.institution) for e in parsed.education)

    return (matched / total if total else 1.0), issues


class ATSLinter:
    name = "ats_linter"

    def run(self, resume: Resume, docx_bytes: bytes) -> LintReport:
        fidelity, parse_issues = parse_fidelity(docx_bytes, resume)
        violations = lint_resume(resume) + lint_docx(docx_bytes) + parse_issues
        if fidelity < 0.95:
            violations.append(Issue(rule="parse_fidelity", severity="error",
                                    message=f"Parse round-trip recovered {fidelity:.0%} of fields (need 95%)"))
        return LintReport(violations=violations, parse_fidelity=round(fidelity, 3))
