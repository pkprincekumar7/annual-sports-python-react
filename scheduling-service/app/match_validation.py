import logging
from typing import Any, Dict, List, Optional, Set

from .db import event_schedule_collection
from .gender_helpers import get_match_gender
from .sport_helpers import normalize_sport_name


logger = logging.getLogger("scheduling-service.match-validation")


async def get_knocked_out_participants(
    sports_name: str,
    event_id: str,
    gender: str,
    sport_doc: Dict[str, Any],
    token: str = "",
) -> Set[str]:
    if not sport_doc:
        logger.warning("get_knocked_out_participants: sport_doc is null for %s (%s)", sports_name, event_id)
        return set()

    query_filter = {
        "sports_name": normalize_sport_name(sports_name),
        "event_id": str(event_id).strip().lower(),
        "status": "completed",
    }
    all_completed = await event_schedule_collection().find(query_filter).to_list(length=None)

    completed_matches: List[Dict[str, Any]] = []
    for match in all_completed:
        try:
            match_gender = await get_match_gender(match, sport_doc, token=token)
            if match_gender == gender:
                completed_matches.append(match)
        except Exception as exc:
            logger.error("Error deriving gender for match %s: %s", match.get("_id"), exc)

    knocked_out: Set[str] = set()
    for match in completed_matches:
        if match.get("match_type") in {"knockout", "final"}:
            if sport_doc.get("type") in {"dual_team", "dual_player"}:
                winner = (match.get("winner") or "").strip()
                if match.get("teams"):
                    for team in match.get("teams") or []:
                        trimmed = (team or "").strip()
                        if trimmed and trimmed != winner:
                            knocked_out.add(trimmed)
                if match.get("players"):
                    for player in match.get("players") or []:
                        trimmed = (player or "").strip()
                        if trimmed and trimmed != winner:
                            knocked_out.add(trimmed)
            else:
                qualifiers = match.get("qualifiers") or []
                qualifier_set = {str(q.get("participant") or "").strip() for q in qualifiers}
                if match.get("teams"):
                    for team in match.get("teams") or []:
                        trimmed = (team or "").strip()
                        if trimmed and trimmed not in qualifier_set:
                            knocked_out.add(trimmed)
                elif match.get("players"):
                    for player in match.get("players") or []:
                        trimmed = (player or "").strip()
                        if trimmed and trimmed not in qualifier_set:
                            knocked_out.add(trimmed)
                if not qualifiers:
                    if match.get("teams"):
                        for team in match.get("teams") or []:
                            trimmed = (team or "").strip()
                            if trimmed:
                                knocked_out.add(trimmed)
                    elif match.get("players"):
                        for player in match.get("players") or []:
                            trimmed = (player or "").strip()
                            if trimmed:
                                knocked_out.add(trimmed)

    return knocked_out


async def get_participants_in_scheduled_matches(
    sports_name: str,
    event_id: str,
    gender: str,
    sport_doc: Dict[str, Any],
    token: str = "",
) -> Set[str]:
    if not sport_doc:
        logger.warning(
            "get_participants_in_scheduled_matches: sport_doc is null for %s (%s)",
            sports_name,
            event_id,
        )
        return set()

    query_filter = {
        "sports_name": normalize_sport_name(sports_name),
        "event_id": str(event_id).strip().lower(),
        "match_type": {"$in": ["knockout", "final"]},
        "status": "scheduled",
    }
    all_scheduled = await event_schedule_collection().find(query_filter).to_list(length=None)

    scheduled_matches: List[Dict[str, Any]] = []
    for match in all_scheduled:
        try:
            match_gender = await get_match_gender(match, sport_doc, token=token)
            if match_gender == gender:
                scheduled_matches.append(match)
        except Exception as exc:
            logger.error("Error deriving gender for scheduled match %s: %s", match.get("_id"), exc)

    participants: Set[str] = set()
    for match in scheduled_matches:
        for team in match.get("teams") or []:
            trimmed = (team or "").strip()
            if trimmed:
                participants.add(trimmed)
        for player in match.get("players") or []:
            trimmed = (player or "").strip()
            if trimmed:
                participants.add(trimmed)
    return participants


