from typing import Any, Dict, List, Optional

from .db import points_table_collection
from .external_services import fetch_matches_for_sport, fetch_sport
from .gender_helpers import get_match_gender
from .sport_helpers import normalize_sport_name


async def recalculate_points_table_for_gender(
    sport_name: str,
    event_id: str,
    gender: str,
    token: str = "",
) -> None:
    sport_doc = await fetch_sport(sport_name, event_id=event_id, token=token)
    if not sport_doc or sport_doc.get("type") not in {"dual_team", "dual_player"}:
        return

    normalized_sport = normalize_sport_name(sport_name)
    participant_type = "team" if sport_doc.get("type") == "dual_team" else "player"

    all_matches = await fetch_matches_for_sport(sport_name, event_id, token=token)
    league_matches: List[Dict[str, Any]] = []
    for match in all_matches:
        if match.get("match_type") != "league":
            continue
        if match.get("status") not in {"completed", "draw", "cancelled"}:
            continue
        match_gender = await get_match_gender(match, sport_doc, token=token)
        if match_gender == gender:
            league_matches.append(match)

    participants_set = set()
    for match in league_matches:
        participants = match.get("teams") if participant_type == "team" else match.get("players")
        for participant in participants or []:
            trimmed = (participant or "").strip()
            if trimmed:
                participants_set.add(trimmed)

    points_map: Dict[str, Dict[str, int]] = {}
    for participant in participants_set:
        points_map[participant] = {
            "points": 0,
            "matches_played": 0,
            "matches_won": 0,
            "matches_lost": 0,
            "matches_draw": 0,
            "matches_cancelled": 0,
        }

    for match in league_matches:
        participants = match.get("teams") if participant_type == "team" else match.get("players")
        if not participants:
            continue
        trimmed_winner = match.get("winner")
        trimmed_winner = trimmed_winner.strip() if trimmed_winner else None
        for participant in participants:
            trimmed_participant = (participant or "").strip()
            if not trimmed_participant:
                continue
            entry = points_map.get(trimmed_participant)
            if not entry:
                continue
            entry["matches_played"] += 1
            if match.get("status") == "completed" and trimmed_winner:
                if trimmed_winner == trimmed_participant:
                    entry["points"] += 2
                    entry["matches_won"] += 1
                else:
                    entry["matches_lost"] += 1
            elif match.get("status") == "draw":
                entry["points"] += 1
                entry["matches_draw"] += 1
            elif match.get("status") == "cancelled":
                entry["points"] += 1
                entry["matches_cancelled"] += 1

    for participant, stats in points_map.items():
        existing = await points_table_collection().find_one(
            {"event_id": event_id, "sports_name": normalized_sport, "participant": participant}
        )
        update_doc = {
            "event_id": event_id,
            "sports_name": normalized_sport,
            "participant": participant,
            "participant_type": participant_type,
            "points": stats["points"],
            "matches_played": stats["matches_played"],
            "matches_won": stats["matches_won"],
            "matches_lost": stats["matches_lost"],
            "matches_draw": stats["matches_draw"],
            "matches_cancelled": stats["matches_cancelled"],
        }
        if existing:
            update_doc["updatedBy"] = existing.get("updatedBy")
        await points_table_collection().update_one(
            {"event_id": event_id, "sports_name": normalized_sport, "participant": participant},
            {"$set": update_doc},
            upsert=True,
        )


async def backfill_points_table_for_sport(
    sport_name: str,
    event_id: str,
    token: str = "",
) -> Dict[str, Any]:
    try:
        sport_doc = await fetch_sport(sport_name, event_id=event_id, token=token)
        if not sport_doc or sport_doc.get("type") not in {"dual_team", "dual_player"}:
            return {
                "processed": 0,
                "created": 0,
                "errors": 0,
                "message": "Sport not found or not applicable for points table (must be dual_team or dual_player)",
            }
        errors = 0
        created = 0
        try:
            await recalculate_points_table_for_gender(sport_name, event_id, "Male", token=token)
            created += 1
        except Exception:
            errors += 1
        try:
            await recalculate_points_table_for_gender(sport_name, event_id, "Female", token=token)
            created += 1
        except Exception:
            errors += 1

        matches = await fetch_matches_for_sport(sport_name, event_id, token=token)
        completed_matches = [
            match
            for match in matches
            if match.get("match_type") == "league"
            and match.get("status") in {"completed", "draw", "cancelled"}
        ]
        processed = len(completed_matches)
        return {
            "processed": processed,
            "created": created * 2,
            "errors": errors,
            "message": f"Recalculated points table for {processed} matches (both genders), {errors} errors",
        }
    except Exception as exc:
        return {
            "processed": 0,
            "created": 0,
            "errors": 1,
            "message": f"Error: {str(exc)}",
        }


