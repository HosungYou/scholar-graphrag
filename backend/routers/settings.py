"""
Settings API Router

Handles LLM provider configuration and API key validation.
"""

import logging
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class ValidateKeyRequest(BaseModel):
    provider: str  # anthropic, openai, google
    api_key: str


class ValidateKeyResponse(BaseModel):
    valid: bool
    error: str = ""
    provider: str = ""
    model: str = ""


@router.post("/validate-key", response_model=ValidateKeyResponse)
async def validate_api_key(request: ValidateKeyRequest):
    """Validate an LLM provider API key by making a minimal test call."""
    provider = request.provider.lower()
    api_key = request.api_key.strip()

    if not api_key:
        return ValidateKeyResponse(valid=False, error="API key is empty", provider=provider)

    try:
        if provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            # Minimal test: send tiny message
            response = client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=10,
                messages=[{"role": "user", "content": "hi"}],
            )
            return ValidateKeyResponse(valid=True, provider=provider, model="claude-3-5-haiku-20241022")

        elif provider == "openai":
            import openai
            client = openai.OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=10,
                messages=[{"role": "user", "content": "hi"}],
            )
            return ValidateKeyResponse(valid=True, provider=provider, model="gpt-4o-mini")

        elif provider == "google":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content("hi", generation_config={"max_output_tokens": 10})
            return ValidateKeyResponse(valid=True, provider=provider, model="gemini-1.5-flash")

        else:
            return ValidateKeyResponse(valid=False, error=f"Unknown provider: {provider}", provider=provider)

    except Exception as e:
        logger.warning(f"API key validation failed for {provider}: {e}")
        return ValidateKeyResponse(valid=False, error=str(e), provider=provider)


class ProviderStatusResponse(BaseModel):
    provider: str
    configured: bool
    model: str = ""


@router.get("/providers", response_model=list[ProviderStatusResponse])
async def get_provider_status():
    """Check which LLM providers have API keys configured."""
    from config import settings

    providers = []

    providers.append(ProviderStatusResponse(
        provider="anthropic",
        configured=bool(settings.anthropic_api_key),
        model=settings.default_llm_model if settings.default_llm_provider == "anthropic" else "",
    ))

    providers.append(ProviderStatusResponse(
        provider="openai",
        configured=bool(settings.openai_api_key),
        model="gpt-4o" if settings.openai_api_key else "",
    ))

    providers.append(ProviderStatusResponse(
        provider="google",
        configured=bool(settings.google_api_key),
        model="gemini-1.5-pro" if settings.google_api_key else "",
    ))

    return providers
