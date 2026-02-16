"""
Azure OpenAI Embedding Service for ScholaRAG_Graph.

Uses text-embedding-3-large via Azure OpenAI to generate 3072-dimensional embeddings
for entity vector search.
"""

import logging
from typing import Optional

from openai import AzureOpenAI

from config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Generate embeddings using Azure OpenAI text-embedding-3-large."""

    def __init__(
        self,
        endpoint: Optional[str] = None,
        api_key: Optional[str] = None,
        deployment: Optional[str] = None,
        api_version: str = "2024-12-01-preview",
    ):
        self.endpoint = endpoint or settings.azure_openai_endpoint
        self.api_key = api_key or settings.azure_openai_api_key
        self.deployment = deployment or settings.azure_openai_embedding_deployment
        self.model = settings.embedding_model
        self.dimension = settings.embedding_dimension

        if not self.endpoint or not self.api_key:
            raise ValueError(
                "Azure OpenAI endpoint and API key are required. "
                "Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables."
            )

        self.client = AzureOpenAI(
            azure_endpoint=self.endpoint,
            api_key=self.api_key,
            api_version=api_version,
        )

        logger.info(
            f"EmbeddingService initialized: deployment={self.deployment}, "
            f"dimension={self.dimension}"
        )

    def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text string.

        Args:
            text: Input text to embed.

        Returns:
            List of floats representing the embedding vector.
        """
        if not text.strip():
            raise ValueError("Input text cannot be empty")

        response = self.client.embeddings.create(
            input=text,
            model=self.deployment,
        )
        return response.data[0].embedding

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts in a single batch.

        Args:
            texts: List of input texts to embed.

        Returns:
            List of embedding vectors, one per input text.
        """
        if not texts:
            return []

        # Filter out empty strings but track indices
        valid = [(i, t) for i, t in enumerate(texts) if t.strip()]
        if not valid:
            raise ValueError("All input texts are empty")

        valid_indices, valid_texts = zip(*valid)

        response = self.client.embeddings.create(
            input=list(valid_texts),
            model=self.deployment,
        )

        # Map results back to original positions
        results: list[list[float]] = [[] for _ in texts]
        for idx, embedding_obj in zip(valid_indices, response.data):
            results[idx] = embedding_obj.embedding

        return results


# Module-level singleton (lazy initialization)
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create the singleton EmbeddingService instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
