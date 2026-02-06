import logging
from typing import Any, Dict, List
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, Request

from ..auth import auth_dependency, get_request_token
from ..batch_helpers import get_players_batch_names
from ..cache import cache
from ..coordinator_helpers import require_admin_or_coordinator
from ..date_restrictions import require_registration_period
from ..db import sports_collection
from ..errors import (
    handle_forbidden_error,
    handle_not_found_error,
    send_error_response,
    send_success_response,
)
from ..external_services import (
    fetch_player,
    fetch_players_by_reg_numbers,
    get_event_year,
    get_matches_for_sport,
)
from ..gender_helpers import clear_team_gender_cache
from ..player_helpers import serialize_player
from ..sport_helpers import find_sport_by_name_and_id, normalize_sport_name
from ..validators import trim_object_fields


logger = logging.getLogger("sports-participation.teams")
router = APIRouter()


def _serialize_sport(sport: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(sport)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return data


@router.post("/update-team-participation")
async def update_team_participation(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_registration_period),
):
    body = await request.json()
    team_name = body.get("team_name")
    sport = body.get("sport")
    reg_numbers = body.get("reg_numbers")
    event_id = body.get("event_id")
    token = get_request_token(request)

    trimmed = trim_object_fields({"team_name": team_name, "sport": sport, "event_id": event_id})
    team_name = trimmed.get("team_name")
    sport = trimmed.get("sport")
    event_id = trimmed.get("event_id")

    if not event_id or not str(event_id).strip():
        return send_error_response(400, "event_id is required")

    event_year_data = await get_event_year(str(event_id).trim(), return_doc=True, token=token)
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    if not team_name or not sport or not isinstance(reg_numbers, list) or len(reg_numbers) == 0:
        return send_error_response(
            400, "Team name, sport, and registration numbers array are required"
        )

    reg_numbers = [rn.strip() for rn in reg_numbers if isinstance(rn, str) and rn.strip()]

    reg_number_set = set()
    duplicates: List[str] = []
    for reg in reg_numbers:
        if reg in reg_number_set:
            duplicates.append(reg)
        else:
            reg_number_set.add(reg)
    if duplicates:
        return send_error_response(
            400,
            f"Duplicate players found in team: {', '.join(duplicates)}. Each player can only be selected once.",
        )

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id, lean=False)

    logged_in_reg = request.state.user.get("reg_number")
    if not logged_in_reg:
        return handle_forbidden_error("You must be logged in to create a team")

    if logged_in_reg in (sport_doc.get("eligible_coordinators") or []):
        return handle_forbidden_error(
            f"You are a coordinator for {sport} and cannot create or join a team for that sport."
        )

    if sport_doc.get("type") not in {"dual_team", "multi_team"}:
        return send_error_response(
            400, "Team participation is only applicable for team sports (dual_team or multi_team)"
        )

    existing_team = next(
        (
            team
            for team in sport_doc.get("teams_participated") or []
            if team.get("team_name", "").lower() == team_name.lower()
        ),
        None,
    )
    if existing_team:
        return send_error_response(
            400,
            f'Team name "{team_name}" already exists for {sport}. Please choose a different team name.',
        )

    players = await fetch_players_by_reg_numbers(
        reg_numbers,
        event_id=resolved_event_id,
        token=request.state.token,
    )
    players_map = {player.get("reg_number"): player for player in players}

    errors: List[str] = []
    for reg in reg_numbers:
        if reg not in players_map:
            errors.append(f"Player with reg_number {reg} not found")
    if errors:
        return send_error_response(400, "; ".join(errors))

    player_data = [players_map[reg] for reg in reg_numbers if reg in players_map]

    batch_map = await get_players_batch_names(reg_numbers, resolved_event_id, token=token)
    missing_batch = [reg for reg in reg_numbers if not batch_map.get(reg)]
    if missing_batch:
        return send_error_response(
            400,
            f"Batch assignment missing for: {', '.join(missing_batch)}. Please assign batches before creating a team.",
        )

    first_batch = batch_map.get(reg_numbers[0])
    batch_mismatches = [reg for reg in reg_numbers if batch_map.get(reg) != first_batch]
    if batch_mismatches:
        mismatch_names = []
        for reg in batch_mismatches:
            player = players_map.get(reg)
            mismatch_names.append(
                f"{player.get('full_name')} ({player.get('reg_number')})" if player else reg
            )
        return send_error_response(
            400,
            f"Batch mismatch: {', '.join(mismatch_names)} must be in the same batch ({first_batch}) as other team members.",
        )

    if sport_doc.get("eligible_coordinators"):
        coordinator_in_team = next(
            (reg for reg in reg_numbers if reg in sport_doc.get("eligible_coordinators")), None
        )
        if coordinator_in_team:
            return send_error_response(
                400,
                f"Player {coordinator_in_team} is a coordinator for {sport} and cannot participate in that sport.",
            )

    if player_data:
        first_gender = player_data[0].get("gender")
        gender_mismatches = [
            f"{p.get('full_name')} ({p.get('reg_number')})"
            for p in player_data
            if p.get("gender") != first_gender
        ]
        if gender_mismatches:
            return send_error_response(
                400,
                f"Gender mismatch: {', '.join(gender_mismatches)} must have the same gender ({first_gender}) as other team members.",
            )

    if logged_in_reg not in (sport_doc.get("eligible_captains") or []):
        return handle_forbidden_error(
            f"You can only create teams for sports where you are assigned as captain. You are not assigned as captain for {sport}."
        )

    if logged_in_reg not in reg_numbers:
        return handle_forbidden_error("You must be included in the team to create it.")

    captains_in_team = [
        player
        for player in player_data
        if player.get("reg_number") in (sport_doc.get("eligible_captains") or [])
    ]
    if len(captains_in_team) == 0:
        return send_error_response(
            400,
            f"Team must have exactly one captain for {sport}. At least one player in the team must be assigned as captain for this sport.",
        )
    if len(captains_in_team) > 1:
        captain_names = [
            f"{p.get('full_name')} ({p.get('reg_number')})" for p in captains_in_team
        ]
        return send_error_response(
            400,
            f"Multiple captains found in the same team: {', '.join(captain_names)}. A team can only have exactly one captain for {sport}.",
        )

    if sport_doc.get("team_size") is not None:
        if len(reg_numbers) != sport_doc.get("team_size"):
            return send_error_response(
                400,
                f"Team size mismatch. This sport requires exactly {sport_doc.get('team_size')} players, but {len(reg_numbers)} players were provided.",
            )

    for player in player_data:
        existing_member_team = next(
            (
                team
                for team in sport_doc.get("teams_participated") or []
                if player.get("reg_number") in (team.get("players") or [])
            ),
            None,
        )
        if existing_member_team:
            return send_error_response(
                400,
                f"{player.get('full_name')} ({player.get('reg_number')}) is already in a team ({existing_member_team.get('team_name')}) for {sport}. A player can only belong to one team per sport.",
            )

    captain = captains_in_team[0]
    new_team = {
        "team_name": team_name.strip(),
        "captain": captain.get("reg_number"),
        "players": reg_numbers,
    }

    teams_participated = sport_doc.get("teams_participated") or []
    teams_participated.append(new_team)
    sport_doc["teams_participated"] = teams_participated
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/teams/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(
        f"/sports-participations/sports-counts?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")
    clear_team_gender_cache(team_name, sport, resolved_event_id)

    return send_success_response(
        {"team": new_team, "sport": _serialize_sport(sport_doc)},
        f'Team "{team_name}" created successfully for {sport}',
    )


