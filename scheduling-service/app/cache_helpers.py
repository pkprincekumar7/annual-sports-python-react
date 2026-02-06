from typing import Optional

from .cache import cache
from .gender_helpers import get_match_gender
from .sport_helpers import normalize_sport_name


async def clear_match_caches(match: dict, gender: Optional[str] = None, sport_doc: Optional[dict] = None) -> None:
    normalized_sport = normalize_sport_name(match.get("sports_name"))
    event_id = match.get("event_id")
    if not event_id:
        return
    cache.clear(f"/schedulings/event-schedule/{normalized_sport}?event_id={event_id}")

    match_gender = gender
    if not match_gender:
        match_gender = await get_match_gender(match, sport_doc, token="")
    if match_gender:
        cache.clear(
            f"/schedulings/event-schedule/{normalized_sport}?event_id={event_id}&gender={match_gender}"
        )
        cache.clear(
            f"/schedulings/event-schedule/{normalized_sport}/teams-players?event_id={event_id}&gender={match_gender}"
        )


def clear_new_match_caches(
    sport_name: str,
    event_id: str,
    gender: str,
    match_type: str,
) -> None:
    normalized_sport = normalize_sport_name(sport_name)
    normalized_event_id = str(event_id).strip().lower()
    cache.clear(
        f"/schedulings/event-schedule/{normalized_sport}?event_id={normalized_event_id}"
    )
    if gender:
        cache.clear(
            f"/schedulings/event-schedule/{normalized_sport}?event_id={normalized_event_id}&gender={gender}"
        )
        cache.clear(
            f"/schedulings/event-schedule/{normalized_sport}/teams-players?event_id={normalized_event_id}&gender={gender}"
        )
