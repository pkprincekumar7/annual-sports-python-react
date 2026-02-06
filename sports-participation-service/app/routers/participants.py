import logging
from typing import List
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, Request

from ..auth import admin_dependency, auth_dependency, get_request_token
from ..cache import cache
from ..coordinator_helpers import require_admin_or_coordinator
from ..date_restrictions import require_registration_period
from ..db import sports_collection
from ..errors import handle_not_found_error, send_error_response, send_success_response
from ..external_services import (
    fetch_player,
    fetch_players_by_reg_numbers,
    get_event_year,
    get_matches_for_sport,
)
from ..player_helpers import serialize_player
from ..sport_helpers import find_sport_by_name_and_id, normalize_sport_name
from ..validators import trim_object_fields


logger = logging.getLogger("sports-participation.participants")
router = APIRouter()


def serialize_sport(sport: dict) -> dict:
    data = dict(sport)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return data


@router.get("/participants/{sport}")
async def get_participants(
    sport: str,
    request: Request,
    _: None = Depends(auth_dependency),
):
    sport = unquote(sport or "")
    event_id_query = request.query_params.get("event_id")
    token = get_request_token(request)
    event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    if not sport:
        return send_error_response(400, "Sport name is required")

    try:
        await require_admin_or_coordinator(
            request.state.user.get("reg_number"), sport, resolved_event_id
        )
    except Exception as exc:
        return send_error_response(403, str(exc))

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id)

    participant_reg_numbers = sport_doc.get("players_participated") or []
    if not participant_reg_numbers:
        return send_success_response(
            {"sport": sport, "participants": [], "total_participants": 0}
        )

    participants = await fetch_players_by_reg_numbers(
        participant_reg_numbers,
        event_id=resolved_event_id,
        token=request.state.token,
    )
    participants = [serialize_player(player) for player in participants]
    participants.sort(key=lambda item: (item.get("full_name") or "").lower())

    return send_success_response(
        {
            "sport": sport,
            "participants": participants,
            "total_participants": len(participants),
        }
    )


@router.get("/participants-count/{sport}")
async def get_participants_count(
    sport: str,
    request: Request,
    _: None = Depends(auth_dependency),
):
    sport = unquote(sport or "")
    event_id_query = request.query_params.get("event_id")
    token = get_request_token(request)
    event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    if not sport:
        return send_error_response(400, "Sport name is required")

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id)
    count = len(sport_doc.get("players_participated") or [])
    return send_success_response({"sport": sport, "count": count})


