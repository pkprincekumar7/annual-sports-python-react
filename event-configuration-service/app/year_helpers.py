from typing import Any, Dict, Optional

from .cache import cache
from .db import event_years_collection
from .ist_dates import (
    format_date_ist,
    ist_day_after,
    ist_end_of_day,
    ist_midnight_on,
    now_ist_midnight,
)
from .validators import normalize_event_name


def build_event_id(event_year: int, event_name: str) -> str:
    normalized_name = normalize_event_name(event_name).replace(" ", "-")
    while "--" in normalized_name:
        normalized_name = normalized_name.replace("--", "-")
    return f"{event_year}-{normalized_name}".lower()


def should_event_year_be_active(event_year_doc: Dict[str, Any]) -> bool:
    if not event_year_doc:
        return False
    reg_start = ist_midnight_on(event_year_doc.get("registration_dates", {}).get("start"))
    event_end = ist_end_of_day(event_year_doc.get("event_dates", {}).get("end"))
    if not reg_start or not event_end:
        return False
    now = now_ist_midnight()
    return reg_start <= now <= event_end


async def find_active_event_year() -> Optional[Dict[str, Any]]:
    all_event_years = await event_years_collection().find({}).sort("event_year", -1).to_list(
        length=None
    )
    for event_year_doc in all_event_years:
        if should_event_year_be_active(event_year_doc):
            return event_year_doc
    return None


async def get_active_event_year_cached() -> Optional[Dict[str, Any]]:
    cached = cache.get("/event-configurations/event-years/active")
    if cached and should_event_year_be_active(cached):
        return cached
    if cached:
        cache.clear("/event-configurations/event-years/active")
    active = await find_active_event_year()
    if active:
        cache.set("/event-configurations/event-years/active", active)
    return active


def validate_date_relationships(
    registration_dates: Dict[str, Any], event_dates: Dict[str, Any]
) -> Dict[str, Any]:
    if not registration_dates or not event_dates:
        return {"isValid": False, "error": "Registration dates and event dates are required"}

    reg_start = registration_dates.get("start")
    reg_end = registration_dates.get("end")
    event_start = event_dates.get("start")
    event_end = event_dates.get("end")

    if not reg_start or not reg_end or not event_start or not event_end:
        return {"isValid": False, "error": "Registration dates and event dates are required"}

    if ist_day_after(reg_start, reg_end):
        return {
            "isValid": False,
            "error": "Registration start date must be before registration end date",
        }

    if not ist_day_after(event_start, reg_end):
        return {
            "isValid": False,
            "error": "Registration end date must be before event start date",
        }

    if ist_day_after(event_start, event_end):
        return {"isValid": False, "error": "Event start date must be before event end date"}

    return {"isValid": True, "error": None}


def get_updatable_date_fields(existing_event_year: Dict[str, Any]) -> Dict[str, bool]:
    now = now_ist_midnight()

    reg_start = ist_midnight_on(existing_event_year.get("registration_dates", {}).get("start"))
    reg_end = ist_end_of_day(existing_event_year.get("registration_dates", {}).get("end"))
    event_start = ist_midnight_on(existing_event_year.get("event_dates", {}).get("start"))
    event_end = ist_end_of_day(existing_event_year.get("event_dates", {}).get("end"))

    if not reg_start or not reg_end or not event_start or not event_end:
        return {
            "canUpdateRegStart": False,
            "canUpdateRegEnd": False,
            "canUpdateEventStart": False,
            "canUpdateEventEnd": False,
        }

    if now > event_end:
        return {
            "canUpdateRegStart": False,
            "canUpdateRegEnd": False,
            "canUpdateEventStart": False,
            "canUpdateEventEnd": False,
        }

    if now >= event_start:
        return {
            "canUpdateRegStart": False,
            "canUpdateRegEnd": False,
            "canUpdateEventStart": False,
            "canUpdateEventEnd": True,
        }

    if now >= reg_end:
        return {
            "canUpdateRegStart": False,
            "canUpdateRegEnd": False,
            "canUpdateEventStart": True,
            "canUpdateEventEnd": True,
        }

    if now >= reg_start:
        return {
            "canUpdateRegStart": False,
            "canUpdateRegEnd": True,
            "canUpdateEventStart": True,
            "canUpdateEventEnd": True,
        }

    return {
        "canUpdateRegStart": True,
        "canUpdateRegEnd": True,
        "canUpdateEventStart": True,
        "canUpdateEventEnd": True,
    }


def format_event_date(value: Any) -> str:
    return format_date_ist(value)
