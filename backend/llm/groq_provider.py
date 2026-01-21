"""
Groq LLM Provider

Supports Llama 3.3, Llama 3.1, and Mixtral models.
FREE TIER: 14,400 requests/day, 300+ tokens/sec (fastest!)

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
    """

    def __init__(self, requests_per_second: float = 2.0):
        """
        Initialize rate limiter.

        Args:
            requests_per_second: Maximum requests per second (default: 2.0)
        """
        self.rate = requests_per_second
        self.tokens = requests_per_second
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self):
        """
        Acquire a token to make a request.
        Blocks if rate limit would be exceeded.
        """
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.tokens = min(self.rate, self.tokens + elapsed * self.rate)
            self.last_update = now

            if self.tokens < 1:
                wait_time = (1 - self.tokens) / self.rate
                logger.debug(f"Rate limit: waiting {wait_time:.2f}s")
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1


# Shared rate limiter instance for all Groq requests
_groq_rate_limiter: Optional[AsyncRateLimiter] = None


def _get_rate_limiter(requests_per_second: float = 2.0) -> AsyncRateLimiter:
    """Get or create the shared rate limiter."""
    global _groq_rate_limiter
    if _groq_rate_limiter is None:
        _groq_rate_limiter = AsyncRateLimiter(requests_per_second)
    return _groq_rate_limiter


class GroqProvider(BaseLLMProvider):
    """
    Groq LLM provider - FREE and FASTEST!

    Models:
    - llama-3.3-70b-versatile: Most capable (default)
    - llama-3.1-8b-instant: Fastest
    - mixtral-8x7b-32768: Good for long context
    - gemma2-9b-it: Google's Gemma 2
    """

    MODELS = {
        "default": "llama-3.3-70b-versatile",
        "fast": "llama-3.1-8b-instant",
        "mixtral": "mixtral-8x7b-32768",
        "gemma": "gemma2-9b-it",
    }

    # Groq API base URL (OpenAI compatible)
    BASE_URL = "https://api.groq.com/openai/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

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

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None,
        use_accurate: bool = False,
    ) -> str:
        """
        Generate response using Groq API (OpenAI compatible).
        BUG-032 Fix: Added rate limiting to prevent 429 errors.
        """
        model_to_use = model or self.get_model(use_accurate)

        # BUG-032 Fix: Apply rate limiting before making request
        rate_limiter = _get_rate_limiter()
        await rate_limiter.acquire()

        try:
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

        except Exception as e:
            error_type = type(e).__name__
            logger.error(f"Groq API error ({error_type}): {self._sanitize_error(str(e))}")
            raise

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

        # BUG-032 Fix: Apply rate limiting before making request
        rate_limiter = _get_rate_limiter()
        await rate_limiter.acquire()

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
        """
        Generate JSON response using Groq's JSON mode.
        BUG-032 Fix: Added rate limiting.
        """
        import json

        model_to_use = self.default_model

        # BUG-032 Fix: Apply rate limiting before making request
        rate_limiter = _get_rate_limiter()
        await rate_limiter.acquire()

        try:
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

        except Exception as e:
            error_type = type(e).__name__
            logger.error(f"Groq JSON generation error ({error_type}): {self._sanitize_error(str(e))}")
            return {}

    @staticmethod
    def _sanitize_error(error: str) -> str:
        """Remove sensitive info from error messages."""
        import re
        sanitized = re.sub(r"(gsk_|api[_-]?key)[a-zA-Z0-9\-_]{10,}", "[redacted]", error, flags=re.IGNORECASE)
        return sanitized[:200] if len(sanitized) > 200 else sanitized
