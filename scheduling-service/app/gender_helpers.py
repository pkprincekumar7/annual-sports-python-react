from typing import Any, Dict, List, Optional

from .external_services import fetch_player, fetch_players_by_reg_numbers


_gender_cache: Dict[str, Dict[str, Any]] = {}


def _cache_key(prefix: str, *parts: str) -> str:
    return f"{prefix}:{':'.join(parts)}"


def _get_cached(key: str) -> Optional[str]:
    entry = _gender_cache.get(key)
    if not entry:
        return None
    return entry.get("value")


def _set_cached(key: str, value: str) -> None:
    _gender_cache[key] = {"value": value}


async def get_team_gender(
    team_name: str,
    sport_doc: Dict[str, Any],
    event_id: str,
    token: str = "",
) -> Optional[str]:
    if not sport_doc or not team_name or not event_id:
        return None
    normalized_event_id = str(event_id).strip().lower()
    key = _cache_key("team", sport_doc.get("name", ""), normalized_event_id, team_name.strip())
    cached = _get_cached(key)
    if cached:
        return cached

    team = next(
        (
            entry
            for entry in (sport_doc.get("teams_participated") or [])
            if entry.get("team_name") and entry.get("team_name").strip() == team_name.strip()
        ),
        None,
    )
    if not team or not team.get("players"):
        return None
    first_player = team.get("players")[0]
    player = await fetch_player(first_player, event_id=event_id, token=token)
    gender = player.get("gender") if player else None
    if gender:
        _set_cached(key, gender)
    return gender


async def get_player_gender(
    reg_number: str,
    event_id: Optional[str] = None,
    token: str = "",
) -> Optional[str]:
    if not reg_number:
        return None
    key = _cache_key("player", reg_number.strip())
    cached = _get_cached(key)
    if cached:
        return cached
    player = await fetch_player(reg_number, event_id=event_id, token=token)
    gender = player.get("gender") if player else None
    if gender:
        _set_cached(key, gender)
    return gender


async def get_match_gender(
    match: Dict[str, Any],
    sport_doc: Optional[Dict[str, Any]],
    token: str = "",
) -> Optional[str]:
    if not sport_doc:
        return None
    if sport_doc.get("type") in {"dual_team", "multi_team"}:
        teams = match.get("teams") or []
        if not teams:
            return None
        return await get_team_gender(teams[0].strip(), sport_doc, match.get("event_id"), token=token)
    players = match.get("players") or []
    if not players:
        return None
    return await get_player_gender(players[0].strip(), event_id=match.get("event_id"), token=token)


async def get_points_entry_gender(
    points_entry: Dict[str, Any],
    sport_doc: Optional[Dict[str, Any]],
    token: str = "",
) -> Optional[str]:
    if not sport_doc:
        return None
    participant = points_entry.get("participant")
    if not participant:
        return None
    if points_entry.get("participant_type") == "team":
        return await get_team_gender(participant, sport_doc, points_entry.get("event_id"), token=token)
    return await get_player_gender(participant, event_id=points_entry.get("event_id"), token=token)


async def get_participants_gender(
    participants: List[str],
    participant_type: str,
    sport_doc: Optional[Dict[str, Any]],
    event_id: str,
    token: str = "",
) -> Dict[str, Optional[str]]:
    gender_map: Dict[str, Optional[str]] = {}
    if not participants:
        return gender_map
    if participant_type == "team":
        for team_name in participants:
            gender_map[team_name] = await get_team_gender(team_name, sport_doc or {}, event_id, token=token)
        return gender_map
    players = await fetch_players_by_reg_numbers(participants, event_id=event_id, token=token)
    for player in players:
        reg = player.get("reg_number")
        if reg:
            gender_map[reg] = player.get("gender")
    return gender_map


def clear_team_gender_cache(team_name: str, sport_name: str, event_id: str) -> None:
    normalized_event_id = str(event_id).strip().lower()
    key = _cache_key("team", sport_name.strip().lower(), normalized_event_id, team_name.strip())
    _gender_cache.pop(key, None)


def clear_sport_gender_cache(sport_name: str, event_id: str) -> None:
    normalized_event_id = str(event_id).strip().lower()
    prefix = _cache_key("team", sport_name.strip().lower(), normalized_event_id, "")
    for key in list(_gender_cache.keys()):
        if key.startswith(prefix):
            _gender_cache.pop(key, None)
