import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..auth import admin_dependency, auth_dependency, get_request_token
from ..cache import cache
from ..date_restrictions import require_registration_period
from ..db import sports_collection
from ..errors import send_error_response, send_success_response
from ..external_services import (
    get_event_year,
    get_matches_for_sport,
    get_points_table_entries,
)
from ..sport_helpers import (
    find_sport_by_name_and_id,
    is_team_sport_type,
    normalize_sport_name,
    validate_team_size,
)
from ..validators import trim_object_fields


logger = logging.getLogger("sports-participation.sports")
router = APIRouter()


def _serialize_sport(sport: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(sport)
    if "_id" in data:
        data["_id"] = str(data["_id"])
    return data


def _parse_object_id(value: str) -> Optional[ObjectId]:
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


@router.get("/sports")
async def get_sports(request: Request):
    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return JSONResponse(content=[])
        raise

    event_id = event_year_data.get("doc", {}).get("event_id")
    cache_key = f"/sports-participations/sports?event_id={quote(str(event_id))}"
    cached = cache.get(cache_key)
    if cached:
        return JSONResponse(content=cached)

    cursor = sports_collection().find({"event_id": event_id}).sort([("category", 1), ("name", 1)])
    sports = await cursor.to_list(length=None)
    serialized = [_serialize_sport(sport) for sport in sports]
    cache.set(cache_key, serialized)
    return JSONResponse(content=serialized)


@router.post("/sports")
async def create_sport(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)

    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    name = body.get("name")
    event_id = body.get("event_id")
    sport_type = body.get("type")
    category = body.get("category")
    team_size = body.get("team_size")
    image_uri = body.get("imageUri")
    token = get_request_token(request)

    if not name or not str(name).strip():
        return send_error_response(400, "Sport name is required")
    if not sport_type or sport_type not in {"dual_team", "multi_team", "dual_player", "multi_player"}:
        return send_error_response(400, "Valid sport type is required")
    if not category or category not in {
        "team events",
        "individual events",
        "literary and cultural activities",
    }:
        return send_error_response(400, "Valid category is required")
    if not event_id or not str(event_id).strip():
        return send_error_response(400, "event_id is required")

    event_year_data = await get_event_year(
        str(event_id).strip(), require_id=True, return_doc=True, token=token
    )
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    team_validation = validate_team_size(team_size, sport_type)
    if not team_validation["isValid"]:
        return send_error_response(400, team_validation["error"])

    normalized_name = normalize_sport_name(name)
    existing = await sports_collection().find_one(
        {"name": normalized_name, "event_id": resolved_event_id}
    )
    if existing:
        return send_error_response(
            409, "Sport with this name already exists for this event year"
        )

    sport_doc = {
        "name": normalized_name,
        "event_id": resolved_event_id,
        "type": sport_type,
        "category": category,
        "team_size": team_validation["value"] if is_team_sport_type(sport_type) else None,
        "imageUri": image_uri.strip() if isinstance(image_uri, str) and image_uri.strip() else None,
        "eligible_captains": [],
        "eligible_coordinators": [],
        "teams_participated": [],
        "players_participated": [],
        "createdBy": request.state.user.get("reg_number"),
        "updatedBy": None,
    }

    insert_result = await sports_collection().insert_one(sport_doc)
    sport_doc["_id"] = insert_result.inserted_id

    cache.clear_pattern("/sports-participations/sports")
    cache.clear_pattern("/sports-participations/sports-counts")

    return send_success_response(
        {"sport": _serialize_sport(sport_doc)},
        "Sport created successfully",
        status_code=201,
    )


@router.put("/sports/{sport_id}")
async def update_sport(
    sport_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)

    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    object_id = _parse_object_id(sport_id)
    if not object_id:
        return send_error_response(404, "Sport not found")

    sport_doc = await sports_collection().find_one({"_id": object_id})
    if not sport_doc:
        return send_error_response(404, "Sport not found")

    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        requested_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) == "Event year not found":
            return send_error_response(
                400,
                "Event year not found. Please ensure the event year parameter is valid.",
            )
        if str(exc) == "No active event year found":
            return send_error_response(
                400,
                "No active event year found. Please configure an active event year first.",
            )
        return send_error_response(400, str(exc) or "Failed to get event year")

    requested_event_id = requested_year_data.get("doc", {}).get("event_id")
    if sport_doc.get("event_id") != requested_event_id:
        return send_error_response(
            400,
            f"Cannot update sport. This sport belongs to event ID {sport_doc.get('event_id')}, but you are trying to update it for event ID {requested_event_id}. Please select the correct event to update this sport.",
        )

    if "event_id" in body and body.get("event_id") != sport_doc.get("event_id"):
        return send_error_response(
            400, "Cannot change event_id. Create a new sport for a different event."
        )

    if body.get("type"):
        if body.get("type") not in {"dual_team", "multi_team", "dual_player", "multi_player"}:
            return send_error_response(400, "Invalid sport type")
        sport_doc["type"] = body.get("type")

    if body.get("category"):
        if body.get("category") not in {
            "team events",
            "individual events",
            "literary and cultural activities",
        }:
            return send_error_response(400, "Invalid category")
        sport_doc["category"] = body.get("category")

    final_type = body.get("type") or sport_doc.get("type")
    team_validation = validate_team_size(
        body.get("team_size") if "team_size" in body else sport_doc.get("team_size"),
        final_type,
    )

    if "team_size" in body:
        if not team_validation["isValid"]:
            return send_error_response(400, team_validation["error"])
        sport_doc["team_size"] = team_validation["value"]
    elif is_team_sport_type(final_type) and not sport_doc.get("team_size"):
        return send_error_response(
            400, "team_size is required for team sports (dual_team and multi_team)"
        )

    if "imageUri" in body:
        image_uri = body.get("imageUri")
        sport_doc["imageUri"] = (
            image_uri.strip() if isinstance(image_uri, str) and image_uri.strip() else None
        )

    sport_doc["updatedBy"] = request.state.user.get("reg_number")

    update_doc = {key: value for key, value in sport_doc.items() if key != "_id"}
    await sports_collection().update_one({"_id": object_id}, {"$set": update_doc})
    updated = await sports_collection().find_one({"_id": object_id})

    cache.clear_pattern("/sports-participations/sports")
    cache.clear_pattern("/sports-participations/sports-counts")

    return send_success_response(
        {"sport": _serialize_sport(updated)},
        "Sport updated successfully",
    )


