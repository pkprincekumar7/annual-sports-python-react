from typing import Any, Dict, Optional

from fastapi.responses import JSONResponse

from .config import get_settings


settings = get_settings()


def send_error_response(status_code: int, message: str, details: Optional[Any] = None) -> JSONResponse:
    response: Dict[str, Any] = {"success": False, "error": message}
    if details and settings.app_env == "development":
        response["details"] = details
    return JSONResponse(status_code=status_code, content=response)


def send_success_response(
    data: Optional[Dict[str, Any]] = None,
    message: Optional[str] = None,
    status_code: int = 200,
) -> JSONResponse:
    payload: Dict[str, Any] = {"success": True}
    if data:
        payload.update(data)
    if message:
        payload["message"] = message
    return JSONResponse(status_code=status_code, content=payload)


def handle_not_found_error(resource: str = "Resource") -> JSONResponse:
    return send_error_response(404, f"{resource} not found")
