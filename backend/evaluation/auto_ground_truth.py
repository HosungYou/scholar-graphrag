"""
Auto Ground Truth Generator

Generates test queries and expected entity matches from project data
for automated retrieval quality evaluation.
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TestQuery:
    """A test query with expected relevant entities."""
    query: str
    query_type: str  # "concept_search", "relationship_query", "method_inquiry"
    expected_entity_ids: List[str]
    expected_entity_names: List[str]


class AutoGroundTruthGenerator:
    """
    Generates evaluation test sets from project's knowledge graph data.

    Strategy:
    1. Get top entities by connection count (degree centrality proxy)
    2. Generate concept_search queries: "What is [entity_name]?"
    3. Generate relationship queries from high-weight edges
    4. Generate method queries from Method-type entities
    """

    def generate_test_set(
        self,
        entities: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        max_queries: int = 20,
    ) -> List[TestQuery]:
        """
        Generate test queries from project entities and relationships.

        Args:
            entities: List of entity dicts with id, name, entity_type, connection_count
            relationships: List of relationship dicts with source_id, target_id, source_name, target_name, relationship_type
            max_queries: Maximum number of test queries to generate

        Returns:
            List of TestQuery objects
        """
        queries: List[TestQuery] = []

        # Sort entities by connection count (most connected first)
        sorted_entities = sorted(
            entities,
            key=lambda e: e.get("connection_count", 0),
            reverse=True,
        )

        # 1. Concept search queries (top entities)
        concept_limit = min(max_queries // 2, len(sorted_entities))
        for entity in sorted_entities[:concept_limit]:
            name = entity.get("name", "")
            entity_type = entity.get("entity_type", "Concept")
            if not name or len(name) < 3:
                continue

            if entity_type == "Method":
                query = f"How is {name} used in this research?"
                qtype = "method_inquiry"
            elif entity_type == "Finding":
                query = f"What are the findings related to {name}?"
                qtype = "concept_search"
            else:
                query = f"What is {name} and how is it discussed?"
                qtype = "concept_search"

            queries.append(TestQuery(
                query=query,
                query_type=qtype,
                expected_entity_ids=[str(entity["id"])],
                expected_entity_names=[name],
            ))

        # 2. Relationship queries (high-weight edges)
        # Deduplicate and sort by weight
        seen_pairs = set()
        sorted_rels = sorted(
            relationships,
            key=lambda r: r.get("weight", 0),
            reverse=True,
        )

        for rel in sorted_rels:
            if len(queries) >= max_queries:
                break

            source_name = rel.get("source_name", "")
            target_name = rel.get("target_name", "")
            pair_key = tuple(sorted([source_name, target_name]))

            if pair_key in seen_pairs or not source_name or not target_name:
                continue
            seen_pairs.add(pair_key)

            query = f"What is the relationship between {source_name} and {target_name}?"
            queries.append(TestQuery(
                query=query,
                query_type="relationship_query",
                expected_entity_ids=[
                    str(rel.get("source_id", "")),
                    str(rel.get("target_id", "")),
                ],
                expected_entity_names=[source_name, target_name],
            ))

        return queries[:max_queries]


auto_ground_truth = AutoGroundTruthGenerator()
