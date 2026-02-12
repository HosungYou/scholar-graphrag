"""Bounded async TTL cache for heavy graph metric endpoints."""

import asyncio
import time
from collections import OrderedDict
from typing import Any, Optional, Tuple


class MetricsTTLCache:
    """Small in-process TTL cache with project-scoped invalidation."""

    def __init__(self, ttl_seconds: float = 30.0, max_entries: int = 12):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._cache: "OrderedDict[str, Tuple[float, Any]]" = OrderedDict()
        self._lock = asyncio.Lock()

    async def get(self, cache_key: str) -> Optional[Any]:
        """Return cached value if present and not expired."""
        now = time.monotonic()
        async with self._lock:
            entry = self._cache.get(cache_key)
            if not entry:
                return None

            expires_at, value = entry
            if expires_at <= now:
                self._cache.pop(cache_key, None)
                return None

            self._cache.move_to_end(cache_key)
            return value

    async def set(self, cache_key: str, value: Any) -> None:
        """Store value with TTL and bounded size."""
        now = time.monotonic()
        expires_at = now + self.ttl_seconds
        async with self._lock:
            expired_keys = [k for k, (exp, _) in self._cache.items() if exp <= now]
            for key in expired_keys:
                self._cache.pop(key, None)

            self._cache[cache_key] = (expires_at, value)
            self._cache.move_to_end(cache_key)

            while len(self._cache) > self.max_entries:
                self._cache.popitem(last=False)

    async def invalidate_project(self, project_id: str) -> None:
        """Remove all entries for a project."""
        async with self._lock:
            keys_to_remove = [k for k in self._cache if project_id in k]
            for key in keys_to_remove:
                self._cache.pop(key, None)


metrics_cache = MetricsTTLCache(ttl_seconds=30.0, max_entries=12)

