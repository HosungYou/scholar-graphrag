"""Per-user LLM provider factory for ScholaRAG_Graph."""

import logging
import time
from typing import Optional, Tuple

from llm.base import BaseLLMProvider
from llm.claude_provider import ClaudeProvider
from llm.openai_provider import OpenAIProvider
from llm.groq_provider import GroqProvider
from llm.gemini_provider import GeminiProvider
from llm.cached_provider import wrap_with_cache
from config import settings
from database import db

logger = logging.getLogger(__name__)

# Cache: {user_id: (provider, timestamp)}
_user_provider_cache: dict[str, Tuple[BaseLLMProvider, float]] = {}
_CACHE_TTL = 300  # 5 minutes


def invalidate_user_provider_cache(user_id: str) -> None:
    """Remove cached provider for a user (call when settings change)."""
    _user_provider_cache.pop(user_id, None)
    logger.info(f"Invalidated LLM provider cache for user {user_id}")


async def get_user_llm_preferences(user_id: str) -> dict:
    """Read llm_provider, llm_model, api_keys from user_profiles.preferences."""
    try:
        row = await db.fetchrow(
            "SELECT preferences FROM user_profiles WHERE id = $1",
            user_id,
        )
        if row and row["preferences"]:
            return row["preferences"]
    except Exception as e:
        logger.error(f"Error reading user preferences: {e}")
    return {}


def _create_provider(provider_name: str, api_key: str) -> Optional[BaseLLMProvider]:
    """Create a provider instance with the given API key."""
    factories = {
        "anthropic": lambda key: ClaudeProvider(api_key=key),
        "openai": lambda key: OpenAIProvider(api_key=key),
        "groq": lambda key: GroqProvider(
            api_key=key,
            requests_per_minute=int(settings.groq_requests_per_second * 60),
        ),
        "google": lambda key: GeminiProvider(api_key=key),
    }
    factory = factories.get(provider_name)
    if factory and api_key:
        return factory(api_key)
    return None


async def create_llm_provider_for_user(user_id: Optional[str] = None) -> Optional[BaseLLMProvider]:
    """
    Create LLM provider for a specific user.

    1. If user_id provided, check cache first
    2. Read user preferences from DB
    3. If user has llm_provider + matching api_key -> create provider with user key
    4. Else fallback to server env var provider (current behavior)
    5. Wrap with CachedLLMProvider
    """
    # No user -> server default
    if not user_id:
        return _create_server_default_provider()

    # Check cache
    cached = _user_provider_cache.get(user_id)
    if cached:
        provider, ts = cached
        if time.time() - ts < _CACHE_TTL:
            return provider

    # Read user preferences
    prefs = await get_user_llm_preferences(user_id)
    provider_name = prefs.get("llm_provider")
    api_keys = prefs.get("api_keys", {})

    provider = None
    if provider_name:
        # Try user's own API key first
        user_key = api_keys.get(provider_name, "")
        if user_key:
            try:
                base = _create_provider(provider_name, user_key)
                if base:
                    provider = wrap_with_cache(
                        base,
                        enabled=getattr(settings, 'llm_cache_enabled', True),
                        default_ttl=getattr(settings, 'llm_cache_ttl', 3600),
                    )
                    logger.info(f"Created {provider_name} provider for user {user_id} (user key)")
            except Exception as e:
                logger.warning(f"Failed to create {provider_name} provider with user key: {e}")

        # Try server key for user's chosen provider
        if not provider:
            server_keys = {
                "anthropic": settings.anthropic_api_key,
                "openai": settings.openai_api_key,
                "groq": settings.groq_api_key,
                "google": settings.google_api_key,
            }
            server_key = server_keys.get(provider_name, "")
            if server_key:
                try:
                    base = _create_provider(provider_name, server_key)
                    if base:
                        provider = wrap_with_cache(
                            base,
                            enabled=getattr(settings, 'llm_cache_enabled', True),
                            default_ttl=getattr(settings, 'llm_cache_ttl', 3600),
                        )
                        logger.info(f"Created {provider_name} provider for user {user_id} (server key)")
                except Exception as e:
                    logger.warning(f"Failed to create {provider_name} with server key: {e}")

    # Final fallback: server default
    if not provider:
        provider = _create_server_default_provider()

    # Cache result
    if provider:
        _user_provider_cache[user_id] = (provider, time.time())

    return provider


def _create_server_default_provider() -> Optional[BaseLLMProvider]:
    """Create provider from server environment variables (original behavior)."""
    provider_name = settings.get_available_llm_provider()
    server_keys = {
        "anthropic": settings.anthropic_api_key,
        "openai": settings.openai_api_key,
        "groq": settings.groq_api_key,
        "google": settings.google_api_key,
    }
    key = server_keys.get(provider_name, "")
    if not key:
        return None
    try:
        base = _create_provider(provider_name, key)
        if base:
            return wrap_with_cache(
                base,
                enabled=getattr(settings, 'llm_cache_enabled', True),
                default_ttl=getattr(settings, 'llm_cache_ttl', 3600),
            )
    except Exception as e:
        logger.warning(f"Failed to create server default provider: {e}")
    return None


async def get_user_llm_model(user_id: Optional[str] = None) -> str:
    """Get the LLM model name for a user, falling back to server default."""
    if user_id:
        prefs = await get_user_llm_preferences(user_id)
        model = prefs.get("llm_model")
        if model:
            return model
    return settings.default_llm_model
