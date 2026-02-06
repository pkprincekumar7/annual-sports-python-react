import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

from .config import get_settings


logger = logging.getLogger("event-configuration.external")
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


async def get_identity_profile(token: str) -> Dict[str, Any]:
    if not settings.identity_url:
        raise RuntimeError("IDENTITY_URL is not configured")
    data = await _get_json(f"{settings.identity_url}/identities/me", token=token)
    player = data.get("player")
    if not player:
        raise ValueError("User not found")
    return player


async def fetch_sports(event_id: str, token: str = "") -> List[Dict[str, Any]]:
    if not settings.sports_participation_url:
        raise RuntimeError("SPORTS_PARTICIPATION_URL is not configured")
    data = await _get_json(
        f"{settings.sports_participation_url}/sports-participations/sports",
        params={"event_id": event_id},
        token=token,
    )
    if isinstance(data, list):
        return data
    return data.get("sports", [])


async def count_sports(event_id: str, token: str = "") -> int:
    sports = await fetch_sports(event_id, token=token)
    return len(sports)


async def count_schedules(event_id: str, token: str = "") -> int:
    if not settings.scheduling_url:
        raise RuntimeError("SCHEDULING_URL is not configured")
    sports = await fetch_sports(event_id, token=token)
    total = 0
    for sport in sports:
        sport_name = sport.get("name")
        if not sport_name:
            continue
        data = await _get_json(
            f"{settings.scheduling_url}/schedulings/event-schedule/{quote(str(sport_name))}",
            params={"event_id": event_id},
            token=token,
        )
        matches = data.get("matches", [])
        total += len(matches)
    return total


async def count_points_entries(event_id: str, token: str = "") -> int:
    if not settings.scoring_url:
        raise RuntimeError("SCORING_URL is not configured")
    sports = await fetch_sports(event_id, token=token)
    total = 0
    for sport in sports:
        sport_name = sport.get("name")
        if not sport_name:
            continue
        for gender in ("Male", "Female"):
            data = await _get_json(
                f"{settings.scoring_url}/scorings/points-table/{quote(str(sport_name))}",
                params={"event_id": event_id, "gender": gender},
                token=token,
            )
            entries = data.get("points_table")
            if entries is None:
                entries = data.get("pointsTable", [])
            total += len(entries or [])
    return total
