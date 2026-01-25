"""
FastAPI Dependency Injection Module
Replaces global singletons with proper DI pattern
"""
from functools import lru_cache
from typing import Optional, Union

from fastapi import Depends

# Import existing modules
from backend.database import Database
from backend.config import Settings
from backend.llm.base import BaseLLMProvider


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton"""
    return Settings()


@lru_cache()
def get_database() -> Database:
    """Cached database connection pool"""
    settings = get_settings()
    return Database(dsn=settings.database_url)


# Note: AgentOrchestrator dependency should be added after
# database.py is updated to accept Database via constructor
# For now, provide a factory function pattern

class OrchestratorFactory:
    """Factory for creating AgentOrchestrator instances"""
    _instance: Optional["AgentOrchestrator"] = None

    @classmethod
    def get_or_create(cls, db: Database = Depends(get_database)):
        """Get or create orchestrator instance"""
        if cls._instance is None:
            from backend.agents.orchestrator import AgentOrchestrator
            cls._instance = AgentOrchestrator(db=db)
        return cls._instance

    @classmethod
    def reset(cls):
        """Reset for testing"""
        cls._instance = None


def get_orchestrator(db: Database = Depends(get_database)):
    """Dependency to get AgentOrchestrator"""
    return OrchestratorFactory.get_or_create(db)


# LLM Provider Factory
_llm_provider_cache: dict[str, BaseLLMProvider] = {}


def create_llm_provider(provider_name: str, settings: Settings) -> BaseLLMProvider:
    """Create LLM provider instance based on provider name"""
    from backend.llm import ClaudeProvider, OpenAIProvider, GeminiProvider, GroqProvider

    providers = {
        "anthropic": lambda: ClaudeProvider(api_key=settings.anthropic_api_key),
        "openai": lambda: OpenAIProvider(api_key=settings.openai_api_key),
        "google": lambda: GeminiProvider(api_key=settings.google_api_key),
        "groq": lambda: GroqProvider(
            api_key=settings.groq_api_key,
            requests_per_minute=int(settings.groq_requests_per_second * 60)
        ),
    }

    if provider_name not in providers:
        raise ValueError(f"Unknown LLM provider: {provider_name}. Available: {list(providers.keys())}")

    return providers[provider_name]()


def get_llm_provider() -> BaseLLMProvider:
    """Get configured LLM provider (cached per provider type)"""
    settings = get_settings()
    provider_name = settings.get_available_llm_provider()

    if provider_name not in _llm_provider_cache:
        _llm_provider_cache[provider_name] = create_llm_provider(provider_name, settings)

    return _llm_provider_cache[provider_name]


def reset_llm_provider_cache():
    """Reset LLM provider cache (for testing)"""
    _llm_provider_cache.clear()
