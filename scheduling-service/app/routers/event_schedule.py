import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote, unquote

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, Request

from ..auth import auth_dependency
from ..cache import cache
from ..cache_helpers import clear_match_caches, clear_new_match_caches
from ..coordinator_helpers import require_admin_or_coordinator
from ..date_restrictions import (
    is_match_date_within_event_range,
    require_event_period,
    require_event_status_update_period,
)
from ..db import event_schedule_collection
from ..errors import handle_not_found_error, send_error_response, send_success_response
from ..external_services import (
    fetch_players_by_reg_numbers,
    fetch_sport,
    get_event_year,
    update_points_table,
)
from ..gender_helpers import get_match_gender
from ..match_validation import (
    get_knocked_out_participants,
    get_participants_in_scheduled_matches,
    validate_all_league_matches_completed_before_knockout,
    validate_all_matches_completed_before_final,
    validate_final_match_requirement,
    validate_match_type_for_sport,
)
from ..sport_helpers import normalize_sport_name
from ..validators import trim_object_fields


logger = logging.getLogger("scheduling-service.event-schedule")
router = APIRouter()


def _parse_object_id(value: str) -> Optional[ObjectId]:
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def _parse_match_date(value: str) -> Optional[datetime]:
    if not value:
        return None
    normalized = value if "T" in value else f"{value}T00:00:00"
    try:
        return datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except Exception:
        return None


def _format_date(date_value: datetime) -> str:
    day = date_value.day
    month = date_value.strftime("%b")
    year = date_value.year
    ordinal = _ordinal(day)
    return f"{ordinal} {month} {year}"


def _ordinal(day: int) -> str:
    if day % 10 == 1 and day % 100 != 11:
        return f"{day}st"
    if day % 10 == 2 and day % 100 != 12:
        return f"{day}nd"
    if day % 10 == 3 and day % 100 != 13:
        return f"{day}rd"
    return f"{day}th"


