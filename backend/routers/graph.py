"""
Graph API Router

Handles knowledge graph queries and visualization data using PostgreSQL.
"""

import logging
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from enum import Enum

from database import db

logger = logging.getLogger(__name__)

router = APIRouter()


# Enums
class EntityType(str, Enum):
    PAPER = "Paper"
    AUTHOR = "Author"
    CONCEPT = "Concept"
    METHOD = "Method"
    FINDING = "Finding"
    RESULT = "Result"
    CLAIM = "Claim"


class RelationshipType(str, Enum):
    AUTHORED_BY = "AUTHORED_BY"
    CITES = "CITES"
    DISCUSSES_CONCEPT = "DISCUSSES_CONCEPT"
    USES_METHOD = "USES_METHOD"
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    RELATED_TO = "RELATED_TO"
    USED_IN = "USED_IN"
    EVALUATED_ON = "EVALUATED_ON"
    REPORTS = "REPORTS"


# Pydantic Models
class NodeResponse(BaseModel):
    id: str
    entity_type: str
    name: str
    properties: dict = {}


class EdgeResponse(BaseModel):
    id: str
    source: str
    target: str
    relationship_type: str
    properties: dict = {}


class GraphDataResponse(BaseModel):
    nodes: List[NodeResponse]
    edges: List[EdgeResponse]


class GraphDataPageResponse(GraphDataResponse):
    cursor: Optional[str] = None
    total: int


class SearchRequest(BaseModel):
    query: str
    entity_types: Optional[List[EntityType]] = None
    limit: int = 20


def _record_to_node(record) -> dict:
    """Convert asyncpg Record to NodeResponse dict."""
    import json
    props = record["properties"]
    # Handle case where properties is stored as JSON string
    if isinstance(props, str):
        try:
            props = json.loads(props)
        except (json.JSONDecodeError, TypeError):
            props = {}
    return {
        "id": str(record["id"]),
        "entity_type": record["entity_type"],
        "name": record["name"],
        "properties": props or {},
    }


def _record_to_edge(record) -> dict:
    """Convert asyncpg Record to EdgeResponse dict."""
    import json
    props = record["properties"]
    # Handle case where properties is stored as JSON string
    if isinstance(props, str):
        try:
            props = json.loads(props)
        except (json.JSONDecodeError, TypeError):
            props = {}
    return {
        "id": str(record["id"]),
        "source": str(record["source_id"]),
        "target": str(record["target_id"]),
        "relationship_type": record["relationship_type"],
        "properties": props or {},
    }


@router.get("/nodes", response_model=List[NodeResponse])
async def get_nodes(
    project_id: UUID,
    entity_type: Optional[EntityType] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
):
    """Get all nodes for a project, optionally filtered by type."""
    try:
        if entity_type:
            rows = await db.fetch(
                """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE project_id = $1 AND entity_type = $2
                ORDER BY name
                LIMIT $3 OFFSET $4
                """,
                project_id,
                entity_type.value,
                limit,
                offset,
            )
        else:
            rows = await db.fetch(
                """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE project_id = $1
                ORDER BY entity_type, name
                LIMIT $2 OFFSET $3
                """,
                project_id,
                limit,
                offset,
            )
        return [_record_to_node(row) for row in rows]
    except Exception as e:
        logger.error(f"Failed to get nodes: {e}")
        return []


@router.get("/edges", response_model=List[EdgeResponse])
async def get_edges(
    project_id: UUID,
    relationship_type: Optional[RelationshipType] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
):
    """Get all edges for a project, optionally filtered by type."""
    try:
        if relationship_type:
            rows = await db.fetch(
                """
                SELECT r.id, r.source_id, r.target_id, r.relationship_type, r.properties
                FROM relationships r
                WHERE r.project_id = $1 AND r.relationship_type = $2
                LIMIT $3 OFFSET $4
                """,
                project_id,
                relationship_type.value,
                limit,
                offset,
            )
        else:
            rows = await db.fetch(
                """
                SELECT r.id, r.source_id, r.target_id, r.relationship_type, r.properties
                FROM relationships r
                WHERE r.project_id = $1
                LIMIT $2 OFFSET $3
                """,
                project_id,
                limit,
                offset,
            )
        return [_record_to_edge(row) for row in rows]
    except Exception as e:
        logger.error(f"Failed to get edges: {e}")
        return []


