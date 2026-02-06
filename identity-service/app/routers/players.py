import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..auth import admin_dependency, auth_dependency, get_request_token
from ..cache import cache
from ..config import get_settings
from ..date_restrictions import require_registration_period
from ..db import players_collection
from ..errors import handle_not_found_error, send_error_response, send_success_response
from ..external_services import (
    assign_player_to_batch,
    get_event_year,
    get_matches_for_sport,
    get_batches,
    get_sports,
    remove_participation,
    unassign_players_from_batches,
)
from ..player_utils import (
    compute_player_participation,
    compute_players_participation_batch,
    serialize_player,
)
from ..validators import trim_object_fields, validate_player_data, validate_update_player_data


logger = logging.getLogger("identity-service.players")
router = APIRouter()
settings = get_settings()
DEFAULT_PLAYERS_PAGE_SIZE = 25


async def _get_players_batch_names(
    reg_numbers: List[str],
    event_id: str,
    token: str,
) -> Dict[str, Optional[str]]:
    batch_names: Dict[str, Optional[str]] = {reg: None for reg in reg_numbers}
    try:
        batches = await get_batches(event_id, token=token)
        for batch in batches:
            for reg in batch.get("players") or []:
                if reg in batch_names:
                    batch_names[reg] = batch.get("name")
    except Exception:
        return batch_names
    return batch_names


@router.get("/me")
async def get_me(request: Request, _: None = Depends(auth_dependency)):
    event_id_query = request.query_params.get("event_id")
    event_id = None
    try:
        event_year_data = await get_event_year(
            event_id_query, return_doc=True, token=request.state.token
        )
        event_id = event_year_data.get("doc", {}).get("event_id")
    except Exception as exc:
        if str(exc) in {"No active event year found", "Event year not found"}:
            event_id = None
        else:
            raise

    if event_id:
        cache_key = f"/identities/me?event_id={event_id}"
        cached = cache.get(cache_key)
        if cached and cached.get("reg_number") == request.state.user.get("reg_number"):
            return send_success_response({"player": cached})

    user = await players_collection().find_one(
        {"reg_number": request.state.user.get("reg_number")}, {"password": 0}
    )
    if not user:
        return handle_not_found_error("User")

    token = get_request_token(request)
    if event_id:
        sports = await get_sports(event_id, token=token)
        participation = compute_player_participation(user.get("reg_number"), sports)
        user_with_computed = serialize_player(user)
        user_with_computed.update(participation)
        batch_name = await _get_players_batch_names([user.get("reg_number")], event_id, token)
        user_with_computed["batch_name"] = batch_name.get(user.get("reg_number"))
    else:
        user_with_computed = serialize_player(user)
        user_with_computed.update(
            {"participated_in": [], "captain_in": [], "coordinator_in": [], "batch_name": None}
        )

    if event_id:
        cache_key = f"/identities/me?event_id={event_id}"
        cache.set(cache_key, user_with_computed)

    return send_success_response({"player": user_with_computed})


