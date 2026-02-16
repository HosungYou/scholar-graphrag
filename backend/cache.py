"""
LLM Response Cache Module

Provides in-memory caching with TTL support for LLM responses.
Designed to be replaceable with Redis for production deployments.
"""

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Single cache entry with TTL tracking."""
    value: Any
    created_at: float
    ttl: int  # seconds
    hits: int = 0

    def is_expired(self) -> bool:
        """Check if entry has expired."""
        return time.time() - self.created_at > self.ttl

    def access(self) -> Any:
        """Access the cached value and increment hit counter."""
        self.hits += 1
        return self.value


class LLMCache:
    """
    In-memory cache for LLM responses.

    Features:
    - TTL-based expiration
    - Content-based keys (hash of prompt + params)
    - Statistics tracking
    - Configurable max size with LRU eviction

    Can be replaced with Redis backend for distributed caching.
    """

    DEFAULT_TTL = 3600  # 1 hour
    MAX_SIZE = 1000  # Maximum entries

    def __init__(
        self,
        default_ttl: int = DEFAULT_TTL,
        max_size: int = MAX_SIZE,
        enabled: bool = True,
    ):
        self._cache: Dict[str, CacheEntry] = {}
        self.default_ttl = default_ttl
        self.max_size = max_size
        self.enabled = enabled

        # Statistics
        self.stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
        }

    def _generate_key(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
    ) -> str:
        """
        Generate a cache key from LLM call parameters.

        Uses SHA-256 hash for consistent key generation.
        """
        key_data = {
            "prompt": prompt,
            "system_prompt": system_prompt or "",
            "model": model or "default",
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        key_string = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_string.encode()).hexdigest()

    def get(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
    ) -> Optional[str]:
        """
        Get cached response if available and not expired.

        Returns:
            Cached response or None if not found/expired
        """
        if not self.enabled:
            return None

        key = self._generate_key(prompt, system_prompt, model, temperature, max_tokens)

        entry = self._cache.get(key)
        if entry is None:
            self.stats["misses"] += 1
            return None

        if entry.is_expired():
            del self._cache[key]
            self.stats["misses"] += 1
            return None

        self.stats["hits"] += 1
        logger.debug(f"LLM cache hit (key: {key[:16]}...)")
        return entry.access()

    def set(
        self,
        response: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        ttl: Optional[int] = None,
    ) -> None:
        """
        Cache an LLM response.

        Args:
            response: LLM response to cache
            prompt: Original prompt
            system_prompt: System prompt if any
            model: Model used
            temperature: Temperature setting
            max_tokens: Max tokens setting
            ttl: Custom TTL in seconds (uses default if not specified)
        """
        if not self.enabled:
            return

        # Evict if at max size (simple LRU - remove oldest)
        if len(self._cache) >= self.max_size:
            self._evict_oldest()

        key = self._generate_key(prompt, system_prompt, model, temperature, max_tokens)

        self._cache[key] = CacheEntry(
            value=response,
            created_at=time.time(),
            ttl=ttl or self.default_ttl,
        )

        logger.debug(f"LLM response cached (key: {key[:16]}...)")

    def _evict_oldest(self) -> None:
        """Evict the oldest entry from cache."""
        if not self._cache:
            return

        oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k].created_at)
        del self._cache[oldest_key]
        self.stats["evictions"] += 1
        logger.debug("Evicted oldest cache entry")

    def invalidate(self, pattern: Optional[str] = None) -> int:
        """
        Invalidate cache entries.

        Args:
            pattern: If None, clear all. Otherwise, clear matching keys.

        Returns:
            Number of entries invalidated
        """
        if pattern is None:
            count = len(self._cache)
            self._cache.clear()
            return count

        # Pattern-based invalidation (for future use)
        count = 0
        keys_to_remove = [k for k in self._cache.keys() if pattern in k]
        for key in keys_to_remove:
            del self._cache[key]
            count += 1
        return count

    def cleanup_expired(self) -> int:
        """
        Remove all expired entries.

        Returns:
            Number of entries removed
        """
        expired_keys = [
            key for key, entry in self._cache.items()
            if entry.is_expired()
        ]

        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.info(f"Cleaned up {len(expired_keys)} expired cache entries")

        return len(expired_keys)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total_requests = self.stats["hits"] + self.stats["misses"]
        hit_rate = self.stats["hits"] / total_requests if total_requests > 0 else 0.0

        return {
            "enabled": self.enabled,
            "size": len(self._cache),
            "max_size": self.max_size,
            "hits": self.stats["hits"],
            "misses": self.stats["misses"],
            "evictions": self.stats["evictions"],
            "hit_rate": round(hit_rate, 3),
            "default_ttl": self.default_ttl,
        }


# Global cache instance
_llm_cache: Optional[LLMCache] = None


def get_llm_cache() -> LLMCache:
    """Get or create the global LLM cache instance."""
    global _llm_cache
    if _llm_cache is None:
        _llm_cache = LLMCache()
    return _llm_cache


def init_llm_cache(
    default_ttl: int = LLMCache.DEFAULT_TTL,
    max_size: int = LLMCache.MAX_SIZE,
    enabled: bool = True,
) -> LLMCache:
    """Initialize the global LLM cache with custom settings."""
    global _llm_cache
    _llm_cache = LLMCache(
        default_ttl=default_ttl,
        max_size=max_size,
        enabled=enabled,
    )
    logger.info(f"LLM cache initialized (TTL={default_ttl}s, max_size={max_size}, enabled={enabled})")
    return _llm_cache
