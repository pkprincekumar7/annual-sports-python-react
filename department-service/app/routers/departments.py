import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, Request

from ..auth import admin_dependency, auth_dependency
from ..cache import cache
from ..db import departments_collection
from ..errors import handle_not_found_error, send_error_response, send_success_response
from ..external_services import fetch_players
from ..validators import normalize_department_code, normalize_department_name, trim_object_fields


logger = logging.getLogger("department-service.departments")
router = APIRouter()


def _parse_object_id(value: str) -> Optional[ObjectId]:
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def _serialize_datetime(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _serialize_department(department: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "_id": str(department.get("_id")) if department.get("_id") else None,
        "name": department.get("name"),
        "code": department.get("code", ""),
        "display_order": department.get("display_order", 0),
        "createdBy": department.get("createdBy"),
        "updatedBy": department.get("updatedBy"),
        "createdAt": _serialize_datetime(department.get("createdAt")),
        "updatedAt": _serialize_datetime(department.get("updatedAt")),
    }


def _count_players_by_department(players: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for player in players:
        department = player.get("department_branch")
        if not department:
            continue
        counts[department] = counts.get(department, 0) + 1
    return counts


def _get_request_token(request: Request) -> str:
    auth_header = request.headers.get("authorization") or ""
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return ""


@router.get("")
@router.get("/")
async def get_departments(request: Request):
    cached = cache.get("/departments")
    if cached:
        return send_success_response(cached)

    cursor = departments_collection().find({}).sort([("display_order", 1), ("name", 1)])
    departments = await cursor.to_list(length=None)

    token = _get_request_token(request)
    if token:
        try:
            players = await fetch_players(token=token)
        except Exception as exc:
            logger.exception("Failed to fetch players for department counts: %s", exc)
            return send_error_response(
                500,
                "Failed to fetch department player counts. Please try again.",
            )
        counts = _count_players_by_department(players)
    else:
        counts = {}

    departments_with_counts = []
    for department in departments:
        serialized = _serialize_department(department)
        serialized["player_count"] = counts.get(serialized.get("name"), 0)
        departments_with_counts.append(serialized)

    result = {"departments": departments_with_counts}
    cache.set("/departments", result)
    return send_success_response(result)


@router.post("")
@router.post("/")
async def create_department(
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
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
    if not name or not str(name).strip():
        return send_error_response(400, "Department name is required")

    normalized_name = normalize_department_name(name)
    existing = await departments_collection().find_one({"name": normalized_name})
    if existing:
        return send_error_response(409, "Department with this name already exists")

    code = normalize_department_code(body.get("code") or "") if body.get("code") is not None else ""
    display_order = body.get("display_order") if body.get("display_order") is not None else 0

    department_doc = {
        "name": normalized_name,
        "code": code,
        "display_order": display_order,
        "createdBy": request.state.user.get("reg_number"),
        "updatedBy": None,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }

    insert_result = await departments_collection().insert_one(department_doc)
    department_doc["_id"] = insert_result.inserted_id

    cache.clear("/departments")

    return send_success_response(
        _serialize_department(department_doc),
        "Department created successfully",
        status_code=201,
    )


@router.put("/{department_id}")
async def update_department(
    department_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    body = trim_object_fields(await request.json())
    created_by = body.pop("createdBy", None)
    updated_by = body.pop("updatedBy", None)

    if created_by is not None or updated_by is not None:
        return send_error_response(
            400,
            "createdBy and updatedBy fields cannot be set by user. They are automatically set from authentication token.",
        )

    if "name" in body or "code" in body:
        return send_error_response(
            400,
            "Department name and code cannot be modified. Only display_order can be updated.",
        )

    object_id = _parse_object_id(department_id)
    if not object_id:
        return handle_not_found_error("Department")

    department = await departments_collection().find_one({"_id": object_id})
    if not department:
        return handle_not_found_error("Department")

    update_fields: Dict[str, Any] = {
        "updatedBy": request.state.user.get("reg_number"),
        "updatedAt": datetime.now(timezone.utc),
    }
    if "display_order" in body:
        update_fields["display_order"] = body.get("display_order")

    await departments_collection().update_one({"_id": object_id}, {"$set": update_fields})
    updated = await departments_collection().find_one({"_id": object_id})

    cache.clear("/departments")

    return send_success_response(
        _serialize_department(updated),
        "Department updated successfully",
    )


@router.delete("/{department_id}")
async def delete_department(
    department_id: str,
    request: Request,
    _: None = Depends(auth_dependency),
    __: None = Depends(admin_dependency),
):
    object_id = _parse_object_id(department_id)
    if not object_id:
        return handle_not_found_error("Department")

    department = await departments_collection().find_one({"_id": object_id})
    if not department:
        return handle_not_found_error("Department")

    try:
        token = _get_request_token(request)
        players = await fetch_players(token=token)
    except Exception as exc:
        logger.exception("Failed to fetch players for department delete: %s", exc)
        return send_error_response(500, "Failed to fetch department player counts. Please try again.")

    counts = _count_players_by_department(players)
    players_count = counts.get(department.get("name"), 0)
    if players_count > 0:
        return send_error_response(
            400,
            f"Cannot delete department. {players_count} player(s) are registered with this department.",
        )

    await departments_collection().delete_one({"_id": object_id})

    cache.clear("/departments")

    return send_success_response({}, "Department deleted successfully")
