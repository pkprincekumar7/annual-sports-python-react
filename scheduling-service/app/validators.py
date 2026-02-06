from typing import Any, Dict


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
