"""
Groq LLM Provider

Supports Llama 3.3, Llama 3.1, and Mixtral models.
FREE TIER: 14,400 requests/day, 300+ tokens/sec (fastest!)

Rate Limits:
- Free tier: ~30 requests/minute, 14,400 requests/day
- Retry-After header respected on 429 responses

Get API key: https://console.groq.com

BUG-032 Fix: Added rate limiting and retry configuration to prevent 429 errors.
"""

import asyncio
import logging
import time
from typing import Optional, AsyncIterator

from .base import BaseLLMProvider

logger = logging.getLogger(__name__)


# BUG-032 Fix: Rate limiter for Groq API
class AsyncRateLimiter:
    """
    Token bucket rate limiter for Groq API.

    Prevents 429 (Too Many Requests) errors by throttling requests
    when multiple concurrent calls are made.

    Implements smooth rate limiting using interval-based approach.
    """

    def __init__(self, requests_per_minute: int = 20):
        """
        Initialize rate limiter.

        Args:
            requests_per_minute: Maximum requests per minute (default: 20 for safety margin)
        """
        self.requests_per_minute = requests_per_minute
        self.min_interval = 60.0 / requests_per_minute  # seconds between requests
        self._last_request_time: float = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        """Wait until a request can be made without exceeding rate limit."""
        async with self._lock:
            current_time = time.monotonic()
            time_since_last = current_time - self._last_request_time

            if time_since_last < self.min_interval:
                wait_time = self.min_interval - time_since_last
                logger.debug(f"Rate limiter: waiting {wait_time:.2f}s")
                await asyncio.sleep(wait_time)

            self._last_request_time = time.monotonic()