async def update_points_table_for_match(
    match: Dict[str, Any],
    previous_status: str,
    previous_winner: Optional[str],
    user_reg_number: Optional[str],
    token: str = "",
) -> None:
    if match.get("match_type") != "league":
        return

    sport_doc = await fetch_sport(match.get("sports_name"), event_id=match.get("event_id"), token=token)
    if not sport_doc or sport_doc.get("type") not in {"dual_team", "dual_player"}:
        return

    participant_type = "team" if sport_doc.get("type") == "dual_team" else "player"
    participants = match.get("teams") if participant_type == "team" else match.get("players")
    if not participants:
        return

    normalized_sport = normalize_sport_name(match.get("sports_name"))
    event_id = match.get("event_id")
    trimmed_previous_winner = previous_winner.strip() if previous_winner else None
    trimmed_winner = match.get("winner").strip() if match.get("winner") else None

    for participant in participants:
        trimmed_participant = (participant or "").strip()
        if not trimmed_participant:
            continue

        existing = await points_table_collection().find_one(
            {
                "event_id": event_id,
                "sports_name": normalized_sport,
                "participant": trimmed_participant,
            }
        )
        if not existing:
            existing = {
                "event_id": event_id,
                "sports_name": normalized_sport,
                "participant": trimmed_participant,
                "participant_type": participant_type,
                "points": 0,
                "matches_played": 0,
                "matches_won": 0,
                "matches_lost": 0,
                "matches_draw": 0,
                "matches_cancelled": 0,
                "createdBy": user_reg_number,
                "updatedBy": None,
            }
        else:
            if user_reg_number:
                existing["updatedBy"] = user_reg_number

        if previous_status == "completed" and trimmed_previous_winner:
            if trimmed_previous_winner == trimmed_participant:
                existing["points"] = max(0, existing["points"] - 2)
                existing["matches_won"] = max(0, existing["matches_won"] - 1)
            else:
                existing["matches_lost"] = max(0, existing["matches_lost"] - 1)
            existing["matches_played"] = max(0, existing["matches_played"] - 1)
        elif previous_status == "draw":
            existing["points"] = max(0, existing["points"] - 1)
            existing["matches_draw"] = max(0, existing["matches_draw"] - 1)
            existing["matches_played"] = max(0, existing["matches_played"] - 1)
        elif previous_status == "cancelled":
            existing["points"] = max(0, existing["points"] - 1)
            existing["matches_cancelled"] = max(0, existing["matches_cancelled"] - 1)
            existing["matches_played"] = max(0, existing["matches_played"] - 1)

        if match.get("status") == "completed" and trimmed_winner:
            if trimmed_winner == trimmed_participant:
                existing["points"] += 2
                existing["matches_won"] += 1
            else:
                existing["matches_lost"] += 1
            existing["matches_played"] += 1
        elif match.get("status") == "draw":
            existing["points"] += 1
            existing["matches_draw"] += 1
            existing["matches_played"] += 1
        elif match.get("status") == "cancelled":
            existing["points"] += 1
            existing["matches_cancelled"] += 1
            existing["matches_played"] += 1

        update_doc = {key: value for key, value in existing.items() if key != "_id"}
        await points_table_collection().update_one(
            {
                "event_id": event_id,
                "sports_name": normalized_sport,
                "participant": trimmed_participant,
            },
            {"$set": update_doc},
            upsert=True,
        )
