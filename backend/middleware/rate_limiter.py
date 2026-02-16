"""
Rate Limiter Middleware

Multi-backend rate limiting for API endpoints to prevent abuse:
- /api/auth/* - 10 requests per minute (brute-force prevention)
- /api/chat/* - 30 requests per minute (DoS prevention)
- /api/import/status/* - 60 requests per minute (polling allowed)
- /api/import/* - 5 requests per minute (heavy operation protection)

Supports:
- In-memory storage (single instance, development)
- Redis storage (multi-instance, production)

Note: 429 responses include CORS headers to prevent browser CORS errors.
"""

import re
import time
import logging
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Dict, Tuple, Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# ============================================================================
# CORS Configuration for Rate Limit Responses
# ============================================================================

# Allowed origins for CORS (must match main.py configuration)
_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3000",
    "https://schola-rag-graph.vercel.app",
    "https://scholarag-graph.vercel.app",
]

# Vercel Preview URL regex pattern (project/team scoped)
_VERCEL_PREVIEW_REGEX = re.compile(
    r"^https://schola-rag-graph-[a-z0-9]+-hosung-yous-projects\.vercel\.app$"
)


def _is_allowed_origin(origin: Optional[str]) -> bool:
    """Check if the origin is allowed for CORS."""
    if not origin:
        return False
    if origin in _ALLOWED_ORIGINS:
        return True
    if _VERCEL_PREVIEW_REGEX.match(origin):
        return True
    return False


# ============================================================================
# Rate Limit Store Backends
# ============================================================================

