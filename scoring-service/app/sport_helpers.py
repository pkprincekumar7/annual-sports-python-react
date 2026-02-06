from typing import Optional


def normalize_sport_name(name: Optional[str]) -> str:
    return str(name or "").strip().lower()