@router.get("/visualization/{project_id}", response_model=GraphDataPageResponse)
async def get_visualization_data(
    project_id: UUID,
    entity_types: Optional[List[EntityType]] = Query(None),
    limit: int = Query(200, le=500),
    cursor: Optional[str] = Query(None),
    max_nodes: Optional[int] = Query(None, le=500),
):
    """Get graph data optimized for visualization (React Flow format)."""
    try:
        # First, check if project exists
        project = await db.fetchrow(
            "SELECT id FROM projects WHERE id = $1",
            project_id,
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        effective_limit = max_nodes or limit
        offset = int(cursor) if cursor and cursor.isdigit() else 0

        # Get total count
        if entity_types:
            type_values = [t.value for t in entity_types]
            total = await db.fetchval(
                """
                SELECT COUNT(*) FROM entities
                WHERE project_id = $1 AND entity_type = ANY($2::text[])
                """,
                project_id,
                type_values,
            )
            nodes_rows = await db.fetch(
                """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE project_id = $1 AND entity_type = ANY($2::text[])
                ORDER BY entity_type, name
                LIMIT $3 OFFSET $4
                """,
                project_id,
                type_values,
                effective_limit,
                offset,
            )
        else:
            total = await db.fetchval(
                "SELECT COUNT(*) FROM entities WHERE project_id = $1",
                project_id,
            )
            # Order by entity_type with Paper first for better visualization
            nodes_rows = await db.fetch(
                """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE project_id = $1
                ORDER BY
                    CASE entity_type
                        WHEN 'Paper' THEN 1
                        WHEN 'Author' THEN 2
                        WHEN 'Concept' THEN 3
                        WHEN 'Method' THEN 4
                        WHEN 'Finding' THEN 5
                        WHEN 'Result' THEN 6
                        WHEN 'Claim' THEN 7
                        ELSE 8
                    END,
                    name
                LIMIT $2 OFFSET $3
                """,
                project_id,
                effective_limit,
                offset,
            )

        nodes = [_record_to_node(row) for row in nodes_rows]
        node_ids = [row["id"] for row in nodes_rows]

        # Enrich non-Paper nodes with paper_count
        if node_ids:
            # Map relationship types to entity types
            # Concept: DISCUSSES_CONCEPT, Method: USES_METHOD, Finding: SUPPORTS, Author: AUTHORED_BY
            paper_counts_rows = await db.fetch(
                """
                SELECT target_id, COUNT(*) as paper_count
                FROM relationships
                WHERE target_id = ANY($1::uuid[])
                  AND relationship_type IN ('DISCUSSES_CONCEPT', 'USES_METHOD', 'SUPPORTS', 'AUTHORED_BY')
                GROUP BY target_id
                """,
                node_ids,
            )

            # Build lookup dict
            paper_counts = {str(row["target_id"]): row["paper_count"] for row in paper_counts_rows}

            # Merge counts into node properties
            for node in nodes:
                if node["entity_type"] != "Paper" and node["id"] in paper_counts:
                    node["properties"]["paper_count"] = paper_counts[node["id"]]

        # Get edges that connect to these nodes (either direction)
        edges = []
        connected_node_ids = set(node_ids)

        if node_ids:
            # First get all edges connected to current nodes
            edges_rows = await db.fetch(
                """
                SELECT id, source_id, target_id, relationship_type, properties
                FROM relationships
                WHERE project_id = $1
                  AND (source_id = ANY($2::uuid[]) OR target_id = ANY($2::uuid[]))
                """,
                project_id,
                node_ids,
            )

            # Collect IDs of connected nodes we need to fetch
            missing_node_ids = set()
            for row in edges_rows:
                if row["source_id"] not in connected_node_ids:
                    missing_node_ids.add(row["source_id"])
                if row["target_id"] not in connected_node_ids:
                    missing_node_ids.add(row["target_id"])

            # Fetch missing connected nodes (limit to prevent too many)
            if missing_node_ids:
                missing_ids_list = list(missing_node_ids)[:200]  # Limit additional nodes
                extra_nodes_rows = await db.fetch(
                    """
                    SELECT id, entity_type, name, properties
                    FROM entities
                    WHERE id = ANY($1::uuid[])
                    """,
                    missing_ids_list,
                )
                nodes.extend([_record_to_node(row) for row in extra_nodes_rows])
                connected_node_ids.update(r["id"] for r in extra_nodes_rows)

            # Now filter edges to only those between nodes we have
            edges = [
                _record_to_edge(row) for row in edges_rows
                if row["source_id"] in connected_node_ids and row["target_id"] in connected_node_ids
            ]

        next_cursor = str(offset + effective_limit) if offset + effective_limit < total else None

        return GraphDataPageResponse(
            nodes=nodes,
            edges=edges,
            cursor=next_cursor,
            total=total,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get visualization data: {e}")
        return GraphDataPageResponse(nodes=[], edges=[], cursor=None, total=0)


@router.get("/subgraph/{node_id}", response_model=GraphDataResponse)
async def get_subgraph(
    node_id: str,
    depth: int = Query(1, le=3),
    max_nodes: int = Query(50, le=200),
):
    """Get subgraph centered around a specific node."""
    try:
        node_uuid = UUID(node_id)

        # Get the center node
        center_row = await db.fetchrow(
            """
            SELECT id, entity_type, name, properties
            FROM entities
            WHERE id = $1
            """,
            node_uuid,
        )
        if not center_row:
            raise HTTPException(status_code=404, detail="Node not found")

        nodes = [_record_to_node(center_row)]
        visited_ids = {node_uuid}
        current_ids = {node_uuid}

        # BFS traversal
        for _ in range(depth):
            if not current_ids:
                break

            # Find neighbors
            neighbors_rows = await db.fetch(
                """
                SELECT DISTINCT e.id, e.entity_type, e.name, e.properties
                FROM entities e
                JOIN relationships r ON (e.id = r.source_id OR e.id = r.target_id)
                WHERE (r.source_id = ANY($1::uuid[]) OR r.target_id = ANY($1::uuid[]))
                  AND e.id != ALL($1::uuid[])
                  AND e.id != ALL($2::uuid[])
                LIMIT $3
                """,
                list(current_ids),
                list(visited_ids),
                max_nodes - len(nodes),
            )

            new_ids = set()
            for row in neighbors_rows:
                if row["id"] not in visited_ids:
                    nodes.append(_record_to_node(row))
                    visited_ids.add(row["id"])
                    new_ids.add(row["id"])

            current_ids = new_ids

        # Get edges between collected nodes
        edges = []
        if len(visited_ids) > 0:
            edges_rows = await db.fetch(
                """
                SELECT id, source_id, target_id, relationship_type, properties
                FROM relationships
                WHERE source_id = ANY($1::uuid[])
                  AND target_id = ANY($1::uuid[])
                """,
                list(visited_ids),
            )
            edges = [_record_to_edge(row) for row in edges_rows]

        return GraphDataResponse(nodes=nodes, edges=edges)
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid node ID format")
    except Exception as e:
        logger.error(f"Failed to get subgraph: {e}")
        return GraphDataResponse(nodes=[], edges=[])


@router.post("/search", response_model=List[NodeResponse])
async def search_nodes(request: SearchRequest):
    """Search nodes by query string."""
    try:
        query_pattern = f"%{request.query}%"

        if request.entity_types:
            type_values = [t.value for t in request.entity_types]
            rows = await db.fetch(
                """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE name ILIKE $1
                  AND entity_type = ANY($2::text[])
                ORDER BY name
                LIMIT $3
                """,
                query_pattern,
                type_values,
                request.limit,
            )
        else:
            rows = await db.fetch(
                """
                SELECT id, entity_type, name, properties
                FROM entities
                WHERE name ILIKE $1
                ORDER BY name
                LIMIT $2
                """,
                query_pattern,
                request.limit,
            )

        return [_record_to_node(row) for row in rows]
    except Exception as e:
        logger.error(f"Failed to search nodes: {e}")
        return []


@router.get("/similar/{node_id}", response_model=List[NodeResponse])
async def get_similar_nodes(
    node_id: str,
    limit: int = Query(10, le=50),
):
    """Get similar nodes using vector similarity (pgvector)."""
    try:
        node_uuid = UUID(node_id)

        # Get the node's embedding and project_id
        node = await db.fetchrow(
            """
            SELECT id, project_id, entity_type, embedding
            FROM entities
            WHERE id = $1
            """,
            node_uuid,
        )
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        if node["embedding"] is None:
            return []

        # Find similar nodes using vector similarity
        rows = await db.fetch(
            """
            SELECT id, entity_type, name, properties,
                   1 - (embedding <=> $1) as similarity
            FROM entities
            WHERE project_id = $2
              AND id != $3
              AND embedding IS NOT NULL
            ORDER BY embedding <=> $1
            LIMIT $4
            """,
            node["embedding"],
            node["project_id"],
            node_uuid,
            limit,
        )

        return [_record_to_node(row) for row in rows]
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid node ID format")
    except Exception as e:
        logger.error(f"Failed to get similar nodes: {e}")
        return []


@router.get("/gaps/{project_id}", response_model=List[NodeResponse])
async def get_research_gaps(
    project_id: UUID,
    min_papers: int = Query(3, description="Concepts with fewer papers are gaps"),
):
    """Identify research gaps - concepts with few connected papers."""
    try:
        rows = await db.fetch(
            """
            SELECT c.id, c.entity_type, c.name, c.properties, COUNT(r.id) as paper_count
            FROM entities c
            LEFT JOIN relationships r ON c.id = r.target_id AND r.relationship_type = 'DISCUSSES_CONCEPT'
            WHERE c.entity_type = 'Concept'
              AND c.project_id = $1
            GROUP BY c.id, c.entity_type, c.name, c.properties
            HAVING COUNT(r.id) < $2
            ORDER BY COUNT(r.id) ASC
            """,
            project_id,
            min_papers,
        )

        return [_record_to_node(row) for row in rows]
    except Exception as e:
        logger.error(f"Failed to get research gaps: {e}")
        return []


@router.get("/communities/{project_id}")
async def get_communities(project_id: str):
    """Get detected communities with summaries for a project."""
    from graph.community_detector import CommunityDetector
    from graph.community_summarizer import CommunitySummarizer

    pool = await db.get_pool()
    async with pool.acquire() as conn:
        detector = CommunityDetector(db_connection=conn)
        communities = await detector.detect_communities(project_id)

        if not communities:
            return {"communities": [], "total": 0}

        # Store communities
        await detector.store_communities(project_id, communities)

        # Get summaries
        summarizer = CommunitySummarizer(db_connection=conn)
        results = await summarizer.summarize_all_communities(project_id)

        return {
            "communities": results,
            "total": len(results),
        }