class RateLimitStore(ABC):
    """Abstract base class for rate limit storage backends."""

    @abstractmethod
    async def is_rate_limited(
        self,
        client_key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Check if client is rate limited and record request.

        Returns:
            (is_limited, remaining_requests)
        """
        pass

    @abstractmethod
    async def cleanup(self) -> None:
        """Cleanup expired entries (if applicable)."""
        pass


class InMemoryRateLimitStore(RateLimitStore):
    """
    In-memory rate limit storage using sliding window.

    Suitable for single-instance deployments.
    """

    def __init__(self):
        self._request_counts: Dict[str, list] = defaultdict(list)
        self._last_cleanup = time.time()
        self._cleanup_interval = 300  # 5 minutes

    async def is_rate_limited(
        self,
        client_key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        now = time.time()
        window_start = now - window_seconds

        # Filter out old entries
        timestamps = self._request_counts[client_key]
        valid_timestamps = [ts for ts in timestamps if ts > window_start]
        self._request_counts[client_key] = valid_timestamps

        current_count = len(valid_timestamps)
        remaining = max(0, max_requests - current_count)

        if current_count >= max_requests:
            return True, remaining

        # Record this request
        self._request_counts[client_key].append(now)
        return False, remaining - 1

    async def cleanup(self) -> None:
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return

        self._last_cleanup = now
        cutoff = now - 3600  # Remove entries older than 1 hour

        keys_to_remove = []
        for key, timestamps in self._request_counts.items():
            valid = [ts for ts in timestamps if ts > cutoff]
            if valid:
                self._request_counts[key] = valid
            else:
                keys_to_remove.append(key)

        for key in keys_to_remove:
            del self._request_counts[key]

        if keys_to_remove:
            logger.debug(f"Rate limiter cleanup: removed {len(keys_to_remove)} stale entries")


class RedisRateLimitStore(RateLimitStore):
    """
    Redis-based rate limit storage using sliding window log.

    Suitable for multi-instance production deployments.
    Requires: pip install redis
    """

    def __init__(self, redis_url: str, key_prefix: str = "ratelimit:"):
        self._redis_url = redis_url
        self._key_prefix = key_prefix
        self._redis = None

    async def _get_redis(self):
        """Lazy initialize Redis connection."""
        if self._redis is None:
            try:
                import redis.asyncio as redis
                self._redis = redis.from_url(self._redis_url, decode_responses=True)
                logger.info("Redis rate limiter connected")
            except ImportError:
                logger.error("redis package not installed. Run: pip install redis")
                raise
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                raise
        return self._redis

    async def is_rate_limited(
        self,
        client_key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Check rate limit using Redis sorted set (sliding window log).

        Uses atomic MULTI/EXEC for consistency.
        """
        redis_client = await self._get_redis()
        now = time.time()
        window_start = now - window_seconds
        redis_key = f"{self._key_prefix}{client_key}"

        try:
            # Use pipeline for atomicity
            pipe = redis_client.pipeline()

            # Remove old entries
            pipe.zremrangebyscore(redis_key, "-inf", window_start)
            # Count remaining entries
            pipe.zcard(redis_key)
            # Add new entry with current timestamp as both score and member
            pipe.zadd(redis_key, {str(now): now})
            # Set TTL on the key
            pipe.expire(redis_key, window_seconds + 60)

            results = await pipe.execute()

            # results[1] is the count before adding new entry
            current_count = results[1]
            remaining = max(0, max_requests - current_count - 1)

            if current_count >= max_requests:
                # Exceeded limit - remove the entry we just added
                await redis_client.zrem(redis_key, str(now))
                return True, 0

            return False, remaining

        except Exception as e:
            logger.error(f"Redis rate limit error: {e}")
            # Fail open - don't rate limit if Redis is down
            return False, max_requests

    async def cleanup(self) -> None:
        """Redis handles TTL automatically, no manual cleanup needed."""
        pass


# ============================================================================
# Rate Limit Store Factory
# ============================================================================

_rate_limit_store: Optional[RateLimitStore] = None


def init_rate_limit_store(
    use_redis: bool = False,
    redis_url: Optional[str] = None,
) -> RateLimitStore:
    """
    Initialize the rate limit store.

    Args:
        use_redis: Whether to use Redis backend
        redis_url: Redis connection URL (required if use_redis=True)

    Returns:
        Configured RateLimitStore instance
    """
    global _rate_limit_store

    if use_redis and redis_url:
        try:
            _rate_limit_store = RedisRateLimitStore(redis_url)
            logger.info("Using Redis rate limit store")
        except Exception as e:
            logger.warning(f"Redis rate limit store failed, falling back to in-memory: {e}")
            _rate_limit_store = InMemoryRateLimitStore()
    else:
        _rate_limit_store = InMemoryRateLimitStore()
        logger.info("Using in-memory rate limit store")

    return _rate_limit_store


def get_rate_limit_store() -> RateLimitStore:
    """Get the current rate limit store instance."""
    global _rate_limit_store
    if _rate_limit_store is None:
        _rate_limit_store = InMemoryRateLimitStore()
    return _rate_limit_store


class RateLimitConfig:
    """Rate limit configuration for different endpoint patterns."""

    # Format: (max_requests, window_seconds)
    # NOTE: Order matters! More specific patterns should come first.
    LIMITS: Dict[str, Tuple[int, int]] = {
        "/api/import/status": (120, 60),  # 120 requests per minute (polling - doubled for stability)
        "/api/auth": (10, 60),            # 10 requests per minute
        "/api/chat": (30, 60),            # 30 requests per minute
        "/api/import": (10, 60),          # 10 requests per minute (increased from 5)
    }

    # Default limit for unmatched endpoints
    DEFAULT_LIMIT: Tuple[int, int] = (100, 60)  # 100 requests per minute


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using pluggable storage backends.

    Supports:
    - In-memory storage (default, single instance)
    - Redis storage (multi-instance, production)

    Tracks requests per client IP and path prefix, returning 429 Too Many Requests
    when limits are exceeded.
    """

    def __init__(self, app, enabled: bool = True):
        super().__init__(app)
        self.enabled = enabled

    def _should_trust_proxy(self) -> bool:
        """
        Determine whether to trust X-Forwarded-For header based on configuration.

        Returns True only when running behind a trusted proxy (e.g., Render LB).
        This prevents IP spoofing attacks where attackers bypass rate limits
        by setting fake X-Forwarded-For headers.
        """
        from config import get_settings
        settings = get_settings()

        if settings.trusted_proxy_mode == "always":
            return True
        elif settings.trusted_proxy_mode == "never":
            return False
        else:  # "auto" - trust only in production behind Render LB
            return settings.environment == "production"

    def _get_client_key(self, request: Request, path_prefix: str) -> str:
        """
        Generate a unique key for rate limiting based on client IP and path prefix.

        Security: Only trusts X-Forwarded-For when behind a trusted proxy.
        In development or when directly exposed, uses the direct connection IP
        to prevent rate limit bypass via header spoofing.

        See: SEC-011 - Rate Limiter X-Forwarded-For Spoofing vulnerability fix
        """
        # Get direct connection IP first (always available and trustworthy)
        direct_ip = request.client.host if request.client else "unknown"

        # Only use X-Forwarded-For if we trust the proxy
        if self._should_trust_proxy():
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                # Take the first IP (original client IP) from the chain
                # Format: "client, proxy1, proxy2, ..."
                client_ip = forwarded.split(",")[0].strip()
                logger.debug(f"Trusted proxy mode: using X-Forwarded-For IP {client_ip}")
            else:
                client_ip = direct_ip
        else:
            # Don't trust X-Forwarded-For - use direct connection IP
            client_ip = direct_ip
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                logger.debug(
                    f"Untrusted proxy mode: ignoring X-Forwarded-For '{forwarded}', "
                    f"using direct IP {client_ip}"
                )

        return f"{client_ip}:{path_prefix}"

    def _get_rate_limit(self, path: str) -> Tuple[int, int]:
        """
        Get rate limit config for a path.

        Returns (max_requests, window_seconds) tuple.
        """
        for prefix, limit in RateLimitConfig.LIMITS.items():
            if path.startswith(prefix):
                return limit
        return RateLimitConfig.DEFAULT_LIMIT

    def _get_path_prefix(self, path: str) -> str:
        """Extract the rate-limited path prefix."""
        for prefix in RateLimitConfig.LIMITS.keys():
            if path.startswith(prefix):
                return prefix
        return "default"

    async def dispatch(self, request: Request, call_next):
        """Process the request with rate limiting."""
        if not self.enabled:
            return await call_next(request)

        # Skip rate limiting for health checks, static files, and CORS preflight
        path = request.url.path
        if path in ("/", "/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        # BUG-026: Skip rate limiting for OPTIONS preflight requests
        # CORS preflight requests should never be rate-limited as they are
        # browser-initiated, not user-initiated, and blocking them causes CORS errors
        if request.method == "OPTIONS":
            return await call_next(request)

        # Get the rate limit store (in-memory or Redis)
        store = get_rate_limit_store()

        # Periodic cleanup (for in-memory store)
        await store.cleanup()

        # Get rate limit for this path
        max_requests, window_seconds = self._get_rate_limit(path)
        path_prefix = self._get_path_prefix(path)
        client_key = self._get_client_key(request, path_prefix)

        # Check rate limit using the store
        is_limited, remaining = await store.is_rate_limited(
            client_key, max_requests, window_seconds
        )

        if is_limited:
            logger.warning(f"Rate limit exceeded for {client_key} on {path}")

            # Build response headers
            headers = {
                "Retry-After": str(window_seconds),
                "X-RateLimit-Limit": str(max_requests),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(time.time()) + window_seconds),
            }

            # Add CORS headers to 429 response to prevent browser CORS errors
            # Without these, the browser shows CORS error instead of 429
            origin = request.headers.get("origin")
            if _is_allowed_origin(origin):
                headers["Access-Control-Allow-Origin"] = origin
                headers["Access-Control-Allow-Credentials"] = "true"
                headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
                headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Requested-With"

            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after_seconds": window_seconds,
                },
                headers=headers,
            )

        # Process request and add rate limit headers
        response = await call_next(request)

        # Add rate limit headers to response
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + window_seconds)

        return response
