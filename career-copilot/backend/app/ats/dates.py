"""Date parsing/formatting shared by the parser, renderer, linter and scorer."""

from __future__ import annotations

import re
from datetime import date

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_MONTH_WORD = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
_DATE = rf"(?:{_MONTH_WORD}\s+\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}})"
_END = rf"(?:{_DATE}|present|current|now)"
DATE_RANGE = re.compile(rf"(?P<start>{_DATE})\s*(?:–|—|-|to)\s*(?P<end>{_END})", re.IGNORECASE)


def parse_date_token(token: str) -> str | None:
    """'Mar 2021' | '03/2021' | '2021' -> 'YYYY-MM'; 'Present' -> None."""
    token = token.strip().lower().rstrip(".")
    if token in {"present", "current", "now"}:
        return None
    if m := re.fullmatch(r"(\d{1,2})/(\d{4})", token):
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    if m := re.fullmatch(r"(\d{4})", token):
        return f"{m.group(1)}-01"
    if m := re.fullmatch(r"([a-z]+)\.?\s+(\d{4})", token):
        month = MONTHS.index(m.group(1)[:3]) + 1
        return f"{m.group(2)}-{month:02d}"
    raise ValueError(f"unrecognized date: {token!r}")


def format_ym(value: str | None) -> str:
    if value is None:
        return "Present"
    year, month = value.split("-")
    return f"{MONTHS[int(month) - 1].capitalize()} {year}"


def format_range(start: str, end: str | None) -> str:
    return f"{format_ym(start)} – {format_ym(end)}"


def months_between(start: str, end: str | None, today: date | None = None) -> int:
    today = today or date.today()
    sy, sm = (int(x) for x in start.split("-"))
    ey, em = (today.year, today.month) if end is None else (int(x) for x in end.split("-"))
    return max(0, (ey - sy) * 12 + (em - sm))
