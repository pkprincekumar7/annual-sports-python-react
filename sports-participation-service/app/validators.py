from typing import Any, Dict, Tuple


def trim_object_fields(obj: Any) -> Any:
    if not obj or not isinstance(obj, dict):
        return obj
    trimmed: Dict[str, Any] = {}
    for key, value in obj.items():
        if isinstance(value, str):
            trimmed[key] = value.strip()
        elif isinstance(value, list):
            trimmed[key] = [item.strip() if isinstance(item, str) else item for item in value]
        else:
            trimmed[key] = value
    return trimmed


def validate_captain_assignment(data: Dict[str, Any]) -> Tuple[bool, list]:
    errors = []
    if not data.get("reg_number") or not str(data.get("reg_number")).strip():
        errors.append("Registration number is required")
    if not data.get("sport") or not str(data.get("sport")).strip():
        errors.append("Sport name is required")
    if not data.get("event_id") or not str(data.get("event_id")).strip():
        errors.append("Event ID is required")
    return len(errors) == 0, errors
