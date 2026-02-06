import logging
import time
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import Request

from .config import get_settings
from .errors import send_error_response
from .external_services import get_identity_profile


logger = logging.getLogger("department-service.auth")
settings = get_settings()


def _parse_expires_in(value: str) -> int:
    try:
        if value.isdigit():
            return int(value)
        unit = value[-1].lower()
        amount = int(value[:-1])
        if unit == "h":
            return amount * 60 * 60
        if unit == "m":
            return amount * 60
        if unit == "d":
            return amount * 60 * 60 * 24
    except Exception:
        pass
    return 60 * 60 * 24


def create_access_token(payload: Dict[str, Any]) -> str:
    expires_in = _parse_expires_in(settings.jwt_expires_in)
    payload_with_exp = {**payload, "exp": int(time.time()) + expires_in}
    return jwt.encode(payload_with_exp, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def get_request_token(request: Request) -> str:
    auth_header = request.headers.get("authorization") or ""
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return ""


async def authenticate_token(request: Request) -> Optional[Dict[str, Any]]:
    auth_header = request.headers.get("authorization")
    token = auth_header.split(" ")[1] if auth_header else None
    if not token:
        return send_error_response(401, "Access token required. Please login first.")
    try:
        decoded = decode_token(token)
    except Exception as exc:
        logger.debug("Token verification failed: %s", exc)
        return send_error_response(403, "Invalid or expired token. Please login again.")

    try:
        user = await get_identity_profile(token)
    except RuntimeError:
        return send_error_response(500, "Identity service is not configured.")
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code in {401, 403}:
            return send_error_response(403, "Invalid or expired token. Please login again.")
        if status_code == 404:
            return send_error_response(403, "User not found in database. Please login again.")
        logger.error("Identity service error: %s", exc)
        return send_error_response(500, "Error checking authentication. Please try again.")
    except ValueError:
        return send_error_response(403, "User not found in database. Please login again.")
    except Exception as exc:
        logger.error("Identity lookup failed: %s", exc)
        return send_error_response(500, "Error checking authentication. Please try again.")

    request.state.user = {
        "reg_number": user.get("reg_number") or decoded.get("reg_number"),
        "full_name": user.get("full_name") or decoded.get("full_name"),
        "isAdmin": decoded.get("isAdmin"),
    }
    request.state.token = token
    return None


async def require_admin(request: Request) -> Optional[Dict[str, Any]]:
    user = getattr(request.state, "user", None)
    if not user or user.get("reg_number") != settings.admin_reg_number:
        return send_error_response(403, "Admin access required")
    return None


async def auth_dependency(request: Request) -> None:
    response = await authenticate_token(request)
    if response is not None:
        raise _ResponseException(response)


async def admin_dependency(request: Request) -> None:
    response = await require_admin(request)
    if response is not None:
        raise _ResponseException(response)


class _ResponseException(Exception):
    def __init__(self, response):
        self.response = response