@router.get("/player-enrollments/{reg_number}")
async def player_enrollments(
    reg_number: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    event_id_query = request.query_params.get("event_id")
    token = get_request_token(request)
    event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    player = await fetch_player(reg_number, event_id=resolved_event_id, token=request.state.token)
    if not player:
        return handle_not_found_error("Player")

    sports = await sports_collection().find(
        {
            "event_id": resolved_event_id,
            "$or": [
                {"teams_participated.captain": reg_number},
                {"teams_participated.players": reg_number},
                {"players_participated": reg_number},
            ],
        }
    ).to_list(length=None)

    non_team_events = []
    teams = []

    for sport in sports:
        team_member = next(
            (
                team
                for team in sport.get("teams_participated") or []
                if team.get("captain") == reg_number
                or reg_number in (team.get("players") or [])
            ),
            None,
        )
        if team_member:
            teams.append(
                {
                    "sport": sport.get("name"),
                    "team_name": team_member.get("team_name"),
                    "is_captain": team_member.get("captain") == reg_number,
                }
            )
        elif reg_number in (sport.get("players_participated") or []):
            non_team_events.append(
                {"sport": sport.get("name"), "category": sport.get("category")}
            )

    non_team_event_names = [event["sport"] for event in non_team_events]
    matches = []
    for sport_name in non_team_event_names:
        sport_matches = await get_matches_for_sport(
            sport_name,
            resolved_event_id,
            token=request.state.token,
        )
        matches.extend(
            [
                match
                for match in sport_matches
                if reg_number in (match.get("players") or [])
            ]
        )

    all_matches = [
        {
            "sport": match.get("sports_name"),
            "match_number": match.get("match_number"),
            "match_type": match.get("match_type"),
            "match_date": match.get("match_date"),
            "status": match.get("status"),
            "type": "individual",
        }
        for match in matches
    ]

    return send_success_response(
        {
            "nonTeamEvents": non_team_events,
            "teams": teams,
            "matches": all_matches,
            "hasEnrollments": len(non_team_events) > 0 or len(teams) > 0,
            "hasMatches": len(all_matches) > 0,
        }
    )


@router.post("/update-participation")
async def update_participation(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    reg_number = body.get("reg_number")
    sport = body.get("sport")
    event_id = body.get("event_id")
    token = get_request_token(request)

    if not event_id or not str(event_id).strip():
        return send_error_response(400, "event_id is required")

    event_year_data = await get_event_year(str(event_id).trim(), return_doc=True, token=token)
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    if not reg_number or not sport:
        return send_error_response(400, "Registration number and sport are required")

    is_self_registration = request.state.user.get("reg_number") == reg_number
    if not is_self_registration:
        try:
            await require_admin_or_coordinator(
                request.state.user.get("reg_number"), sport, resolved_event_id
            )
        except Exception as exc:
            return send_error_response(403, str(exc))

    player = await fetch_player(reg_number, event_id=resolved_event_id, token=request.state.token)
    if not player:
        return handle_not_found_error("Player")

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id, lean=False)

    if reg_number in (sport_doc.get("eligible_coordinators") or []):
        return send_error_response(
            400, f"Player is a coordinator for {sport} and cannot participate in that sport."
        )

    if sport_doc.get("type") not in {"dual_player", "multi_player"}:
        return send_error_response(
            400,
            "Individual participation is only applicable for individual/cultural sports (dual_player or multi_player)",
        )

    if not sport_doc.get("players_participated"):
        sport_doc["players_participated"] = []

    if reg_number in sport_doc.get("players_participated"):
        return send_error_response(400, f"Player is already registered for {sport}")

    sport_doc["players_participated"].append(reg_number)
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(
        f"/sports-participations/participants/{sport}?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear(
        f"/sports-participations/participants-count/{sport}?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear(f"/sports-participations/sports-counts?event_id={quote(str(resolved_event_id))}")
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")

    return send_success_response(
        {"sport": serialize_sport(sport_doc)},
        f"Participation updated successfully for {sport}",
    )


@router.delete("/remove-participation")
async def remove_participation(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    reg_number = body.get("reg_number")
    sport = body.get("sport")
    event_id = body.get("event_id")
    token = get_request_token(request)

    if not event_id or not str(event_id).strip():
        return send_error_response(400, "event_id is required")

    event_year_data = await get_event_year(str(event_id).trim(), return_doc=True, token=token)
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    try:
        await require_admin_or_coordinator(
            request.state.user.get("reg_number"), sport, resolved_event_id
        )
    except Exception as exc:
        return send_error_response(403, str(exc))

    if not reg_number or not sport:
        return send_error_response(400, "Registration number and sport are required")

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id, lean=False)
    normalized_sport = normalize_sport_name(sport)

    removed = False

    team_index = next(
        (
            index
            for index, team in enumerate(sport_doc.get("teams_participated") or [])
            if reg_number in (team.get("players") or [])
        ),
        -1,
    )
    if team_index != -1:
        team = sport_doc.get("teams_participated")[team_index]
        if team.get("captain") == reg_number:
            return send_error_response(
                400,
                f'Cannot remove participation. Player is the captain of team "{team.get("team_name")}". Please delete the team first or assign a new captain.',
            )

        matches = await get_matches_for_sport(
            normalized_sport,
            resolved_event_id,
            token=request.state.token,
        )
        team_match_count = len(
            [
                match
                for match in matches
                if team.get("team_name") in (match.get("teams") or [])
            ]
        )
        if team_match_count > 0:
            return send_error_response(
                400,
                f'Cannot remove participation. Team "{team.get("team_name")}" has match history in {sport}.',
            )

        team["players"] = [player for player in team.get("players") or [] if player != reg_number]
        if not team.get("players"):
            sport_doc.get("teams_participated").pop(team_index)
        removed = True
    elif reg_number in (sport_doc.get("players_participated") or []):
        matches = await get_matches_for_sport(
            normalized_sport,
            resolved_event_id,
            token=request.state.token,
        )
        player_match_count = len(
            [
                match
                for match in matches
                if reg_number in (match.get("players") or [])
            ]
        )
        if player_match_count > 0:
            return send_error_response(
                400, f"Cannot remove participation. Player has match history in {sport}."
            )
        sport_doc["players_participated"] = [
            player for player in sport_doc.get("players_participated") or [] if player != reg_number
        ]
        removed = True

    if not removed:
        return send_error_response(400, f"Player is not registered for {sport}")

    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(
        f"/sports-participations/teams/{sport}?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear(
        f"/sports-participations/participants/{sport}?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear(
        f"/sports-participations/participants-count/{sport}?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear(f"/sports-participations/sports-counts?event_id={quote(str(resolved_event_id))}")
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")

    return send_success_response(
        {"sport": serialize_sport(sport_doc)}, f"Participation removed successfully for {sport}"
    )
