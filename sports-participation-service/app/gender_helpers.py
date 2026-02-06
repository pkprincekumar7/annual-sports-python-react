from typing import Dict


_gender_cache: Dict[str, Dict[str, object]] = {}


def _cache_key(prefix: str, *parts: str) -> str:
    return f"{prefix}:{':'.join(parts)}"


def clear_team_gender_cache(team_name: str, sport_name: str, event_id: str) -> None:
    normalized_event_id = str(event_id).strip().lower()
    key = _cache_key("team", sport_name.strip().lower(), normalized_event_id, team_name.strip())
    _gender_cache.pop(key, None)


def clear_sport_gender_cache(sport_name: str, event_id: str) -> None:
    normalized_event_id = str(event_id).strip().lower()
    prefix = _cache_key("team", sport_name.strip().lower(), normalized_event_id, "")
    for key in list(_gender_cache.keys()):
        if key.startswith(prefix):
            _gender_cache.pop(key, None)
