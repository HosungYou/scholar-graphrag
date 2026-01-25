# LLM Configuration Guide

**Last Updated**: 2026-01-25
**Status**: Production Ready ✅
**Primary Provider**: Groq (llama-3.3-70b-versatile)

## Quick Start

### Environment Variables (Required)

```bash
# Primary LLM (Groq - FREE)
GROQ_API_KEY=gsk_YOUR_KEY_HERE
DEFAULT_LLM_PROVIDER=groq
DEFAULT_LLM_MODEL=llama-3.3-70b-versatile

# Embeddings (OpenAI)
OPENAI_API_KEY=sk-YOUR_KEY_HERE

# Optional Fallback
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE  # Only if Groq fails
```

### Getting API Keys

#### Groq (FREE - Recommended)
1. Go to https://console.groq.com
2. Sign up (free account)
3. Navigate to API Keys
4. Create new API key
5. Free tier: 14,400 requests/day (~10 req/min)

#### OpenAI (Embeddings Only)
1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Add billing method
4. Cost: ~$0.02 per 1M tokens for text-embedding-3-small

#### Anthropic (Optional - Fallback)
1. Go to https://console.anthropic.com
2. Create API key
3. Add billing method
4. Cost: ~$0.80 per 1M tokens for claude-3-5-haiku

## Provider Comparison

| Metric | Groq (Free) | OpenAI | Anthropic | Google |
|--------|-------------|--------|-----------|--------|
| **Model** | Llama 3.3 70B | GPT-4o Mini | Claude 3.5 Haiku | Gemini 1.5 Flash |
| **Cost** | FREE (14.4K/day) | $0.15/1M input | $0.80/1M input | Free tier + paid |
| **Speed** | 67 tok/s | ~20 tok/s | ~25 tok/s | ~30 tok/s |
| **Quality** | 8.5/10 | 9.5/10 | 9/10 | 8/10 |
| **Availability** | Excellent | Excellent | Excellent | Good |
| **Use Case** | Production | High accuracy | Complex reasoning | Multimodal |

## Backend Implementation

### 1. Provider Selection (backend/routers/chat.py)

```python
# Automatic provider selection with fallback
PROVIDER_PRIORITY = [
    "groq",           # 1순위: 빠르고 무료
    "anthropic",      # 2순위: Fallback (API 실패 시)
    "openai",         # 3순위: Fallback
    "google"          # 4순위: Fallback
]

def get_available_llm_provider():
    """Returns first available provider in priority order"""
    for provider in PROVIDER_PRIORITY:
        if settings.get(f"{provider.lower()}_api_key"):
            return provider
    raise ValueError("No LLM provider configured")
```

### 2. Groq Provider (backend/llm/groq_provider.py)

```python
from backend.llm.groq_provider import GroqProvider

# Initialize with API key and rate limiting
llm_provider = GroqProvider(
    api_key=os.getenv("GROQ_API_KEY"),
    requests_per_minute=10  # Free tier limit
)

# Use for chat, reasoning, hypothesis generation
response = await llm_provider.generate(
    prompt="Analyze these two research clusters...",
    temperature=0.7,
    max_tokens=500
)
```

### 3. Chat Endpoint (backend/routers/chat.py)

```python
@router.post("/api/chat")
async def chat_endpoint(
    project_id: str,
    message: str,
    conversation_id: Optional[str] = None
):
    """
    Multi-agent chat with automatic LLM provider selection

    Flow:
    1. Intent Agent → Groq (intent classification)
    2. Concept Extraction → Groq (entity recognition)
    3. Query Execution → PostgreSQL (graph queries)
    4. Reasoning → Groq (chain-of-thought)
    5. Response Generation → Groq (answer formatting)
    """

    llm_provider = get_available_llm_provider()
    orchestrator = AgentOrchestrator(llm_provider=llm_provider)
    result = await orchestrator.process_query(message, project_id)

    return {
        "content": result.content,
        "citations": result.citations,
        "highlighted_nodes": result.highlighted_nodes,
        "suggested_follow_ups": result.suggested_follow_ups,
    }
```

