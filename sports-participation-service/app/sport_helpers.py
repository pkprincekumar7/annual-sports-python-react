from typing import Any, Dict, Optional

from .db import sports_collection


def is_team_sport_type(sport_type: str) -> bool:
    return sport_type in {"dual_team", "multi_team"}


def is_individual_sport_type(sport_type: str) -> bool:
    return sport_type in {"dual_player", "multi_player"}


def validate_team_size(team_size: Any, sport_type: str) -> Dict[str, Any]:
    if is_team_sport_type(sport_type):
        if team_size is None or team_size == "":
            return {
                "isValid": False,
                "value": None,
                "error": "team_size is required for team sports (dual_team and multi_team)",
            }
        team_value = team_size
        if isinstance(team_size, str) and team_size.strip() != "":
            try:
                team_value = int(team_size)
            except ValueError:
                return {"isValid": False, "value": None, "error": "team_size must be a valid number"}
        if not isinstance(team_value, int) or team_value <= 0:
            return {"isValid": False, "value": None, "error": "team_size must be a positive integer"}
        return {"isValid": True, "value": team_value, "error": None}
    if team_size is not None and team_size != "":
        return {
            "isValid": False,
            "value": None,
            "error": "team_size is only applicable for dual_team and multi_team types",
        }
    return {"isValid": True, "value": None, "error": None}


def normalize_sport_name(name: Optional[str]) -> str:
    return str(name or "").strip().lower()


async def find_sport_by_name_and_id(
    sport_name: str,
    event_id: str,
    lean: bool = True,
    select: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    if not sport_name or not event_id:
        raise ValueError("Sport name and event ID are required")

    normalized_name = normalize_sport_name(sport_name)
    normalized_event_id = str(event_id).strip().lower()
    if not normalized_event_id:
        raise ValueError("Event ID must be a valid string")

    query_filter = {"name": normalized_name, "event_id": normalized_event_id}
    projection = select if select else None

    sport_doc = await sports_collection().find_one(query_filter, projection)
    if not sport_doc:
        raise ValueError(f'Sport "{sport_name}" not found for event ID {normalized_event_id}')

    return sport_doc
