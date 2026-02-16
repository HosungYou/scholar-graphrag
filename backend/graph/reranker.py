"""
Semantic Reranker

Re-ranks search results using embedding-based cosine similarity.
Uses the project's existing EmbeddingService for embeddings.
"""

import logging
import numpy as np
from typing import Optional

from embedding_service import EmbeddingService, get_embedding_service

logger = logging.getLogger(__name__)


class SemanticReranker:
    """
    Re-ranks search results by computing cosine similarity
    between query embedding and result embeddings.
    """

    def __init__(self, embedding_service: Optional[EmbeddingService] = None):
        self._embedding_service = embedding_service

    @property
    def embedding_service(self) -> Optional[EmbeddingService]:
        if self._embedding_service is None:
            try:
                self._embedding_service = get_embedding_service()
            except Exception as e:
                logger.warning(f"EmbeddingService unavailable for reranker: {e}")
        return self._embedding_service

    async def rerank(
        self,
        query: str,
        results: list[dict],
        top_k: int = 20,
        weight_original: float = 0.3,
        weight_rerank: float = 0.7,
    ) -> list[dict]:
        """
        Re-rank search results using embedding similarity.

        Args:
            query: The search query string
            results: List of search result dicts (must have 'name' and optionally 'properties.description')
            top_k: Number of results to return
            weight_original: Weight for original score (0-1)
            weight_rerank: Weight for rerank score (0-1)

        Returns:
            Re-ranked list of results with updated scores
        """
        if not results or not self.embedding_service:
            return results[:top_k]

        try:
            # Get query embedding
            query_embedding = self.embedding_service.embed_text(query)
            query_vec = np.array(query_embedding)

            # Build text representations for each result
            result_texts = []
            for r in results:
                text_parts = [r.get("name", "")]
                props = r.get("properties", {})
                if isinstance(props, dict):
                    if props.get("description"):
                        text_parts.append(props["description"])
                    if props.get("abstract"):
                        text_parts.append(props["abstract"][:500])
                result_texts.append(". ".join(text_parts))

            # Get embeddings for all results
            result_embeddings = []
            for text in result_texts:
                try:
                    emb = self.embedding_service.embed_text(text)
                    result_embeddings.append(np.array(emb))
                except Exception:
                    result_embeddings.append(None)

            # Compute cosine similarity and combine scores
            reranked = []
            for i, r in enumerate(results):
                original_score = r.get("score", 0.5)

                if result_embeddings[i] is not None:
                    result_vec = result_embeddings[i]
                    # Cosine similarity
                    dot = np.dot(query_vec, result_vec)
                    norm_q = np.linalg.norm(query_vec)
                    norm_r = np.linalg.norm(result_vec)
                    if norm_q > 0 and norm_r > 0:
                        rerank_score = float(dot / (norm_q * norm_r))
                    else:
                        rerank_score = 0.0

                    # Weighted combination
                    combined_score = (weight_original * original_score) + (weight_rerank * rerank_score)
                else:
                    combined_score = original_score
                    rerank_score = 0.0

                reranked_result = {**r}
                reranked_result["score"] = combined_score
                reranked_result["original_score"] = original_score
                reranked_result["rerank_score"] = rerank_score
                reranked.append(reranked_result)

            # Sort by combined score
            reranked.sort(key=lambda x: x["score"], reverse=True)
            return reranked[:top_k]

        except Exception as e:
            logger.warning(f"Reranking failed, returning original order: {e}")
            return results[:top_k]