@router.delete("/sports/{sport_id}")
async def delete_sport(
    sport_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
):
    object_id = _parse_object_id(sport_id)
    if not object_id:
        return send_error_response(404, "Sport not found")

    sport_doc = await sports_collection().find_one({"_id": object_id})
    if not sport_doc:
        return send_error_response(404, "Sport not found")

    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        requested_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) == "Event year not found":
            return send_error_response(
                400,
                "Event year not found. Please ensure the event year parameter is valid.",
            )
        if str(exc) == "No active event year found":
            return send_error_response(
                400,
                "No active event year found. Please configure an active event year first.",
            )
        return send_error_response(400, str(exc) or "Failed to get event year")

    requested_event_id = requested_year_data.get("doc", {}).get("event_id")
    if sport_doc.get("event_id") != requested_event_id:
        return send_error_response(
            400,
            f"Cannot delete sport. This sport belongs to event ID {sport_doc.get('event_id')}, but you are trying to delete it for event ID {requested_event_id}. Please select the correct event to delete this sport.",
        )

    teams_count = len(sport_doc.get("teams_participated") or [])
    players_count = len(sport_doc.get("players_participated") or [])
    matches = await get_matches_for_sport(
        sport_doc.get("name"),
        sport_doc.get("event_id"),
        token=request.state.token,
    )
    schedules_count = len(matches)
    points_entries = await get_points_table_entries(
        sport_doc.get("name"),
        sport_doc.get("event_id"),
        token=request.state.token,
    )
    points_count = len(points_entries)

    participation_errors: List[str] = []
    if teams_count > 0:
        participation_errors.append(f"{teams_count} team(s)")
    if players_count > 0:
        participation_errors.append(f"{players_count} player(s)")
    if schedules_count > 0:
        participation_errors.append(f"{schedules_count} match(es)")
    if points_count > 0:
        participation_errors.append(f"{points_count} points entry/entries")

    if participation_errors:
        return send_error_response(
            400,
            f"Cannot delete sport. {', '.join(participation_errors)} "
            f"{'has' if len(participation_errors) == 1 else 'have'} participated. Please remove all participation before deleting.",
        )

    await sports_collection().delete_one({"_id": object_id})

    cache.clear_pattern("/sports-participations/sports")
    cache.clear_pattern("/sports-participations/sports-counts")

    return send_success_response({}, "Sport deleted successfully")


@router.get("/sports-counts")
async def get_sports_counts(
    request: Request,
    _: None = Depends(auth_dependency),
):
    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return JSONResponse(content={"teams_counts": [], "participants_counts": []})
        raise

    event_id = event_year_data.get("doc", {}).get("event_id")
    cache_key = f"/sports-participations/sports-counts?event_id={quote(str(event_id))}"
    cached = cache.get(cache_key)
    if cached:
        return JSONResponse(content=cached)

    sports = await sports_collection().find({"event_id": event_id}).to_list(length=None)
    teams_counts: Dict[str, int] = {}
    participants_counts: Dict[str, int] = {}
    for sport in sports:
        if sport.get("type") in {"dual_team", "multi_team"}:
            teams_counts[sport.get("name")] = len(sport.get("teams_participated") or [])
        else:
            participants_counts[sport.get("name")] = len(
                sport.get("players_participated") or []
            )

    result = {"teams_counts": teams_counts, "participants_counts": participants_counts}
    cache.set(cache_key, result)
    return JSONResponse(content=result)


@router.get("/sports/{name}")
async def get_sport_by_name(name: str, request: Request):
    if name == "sports-counts":
        return send_error_response(404, "Route not found")
    if not name or not str(name).strip():
        return send_error_response(404, "Route not found")

    event_id_query = request.query_params.get("event_id")
    try:
        token = get_request_token(request)
        event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return send_error_response(400, str(exc))
        raise

    event_id = event_year_data.get("doc", {}).get("event_id")

    try:
        sport = await find_sport_by_name_and_id(name, event_id)
    except Exception as exc:
        if "not found" in str(exc):
            return send_error_response(404, str(exc))
        raise

    return JSONResponse(content=_serialize_sport(sport))
