from datetime import datetime
from typing import Any, Dict, Optional

import json

from fastapi import Request

from .auth import get_request_token
from .errors import send_error_response
from .external_services import get_event_year, get_active_event_year


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


def _parse_date(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


async def check_registration_date_range(
    event_id: Optional[str] = None,
    token: str = "",
) -> Dict[str, Any]:
    try:
        event_year_data = await get_event_year(event_id, return_doc=True, token=token)
        event_year_doc = event_year_data.get("doc")
        if not event_year_doc:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "No active event year found. Please contact administrator.",
            }
        now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        reg_start = _parse_date(event_year_doc.get("registration_dates", {}).get("start"))
        reg_end = _parse_date(event_year_doc.get("registration_dates", {}).get("end"))
        if not reg_start or not reg_end:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "Error checking registration date range. Please try again.",
            }
        reg_start = reg_start.replace(hour=0, minute=0, second=0, microsecond=0)
        reg_end = reg_end.replace(hour=23, minute=59, second=59, microsecond=999000)
        is_within = reg_start <= now <= reg_end
        return {
            "isWithin": is_within,
            "eventYearDoc": event_year_doc,
            "message": ""
            if is_within
            else f"This operation is only allowed during registration period ({_format_date(reg_start)} to {_format_date(reg_end)}).",
        }
    except Exception:
        return {
            "isWithin": False,
            "eventYearDoc": None,
            "message": "Error checking registration date range. Please try again.",
        }


async def require_registration_period(request: Request) -> Optional[Any]:
    event_id = request.query_params.get("event_id")
    if not event_id and request.method in {"POST", "PUT", "DELETE"}:
        body_bytes = await request.body()
        if body_bytes:
            try:
                body = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                body = {}
            event_id = body.get("event_id")
    token = get_request_token(request)
    check = await check_registration_date_range(event_id, token=token)
    if not check["isWithin"]:
        return send_error_response(400, check["message"])
    request.state.event_year_doc = check["eventYearDoc"]
    return None


async def check_registration_deadline(request: Request) -> Optional[Any]:
    if request.method == "GET":
        return None
    path = request.url.path
    if path in {
        "/identities/login",
        "/identities/change-password",
        "/identities/reset-password",
    }:
        return None
    try:
        active_year = await get_active_event_year()
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
            return send_error_response(400, f"Registration for events closed on {_format_date(deadline)}.")
    except Exception:
        return send_error_response(500, "Error checking registration deadline. Please try again.")
    return None
