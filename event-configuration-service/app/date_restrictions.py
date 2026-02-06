from datetime import datetime
from typing import Optional

from fastapi import Request

from .errors import send_error_response
from .year_helpers import get_active_event_year_cached


def _format_date(date_value: datetime) -> str:
    day = date_value.day
    month = date_value.strftime("%b")
    year = date_value.year
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


def _parse_date(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


async def check_registration_deadline(request: Request):
    if request.method == "GET":
        return None
    path = request.url.path
    if path in {
        "/identities/login",
        "/identities/change-password",
        "/identities/reset-password",
    }:
        return None
    if path.startswith("/event-configurations/event-years"):
        return None
    try:
        active_year = await get_active_event_year_cached()
        if not active_year or not active_year.get("registration_dates", {}).get("end"):
            return send_error_response(
                500,
                "Registration deadline is not configured. Please contact administrator to set up event year with registration dates.",
            )
        deadline = _parse_date(active_year["registration_dates"]["end"])
        if not deadline:
            return send_error_response(
                500,
                "Registration deadline is not configured. Please contact administrator to set up event year with registration dates.",
            )
        now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        deadline = deadline.replace(hour=0, minute=0, second=0, microsecond=0)
        if now > deadline:
            return send_error_response(
                400, f"Registration for events closed on {_format_date(deadline)}."
            )
    except Exception:
        return send_error_response(500, "Error checking registration deadline. Please try again.")
    return None
