"""Renderer / Exporter agent (deterministic): Resume model -> ATS-safe DOCX.

Single column, no tables, text boxes, images, headers or footers. Contact info lives in the body.
PDF export (Typst or headless Chromium with a real text layer) is the next step; DOCX is the
safest format for older parsers such as Taleo.
"""

from __future__ import annotations

import io
import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

from app.ats.dates import format_range, format_ym
from app.schemas.resume import Resume

BODY_FONT = "Calibri"
DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _heading(doc, text: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(12)


def render_docx(resume: Resume) -> bytes:
    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = Pt(11)
    for section in doc.sections:
        section.top_margin = section.bottom_margin = Inches(0.7)
        section.left_margin = section.right_margin = Inches(0.75)

    c = resume.contact
    name = doc.add_paragraph()
    name.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = name.add_run(c.name)
    run.bold = True
    run.font.size = Pt(16)
    contact_bits = [x for x in (c.email, c.phone, c.location, *c.links) if x]
    if contact_bits:
        doc.add_paragraph(" | ".join(contact_bits))

    if resume.summary:
        _heading(doc, "Summary")
        doc.add_paragraph(resume.summary)

    if resume.experiences:
        _heading(doc, "Experience")
        for exp in resume.experiences:
            title = doc.add_paragraph()
            title.paragraph_format.space_before = Pt(6)
            title.paragraph_format.space_after = Pt(0)
            title.add_run(exp.title).bold = True
            company = doc.add_paragraph(" | ".join(x for x in (exp.company, exp.location) if x))
            company.paragraph_format.space_after = Pt(0)
            doc.add_paragraph(format_range(exp.start, exp.end)).paragraph_format.space_after = Pt(2)
            for bullet in exp.bullets:
                doc.add_paragraph(bullet.text, style="List Bullet")

    if resume.education:
        _heading(doc, "Education")
        for edu in resume.education:
            doc.add_paragraph().add_run(edu.institution).bold = True
            degree = edu.degree + (f" in {edu.field}" if edu.field else "")
            doc.add_paragraph(degree + (f" | {format_ym(edu.end)}" if edu.end else ""))

    if resume.skills:
        _heading(doc, "Skills")
        doc.add_paragraph(", ".join(resume.skills))

    if resume.certifications:
        _heading(doc, "Certifications")
        for cert in resume.certifications:
            doc.add_paragraph(cert, style="List Bullet")

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def export_filename(resume: Resume, role: str | None = None) -> str:
    parts = resume.contact.name.split() + ["Resume"] + (role.split() if role else [])
    slug = "-".join(re.sub(r"[^A-Za-z0-9]", "", p) for p in parts if re.sub(r"[^A-Za-z0-9]", "", p))
    return f"{slug}.docx"
