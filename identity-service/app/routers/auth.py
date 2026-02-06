import logging
import re
import random
import string
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request

from ..auth import auth_dependency, create_access_token, get_request_token
from ..cache import cache
from ..config import get_settings
from ..db import players_collection
from ..email_service import send_password_reset_email
from ..errors import send_error_response, send_success_response
from ..external_services import get_active_event_year, get_event_year, get_batches, get_sports
from ..player_utils import compute_player_participation, serialize_player
from ..validators import trim_object_fields


logger = logging.getLogger("identity-service.auth-routes")
router = APIRouter()
settings = get_settings()


async def _get_player_batch_name(reg_number: str, event_id: str, token: str) -> Any:
    try:
        batches = await get_batches(event_id, token=token)
        for batch in batches:
            if reg_number in (batch.get("players") or []):
                return batch.get("name")
    except Exception:
        return None
    return None


@router.post("/login")
async def login(request: Request):
    body = trim_object_fields(await request.json())
    reg_number = body.get("reg_number")
    password = body.get("password")

    if not reg_number or not password:
        return send_error_response(400, "Registration number and password are required")

    player = await players_collection().find_one({"reg_number": reg_number})
    if not player:
        return send_error_response(401, "Invalid registration number or password")

    if player.get("password") != password:
        return send_error_response(401, "Invalid registration number or password")

    event_id = None
    cached_active = cache.get("/event-configurations/event-years/active")
    if cached_active:
        event_id = cached_active.get("event_id")
    else:
        active_year = await get_active_event_year()
        if active_year:
            event_id = active_year.get("event_id")
            cache.set("/event-configurations/event-years/active", active_year)

    participation = {"participated_in": [], "captain_in": [], "coordinator_in": []}
    request_token = get_request_token(request)
    if event_id:
        try:
            sports = await get_sports(event_id, token=request_token)
            participation = compute_player_participation(reg_number, sports)
        except Exception as exc:
            if "No active event year found" in str(exc):
                participation = {"participated_in": [], "captain_in": [], "coordinator_in": []}
            else:
                raise

    token_payload = {
        "reg_number": player.get("reg_number"),
        "full_name": player.get("full_name"),
        "isAdmin": player.get("reg_number") == settings.admin_reg_number,
    }
    token = create_access_token(token_payload)

    player_data = serialize_player(player)
    player_data.update(participation)
    if event_id:
        batch_name = await _get_player_batch_name(
            player_data.get("reg_number"),
            event_id,
            request_token,
        )
        player_data["batch_name"] = batch_name
    else:
        player_data["batch_name"] = None

    return send_success_response(
        {
            "player": player_data,
            "token": token,
            "change_password_required": player.get("change_password_required") or False,
        },
        "Login successful",
    )


@router.post("/change-password")
async def change_password(request: Request, _: None = Depends(auth_dependency)):
    body = await request.json()
    current_password = body.get("current_password")
    new_password = body.get("new_password")
    user = getattr(request.state, "user", {})
    reg_number = user.get("reg_number")

    if not reg_number:
        return send_error_response(401, "Authentication required")

    if not current_password or not new_password:
        return send_error_response(400, "Current password and new password are required")

    trimmed_current = str(current_password).strip()
    trimmed_new = str(new_password).strip()
    if not trimmed_new:
        return send_error_response(400, "New password cannot be empty")

    player = await players_collection().find_one({"reg_number": reg_number})
    if not player:
        return send_error_response(404, "Player not found")

    if player.get("password") != trimmed_current:
        return send_error_response(401, "Current password is incorrect")

    if player.get("password") == trimmed_new:
        return send_error_response(400, "New password must be different from current password")

    await players_collection().update_one(
        {"reg_number": reg_number},
        {"$set": {"password": trimmed_new, "change_password_required": False}},
    )

    return send_success_response({}, "Password changed successfully")


@router.post("/reset-password")
async def reset_password(request: Request):
    body = await request.json()
    reg_number = body.get("reg_number")
    email_id = body.get("email_id")

    if not reg_number or not str(reg_number).strip():
        return send_error_response(400, "Registration number is required")
    if not email_id or not str(email_id).strip():
        return send_error_response(400, "Email ID is required")

    trimmed_reg = str(reg_number).strip()
    trimmed_email = str(email_id).strip()
    email_regex = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    if not email_regex.match(trimmed_email):
        return send_error_response(400, "Invalid email format")

    player = await players_collection().find_one({"reg_number": trimmed_reg, "email_id": trimmed_email})
    if not player:
        return send_success_response(
            {}, "If the registration number and email match, a new password has been sent"
        )

    new_password = "".join(random.choice(string.ascii_letters + string.digits) for _ in range(8))
    email_result: Dict[str, Any] = await send_password_reset_email(
        trimmed_email,
        new_password,
        player.get("full_name") or "User",
    )

    if not email_result.get("success"):
        logger.error(
            "Failed to send password reset email to %s: %s",
            trimmed_email,
            email_result.get("error"),
        )
        return send_success_response(
            {}, "If the registration number and email match, a new password has been sent"
        )

    await players_collection().update_one(
        {"reg_number": trimmed_reg},
        {"$set": {"password": new_password, "change_password_required": True}},
    )

    return send_success_response(
        {}, "If the registration number and email match, a new password has been sent"
    )