@router.get("/players")
async def get_players(request: Request, _: None = Depends(auth_dependency)):
    event_id_query = request.query_params.get("event_id")
    search_query = request.query_params.get("search")
    has_page_param = request.query_params.get("page") not in {None, ""}

    page = 1
    if has_page_param:
        try:
            parsed_page = int(request.query_params.get("page", "1"))
            page = parsed_page if parsed_page >= 1 else 1
        except ValueError:
            page = 1

    limit = None
    if has_page_param:
        if request.query_params.get("limit") not in {None, ""}:
            try:
                parsed_limit = int(request.query_params.get("limit", str(DEFAULT_PLAYERS_PAGE_SIZE)))
                limit = min(100, parsed_limit if parsed_limit > 0 else DEFAULT_PLAYERS_PAGE_SIZE)
            except ValueError:
                limit = DEFAULT_PLAYERS_PAGE_SIZE
        else:
            limit = DEFAULT_PLAYERS_PAGE_SIZE

    skip = (page - 1) * limit if has_page_param and limit else 0

    event_id = None
    try:
        event_year_data = await get_event_year(
            event_id_query, return_doc=True, token=request.state.token
        )
        event_id = event_year_data.get("doc", {}).get("event_id")
    except Exception as exc:
        if str(exc) == "No active event year found" and not event_id_query:
            event_id = None
        elif str(exc) == "Event year not found":
            return send_error_response(400, str(exc))
        else:
            raise

    query: Dict[str, Any] = {"reg_number": {"$ne": settings.admin_reg_number}}
    if search_query:
        escaped = re.escape(str(search_query))
        regex = {"$regex": escaped, "$options": "i"}
        query["$or"] = [{"reg_number": regex}, {"full_name": regex}]

    if not search_query and not has_page_param and event_id:
        cache_key = f"/identities/players?event_id={event_id}"
        cached = cache.get(cache_key)
        if cached:
            return send_success_response(cached)

    total_count = await players_collection().count_documents(query)
    cursor = players_collection().find(query, {"password": 0})
    if has_page_param and limit:
        cursor = cursor.skip(skip).limit(limit)
    players = await cursor.to_list(length=None)

    token = get_request_token(request)
    sports = await get_sports(event_id, token=token) if event_id else []
    reg_numbers = [player.get("reg_number") for player in players]
    participation_map = (
        compute_players_participation_batch(reg_numbers, sports) if event_id else {}
    )
    batch_names = (
        await _get_players_batch_names(reg_numbers, event_id, token)
        if event_id
        else {}
    )

    players_with_computed = []
    for player in players:
        data = serialize_player(player)
        participation = participation_map.get(
            player.get("reg_number"),
            {"participated_in": [], "captain_in": [], "coordinator_in": []},
        )
        data.update(participation)
        data["batch_name"] = batch_names.get(player.get("reg_number")) if event_id else None
        players_with_computed.append(data)

    result: Dict[str, Any] = {"players": players_with_computed}
    if has_page_param and limit:
        total_pages = (total_count + limit - 1) // limit
        result["pagination"] = {
            "currentPage": page,
            "totalPages": total_pages,
            "totalCount": total_count,
            "limit": limit,
            "hasNextPage": page < total_pages,
            "hasPreviousPage": page > 1,
        }
    else:
        result["totalCount"] = total_count

    if not search_query and not has_page_param and event_id:
        cache_key = f"/identities/players?event_id={event_id}"
        cache.set(cache_key, result)

    return send_success_response(result)


@router.post("/save-player")
async def save_player(
    request: Request,
    _: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    token = get_request_token(request)
    batch_name = body.pop("batch_name", None)
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)

    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    is_valid, errors = await validate_player_data(body)
    if not is_valid:
        return send_error_response(400, "; ".join(errors))

    reg_number = body.get("reg_number")
    if await players_collection().find_one({"reg_number": reg_number}):
        return send_error_response(
            409,
            "Registration number already exists. Please use a different registration number.",
            {"code": "DUPLICATE_REG_NUMBER"},
        )

    try:
        event_year = await get_event_year(None, return_doc=True, token=token)
        event_doc = event_year.get("doc")
    except Exception:
        event_doc = None
    if not event_doc:
        return send_error_response(
            400, "No active event year found. Please configure an active event year first."
        )
    event_id = event_doc.get("event_id")
    if not event_id or not str(event_id).strip():
        return send_error_response(
            400,
            "Active event is missing event_id. Please configure the event ID for the active event.",
        )

    if not batch_name or not str(batch_name).strip():
        return send_error_response(400, "Batch name is required")

    batches = await get_batches(event_id, token=token)
    if not any(batch.get("name") == batch_name for batch in batches):
        return send_error_response(
            400, f'Batch "{batch_name}" does not exist. Please create the batch first.'
        )

    await players_collection().insert_one(
        {**body, "createdBy": None, "updatedBy": None, "change_password_required": False}
    )

    try:
        await assign_player_to_batch(batch_name, reg_number, event_id, token=token)
    except Exception:
        await players_collection().delete_one({"reg_number": reg_number})
        return send_error_response(500, "Failed to assign player to batch. Please try again.")

    saved_player = await players_collection().find_one({"reg_number": reg_number})
    player_data = serialize_player(saved_player)

    cache.clear_pattern("/identities/players")
    cache.clear(f"/enrollments/batches?event_id={event_id}")

    return send_success_response(
        {"player": player_data}, "Player data saved successfully"
    )


