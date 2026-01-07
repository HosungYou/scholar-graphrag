"""
Concept Extraction Agent

Extracts entities (papers, authors, concepts, methods) from user queries
using NER and matches them to existing entities in the graph.
"""

from typing import Optional
from pydantic import BaseModel


class ExtractedEntity(BaseModel):
    text: str
    entity_type: str  # Paper, Author, Concept, Method, Finding
    matched_id: Optional[str] = None  # ID of matched entity in graph
    confidence: float = 0.0


class ExtractionResult(BaseModel):
    entities: list[ExtractedEntity]
    keywords: list[str]
    query_without_entities: str


class ConceptExtractionAgent:
    """
    Extracts and matches entities from user queries.
    """

    def __init__(self, llm_provider=None, graph_store=None):
        self.llm = llm_provider
        self.graph_store = graph_store

    async def extract(self, query: str) -> ExtractionResult:
        """
        Extract entities from the query and match to graph.
        """
        # TODO: Use LLM for NER
        # TODO: Use fuzzy matching to find entities in graph

        # Placeholder implementation
        return ExtractionResult(
            entities=[],
            keywords=query.lower().split()[:10],
            query_without_entities=query,
        )

    async def match_to_graph(
        self, entity_text: str, entity_type: str
    ) -> Optional[str]:
        """
        Try to match extracted entity to existing graph entity.
        Uses fuzzy matching and vector similarity.
        """
        # TODO: Implement fuzzy matching with graph_store
        return None
