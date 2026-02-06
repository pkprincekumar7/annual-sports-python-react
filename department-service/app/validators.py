from typing import Any, Dict


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


def normalize_department_name(name: str) -> str:
    return str(name).strip().upper()


def normalize_department_code(code: str) -> str:
    return str(code).strip().upper()