@router.get("/teams/{sport}")
async def get_teams(
    sport: str,
    request: Request,
    _: None = Depends(auth_dependency),
):
    sport = unquote(sport or "")
    if not sport:
        return send_error_response(400, "Sport name is required")

    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return send_success_response({"sport": sport, "teams": [], "total_teams": 0})
        raise

    resolved_event_id = event_year_data.get("doc", {}).get("event_id")
    cache_key = f"/sports-participations/teams/{sport}?event_id={quote(str(resolved_event_id))}"
    cached = cache.get(cache_key)
    if cached:
        return send_success_response(cached)

    try:
        sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id)
    except Exception as exc:
        if "not found" in str(exc):
            return send_success_response({"sport": sport, "teams": [], "total_teams": 0})
        raise

    all_reg_numbers = set()
    for team in sport_doc.get("teams_participated") or []:
        for reg in team.get("players") or []:
            all_reg_numbers.add(reg)

    players_list = await fetch_players_by_reg_numbers(
        list(all_reg_numbers),
        event_id=resolved_event_id,
        token=request.state.token,
    )
    players_map = {player.get("reg_number"): player for player in players_list}

    batch_map = await get_players_batch_names(
        list(all_reg_numbers),
        resolved_event_id,
        token=token,
    )

    teams = []
    for team in sport_doc.get("teams_participated") or []:
        player_details = []
        for reg in team.get("players") or []:
            player = players_map.get(reg)
            if not player:
                continue
            player_details.append(
                {
                    "reg_number": player.get("reg_number"),
                    "full_name": player.get("full_name"),
                    "department_branch": player.get("department_branch"),
                    "batch_name": batch_map.get(player.get("reg_number")),
                    "gender": player.get("gender"),
                    "mobile_number": player.get("mobile_number"),
                    "email_id": player.get("email_id"),
                    "captain_in": player.get("captain_in") or [],
                }
            )

        teams.append(
            {
                "team_name": team.get("team_name"),
                "captain": team.get("captain"),
                "players": player_details,
                "player_count": len(player_details),
            }
        )

    teams.sort(key=lambda item: (item.get("team_name") or "").lower())

    result = {"sport": sport, "teams": teams, "total_teams": len(teams)}
    cache.set(cache_key, result)
    return send_success_response(result)


