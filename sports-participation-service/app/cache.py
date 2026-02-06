import pickle
from typing import Any, Dict, Optional

from redis import Redis
from redis.exceptions import RedisError

from .config import get_settings


CACHE_TTL: Dict[str, int] = {
    "/sports-participations/sports": 10000,
    "/sports-participations/sports-counts": 10000,
    "/sports-participations/teams": 10000,
    "default": 5000,
}


class RedisCache:
    def __init__(self, redis_url: str) -> None:
        self._client = Redis.from_url(redis_url, decode_responses=False)

    def _ttl_ms(self, url: str) -> int:
        return CACHE_TTL.get(url, CACHE_TTL["default"])

    def get(self, url: str) -> Optional[Any]:
        try:
            data = self._client.get(url)
        except RedisError:
            return None
        if data is None:
            return None
        try:
            return pickle.loads(data)
        except Exception:
            return None

    def set(self, url: str, data: Any) -> None:
        try:
            payload = pickle.dumps(data)
            self._client.set(url, payload, px=self._ttl_ms(url))
        except RedisError:
            return None

    def clear(self, url: Optional[str] = None) -> None:
        try:
            if url:
                self._client.delete(url)
            else:
                self._client.flushdb()
        except RedisError:
            return None

    def clear_pattern(self, pattern: str) -> None:
        try:
            for key in self._client.scan_iter(match=f"*{pattern}*"):
                self._client.delete(key)
        except RedisError:
            return None


settings = get_settings()
cache = RedisCache(settings.redis_url)
