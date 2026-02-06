import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..auth import admin_dependency, auth_dependency
from ..cache import cache
from ..db import event_years_collection
from ..errors import handle_not_found_error, send_error_response, send_success_response
from ..external_services import count_points_entries, count_schedules, count_sports
from ..validators import normalize_event_name, trim_object_fields
from ..year_helpers import (
    build_event_id,
    find_active_event_year,
    get_active_event_year_cached,
    get_updatable_date_fields,
    should_event_year_be_active,
    validate_date_relationships,
)


logger = logging.getLogger("event-configuration.event-years")
router = APIRouter()


def _ordinal(day: int) -> str:
    if day % 10 == 1 and day % 100 != 11:
        return f"{day}st"
    if day % 10 == 2 and day % 100 != 12:
        return f"{day}nd"
    if day % 10 == 3 and day % 100 != 13:
        return f"{day}rd"
    return f"{day}th"


def _format_date(date_value: datetime) -> str:
    day = date_value.day
    month = date_value.strftime("%b")
    year = date_value.year
    return f"{_ordinal(day)} {month} {year}"


def _parse_date(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _serialize_datetime(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        iso = value.isoformat()
        return iso.replace("+00:00", "Z")
    return str(value)


def _serialize_event_year(event_year: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "_id": str(event_year.get("_id")) if event_year.get("_id") else None,
        "event_id": event_year.get("event_id"),
        "event_year": event_year.get("event_year"),
        "event_name": event_year.get("event_name"),
        "event_dates": {
            "start": _serialize_datetime(
                (event_year.get("event_dates") or {}).get("start")
            ),
            "end": _serialize_datetime((event_year.get("event_dates") or {}).get("end")),
        },
        "registration_dates": {
            "start": _serialize_datetime(
                (event_year.get("registration_dates") or {}).get("start")
            ),
            "end": _serialize_datetime(
                (event_year.get("registration_dates") or {}).get("end")
            ),
        },
        "event_organizer": event_year.get("event_organizer"),
        "event_title": event_year.get("event_title"),
        "event_highlight": event_year.get("event_highlight"),
        "createdBy": event_year.get("createdBy"),
        "updatedBy": event_year.get("updatedBy"),
        "createdAt": _serialize_datetime(event_year.get("createdAt")),
        "updatedAt": _serialize_datetime(event_year.get("updatedAt")),
    }


def _prepare_dates(data: Dict[str, Any]) -> Dict[str, Any]:
    if not data:
        return {}
    return {
        "start": _parse_date(data.get("start")),
        "end": _parse_date(data.get("end")),
    }


@router.get("/event-years")
async def get_event_years(_: None = Depends(auth_dependency)):
    event_years = await event_years_collection().find({}).sort("event_year", -1).to_list(
        length=None
    )
    enriched = []
    for event_year in event_years:
        serialized = _serialize_event_year(event_year)
        serialized["is_active"] = should_event_year_be_active(event_year)
        enriched.append(serialized)
    return send_success_response({"eventYears": enriched})


@router.get("/event-years/active")
async def get_active_event_year():
    cached = cache.get("/event-configurations/event-years/active")
    if cached and should_event_year_be_active(cached):
        return JSONResponse(content={"success": True, "eventYear": _serialize_event_year(cached)})
    if cached:
        cache.clear("/event-configurations/event-years/active")

    active_year = await find_active_event_year()
    if not active_year:
        return JSONResponse(
            content={
                "success": True,
                "eventYear": None,
                "error": "No active event year found",
            }
        )

    cache.set("/event-configurations/event-years/active", active_year)
    return JSONResponse(content={"success": True, "eventYear": _serialize_event_year(active_year)})


@router.post("/event-years")
async def create_event_year(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)

    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    event_year = body.get("event_year")
    event_name = body.get("event_name")
    event_dates = body.get("event_dates")
    registration_dates = body.get("registration_dates")
    event_organizer = body.get("event_organizer")
    event_title = body.get("event_title")
    event_highlight = body.get("event_highlight")

    if not event_year or not event_name or not event_dates or not registration_dates:
        return send_error_response(
            400,
            "All required fields are required (event_year, event_name, event_dates, registration_dates)",
        )

    date_validation = validate_date_relationships(registration_dates, event_dates)
    if not date_validation["isValid"]:
        return send_error_response(400, date_validation["error"])

    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    reg_start = _parse_date(registration_dates.get("start"))
    if not reg_start:
        return send_error_response(400, "Registration dates are invalid")
    reg_start = reg_start.replace(hour=0, minute=0, second=0, microsecond=0)
    if reg_start < now:
        return send_error_response(
            400,
            "Registration start date cannot be in the past. Event creation is only allowed for current or future dates.",
        )

    event_start = _parse_date(event_dates.get("start"))
    if not event_start:
        return send_error_response(400, "Event dates are invalid")
    event_start = event_start.replace(hour=0, minute=0, second=0, microsecond=0)
    if event_start < now:
        return send_error_response(
            400,
            "Event start date cannot be in the past. Event creation is only allowed for current or future dates.",
        )

    try:
        event_year_num = int(event_year)
    except Exception:
        return send_error_response(400, "event_year must be a valid number")

    normalized_name = normalize_event_name(event_name)

    existing = await event_years_collection().find_one(
        {"event_year": event_year_num, "event_name": normalized_name}
    )
    if existing:
        return send_error_response(409, "Event year and event name combination already exists")

    event_doc = {
        "event_id": build_event_id(event_year_num, normalized_name),
        "event_year": event_year_num,
        "event_name": normalized_name,
        "event_dates": _prepare_dates(event_dates),
        "registration_dates": _prepare_dates(registration_dates),
        "event_organizer": event_organizer.strip()
        if isinstance(event_organizer, str) and event_organizer.strip()
        else "Events Community",
        "event_title": event_title.strip()
        if isinstance(event_title, str) and event_title.strip()
        else "Community Entertainment",
        "event_highlight": event_highlight.strip()
        if isinstance(event_highlight, str) and event_highlight.strip()
        else "Community Entertainment Fest",
        "createdBy": request.state.user.get("reg_number"),
        "updatedBy": None,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }

    insert_result = await event_years_collection().insert_one(event_doc)
    event_doc["_id"] = insert_result.inserted_id

    cache.clear("/event-configurations/event-years/active")

    response_event_year = {
        "_id": str(event_doc.get("_id")),
        "event_id": event_doc.get("event_id"),
        "event_year": event_doc.get("event_year"),
        "event_name": event_doc.get("event_name"),
        "event_dates": {
            "start": _serialize_datetime(event_doc["event_dates"].get("start")),
            "end": _serialize_datetime(event_doc["event_dates"].get("end")),
        },
        "registration_dates": {
            "start": _serialize_datetime(event_doc["registration_dates"].get("start")),
            "end": _serialize_datetime(event_doc["registration_dates"].get("end")),
        },
        "event_organizer": event_doc.get("event_organizer"),
        "event_title": event_doc.get("event_title"),
        "event_highlight": event_doc.get("event_highlight"),
    }

    return send_success_response(
        response_event_year, "Event year created successfully", status_code=201
    )


@router.put("/event-years/{event_id}")
async def update_event_year(
    event_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)

    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    normalized_event_id = str(event_id or "").strip().lower()
    if not normalized_event_id:
        return send_error_response(
            400, "event_id parameter is required to update an event year"
        )

    event_year_doc = await event_years_collection().find_one({"event_id": normalized_event_id})
    if not event_year_doc:
        return handle_not_found_error("Event year")

    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    reg_end = _parse_date((event_year_doc.get("registration_dates") or {}).get("end"))
    if reg_end:
        reg_end = reg_end.replace(hour=23, minute=59, second=59, microsecond=999000)
        if now > reg_end:
            return send_error_response(
                400,
                "Cannot update event year. Updates are only allowed until registration end date "
                f"({_format_date(reg_end)}).",
            )

    event_end = _parse_date((event_year_doc.get("event_dates") or {}).get("end"))
    event_has_ended = False
    if event_end:
        event_end = event_end.replace(hour=23, minute=59, second=59, microsecond=999000)
        event_has_ended = now > event_end

    event_name = body.get("event_name")
    event_organizer_provided = "event_organizer" in body
    event_title_provided = "event_title" in body
    event_highlight_provided = "event_highlight" in body
    event_organizer = body.get("event_organizer") if event_organizer_provided else None
    event_title = body.get("event_title") if event_title_provided else None
    event_highlight = body.get("event_highlight") if event_highlight_provided else None

    if event_has_ended and (
        event_name or event_organizer_provided or event_title_provided or event_highlight_provided
    ):
        return send_error_response(
            400, "Cannot update event configuration. The event has already ended."
        )

    if event_name:
        next_event_name = normalize_event_name(event_name)
        if next_event_name and next_event_name != event_year_doc.get("event_name"):
            existing = await event_years_collection().find_one(
                {
                    "event_year": event_year_doc.get("event_year"),
                    "event_name": next_event_name,
                    "_id": {"$ne": event_year_doc.get("_id")},
                }
            )
            if existing:
                return send_error_response(
                    409, "Event year and event name combination already exists"
                )
            event_year_doc["event_name"] = next_event_name

    if event_organizer_provided:
        event_year_doc["event_organizer"] = (
            event_organizer.strip()
            if isinstance(event_organizer, str) and event_organizer.strip()
            else "Events Community"
        )
    if event_title_provided:
        event_year_doc["event_title"] = (
            event_title.strip()
            if isinstance(event_title, str) and event_title.strip()
            else "Community Entertainment"
        )
    if event_highlight_provided:
        event_year_doc["event_highlight"] = (
            event_highlight.strip()
            if isinstance(event_highlight, str) and event_highlight.strip()
            else "Community Entertainment Fest"
        )

    registration_dates = body.get("registration_dates")
    event_dates = body.get("event_dates")

    updatable = get_updatable_date_fields(event_year_doc)
    final_registration_dates = (
        {**event_year_doc.get("registration_dates", {})}
        if event_year_doc.get("registration_dates")
        else {}
    )
    if registration_dates:
        final_registration_dates.update(registration_dates)

    final_event_dates = (
        {**event_year_doc.get("event_dates", {})} if event_year_doc.get("event_dates") else {}
    )
    if event_dates:
        final_event_dates.update(event_dates)

    if registration_dates:
        if "start" in registration_dates and not updatable["canUpdateRegStart"]:
            return send_error_response(
                400, "Cannot update registration start date. Registration has already started."
            )
        if "end" in registration_dates and not updatable["canUpdateRegEnd"]:
            return send_error_response(
                400, "Cannot update registration end date. Registration has already ended."
            )

    if event_dates:
        if "start" in event_dates and not updatable["canUpdateEventStart"]:
            return send_error_response(
                400, "Cannot update event start date. Event has already started."
            )
        if "end" in event_dates and not updatable["canUpdateEventEnd"]:
            return send_error_response(
                400, "Cannot update event end date. Event has already ended."
            )

    if registration_dates or event_dates:
        date_validation = validate_date_relationships(final_registration_dates, final_event_dates)
        if not date_validation["isValid"]:
            return send_error_response(400, date_validation["error"])

        if registration_dates:
            event_year_doc["registration_dates"] = _prepare_dates(final_registration_dates)
        if event_dates:
            event_year_doc["event_dates"] = _prepare_dates(final_event_dates)

    event_year_doc["updatedBy"] = request.state.user.get("reg_number")
    event_year_doc["updatedAt"] = datetime.now(timezone.utc)

    update_doc = {key: value for key, value in event_year_doc.items() if key != "_id"}
    await event_years_collection().update_one(
        {"_id": event_year_doc.get("_id")}, {"$set": update_doc}
    )
    updated = await event_years_collection().find_one({"_id": event_year_doc.get("_id")})

    cache.clear("/event-configurations/event-years/active")

    return send_success_response(
        _serialize_event_year(updated), "Event year updated successfully"
    )


@router.delete("/event-years/{event_id}")
async def delete_event_year(
    event_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    normalized_event_id = str(event_id or "").strip().lower()
    if not normalized_event_id:
        return send_error_response(
            400, "event_id parameter is required to delete an event year"
        )

    year_doc = await event_years_collection().find_one({"event_id": normalized_event_id})
    if not year_doc:
        return handle_not_found_error("Event year")

    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    reg_start = _parse_date((year_doc.get("registration_dates") or {}).get("start"))
    if reg_start:
        reg_start = reg_start.replace(hour=0, minute=0, second=0, microsecond=0)
        if now >= reg_start:
            return send_error_response(
                400,
                "Cannot delete event year. Deletion is only allowed before registration start date "
                f"({_format_date(reg_start)}).",
            )

    if should_event_year_be_active(year_doc):
        return send_error_response(
            400,
            "Cannot delete the active event year. The event is currently active based on its registration and event dates.",
        )

    sports_count = 0
    schedules_count = 0
    points_count = 0

    try:
        sports_count = await count_sports(year_doc.get("event_id"), token=request.state.token)
    except RuntimeError:
        pass

    try:
        schedules_count = await count_schedules(
            year_doc.get("event_id"), token=request.state.token
        )
    except RuntimeError:
        pass

    try:
        points_count = await count_points_entries(
            year_doc.get("event_id"), token=request.state.token
        )
    except RuntimeError:
        pass

    if sports_count > 0 or schedules_count > 0 or points_count > 0:
        return send_error_response(
            400,
            "Cannot delete event year. Data exists: "
            f"{sports_count} sports, {schedules_count} schedules, {points_count} points entries.",
        )

    await event_years_collection().delete_one({"_id": year_doc.get("_id")})

    cache.clear("/event-configurations/event-years/active")

    return send_success_response({}, "Event year deleted successfully")