@router.post("/update-team-player")
async def update_team_player(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_registration_period),
):
    body = await request.json()
    team_name = body.get("team_name")
    sport = body.get("sport")
    old_reg_number = body.get("old_reg_number")
    new_reg_number = body.get("new_reg_number")
    event_id = body.get("event_id")
    token = get_request_token(request)

    trimmed = trim_object_fields(
        {
            "team_name": team_name,
            "sport": sport,
            "old_reg_number": old_reg_number,
            "new_reg_number": new_reg_number,
            "event_id": event_id,
        }
    )
    team_name = trimmed.get("team_name")
    sport = trimmed.get("sport")
    old_reg_number = trimmed.get("old_reg_number")
    new_reg_number = trimmed.get("new_reg_number")
    event_id = trimmed.get("event_id")

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

    if not team_name or not sport or not old_reg_number or not new_reg_number:
        return send_error_response(
            400,
            "Team name, sport, old registration number, and new registration number are required",
        )

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id, lean=False)

    team = next(
        (
            t
            for t in sport_doc.get("teams_participated") or []
            if t.get("team_name", "").lower() == team_name.lower()
        ),
        None,
    )
    if not team:
        return send_error_response(404, f'Team "{team_name}" not found for {sport}')

    if old_reg_number not in (team.get("players") or []):
        return send_error_response(400, "Old player is not in this team")
    if new_reg_number in (team.get("players") or []):
        return send_error_response(400, "New player is already in this team")

    old_player = await fetch_player(
        old_reg_number, event_id=resolved_event_id, token=request.state.token
    )
    if not old_player:
        return handle_not_found_error("Old player")

    new_player = await fetch_player(
        new_reg_number, event_id=resolved_event_id, token=request.state.token
    )
    if not new_player:
        return handle_not_found_error("New player")

    if new_reg_number in (sport_doc.get("eligible_coordinators") or []):
        return send_error_response(
            400,
            f"Player {new_reg_number} is a coordinator for {sport} and cannot participate in that sport.",
        )

    if new_reg_number in (sport_doc.get("eligible_captains") or []):
        return send_error_response(
            400,
            f"Player {new_reg_number} is an eligible captain for {sport}. Teams can only include one captain.",
        )

    current_team_members_reg = [rn for rn in team.get("players") or [] if rn != old_reg_number]
    current_team_members = await fetch_players_by_reg_numbers(
        current_team_members_reg,
        event_id=resolved_event_id,
        token=request.state.token,
    )

    if current_team_members:
        team_gender = current_team_members[0].get("gender")
        if new_player.get("gender") != team_gender:
            return send_error_response(
                400,
                f"Gender mismatch: New player must have the same gender ({team_gender}) as other team members.",
            )

        batch_map = await get_players_batch_names(
            current_team_members_reg + [new_reg_number],
            resolved_event_id,
            token=token,
        )
        team_batch = batch_map.get(current_team_members_reg[0]) if current_team_members_reg else None
        missing_batch = [rn for rn in current_team_members_reg if not batch_map.get(rn)]
        if not team_batch or missing_batch:
            return send_error_response(
                400,
                "Unable to determine batch for existing team members. Please verify batch assignments.",
            )
        team_batch_mismatches = [
            rn for rn in current_team_members_reg if batch_map.get(rn) != team_batch
        ]
        if team_batch_mismatches:
            return send_error_response(
                400,
                f"Existing team members are not in the same batch ({team_batch}). Please fix team composition first.",
            )
        if batch_map.get(new_reg_number) != team_batch:
            return send_error_response(
                400,
                f"Batch mismatch: New player must be in the same batch ({team_batch}) as other team members.",
            )

    existing_team = next(
        (
            t
            for t in sport_doc.get("teams_participated") or []
            if new_reg_number in (t.get("players") or [])
        ),
        None,
    )
    if existing_team:
        return send_error_response(
            400,
            f"New player is already in a team ({existing_team.get('team_name')}) for {sport}. A player can only belong to one team per sport.",
        )

    if team.get("captain") == old_reg_number:
        return send_error_response(
            400,
            "Cannot replace the team captain. The captain cannot be changed once a team is created. To change the captain, you must delete the team and create a new one.",
        )

    player_index = (team.get("players") or []).index(old_reg_number)
    team["players"][player_index] = new_reg_number
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/teams/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(
        f"/sports-participations/sports-counts?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")
    clear_team_gender_cache(team_name, sport, resolved_event_id)

    new_player_data = serialize_player(new_player)

    return send_success_response(
        {
            "old_player": {"reg_number": old_reg_number, "full_name": old_player.get("full_name")},
            "new_player": new_player_data,
            "team": team,
        },
        f"Player updated successfully in team {team_name}",
    )


