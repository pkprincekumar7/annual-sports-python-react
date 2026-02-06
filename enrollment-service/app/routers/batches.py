import logging
from typing import Any, Dict, List
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request

from ..auth import admin_dependency, auth_dependency
from ..cache import cache
from ..date_restrictions import require_registration_period
from ..db import batches_collection
from ..errors import handle_not_found_error, send_error_response, send_success_response
from ..external_services import get_event_year
from ..validators import trim_object_fields, validate_batch_assignment


logger = logging.getLogger("enrollment-service.batches")
router = APIRouter()


def _get_request_token(request: Request) -> str:
    auth_header = request.headers.get("authorization") or ""
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return ""


def _serialize_batch(batch: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "_id": str(batch.get("_id")) if batch.get("_id") else None,
        "name": batch.get("name"),
        "event_id": batch.get("event_id"),
        "players": batch.get("players") or [],
    }


def _validate_batch_player_assignment(body: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not body.get("name") or not str(body.get("name")).strip():
        errors.append("Batch name is required")
    if not body.get("event_id") or not str(body.get("event_id")).strip():
        errors.append("Event ID is required")
    if not body.get("reg_number") or not str(body.get("reg_number")).strip():
        errors.append("Registration number is required")
    return errors


def _validate_bulk_batch_unassign(body: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not body.get("event_id") or not str(body.get("event_id")).strip():
        errors.append("Event ID is required")
    reg_numbers = body.get("reg_numbers")
    if not isinstance(reg_numbers, list) or len(reg_numbers) == 0:
        errors.append("reg_numbers must be a non-empty array")
    return errors


@router.post("/add-batch")
async def add_batch(
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

    is_valid, errors = validate_batch_assignment(body)
    if not is_valid:
        return send_error_response(400, "; ".join(errors))

    token = _get_request_token(request)
    name = body.get("name")
    event_id = body.get("event_id")

    event_year_data = await get_event_year(
        str(event_id).strip(),
        require_id=True,
        return_doc=True,
        token=token,
    )
    event_doc = event_year_data.get("doc", {})
    resolved_event_id = event_doc.get("event_id")
    event_year = event_doc.get("event_year")
    event_name = event_doc.get("event_name")

    existing = await batches_collection().find_one(
        {"name": str(name).strip(), "event_id": resolved_event_id}
    )
    if existing:
        return send_error_response(
            409,
            f'Batch "{name}" already exists for event year {event_year} ({event_name})',
        )

    normalized_name = str(name).strip()
    batch_doc = {
        "name": normalized_name,
        "event_id": str(resolved_event_id).strip().lower(),
        "players": [],
        "createdBy": request.state.user.get("reg_number"),
        "updatedBy": None,
    }

    insert_result = await batches_collection().insert_one(batch_doc)
    batch_doc["_id"] = insert_result.inserted_id

    cache_key = f"/enrollments/batches?event_id={quote(str(resolved_event_id))}"
    cache.clear(cache_key)

    return send_success_response(
        {"batch": _serialize_batch(batch_doc)},
        f'Batch "{name}" created successfully',
    )


@router.delete("/remove-batch")
async def remove_batch(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
    ___: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    is_valid, errors = validate_batch_assignment(body)
    if not is_valid:
        return send_error_response(400, "; ".join(errors))

    token = _get_request_token(request)
    name = body.get("name")
    event_id = body.get("event_id")

    event_year_data = await get_event_year(
        str(event_id).strip(),
        require_id=True,
        return_doc=True,
        token=token,
    )
    event_doc = event_year_data.get("doc", {})
    resolved_event_id = event_doc.get("event_id")

    batch = await batches_collection().find_one(
        {"name": str(name).strip(), "event_id": resolved_event_id}
    )
    if not batch:
        return handle_not_found_error("Batch")

    players = batch.get("players") or []
    if len(players) > 0:
        return send_error_response(
            400,
            f'Cannot delete batch "{name}" because it has {len(players)} player(s) assigned. Please remove all players from the batch before deleting it.',
        )

    await batches_collection().delete_one({"name": str(name).strip(), "event_id": resolved_event_id})

    cache_key = f"/enrollments/batches?event_id={quote(str(resolved_event_id))}"
    cache.clear(cache_key)
    cache.clear_pattern("/identities/players")

    return send_success_response({}, f'Batch "{name}" deleted successfully')


@router.get("/batches")
async def get_batches(request: Request):
    event_id_query = request.query_params.get("event_id")

    try:
        token = _get_request_token(request)
        event_year_data = await get_event_year(event_id_query, return_doc=True, token=token)
    except Exception as exc:
        if str(exc) in {"Event year not found", "No active event year found"}:
            return send_success_response({"batches": []})
        raise

    event_doc = event_year_data.get("doc", {})
    resolved_event_id = event_doc.get("event_id")

    cache_key = f"/enrollments/batches?event_id={quote(str(resolved_event_id))}"
    cached = cache.get(cache_key)
    if cached:
        return send_success_response(cached)

    cursor = batches_collection().find({"event_id": resolved_event_id}).sort("name", 1)
    batches = await cursor.to_list(length=None)

    batches_list: List[Dict[str, Any]] = [_serialize_batch(batch) for batch in batches]
    result = {"batches": batches_list}
    cache.set(cache_key, result)
    return send_success_response(result)


@router.post("/batches/assign-player")
async def assign_player_to_batch(
    request: Request,
    _: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    errors = _validate_batch_player_assignment(body)
    if errors:
        return send_error_response(400, "; ".join(errors))

    token = _get_request_token(request)
    name = body.get("name")
    event_id = body.get("event_id")
    reg_number = body.get("reg_number")

    event_year_data = await get_event_year(
        str(event_id).strip(),
        require_id=True,
        return_doc=True,
        token=token,
    )
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    batch = await batches_collection().find_one(
        {"name": str(name).strip(), "event_id": resolved_event_id}
    )
    if not batch:
        return handle_not_found_error("Batch")

    await batches_collection().update_one(
        {"_id": batch.get("_id")},
        {"$addToSet": {"players": reg_number}},
    )

    cache_key = f"/enrollments/batches?event_id={quote(str(resolved_event_id))}"
    cache.clear(cache_key)

    return send_success_response(
        {"batch": _serialize_batch({**batch, "players": list(set((batch.get("players") or []) + [reg_number]))})},
        f'Player "{reg_number}" assigned to batch "{name}"',
    )


@router.post("/batches/unassign-player")
async def unassign_player_from_batch(
    request: Request,
    _: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    errors = _validate_batch_player_assignment(body)
    if errors:
        return send_error_response(400, "; ".join(errors))

    token = _get_request_token(request)
    name = body.get("name")
    event_id = body.get("event_id")
    reg_number = body.get("reg_number")

    event_year_data = await get_event_year(
        str(event_id).strip(),
        require_id=True,
        return_doc=True,
        token=token,
    )
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    batch = await batches_collection().find_one(
        {"name": str(name).strip(), "event_id": resolved_event_id}
    )
    if not batch:
        return handle_not_found_error("Batch")

    await batches_collection().update_one(
        {"_id": batch.get("_id")},
        {"$pull": {"players": reg_number}},
    )

    cache_key = f"/enrollments/batches?event_id={quote(str(resolved_event_id))}"
    cache.clear(cache_key)

    updated_players = [player for player in (batch.get("players") or []) if player != reg_number]
    return send_success_response(
        {"batch": _serialize_batch({**batch, "players": updated_players})},
        f'Player "{reg_number}" removed from batch "{name}"',
    )


@router.post("/batches/unassign-players")
async def unassign_players_from_batches(
    request: Request,
    _: None = Depends(require_registration_period),
):
    body = trim_object_fields(await request.json())
    errors = _validate_bulk_batch_unassign(body)
    if errors:
        return send_error_response(400, "; ".join(errors))

    token = _get_request_token(request)
    event_id = body.get("event_id")
    reg_numbers = body.get("reg_numbers") or []

    event_year_data = await get_event_year(
        str(event_id).strip(),
        require_id=True,
        return_doc=True,
        token=token,
    )
    resolved_event_id = event_year_data.get("doc", {}).get("event_id")

    await batches_collection().update_many(
        {"event_id": resolved_event_id, "players": {"$in": reg_numbers}},
        {"$pull": {"players": {"$in": reg_numbers}}},
    )

    cache_key = f"/enrollments/batches?event_id={quote(str(resolved_event_id))}"
    cache.clear(cache_key)

    return send_success_response(
        {"removed": len(reg_numbers)}, "Players removed from batches successfully"
    )
