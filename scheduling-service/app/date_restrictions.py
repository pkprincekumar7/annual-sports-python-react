from typing import Any, Dict, Optional

import json

from fastapi import Request

from .auth import _ResponseException, get_request_token
from .errors import send_error_response
from .external_services import get_event_year
from .ist_dates import (
    format_date_ist,
    ist_end_of_day,
    ist_midnight_on,
    now_ist_midnight,
)


async def _resolve_event_year_doc(
    event_id: Optional[str] = None,
    token: str = "",
) -> Optional[Dict[str, Any]]:
    if event_id and str(event_id).strip():
        event_year_data = await get_event_year(
            str(event_id).strip(),
            return_doc=True,
            token=token,
        )
        return event_year_data.get("doc")
    event_year_data = await get_event_year(None, return_doc=True, token=token)
    return event_year_data.get("doc")


async def check_event_date_range(
    event_id: Optional[str] = None,
    token: str = "",
) -> Dict[str, Any]:
    try:
        event_year_doc = await _resolve_event_year_doc(event_id, token=token)
        if not event_year_doc:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "No active event year found. Please contact administrator.",
            }
        now = now_ist_midnight()
        reg_end = ist_end_of_day(event_year_doc.get("registration_dates", {}).get("end"))
        event_end = ist_end_of_day(event_year_doc.get("event_dates", {}).get("end"))
        if not reg_end or not event_end:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "Error checking event date range. Please try again.",
            }
        is_within = now > reg_end and now <= event_end
        return {
            "isWithin": is_within,
            "eventYearDoc": event_year_doc,
            "message": ""
            if is_within
            else (
                "This operation is only allowed after registration period ends and before event ends "
                f"(after {format_date_ist(reg_end)} and before {format_date_ist(event_end)})."
            ),
        }
    except Exception:
        return {
            "isWithin": False,
            "eventYearDoc": None,
            "message": "Error checking event date range. Please try again.",
        }


async def check_event_scheduling_date_range(
    event_id: Optional[str] = None,
    token: str = "",
) -> Dict[str, Any]:
    try:
        event_year_doc = await _resolve_event_year_doc(event_id, token=token)
        if not event_year_doc:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "No active event year found. Please contact administrator.",
            }
        now = now_ist_midnight()
        reg_start = ist_midnight_on(event_year_doc.get("registration_dates", {}).get("start"))
        event_end = ist_end_of_day(event_year_doc.get("event_dates", {}).get("end"))
        if not reg_start or not event_end:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "Error checking event scheduling date range. Please try again.",
            }
        is_within = reg_start <= now <= event_end
        return {
            "isWithin": is_within,
            "eventYearDoc": event_year_doc,
            "message": ""
            if is_within
            else (
                "Event scheduling is only allowed after registration starts and before event ends "
                f"(after {format_date_ist(reg_start)} and before {format_date_ist(event_end)})."
            ),
        }
    except Exception:
        return {
            "isWithin": False,
            "eventYearDoc": None,
            "message": "Error checking event scheduling date range. Please try again.",
        }


async def check_event_status_update_date_range(
    event_id: Optional[str] = None,
    token: str = "",
) -> Dict[str, Any]:
    try:
        event_year_doc = await _resolve_event_year_doc(event_id, token=token)
        if not event_year_doc:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "No active event year found. Please contact administrator.",
            }
        now = now_ist_midnight()
        event_start = ist_midnight_on(event_year_doc.get("event_dates", {}).get("start"))
        event_end = ist_end_of_day(event_year_doc.get("event_dates", {}).get("end"))
        if not event_start or not event_end:
            return {
                "isWithin": False,
                "eventYearDoc": None,
                "message": "Error checking event status update date range. Please try again.",
            }
        is_within = event_start <= now <= event_end
        return {
            "isWithin": is_within,
            "eventYearDoc": event_year_doc,
            "message": ""
            if is_within
            else (
                "Event status updates are only allowed during event period "
                f"({format_date_ist(event_start)} to {format_date_ist(event_end)})."
            ),
        }
    except Exception:
        return {
            "isWithin": False,
            "eventYearDoc": None,
            "message": "Error checking event status update date range. Please try again.",
        }


def is_match_date_within_event_range(match_date: Any, event_year_doc: Dict[str, Any]) -> bool:
    if not event_year_doc or not match_date:
        return False
    match_value = ist_midnight_on(match_date)
    event_start = ist_midnight_on(event_year_doc.get("event_dates", {}).get("start"))
    event_end = ist_end_of_day(event_year_doc.get("event_dates", {}).get("end"))
    if not match_value or not event_start or not event_end:
        return False
    return event_start <= match_value <= event_end


async def require_event_period(request: Request) -> None:
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
    check = await check_event_date_range(event_id, token=token)
    if not check["isWithin"]:
        raise _ResponseException(send_error_response(400, check["message"]))
    request.state.event_year_doc = check["eventYearDoc"]
    return None


async def require_event_scheduling_period(request: Request) -> None:
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
    check = await check_event_scheduling_date_range(event_id, token=token)
    if not check["isWithin"]:
        raise _ResponseException(send_error_response(400, check["message"]))
    request.state.event_year_doc = check["eventYearDoc"]
    return None


async def require_event_status_update_period(request: Request) -> None:
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
    check = await check_event_status_update_date_range(event_id, token=token)
    if not check["isWithin"]:
        raise _ResponseException(send_error_response(400, check["message"]))
    request.state.event_year_doc = check["eventYearDoc"]
    return None
