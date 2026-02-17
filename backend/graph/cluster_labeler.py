"""
Shared cluster labeling utility.

Provides LLM-based and fallback label generation for concept clusters.
Used by both GapDetector and CommunityDetector.
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def fallback_label(keywords: list[str]) -> str:
    """
    Generate a fallback cluster label when LLM is unavailable.

    Strategy:
    - Filter out long phrases (>40 chars) that are likely sentences, not concepts
    - Pick the 2 shortest remaining keywords (shorter = more core/fundamental)
    - Join with " & "

    Args:
        keywords: List of concept names in the cluster

    Returns:
        A concise 2-4 word label
    """
    if not keywords:
        return "Unnamed Cluster"

    # Filter to short, clean concept names
    short = [k.strip() for k in keywords if k and k.strip() and len(k.strip()) < 40]

    if not short:
        # All names are long — just truncate the first one
        return keywords[0].strip()[:40] if keywords[0] else "Unnamed Cluster"

    # Sort by length (shortest = most likely a core concept)
    sorted_by_len = sorted(short, key=len)

    # Join the 2 shortest with " & "
    return " & ".join(sorted_by_len[:2])


async def generate_cluster_label(
    llm_provider,
    keywords: list[str],
    max_retries: int = 2,
    timeout: float = 15.0,
) -> str:
    """
    Generate a cluster label using LLM with improved prompt.

    Falls back to fallback_label() on failure.

    Args:
        llm_provider: LLM provider instance (must have .generate() method)
        keywords: List of concept names in the cluster
        max_retries: Number of retry attempts
        timeout: Timeout per LLM call in seconds

    Returns:
        A concise 2-4 word topic label
    """
    filtered = [k for k in keywords[:10] if k and k.strip()]

    if not llm_provider or not filtered:
        return fallback_label(filtered or keywords)

    for attempt in range(max_retries):
        try:
            prompt = (
                "You are labeling a research topic cluster for an academic knowledge graph.\n"
                "Given these key concepts, generate a concise 2-4 word TOPIC LABEL.\n\n"
                f"Concepts: {', '.join(filtered[:10])}\n\n"
                "Rules:\n"
                "- Use broad academic terms, not specific proper nouns\n"
                "- 2-4 words only (e.g., 'Psychometric Validation', 'AI in Education')\n"
                "- NO slashes, NO listing multiple topics\n"
                "- NO quotation marks in the output\n\n"
                "Label:"
            )
            label = await asyncio.wait_for(
                llm_provider.generate(prompt=prompt, max_tokens=20, temperature=0.0),
                timeout=timeout,
            )
            result = label.strip().strip('"').strip("'")
            if 3 <= len(result) <= 60 and "/" not in result:
                return result
        except Exception as e:
            if attempt == 0:
                logger.warning(f"LLM label attempt {attempt + 1} failed: {e}, retrying...")
                await asyncio.sleep(1)
            else:
                logger.error(f"LLM label generation failed after {max_retries} attempts: {e}")

    return fallback_label(filtered)
