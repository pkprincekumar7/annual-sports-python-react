import logging
from typing import Any, Dict, List
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request

from ..auth import auth_dependency, get_request_token
from ..cache import cache
from ..config import get_settings
from ..date_restrictions import require_registration_period
from ..db import sports_collection
from ..errors import handle_not_found_error, send_error_response, send_success_response
from ..external_services import (
    fetch_player,
    fetch_players_by_reg_numbers,
    get_event_year,
)
from ..player_helpers import compute_players_participation_batch, serialize_player
from ..sport_helpers import find_sport_by_name_and_id
from ..validators import trim_object_fields, validate_captain_assignment


logger = logging.getLogger("sports-participation.captains")
router = APIRouter()
settings = get_settings()


def _serialize_sport(sport: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(sport)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return data


@router.post("/add-captain")
async def add_captain(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_registration_period),
):
    trimmed = trim_object_fields(await request.json())
    is_valid, errors = validate_captain_assignment(trimmed)
    if not is_valid:
        return send_error_response(400, "; ".join(errors))

    reg_number = trimmed.get("reg_number")
    sport = trimmed.get("sport")
    event_id = trimmed.get("event_id")
    token = get_request_token(request)

    event_year_data = await get_event_year(
        str(event_id).trim(), require_id=True, return_doc=True, token=token
    )
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    player = await fetch_player(reg_number, event_id=resolved_event_id, token=request.state.token)
    if not player:
        return handle_not_found_error("Player")

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id, lean=False)

    is_admin = request.state.user.get("reg_number") == settings.admin_reg_number
    if not is_admin:
        coordinators = sport_doc.get("eligible_coordinators") or []
        if request.state.user.get("reg_number") not in coordinators:
            return send_error_response(403, "Admin or coordinator access required for this sport")

    if reg_number in (sport_doc.get("eligible_coordinators") or []):
        return send_error_response(
            400,
            f"Player is already a coordinator for {sport} and cannot be assigned as captain.",
        )

    if sport_doc.get("type") not in {"dual_team", "multi_team"}:
        return send_error_response(
            400,
            "Captain assignment is only applicable for team sports (dual_team or multi_team)",
        )

    if reg_number in (sport_doc.get("eligible_captains") or []):
        return send_error_response(400, f"Player is already an eligible captain for {sport}")

    existing_team = next(
        (team for team in sport_doc.get("teams_participated") or [] if team.get("captain") == reg_number),
        None,
    )
    if existing_team:
        return send_error_response(
            400,
            f"Player has already created a team ({existing_team.get('team_name')}) for {sport}. Cannot add as eligible captain.",
        )

    eligible_captains = sport_doc.get("eligible_captains") or []
    eligible_captains.append(reg_number)
    sport_doc["eligible_captains"] = eligible_captains
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")

    return send_success_response(
        {"sport": _serialize_sport(sport_doc)},
        f"Captain added successfully for {sport}",
    )


@router.delete("/remove-captain")
async def remove_captain(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_registration_period),
):
    trimmed = trim_object_fields(await request.json())
    is_valid, errors = validate_captain_assignment(trimmed)
    if not is_valid:
        return send_error_response(400, "; ".join(errors))

    reg_number = trimmed.get("reg_number")
    sport = trimmed.get("sport")
    event_id = trimmed.get("event_id")
    token = get_request_token(request)

    event_year_data = await get_event_year(
        str(event_id).trim(), require_id=True, return_doc=True, token=token
    )
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id, lean=False)

    is_admin = request.state.user.get("reg_number") == settings.admin_reg_number
    if not is_admin:
        coordinators = sport_doc.get("eligible_coordinators") or []
        if request.state.user.get("reg_number") not in coordinators:
            return send_error_response(403, "Admin or coordinator access required for this sport")

    if reg_number not in (sport_doc.get("eligible_captains") or []):
        return send_error_response(400, f"Player is not an eligible captain for {sport}")

    existing_team = next(
        (team for team in sport_doc.get("teams_participated") or [] if team.get("captain") == reg_number),
        None,
    )
    if existing_team:
        return send_error_response(
            400,
            f"Cannot remove captain role. Player has already created a team ({existing_team.get('team_name')}) for {sport}. Please delete the team first.",
        )

    sport_doc["eligible_captains"] = [
        captain for captain in (sport_doc.get("eligible_captains") or []) if captain != reg_number
    ]
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")

    return send_success_response(
        {"sport": _serialize_sport(sport_doc)},
        f"Captain role removed successfully for {sport}",
    )


@router.get("/captains-by-sport")
async def captains_by_sport(
    request: Request,
    _: None = Depends(auth_dependency),
):
    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return send_success_response({"captainsBySport": {}})
        raise

    event_id = event_year_data.get("doc", {}).get("event_id")
    is_admin = request.state.user.get("reg_number") == settings.admin_reg_number

    sports_query: Dict[str, Any] = {
        "event_id": event_id,
        "eligible_captains": {"$exists": True, "$ne": []},
    }
    if not is_admin:
        sports_query["eligible_coordinators"] = request.state.user.get("reg_number")

    sports = await sports_collection().find(sports_query).to_list(length=None)
    captains_by_sport: Dict[str, List[Dict[str, Any]]] = {}

    captain_reg_numbers: List[str] = []
    for sport in sports:
        for reg in sport.get("eligible_captains") or []:
            if reg not in captain_reg_numbers:
                captain_reg_numbers.append(reg)

    if captain_reg_numbers:
        captains = await fetch_players_by_reg_numbers(
            captain_reg_numbers,
            event_id=event_id,
            token=request.state.token,
        )
        participation_map = await compute_players_participation_batch(
            captain_reg_numbers, event_id
        )

        captains_map = {}
        for captain in captains:
            captain_obj = serialize_player(captain)
            participation = participation_map.get(
                captain_obj.get("reg_number"),
                {"participated_in": [], "captain_in": [], "coordinator_in": []},
            )
            captain_obj.update(participation)
            captains_map[captain_obj.get("reg_number")] = captain_obj

        for sport in sports:
            eligible = sport.get("eligible_captains") or []
            for reg in eligible:
                captain = captains_map.get(reg)
                if captain:
                    captains_by_sport.setdefault(sport.get("name"), []).append(captain)

    return send_success_response({"captainsBySport": captains_by_sport})
