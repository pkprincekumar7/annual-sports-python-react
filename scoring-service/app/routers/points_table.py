import logging
from typing import Any, Dict, List
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, Request

from ..auth import auth_dependency
from ..cache import cache
from ..coordinator_helpers import require_admin_or_coordinator
from ..db import points_table_collection
from ..errors import send_error_response, send_success_response
from ..external_services import fetch_matches_for_sport, fetch_sport, get_event_year
from ..gender_helpers import get_match_gender, get_points_entry_gender
from ..points_table import backfill_points_table_for_sport, update_points_table_for_match
from ..sport_helpers import normalize_sport_name


logger = logging.getLogger("scoring-service.points-table")
router = APIRouter()


def _serialize_points_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(entry)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return data


@router.get("/points-table/{sport}")
async def get_points_table(
    sport: str,
    request: Request,
    _: None = Depends(auth_dependency),
):
    sport = unquote(sport or "")
    event_id_query = request.query_params.get("event_id")

    try:
        event_year_data = await get_event_year(
            event_id_query,
            return_doc=True,
            token=request.state.token,
        )
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return send_success_response(
                {"sport": sport, "points_table": [], "total_participants": 0}
            )
        raise

    event_id = event_year_data.get("doc", {}).get("event_id")
    gender = request.query_params.get("gender")
    if not gender or gender not in {"Male", "Female"}:
        return send_error_response(
            400, 'Gender parameter is required and must be "Male" or "Female"'
        )

    cache_key = f"/scorings/points-table/{sport}?event_id={quote(str(event_id))}&gender={gender}"
    cached = cache.get(cache_key)
    if cached:
        return send_success_response(cached)

    cursor = (
        points_table_collection()
        .find({"sports_name": normalize_sport_name(sport), "event_id": event_id})
        .sort([("points", -1), ("matches_won", -1)])
    )
    all_points_entries = await cursor.to_list(length=None)

    try:
        sport_doc = await fetch_sport(sport, event_id=event_id, token=request.state.token)
    except Exception:
        sport_doc = None

    if not all_points_entries:
        matches = await fetch_matches_for_sport(sport, event_id, token=request.state.token)
        completed_league_matches = [
            match
            for match in matches
            if match.get("match_type") == "league"
            and match.get("status") in {"completed", "draw", "cancelled"}
        ]
        league_matches_for_gender = 0
        for match in matches:
            if match.get("match_type") != "league":
                continue
            match_gender = await get_match_gender(match, sport_doc, token=request.state.token)
            if match_gender == gender:
                league_matches_for_gender += 1
        if completed_league_matches and league_matches_for_gender == 0:
            logger.warning(
                "No points table entries found for %s (%s, %s) but completed matches exist.",
                sport,
                event_id,
                gender,
            )
        elif league_matches_for_gender == 0:
            logger.info(
                "No league matches found for %s (%s, %s).",
                sport,
                event_id,
                gender,
            )

    points_entries: List[Dict[str, Any]] = []
    entries_with_null_gender: List[Dict[str, Any]] = []
    for entry in all_points_entries:
        entry_gender = await get_points_entry_gender(entry, sport_doc, token=request.state.token)
        if entry_gender == gender:
            points_entries.append(_serialize_points_entry(entry))
        elif entry_gender is None:
            entries_with_null_gender.append(
                {
                    "participant": entry.get("participant"),
                    "participant_type": entry.get("participant_type"),
                }
            )
    if entries_with_null_gender:
        logger.warning(
            "Could not derive gender for %s entries in %s (%s): %s",
            len(entries_with_null_gender),
            sport,
            event_id,
            entries_with_null_gender[:5],
        )

    has_league_matches = False
    if not points_entries:
        matches = await fetch_matches_for_sport(sport, event_id, token=request.state.token)
        for match in matches:
            if match.get("match_type") != "league":
                continue
            match_gender = await get_match_gender(match, sport_doc, token=request.state.token)
            if match_gender == gender:
                has_league_matches = True
                break

    result = {
        "sport": sport,
        "points_table": points_entries,
        "total_participants": len(points_entries),
        "has_league_matches": has_league_matches,
    }
    cache.set(cache_key, result)
    return send_success_response(result)


@router.post("/points-table/backfill/{sport}")
async def backfill_points_table(
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

    await require_admin_or_coordinator(
        request.state.user.get("reg_number"), sport, event_id, token=request.state.token
    )

    result = await backfill_points_table_for_sport(sport, event_id, token=request.state.token)
    if result.get("errors", 0) > 0 and result.get("processed", 0) == 0:
        return send_error_response(500, result.get("message", "Error backfilling points table"))

    cache.clear(f"/scorings/points-table/{sport}?event_id={quote(str(event_id))}&gender=Male")
    cache.clear(f"/scorings/points-table/{sport}?event_id={quote(str(event_id))}&gender=Female")
    return send_success_response(result, result.get("message") or "Points table backfilled successfully")


@router.post("/internal/points-table/update")
async def internal_points_table_update(
    request: Request,
    _: None = Depends(auth_dependency),
):
    body = await request.json()
    match = body.get("match")
    previous_status = body.get("previous_status")
    previous_winner = body.get("previous_winner")
    user_reg_number = body.get("user_reg_number")

    if not match or not previous_status:
        return send_error_response(400, "match and previous_status are required")

    await update_points_table_for_match(
        match,
        previous_status,
        previous_winner,
        user_reg_number,
        token=request.state.token,
    )
    return send_success_response({"updated": True})
