"""
Graph Store

PostgreSQL-based graph storage with pgvector support.
Provides methods for storing, querying, and traversing the knowledge graph.
"""

import logging
from typing import Any, Optional
from uuid import UUID, uuid4
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Node:
    """Graph node representing an entity."""

    id: str
    project_id: str
    entity_type: str
    name: str
    properties: dict
    embedding: Optional[list[float]] = None


@dataclass
class Edge:
    """Graph edge representing a relationship."""

    id: str
    project_id: str
    source_id: str
    target_id: str
    relationship_type: str
    properties: dict
    weight: float = 1.0


class GraphStore:
    """
    PostgreSQL-based graph storage.

    Provides:
    - Entity (node) storage and retrieval
    - Relationship (edge) storage and retrieval
    - Vector similarity search via pgvector
    - Graph traversal queries
    """

    def __init__(self, db_connection=None):
        self.db = db_connection
        # In-memory fallback for development
        self._nodes: dict[str, Node] = {}
        self._edges: dict[str, Edge] = {}

    async def add_entity(
        self,
        project_id: str,
        entity_type: str,
        name: str,
        properties: dict = None,
        embedding: list[float] = None,
    ) -> str:
        """
        Add an entity to the graph.

        Returns the entity ID.
        """
        entity_id = str(uuid4())
        node = Node(
            id=entity_id,
            project_id=project_id,
            entity_type=entity_type,
            name=name,
            properties=properties or {},
            embedding=embedding,
        )

        if self.db:
            await self._db_add_entity(node)
        else:
            self._nodes[entity_id] = node

        return entity_id

    async def add_relationship(
        self,
        project_id: str,
        source_id: str,
        target_id: str,
        relationship_type: str,
        properties: dict = None,
        weight: float = 1.0,
    ) -> str:
        """
        Add a relationship between entities.

        Returns the relationship ID.
        """
        rel_id = str(uuid4())
        edge = Edge(
            id=rel_id,
            project_id=project_id,
            source_id=source_id,
            target_id=target_id,
            relationship_type=relationship_type,
            properties=properties or {},
            weight=weight,
        )

        if self.db:
            await self._db_add_relationship(edge)
        else:
            self._edges[rel_id] = edge

        return rel_id

    async def get_entities(
        self,
        project_id: str,
        entity_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Get entities for a project, optionally filtered by type."""
        if self.db:
            return await self._db_get_entities(project_id, entity_type, limit, offset)

        # In-memory fallback
        nodes = [
            n for n in self._nodes.values()
            if n.project_id == project_id
            and (entity_type is None or n.entity_type == entity_type)
        ]
        return [
            {
                "id": n.id,
                "entity_type": n.entity_type,
                "name": n.name,
                "properties": n.properties,
            }
            for n in nodes[offset : offset + limit]
        ]

    async def get_relationships(
        self,
        project_id: str,
        relationship_type: Optional[str] = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[dict]:
        """Get relationships for a project, optionally filtered by type."""
        if self.db:
            return await self._db_get_relationships(
                project_id, relationship_type, limit, offset
            )

        # In-memory fallback
        edges = [
            e for e in self._edges.values()
            if e.project_id == project_id
            and (relationship_type is None or e.relationship_type == relationship_type)
        ]
        return [
            {
                "id": e.id,
                "source": e.source_id,
                "target": e.target_id,
                "relationship_type": e.relationship_type,
                "properties": e.properties,
                "weight": e.weight,
            }
            for e in edges[offset : offset + limit]
        ]

    async def get_subgraph(
        self,
        node_id: str,
        depth: int = 1,
        max_nodes: int = 50,
    ) -> dict:
        """
        Get subgraph centered on a node.

        Args:
            node_id: Center node ID
            depth: How many hops from center (1-3)
            max_nodes: Maximum nodes to return

        Returns:
            Dict with 'nodes' and 'edges' lists
        """
        if self.db:
            return await self._db_get_subgraph(node_id, depth, max_nodes)

        # In-memory BFS traversal
        visited_nodes = {node_id}
        frontier = [node_id]
        result_edges = []

        for _ in range(depth):
            next_frontier = []
            for current_id in frontier:
                # Find connected edges
                for edge in self._edges.values():
                    if edge.source_id == current_id:
                        result_edges.append(edge)
                        if edge.target_id not in visited_nodes:
                            visited_nodes.add(edge.target_id)
                            next_frontier.append(edge.target_id)
                    elif edge.target_id == current_id:
                        result_edges.append(edge)
                        if edge.source_id not in visited_nodes:
                            visited_nodes.add(edge.source_id)
                            next_frontier.append(edge.source_id)

                if len(visited_nodes) >= max_nodes:
                    break

            frontier = next_frontier
            if len(visited_nodes) >= max_nodes:
                break

        # Get node details
        result_nodes = [
            {
                "id": n.id,
                "entity_type": n.entity_type,
                "name": n.name,
                "properties": n.properties,
            }
            for n in self._nodes.values()
            if n.id in visited_nodes
        ]

        return {
            "nodes": result_nodes[:max_nodes],
            "edges": [
                {
                    "id": e.id,
                    "source": e.source_id,
                    "target": e.target_id,
                    "relationship_type": e.relationship_type,
                }
                for e in result_edges
            ],
        }

    async def find_similar_entities(
        self,
        embedding: list[float],
        project_id: str,
        entity_type: Optional[str] = None,
        limit: int = 10,
    ) -> list[dict]:
        """
        Find similar entities using vector similarity (pgvector).

        Args:
            embedding: Query embedding vector
            project_id: Project to search in
            entity_type: Optional filter by entity type
            limit: Maximum results

        Returns:
            List of similar entities with similarity scores
        """
        if self.db:
            return await self._db_find_similar(
                embedding, project_id, entity_type, limit
            )

        # Fallback: no similarity search without pgvector
        return []

    async def find_research_gaps(
        self,
        project_id: str,
        min_papers: int = 3,
    ) -> list[dict]:
        """
        Find research gaps - concepts with few connected papers.

        Args:
            project_id: Project to analyze
            min_papers: Concepts with fewer papers are gaps

        Returns:
            List of gap concepts with paper counts
        """
        if self.db:
            return await self._db_find_gaps(project_id, min_papers)

        # In-memory fallback
        concept_paper_count = {}

        for edge in self._edges.values():
            if (
                edge.project_id == project_id
                and edge.relationship_type == "DISCUSSES_CONCEPT"
            ):
                concept_id = edge.target_id
                concept_paper_count[concept_id] = (
                    concept_paper_count.get(concept_id, 0) + 1
                )

        gaps = []
        for node in self._nodes.values():
            if node.entity_type == "Concept" and node.project_id == project_id:
                count = concept_paper_count.get(node.id, 0)
                if count < min_papers:
                    gaps.append(
                        {
                            "id": node.id,
                            "name": node.name,
                            "paper_count": count,
                        }
                    )

        return sorted(gaps, key=lambda x: x["paper_count"])

    async def get_visualization_data(
        self,
        project_id: str,
        max_nodes: int = 200,
    ) -> dict:
        """
        Get graph data optimized for visualization.

        Returns nodes and edges in a format suitable for React Flow.
        """
        nodes = await self.get_entities(project_id, limit=max_nodes)
        edges = await self.get_relationships(project_id, limit=max_nodes * 5)

        # Filter edges to only include those connecting visible nodes
        node_ids = {n["id"] for n in nodes}
        edges = [
            e for e in edges if e["source"] in node_ids and e["target"] in node_ids
        ]

        return {"nodes": nodes, "edges": edges}

    # Database methods (to be implemented with actual PostgreSQL)

    async def _db_add_entity(self, node: Node):
        """Add entity to PostgreSQL."""
        # TODO: Implement with asyncpg
        pass

    async def _db_add_relationship(self, edge: Edge):
        """Add relationship to PostgreSQL."""
        # TODO: Implement with asyncpg
        pass

    async def _db_get_entities(
        self, project_id: str, entity_type: Optional[str], limit: int, offset: int
    ) -> list[dict]:
        """Get entities from PostgreSQL."""
        # TODO: Implement with asyncpg
        return []

    async def _db_get_relationships(
        self,
        project_id: str,
        relationship_type: Optional[str],
        limit: int,
        offset: int,
    ) -> list[dict]:
        """Get relationships from PostgreSQL."""
        # TODO: Implement with asyncpg
        return []

    async def _db_get_subgraph(
        self, node_id: str, depth: int, max_nodes: int
    ) -> dict:
        """Get subgraph from PostgreSQL using recursive CTE."""
        # TODO: Implement with asyncpg
        return {"nodes": [], "edges": []}

    async def _db_find_similar(
        self,
        embedding: list[float],
        project_id: str,
        entity_type: Optional[str],
        limit: int,
    ) -> list[dict]:
        """Find similar entities using pgvector."""
        # TODO: Implement with asyncpg + pgvector
        return []

    async def _db_find_gaps(self, project_id: str, min_papers: int) -> list[dict]:
        """Find research gaps from PostgreSQL."""
        # TODO: Implement with asyncpg
        return []
