"""IST (Asia/Kolkata) helpers for event calendar dates."""

from datetime import datetime, timezone
from typing import Any, Optional

from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def parse_datetime(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    try:
        text = str(value).strip()
        if len(text) == 10 and text[4] == "-" and text[7] == "-":
            return datetime.fromisoformat(f"{text}T00:00:00+05:30").astimezone(timezone.utc)
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def to_ist(value: Any) -> Optional[datetime]:
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    return parsed.astimezone(IST)


def ist_midnight_on(value: Any) -> Optional[datetime]:
    ist = to_ist(value)
    if ist is None:
        return None
    return datetime(ist.year, ist.month, ist.day, 0, 0, 0, 0, tzinfo=IST)


def ist_end_of_day(value: Any) -> Optional[datetime]:
    start = ist_midnight_on(value)
    if start is None:
        return None
    return start.replace(hour=23, minute=59, second=59, microsecond=999000)


def now_ist_midnight() -> datetime:
    now = datetime.now(IST)
    return datetime(now.year, now.month, now.day, 0, 0, 0, 0, tzinfo=IST)


def now_ist() -> datetime:
    return datetime.now(IST)


def utc_naive_for_storage(value: Any, *, end_of_day: bool = False) -> Optional[datetime]:
    bound = ist_end_of_day(value) if end_of_day else ist_midnight_on(value)
    if bound is None:
        return None
    return bound.astimezone(timezone.utc).replace(tzinfo=None)


def ist_day_before(left: Any, right: Any) -> bool:
    a = ist_midnight_on(left)
    b = ist_midnight_on(right)
    if a is None or b is None:
        return False
    return a < b


def ist_day_after(left: Any, right: Any) -> bool:
    a = ist_midnight_on(left)
    b = ist_midnight_on(right)
    if a is None or b is None:
        return False
    return a > b


def to_utc_iso(value: Any) -> Optional[str]:
    """Serialize a datetime as an ISO string with an explicit UTC 'Z' marker.

    MongoDB returns naive datetimes that are UTC; without the marker, browsers
    parse them as local time and shift the IST calendar day.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return aware.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return str(value)


def current_ist_year() -> int:
    return datetime.now(IST).year


def format_date_ist(value: Any) -> str:
    ist = to_ist(value)
    if ist is None:
        return ""
    day = ist.day
    month = ist.strftime("%b")
    year = ist.year
    ordinal = _ordinal(day)
    return f"{ordinal} {month} {year}"


def _ordinal(day: int) -> str:
    if day % 10 == 1 and day % 100 != 11:
        return f"{day}st"
    if day % 10 == 2 and day % 100 != 12:
        return f"{day}nd"
    if day % 10 == 3 and day % 100 != 13:
        return f"{day}rd"
    return f"{day}th"