class GroqProvider(BaseLLMProvider):
    """
    Groq LLM provider - FREE and FASTEST!

    Models:
    - llama-3.3-70b-versatile: Most capable (default)
    - llama-3.1-8b-instant: Fastest
    - mixtral-8x7b-32768: Good for long context
    - gemma2-9b-it: Google's Gemma 2

    Features:
    - Automatic retry on 429 (rate limit) errors
    - Respects Retry-After header
    - Client-side rate limiting to prevent 429s
    - Exponential backoff for transient errors
    """

    MODELS = {
        "default": "llama-3.3-70b-versatile",
        "fast": "llama-3.1-8b-instant",
        "mixtral": "mixtral-8x7b-32768",
        "gemma": "gemma2-9b-it",
    }

    # Groq API base URL (OpenAI compatible)
    BASE_URL = "https://api.groq.com/openai/v1"

    # Retry configuration
    MAX_RETRIES = 3
    DEFAULT_TIMEOUT = 60  # seconds

    def __init__(self, api_key: str, requests_per_minute: int = 20):
        """
        Initialize Groq provider.

        Args:
            api_key: Groq API key
            requests_per_minute: Rate limit (default: 20 for safety margin)
        """
        self.api_key = api_key
        self._client = None
        self._rate_limiter = AsyncRateLimiter(requests_per_minute)

    @property
    def name(self) -> str:
        return "groq"

    @property
    def default_model(self) -> str:
        return self.MODELS["default"]

    @property
    def client(self):
        """
        Lazy load the Groq client (uses OpenAI SDK with custom base_url).
        BUG-032 Fix: Added retry and timeout configuration.
        """
        if self._client is None:
            try:
                import httpx
                from openai import AsyncOpenAI

                # BUG-032 Fix: Configure HTTP client with appropriate timeout
                http_client = httpx.AsyncClient(
                    timeout=httpx.Timeout(60.0, connect=10.0),
                )

                self._client = AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.BASE_URL,
                    max_retries=3,  # BUG-032 Fix: Retry up to 3 times on transient errors
                    timeout=60.0,   # BUG-032 Fix: 60 second timeout
                    http_client=http_client,
                )
            except ImportError:
                raise ImportError("openai and httpx packages required: pip install openai httpx")
        return self._client

    def get_model(self, use_accurate: bool = False) -> str:
        """Get model based on accuracy requirement."""
        return self.MODELS["default"] if use_accurate else self.MODELS["fast"]

    async def _execute_with_retry(self, operation, operation_name: str = "API call"):
        """
        Execute an async operation with retry logic.

        Handles:
        - 429 (rate limit) errors with Retry-After header
        - Transient errors with exponential backoff
        - Timeout errors

        Args:
            operation: Async callable to execute
            operation_name: Name for logging

        Returns:
            Result of the operation

        Raises:
            Exception: After max retries exhausted
        """
        last_exception = None

        for attempt in range(self.MAX_RETRIES):
            try:
                # Apply rate limiting before request
                await self._rate_limiter.acquire()

                return await operation()

            except Exception as e:
                last_exception = e
                error_str = str(e).lower()
                error_type = type(e).__name__

                # Handle rate limit errors (429)
                if "rate" in error_str and "limit" in error_str or "429" in error_str:
                    # Try to extract Retry-After from error message
                    retry_after = self._extract_retry_after(str(e))
                    logger.warning(
                        f"Groq rate limited on {operation_name} (attempt {attempt + 1}/{self.MAX_RETRIES}), "
                        f"waiting {retry_after}s"
                    )
                    await asyncio.sleep(retry_after)
                    continue

                # Handle timeout errors
                if "timeout" in error_str or "timed out" in error_str:
                    wait_time = 2 ** attempt  # Exponential backoff: 1, 2, 4 seconds
                    logger.warning(
                        f"Groq timeout on {operation_name} (attempt {attempt + 1}/{self.MAX_RETRIES}), "
                        f"waiting {wait_time}s"
                    )
                    await asyncio.sleep(wait_time)
                    continue

                # Handle connection errors
                if "connection" in error_str or "network" in error_str:
                    wait_time = 2 ** attempt
                    logger.warning(
                        f"Groq connection error on {operation_name} (attempt {attempt + 1}/{self.MAX_RETRIES}), "
                        f"waiting {wait_time}s"
                    )
                    await asyncio.sleep(wait_time)
                    continue

                # For other errors, don't retry
                logger.error(f"Groq {operation_name} error ({error_type}): {self._sanitize_error(str(e))}")
                raise

        # All retries exhausted
        logger.error(f"Groq {operation_name} failed after {self.MAX_RETRIES} retries")
        raise last_exception

    def _extract_retry_after(self, error_message: str) -> int:
        """Extract retry-after value from error message or return default."""
        import re
        # Try to find retry-after in various formats
        patterns = [
            r'retry[_-]?after[:\s]+(\d+)',
            r'wait[:\s]+(\d+)',
            r'(\d+)\s*seconds?',
        ]
        for pattern in patterns:
            match = re.search(pattern, error_message, re.IGNORECASE)
            if match:
                return min(int(match.group(1)), 120)  # Cap at 2 minutes
        return 10  # Default wait time

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None,
        use_accurate: bool = False,
    ) -> str:
        """Generate response using Groq API with automatic retry."""
        model_to_use = model or self.get_model(use_accurate)

        async def _call():
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            return response.choices[0].message.content

        return await self._execute_with_retry(_call, "generate")

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """
        Generate streaming response using Groq API.
        BUG-032 Fix: Added rate limiting.
        """
        model_to_use = model or self.default_model

        # Apply rate limiting before making request
        await self._rate_limiter.acquire()

        try:
            messages = []

            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})

            messages.append({"role": "user", "content": prompt})

            stream = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            error_type = type(e).__name__
            logger.error(f"Groq streaming error ({error_type}): {self._sanitize_error(str(e))}")
            raise

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.1,
    ) -> dict:
        """Generate JSON response using Groq's JSON mode with automatic retry."""
        import json

        model_to_use = self.default_model

        async def _call():
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})

            # Add explicit JSON instruction for models that don't support json_object mode
            json_prompt = prompt + "\n\nRespond with valid JSON only."
            messages.append({"role": "user", "content": json_prompt})

            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content)

        try:
            return await self._execute_with_retry(_call, "generate_json")
        except Exception as e:
            logger.error(f"Groq JSON generation failed: {self._sanitize_error(str(e))}")
            return {}

    @staticmethod
    def _sanitize_error(error: str) -> str:
        """Remove sensitive info from error messages."""
        import re
        sanitized = re.sub(r"(gsk_|api[_-]?key)[a-zA-Z0-9\-_]{10,}", "[redacted]", error, flags=re.IGNORECASE)
        return sanitized[:200] if len(sanitized) > 200 else sanitized

    async def close(self) -> None:
        """
        PERF-011: Release client resources to free memory.

        Call this during application shutdown to release HTTP connections.
        """
        if self._client is not None:
            try:
                # AsyncOpenAI has a close method that releases the HTTP client
                if hasattr(self._client, 'close'):
                    await self._client.close()
                logger.debug("Groq LLM client closed for memory optimization")
            except Exception as e:
                logger.debug(f"Error closing Groq client: {e}")
            finally:
                self._client = None