@router.delete("/delete-team")
async def delete_team(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_registration_period),
):
    body = await request.json()
    team_name = body.get("team_name")
    sport = body.get("sport")
    event_id = body.get("event_id")
    token = get_request_token(request)

    trimmed = trim_object_fields({"team_name": team_name, "sport": sport, "event_id": event_id})
    team_name = trimmed.get("team_name")
    sport = trimmed.get("sport")
    event_id = trimmed.get("event_id")

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

    if not team_name or not sport:
        return send_error_response(400, "Team name and sport are required")

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id, lean=False)

    team_index = next(
        (
            index
            for index, team in enumerate(sport_doc.get("teams_participated") or [])
            if team.get("team_name", "").lower() == team_name.lower()
        ),
        -1,
    )
    if team_index == -1:
        return handle_not_found_error("Team")

    team = sport_doc.get("teams_participated")[team_index]

    normalized_sport = normalize_sport_name(sport)
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
            f'Cannot delete team "{team_name}". Match history exists for {sport}.',
        )

    team_members_data = await fetch_players_by_reg_numbers(
        team.get("players") or [],
        event_id=resolved_event_id,
        token=request.state.token,
    )
    team_members = [
        {"reg_number": member.get("reg_number"), "full_name": member.get("full_name")}
        for member in team_members_data
    ]

    sport_doc["teams_participated"].pop(team_index)
    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": sport_doc.get("_id")}, {"$set": update_doc})

    cache.clear(f"/sports-participations/sports?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/sports/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(f"/sports-participations/teams/{sport}?event_id={quote(str(resolved_event_id))}")
    cache.clear(
        f"/sports-participations/sports-counts?event_id={quote(str(resolved_event_id))}"
    )
    cache.clear_pattern("/identities/players")
    cache.clear_pattern("/identities/me")
    clear_team_gender_cache(team_name, sport, resolved_event_id)

    return send_success_response(
        {"deleted_count": len(team_members), "team_members": team_members},
        f'Team "{team_name}" deleted successfully. Removed {len(team_members)} player(s) from the team.',
    )


@router.post("/validate-participations")
async def validate_participations(
    request: Request,
    _: None = Depends(auth_dependency),
):
    body = await request.json()
    reg_numbers = body.get("reg_numbers")
    sport = body.get("sport")
    event_id = body.get("event_id")
    token = get_request_token(request)

    sport = sport.strip() if isinstance(sport, str) else sport
    event_id = str(event_id).strip() if event_id is not None else None
    if isinstance(reg_numbers, list):
        reg_numbers = [rn.strip() for rn in reg_numbers if isinstance(rn, str) and rn.strip()]

    if not reg_numbers or not isinstance(reg_numbers, list) or len(reg_numbers) == 0 or not sport:
        return send_error_response(400, "Registration numbers array and sport are required")

    event_year_data = await get_event_year(event_id or None, return_doc=True, token=token)
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    sport_doc = await find_sport_by_name_and_id(sport, resolved_event_id)

    players = await fetch_players_by_reg_numbers(
        reg_numbers,
        event_id=resolved_event_id,
        token=request.state.token,
    )
    players_map = {player.get("reg_number"): player for player in players}

    errors: List[str] = []
    for reg_number in reg_numbers:
        player = players_map.get(reg_number)
        if not player:
            errors.append(f"Player with reg_number {reg_number} not found")
            continue
        existing_team = next(
            (
                team
                for team in sport_doc.get("teams_participated") or []
                if reg_number in (team.get("players") or [])
            ),
            None,
        )
        if existing_team:
            if existing_team.get("captain") == reg_number:
                errors.append(
                    f"{player.get('full_name')} ({reg_number}) is a captain and has already created a team ({existing_team.get('team_name')}) for {sport}. A captain cannot create multiple teams for the same sport."
                )
            else:
                errors.append(
                    f"{player.get('full_name')} ({reg_number}) is already in a team ({existing_team.get('team_name')}) for {sport}. A player can only belong to one team per sport."
                )

    if errors:
        return send_error_response(400, "; ".join(errors))

    return send_success_response(
        {"valid": True}, "All players are valid for team registration"
    )