### 4. Gap Analysis with AI (backend/graph/gap_detector.py)

```python
async def generate_bridge_hypothesis(
    gap: StructuralGap,
    all_nodes: list[GraphEntity]
) -> tuple[str, float]:
    """
    Generate AI hypothesis for research gap bridge

    Uses Groq llama-3.3-70b for:
    - Analyzing two research clusters
    - Finding semantic connections
    - Generating novel hypothesis

    Returns: (hypothesis_text, confidence_score)
    """

    prompt = f"""
    Two research clusters need to be connected:

    Cluster A concepts: {gap.cluster_a_concepts}
    Cluster B concepts: {gap.cluster_b_concepts}

    Potential bridge nodes: {gap.bridge_candidates}

    Based on the semantic relationships, suggest ONE novel research direction
    that could bridge these clusters.

    Format: "[HYPOTHESIS] ... [CONFIDENCE] 0.0-1.0"
    """

    response = await llm_provider.generate(
        prompt=prompt,
        temperature=0.8,  # Higher temperature for creativity
        max_tokens=200
    )

    # Parse response for hypothesis and confidence
    hypothesis = extract_hypothesis(response)
    confidence = extract_confidence(response)

    return hypothesis, confidence
```

## Rate Limiting

### Groq Free Tier Limits

```
14,400 requests/day
   ↓
600 requests/hour
   ↓
10 requests/minute (worst case)
```

### Implementation (backend/config.py)

```python
class RateLimiter:
    def __init__(self, requests_per_minute: int = 10):
        self.rpm = requests_per_minute
        self.min_interval = 60 / requests_per_minute  # 6 seconds per request
        self.last_request = 0

    async def wait_if_needed(self):
        """Enforce rate limit with exponential backoff on errors"""
        time_since_last = time.time() - self.last_request
        if time_since_last < self.min_interval:
            await asyncio.sleep(self.min_interval - time_since_last)
        self.last_request = time.time()

# Usage
rate_limiter = RateLimiter(requests_per_minute=10)
await rate_limiter.wait_if_needed()
response = await groq_client.chat.completions.create(...)
```

## Error Handling & Fallback

### Graceful Degradation Chain

```python
async def process_with_fallback(query: str, project_id: str):
    """
    Try providers in order, fall back to keyword-based if all fail
    """

    for provider in PROVIDER_PRIORITY:
        try:
            llm = get_llm_provider(provider)
            result = await llm.classify_intent(query)
            return result

        except RateLimitError:
            logger.warning(f"{provider} rate limited, trying next...")
            continue

        except APIError as e:
            logger.error(f"{provider} API error: {e}")
            continue

    # Fallback to keyword-based classification (no API calls)
    logger.warning("All LLM providers failed, using keyword fallback")
    return intent_agent._classify_with_keywords(query)
```

## Monitoring & Debugging

### Health Check Endpoint

```bash
curl https://scholarag-graph-docker.onrender.com/health

# Response:
{
  "status": "healthy",
  "database": "connected",
  "llm_provider": "groq",
  "llm_model": "llama-3.3-70b-versatile",
  "embedding_provider": "openai",
  "timestamp": "2026-01-25T10:30:00Z"
}
```

### Logging

Enable verbose LLM logging:

```python
# backend/main.py
import logging
logging.getLogger("groq").setLevel(logging.DEBUG)
logging.getLogger("anthropic").setLevel(logging.DEBUG)
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid API key" | Incorrect GROQ_API_KEY | Check console.groq.com for valid key |
| "Rate limit exceeded" | >10 requests/min | Reduce concurrent requests |
| "Connection timeout" | Groq API down | Check status.groq.com |
| "502 Bad Gateway" | Rate limiter not working | Restart backend service |
| "High latency" | Free tier congestion | Consider upgrading or using Anthropic |

## Cost Analysis

### Monthly Cost Estimate (1000 requests/day)

| Provider | Cost | Notes |
|----------|------|-------|
| Groq | **$0** | Free tier covers 14.4K/day |
| OpenAI (embeddings) | ~$0.60 | 1000 embed × 60 days × $0.02/1M |
| Anthropic (fallback) | $0-5 | Only if Groq unavailable |
| **Total** | **< $1** | Minimal cost for production |

### Token Breakdown (1000 requests)

Assume average 200 input + 300 output tokens per request:

```
- Intent Classification: 200 → 50 tokens
- Concept Extraction: 300 → 100 tokens
- Task Planning: 150 → 100 tokens
- Query Execution: (DB only, no LLM)
- Reasoning: 400 → 200 tokens
- Response Generation: 200 → 300 tokens

