import re
from typing import Any, Dict, List, Tuple

from .external_services import validate_department_exists


VALID_GENDERS = ["Male", "Female"]


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email or ""))


def is_valid_phone(phone: str) -> bool:
    return bool(re.match(r"^[0-9]{10}$", phone or ""))


async def validate_player_data(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    errors: List[str] = []

    if not (data.get("reg_number") or "").strip():
        errors.append("Registration number is required")

    if not (data.get("full_name") or "").strip():
        errors.append("Full name is required")

    gender = (data.get("gender") or "").strip()
    if not gender:
        errors.append("Gender is required")
    elif gender not in VALID_GENDERS:
        errors.append(f"Invalid gender. Must be one of: {', '.join(VALID_GENDERS)}")

    department = (data.get("department_branch") or "").strip()
    if not department:
        errors.append("Department/branch is required")
    else:
        validation = await validate_department_exists(department)
        if not validation["exists"]:
            errors.append(f'Department "{department}" does not exist')

    mobile = (data.get("mobile_number") or "").strip()
    if not mobile:
        errors.append("Mobile number is required")
    elif not is_valid_phone(mobile):
        errors.append("Invalid mobile number. Must be 10 digits.")

    email = (data.get("email_id") or "").strip()
    if not email:
        errors.append("Email ID is required")
    elif not is_valid_email(email):
        errors.append("Invalid email format")

    if not (data.get("password") or "").strip():
        errors.append("Password is required")

    return len(errors) == 0, errors


async def validate_update_player_data(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    errors: List[str] = []

    if not (data.get("reg_number") or "").strip():
        errors.append("Registration number is required")

    if not (data.get("full_name") or "").strip():
        errors.append("Full name is required")

    gender = (data.get("gender") or "").strip()
    if not gender:
        errors.append("Gender is required")
    elif gender not in VALID_GENDERS:
        errors.append(f"Invalid gender. Must be one of: {', '.join(VALID_GENDERS)}")

    department = (data.get("department_branch") or "").strip()
    if not department:
        errors.append("Department/branch is required")
    else:
        validation = await validate_department_exists(department)
        if not validation["exists"]:
            errors.append(f'Department "{department}" does not exist')

    mobile = (data.get("mobile_number") or "").strip()
    if not mobile:
        errors.append("Mobile number is required")
    elif not is_valid_phone(mobile):
        errors.append("Invalid mobile number. Must be 10 digits.")

    email = (data.get("email_id") or "").strip()
    if not email:
        errors.append("Email ID is required")
    elif not is_valid_email(email):
        errors.append("Invalid email format")

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
