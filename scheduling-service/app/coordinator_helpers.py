from .config import get_settings
from .external_services import fetch_sport
from .sport_helpers import normalize_sport_name


settings = get_settings()


async def require_admin_or_coordinator(
    user_reg_number: str,
    sport_name: str,
    event_id: str,
    token: str = "",
) -> None:
    if user_reg_number == settings.admin_reg_number:
        return
    sport_doc = await fetch_sport(normalize_sport_name(sport_name), event_id=event_id, token=token)
    eligible = sport_doc.get("eligible_coordinators") or []
    if user_reg_number not in eligible:
        raise ValueError("Admin or coordinator access required for this sport")