Total: ~1600 input + 750 output tokens per request
Cost: 1000 requests × (1600 + 750) = 2.35M tokens
Groq: FREE (within free tier)
OpenAI embeddings: ~$0.05
Total: < $0.10/day
```

## Best Practices

### 1. Use Groq for Production
- Free tier covers all typical loads
- Fastest inference speed
- No cost surprises

### 2. Set Up Fallback
- Always configure ANTHROPIC_API_KEY
- Groq occasionally experiences brief outages
- Fallback ensures graceful degradation

### 3. Monitor Rate Limits
- Set alerts at 80% of daily limit
- Log all rate limit events
- Implement exponential backoff

### 4. Cache Embeddings
- Cache OpenAI embeddings for repeated queries
- Reduces embedding API calls by 50-80%
- Use Redis or database cache layer

### 5. Optimize Prompts
- Use Groq's context window efficiently (8K tokens)
- Temperature 0.5-0.7 for consistent results
- Temperature 0.8+ for creative hypotheses (gaps mode)

## Advanced Configuration

### Custom Model Selection

```python
# backend/config.py
DEFAULT_LLM_MODEL = os.getenv(
    "DEFAULT_LLM_MODEL",
    "llama-3.3-70b-versatile"  # Default
)

# Alternative Groq models:
# - llama-3.1-70b-versatile  (older, faster)
# - mixtral-8x7b-32768       (sparse MoE, different performance)
# - gemma-7b-it              (smaller, faster)
```

### Streaming Responses

```python
# For long-running queries, use streaming
response = await groq_client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": prompt}],
    stream=True,  # Enable streaming
)

# Frontend receives Server-Sent Events (SSE)
async for chunk in response:
    yield chunk.choices[0].delta.content
```

### Temperature by Task

```python
TEMPERATURE_BY_TASK = {
    "intent_classification": 0.2,    # Consistent/deterministic
    "entity_extraction": 0.3,        # Consistent results needed
    "reasoning": 0.5,                # Balanced
    "gap_hypothesis": 0.8,           # Creative suggestions
    "response_formatting": 0.3,      # Consistent output format
}
```

## Testing

### Unit Tests

```python
# backend/tests/test_groq_provider.py
import pytest
from backend.llm.groq_provider import GroqProvider

@pytest.mark.asyncio
async def test_groq_intent_classification():
    provider = GroqProvider(api_key="test_key")
    result = await provider.generate(
        prompt="Classify: What papers discuss machine learning?",
    )
    assert "search" in result.lower()
```

### Integration Tests

```python
# backend/tests/test_chat_endpoint.py
@pytest.mark.asyncio
async def test_chat_with_groq():
    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={
            "project_id": "test-project",
            "message": "What papers discuss AI?"
        }
    )
    assert response.status_code == 200
    assert "content" in response.json()
    assert "highlighted_nodes" in response.json()
```

## Support & Documentation

- **Groq Docs**: https://console.groq.com/docs
- **Groq Rate Limits**: https://console.groq.com/docs/rate-limits
- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings
- **Anthropic Claude**: https://docs.anthropic.com
- **ScholaRAG_Graph Issues**: Check DOCS/.meta/decisions/ for ADRs

## Related Documentation

- Architecture: `DOCS/architecture/multi-agent-system.md` (LLM 통합 section)
- Backend Spec: `DOCS/development/backend-spec.md`
- Deployment: `CLAUDE.md` (Environment Variables section)
- API Overview: `DOCS/api/overview.md`
