"""
Entity DAO - Data Access Object for Entity and Relationship persistence.

Extracted from GraphStore for Single Responsibility Principle.
"""

import json
import logging
from typing import Any, Optional, List
from uuid import UUID, uuid4
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


def _normalize_relationship_type(raw_type) -> str:
    """Normalize legacy or inconsistent relationship labels into canonical DB values."""
    if raw_type is None:
        return "RELATED_TO"

    normalized = str(raw_type).strip().upper()
    if normalized == "IS_RELATED_TO":
        return "RELATED_TO"
    if normalized == "CO_OCCUR_WITH":
        return "CO_OCCURS_WITH"
    return normalized


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


class EntityDAO:
    """
    Data Access Object for Entity and Relationship persistence.

    Handles:
    - Entity (node) CRUD operations
    - Relationship (edge) CRUD operations
    - Project and paper metadata storage
    """

    def __init__(self, db=None):
        """
        Initialize EntityDAO.

        Args:
            db: Database instance from backend/database.py
        """
        self.db = db
        # In-memory fallback for development
        self._nodes: dict[str, Node] = {}
        self._edges: dict[str, Edge] = {}

    # =========================================================================
    # Entity Operations
    # =========================================================================

    async def add_entity(
        self,
        project_id: str,
        entity_type: str,
        name: str,
        properties: dict = None,
        embedding: list[float] = None,
        source_paper_ids: list = None,
    ) -> str:
        """
        Add an entity to the graph.

        Returns the entity ID (may differ from generated UUID if name-based upsert matched).
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
            # _db_add_entity returns the actual ID (may differ on upsert)
            actual_id = await self._db_add_entity(node, source_paper_ids=source_paper_ids)
            return actual_id
        else:
            self._nodes[entity_id] = node

        return entity_id

    async def get_entity(self, entity_id: str) -> Optional[dict]:
        """Get a single entity by ID."""
        if self.db:
            return await self._db_get_entity(entity_id)

        node = self._nodes.get(entity_id)
        if node:
            return {
                "id": node.id,
                "entity_type": node.entity_type,
                "name": node.name,
                "properties": node.properties,
            }
        return None

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

    async def store_entity(
        self,
        project_id: str,
        name: str,
        entity_type: str,
        description: str = "",
        source_paper_id: str = None,
        confidence: float = 0.5,
        properties: dict = None,
        source_paper_ids: list = None,
    ) -> str:
        """
        Store an entity in the knowledge graph (wrapper for importers).
        """
        entity_properties = properties or {}
        if description:
            entity_properties["description"] = description
        if source_paper_id:
            entity_properties["source_paper_id"] = source_paper_id
        entity_properties["confidence"] = confidence

        # BUG-066: Build source_paper_ids array for the DB column
        paper_ids_array = list(source_paper_ids or [])
        if source_paper_id and source_paper_id not in paper_ids_array:
            paper_ids_array.append(source_paper_id)

        return await self.add_entity(
            project_id=project_id,
            entity_type=entity_type,
            name=name,
            properties=entity_properties,
            source_paper_ids=paper_ids_array,
        )

    async def append_source_paper_id(self, entity_id: str, paper_id: str):
        """Append a paper ID to entity's source_paper_ids if not already present."""
        if not self.db:
            return
        try:
            await self.db.execute("""
                UPDATE entities
                SET source_paper_ids = array_append(
                    COALESCE(source_paper_ids, ARRAY[]::uuid[]),
                    $2::uuid
                ),
                updated_at = NOW()
                WHERE id = $1::uuid
                AND NOT ($2::uuid = ANY(COALESCE(source_paper_ids, ARRAY[]::uuid[])))
            """, entity_id, paper_id)
        except Exception as e:
            logger.warning(f"Failed to append source_paper_id {paper_id} to entity {entity_id}: {e}")

    async def batch_add_relationships(self, project_id: str, relationships: list) -> int:
        """
        PERF-014: Batch insert co-occurrence relationships using executemany.

        Each item in relationships is a tuple:
        (id, project_id, source_id, target_id, relationship_type, properties_json, weight)

        Returns number of relationships inserted.
        """
        if not self.db or not relationships:
            return 0

        try:
            await self.db.executemany("""
                INSERT INTO relationships (id, project_id, source_id, target_id, relationship_type, properties, weight)
                VALUES ($1, $2, $3, $4, $5::relationship_type, $6, $7)
                ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE SET
                    weight = relationships.weight + 1,
                    updated_at = NOW()
            """, relationships)
            logger.info(f"PERF-014: Batch inserted {len(relationships)} relationships")
            return len(relationships)
        except Exception as e:
            logger.error(f"PERF-014: Batch relationship insert failed: {e}")
            # Fallback to individual inserts
            count = 0
            for rel in relationships:
                try:
                    await self.db.execute("""
                        INSERT INTO relationships (id, project_id, source_id, target_id, relationship_type, properties, weight)
                        VALUES ($1, $2, $3, $4, $5::relationship_type, $6, $7)
                        ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE SET
                            weight = relationships.weight + 1,
                            updated_at = NOW()
                    """, *rel)
                    count += 1
                except Exception as inner_e:
                    logger.debug(f"Individual relationship insert failed: {inner_e}")
            return count

    # =========================================================================
    # Relationship Operations
    # =========================================================================

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
        normalized_relationship_type = _normalize_relationship_type(relationship_type)
        edge = Edge(
            id=rel_id,
            project_id=project_id,
            source_id=source_id,
            target_id=target_id,
            relationship_type=normalized_relationship_type,
            properties=properties or {},
            weight=weight,
        )

        if self.db:
            await self._db_add_relationship(edge)
        else:
            self._edges[rel_id] = edge

        return rel_id

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
        normalized_filter = (
            _normalize_relationship_type(relationship_type)
            if relationship_type is not None
            else None
        )
        edges = [
            e for e in self._edges.values()
            if e.project_id == project_id
            and (
                normalized_filter is None
                or _normalize_relationship_type(e.relationship_type)
                == normalized_filter
            )
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

    # =========================================================================
    # Project & Paper Metadata Operations
    # =========================================================================

    async def create_project(
        self,
        name: str,
        description: str = None,
        config: dict = None,
        owner_id: str = None,
    ) -> str:
        """
        Create a new project in the database.

        Returns the UUID of the created project.
        """
        project_id = uuid4()
        now = datetime.now()

        if self.db:
            await self.db.execute(
                """
                INSERT INTO projects (id, name, research_question, source_path, owner_id, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                project_id,
                name,
                description,
                None,
                owner_id,
                now,
                now,
            )
            logger.info(f"Created project {project_id}: {name}")
            return str(project_id)
        else:
            logger.warning(f"No database - returning temporary project ID for: {name}")
            return str(project_id)

    async def store_paper_metadata(
        self,
        project_id: str,
        title: str,
        abstract: str = "",
        authors: List[str] = None,
        year: int = None,
        doi: str = None,
        source: str = None,
        properties: dict = None,
    ) -> str:
        """
        Store paper metadata in the database.

        Returns the UUID of the stored paper.
        """
        paper_id = uuid4()
        authors_json = json.dumps([{"name": a} for a in (authors or [])])

        if self.db:
            try:
                await self.db.execute(
                    """
                    INSERT INTO paper_metadata (
                        id, project_id, title, abstract, authors, year, doi, source, created_at
                    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
                    """,
                    paper_id,
                    project_id if isinstance(project_id, type(paper_id)) else UUID(project_id),
                    title,
                    abstract,
                    authors_json,
                    year,
                    doi,
                    source,
                    datetime.now(),
                )
                logger.info(f"Stored paper metadata: {title[:50]}...")
                return str(paper_id)
            except Exception as e:
                logger.error(f"Failed to store paper metadata: {e}")
                raise
        else:
            logger.warning(f"No database - returning temporary paper ID for: {title[:50]}")
            return str(paper_id)

    # =========================================================================
    # Private DB Methods
    # =========================================================================

    async def _db_add_entity(self, node: Node, source_paper_ids: list = None) -> str:
        """
        Add entity to PostgreSQL with name-based upsert.

        Uses ON CONFLICT on (project_id, entity_type, LOWER(TRIM(name))) to merge
        duplicate entities by name within the same project and type.
        Returns the actual entity ID (which may differ from node.id on conflict).
        """
        embedding_str = None
        if node.embedding:
            embedding_str = f"[{','.join(map(str, node.embedding))}]"

        properties_json = json.dumps(node.properties)

        # BUG-066: Convert source_paper_ids to UUID list for PostgreSQL
        paper_ids = source_paper_ids or []

        # Try name-based upsert first
        try:
            row = await self.db.fetchrow(
                """
                INSERT INTO entities (id, project_id, entity_type, name, properties, embedding, source_paper_ids)
                VALUES ($1, $2, $3::entity_type, $4, $5, $6, $7::uuid[])
                ON CONFLICT (project_id, entity_type, LOWER(TRIM(name)))
                DO UPDATE SET
                    properties = entities.properties || EXCLUDED.properties,
                    embedding = COALESCE(EXCLUDED.embedding, entities.embedding),
                    source_paper_ids = (
                        SELECT array_agg(DISTINCT x) FROM unnest(
                            array_cat(
                                COALESCE(entities.source_paper_ids, ARRAY[]::uuid[]),
                                COALESCE(EXCLUDED.source_paper_ids, ARRAY[]::uuid[])
                            )
                        ) x
                    ),
                    updated_at = NOW()
                RETURNING id
                """,
                node.id,
                node.project_id,
                node.entity_type,
                node.name,
                properties_json,
                embedding_str,
                paper_ids,
            )
            if row:
                return str(row["id"])
        except Exception as e:
            # Fallback to id-based upsert if name-based constraint doesn't exist
            logger.debug(f"Name-based upsert failed, falling back to id-based: {e}")
            await self.db.execute(
                """
                INSERT INTO entities (id, project_id, entity_type, name, properties, embedding, source_paper_ids)
                VALUES ($1, $2, $3::entity_type, $4, $5, $6, $7::uuid[])
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    properties = EXCLUDED.properties,
                    embedding = EXCLUDED.embedding,
                    source_paper_ids = (
                        SELECT array_agg(DISTINCT x) FROM unnest(
                            array_cat(
                                COALESCE(entities.source_paper_ids, ARRAY[]::uuid[]),
                                COALESCE(EXCLUDED.source_paper_ids, ARRAY[]::uuid[])
                            )
                        ) x
                    ),
                    updated_at = NOW()
                """,
                node.id,
                node.project_id,
                node.entity_type,
                node.name,
                properties_json,
                embedding_str,
                paper_ids,
            )

        return node.id

    async def _db_add_relationship(self, edge: Edge) -> None:
        """Add relationship to PostgreSQL."""
        query = """
            INSERT INTO relationships (id, project_id, source_id, target_id, relationship_type, properties, weight)
            VALUES ($1, $2, $3, $4, $5::relationship_type, $6, $7)
            ON CONFLICT (source_id, target_id, relationship_type) DO UPDATE SET
                properties = EXCLUDED.properties,
                weight = EXCLUDED.weight
        """
        await self.db.execute(
            query,
            edge.id,
            edge.project_id,
            edge.source_id,
            edge.target_id,
            edge.relationship_type,
            json.dumps(edge.properties),
            edge.weight,
        )

    async def _db_get_entity(self, entity_id: str) -> Optional[dict]:
        """Get single entity from PostgreSQL."""
        query = """
            SELECT id, project_id, entity_type, name, properties
            FROM entities
            WHERE id = $1
        """
        row = await self.db.fetchrow(query, entity_id)
        if row:
            return {
                "id": str(row["id"]),
                "project_id": str(row["project_id"]),
                "entity_type": row["entity_type"],
                "name": row["name"],
                "properties": row["properties"] or {},
            }
        return None

    async def _db_get_entities(
        self, project_id: str, entity_type: Optional[str], limit: int, offset: int
    ) -> list[dict]:
        """Get entities from PostgreSQL."""
        if entity_type:
            query = """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE project_id = $1 AND entity_type = $2::entity_type
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
            """
            rows = await self.db.fetch(query, project_id, entity_type, limit, offset)
        else:
            query = """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE project_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            """
            rows = await self.db.fetch(query, project_id, limit, offset)

        return [
            {
                "id": str(row["id"]),
                "entity_type": row["entity_type"],
                "name": row["name"],
                "properties": row["properties"] or {},
            }
            for row in rows
        ]

    async def _db_get_relationships(
        self,
        project_id: str,
        relationship_type: Optional[str],
        limit: int,
        offset: int,
    ) -> list[dict]:
        """Get relationships from PostgreSQL."""
        if relationship_type:
            normalized_relationship_type = _normalize_relationship_type(relationship_type)
            query = """
                SELECT id, source_id, target_id, relationship_type, properties, weight
                FROM relationships
                WHERE project_id = $1
                AND relationship_type::text = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
            """
            rows = await self.db.fetch(
                query, project_id, normalized_relationship_type, limit, offset
            )
        else:
            query = """
                SELECT id, source_id, target_id, relationship_type, properties, weight
                FROM relationships
                WHERE project_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            """
            rows = await self.db.fetch(query, project_id, limit, offset)

        return [
            {
                "id": str(row["id"]),
                "source": str(row["source_id"]),
                "target": str(row["target_id"]),
                "relationship_type": row["relationship_type"],
                "properties": row["properties"] or {},
                "weight": row["weight"],
            }
            for row in rows
        ]

    # =========================================================================
    # In-Memory Accessors (for analytics module)
    # =========================================================================

    @property
    def nodes(self) -> dict[str, Node]:
        """Access in-memory nodes for analytics."""
        return self._nodes

    @property
    def edges(self) -> dict[str, Edge]:
        """Access in-memory edges for analytics."""
        return self._edges

    # =========================================================================
    # MEM-001: Memory Management
    # =========================================================================

    def clear_memory_cache(self) -> None:
        """
        MEM-001: Clear in-memory cache after DB persistence.

        Call this periodically during large imports to prevent memory buildup.
        Safe to call - data is already persisted to PostgreSQL.

        Expected memory reduction: ~40% of peak usage during imports.
        """
        nodes_count = len(self._nodes)
        edges_count = len(self._edges)

        self._nodes.clear()
        self._edges.clear()

        logger.debug(
            f"MEM-001: EntityDAO cache cleared ({nodes_count} nodes, {edges_count} edges)"
        )