@router.put("/update-player")
async def update_player(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)
    batch_name = body.pop("batch_name", None)

    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )
    if batch_name is not None:
        return send_error_response(
            400,
            "Batch cannot be modified through player update. Batch assignment is handled separately via batch management endpoints.",
        )

    is_valid, errors = await validate_update_player_data(body)
    if not is_valid:
        return send_error_response(400, "; ".join(errors))

    reg_number = body.get("reg_number")
    player = await players_collection().find_one({"reg_number": reg_number})
    if not player:
        return handle_not_found_error("Player")

    if player.get("gender") != body.get("gender"):
        return send_error_response(
            400, "Gender cannot be modified. Please keep the original gender value."
        )

    update_fields = {
        "full_name": body.get("full_name"),
        "department_branch": body.get("department_branch"),
        "mobile_number": body.get("mobile_number"),
        "email_id": body.get("email_id"),
        "updatedBy": request.state.user.get("reg_number"),
    }

    await players_collection().update_one({"reg_number": reg_number}, {"$set": update_fields})
    updated_player = await players_collection().find_one({"reg_number": reg_number})
    player_data = serialize_player(updated_player)

    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")

    return send_success_response({"player": player_data}, "Player data updated successfully")


@router.post("/bulk-player-enrollments")
async def bulk_player_enrollments(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    body = await request.json()
    token = get_request_token(request)
    reg_numbers = body.get("reg_numbers")
    event_id_query = request.query_params.get("event_id") or body.get("event_id")

    if not isinstance(reg_numbers, list) or len(reg_numbers) == 0:
        return send_error_response(400, "reg_numbers must be a non-empty array")

    event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    event_id = event_year_data.get("doc", {}).get("event_id")

    players = await players_collection().find(
        {"reg_number": {"$in": reg_numbers}}, {"reg_number": 1, "full_name": 1}
    ).to_list(length=None)
    found_reg_numbers = [p.get("reg_number") for p in players]
    not_found = [reg for reg in reg_numbers if reg not in found_reg_numbers]
    if not_found:
        return send_error_response(404, f"Players not found: {', '.join(not_found)}", {"notFound": not_found})

    sports = await get_sports(event_id, token=token)
    enrollments_map: Dict[str, Dict[str, Any]] = {
        reg: {"nonTeamEvents": [], "teams": [], "matches": [], "hasMatches": False}
        for reg in reg_numbers
    }

    for sport in sports:
        teams = sport.get("teams_participated") or []
        for team in teams:
            captain = team.get("captain")
            if captain and captain in reg_numbers:
                enrollments_map[captain]["teams"].append(
                    {"sport": sport.get("name"), "team_name": team.get("team_name"), "is_captain": True}
                )
            for player_reg in team.get("players") or []:
                if player_reg in reg_numbers:
                    existing = next(
                        (
                            t
                            for t in enrollments_map[player_reg]["teams"]
                            if t["team_name"] == team.get("team_name") and t["sport"] == sport.get("name")
                        ),
                        None,
                    )
                    if not existing:
                        enrollments_map[player_reg]["teams"].append(
                            {"sport": sport.get("name"), "team_name": team.get("team_name"), "is_captain": False}
                        )

        players_participated = sport.get("players_participated") or []
        for player_reg in players_participated:
            if player_reg in reg_numbers:
                has_team = any(
                    t["sport"] == sport.get("name") for t in enrollments_map[player_reg]["teams"]
                )
                if not has_team:
                    enrollments_map[player_reg]["nonTeamEvents"].append(
                        {"sport": sport.get("name"), "category": sport.get("category")}
                    )

    all_non_team_event_names = {
        event["sport"]
        for reg in reg_numbers
        for event in enrollments_map[reg]["nonTeamEvents"]
    }
    for sport_name in all_non_team_event_names:
        matches = await get_matches_for_sport(sport_name, event_id, token=token)
        for match in matches:
            if match.get("players") and isinstance(match.get("players"), list):
                for player_reg in match["players"]:
                    if player_reg in reg_numbers:
                        enrollments_map[player_reg]["matches"].append(
                            {
                                "sport": match.get("sports_name"),
                                "match_number": match.get("match_number"),
                                "match_type": match.get("match_type"),
                                "match_date": match.get("match_date"),
                                "status": match.get("status"),
                                "type": "individual",
                            }
                        )
                        enrollments_map[player_reg]["hasMatches"] = True

    result = {}
    for reg in reg_numbers:
        player = next((p for p in players if p.get("reg_number") == reg), None)
        result[reg] = {
            **enrollments_map[reg],
            "player": player or {"reg_number": reg, "full_name": reg},
        }

    return send_success_response({"enrollments": result})


@router.delete("/delete-player/{reg_number}")
async def delete_player(
    reg_number: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
):
    token = get_request_token(request)
    event_id_query = request.query_params.get("event_id")
    event_year_data = await get_event_year(
        event_id_query, return_doc=True, token=request.state.token
    )
    event_id = event_year_data.get("doc", {}).get("event_id")

    player = await players_collection().find_one({"reg_number": reg_number})
    if not player:
        return handle_not_found_error("Player")

    if reg_number == settings.admin_reg_number:
        return send_error_response(400, "Cannot delete admin user")

    sports = await get_sports(event_id, token=token)
    teams = []
    non_team_events = []

    for sport in sports:
        teams_participated = sport.get("teams_participated") or []
        team_member = next(
            (
                team
                for team in teams_participated
                if team.get("captain") == reg_number or reg_number in (team.get("players") or [])
            ),
            None,
        )
        if team_member:
            teams.append({"sport": sport.get("name"), "team_name": team_member.get("team_name")})
        elif reg_number in (sport.get("players_participated") or []):
            non_team_events.append({"sport": sport.get("name")})

    if teams:
        return send_error_response(
            400,
            f"Cannot delete player. Player is a member of {len(teams)} team(s). Please remove player from teams first.",
            {"teams": teams},
        )

    match_details = []
    for event in non_team_events:
        sport_name = event["sport"]
        matches = await get_matches_for_sport(sport_name, event_id, token=token)
        for match in matches:
            if reg_number in (match.get("players") or []):
                match_details.append(
                    {
                        "sport": match.get("sports_name"),
                        "match_number": match.get("match_number"),
                        "match_type": match.get("match_type"),
                        "match_date": match.get("match_date"),
                        "status": match.get("status"),
                    }
                )

    if match_details:
        return send_error_response(
            400,
            f"Cannot delete player. Player has {len(match_details)} match(es) in non-team events (scheduled/completed/draw/cancelled). Player cannot be deleted if they have any match history.",
            {"matches": match_details},
        )

    for event in non_team_events:
        await remove_participation(reg_number, event["sport"], event_id, token=token)

    await unassign_players_from_batches([reg_number], event_id, token=token)
    await players_collection().delete_one({"reg_number": reg_number})

    cache.clear_pattern("/identities/players")
    cache.clear(f"/identities/me?event_id={event_id}")
    cache.clear(f"/enrollments/batches?event_id={event_id}")

    return send_success_response(
        {"deleted_events": len(non_team_events), "events": [e["sport"] for e in non_team_events]},
        f"Player deleted successfully. Removed from {len(non_team_events)} event(s).",
    )


@router.post("/bulk-delete-players")
async def bulk_delete_players(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
):
    body = await request.json()
    token = get_request_token(request)
    reg_numbers = body.get("reg_numbers")
    event_id_query = request.query_params.get("event_id")

    if not isinstance(reg_numbers, list) or len(reg_numbers) == 0:
        return send_error_response(400, "reg_numbers must be a non-empty array")
    if len(reg_numbers) > DEFAULT_PLAYERS_PAGE_SIZE:
        return send_error_response(
            400, f"Maximum {DEFAULT_PLAYERS_PAGE_SIZE} players can be deleted at a time"
        )
    if settings.admin_reg_number in reg_numbers:
        return send_error_response(400, "Cannot delete admin user")

    event_year_data = await get_event_year(
        event_id_query, return_doc=True, token=request.state.token
    )
    event_id = event_year_data.get("doc", {}).get("event_id")

    players = await players_collection().find({"reg_number": {"$in": reg_numbers}}).to_list(length=None)
    found = [p.get("reg_number") for p in players]
    not_found = [reg for reg in reg_numbers if reg not in found]
    if not_found:
        return send_error_response(404, f"Players not found: {', '.join(not_found)}", {"notFound": not_found})

    sports = await get_sports(event_id, token=token)
    enrollments_map: Dict[str, Dict[str, Any]] = {reg: {"teams": [], "nonTeamEvents": []} for reg in reg_numbers}

    for sport in sports:
        teams_participated = sport.get("teams_participated") or []
        for team in teams_participated:
            captain = team.get("captain")
            if captain in reg_numbers:
                enrollments_map[captain]["teams"].append(
                    {"sport": sport.get("name"), "team_name": team.get("team_name"), "is_captain": True}
                )
            for member in team.get("players") or []:
                if member in reg_numbers:
                    existing = next(
                        (
                            t
                            for t in enrollments_map[member]["teams"]
                            if t["team_name"] == team.get("team_name") and t["sport"] == sport.get("name")
                        ),
                        None,
                    )
                    if not existing:
                        enrollments_map[member]["teams"].append(
                            {"sport": sport.get("name"), "team_name": team.get("team_name"), "is_captain": False}
                        )

        for member in sport.get("players_participated") or []:
            if member in reg_numbers:
                has_team = any(
                    t["sport"] == sport.get("name") for t in enrollments_map[member]["teams"]
                )
                if not has_team:
                    enrollments_map[member]["nonTeamEvents"].append({"sport": sport.get("name")})

    all_non_team_event_names = {
        event["sport"]
        for reg in reg_numbers
        for event in enrollments_map[reg]["nonTeamEvents"]
    }
    matches_by_player_and_sport: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for sport_name in all_non_team_event_names:
        matches = await get_matches_for_sport(sport_name, event_id, token=request.state.token)
        for match in matches:
            for player_reg in match.get("players") or []:
                if player_reg in reg_numbers:
                    matches_by_player_and_sport.setdefault(player_reg, {}).setdefault(sport_name, []).append(
                        {
                            "sport": match.get("sports_name"),
                            "match_number": match.get("match_number"),
                            "match_type": match.get("match_type"),
                            "match_date": match.get("match_date"),
                            "status": match.get("status"),
                        }
                    )

    players_with_teams = []
    players_with_matches = []
    players_to_delete = []

    for reg in reg_numbers:
        enrollments = enrollments_map.get(reg, {"teams": [], "nonTeamEvents": []})
        player = next((p for p in players if p.get("reg_number") == reg), {})
        if enrollments["teams"]:
            players_with_teams.append(
                {
                    "reg_number": reg,
                    "full_name": player.get("full_name") or reg,
                    "teams": enrollments["teams"],
                }
            )
            continue
        player_matches = []
        for event in enrollments["nonTeamEvents"]:
            player_matches.extend(matches_by_player_and_sport.get(reg, {}).get(event["sport"], []))
        if player_matches:
            players_with_matches.append(
                {
                    "reg_number": reg,
                    "full_name": player.get("full_name") or reg,
                    "matches": player_matches,
                }
            )
            continue
        players_to_delete.append({"reg_number": reg, "nonTeamEvents": enrollments["nonTeamEvents"]})

    if players_with_teams or players_with_matches:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "Some players cannot be deleted due to constraints",
                "playersWithTeams": players_with_teams,
                "playersWithMatches": players_with_matches,
                "totalFailed": len(players_with_teams) + len(players_with_matches),
                "totalRequested": len(reg_numbers),
            },
        )

    deleted_events_count: Dict[str, List[str]] = {}
    reg_numbers_to_delete = []
    for player_data in players_to_delete:
        reg_numbers_to_delete.append(player_data["reg_number"])
        deleted_events_count[player_data["reg_number"]] = [e["sport"] for e in player_data["nonTeamEvents"]]
        for event in player_data["nonTeamEvents"]:
            await remove_participation(
                player_data["reg_number"],
                event["sport"],
                event_id,
                token=request.state.token,
            )

    if reg_numbers_to_delete:
        await unassign_players_from_batches(reg_numbers_to_delete, event_id, token=request.state.token)
        await players_collection().delete_many({"reg_number": {"$in": reg_numbers_to_delete}})

    cache.clear_pattern("/identities/players")
    cache.clear(f"/identities/me?event_id={event_id}")
    cache.clear(f"/enrollments/batches?event_id={event_id}")

    return send_success_response(
        {
            "deleted_count": len(reg_numbers_to_delete),
            "deleted_players": reg_numbers_to_delete,
            "deleted_events": deleted_events_count,
        },
        f"Successfully deleted {len(reg_numbers_to_delete)} player(s).",
    )