async def get_active_participants(
    sport_doc: Dict[str, Any],
    gender: str,
    knocked_out: Set[str],
    in_scheduled: Set[str],
    token: str = "",
) -> List[str]:
    active: List[str] = []
    if sport_doc.get("type") in {"dual_team", "multi_team"}:
        eligible_teams = [
            team
            for team in (sport_doc.get("teams_participated") or [])
            if (team.get("team_name") or "").strip()
            and team.get("team_name").strip() not in knocked_out
            and team.get("team_name").strip() not in in_scheduled
        ]
        team_first_players = []
        team_map: Dict[str, str] = {}
        for team in eligible_teams:
            if team.get("players"):
                reg_number = team.get("players")[0]
                team_first_players.append(reg_number)
                team_map[reg_number] = team.get("team_name")
        if team_first_players:
            from .external_services import fetch_players_by_reg_numbers

            players = await fetch_players_by_reg_numbers(team_first_players, event_id=sport_doc.get("event_id"), token=token)
            for player in players:
                if player.get("gender") == gender:
                    team_name = team_map.get(player.get("reg_number"))
                    if team_name:
                        active.append(team_name)
    else:
        player_reg_numbers = [
            reg
            for reg in (sport_doc.get("players_participated") or [])
            if (reg or "").strip() and reg.strip() not in knocked_out and reg.strip() not in in_scheduled
        ]
        if player_reg_numbers:
            from .external_services import fetch_players_by_reg_numbers

            players = await fetch_players_by_reg_numbers(
                player_reg_numbers, event_id=sport_doc.get("event_id"), token=token
            )
            active = [player.get("reg_number") for player in players if player.get("gender") == gender]
    return active


def validate_match_type_for_sport(match_type: str, sport_type: str) -> Optional[Dict[str, Any]]:
    if sport_type in {"multi_team", "multi_player"} and match_type == "league":
        return {
            "statusCode": 400,
            "message": 'match_type "league" is not allowed for multi_team and multi_player sports',
        }
    return None


async def validate_final_match_requirement(
    sport_doc: Dict[str, Any],
    derived_gender: str,
    teams: List[str],
    players: List[str],
    match_type: str,
    sports_name: str,
    event_id: str,
    token: str = "",
) -> Optional[Dict[str, Any]]:
    if sport_doc.get("type") not in {"dual_team", "dual_player"}:
        return None
    knocked_out = await get_knocked_out_participants(sports_name, event_id, derived_gender, sport_doc, token=token)
    in_scheduled = await get_participants_in_scheduled_matches(
        sports_name, event_id, derived_gender, sport_doc, token=token
    )
    active_participants = await get_active_participants(sport_doc, derived_gender, knocked_out, in_scheduled, token=token)
    participants_in_match = teams if sport_doc.get("type") == "dual_team" else players
    if len(active_participants) == 2 and len(participants_in_match) == 2:
        trimmed_active = [p.strip() for p in active_participants if p and p.strip()]
        trimmed_in_match = [p.strip() for p in participants_in_match if p and p.strip()]
        if all(p in trimmed_active for p in trimmed_in_match):
            if match_type != "final":
                return {
                    "statusCode": 400,
                    "message": (
                        f"Cannot schedule {match_type} match. Only 2 eligible participants remain for this gender. "
                        "This match must be a final match."
                    ),
                }
    return None


