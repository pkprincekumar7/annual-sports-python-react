from typing import Any, Dict, List, Tuple


def validate_batch_assignment(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    errors: List[str] = []

    name = (data.get("name") or "").strip()
    if not name:
        errors.append("Batch name is required")

    event_id = data.get("event_id")
    if not event_id or not str(event_id).strip():
        errors.append("Event ID is required")

    return len(errors) == 0, errors


def trim_object_fields(obj: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(obj, dict):
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


def normalize_batch_name(name: str) -> str:
    normalized = str(name).lower().strip()
    words = normalized.split()
    return " ".join(word[:1].upper() + word[1:] if word else "" for word in words)
