import logging
from typing import Any, Dict, List
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request

from ..auth import admin_dependency, auth_dependency, get_request_token
from ..cache import cache
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


logger = logging.getLogger("sports-participation.coordinators")
router = APIRouter()


def _serialize_sport(sport: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(sport)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return data


@router.post("/add-coordinator")
async def add_coordinator(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
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

    is_eligible_captain = reg_number in (sport_doc.get("eligible_captains") or [])
    is_team_captain = any(
        team.get("captain") == reg_number for team in sport_doc.get("teams_participated") or []
    )
    is_team_player = any(
        reg_number in (team.get("players") or []) for team in sport_doc.get("teams_participated") or []
    )
    is_individual = reg_number in (sport_doc.get("players_participated") or [])
    if is_eligible_captain or is_team_captain or is_team_player or is_individual:
        return send_error_response(
            400,
            f"Player cannot be assigned as coordinator for {sport} because they already participate in that sport.",
        )

    if reg_number in (sport_doc.get("eligible_coordinators") or []):
        return send_error_response(400, f"Player is already a coordinator for {sport}")

    eligible_coordinators = sport_doc.get("eligible_coordinators") or []
    eligible_coordinators.append(reg_number)
    sport_doc["eligible_coordinators"] = eligible_coordinators
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")

    return send_success_response(
        {"sport": _serialize_sport(sport_doc)},
        f"Coordinator added successfully for {sport}",
    )


@router.delete("/remove-coordinator")
async def remove_coordinator(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
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

    if reg_number not in (sport_doc.get("eligible_coordinators") or []):
        return send_error_response(400, f"Player is not a coordinator for {sport}")

    sport_doc["eligible_coordinators"] = [
        coord for coord in (sport_doc.get("eligible_coordinators") or []) if coord != reg_number
    ]
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")

    return send_success_response(
        {"sport": _serialize_sport(sport_doc)},
        f"Coordinator role removed successfully for {sport}",
    )


@router.get("/coordinators-by-sport")
async def coordinators_by_sport(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return send_success_response({"coordinatorsBySport": {}})
        raise

    event_id = event_year_data.get("doc", {}).get("event_id")

    sports = await sports_collection().find(
        {"event_id": event_id, "eligible_coordinators": {"$exists": True, "$ne": []}}
    ).to_list(length=None)
    coordinators_by_sport: Dict[str, List[Dict[str, Any]]] = {}

    coordinator_reg_numbers: List[str] = []
    for sport in sports:
        for reg in sport.get("eligible_coordinators") or []:
            if reg not in coordinator_reg_numbers:
                coordinator_reg_numbers.append(reg)

    if coordinator_reg_numbers:
        coordinators = await fetch_players_by_reg_numbers(
            coordinator_reg_numbers,
            event_id=event_id,
            token=request.state.token,
        )
        participation_map = await compute_players_participation_batch(
            coordinator_reg_numbers, event_id
        )

        coordinators_map = {}
        for coordinator in coordinators:
            coordinator_obj = serialize_player(coordinator)
            participation = participation_map.get(
                coordinator_obj.get("reg_number"),
                {"participated_in": [], "captain_in": [], "coordinator_in": []},
            )
            coordinator_obj.update(participation)
            coordinators_map[coordinator_obj.get("reg_number")] = coordinator_obj

        for sport in sports:
            eligible = sport.get("eligible_coordinators") or []
            for reg in eligible:
                coordinator = coordinators_map.get(reg)
                if coordinator:
                    coordinators_by_sport.setdefault(sport.get("name"), []).append(coordinator)

    return send_success_response({"coordinatorsBySport": coordinators_by_sport})