async def validate_all_matches_completed_before_final(
    sports_name: str,
    event_id: str,
    match_type: str,
    derived_gender: str,
    sport_doc: Dict[str, Any],
    token: str = "",
) -> Optional[Dict[str, Any]]:
    if match_type != "final":
        return None
    query_filter = {
        "sports_name": normalize_sport_name(sports_name),
        "event_id": str(event_id).strip().lower(),
        "match_type": {"$in": ["league", "knockout"]},
    }
    all_matches = await event_schedule_collection().find(query_filter).to_list(length=None)
    matches: List[Dict[str, Any]] = []
    for match in all_matches:
        try:
            match_gender = await get_match_gender(match, sport_doc, token=token)
            if match_gender == derived_gender:
                matches.append(match)
        except Exception as exc:
            logger.error("Error deriving gender for match %s: %s", match.get("_id"), exc)

    scheduled = [match for match in matches if match.get("status") == "scheduled"]
    if scheduled:
        match_types = list({match.get("match_type") for match in scheduled})
        match_type_label = match_types[0] if len(match_types) == 1 else "league or knockout"
        return {
            "statusCode": 400,
            "message": (
                f"Cannot schedule final match. There are {len(scheduled)} scheduled {match_type_label} match(es) "
                "that must be completed, drawn, or cancelled first. All matches must be finished before scheduling "
                "the final."
            ),
        }

    completed = [match for match in matches if match.get("status") == "completed"]
    incomplete: List[str] = []
    for match in completed:
        if sport_doc.get("type") in {"dual_team", "dual_player"}:
            if not (match.get("winner") or "").strip():
                incomplete.append(f"{match.get('match_type')} Match #{match.get('match_number')}")
        else:
            qualifiers = match.get("qualifiers") or []
            if not qualifiers:
                incomplete.append(f"{match.get('match_type')} Match #{match.get('match_number')}")
    if incomplete:
        return {
            "statusCode": 400,
            "message": (
                "Cannot schedule final match. The following completed match(es) are missing "
                f"{'winner' if sport_doc.get('type') in {'dual_team', 'dual_player'} else 'qualifiers'}: "
                f"{', '.join(incomplete)}. All completed matches must have "
                f"{'a winner declared' if sport_doc.get('type') in {'dual_team', 'dual_player'} else 'qualifiers declared'} "
                "before scheduling the final."
            ),
        }
    return None


async def validate_all_league_matches_completed_before_knockout(
    sports_name: str,
    event_id: str,
    match_type: str,
    derived_gender: str,
    sport_doc: Dict[str, Any],
    token: str = "",
) -> Optional[Dict[str, Any]]:
    if match_type != "knockout":
        return None
    query_filter = {
        "sports_name": normalize_sport_name(sports_name),
        "event_id": str(event_id).strip().lower(),
        "match_type": "league",
    }
    all_matches = await event_schedule_collection().find(query_filter).to_list(length=None)
    matches: List[Dict[str, Any]] = []
    for match in all_matches:
        try:
            match_gender = await get_match_gender(match, sport_doc, token=token)
            if match_gender == derived_gender:
                matches.append(match)
        except Exception as exc:
            logger.error("Error deriving gender for match %s: %s", match.get("_id"), exc)

    scheduled = [match for match in matches if match.get("status") == "scheduled"]
    if scheduled:
        return {
            "statusCode": 400,
            "message": (
                f"Cannot schedule knockout match. There are {len(scheduled)} scheduled league match(es) "
                "that must be completed, drawn, or cancelled first. All league matches must be finished before "
                "scheduling knockout matches."
            ),
        }

    completed = [match for match in matches if match.get("status") == "completed"]
    incomplete: List[str] = []
    for match in completed:
        if sport_doc.get("type") in {"dual_team", "dual_player"}:
            if not (match.get("winner") or "").strip():
                incomplete.append(f"Match #{match.get('match_number')}")
        else:
            qualifiers = match.get("qualifiers") or []
            if not qualifiers:
                incomplete.append(f"Match #{match.get('match_number')}")
    if incomplete:
        return {
            "statusCode": 400,
            "message": (
                "Cannot schedule knockout match. The following completed league match(es) are missing "
                f"{'winner' if sport_doc.get('type') in {'dual_team', 'dual_player'} else 'qualifiers'}: "
                f"{', '.join(incomplete)}. All completed league matches must have "
                f"{'a winner declared' if sport_doc.get('type') in {'dual_team', 'dual_player'} else 'qualifiers declared'} "
                "before scheduling knockout matches."
            ),
        }
    return None
