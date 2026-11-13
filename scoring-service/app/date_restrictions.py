from typing import Any, Optional

from fastapi import Request

from .errors import send_error_response
from .external_services import get_active_event_year
from .ist_dates import format_date_ist, ist_day_after, now_ist_midnight


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
