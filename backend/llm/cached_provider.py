"""
Caching LLM Provider Wrapper

Wraps any LLM provider to add transparent caching.
Streaming responses are NOT cached (real-time requirement).
"""

import logging
from typing import AsyncIterator, Optional

from .base import BaseLLMProvider
from cache import get_llm_cache

logger = logging.getLogger(__name__)


class CachedLLMProvider(BaseLLMProvider):
    """
    Wrapper that adds caching to any LLM provider.

    Usage:
        provider = ClaudeProvider(api_key="...")
        cached_provider = CachedLLMProvider(provider)
        response = await cached_provider.generate(prompt="...")

    Features:
    - Caches generate() responses based on full parameter hash
    - Skips caching for generate_stream() (real-time requirement)
    - Configurable TTL per-call override
    - Cache bypass for specific calls
    """

    def __init__(
        self,
        provider: BaseLLMProvider,
        cache_enabled: bool = True,
        default_ttl: Optional[int] = None,
    ):
        self._provider = provider
        self._cache_enabled = cache_enabled
        self._default_ttl = default_ttl

    @property
    def name(self) -> str:
        return f"cached_{self._provider.name}"

    @property
    def default_model(self) -> str:
        return self._provider.default_model

    def get_model(self, use_accurate: bool = False) -> str:
        return self._provider.get_model(use_accurate)

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None,
        use_accurate: bool = False,
        skip_cache: bool = False,
        cache_ttl: Optional[int] = None,
    ) -> str:
        """
        Generate response with caching support.

        Args:
            skip_cache: If True, bypass cache for this call
            cache_ttl: Custom TTL for this response (seconds)
        """
        # Resolve model for cache key
        resolved_model = model or self._provider.get_model(use_accurate)

        # Check if caching is enabled and not bypassed
        if self._cache_enabled and not skip_cache:
            cache = get_llm_cache()

            # Try to get from cache
            cached_response = cache.get(
                prompt=prompt,
                system_prompt=system_prompt,
                model=resolved_model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            if cached_response is not None:
                logger.debug(f"Cache hit for LLM call (model={resolved_model})")
                return cached_response

        # Generate from provider
        response = await self._provider.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
            use_accurate=use_accurate,
        )

        # Cache the response
        if self._cache_enabled and not skip_cache:
            cache = get_llm_cache()
            cache.set(
                response=response,
                prompt=prompt,
                system_prompt=system_prompt,
                model=resolved_model,
                temperature=temperature,
                max_tokens=max_tokens,
                ttl=cache_ttl or self._default_ttl,
            )
            logger.debug(f"Cached LLM response (model={resolved_model})")

        return response

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        model: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """
        Stream responses - NOT cached (real-time requirement).

        Streaming responses are passed through directly from the underlying provider.
        """
        async for chunk in self._provider.generate_stream(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
        ):
            yield chunk

    async def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.1,
        skip_cache: bool = False,
        cache_ttl: Optional[int] = None,
    ) -> dict:
        """
        Generate JSON response with caching support.
        """
        import json

        response = await self.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            skip_cache=skip_cache,
            cache_ttl=cache_ttl,
        )

        # Try to extract JSON from response
        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                return json.loads(response[json_start:json_end])
        except json.JSONDecodeError:
            pass

        return {}


def wrap_with_cache(
    provider: BaseLLMProvider,
    enabled: bool = True,
    default_ttl: Optional[int] = None,
) -> BaseLLMProvider:
    """
    Convenience function to wrap a provider with caching.

    Args:
        provider: The LLM provider to wrap
        enabled: Whether caching is enabled
        default_ttl: Default TTL for cached responses

    Returns:
        CachedLLMProvider wrapping the original provider
    """
    if not enabled:
        return provider

    return CachedLLMProvider(
        provider=provider,
        cache_enabled=enabled,
        default_ttl=default_ttl,
    )
