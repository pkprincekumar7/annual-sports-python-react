from .config import get_settings
from .db import sports_collection
from .sport_helpers import normalize_sport_name


settings = get_settings()


async def is_admin_or_coordinator(user_reg_number: str, sport_name: str, event_id: str) -> bool:
    if user_reg_number == settings.admin_reg_number:
        return True
    sport = await sports_collection().find_one(
        {
            "name": normalize_sport_name(sport_name),
            "event_id": str(event_id).strip().lower(),
            "eligible_coordinators": user_reg_number,
        }
    )
    return bool(sport)


async def require_admin_or_coordinator(user_reg_number: str, sport_name: str, event_id: str) -> None:
    has_access = await is_admin_or_coordinator(user_reg_number, sport_name, event_id)
    if not has_access:
        raise ValueError("Admin or coordinator access required for this sport")