def _serialize_match(match: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(match)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    if "match_date" in data and isinstance(data["match_date"], datetime):
        data["match_date"] = data["match_date"].isoformat()
    return data


@router.get("/event-schedule/{sport}")
async def get_event_schedule(
    sport: str,
    request: Request,
    _: None = Depends(auth_dependency),
):
    sport = unquote(sport or "")
    event_id_query = request.query_params.get("event_id")
    event_year_data = await get_event_year(
        event_id_query,
        return_doc=True,
        token=request.state.token,
    )
    event_id = event_year_data.get("doc", {}).get("event_id")
    gender = request.query_params.get("gender")

    cache_key = (
        f"/schedulings/event-schedule/{sport}?event_id={quote(str(event_id))}&gender={gender}"
        if gender
        else f"/schedulings/event-schedule/{sport}?event_id={quote(str(event_id))}"
    )
    cached = cache.get(cache_key)
    if cached:
        return send_success_response(cached)

    cursor = (
        event_schedule_collection()
        .find({"sports_name": normalize_sport_name(sport), "event_id": event_id})
        .sort("match_number", 1)
    )
    all_matches = await cursor.to_list(length=None)

    try:
        sport_doc = await fetch_sport(sport, event_id=event_id, token=request.state.token)
    except Exception:
        sport_doc = None

    matches_with_gender: List[Dict[str, Any]] = []
    for match in all_matches:
        match_gender = await get_match_gender(match, sport_doc, token=request.state.token)
        match_with_gender = {**_serialize_match(match), "gender": match_gender}
        if not gender or gender in {"Male", "Female"}:
            if not gender or match_gender == gender:
                matches_with_gender.append(match_with_gender)

    result = {"matches": matches_with_gender}
    cache.set(cache_key, result)
    return send_success_response(result)


@router.get("/event-schedule/{sport}/teams-players")
async def get_teams_players(
    sport: str,
    request: Request,
    _: None = Depends(auth_dependency),
):
    decoded_sport = unquote(sport or "")
    event_id_query = request.query_params.get("event_id")
    event_year_data = await get_event_year(
        event_id_query,
        return_doc=True,
        token=request.state.token,
    )
    event_id = event_year_data.get("doc", {}).get("event_id")
    gender = request.query_params.get("gender")

    try:
        await require_admin_or_coordinator(
            request.state.user.get("reg_number"),
            decoded_sport,
            event_id,
            token=request.state.token,
        )
    except Exception as exc:
        return send_error_response(403, str(exc))

    if not gender or gender not in {"Male", "Female"}:
        return send_error_response(
            400, 'Gender parameter is required and must be "Male" or "Female"'
        )

    try:
        sport_doc = await fetch_sport(decoded_sport, event_id=event_id, token=request.state.token)
    except Exception:
        return send_error_response(
            404,
            f'Sport "{decoded_sport}" not found for event year {event_year_data.get("doc", {}).get("event_year")}',
        )

    try:
        knocked_out = await get_knocked_out_participants(
            decoded_sport, event_id, gender, sport_doc, token=request.state.token
        )
        in_scheduled = await get_participants_in_scheduled_matches(
            decoded_sport, event_id, gender, sport_doc, token=request.state.token
        )
    except Exception as exc:
        logger.error("Error getting knocked out or scheduled participants: %s", exc)
        return send_error_response(500, "Error retrieving participant eligibility data")

    if sport_doc.get("type") in {"dual_team", "multi_team"}:
        eligible_teams = [
            team
            for team in (sport_doc.get("teams_participated") or [])
            if (team.get("team_name") or "").strip()
            and team.get("team_name").strip() not in knocked_out
            and team.get("team_name").strip() not in in_scheduled
        ]
        team_player_reg_numbers = []
        team_map: Dict[str, str] = {}
        for team in eligible_teams:
            if team.get("players"):
                team_player_reg_numbers.append(team.get("players")[0])
                team_map[team.get("players")[0]] = team.get("team_name")
        team_players = await fetch_players_by_reg_numbers(
            team_player_reg_numbers, event_id=event_id, token=request.state.token
        )
        teams = [
            {"team_name": team_map.get(player.get("reg_number")), "gender": player.get("gender")}
            for player in team_players
            if player.get("gender") == gender and team_map.get(player.get("reg_number"))
        ]
        teams.sort(key=lambda item: (item.get("team_name") or "").lower())
        return send_success_response({"teams": teams, "players": []})

    player_reg_numbers = [
        reg
        for reg in (sport_doc.get("players_participated") or [])
        if (reg or "").strip()
        and reg.strip() not in knocked_out
        and reg.strip() not in in_scheduled
    ]
    players = await fetch_players_by_reg_numbers(
        player_reg_numbers, event_id=event_id, token=request.state.token
    )
    players_list = [
        {
            "reg_number": player.get("reg_number"),
            "full_name": player.get("full_name"),
            "gender": player.get("gender"),
        }
        for player in players
        if player.get("gender") == gender
    ]
    return send_success_response({"teams": [], "players": players_list})


@router.post("/event-schedule")
async def create_match(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_event_period),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)
    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    match_type = body.get("match_type")
    sports_name = body.get("sports_name")
    teams = body.get("teams")
    players = body.get("players")
    match_date = body.get("match_date")
    event_id = body.get("event_id")
    number_of_participants = body.get("number_of_participants")

    if not event_id or not str(event_id).strip():
        return send_error_response(400, "event_id is required")

    event_year = await get_event_year(
        str(event_id).strip(),
        return_doc=True,
        token=request.state.token,
    )
    event_year_doc = event_year.get("doc")

    if not match_type or not sports_name or not match_date:
        return send_error_response(
            400, "Missing required fields: match_type, sports_name, match_date"
        )

    try:
        await require_admin_or_coordinator(
            request.state.user.get("reg_number"),
            sports_name,
            event_year_doc.get("event_id"),
            token=request.state.token,
        )
    except Exception as exc:
        return send_error_response(403, str(exc))

    if not is_match_date_within_event_range(match_date, event_year_doc):
        event_start = _parse_match_date(event_year_doc.get("event_dates", {}).get("start"))
        event_end = _parse_match_date(event_year_doc.get("event_dates", {}).get("end"))
        if event_start and event_end:
            date_label = f"{_format_date(event_start)} to {_format_date(event_end)}"
        else:
            date_label = f"{event_year_doc.get('event_dates', {}).get('start')} to {event_year_doc.get('event_dates', {}).get('end')}"
        return send_error_response(
            400,
            f"Match date must be within event date range ({date_label})",
        )

    try:
        sport_doc = await fetch_sport(
            sports_name, event_id=event_year_doc.get("event_id"), token=request.state.token
        )
    except Exception:
        return send_error_response(404, "Sport not found")

    unique_teams = None
    unique_players = None
    derived_gender = None

    if sport_doc.get("type") in {"dual_team", "multi_team"}:
        if not teams or not isinstance(teams, list):
            return send_error_response(400, "Teams array is required for team sports")
        unique_teams = list({t.strip() for t in teams if t and str(t).strip()})
        if sport_doc.get("type") == "dual_team" and len(unique_teams) != 2:
            return send_error_response(400, "dual_team sports require exactly 2 teams")
        if sport_doc.get("type") == "multi_team":
            if number_of_participants is not None:
                try:
                    num = int(number_of_participants)
                except Exception:
                    return send_error_response(400, "number_of_participants must be between 3 and 100")
                if num < 3 or num > 100:
                    return send_error_response(400, "number_of_participants must be between 3 and 100")
                if len(unique_teams) != num:
                    return send_error_response(
                        400,
                        f"Number of teams ({len(unique_teams)}) does not match number_of_participants ({num})",
                    )
            if len(unique_teams) <= 2:
                return send_error_response(
                    400, "multi_team sports require more than 2 teams"
                )
            available_teams_count = len(sport_doc.get("teams_participated") or [])
            if len(unique_teams) > available_teams_count:
                return send_error_response(
                    400,
                    f"Cannot select {len(unique_teams)} teams. Only {available_teams_count} team(s) available.",
                )
        existing_teams = {team.get("team_name") for team in sport_doc.get("teams_participated") or []}
        for team in unique_teams:
            if team not in existing_teams:
                return send_error_response(400, f'Team "{team}" does not exist for {sports_name}')

        team_details = [
            team
            for team in (sport_doc.get("teams_participated") or [])
            if team.get("team_name") in unique_teams
        ]
        first_player_regs = [
            team.get("players")[0]
            for team in team_details
            if team.get("players")
        ]
        if len(first_player_regs) != len(unique_teams):
            return send_error_response(400, "Some teams have no players")
        players_list = await fetch_players_by_reg_numbers(
            first_player_regs, event_id=event_year_doc.get("event_id"), token=request.state.token
        )
        if len(players_list) != len(first_player_regs):
            return send_error_response(400, "Some players not found")
        team_genders = [player.get("gender") for player in players_list if player.get("gender")]
        if not team_genders:
            return send_error_response(400, "Could not determine gender for teams")
        first_gender = team_genders[0]
        if any(gender != first_gender for gender in team_genders):
            return send_error_response(
                400, "All teams must have players of the same gender for team matches"
            )
        derived_gender = first_gender
    else:
        if not players or not isinstance(players, list):
            return send_error_response(
                400, "Players array is required for individual/cultural sports"
            )
        unique_players = list({p.strip() for p in players if p and str(p).strip()})
        if sport_doc.get("type") == "dual_player" and len(unique_players) != 2:
            return send_error_response(400, "dual_player sports require exactly 2 players")
        if sport_doc.get("type") == "multi_player":
            if number_of_participants is not None:
                try:
                    num = int(number_of_participants)
                except Exception:
                    return send_error_response(400, "number_of_participants must be between 3 and 100")
                if num < 3 or num > 100:
                    return send_error_response(400, "number_of_participants must be between 3 and 100")
                if len(unique_players) != num:
                    return send_error_response(
                        400,
                        f"Number of players ({len(unique_players)}) does not match number_of_participants ({num})",
                    )
            if len(unique_players) <= 2:
                return send_error_response(
                    400, "multi_player sports require more than 2 players"
                )
            available_players_count = len(sport_doc.get("players_participated") or [])
            if len(unique_players) > available_players_count:
                return send_error_response(
                    400,
                    f"Cannot select {len(unique_players)} players. Only {available_players_count} player(s) available.",
                )
        existing_players = set(sport_doc.get("players_participated") or [])
        for player in unique_players:
            if player not in existing_players:
                return send_error_response(
                    400, f'Player "{player}" is not registered for {sports_name}'
                )
        player_docs = await fetch_players_by_reg_numbers(
            unique_players, event_id=event_year_doc.get("event_id"), token=request.state.token
        )
        if len(player_docs) != len(unique_players):
            return send_error_response(400, "Some players not found")
        first_gender = player_docs[0].get("gender")
        if not first_gender:
            return send_error_response(
                400,
                "Could not determine gender for players. Please ensure all players have a valid gender set.",
            )
        if any(player.get("gender") != first_gender for player in player_docs):
            return send_error_response(400, "All players must have the same gender")
        derived_gender = first_gender

    match_type_error = validate_match_type_for_sport(match_type, sport_doc.get("type"))
    if match_type_error:
        return send_error_response(
            match_type_error.get("statusCode", 400), match_type_error.get("message", "Invalid match type")
        )

    all_league_error = await validate_all_league_matches_completed_before_knockout(
        sports_name, event_year_doc.get("event_id"), match_type, derived_gender, sport_doc, token=request.state.token
    )
    if all_league_error:
        return send_error_response(all_league_error["statusCode"], all_league_error["message"])

    all_matches_error = await validate_all_matches_completed_before_final(
        sports_name, event_year_doc.get("event_id"), match_type, derived_gender, sport_doc, token=request.state.token
    )
    if all_matches_error:
        return send_error_response(all_matches_error["statusCode"], all_matches_error["message"])

    if match_type in {"knockout", "final"}:
        participants_to_check = (
            unique_teams or [t.strip() for t in teams if t and str(t).strip()]
            if sport_doc.get("type") in {"dual_team", "multi_team"}
            else unique_players or [p.strip() for p in players if p and str(p).strip()]
        )
        knocked_out = await get_knocked_out_participants(
            sports_name, event_year_doc.get("event_id"), derived_gender, sport_doc, token=request.state.token
        )
        in_scheduled = await get_participants_in_scheduled_matches(
            sports_name, event_year_doc.get("event_id"), derived_gender, sport_doc, token=request.state.token
        )
        conflicting = [
            participant
            for participant in participants_to_check
            if (participant or "").strip() in knocked_out
            or (participant or "").strip() in in_scheduled
        ]
        if conflicting:
            participant_type = (
                "team(s)" if sport_doc.get("type") in {"dual_team", "multi_team"} else "player(s)"
            )
            in_scheduled_conflicts = [
                participant
                for participant in conflicting
                if (participant or "").strip() in in_scheduled
            ]
            knocked_out_conflicts = [
                participant
                for participant in conflicting
                if (participant or "").strip() in knocked_out
            ]
            match_label = "final match" if match_type == "final" else "knockout match"
            error_message = f"Cannot schedule {match_label}. "
            if in_scheduled_conflicts:
                error_message += (
                    f"The following {participant_type} are already in a scheduled knockout or final match: "
                    f"{', '.join(in_scheduled_conflicts)}. "
                )
            if knocked_out_conflicts:
                error_message += (
                    f"The following {participant_type} have been knocked out in previous knockout or final matches: "
                    f"{', '.join(knocked_out_conflicts)}. "
                )
            error_message += "Please select eligible participants."
            return send_error_response(400, error_message)

    if match_type == "league":
        all_knockout = await event_schedule_collection().find(
            {
                "sports_name": normalize_sport_name(sports_name),
                "event_id": event_year_doc.get("event_id"),
                "match_type": {"$in": ["knockout", "final"]},
                "status": {"$in": ["scheduled", "completed", "draw", "cancelled"]},
            }
        ).to_list(length=None)
        for match in all_knockout:
            match_gender = await get_match_gender(match, sport_doc, token=request.state.token)
            if match_gender == derived_gender:
                return send_error_response(
                    400,
                    f"Cannot schedule league matches. Knockout matches already exist for this sport and gender ({derived_gender}).",
                )
    elif match_type in {"knockout", "final"}:
        all_league = await event_schedule_collection().find(
            {
                "sports_name": normalize_sport_name(sports_name),
                "event_id": event_year_doc.get("event_id"),
                "match_type": "league",
            }
        ).sort("match_date", -1).to_list(length=None)
        league_matches: List[Dict[str, Any]] = []
        for match in all_league:
            match_gender = await get_match_gender(match, sport_doc, token=request.state.token)
            if match_gender == derived_gender:
                league_matches.append(match)
        if league_matches:
            latest_league_date = league_matches[0].get("match_date")
            match_date_obj = _parse_match_date(match_date)
            if isinstance(latest_league_date, datetime) and match_date_obj:
                if match_date_obj.date() < latest_league_date.date():
                    return send_error_response(
                        400,
                        f"{'Knockout' if match_type == 'knockout' else 'Final'} match date cannot be before all league matches. "
                        f"Latest league match date: {latest_league_date.date()}",
                    )
        if match_type == "final":
            all_knockout = await event_schedule_collection().find(
                {
                    "sports_name": normalize_sport_name(sports_name),
                    "event_id": event_year_doc.get("event_id"),
                    "match_type": "knockout",
                }
            ).sort("match_date", -1).to_list(length=None)
            knockout_matches: List[Dict[str, Any]] = []
            for match in all_knockout:
                match_gender = await get_match_gender(match, sport_doc, token=request.state.token)
                if match_gender == derived_gender:
                    knockout_matches.append(match)
            if knockout_matches:
                latest_knockout_date = knockout_matches[0].get("match_date")
                match_date_obj = _parse_match_date(match_date)
                if isinstance(latest_knockout_date, datetime) and match_date_obj:
                    if match_date_obj.date() < latest_knockout_date.date():
                        return send_error_response(
                            400,
                            "Final match date cannot be before all knockout matches. "
                            f"Latest knockout match date: {latest_knockout_date.date()}",
                        )

    final_error = await validate_final_match_requirement(
        sport_doc,
        derived_gender,
        teams or [],
        players or [],
        match_type,
        sports_name,
        event_year_doc.get("event_id"),
        token=request.state.token,
    )
    if final_error:
        return send_error_response(final_error["statusCode"], final_error["message"])

    all_final = await event_schedule_collection().find(
        {
            "sports_name": normalize_sport_name(sports_name),
            "event_id": event_year_doc.get("event_id"),
            "match_type": "final",
            "status": {"$in": ["scheduled", "completed"]},
        }
    ).to_list(length=None)
    for match in all_final:
        match_gender = await get_match_gender(match, sport_doc, token=request.state.token)
        if match_gender == derived_gender:
            return send_error_response(
                400,
                f"Cannot schedule new matches. A final match already exists for this sport and gender ({derived_gender}).",
            )

    match_date_obj = _parse_match_date(match_date)
    if not match_date_obj:
        return send_error_response(400, "Invalid match_date format")
    today = datetime.now().date()
    if match_date_obj.date() < today:
        return send_error_response(400, "Match date must be today or a future date")

    last_match = await event_schedule_collection().find_one(
        {
            "sports_name": normalize_sport_name(sports_name),
            "event_id": event_year_doc.get("event_id"),
        },
        sort=[("match_number", -1)],
    )
    match_number = (last_match.get("match_number") if last_match else 0) + 1

    match_data: Dict[str, Any] = {
        "event_id": event_year_doc.get("event_id"),
        "match_number": match_number,
        "match_type": match_type,
        "sports_name": normalize_sport_name(sports_name),
        "match_date": match_date_obj,
        "status": "scheduled",
        "createdBy": request.state.user.get("reg_number"),
        "updatedBy": None,
    }
    if sport_doc.get("type") in {"dual_team", "multi_team"}:
        match_data["teams"] = [team.strip() for team in teams]
        match_data["players"] = []
    else:
        match_data["players"] = [player.strip() for player in players]
        match_data["teams"] = []

    if not derived_gender:
        return send_error_response(
            500,
            "Internal error: Could not determine match gender. Please contact administrator.",
        )

    insert_result = await event_schedule_collection().insert_one(match_data)
    match_data["_id"] = insert_result.inserted_id

    try:
        clear_new_match_caches(sports_name, event_year_doc.get("event_id"), derived_gender, match_type)
    except Exception as exc:
        logger.error("Error clearing caches after match creation: %s", exc)

    return send_success_response(
        {"match": _serialize_match(match_data)}, f"Match #{match_number} scheduled successfully"
    )


