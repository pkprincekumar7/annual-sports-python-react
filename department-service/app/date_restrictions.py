from typing import Any, Dict, Optional

import json

from fastapi import Request

from .auth import _ResponseException, get_request_token
from .errors import send_error_response
from .external_services import get_event_year, get_active_event_year
from .ist_dates import (
    format_date_ist,
    ist_day_after,
    ist_end_of_day,
    ist_midnight_on,
    now_ist_midnight,
)


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
        now = now_ist_midnight()
        reg_start = ist_midnight_on(event_year_doc.get("registration_dates", {}).get("start"))
        reg_end = ist_end_of_day(event_year_doc.get("registration_dates", {}).get("end"))
        if not reg_start or not reg_end:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "Error checking registration date range. Please try again.",
            }
        is_within = reg_start <= now <= reg_end
        return {
            "isWithin": is_within,
            "eventYearDoc": event_year_doc,
            "message": ""
            if is_within
            else f"This operation is only allowed during registration period ({format_date_ist(reg_start)} to {format_date_ist(reg_end)}).",
        }
    except Exception:
        return {
            "isWithin": False,
            "eventYearDoc": None,
            "message": "Error checking registration date range. Please try again.",
        }


async def require_registration_period(request: Request) -> None:
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
        raise _ResponseException(send_error_response(400, check["message"]))
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
        if not active_year:
            # No active event year (e.g. before registration starts or after the event ends).
            # Nothing to enforce globally; event-specific endpoints apply their own date guards.
            return None
        if not active_year.get("registration_dates", {}).get("end"):
            return send_error_response(
                500,
                "Registration deadline is not configured. Please contact administrator to set up event year with registration dates.",
            )
        deadline = active_year["registration_dates"]["end"]
        now = now_ist_midnight()
        if ist_day_after(now, deadline):
            return send_error_response(
                400, f"Registration for events closed on {format_date_ist(deadline)}."
            )
    except Exception:
        return send_error_response(500, "Error checking registration deadline. Please try again.")
    return None
