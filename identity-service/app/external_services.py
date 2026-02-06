import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from .cache import cache
from .config import get_settings


logger = logging.getLogger("identity-service.external")
settings = get_settings()


def _auth_headers(token: str) -> Dict[str, str]:
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


async def _get_json(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    token: str = "",
    timeout: float = 30.0,
) -> Any:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, params=params, headers=_auth_headers(token))
        response.raise_for_status()
        return response.json()


async def _post_json(
    url: str,
    payload: Dict[str, Any],
    token: str = "",
    timeout: float = 30.0,
) -> Any:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload, headers=_auth_headers(token))
        response.raise_for_status()
        return response.json()


def _parse_date(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def should_event_year_be_active(event_year_doc: Dict[str, Any]) -> bool:
    if not event_year_doc:
        return False
    reg_start = _parse_date(event_year_doc.get("registration_dates", {}).get("start"))
    event_end = _parse_date(event_year_doc.get("event_dates", {}).get("end"))
    if not reg_start or not event_end:
        return False
    now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    reg_start = reg_start.replace(hour=0, minute=0, second=0, microsecond=0)
    event_end = event_end.replace(hour=23, minute=59, second=59, microsecond=999000)
    return reg_start <= now <= event_end


async def get_active_event_year() -> Optional[Dict[str, Any]]:
    cached = cache.get("/event-configurations/event-years/active")
    if cached and should_event_year_be_active(cached):
        return cached
    if cached:
        cache.clear("/event-configurations/event-years/active")
    if not settings.event_configuration_url:
        return None
    data = await _get_json(
        f"{settings.event_configuration_url}/event-configurations/event-years/active"
    )
    event_year = data.get("eventYear")
    if event_year:
        cache.set("/event-configurations/event-years/active", event_year)
    return event_year


async def fetch_event_years(token: str = "") -> List[Dict[str, Any]]:
    if not settings.event_configuration_url:
        raise RuntimeError("EVENT_CONFIGURATION_URL is not configured")
    data = await _get_json(
        f"{settings.event_configuration_url}/event-configurations/event-years",
        token=token,
    )
    return data.get("eventYears", [])


async def get_event_year(
    event_id: Optional[str] = None,
    require_id: bool = False,
    return_doc: bool = False,
    token: str = "",
) -> Any:
    active_event = await get_active_event_year()

    if event_id is not None and event_id != "":
        normalized = str(event_id).strip().lower()
        if not normalized:
            raise ValueError("Event ID must be a valid string")
        if not token:
            if not active_event:
                raise ValueError("No active event year found")
            if active_event.get("event_id") == normalized:
                return (
                    {"event_id": active_event.get("event_id"), "doc": active_event}
                    if return_doc
                    else active_event.get("event_id")
                )
            raise ValueError("Event year not found")
        event_years = await fetch_event_years(token=token)
        for doc in event_years:
            if doc.get("event_id") == normalized:
                return {"event_id": doc.get("event_id"), "doc": doc} if return_doc else doc.get("event_id")
        raise ValueError("Event year not found")

    if require_id:
        raise ValueError("Event ID is required")

    if not active_event:
        raise ValueError("No active event year found")

    return {"event_id": active_event.get("event_id"), "doc": active_event} if return_doc else active_event.get("event_id")


async def validate_department_exists(department_name: str) -> Dict[str, Any]:
    if not settings.department_url:
        return {"exists": False, "department": None}
    cached = cache.get("/departments")
    departments = None
    if cached:
        departments = cached.get("departments")
    if departments is None:
        data = await _get_json(f"{settings.department_url}/departments")
        cache.set("/departments", data)
        departments = data.get("departments", [])
    for dept in departments:
        if dept.get("name") == department_name:
            return {"exists": True, "department": dept}
    return {"exists": False, "department": None}


async def get_sports(event_id: str, token: str = "") -> List[Dict[str, Any]]:
    if not settings.sports_participation_url:
        raise RuntimeError("SPORTS_PARTICIPATION_URL is not configured")
    data = await _get_json(
        f"{settings.sports_participation_url}/sports-participations/sports",
        params={"event_id": event_id},
        token=token,
    )
    return data if isinstance(data, list) else []


async def get_batches(event_id: str, token: str = "") -> List[Dict[str, Any]]:
    if not settings.enrollment_url:
        raise RuntimeError("ENROLLMENT_URL is not configured")
    data = await _get_json(
        f"{settings.enrollment_url}/enrollments/batches",
        params={"event_id": event_id},
        token=token,
    )
    return data.get("batches", [])


async def assign_player_to_batch(
    batch_name: str,
    reg_number: str,
    event_id: str,
    token: str = "",
) -> Any:
    if not settings.enrollment_url:
        raise RuntimeError("ENROLLMENT_URL is not configured")
    payload = {"name": batch_name, "reg_number": reg_number, "event_id": event_id}
    return await _post_json(
        f"{settings.enrollment_url}/enrollments/batches/assign-player",
        payload,
        token=token,
    )


async def unassign_player_from_batch(
    batch_name: str,
    reg_number: str,
    event_id: str,
    token: str = "",
) -> Any:
    if not settings.enrollment_url:
        raise RuntimeError("ENROLLMENT_URL is not configured")
    payload = {"name": batch_name, "reg_number": reg_number, "event_id": event_id}
    return await _post_json(
        f"{settings.enrollment_url}/enrollments/batches/unassign-player",
        payload,
        token=token,
    )


async def unassign_players_from_batches(
    reg_numbers: List[str],
    event_id: str,
    token: str = "",
) -> Any:
    if not settings.enrollment_url:
        raise RuntimeError("ENROLLMENT_URL is not configured")
    payload = {"reg_numbers": reg_numbers, "event_id": event_id}
    return await _post_json(
        f"{settings.enrollment_url}/enrollments/batches/unassign-players",
        payload,
        token=token,
    )


async def get_matches_for_sport(
    sport_name: str,
    event_id: str,
    token: str = "",
) -> List[Dict[str, Any]]:
    if not settings.scheduling_url:
        raise RuntimeError("SCHEDULING_URL is not configured")
    data = await _get_json(
        f"{settings.scheduling_url}/schedulings/event-schedule/{sport_name}",
        params={"event_id": event_id},
        token=token,
    )
    return data.get("matches", [])


async def remove_participation(
    reg_number: str,
    sport_name: str,
    event_id: str,
    token: str = "",
) -> None:
    if not settings.sports_participation_url:
        raise RuntimeError("SPORTS_PARTICIPATION_URL is not configured")
    await _post_json(
        f"{settings.sports_participation_url}/sports-participations/remove-participation",
        {"reg_number": reg_number, "sport": sport_name, "event_id": event_id},
        token=token,
    )