@router.put("/event-schedule/{match_id}")
async def update_match(
    match_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_event_status_update_period),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)
    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    winner = body.get("winner")
    qualifiers = body.get("qualifiers")
    status = body.get("status")
    match_date = body.get("match_date")

    object_id = _parse_object_id(match_id)
    if not object_id:
        return handle_not_found_error("Match")
    match = await event_schedule_collection().find_one({"_id": object_id})
    if not match:
        return handle_not_found_error("Match")

    try:
        await require_admin_or_coordinator(
            request.state.user.get("reg_number"),
            match.get("sports_name"),
            match.get("event_id"),
            token=request.state.token,
        )
    except Exception as exc:
        return send_error_response(403, str(exc))

    event_year_data = await get_event_year(
        match.get("event_id"),
        return_doc=True,
        token=request.state.token,
    )
    event_year_doc = event_year_data.get("doc")

    try:
        sport_doc = await fetch_sport(
            match.get("sports_name"), event_id=match.get("event_id"), token=request.state.token
        )
    except Exception:
        return send_error_response(404, "Sport not found")

    previous_status = match.get("status")
    previous_winner = match.get("winner")
    update_data: Dict[str, Any] = {}

    if match_date is not None:
        if not is_match_date_within_event_range(match_date, event_year_doc):
            event_start = _parse_match_date(event_year_doc.get("event_dates", {}).get("start"))
            event_end = _parse_match_date(event_year_doc.get("event_dates", {}).get("end"))
            if event_start and event_end:
                date_label = f"{_format_date(event_start)} to {_format_date(event_end)}"
            else:
                date_label = f"{event_year_doc.get('event_dates', {}).get('start')} to {event_year_doc.get('event_dates', {}).get('end')}"
            return send_error_response(
                400,
                f"Match date must be within event date range ({date_label})",
            )
        parsed_date = _parse_match_date(match_date)
        if not parsed_date:
            return send_error_response(400, "Invalid match_date format")
        update_data["match_date"] = parsed_date

    if match_date is not None:
        match_date_obj = _parse_match_date(match_date)
    else:
        match_date_obj = match.get("match_date")
        if isinstance(match_date_obj, str):
            match_date_obj = _parse_match_date(match_date_obj)

    now = datetime.now().date()
    is_future_match = match_date_obj.date() > now if isinstance(match_date_obj, datetime) else False

    if status is not None:
        if is_future_match and status != "scheduled":
            return send_error_response(
                400, "Cannot update status for future matches. Please wait until the match date."
            )
        if status not in {"completed", "draw", "cancelled", "scheduled"}:
            return send_error_response(400, "Invalid status")
        if previous_status in {"completed", "draw", "cancelled"} and status != previous_status:
            return send_error_response(
                400,
                f'Cannot change status from "{previous_status}". Once a match is {previous_status}, the status cannot be changed.',
            )
        if status in {"completed", "draw", "cancelled"}:
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            event_start = _parse_match_date(event_year_doc.get("event_dates", {}).get("start"))
            event_end = _parse_match_date(event_year_doc.get("event_dates", {}).get("end"))
            if event_start:
                event_start = event_start.replace(hour=0, minute=0, second=0, microsecond=0)
            if event_end:
                event_end = event_end.replace(hour=23, minute=59, second=59, microsecond=999000)
            if not event_start or not event_end or not (event_start <= today <= event_end):
                if event_start and event_end:
                    date_label = f"{_format_date(event_start)} to {_format_date(event_end)}"
                else:
                    date_label = f"{event_year_doc.get('event_dates', {}).get('start')} to {event_year_doc.get('event_dates', {}).get('end')}"
                return send_error_response(
                    400,
                    f'Match status can only be set to "{status}" within event date range ({date_label})',
                )
        update_data["status"] = status
        if status != "completed":
            update_data["winner"] = None
            update_data["qualifiers"] = []

    if winner is not None and sport_doc.get("type") in {"dual_team", "dual_player"}:
        if is_future_match:
            return send_error_response(
                400, "Cannot declare winner for future matches. Please wait until the match date."
            )
        target_status = status or match.get("status")
        if target_status != "completed":
            return send_error_response(400, 'Winner can only be set when match status is "completed"')
        participants = match.get("teams") if sport_doc.get("type") == "dual_team" else match.get("players")
        trimmed_winner = (winner or "").strip()
        if not participants or not any((p or "").strip() == trimmed_winner for p in participants):
            return send_error_response(400, "Winner must be one of the participating teams/players")
        update_data["winner"] = trimmed_winner
        update_data["qualifiers"] = []
        if "status" not in update_data:
            update_data["status"] = "completed"

    if qualifiers is not None and sport_doc.get("type") in {"multi_team", "multi_player"}:
        if is_future_match:
            return send_error_response(
                400, "Cannot set qualifiers for future matches. Please wait until the match date."
            )
        target_status = status or match.get("status")
        if target_status != "completed":
            return send_error_response(
                400, 'Qualifiers can only be set when match status is "completed"'
            )
        if not isinstance(qualifiers, list) or len(qualifiers) == 0:
            return send_error_response(
                400, "Qualifiers array is required for multi_team and multi_player sports"
            )
        positions = sorted([q.get("position") for q in qualifiers])
        if len(set(positions)) != len(positions):
            return send_error_response(400, "Qualifier positions must be unique")
        for index, position in enumerate(positions):
            if position != index + 1:
                return send_error_response(
                    400, "Qualifier positions must be sequential (1, 2, 3, etc.)"
                )
        participants = match.get("teams") if sport_doc.get("type") == "multi_team" else match.get("players")
        participant_set = {p for p in participants or []}
        for qualifier in qualifiers:
            if qualifier.get("participant") not in participant_set:
                return send_error_response(
                    400,
                    f'Qualifier "{qualifier.get("participant")}" must be one of the match participants',
                )
        update_data["qualifiers"] = qualifiers
        update_data["winner"] = None
        if "status" not in update_data:
            update_data["status"] = "completed"

    update_data["updatedBy"] = request.state.user.get("reg_number")

    await event_schedule_collection().update_one({"_id": object_id}, {"$set": update_data})
    updated_match = await event_schedule_collection().find_one({"_id": object_id})
    if not updated_match:
        return handle_not_found_error("Match")

    if match.get("match_type") == "league":
        await update_points_table(
            updated_match,
            previous_status,
            previous_winner,
            request.state.user.get("reg_number"),
            token=request.state.token,
        )

    await clear_match_caches(updated_match, None, sport_doc)
    return send_success_response(
        {"match": _serialize_match(updated_match)}, "Match updated successfully"
    )


@router.delete("/event-schedule/{match_id}")
async def delete_match(
    match_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(require_event_period),
):
    object_id = _parse_object_id(match_id)
    if not object_id:
        return handle_not_found_error("Match")
    match = await event_schedule_collection().find_one({"_id": object_id})
    if not match:
        return handle_not_found_error("Match")

    try:
        await require_admin_or_coordinator(
            request.state.user.get("reg_number"),
            match.get("sports_name"),
            match.get("event_id"),
            token=request.state.token,
        )
    except Exception as exc:
        return send_error_response(403, str(exc))

    if match.get("status") != "scheduled":
        return send_error_response(
            400,
            f'Cannot delete match with status "{match.get("status")}". Only scheduled matches can be deleted.',
        )

    try:
        sport_doc = await fetch_sport(
            match.get("sports_name"), event_id=match.get("event_id"), token=request.state.token
        )
    except Exception:
        sport_doc = None

    await event_schedule_collection().delete_one({"_id": object_id})
    await clear_match_caches(match, None, sport_doc)
    return send_success_response({}, "Match deleted successfully")
