"""
Graph API Router

Handles knowledge graph queries and visualization data with PostgreSQL persistence.

Security:
- All endpoints require authentication in production (configurable via REQUIRE_AUTH)
- Project-level access control is enforced for all operations
- Users can only access projects they own, collaborate on, or that are public
"""

import json
import logging
import re
from typing import List, Optional
from uuid import UUID
from time import perf_counter
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from enum import Enum
import asyncpg.exceptions
from datetime import datetime
import io

from database import db
from graph.entity_resolution import EntityResolutionService
from graph.graph_store import GraphStore
from graph.metrics_cache import metrics_cache
from auth.dependencies import require_auth_if_configured
from auth.models import User
from routers.projects import check_project_access
from routers.integrations import get_effective_api_key
from config import settings

logger = logging.getLogger(__name__)


# ============================================
# Relationship Evidence Models (Phase 1: Contextual Edge Exploration)
# ============================================

class EvidenceChunkResponse(BaseModel):
    """Single evidence chunk supporting a relationship."""
    evidence_id: str
    chunk_id: str
    text: str
    section_type: str
    paper_id: Optional[str] = None
    paper_title: Optional[str] = None
    paper_authors: Optional[str] = None
    paper_year: Optional[int] = None
    relevance_score: float = 0.5
    context_snippet: Optional[str] = None


class RelationshipEvidenceResponse(BaseModel):
    """Response containing all evidence for a relationship."""
    relationship_id: str
    source_name: str
    target_name: str
    relationship_type: str
    evidence_chunks: List[EvidenceChunkResponse]
    total_evidence: int
    # v0.9.0: Error code for graceful degradation
    error_code: Optional[str] = None  # "table_missing", "permission_denied", "query_failed"
    # v0.11.0: AI-generated explanation when no text evidence
    ai_explanation: Optional[str] = None


def _parse_json_field(value) -> dict:
    """Parse a JSON field that might be a string or already a dict."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return {}
    return {}


def _safe_float(val, default: float = 0.0) -> float:
    """Safely convert a value to float, returning default on failure."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _normalize_relationship_type(raw_type) -> str:
    """Normalize legacy or inconsistent relationship labels into canonical API values."""
    if raw_type is None:
        return "RELATED_TO"

    normalized = str(raw_type).strip().upper()
    if normalized == "IS_RELATED_TO":
        return "RELATED_TO"
    if normalized == "CO_OCCUR_WITH":
        return "CO_OCCURS_WITH"
    return normalized


def _parse_embedding(value) -> list:
    """Parse a pgvector embedding that might be a string, list, or vector type."""
    if value is None:
        return []
    # Already a list of floats
    if isinstance(value, list):
        return value
    # String format from pgvector: "[0.1, 0.2, ...]"
    if isinstance(value, str):
        try:
            # Remove brackets and split
            clean = value.strip("[]")
            if not clean:
                return []
            return [float(x.strip()) for x in clean.split(",")]
        except (ValueError, AttributeError):
            return []
    # Try to convert directly (some drivers return native types)
    try:
        return list(value)
    except (TypeError, ValueError):
        return []


def escape_sql_like(s: str) -> str:
    """Escape special characters for SQL LIKE queries."""
    if not s:
        return s
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_').replace("'", "''")


def _log_query_perf(
    endpoint: str,
    query_name: str,
    started_at: float,
    row_count: Optional[int] = None,
    project_id: Optional[str] = None,
) -> None:
    """
    Log lightweight query performance metrics for hotspot endpoints.
    """
    duration_ms = (perf_counter() - started_at) * 1000
    message = (
        "[QueryPerf] endpoint=%s query=%s project_id=%s rows=%s duration_ms=%.2f"
    )
    args = (
        endpoint,
        query_name,
        project_id or "-",
        row_count if row_count is not None else "-",
        duration_ms,
    )
    if duration_ms >= 1000:
        logger.warning(message, *args)
    else:
        logger.info(message, *args)


def _log_gap_chain_event(event: str, **fields) -> None:
    """
    Structured trace log for GAP -> bridge -> recommendation pipeline.

    Emits a compact JSON payload so downstream log tooling can filter by event.
    """
    payload = {"event": event, "ts": datetime.utcnow().isoformat() + "Z"}
    for key, value in fields.items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            payload[key] = value
        elif isinstance(value, list):
            payload[key] = value[:10]
            payload[f"{key}_count"] = len(value)
        elif isinstance(value, dict):
            payload[key] = value
        else:
            payload[key] = str(value)
    logger.info("[GapChain] %s", json.dumps(payload, ensure_ascii=True))


router = APIRouter()


# Enums
class EntityType(str, Enum):
    PAPER = "Paper"
    AUTHOR = "Author"
    CONCEPT = "Concept"
    METHOD = "Method"
    FINDING = "Finding"


class RelationshipType(str, Enum):
    AUTHORED_BY = "AUTHORED_BY"
    CITES = "CITES"
    DISCUSSES_CONCEPT = "DISCUSSES_CONCEPT"
    USES_METHOD = "USES_METHOD"
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    RELATED_TO = "RELATED_TO"
    MENTIONS = "MENTIONS"  # Phase 7A: Chunk→Entity provenance
    SAME_AS = "SAME_AS"  # Phase 10B: Cross-paper entity identity link


# Pydantic Models
class NodeResponse(BaseModel):
    id: str
    entity_type: str  # Changed from EntityType to str for flexibility
    name: str
    properties: dict = {}


class EdgeResponse(BaseModel):
    id: str
    source: str
    target: str
    relationship_type: str  # Changed from RelationshipType to str
    properties: dict = {}
    weight: float = 1.0


class GraphDataResponse(BaseModel):
    nodes: List[NodeResponse]
    edges: List[EdgeResponse]


class SearchRequest(BaseModel):
    query: str
    entity_types: Optional[List[str]] = None
    limit: int = 20
    project_id: Optional[str] = None


# Database dependency
async def get_db():
    """Dependency to get database connection."""
    if not db.is_connected:
        await db.connect()
    return db


async def get_graph_store(database=Depends(get_db)) -> GraphStore:
    """Dependency to get GraphStore instance."""
    return GraphStore(db=database)


async def verify_project_access(
    database,
    project_id: UUID,
    current_user: Optional[User],
    action: str = "access"
) -> None:
    """
    Verify that the current user has access to the project.

    Args:
        database: Database connection
        project_id: UUID of the project
        current_user: Current authenticated user (None if auth not configured)
        action: Description of the action for error messages

    Raises:
        HTTPException: 403 if access denied, 404 if project not found
    """
    # Check project exists
    exists = await database.fetchval(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1)",
        project_id,
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Project not found")

    # Require authentication
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    has_access = await check_project_access(database, project_id, current_user.id)
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail=f"You don't have permission to {action} this project"
        )


async def get_project_id_from_node(database, node_id: str) -> Optional[UUID]:
    """
    Get the project_id for a node.

    Args:
        database: Database connection
        node_id: UUID of the node

    Returns:
        Project UUID or None if node not found
    """
    row = await database.fetchrow(
        "SELECT project_id FROM entities WHERE id = $1",
        node_id,
    )
    return UUID(str(row["project_id"])) if row else None


async def get_project_id_from_gap(database, gap_id: str) -> Optional[UUID]:
    """
    Get the project_id for a structural gap.

    Args:
        database: Database connection
        gap_id: UUID of the gap

    Returns:
        Project UUID or None if gap not found
    """
    row = await database.fetchrow(
        "SELECT project_id FROM structural_gaps WHERE id = $1",
        str(gap_id),
    )
    return UUID(str(row["project_id"])) if row else None


@router.get("/nodes", response_model=List[NodeResponse])
async def get_nodes(
    project_id: UUID,
    entity_type: Optional[str] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get all nodes for a project from PostgreSQL. Requires auth in production."""
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    try:
        query_started = perf_counter()
        if entity_type:
            rows = await database.fetch(
                """
                SELECT id, entity_type::text, name, properties
                FROM entities
                WHERE project_id = $1 AND entity_type::text = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                """,
                str(project_id),
                entity_type,
                limit,
                offset,
            )
        else:
            rows = await database.fetch(
                """
                SELECT id, entity_type::text, name, properties
                FROM entities
                WHERE project_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                str(project_id),
                limit,
                offset,
            )
        _log_query_perf(
            endpoint="get_nodes",
            query_name="entities_list",
            started_at=query_started,
            row_count=len(rows),
            project_id=str(project_id),
        )

        return [
            NodeResponse(
                id=str(row["id"]),
                entity_type=row["entity_type"],
                name=row["name"],
                properties=_parse_json_field(row["properties"]),
            )
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get nodes: {e}")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please try again later."
        )


@router.get("/edges", response_model=List[EdgeResponse])
async def get_edges(
    project_id: UUID,
    relationship_type: Optional[str] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get all edges for a project from PostgreSQL. Requires auth in production."""
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    try:
        query_started = perf_counter()
        if relationship_type:
            normalized_relationship_type = _normalize_relationship_type(relationship_type)
            rows = await database.fetch(
                """
                SELECT id, source_id, target_id, relationship_type::text, properties, weight
                FROM relationships
                WHERE project_id = $1 AND relationship_type::text = $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4
                """,
                str(project_id),
                normalized_relationship_type,
                limit,
                offset,
            )
        else:
            rows = await database.fetch(
                """
                SELECT id, source_id, target_id, relationship_type::text, properties, weight
                FROM relationships
                WHERE project_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                """,
                str(project_id),
                limit,
                offset,
            )
        _log_query_perf(
            endpoint="get_edges",
            query_name="relationships_list",
            started_at=query_started,
            row_count=len(rows),
            project_id=str(project_id),
        )

        return [
            EdgeResponse(
                id=str(row["id"]),
                source=str(row["source_id"]),
                target=str(row["target_id"]),
                relationship_type=_normalize_relationship_type(row["relationship_type"]),
                properties=_parse_json_field(row["properties"]),
                weight=row["weight"] or 1.0,
            )
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get edges: {e}")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please try again later."
        )


@router.get("/visualization/{project_id}", response_model=GraphDataResponse)
async def get_visualization_data(
    project_id: UUID,
    entity_types: Optional[List[str]] = Query(None),
    view_context: str = Query("hybrid"),
    max_nodes: int = Query(500, le=5000),
    max_edges: int = Query(15000, ge=1000, le=50000),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get graph data optimized for visualization. Requires auth in production."""
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    try:
        endpoint_started = perf_counter()
        # Build entity type filter
        if view_context not in {"hybrid", "concept", "all"}:
            raise HTTPException(
                status_code=422,
                detail="Invalid view_context. Allowed values: hybrid, concept, all",
            )

        concept_only_types = [
            "Concept",
            "Method",
            "Finding",
            "Problem",
            "Dataset",
            "Metric",
            "Innovation",
            "Limitation",
        ]

        scoped_filter = ""
        type_filter = ""
        params = [str(project_id), max_nodes]

        if entity_types:
            type_placeholders = ", ".join(f"${i+3}" for i in range(len(entity_types)))
            type_filter = f"AND entity_type::text IN ({type_placeholders})"
            params.extend(entity_types)
        elif view_context == "concept":
            type_placeholders = ", ".join(f"${i+3}" for i in range(len(concept_only_types)))
            type_filter = f"AND entity_type::text IN ({type_placeholders})"
            params.extend(concept_only_types)
        elif view_context == "all":
            type_filter = ""

        if view_context == "concept":
            scoped_filter = "AND is_visualized = TRUE"

        # Get nodes
        nodes_query = f"""
            SELECT id, entity_type::text, name, properties,
                   COALESCE(array_length(source_paper_ids, 1), 0) as paper_count,
                   source_paper_ids
            FROM entities
            WHERE project_id = $1 {type_filter} {scoped_filter}
            ORDER BY
                CASE entity_type::text
                    WHEN 'Paper' THEN 5
                    WHEN 'Author' THEN 5
                    ELSE 1
                END,
                created_at DESC
            LIMIT $2
        """
        nodes_query_started = perf_counter()
        node_rows = await database.fetch(nodes_query, *params)
        _log_query_perf(
            endpoint="get_visualization_data",
            query_name="nodes_for_visualization",
            started_at=nodes_query_started,
            row_count=len(node_rows),
            project_id=str(project_id),
        )

        # Build entity → source papers mapping for edge paper_count
        entity_papers: dict[str, set[str]] = {}
        for row in node_rows:
            raw_ids = row.get("source_paper_ids") or []
            entity_papers[str(row["id"])] = set(str(pid) for pid in raw_ids)

        nodes = []
        for row in node_rows:
            props = _parse_json_field(row["properties"])
            props["paper_count"] = row.get("paper_count") or 1
            nodes.append(
                NodeResponse(
                    id=str(row["id"]),
                    entity_type=row["entity_type"],
                    name=row["name"],
                    properties=props,
                )
            )

        # Get edges connecting visible nodes (Hybrid Mode: include if BOTH endpoints visible)
        node_ids = [str(row["id"]) for row in node_rows]
        node_id_set = set(node_ids)

        if node_ids:
            # Fetch edges where both endpoints are visible
            # This ensures the graph is coherent (no dangling edges)
            edges_query = """
                SELECT id, source_id, target_id, relationship_type::text, properties, weight
                FROM relationships
                WHERE project_id = $1
                AND source_id = ANY($2::uuid[])
                AND target_id = ANY($2::uuid[])
                LIMIT $3
            """
            edges_query_started = perf_counter()
            edge_rows = await database.fetch(
                edges_query,
                str(project_id),
                node_ids,
                max_edges,
            )
            _log_query_perf(
                endpoint="get_visualization_data",
                query_name="edges_for_visualization",
                started_at=edges_query_started,
                row_count=len(edge_rows),
                project_id=str(project_id),
            )

            edges = []
            for row in edge_rows:
                edge_props = _parse_json_field(row["properties"])
                # Compute paper_count for CO_OCCURS_WITH from shared papers
                rel_type = _normalize_relationship_type(row["relationship_type"])
                if rel_type == "CO_OCCURS_WITH":
                    src_papers = entity_papers.get(str(row["source_id"]), set())
                    tgt_papers = entity_papers.get(str(row["target_id"]), set())
                    shared = len(src_papers & tgt_papers)
                    edge_props["paper_count"] = shared if shared > 0 else 1
                edges.append(
                    EdgeResponse(
                        id=str(row["id"]),
                        source=str(row["source_id"]),
                        target=str(row["target_id"]),
                        relationship_type=rel_type,
                        properties=edge_props,
                        weight=row["weight"] or 1.0,
                    )
                )

            logger.info(f"Visualization: {len(nodes)} nodes, {len(edges)} edges (both endpoints visible)")
        else:
            edges = []

        _log_query_perf(
            endpoint="get_visualization_data",
            query_name="total_endpoint",
            started_at=endpoint_started,
            row_count=(len(nodes) + len(edges)),
            project_id=str(project_id),
        )
        return GraphDataResponse(nodes=nodes, edges=edges)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get visualization data: {e}")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please try again later."
        )


@router.get("/subgraph/{node_id}", response_model=GraphDataResponse)
async def get_subgraph(
    node_id: str,
    depth: int = Query(1, le=3),
    max_nodes: int = Query(50, le=200),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get subgraph centered around a specific node using BFS traversal. Requires auth in production."""
    try:
        endpoint_started = perf_counter()
        # Validate node exists
        center_query_started = perf_counter()
        center_node = await database.fetchrow(
            """
            SELECT id, entity_type::text, name, properties, project_id
            FROM entities
            WHERE id = $1
            """,
            node_id,
        )
        _log_query_perf(
            endpoint="get_subgraph",
            query_name="center_node_lookup",
            started_at=center_query_started,
            row_count=1 if center_node else 0,
        )

        if not center_node:
            raise HTTPException(status_code=404, detail="Node not found")

        project_id = UUID(str(center_node["project_id"]))

        # Verify project access
        await verify_project_access(database, project_id, current_user, "access")

        # BFS to find connected nodes
        visited_ids = {node_id}
        current_level = [node_id]

        for _ in range(depth):
            if len(visited_ids) >= max_nodes:
                break

            # Find neighbors
            neighbors_query = """
                SELECT DISTINCT
                    CASE WHEN source_id::text = ANY($1) THEN target_id ELSE source_id END as neighbor_id
                FROM relationships
                WHERE project_id = $2
                AND (source_id::text = ANY($1) OR target_id::text = ANY($1))
            """
            neighbor_query_started = perf_counter()
            neighbor_rows = await database.fetch(
                neighbors_query,
                current_level,
                str(project_id),
            )
            _log_query_perf(
                endpoint="get_subgraph",
                query_name="neighbor_expansion",
                started_at=neighbor_query_started,
                row_count=len(neighbor_rows),
                project_id=str(project_id),
            )

            next_level = []
            for row in neighbor_rows:
                neighbor_id = str(row["neighbor_id"])
                if neighbor_id not in visited_ids:
                    visited_ids.add(neighbor_id)
                    next_level.append(neighbor_id)
                    if len(visited_ids) >= max_nodes:
                        break

            current_level = next_level

        # Get all nodes
        subgraph_nodes_started = perf_counter()
        node_rows = await database.fetch(
            """
            SELECT id, entity_type::text, name, properties
            FROM entities
            WHERE id = ANY($1::uuid[])
            """,
            list(visited_ids),
        )
        _log_query_perf(
            endpoint="get_subgraph",
            query_name="subgraph_nodes",
            started_at=subgraph_nodes_started,
            row_count=len(node_rows),
            project_id=str(project_id),
        )

        nodes = [
            NodeResponse(
                id=str(row["id"]),
                entity_type=row["entity_type"],
                name=row["name"],
                properties=_parse_json_field(row["properties"]),
            )
            for row in node_rows
        ]

        # Get edges between visited nodes
        subgraph_edges_started = perf_counter()
        edge_rows = await database.fetch(
            """
            SELECT id, source_id, target_id, relationship_type::text, properties, weight
            FROM relationships
            WHERE project_id = $1
            AND source_id = ANY($2::uuid[])
            AND target_id = ANY($2::uuid[])
            """,
            str(project_id),
            list(visited_ids),
        )
        _log_query_perf(
            endpoint="get_subgraph",
            query_name="subgraph_edges",
            started_at=subgraph_edges_started,
            row_count=len(edge_rows),
            project_id=str(project_id),
        )

        edges = [
            EdgeResponse(
                id=str(row["id"]),
                source=str(row["source_id"]),
                target=str(row["target_id"]),
                relationship_type=_normalize_relationship_type(row["relationship_type"]),
                properties=_parse_json_field(row["properties"]),
                weight=row["weight"] or 1.0,
            )
            for row in edge_rows
        ]

        _log_query_perf(
            endpoint="get_subgraph",
            query_name="total_endpoint",
            started_at=endpoint_started,
            row_count=(len(nodes) + len(edges)),
            project_id=str(project_id),
        )
        return GraphDataResponse(nodes=nodes, edges=edges)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get subgraph: {e}")
        raise HTTPException(status_code=500, detail="Failed to get subgraph")


@router.post("/search", response_model=List[NodeResponse])
async def search_nodes(
    request: SearchRequest,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Search nodes by query string. Requires auth in production."""
    # Require authentication
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    # If project_id is provided, verify access
    if request.project_id:
        await verify_project_access(
            database, UUID(request.project_id), current_user, "search"
        )

    try:
        query_lower = request.query.lower()
        params = [f"%{query_lower}%", request.limit]

        if request.project_id:
            project_filter = "AND project_id = $3"
            params.append(request.project_id)
        else:
            # Only search in accessible projects
            project_filter = """
                AND project_id IN (
                    SELECT p.id FROM projects p
                    LEFT JOIN project_collaborators pc ON p.id = pc.project_id
                    LEFT JOIN team_projects tp ON p.id = tp.project_id
                    LEFT JOIN team_members tm ON tp.team_id = tm.team_id
                    WHERE p.owner_id = $3
                       OR pc.user_id = $3
                       OR tm.user_id = $3
                       OR p.visibility = 'public'
                )
                """
            params.append(current_user.id)

        if request.entity_types:
            type_offset = len(params) + 1
            type_placeholders = ", ".join(f"${i}" for i in range(type_offset, type_offset + len(request.entity_types)))
            type_filter = f"AND entity_type::text IN ({type_placeholders})"
            params.extend(request.entity_types)
        else:
            type_filter = ""

        search_started = perf_counter()
        rows = await database.fetch(
            f"""
            SELECT id, entity_type::text, name, properties
            FROM entities
            WHERE LOWER(name) LIKE $1 {project_filter} {type_filter}
            ORDER BY
                CASE WHEN LOWER(name) = $1 THEN 0 ELSE 1 END,
                LENGTH(name)
            LIMIT $2
            """,
            *params,
        )
        _log_query_perf(
            endpoint="search_nodes",
            query_name="entity_name_like_search",
            started_at=search_started,
            row_count=len(rows),
            project_id=request.project_id,
        )

        return [
            NodeResponse(
                id=str(row["id"]),
                entity_type=row["entity_type"],
                name=row["name"],
                properties=_parse_json_field(row["properties"]),
            )
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to search nodes: {e}")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please try again later."
        )


@router.get("/similar/{node_id}", response_model=List[NodeResponse])
async def get_similar_nodes(
    node_id: str,
    limit: int = Query(10, le=50),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get similar nodes using pgvector similarity search. Requires auth in production."""
    try:
        # Get the source node and its embedding
        source_node = await database.fetchrow(
            """
            SELECT id, entity_type::text, name, properties, embedding, project_id
            FROM entities
            WHERE id = $1
            """,
            node_id,
        )

        if not source_node:
            raise HTTPException(status_code=404, detail="Node not found")

        project_id = UUID(str(source_node["project_id"]))

        # Verify project access
        await verify_project_access(database, project_id, current_user, "access")

        if source_node["embedding"] is None:
            # Fallback: return nodes of same type
            rows = await database.fetch(
                """
                SELECT id, entity_type::text, name, properties
                FROM entities
                WHERE project_id = $1
                AND entity_type::text = $2
                AND id != $3
                LIMIT $4
                """,
                str(source_node["project_id"]),
                source_node["entity_type"],
                node_id,
                limit,
            )
        else:
            # Use pgvector cosine similarity
            rows = await database.fetch(
                """
                SELECT id, entity_type::text, name, properties,
                       1 - (embedding <=> $1) as similarity
                FROM entities
                WHERE project_id = $2
                AND id != $3
                AND embedding IS NOT NULL
                ORDER BY embedding <=> $1
                LIMIT $4
                """,
                source_node["embedding"],
                str(source_node["project_id"]),
                node_id,
                limit,
            )

        return [
            NodeResponse(
                id=str(row["id"]),
                entity_type=row["entity_type"],
                name=row["name"],
                properties=_parse_json_field(row["properties"]),
            )
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get similar nodes: {e}")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please try again later."
        )


@router.get("/gaps/{project_id}", response_model=List[NodeResponse])
async def get_research_gaps(
    project_id: UUID,
    min_papers: int = Query(3, description="Concepts with fewer papers are gaps"),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Identify research gaps - concepts with few connected papers. Requires auth in production."""
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    try:
        # Find concepts with few paper connections
        rows = await database.fetch(
            """
            SELECT e.id, e.entity_type::text, e.name, e.properties,
                   COUNT(r.id) as paper_count
            FROM entities e
            LEFT JOIN relationships r ON (
                r.source_id = e.id OR r.target_id = e.id
            )
            LEFT JOIN entities paper ON (
                (paper.id = r.source_id OR paper.id = r.target_id)
                AND paper.id != e.id
                AND paper.entity_type = 'Paper'
            )
            WHERE e.project_id = $1
            AND e.entity_type = 'Concept'
            GROUP BY e.id, e.entity_type, e.name, e.properties
            HAVING COUNT(paper.id) < $2
            ORDER BY COUNT(paper.id) ASC, e.name
            LIMIT 20
            """,
            str(project_id),
            min_papers,
        )

        return [
            NodeResponse(
                id=str(row["id"]),
                entity_type=row["entity_type"],
                name=row["name"],
                properties={
                    **(row["properties"] or {}),
                    "paper_count": row["paper_count"],
                    "is_gap": True,
                },
            )
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get research gaps: {e}")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please try again later."
        )


@router.get("/entity/{entity_id}", response_model=NodeResponse)
async def get_entity(
    entity_id: str,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get a single entity by ID. Requires auth in production."""
    try:
        row = await database.fetchrow(
            """
            SELECT id, entity_type::text, name, properties, project_id
            FROM entities
            WHERE id = $1
            """,
            entity_id,
        )

        if not row:
            raise HTTPException(status_code=404, detail="Entity not found")

        project_id = UUID(str(row["project_id"]))

        # Verify project access
        await verify_project_access(database, project_id, current_user, "access")

        return NodeResponse(
            id=str(row["id"]),
            entity_type=row["entity_type"],
            name=row["name"],
            properties=_parse_json_field(row["properties"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get entity: {e}")
        raise HTTPException(status_code=500, detail="Failed to get entity")


# ============================================
# Gap Detection API (InfraNodus-style)
# ============================================

class ConceptClusterResponse(BaseModel):
    cluster_id: Optional[int] = None
    concepts: List[str]
    concept_names: List[str]
    size: int
    density: float
    label: Optional[str] = None


class PotentialEdgeResponse(BaseModel):
    """Potential (ghost) edge between clusters for visualization."""
    source_id: str
    target_id: str
    similarity: float
    gap_id: str
    source_name: Optional[str] = None
    target_name: Optional[str] = None


class StructuralGapResponse(BaseModel):
    id: str
    cluster_a_id: int
    cluster_b_id: int
    cluster_a_concepts: List[str]
    cluster_b_concepts: List[str]
    cluster_a_names: List[str]
    cluster_b_names: List[str]
    gap_strength: float
    bridge_candidates: List[str]
    research_questions: List[str]
    potential_edges: List[PotentialEdgeResponse] = []  # Ghost edges for visualization
    # v0.31.0: Research Frontier scores
    impact_score: float = 0.0
    feasibility_score: float = 0.0
    research_significance: str = ""
    quadrant: str = ""


class CentralityMetricsResponse(BaseModel):
    concept_id: str
    concept_name: str
    degree_centrality: float
    betweenness_centrality: float
    pagerank: float
    cluster_id: Optional[int] = None


class GapAnalysisResponse(BaseModel):
    clusters: List[ConceptClusterResponse]
    gaps: List[StructuralGapResponse]
    centrality_metrics: List[CentralityMetricsResponse]
    total_concepts: int
    total_relationships: int
    # v0.9.0: Reason code when gaps is empty
    no_gaps_reason: Optional[str] = None  # "no_clusters", "not_analyzed", "well_connected"


@router.get("/gaps/{project_id}/analysis", response_model=GapAnalysisResponse)
async def get_gap_analysis(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get full gap analysis including clusters, gaps, and centrality metrics. Requires auth in production."""
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    try:
        # Get clusters
        cluster_rows = await database.fetch(
            """
            SELECT cluster_id, concepts, concept_names, size, density, label
            FROM concept_clusters
            WHERE project_id = $1
            ORDER BY cluster_id
            """,
            str(project_id),
        )

        clusters = [
            ConceptClusterResponse(
                cluster_id=row["cluster_id"],
                concepts=[str(c) for c in (row["concepts"] or [])],  # Convert UUIDs to strings
                concept_names=row["concept_names"] or [],
                size=row["size"],
                density=row["density"] or 0.0,
                label=row["label"],
            )
            for row in cluster_rows
        ]

        # Get structural gaps
        gap_rows = await database.fetch(
            """
            SELECT id, cluster_a_id, cluster_b_id,
                   cluster_a_concepts, cluster_b_concepts,
                   cluster_a_names, cluster_b_names,
                   gap_strength, bridge_candidates, research_questions, potential_edges
            FROM structural_gaps
            WHERE project_id = $1
            ORDER BY gap_strength DESC
            """,
            str(project_id),
        )

        gaps = []
        for row in gap_rows:
            # Parse potential_edges from JSON
            potential_edges_data = row.get("potential_edges")
            if potential_edges_data:
                if isinstance(potential_edges_data, str):
                    potential_edges_data = json.loads(potential_edges_data)
                potential_edges = [
                    PotentialEdgeResponse(**pe) for pe in (potential_edges_data or [])
                ]
            else:
                potential_edges = []

            gaps.append(
                StructuralGapResponse(
                    id=str(row["id"]),
                    cluster_a_id=row["cluster_a_id"],
                    cluster_b_id=row["cluster_b_id"],
                    cluster_a_concepts=row["cluster_a_concepts"] or [],
                    cluster_b_concepts=row["cluster_b_concepts"] or [],
                    cluster_a_names=row["cluster_a_names"] or [],
                    cluster_b_names=row["cluster_b_names"] or [],
                    gap_strength=row["gap_strength"] or 0.0,
                    bridge_candidates=row["bridge_candidates"] or [],
                    research_questions=row["research_questions"] or [],
                    potential_edges=potential_edges,
                )
            )

        # v0.31.0: Compute Research Frontier scores
        cluster_size_map = {c.cluster_id: c.size for c in clusters}
        max_cluster_product = 1
        for g in gaps:
            product = cluster_size_map.get(g.cluster_a_id, 1) * cluster_size_map.get(g.cluster_b_id, 1)
            if product > max_cluster_product:
                max_cluster_product = product

        # Pre-fetch centrality for scoring
        _centrality_rows = await database.fetch(
            """
            SELECT name, properties
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            AND properties->>'centrality_pagerank' IS NOT NULL
            LIMIT 200
            """,
            str(project_id),
        )
        centrality_map = {}
        for _cr in _centrality_rows:
            _props = _parse_json_field(_cr["properties"])
            centrality_map[_cr["name"]] = _safe_float(_props.get("centrality_pagerank", 0))

        for g in gaps:
            # Impact: cluster size, bridge count, centrality, type diversity
            c_a_size = cluster_size_map.get(g.cluster_a_id, 1)
            c_b_size = cluster_size_map.get(g.cluster_b_id, 1)
            size_product = c_a_size * c_b_size
            bridge_factor = min(len(g.bridge_candidates), 10) / 10.0

            # Centrality factor from cluster concepts
            avg_pr_a = 0.0
            if g.cluster_a_names:
                pr_vals = [centrality_map.get(c, 0) for c in g.cluster_a_names]
                avg_pr_a = sum(pr_vals) / len(pr_vals) if pr_vals else 0
            avg_pr_b = 0.0
            if g.cluster_b_names:
                pr_vals = [centrality_map.get(c, 0) for c in g.cluster_b_names]
                avg_pr_b = sum(pr_vals) / len(pr_vals) if pr_vals else 0
            centrality_factor = (avg_pr_a + avg_pr_b) / 2.0

            # Type diversity: count unique entity types in bridge candidates
            type_diversity = 0.0
            if g.bridge_candidates:
                # Normalize: up to 8 types possible
                unique_count = min(len(set(g.bridge_candidates)), 8)
                type_diversity = unique_count / 8.0

            # Non-linear size scaling
            size_ratio = (size_product / max(max_cluster_product, 1)) ** 0.5
            raw_impact = size_ratio * 0.25 + bridge_factor * 0.25 + centrality_factor * 0.3 + type_diversity * 0.2
            g.impact_score = round(min(1.0, max(0.0, raw_impact)), 3)

            # Feasibility: similarity distribution, bridge availability, gap weakness
            if g.potential_edges:
                high_sim_count = sum(1 for pe in g.potential_edges if pe.similarity > 0.5)
                sim_ratio = high_sim_count / max(len(g.potential_edges), 1)
                sims = [pe.similarity for pe in g.potential_edges]
                sorted_sims = sorted(sims)
                median_sim = sorted_sims[len(sorted_sims) // 2]
                sim_spread = max(sims) - min(sims) if len(sims) > 1 else 0.0
            else:
                sim_ratio = 0.3
                median_sim = 0.0
                sim_spread = 0.0
            bridge_avail = min(len(g.bridge_candidates), 5) / 5.0
            raw_feasibility = sim_ratio * 0.25 + median_sim * 0.2 + bridge_avail * 0.2 + (1.0 - g.gap_strength) * 0.15 + sim_spread * 0.2
            g.feasibility_score = round(min(1.0, max(0.0, raw_feasibility)), 3)

            # Quadrant
            hi = g.impact_score >= 0.5
            hf = g.feasibility_score >= 0.5
            if hi and hf:
                g.quadrant = "high_impact_high_feasibility"
            elif hi and not hf:
                g.quadrant = "high_impact_low_feasibility"
            elif not hi and hf:
                g.quadrant = "low_impact_high_feasibility"
            else:
                g.quadrant = "low_impact_low_feasibility"

            # Research significance
            a_label = next((c.label or f"Cluster {c.cluster_id}" for c in clusters if c.cluster_id == g.cluster_a_id), f"Cluster {g.cluster_a_id}")
            b_label = next((c.label or f"Cluster {c.cluster_id}" for c in clusters if c.cluster_id == g.cluster_b_id), f"Cluster {g.cluster_b_id}")
            a_names = ", ".join(g.cluster_a_names[:2]) if g.cluster_a_names else a_label
            b_names = ", ".join(g.cluster_b_names[:2]) if g.cluster_b_names else b_label
            g.research_significance = f"Unexplored connection between {a_names} and {b_names} presents a new interdisciplinary research opportunity."

        # Get centrality metrics from entities
        centrality_rows = await database.fetch(
            """
            SELECT id, name, properties
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            AND properties->>'centrality_degree' IS NOT NULL
            ORDER BY CASE WHEN properties->>'centrality_pagerank' ~ '^-?\\d+(\\.\\d+)?$'
                          THEN (properties->>'centrality_pagerank')::float
                          ELSE 0 END DESC NULLS LAST
            LIMIT 100
            """,
            str(project_id),
        )

        centrality_metrics = [
            CentralityMetricsResponse(
                concept_id=str(row["id"]),
                concept_name=row["name"],
                degree_centrality=_safe_float(row["properties"].get("centrality_degree", 0)),
                betweenness_centrality=_safe_float(row["properties"].get("centrality_betweenness", 0)),
                pagerank=_safe_float(row["properties"].get("centrality_pagerank", 0)),
                cluster_id=row["properties"].get("cluster_id"),
            )
            for row in centrality_rows
        ]

        # Get totals
        concept_count = await database.fetchval(
            """
            SELECT COUNT(*) FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            """,
            str(project_id),
        )

        relationship_count = await database.fetchval(
            """
            SELECT COUNT(*) FROM relationships
            WHERE project_id = $1
            """,
            str(project_id),
        )

        # v0.9.0: Determine reason when no gaps found
        no_gaps_reason = None
        if len(gaps) == 0:
            if len(clusters) < 2:
                no_gaps_reason = "no_clusters"
            else:
                no_gaps_reason = "well_connected"  # Clusters exist but all are well-connected

        return GapAnalysisResponse(
            clusters=clusters,
            gaps=gaps,
            centrality_metrics=centrality_metrics,
            total_concepts=concept_count or 0,
            total_relationships=relationship_count or 0,
            no_gaps_reason=no_gaps_reason,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get gap analysis: {e}")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please try again later."
        )


@router.post("/gaps/{project_id}/refresh", response_model=GapAnalysisResponse)
async def refresh_gap_analysis(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Re-run gap detection on the project's concept graph. Requires auth in production."""
    # Verify project access
    await verify_project_access(database, project_id, current_user, "modify")

    try:
        from graph.gap_detector import GapDetector
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer

        min_concepts_for_embedding_path = 10
        max_concepts_for_gap = 1200
        max_tfidf_features = 64

        # Get all concepts with embeddings
        # Try to get concepts with embeddings first
        concept_rows = await database.fetch(
            """
            SELECT id, name, properties, embedding
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            AND embedding IS NOT NULL
            ORDER BY id
            LIMIT $2
            """,
            str(project_id),
            max_concepts_for_gap,
        )

        use_tfidf_fallback = False

        if not concept_rows or len(concept_rows) < min_concepts_for_embedding_path:
            # TF-IDF fallback: fetch all concepts regardless of embedding status
            logger.warning(
                "Only %d concepts with embeddings (need %d+). Using TF-IDF fallback.",
                len(concept_rows) if concept_rows else 0,
                min_concepts_for_embedding_path,
            )
            all_concept_rows = await database.fetch(
                """
                SELECT id, name, properties
                FROM entities
                WHERE project_id = $1
                AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                ORDER BY id
                LIMIT $2
                """,
                str(project_id),
                max_concepts_for_gap,
            )

            if not all_concept_rows or len(all_concept_rows) < 3:
                return GapAnalysisResponse(
                    clusters=[],
                    gaps=[],
                    centrality_metrics=[],
                    total_concepts=len(all_concept_rows) if all_concept_rows else 0,
                    total_relationships=0,
                    no_gaps_reason="insufficient_concepts",
                )

            # Generate TF-IDF pseudo-embeddings
            try:
                concept_names = [(r["name"] or "").strip() for r in all_concept_rows]
                concept_names = [n if n else f"concept_{all_concept_rows[i]['id'][:8]}" for i, n in enumerate(concept_names)]
                vectorizer = TfidfVectorizer(
                    max_features=max_tfidf_features,
                    stop_words='english',
                    dtype=np.float32,
                )
                tfidf_matrix = vectorizer.fit_transform(concept_names)
                feature_count = tfidf_matrix.shape[1]
                if feature_count == 0:
                    raise ValueError("TF-IDF produced zero features")

                # Create synthetic concept_rows with TF-IDF embeddings
                concept_rows = []
                for i, row in enumerate(all_concept_rows):
                    concept_rows.append({
                        "id": row["id"],
                        "name": row["name"],
                        "properties": row["properties"],
                        "embedding": tfidf_matrix.getrow(i).toarray().astype(np.float32, copy=False).ravel().tolist(),
                    })
                use_tfidf_fallback = True
                logger.info(
                    "TF-IDF fallback: generated pseudo-embeddings for %d concepts "
                    "(features=%d, concept_cap=%d)",
                    len(concept_rows),
                    feature_count,
                    max_concepts_for_gap,
                )
            except Exception as e:
                logger.error(f"TF-IDF fallback failed: {e}")
                return GapAnalysisResponse(
                    clusters=[],
                    gaps=[],
                    centrality_metrics=[],
                    total_concepts=len(all_concept_rows),
                    total_relationships=0,
                    no_gaps_reason="embedding_unavailable",
                )

        # Get relationships
        relationship_rows = await database.fetch(
            """
            SELECT id, source_id, target_id, relationship_type::text, properties
            FROM relationships
            WHERE project_id = $1
            """,
            str(project_id),
        )

        # Convert to format expected by GapDetector
        concepts = []
        for row in concept_rows:
            if use_tfidf_fallback:
                embedding = row["embedding"]  # Already a list from TF-IDF
            else:
                embedding = _parse_embedding(row["embedding"]) or None
            concepts.append({
                "id": str(row["id"]),
                "name": row["name"],
                "embedding": embedding,
                "properties": row.get("properties") or {},
            })

        relationships = [
            {
                "id": str(row["id"]),
                "source_id": str(row["source_id"]),  # Fixed: was "source", gap_detector expects "source_id"
                "target_id": str(row["target_id"]),  # Fixed: was "target", gap_detector expects "target_id"
                "type": row["relationship_type"],
                "properties": row["properties"] or {},
            }
            for row in relationship_rows
        ]

        # Run gap detection
        from llm.user_provider import create_llm_provider_for_user
        user_id = str(current_user.id) if current_user else None
        llm = await create_llm_provider_for_user(user_id)
        gap_detector = GapDetector(llm_provider=llm)
        analysis = await gap_detector.analyze_graph(concepts, relationships)

        # Store results
        # Clear old data
        await database.execute(
            "DELETE FROM concept_clusters WHERE project_id = $1",
            str(project_id),
        )
        await database.execute(
            "DELETE FROM structural_gaps WHERE project_id = $1",
            str(project_id),
        )

        # Store clusters
        # Build concept id -> name mapping for lookup
        concept_name_map = {c["id"]: c["name"] for c in concepts}

        # Build edge pairs for intra-cluster density computation
        edge_pairs = [
            (rel["source_id"], rel["target_id"])
            for rel in relationships
        ]

        for cluster in analysis.get("clusters", []):
            # Get concept names from the mapping
            cluster_concept_names = [
                concept_name_map.get(cid, "")
                for cid in cluster.concept_ids
            ]

            # Generate meaningful label using LLM (with fallback)
            if cluster.keywords:
                label = await gap_detector._generate_cluster_label(cluster.keywords)
            elif cluster_concept_names:
                filtered_names = [n for n in cluster_concept_names if n and n.strip()]
                label = ", ".join(filtered_names[:3]) if filtered_names else f"Cluster {cluster.id + 1}"
            else:
                label = f"Cluster {cluster.id + 1}"

            # Compute intra-cluster edge density
            cluster_node_ids = set(str(cid) for cid in cluster.concept_ids)
            n = len(cluster_node_ids)
            if n >= 2:
                intra_edges = sum(
                    1 for src, tgt in edge_pairs
                    if src in cluster_node_ids and tgt in cluster_node_ids
                )
                max_edges = n * (n - 1) / 2
                density = intra_edges / max_edges if max_edges > 0 else 0.0
            else:
                density = 0.0

            logger.info(f"Storing cluster {cluster.id}: {len(cluster.concept_ids)} concepts, name={cluster.name}, label={label}, density={density:.3f}")

            await database.execute(
                """
                INSERT INTO concept_clusters (project_id, cluster_id, concepts, concept_names, size, density, label)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                str(project_id),
                cluster.id,  # ConceptCluster uses 'id' not 'cluster_id'
                [str(cid) for cid in cluster.concept_ids],  # Convert to strings for TEXT[]
                cluster_concept_names,  # Derived from concept_ids
                len(cluster.concept_ids),  # Computed size
                density,  # Actual intra-cluster edge density
                label,
            )

        # Store gaps
        for gap in analysis.get("gaps", []):
            # Convert potential_edges to JSON-serializable format
            potential_edges_json = [
                {
                    "source_id": pe.source_id,
                    "target_id": pe.target_id,
                    "similarity": pe.similarity,
                    "gap_id": pe.gap_id,
                    "source_name": pe.source_name,
                    "target_name": pe.target_name,
                }
                for pe in (gap.potential_edges or [])
            ]

            # Convert concept IDs to sets for efficient lookup
            concept_ids_a = set(str(cid) for cid in gap.concept_a_ids)
            concept_ids_b = set(str(cid) for cid in gap.concept_b_ids)
            a_names = [c["name"] for c in concepts if c["id"] in concept_ids_a and c["name"]][:5]
            b_names = [c["name"] for c in concepts if c["id"] in concept_ids_b and c["name"]][:5]

            # Fallback 1: cluster keywords
            if not a_names:
                cl_a = next((cl for cl in analysis.get("clusters", [])
                             if cl.id == gap.cluster_a_id), None)
                if cl_a and cl_a.keywords:
                    a_names = [k for k in cl_a.keywords[:3] if k and k.strip()]
            if not b_names:
                cl_b = next((cl for cl in analysis.get("clusters", [])
                             if cl.id == gap.cluster_b_id), None)
                if cl_b and cl_b.keywords:
                    b_names = [k for k in cl_b.keywords[:3] if k and k.strip()]

            # Fallback 2: default label
            if not a_names:
                a_names = [f"Cluster {gap.cluster_a_id + 1}"]
            if not b_names:
                b_names = [f"Cluster {gap.cluster_b_id + 1}"]

            await database.execute(
                """
                INSERT INTO structural_gaps (
                    project_id, cluster_a_id, cluster_b_id,
                    cluster_a_concepts, cluster_b_concepts,
                    cluster_a_names, cluster_b_names,
                    gap_strength, bridge_candidates, research_questions, potential_edges
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                str(project_id),
                gap.cluster_a_id,
                gap.cluster_b_id,
                list(concept_ids_a),
                list(concept_ids_b),
                a_names,
                b_names,
                gap.gap_strength,
                # v0.29.0: Store concept names instead of UUIDs for bridge_candidates
                [c["name"] for c in concepts
                 if c["id"] in set(gap.bridge_concepts or []) and c["name"]]
                or gap.bridge_concepts or [],
                gap.suggested_research_questions or [],
                json.dumps(potential_edges_json),
            )

        # Update entity centrality
        for metric in analysis.get("centrality_metrics", []):
            await database.execute(
                """
                UPDATE entities
                SET properties = properties || $1::jsonb
                WHERE id = $2
                """,
                {
                    "centrality_degree": metric.degree_centrality,
                    "centrality_betweenness": metric.betweenness_centrality,
                    "centrality_pagerank": metric.pagerank,
                },
                metric.concept_id,
            )

        await metrics_cache.invalidate_project(str(project_id))

        # Return updated analysis
        return await get_gap_analysis(project_id, database, current_user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to refresh gap analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to refresh gap analysis. Please try again later.")


@router.get("/gaps/detail/{gap_id}", response_model=StructuralGapResponse)
async def get_gap_detail(
    gap_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get detailed information about a specific structural gap. Requires auth in production."""
    try:
        row = await database.fetchrow(
            """
            SELECT id, cluster_a_id, cluster_b_id,
                   cluster_a_concepts, cluster_b_concepts,
                   cluster_a_names, cluster_b_names,
                   gap_strength, bridge_candidates, research_questions,
                   potential_edges, project_id
            FROM structural_gaps
            WHERE id = $1
            """,
            str(gap_id),
        )

        if not row:
            raise HTTPException(status_code=404, detail="Gap not found")

        project_id = UUID(str(row["project_id"]))

        # Verify project access
        await verify_project_access(database, project_id, current_user, "access")

        # Parse potential_edges from JSON
        potential_edges_data = row.get("potential_edges")
        if potential_edges_data:
            if isinstance(potential_edges_data, str):
                potential_edges_data = json.loads(potential_edges_data)
            potential_edges = [
                PotentialEdgeResponse(**pe) for pe in (potential_edges_data or [])
            ]
        else:
            potential_edges = []

        return StructuralGapResponse(
            id=str(row["id"]),
            cluster_a_id=row["cluster_a_id"],
            cluster_b_id=row["cluster_b_id"],
            cluster_a_concepts=row["cluster_a_concepts"] or [],
            cluster_b_concepts=row["cluster_b_concepts"] or [],
            cluster_a_names=row["cluster_a_names"] or [],
            cluster_b_names=row["cluster_b_names"] or [],
            gap_strength=row["gap_strength"] or 0.0,
            bridge_candidates=row["bridge_candidates"] or [],
            research_questions=row["research_questions"] or [],
            potential_edges=potential_edges,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get gap detail: {e}")
        raise HTTPException(status_code=500, detail="Failed to get gap detail")


# ============================================
# Bridge Hypothesis Generation API (Phase 3)
# ============================================

class BridgeHypothesisResponse(BaseModel):
    """Single bridge hypothesis."""
    title: str
    description: str
    methodology: str
    connecting_concepts: List[str]
    confidence: float


class BridgeGenerationResponse(BaseModel):
    """Response for bridge hypothesis generation."""
    hypotheses: List[BridgeHypothesisResponse]
    bridge_type: str  # "theoretical", "methodological", "empirical"
    key_insight: str
    gap_id: str


@router.post("/gaps/{gap_id}/generate-bridge", response_model=BridgeGenerationResponse)
async def generate_bridge_hypotheses(
    gap_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Generate AI-powered bridge hypotheses to connect two concept clusters.

    This is the core "Generate Bridge Idea" feature - uses LLM to propose
    novel research hypotheses that could bridge the structural gap.

    Returns:
        - hypotheses: List of 3-5 specific, testable research hypotheses
        - bridge_type: "theoretical", "methodological", or "empirical"
        - key_insight: One-sentence summary of the opportunity

    Requires auth in production.
    """
    try:
        # Get gap details
        row = await database.fetchrow(
            """
            SELECT id, cluster_a_id, cluster_b_id,
                   cluster_a_names, cluster_b_names,
                   gap_strength, project_id
            FROM structural_gaps
            WHERE id = $1
            """,
            str(gap_id),
        )

        if not row:
            raise HTTPException(status_code=404, detail="Gap not found")

        project_id = UUID(str(row["project_id"]))

        # Verify project access
        await verify_project_access(database, project_id, current_user, "access")

        cluster_a_names = row["cluster_a_names"] or []
        cluster_b_names = row["cluster_b_names"] or []
        _log_gap_chain_event(
            "bridge_generation_requested",
            project_id=str(project_id),
            gap_id=str(gap_id),
            cluster_a_terms=cluster_a_names,
            cluster_b_terms=cluster_b_names,
            gap_strength=row["gap_strength"],
        )

        # Get LLM provider
        from llm.user_provider import create_llm_provider_for_user
        user_id = str(current_user.id) if current_user else None
        llm = await create_llm_provider_for_user(user_id)

        # Initialize gap detector with LLM
        from graph.gap_detector import GapDetector, StructuralGap as GapModel

        gap_detector = GapDetector(llm_provider=llm)

        # Create gap model
        gap_model = GapModel(
            id=str(gap_id),
            cluster_a_id=row["cluster_a_id"],
            cluster_b_id=row["cluster_b_id"],
            gap_strength=row["gap_strength"],
        )

        # Generate hypotheses
        result = await gap_detector.generate_bridge_hypotheses(
            gap_model,
            cluster_a_names,
            cluster_b_names,
        )

        _log_gap_chain_event(
            "bridge_generation_completed",
            project_id=str(project_id),
            gap_id=str(gap_id),
            bridge_type=result.get("bridge_type", "theoretical"),
            hypothesis_count=len(result.get("hypotheses", [])),
            key_insight=result.get("key_insight", ""),
        )

        # Convert to response model
        hypotheses = [
            BridgeHypothesisResponse(
                title=h["title"],
                description=h["description"],
                methodology=h["methodology"],
                connecting_concepts=h["connecting_concepts"],
                confidence=h["confidence"],
            )
            for h in result.get("hypotheses", [])
        ]

        return BridgeGenerationResponse(
            hypotheses=hypotheses,
            bridge_type=result.get("bridge_type", "theoretical"),
            key_insight=result.get("key_insight", "Connection opportunity detected."),
            gap_id=str(gap_id),
        )

    except HTTPException:
        raise
    except Exception as e:
        _log_gap_chain_event(
            "bridge_generation_failed",
            gap_id=str(gap_id),
            error=str(e),
        )
        logger.error(f"Failed to generate bridge hypotheses: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate bridge hypotheses")


# ============================================
# Bridge Creation API (Phase 6 - Accept Hypothesis)
# ============================================

class BridgeCreationRequest(BaseModel):
    """Request to create a bridge relationship from an accepted hypothesis."""
    hypothesis_title: str
    hypothesis_description: str
    connecting_concepts: List[str]  # List of concept names to connect
    confidence: float = 0.5


class BridgeCreationResponse(BaseModel):
    """Response after creating bridge relationships."""
    success: bool
    relationships_created: int
    relationship_ids: List[str]
    message: str


@router.post("/gaps/{gap_id}/create-bridge", response_model=BridgeCreationResponse)
async def create_bridge_from_hypothesis(
    gap_id: UUID,
    request: BridgeCreationRequest,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Create BRIDGES_GAP relationships between concepts from an accepted hypothesis.

    This endpoint is called when a user accepts a bridge hypothesis. It creates
    new relationships in the knowledge graph connecting concepts from the two
    clusters identified in the structural gap.

    Args:
        gap_id: The structural gap ID
        request: BridgeCreationRequest with hypothesis details and concepts to connect

    Returns:
        BridgeCreationResponse with created relationship IDs

    Requires auth in production.
    """
    try:
        # Get gap details including project_id
        gap_row = await database.fetchrow(
            """
            SELECT id, project_id, cluster_a_concepts, cluster_b_concepts
            FROM structural_gaps
            WHERE id = $1
            """,
            str(gap_id),
        )

        if not gap_row:
            raise HTTPException(status_code=404, detail="Gap not found")

        project_id = UUID(str(gap_row["project_id"]))

        # Verify project access (write access needed)
        await verify_project_access(database, project_id, current_user, "write")
        _log_gap_chain_event(
            "bridge_creation_requested",
            project_id=str(project_id),
            gap_id=str(gap_id),
            hypothesis_title=request.hypothesis_title,
            requested_concepts=request.connecting_concepts,
            confidence=request.confidence,
        )

        # Find concept entities by name
        concept_ids = []
        for concept_name in request.connecting_concepts:
            row = await database.fetchrow(
                """
                SELECT id FROM entities
                WHERE project_id = $1 AND name ILIKE $2 AND entity_type IN ('Concept', 'Method', 'Finding')
                LIMIT 1
                """,
                str(project_id),
                concept_name,
            )
            if row:
                concept_ids.append(str(row["id"]))

        _log_gap_chain_event(
            "bridge_creation_resolved_concepts",
            project_id=str(project_id),
            gap_id=str(gap_id),
            resolved_concept_ids=concept_ids,
        )

        if len(concept_ids) < 2:
            raise HTTPException(
                status_code=400,
                detail=f"Need at least 2 valid concepts to create bridge. Found: {len(concept_ids)}"
            )

        # Create BRIDGES_GAP relationships between consecutive pairs
        import uuid
        relationship_ids = []
        created_count = 0
        reused_count = 0

        for i in range(len(concept_ids) - 1):
            source_id = concept_ids[i]
            target_id = concept_ids[i + 1]

            # Check if relationship already exists
            existing = await database.fetchrow(
                """
                SELECT id FROM relationships
                WHERE project_id = $1
                  AND source_id = $2 AND target_id = $3
                  AND relationship_type = 'BRIDGES_GAP'
                """,
                str(project_id),
                source_id,
                target_id,
            )

            if existing:
                relationship_ids.append(str(existing["id"]))
                reused_count += 1
                continue

            # Create new relationship
            rel_id = str(uuid.uuid4())
            properties = {
                "gap_id": str(gap_id),
                "hypothesis_title": request.hypothesis_title,
                "hypothesis_description": request.hypothesis_description,
                "confidence": request.confidence,
                "ai_generated": True,
            }

            await database.execute(
                """
                INSERT INTO relationships (id, project_id, source_id, target_id, relationship_type, weight, properties)
                VALUES ($1, $2, $3, $4, 'BRIDGES_GAP', $5, $6)
                """,
                rel_id,
                str(project_id),
                source_id,
                target_id,
                request.confidence,
                json.dumps(properties),
            )

            relationship_ids.append(rel_id)
            created_count += 1

        logger.info(f"Created {len(relationship_ids)} bridge relationships for gap {gap_id}")
        _log_gap_chain_event(
            "bridge_creation_completed",
            project_id=str(project_id),
            gap_id=str(gap_id),
            relationships_created=created_count,
            relationships_reused=reused_count,
            relationship_ids=relationship_ids,
        )

        return BridgeCreationResponse(
            success=True,
            relationships_created=len(relationship_ids),
            relationship_ids=relationship_ids,
            message=f"Successfully created {len(relationship_ids)} bridge relationship(s) based on hypothesis: {request.hypothesis_title}",
        )

    except HTTPException:
        raise
    except Exception as e:
        _log_gap_chain_event(
            "bridge_creation_failed",
            gap_id=str(gap_id),
            error=str(e),
        )
        logger.error(f"Failed to create bridge relationships: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create bridge relationships: {str(e)}")


@router.post("/gaps/{gap_id}/questions")
async def generate_gap_questions(
    gap_id: UUID,
    regenerate: bool = False,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Generate or regenerate AI research questions for a gap. Requires auth in production."""
    try:
        # Get gap
        row = await database.fetchrow(
            """
            SELECT id, cluster_a_names, cluster_b_names, research_questions, project_id
            FROM structural_gaps
            WHERE id = $1
            """,
            str(gap_id),
        )

        if not row:
            raise HTTPException(status_code=404, detail="Gap not found")

        project_id = UUID(str(row["project_id"]))

        # Verify project access
        await verify_project_access(database, project_id, current_user, "modify")

        # Return existing if not regenerating
        if not regenerate and row["research_questions"]:
            return {"questions": row["research_questions"]}

        # Generate new questions
        from graph.gap_detector import GapDetector

        gap_detector = GapDetector()

        # Create a minimal StructuralGap object for question generation
        from dataclasses import dataclass

        @dataclass
        class MinimalGap:
            cluster_a_id: int = 0
            cluster_b_id: int = 1
            gap_strength: float = 0.5

        questions = await gap_detector.generate_research_questions(
            MinimalGap(),
            row["cluster_a_names"],
            row["cluster_b_names"],
        )

        # Store questions
        await database.execute(
            """
            UPDATE structural_gaps
            SET research_questions = $1
            WHERE id = $2
            """,
            questions,
            str(gap_id),
        )

        return {"questions": questions}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate gap questions: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate questions")


# ============================================================
# Gap-Based Paper Recommendations
# ============================================================

class RecommendedPaperResponse(BaseModel):
    title: str
    year: Optional[int] = None
    citation_count: int = 0
    url: Optional[str] = None
    abstract_snippet: str = ""

class GapRecommendationsResponse(BaseModel):
    gap_id: str
    query_used: str
    papers: List[RecommendedPaperResponse]


class GapBridgeRelationshipTraceResponse(BaseModel):
    relationship_id: str
    source_name: str
    target_name: str
    confidence: float = 0.0
    hypothesis_title: Optional[str] = None
    ai_generated: bool = False


class GapRecommendationTraceResponse(BaseModel):
    status: str  # success | rate_limited | timeout | failed
    query_used: str
    retry_after_seconds: Optional[int] = None
    error: Optional[str] = None
    papers: List[RecommendedPaperResponse] = []


class GapReproReportResponse(BaseModel):
    project_id: str
    gap_id: str
    generated_at: str
    gap_strength: float
    cluster_a_names: List[str]
    cluster_b_names: List[str]
    bridge_candidates: List[str]
    research_questions: List[str]
    bridge_relationships: List[GapBridgeRelationshipTraceResponse]
    recommendation: GapRecommendationTraceResponse


_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-', re.IGNORECASE)


def _build_gap_recommendation_query(
    bridge_candidates: List[str],
    cluster_a_names: List[str],
    cluster_b_names: List[str],
) -> str:
    """Build a concise, Semantic Scholar-friendly search query from gap metadata.

    v0.19.0: Filter empty strings and avoid literal 'research gap' fallback.
    v0.20.0: Improved to produce better academic search terms by limiting to
    the most specific bridge candidates and cross-cluster concept pairs.
    v0.29.0: Filter UUID patterns from bridge_candidates (legacy data stored IDs instead of names).
    Returns empty string if no meaningful terms available (caller should skip S2 call).
    """
    # Try bridge candidates first (most specific), filtering out UUIDs
    parts = [c.strip() for c in (bridge_candidates or [])[:3]
             if c and c.strip() and not _UUID_RE.match(c.strip())]
    if parts:
        return " ".join(parts)

    # Combine top concepts from both clusters for cross-cluster search
    a_names = [n.strip() for n in (cluster_a_names or [])[:2] if n and n.strip()]
    b_names = [n.strip() for n in (cluster_b_names or [])[:2] if n and n.strip()]

    if a_names and b_names:
        return f"{a_names[0]} {b_names[0]}"

    # Use whatever is available
    available = a_names or b_names
    if available:
        return " ".join(available[:3])

    # Return empty instead of literal "research gap"
    return ""


async def _fetch_gap_recommendations_bundle(
    *,
    query: str,
    limit: int,
    project_id: UUID,
    gap_id: UUID,
    current_user: Optional[User],
    strict_rate_limit: bool = False,
):
    """
    Fetch Semantic Scholar recommendations with consistent status envelope.

    strict_rate_limit=True re-raises SemanticScholarRateLimitError so callers
    can map it to HTTP 429.
    """
    import asyncio
    from integrations.semantic_scholar import (
        SemanticScholarClient,
        SemanticScholarRateLimitError,
    )

    papers: List[RecommendedPaperResponse] = []
    status = "success"
    retry_after_seconds: Optional[int] = None
    error_message: Optional[str] = None

    try:
        s2_key = await get_effective_api_key(
            current_user,
            "semantic_scholar",
            settings.semantic_scholar_api_key,
        )
        async with SemanticScholarClient(api_key=s2_key or None) as client:
            results = await asyncio.wait_for(
                client.search_papers(query=query, limit=limit),
                timeout=15.0,
            )
            for p in results:
                url = None
                if p.doi:
                    url = f"https://doi.org/{p.doi}"
                elif p.arxiv_id:
                    url = f"https://arxiv.org/abs/{p.arxiv_id}"

                snippet = ""
                if p.abstract:
                    snippet = p.abstract[:200] + ("..." if len(p.abstract) > 200 else "")

                papers.append(
                    RecommendedPaperResponse(
                        title=p.title,
                        year=p.year,
                        citation_count=p.citation_count,
                        url=url,
                        abstract_snippet=snippet,
                    )
                )

        _log_gap_chain_event(
            "recommendation_fetch_completed",
            project_id=str(project_id),
            gap_id=str(gap_id),
            query=query,
            papers_returned=len(papers),
        )
    except SemanticScholarRateLimitError as e:
        status = "rate_limited"
        retry_after_seconds = e.retry_after
        error_message = "Semantic Scholar rate limited. Please retry later."
        _log_gap_chain_event(
            "recommendation_fetch_rate_limited",
            project_id=str(project_id),
            gap_id=str(gap_id),
            query=query,
            retry_after_seconds=e.retry_after,
        )
        if strict_rate_limit:
            raise
    except asyncio.TimeoutError as e:
        status = "timeout"
        error_message = str(e)
        _log_gap_chain_event(
            "recommendation_fetch_timeout",
            project_id=str(project_id),
            gap_id=str(gap_id),
            query=query,
            error=str(e),
        )
    except Exception as e:
        status = "failed"
        error_message = str(e)
        _log_gap_chain_event(
            "recommendation_fetch_failed",
            project_id=str(project_id),
            gap_id=str(gap_id),
            query=query,
            error=str(e),
        )

    return {
        "status": status,
        "retry_after_seconds": retry_after_seconds,
        "error": error_message,
        "papers": papers,
    }


async def _build_gap_repro_report(
    *,
    project_id: UUID,
    gap_id: UUID,
    limit: int,
    database,
    current_user: Optional[User],
) -> GapReproReportResponse:
    """Build reproducible GAP->bridge->recommendation trace for one gap."""
    await verify_project_access(database, project_id, current_user, "access")

    gap_row = await database.fetchrow(
        """
        SELECT id, gap_strength, bridge_candidates, research_questions,
               cluster_a_names, cluster_b_names
        FROM structural_gaps
        WHERE id = $1 AND project_id = $2
        """,
        str(gap_id),
        str(project_id),
    )
    if not gap_row:
        raise HTTPException(status_code=404, detail="Gap not found in this project")

    bridge_rows = await database.fetch(
        """
        SELECT r.id, r.weight, r.properties, s.name AS source_name, t.name AS target_name
        FROM relationships r
        JOIN entities s ON s.id = r.source_id
        JOIN entities t ON t.id = r.target_id
        WHERE r.project_id = $1
          AND r.relationship_type = 'BRIDGES_GAP'
          AND COALESCE(r.properties->>'gap_id', '') = $2
        ORDER BY r.id
        LIMIT 50
        """,
        str(project_id),
        str(gap_id),
    )

    bridge_relationships: List[GapBridgeRelationshipTraceResponse] = []
    for row in bridge_rows:
        props = _parse_json_field(row.get("properties"))
        bridge_relationships.append(
            GapBridgeRelationshipTraceResponse(
                relationship_id=str(row["id"]),
                source_name=row["source_name"] or "",
                target_name=row["target_name"] or "",
                confidence=_safe_float(props.get("confidence", row.get("weight"))),
                hypothesis_title=props.get("hypothesis_title"),
                ai_generated=bool(props.get("ai_generated", False)),
            )
        )

    bridge_candidates = gap_row["bridge_candidates"] or []
    cluster_a_names = gap_row["cluster_a_names"] or []
    cluster_b_names = gap_row["cluster_b_names"] or []
    query = _build_gap_recommendation_query(bridge_candidates, cluster_a_names, cluster_b_names)
    _log_gap_chain_event(
        "recommendation_query_built",
        project_id=str(project_id),
        gap_id=str(gap_id),
        bridge_terms=bridge_candidates,
        cluster_a_terms=cluster_a_names,
        cluster_b_terms=cluster_b_names,
        query=query,
    )

    # v0.19.0: Skip Semantic Scholar call if no meaningful query terms
    if not query:
        recommendation_bundle = {
            "status": "failed",
            "retry_after_seconds": None,
            "error": "No concept terms available for recommendation query",
            "papers": [],
        }
    else:
        recommendation_bundle = await _fetch_gap_recommendations_bundle(
            query=query,
            limit=limit,
            project_id=project_id,
            gap_id=gap_id,
            current_user=current_user,
            strict_rate_limit=False,
        )

    report = GapReproReportResponse(
        project_id=str(project_id),
        gap_id=str(gap_id),
        generated_at=datetime.utcnow().isoformat() + "Z",
        gap_strength=_safe_float(gap_row["gap_strength"]),
        cluster_a_names=cluster_a_names,
        cluster_b_names=cluster_b_names,
        bridge_candidates=bridge_candidates,
        research_questions=gap_row["research_questions"] or [],
        bridge_relationships=bridge_relationships,
        recommendation=GapRecommendationTraceResponse(
            status=recommendation_bundle["status"],
            query_used=query,
            retry_after_seconds=recommendation_bundle["retry_after_seconds"],
            error=recommendation_bundle["error"],
            papers=recommendation_bundle["papers"],
        ),
    )

    _log_gap_chain_event(
        "repro_report_built",
        project_id=str(project_id),
        gap_id=str(gap_id),
        bridge_relationships=len(bridge_relationships),
        recommendation_status=report.recommendation.status,
        papers_returned=len(report.recommendation.papers),
    )
    return report


@router.get("/gaps/{project_id}/recommendations/{gap_id}",
            response_model=GapRecommendationsResponse)
async def get_gap_recommendations(
    project_id: UUID,
    gap_id: UUID,
    limit: int = Query(5, ge=1, le=10),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get paper recommendations for a structural gap via Semantic Scholar."""
    await verify_project_access(database, project_id, current_user, "access")

    try:
        # Fetch gap with project ownership check
        row = await database.fetchrow(
            """
            SELECT bridge_candidates, cluster_a_names, cluster_b_names
            FROM structural_gaps
            WHERE id = $1 AND project_id = $2
            """,
            str(gap_id),
            str(project_id),
        )

        if not row:
            raise HTTPException(status_code=404, detail="Gap not found in this project")

        # Build search query from bridge candidates + cluster names
        bridge = row["bridge_candidates"] or []
        a_names = row["cluster_a_names"] or []
        b_names = row["cluster_b_names"] or []

        query = _build_gap_recommendation_query(bridge, a_names, b_names)
        _log_gap_chain_event(
            "recommendation_query_built",
            project_id=str(project_id),
            gap_id=str(gap_id),
            bridge_terms=bridge,
            cluster_a_terms=a_names,
            cluster_b_terms=b_names,
            query=query,
        )

        # v0.19.0: Skip Semantic Scholar call if no meaningful query terms
        if not query:
            return GapRecommendationsResponse(
                gap_id=str(gap_id),
                query_used="",
                papers=[],
            )

        papers: List[RecommendedPaperResponse] = []
        try:
            bundle = await _fetch_gap_recommendations_bundle(
                query=query,
                limit=limit,
                project_id=project_id,
                gap_id=gap_id,
                current_user=current_user,
                strict_rate_limit=True,
            )
            papers = bundle["papers"]
        except Exception as e:
            from integrations.semantic_scholar import SemanticScholarRateLimitError
            if not isinstance(e, SemanticScholarRateLimitError):
                raise
            rate_limited_error: SemanticScholarRateLimitError = e
            logger.warning(
                "Semantic Scholar rate limited for project=%s gap=%s retry_after=%ss query=%s",
                project_id,
                gap_id,
                rate_limited_error.retry_after,
                query,
            )
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "Semantic Scholar rate limited. Please retry later.",
                    "retry_after_seconds": rate_limited_error.retry_after,
                },
                headers={"Retry-After": str(rate_limited_error.retry_after)},
            )

        return GapRecommendationsResponse(
            gap_id=str(gap_id),
            query_used=query,
            papers=papers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get gap recommendations: {e}")
        raise HTTPException(status_code=500, detail="Failed to get recommendations")


@router.get(
    "/gaps/{project_id}/repro/{gap_id}",
    response_model=GapReproReportResponse,
)
async def get_gap_repro_report(
    project_id: UUID,
    gap_id: UUID,
    limit: int = Query(5, ge=1, le=10),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Return reproducible trace for one structural gap.

    Includes gap context, accepted bridge relationships, and recommendation status.
    """
    try:
        _log_gap_chain_event(
            "repro_report_requested",
            project_id=str(project_id),
            gap_id=str(gap_id),
            limit=limit,
        )
        return await _build_gap_repro_report(
            project_id=project_id,
            gap_id=gap_id,
            limit=limit,
            database=database,
            current_user=current_user,
        )
    except HTTPException:
        raise
    except Exception as e:
        _log_gap_chain_event(
            "repro_report_failed",
            project_id=str(project_id),
            gap_id=str(gap_id),
            error=str(e),
        )
        logger.error("Failed to build gap reproducibility report: %s", e)
        raise HTTPException(status_code=500, detail="Failed to build gap reproducibility report")


@router.get("/gaps/{project_id}/repro/{gap_id}/export")
async def export_gap_repro_report(
    project_id: UUID,
    gap_id: UUID,
    format: str = Query("markdown", pattern="^(markdown|json)$"),
    limit: int = Query(5, ge=1, le=10),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Export single-gap reproducibility report as markdown or JSON."""
    report = await _build_gap_repro_report(
        project_id=project_id,
        gap_id=gap_id,
        limit=limit,
        database=database,
        current_user=current_user,
    )

    if format == "json":
        return report

    lines = [
        "# Gap Reproducibility Report",
        "",
        f"- **Project ID**: `{report.project_id}`",
        f"- **Gap ID**: `{report.gap_id}`",
        f"- **Generated**: {report.generated_at}",
        f"- **Gap Strength**: {report.gap_strength:.1%}",
        "",
        "## Gap Context",
        "",
        f"- **Cluster A**: {', '.join(report.cluster_a_names[:5]) or 'N/A'}",
        f"- **Cluster B**: {', '.join(report.cluster_b_names[:5]) or 'N/A'}",
        f"- **Bridge Candidates**: {', '.join(report.bridge_candidates[:8]) or 'N/A'}",
        "",
    ]

    if report.research_questions:
        lines.extend(["## Research Questions", ""])
        for i, q in enumerate(report.research_questions, 1):
            lines.append(f"{i}. {q}")
        lines.append("")

    lines.extend(
        [
            "## Bridge Relationships",
            "",
            "| Relationship ID | Source | Target | Confidence | Hypothesis | AI |",
            "|---|---|---|---:|---|---|",
        ]
    )
    if report.bridge_relationships:
        for rel in report.bridge_relationships:
            lines.append(
                f"| `{rel.relationship_id}` | {rel.source_name} | {rel.target_name} | "
                f"{rel.confidence:.2f} | {rel.hypothesis_title or '-'} | "
                f"{'yes' if rel.ai_generated else 'no'} |"
            )
    else:
        lines.append("| - | - | - | - | - | - |")
    lines.append("")

    rec = report.recommendation
    lines.extend(
        [
            "## Recommendation Trace",
            "",
            f"- **Status**: {rec.status}",
            f"- **Query**: `{rec.query_used}`",
        ]
    )
    if rec.retry_after_seconds is not None:
        lines.append(f"- **Retry After (seconds)**: {rec.retry_after_seconds}")
    if rec.error:
        lines.append(f"- **Error**: {rec.error}")
    lines.append("")

    lines.extend(
        [
            "| Title | Year | Citations | URL |",
            "|---|---:|---:|---|",
        ]
    )
    if rec.papers:
        for paper in rec.papers:
            lines.append(
                f"| {paper.title} | {paper.year or '-'} | {paper.citation_count} | {paper.url or '-'} |"
            )
    else:
        lines.append("| - | - | - | - |")
    lines.append("")

    content = "\n".join(lines)
    buffer = io.BytesIO(content.encode("utf-8"))
    filename = f"gap_repro_report_{gap_id}.md"
    return StreamingResponse(
        buffer,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename=\"{filename}\"'},
    )


# ============================================================
# Gap Analysis Report Export
# ============================================================

@router.get("/gaps/{project_id}/export")
async def export_gap_report(
    project_id: UUID,
    format: str = Query("markdown", pattern="^(markdown)$"),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Export gap analysis as a Markdown report."""
    await verify_project_access(database, project_id, current_user, "access")

    try:
        # Get project info
        project_row = await database.fetchrow(
            "SELECT name, research_question FROM projects WHERE id = $1",
            str(project_id),
        )
        project_name = project_row["name"] if project_row else "Unknown Project"
        research_question = project_row.get("research_question", "") if project_row else ""

        # Get clusters
        cluster_rows = await database.fetch(
            """
            SELECT cluster_id, label, size, concept_names
            FROM concept_clusters
            WHERE project_id = $1
            ORDER BY cluster_id
            """,
            str(project_id),
        )

        # Get gaps
        gap_rows = await database.fetch(
            """
            SELECT gap_strength, bridge_candidates, research_questions,
                   cluster_a_names, cluster_b_names
            FROM structural_gaps
            WHERE project_id = $1
            ORDER BY gap_strength DESC
            """,
            str(project_id),
        )

        if not cluster_rows and not gap_rows:
            raise HTTPException(
                status_code=404,
                detail="No gap analysis data. Run gap detection first."
            )

        # Build Markdown
        lines = [
            f"# Gap Analysis Report: {project_name}",
            f"",
            f"**Generated**: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            "",
        ]

        if research_question:
            lines.extend([
                f"**Research Question**: {research_question}",
                "",
            ])

        # Clusters table
        if cluster_rows:
            lines.extend([
                "## Concept Clusters",
                "",
                "| Cluster | Label | Size | Top Concepts |",
                "|---------|-------|------|-------------|",
            ])
            for row in cluster_rows:
                names = row["concept_names"] or []
                top_concepts = ", ".join(names[:5])
                if len(names) > 5:
                    top_concepts += f" (+{len(names) - 5})"
                lines.append(
                    f"| {row['cluster_id']} | {row['label'] or 'N/A'} | {row['size']} | {top_concepts} |"
                )
            lines.append("")

        # Gaps section
        if gap_rows:
            lines.extend([
                "## Structural Gaps",
                "",
            ])
            for i, row in enumerate(gap_rows, 1):
                a_names = row["cluster_a_names"] or []
                b_names = row["cluster_b_names"] or []
                bridge = row["bridge_candidates"] or []
                questions = row["research_questions"] or []

                lines.extend([
                    f"### Gap {i} (Strength: {row['gap_strength']:.1%})",
                    "",
                    f"- **Cluster A**: {', '.join(a_names[:3])}",
                    f"- **Cluster B**: {', '.join(b_names[:3])}",
                ])

                if bridge:
                    lines.append(f"- **Bridge Candidates**: {', '.join(bridge[:5])}")

                if questions:
                    lines.extend(["", "**Research Questions**:", ""])
                    for q in questions:
                        lines.append(f"1. {q}")

                lines.append("")

        # Summary stats
        total_concepts = sum(row["size"] for row in cluster_rows)
        lines.extend([
            "---",
            "",
            f"*{total_concepts} concepts across {len(cluster_rows)} clusters, {len(gap_rows)} structural gaps identified.*",
        ])

        content = "\n".join(lines)
        buffer = io.BytesIO(content.encode("utf-8"))

        filename = f"gap_report_{project_name.replace(' ', '_')}.md"
        return StreamingResponse(
            buffer,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to export gap report: {e}")
        raise HTTPException(status_code=500, detail="Failed to export report")


# ============================================================
# Centrality Analysis & Slicing Endpoints
# ============================================================

class CentralityResponse(BaseModel):
    """Response model for centrality analysis."""
    metric: str
    centrality: dict  # node_id -> score
    top_bridges: List[tuple]  # [(node_id, score), ...]


class SliceRequest(BaseModel):
    """Request model for graph slicing."""
    remove_top_n: int = 5
    metric: str = "betweenness"


class SliceResponse(BaseModel):
    """Response model for sliced graph."""
    nodes: List[NodeResponse]
    edges: List[EdgeResponse]
    removed_node_ids: List[str]
    top_bridges: List[dict]
    original_count: int
    filtered_count: int


class ClusterRequest(BaseModel):
    """Request model for clustering."""
    cluster_count: int = 5


class ClusterResponse(BaseModel):
    """Response model for clustering."""
    clusters: List[dict]
    optimal_k: int


@router.get("/centrality/{project_id}")
async def get_centrality(
    project_id: UUID,
    metric: str = "betweenness",
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Get centrality metrics for all nodes in the project.

    Supported metrics: betweenness, degree, eigenvector

    Returns:
        - centrality: dict mapping node_id to centrality score
        - top_bridges: list of (node_id, score) for top 10 nodes
    """
    cache_key = f"centrality:{project_id}:{metric}"
    cached = await metrics_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        from graph.centrality_analyzer import centrality_analyzer

        # Get nodes
        node_rows = await database.fetch(
            """
            SELECT id, entity_type, name, properties
            FROM entities
            WHERE project_id = $1
            """,
            str(project_id),
        )

        # Get edges
        edge_rows = await database.fetch(
            """
            SELECT id, source_id, target_id, relationship_type::text, properties,
                   COALESCE((properties->>'weight')::float, 1.0) as weight
            FROM relationships
            WHERE project_id = $1
            """,
            str(project_id),
        )

        if not node_rows:
            payload = {
                "metric": metric,
                "centrality": {},
                "top_bridges": [],
            }
            await metrics_cache.set(cache_key, payload)
            return payload

        # Convert to format expected by analyzer
        nodes = [
            {
                "id": str(row["id"]),
                "entity_type": row["entity_type"],
                "name": row["name"],
                "properties": _parse_json_field(row["properties"]),
            }
            for row in node_rows
        ]

        edges = [
            {
                "id": str(row["id"]),
                "source": str(row["source_id"]),
                "target": str(row["target_id"]),
                "relationship_type": row["relationship_type"],
                "weight": _safe_float(row["weight"], 1.0),
            }
            for row in edge_rows
        ]

        # Compute centrality
        metrics = centrality_analyzer.compute_all_centrality(
            nodes, edges, cache_key=str(project_id)
        )

        # Get requested metric
        if metric == "betweenness":
            centrality = metrics.betweenness
        elif metric == "degree":
            centrality = metrics.degree
        elif metric == "eigenvector":
            centrality = metrics.eigenvector
        else:
            centrality = metrics.betweenness

        # Get top bridges
        top_bridges = centrality_analyzer.get_top_bridges(centrality, 10)

        # Add names to top bridges
        top_bridges_with_names = [
            (node_id, score, centrality_analyzer.get_node_name(node_id, nodes))
            for node_id, score in top_bridges
        ]

        payload = {
            "metric": metric,
            "centrality": centrality,
            "top_bridges": top_bridges_with_names,
        }
        await metrics_cache.set(cache_key, payload)
        return payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compute centrality metrics: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute centrality metrics: {type(e).__name__}: {str(e)}"
        )


class GraphMetricsResponse(BaseModel):
    """Response model for graph quality metrics (Insight HUD)."""
    modularity: float  # Cluster separation quality (0-1)
    diversity: float   # Cluster size balance (0-1)
    density: float     # Connection density (0-1)
    avg_clustering: float  # Average clustering coefficient
    num_components: int    # Number of connected components
    node_count: int
    edge_count: int
    cluster_count: int
    # v0.30.0: Extended quality metrics
    modularity_raw: Optional[float] = None
    modularity_interpretation: Optional[str] = None
    silhouette_score: Optional[float] = None
    avg_cluster_coherence: Optional[float] = None
    cluster_coverage: Optional[float] = None
    # v0.30.0: Entity extraction quality
    entity_type_diversity: Optional[float] = None
    paper_coverage: Optional[float] = None
    avg_entities_per_paper: Optional[float] = None
    cross_paper_ratio: Optional[float] = None
    type_distribution: Optional[dict] = None


# ============================================
# Diversity Analysis API (Phase 4)
# ============================================

class DiversityMetricsResponse(BaseModel):
    """Response for diversity analysis."""
    shannon_entropy: float
    normalized_entropy: float
    modularity: float
    bias_score: float
    diversity_rating: str  # "high", "medium", "low"
    cluster_sizes: List[int]
    dominant_cluster_ratio: float
    gini_coefficient: float


@router.get("/diversity/{project_id}", response_model=DiversityMetricsResponse)
async def get_diversity_metrics(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Get diversity metrics for a project's knowledge graph.

    Analyzes how diverse/balanced the concept clusters are:
    - shannon_entropy: Evenness of cluster distribution (higher = more diverse)
    - modularity: How well-defined clusters are (-0.5 to 1.0)
    - bias_score: If one cluster dominates (0-1, lower = better)
    - diversity_rating: "high", "medium", or "low"
    - gini_coefficient: Inequality measure (0 = equal, 1 = unequal)

    Requires auth in production.
    """
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    cache_key = f"diversity:{project_id}"
    cached = await metrics_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        from graph.diversity_analyzer import diversity_analyzer

        # Get nodes
        node_rows = await database.fetch(
            """
            SELECT id, entity_type::text, name, properties
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            """,
            str(project_id),
        )

        # Get edges
        edge_rows = await database.fetch(
            """
            SELECT id, source_id, target_id
            FROM relationships
            WHERE project_id = $1
            """,
            str(project_id),
        )

        # Get clusters
        cluster_rows = await database.fetch(
            """
            SELECT cluster_id, concepts, size
            FROM concept_clusters
            WHERE project_id = $1
            ORDER BY cluster_id
            """,
            str(project_id),
        )

        if not node_rows:
            payload = {
                "shannon_entropy": 0.0,
                "normalized_entropy": 0.0,
                "modularity": 0.0,
                "bias_score": 1.0,
                "diversity_rating": "low",
                "cluster_sizes": [],
                "dominant_cluster_ratio": 1.0,
                "gini_coefficient": 1.0,
            }
            await metrics_cache.set(cache_key, payload)
            return payload

        # Convert to format for analyzer
        nodes = [{"id": str(row["id"])} for row in node_rows]
        edges = [
            {"source": str(row["source_id"]), "target": str(row["target_id"])}
            for row in edge_rows
        ]
        clusters = [
            {"node_ids": [str(c) for c in (row["concepts"] or [])], "size": row["size"]}
            for row in cluster_rows
        ]

        # If no clusters defined, create a single cluster with all nodes
        if not clusters:
            clusters = [{"node_ids": [n["id"] for n in nodes]}]

        # Compute metrics
        metrics = diversity_analyzer.analyze_from_data(nodes, edges, clusters)

        payload = {
            "shannon_entropy": metrics.shannon_entropy,
            "normalized_entropy": metrics.normalized_entropy,
            "modularity": metrics.modularity,
            "bias_score": metrics.bias_score,
            "diversity_rating": metrics.diversity_rating,
            "cluster_sizes": metrics.cluster_sizes,
            "dominant_cluster_ratio": metrics.dominant_cluster_ratio,
            "gini_coefficient": metrics.gini_coefficient,
        }
        await metrics_cache.set(cache_key, payload)
        return payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compute diversity metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute diversity metrics")


@router.get("/metrics/{project_id}", response_model=GraphMetricsResponse)
async def get_graph_metrics(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Get graph quality metrics for Insight HUD display (InfraNodus-style).

    Returns:
        - modularity: Cluster separation quality (0-1, higher = better separated)
        - diversity: Cluster size balance (0-1, higher = more even distribution)
        - density: Connection density (0-1)
        - avg_clustering: Average clustering coefficient
        - num_components: Number of connected components
        - node_count: Total number of nodes
        - edge_count: Total number of edges
        - cluster_count: Number of clusters
    """
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    cache_key = f"graph_metrics:{project_id}"
    cached = await metrics_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        from graph.centrality_analyzer import centrality_analyzer, ClusterResult

        # Get nodes
        node_rows = await database.fetch(
            """
            SELECT id, entity_type::text, name, properties
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            """,
            str(project_id),
        )

        # Get edges
        edge_rows = await database.fetch(
            """
            SELECT id, source_id, target_id, relationship_type::text,
                   COALESCE((properties->>'weight')::float, 1.0) as weight
            FROM relationships
            WHERE project_id = $1
            """,
            str(project_id),
        )

        # Get clusters
        cluster_rows = await database.fetch(
            """
            SELECT cluster_id, concepts, size
            FROM concept_clusters
            WHERE project_id = $1
            ORDER BY cluster_id
            """,
            str(project_id),
        )

        if not node_rows:
            payload = {
                "modularity": 0.0,
                "diversity": 0.0,
                "density": 0.0,
                "avg_clustering": 0.0,
                "num_components": 0,
                "node_count": 0,
                "edge_count": 0,
                "cluster_count": 0,
            }
            await metrics_cache.set(cache_key, payload)
            return payload

        # Convert to format expected by analyzer
        nodes = [
            {
                "id": str(row["id"]),
                "entity_type": row["entity_type"],
                "name": row["name"],
                "properties": _parse_json_field(row["properties"]),
            }
            for row in node_rows
        ]

        edges = [
            {
                "id": str(row["id"]),
                "source": str(row["source_id"]),
                "target": str(row["target_id"]),
                "weight": _safe_float(row["weight"], 1.0),
            }
            for row in edge_rows
        ]

        # Convert clusters to ClusterResult objects
        clusters = [
            ClusterResult(
                cluster_id=row["cluster_id"],
                node_ids=[str(c) for c in (row["concepts"] or [])],
                node_names=[],
                centroid=None,
                size=row["size"],
            )
            for row in cluster_rows
        ]

        # v0.19.0: Auto-compute clusters if none exist (fixes 0% InsightHUD metrics)
        if not clusters and len(node_rows) >= 4:
            try:
                import numpy as np

                embedding_rows = await database.fetch(
                    """
                    SELECT id, name, embedding
                    FROM entities
                    WHERE project_id = $1
                    AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                    AND embedding IS NOT NULL
                    ORDER BY id
                    """,
                    str(project_id),
                )

                if embedding_rows and len(embedding_rows) >= 4:
                    metric_nodes = [{"id": str(r["id"]), "name": r["name"]} for r in embedding_rows]
                    embeddings = np.array([_parse_embedding(r["embedding"]) for r in embedding_rows], dtype=np.float32)
                    optimal_k = centrality_analyzer.compute_optimal_k(embeddings, min_k=2, max_k=min(10, len(metric_nodes) - 1))
                    auto_clusters = centrality_analyzer.cluster_nodes(metric_nodes, embeddings, n_clusters=optimal_k)
                    clusters = [
                        ClusterResult(
                            cluster_id=c.cluster_id,
                            node_ids=c.node_ids,
                            node_names=c.node_names,
                            centroid=c.centroid,
                            size=c.size,
                        )
                        for c in auto_clusters
                    ]
            except Exception as auto_err:
                logger.warning(f"Auto-cluster for metrics failed: {auto_err}")

        # Compute graph metrics
        metrics = centrality_analyzer.compute_graph_metrics(nodes, edges, clusters)

        # v0.30.0: Extended cluster quality metrics
        # Build embeddings map for cluster quality
        embeddings_map = {}
        try:
            emb_rows = await database.fetch(
                """
                SELECT id, embedding
                FROM entities
                WHERE project_id = $1
                AND embedding IS NOT NULL
                AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                """,
                str(project_id),
            )
            for row in emb_rows:
                emb = _parse_embedding(row["embedding"])
                if emb:
                    embeddings_map[str(row["id"])] = emb
        except Exception as e:
            logger.warning(f"Failed to load embeddings for cluster quality: {e}")

        cluster_quality = centrality_analyzer.compute_cluster_quality(
            nodes, edges, clusters, embeddings_map=embeddings_map if embeddings_map else None
        )

        # v0.30.0: Entity extraction quality metrics
        entity_quality = {}
        try:
            # Type distribution
            type_rows = await database.fetch(
                """
                SELECT entity_type::text, COUNT(*) as count
                FROM entities
                WHERE project_id = $1
                AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                GROUP BY entity_type
                """,
                str(project_id),
            )
            type_dist = {row["entity_type"]: row["count"] for row in type_rows}
            all_types = ['Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation']
            used_types = len([t for t in all_types if t in type_dist])
            entity_quality["type_distribution"] = type_dist
            entity_quality["entity_type_diversity"] = round(used_types / len(all_types), 4)

            # Paper coverage
            paper_coverage_row = await database.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT pm.id) as total_papers,
                    COUNT(DISTINCT pm.id) FILTER (
                        WHERE EXISTS (
                            SELECT 1 FROM entities e
                            WHERE e.project_id = $1
                            AND pm.id = ANY(e.source_paper_ids)
                        )
                    ) as covered_papers
                FROM paper_metadata pm
                WHERE pm.project_id = $1
                """,
                str(project_id),
            )
            if paper_coverage_row and paper_coverage_row["total_papers"] > 0:
                entity_quality["paper_coverage"] = round(
                    paper_coverage_row["covered_papers"] / paper_coverage_row["total_papers"], 4
                )
            else:
                entity_quality["paper_coverage"] = 0.0

            # Avg entities per paper
            avg_row = await database.fetchrow(
                """
                SELECT AVG(array_length(source_paper_ids, 1)) as avg_papers_per_entity,
                       COUNT(*) as total_entities
                FROM entities
                WHERE project_id = $1
                AND source_paper_ids IS NOT NULL
                AND array_length(source_paper_ids, 1) > 0
                AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                """,
                str(project_id),
            )

            # Cross-paper ratio: entities appearing in 3+ papers
            cross_row = await database.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE array_length(source_paper_ids, 1) >= 3) as cross_paper,
                    COUNT(*) as total
                FROM entities
                WHERE project_id = $1
                AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                """,
                str(project_id),
            )

            total_papers = paper_coverage_row["total_papers"] if paper_coverage_row else 1
            total_entities = avg_row["total_entities"] if avg_row else 0
            entity_quality["avg_entities_per_paper"] = round(
                total_entities / max(total_papers, 1), 1
            )

            if cross_row and cross_row["total"] > 0:
                entity_quality["cross_paper_ratio"] = round(
                    cross_row["cross_paper"] / cross_row["total"], 4
                )
            else:
                entity_quality["cross_paper_ratio"] = 0.0

        except Exception as e:
            logger.warning(f"Failed to compute entity quality metrics: {e}")

        payload = {
            "modularity": metrics["modularity"],
            "diversity": metrics["diversity"],
            "density": metrics["density"],
            "avg_clustering": metrics["avg_clustering"],
            "num_components": metrics["num_components"],
            "node_count": len(nodes),
            "edge_count": len(edges),
            "cluster_count": len(clusters),
            "modularity_raw": cluster_quality.get("modularity_raw", None),
            "modularity_interpretation": cluster_quality.get("modularity_interpretation", None),
            "silhouette_score": cluster_quality.get("silhouette_score", None),
            "avg_cluster_coherence": cluster_quality.get("avg_cluster_coherence", None),
            "cluster_coverage": cluster_quality.get("cluster_coverage", None),
            "entity_type_diversity": entity_quality.get("entity_type_diversity", None),
            "paper_coverage": entity_quality.get("paper_coverage", None),
            "avg_entities_per_paper": entity_quality.get("avg_entities_per_paper", None),
            "cross_paper_ratio": entity_quality.get("cross_paper_ratio", None),
            "type_distribution": entity_quality.get("type_distribution", None),
        }
        await metrics_cache.set(cache_key, payload)
        return payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compute graph metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute graph metrics")


@router.post("/slice/{project_id}")
async def slice_graph(
    project_id: UUID,
    request: SliceRequest,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Remove top N nodes by centrality to reveal hidden cluster structures.

    This is the "slicing" operation from InfraNodus that helps discover
    overlooked connections by temporarily removing bridge nodes.

    Args:
        remove_top_n: Number of top nodes to remove (default: 5)
        metric: Centrality metric to use (betweenness, degree, eigenvector)

    Returns:
        Filtered graph with removed nodes and top bridges info
    """
    try:
        from graph.centrality_analyzer import centrality_analyzer

        # Get nodes
        node_rows = await database.fetch(
            """
            SELECT id, entity_type, name, properties
            FROM entities
            WHERE project_id = $1
            """,
            str(project_id),
        )

        # Get edges
        edge_rows = await database.fetch(
            """
            SELECT id, source_id, target_id, relationship_type::text, properties,
                   COALESCE((properties->>'weight')::float, 1.0) as weight
            FROM relationships
            WHERE project_id = $1
            """,
            str(project_id),
        )

        if not node_rows:
            return {
                "nodes": [],
                "edges": [],
                "removed_node_ids": [],
                "top_bridges": [],
                "original_count": 0,
                "filtered_count": 0,
            }

        # Convert to format expected by analyzer
        nodes = [
            {
                "id": str(row["id"]),
                "entity_type": row["entity_type"],
                "name": row["name"],
                "properties": _parse_json_field(row["properties"]),
            }
            for row in node_rows
        ]

        edges = [
            {
                "id": str(row["id"]),
                "source": str(row["source_id"]),
                "target": str(row["target_id"]),
                "relationship_type": row["relationship_type"],
                "weight": _safe_float(row["weight"], 1.0),
            }
            for row in edge_rows
        ]

        # Perform slicing
        filtered_nodes, filtered_edges, removed_ids, top_bridges = centrality_analyzer.slice_graph(
            nodes,
            edges,
            request.remove_top_n,
            request.metric,
        )

        # Format response
        response_nodes = [
            NodeResponse(
                id=n["id"],
                entity_type=n["entity_type"],
                name=n["name"],
                properties=n["properties"],
            )
            for n in filtered_nodes
        ]

        response_edges = [
            EdgeResponse(
                id=e["id"],
                source=e["source"],
                target=e["target"],
                relationship_type=e["relationship_type"],
                weight=e.get("weight", 1.0),
            )
            for e in filtered_edges
        ]

        top_bridges_formatted = [
            {
                "id": node_id,
                "name": centrality_analyzer.get_node_name(node_id, nodes),
                "score": score,
            }
            for node_id, score in top_bridges
        ]

        return {
            "nodes": response_nodes,
            "edges": response_edges,
            "removed_node_ids": removed_ids,
            "top_bridges": top_bridges_formatted,
            "original_count": len(nodes),
            "filtered_count": len(filtered_nodes),
        }

    except Exception as e:
        logger.error(f"Failed to slice graph: {e}")
        raise HTTPException(status_code=500, detail="Failed to slice graph")


@router.post("/clusters/{project_id}")
async def recompute_clusters(
    project_id: UUID,
    request: ClusterRequest,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Recompute K-means clusters for the project's concept graph.

    Args:
        cluster_count: Desired number of clusters

    Returns:
        Updated cluster assignments and optimal K value
    """
    try:
        await verify_project_access(database, project_id, current_user, "modify")

        from graph.centrality_analyzer import centrality_analyzer
        import numpy as np

        # Reset stale cluster assignments before recompute.
        await database.execute(
            """
            UPDATE entities
            SET
              cluster_id = NULL,
              properties = COALESCE(properties, '{}'::jsonb) - 'cluster_id'
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            """,
            str(project_id),
        )

        # Clear prior derived cluster materialization to keep analysis outputs aligned.
        await database.execute(
            "DELETE FROM concept_clusters WHERE project_id = $1",
            str(project_id),
        )

        # Get nodes with embeddings
        node_rows = await database.fetch(
            """
            SELECT id, entity_type, name, properties, embedding
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            AND embedding IS NOT NULL
            """,
            str(project_id),
        )

        if not node_rows:
            return {
                "clusters": [],
                "optimal_k": 2,
            }

        # Prepare data
        nodes = [
            {
                "id": str(row["id"]),
                "entity_type": row["entity_type"],
                "name": row["name"],
                "properties": _parse_json_field(row["properties"]),
            }
            for row in node_rows
        ]

        embeddings = np.array([_parse_embedding(row["embedding"]) for row in node_rows], dtype=np.float32)

        # Compute optimal K if not specified
        optimal_k = centrality_analyzer.compute_optimal_k(embeddings, min_k=2, max_k=min(10, len(nodes) - 1))

        # Perform clustering
        clusters = centrality_analyzer.cluster_nodes(
            nodes,
            embeddings,
            n_clusters=request.cluster_count,
        )

        # v0.19.0: Generate meaningful cluster labels via LLM
        try:
            from graph.gap_detector import GapDetector
            from llm.user_provider import create_llm_provider_for_user
            user_id = str(current_user.id) if current_user else None
            llm = await create_llm_provider_for_user(user_id)
            gap_detector = GapDetector(llm_provider=llm)

            concept_name_map_for_labels = {n["id"]: n["name"] for n in nodes}
            for cluster in clusters:
                if cluster.label is None:
                    keywords = [concept_name_map_for_labels.get(nid, "") for nid in cluster.node_ids[:10]]
                    keywords = [k for k in keywords if k.strip()]
                    if keywords:
                        try:
                            cluster.label = await gap_detector._generate_cluster_label(keywords)
                        except Exception as label_err:
                            logger.warning(f"LLM label failed for cluster {cluster.cluster_id}: {label_err}")
                            cluster.label = " / ".join(keywords[:3]) if keywords else None
        except Exception as e:
            logger.warning(f"Cluster labeling setup failed: {e}")

        # Cluster color palette
        colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
            '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
            '#BB8FCE', '#85C1E9', '#F8B500', '#82E0AA',
        ]

        # Format clusters
        formatted_clusters = [
            {
                "cluster_id": c.cluster_id,
                "concepts": c.node_ids,
                "concept_names": c.node_names,
                "label": c.label or f"Cluster {c.cluster_id + 1}",
                "size": c.size,
                "density": 0.0,
                "color": colors[c.cluster_id % len(colors)],
            }
            for c in clusters
        ]

        # Pull concept relationships once for lightweight intra-cluster density estimation.
        relationship_rows = await database.fetch(
            """
            SELECT source_id::text AS source_id, target_id::text AS target_id
            FROM relationships
            WHERE project_id = $1
            """,
            str(project_id),
        )
        edge_pairs = [
            (str(row["source_id"]), str(row["target_id"]) )
            for row in relationship_rows
        ]

        concept_name_map = {n["id"]: n["name"] for n in nodes}

        # Update entities + materialized concept clusters in a single pass
        cluster_density_by_id: dict[int, float] = {}
        for cluster in clusters:
            concept_id_set = set(cluster.node_ids)

            if len(concept_id_set) > 1:
                possible_edges = (len(concept_id_set) * (len(concept_id_set) - 1)) / 2
                internal_edges = sum(
                    1 for source_id, target_id in edge_pairs
                    if source_id in concept_id_set and target_id in concept_id_set
                )
                cluster_density_by_id[cluster.cluster_id] = float(internal_edges / possible_edges)
            else:
                cluster_density_by_id[cluster.cluster_id] = 0.0

            # Persist cluster-level materialization for gap analysis and topic view.
            await database.execute(
                """
                INSERT INTO concept_clusters (
                    project_id,
                    cluster_id,
                    concepts,
                    concept_names,
                    size,
                    density,
                    label,
                    color
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                str(project_id),
                cluster.cluster_id,
                [str(cid) for cid in cluster.node_ids],
                [concept_name_map.get(cid, "") for cid in cluster.node_ids],
                len(cluster.node_ids),
                cluster_density_by_id[cluster.cluster_id],
                cluster.label or f"Cluster {cluster.cluster_id + 1}",
                colors[cluster.cluster_id % len(colors)],
            )

        # Update entities with new cluster assignments
        for cluster in clusters:
            for node_id in cluster.node_ids:
                await database.execute(
                    """
                    UPDATE entities
                    SET
                        cluster_id = $2,
                        properties = COALESCE(properties, '{}'::jsonb) || $3::jsonb
                    WHERE id = $1
                    """,
                    node_id,
                    cluster.cluster_id,
                    json.dumps({"cluster_id": cluster.cluster_id}),
                )

        # Attach computed density to response payload.
        for cluster_entry in formatted_clusters:
            cluster_id = cluster_entry["cluster_id"]
            cluster_entry["density"] = cluster_density_by_id.get(cluster_id, 0.0)

        await metrics_cache.invalidate_project(str(project_id))

        return {
            "clusters": formatted_clusters,
            "optimal_k": optimal_k,
        }

    except Exception as e:
        logger.error(f"Failed to recompute clusters: {e}")
        raise HTTPException(status_code=500, detail="Failed to recompute clusters")


# ============================================
# Temporal Graph API (Phase 2: Graph Evolution)
# ============================================

class TemporalStatsResponse(BaseModel):
    """Temporal statistics for a project."""
    min_year: Optional[int] = None
    max_year: Optional[int] = None
    year_count: int = 0
    entities_with_year: int = 0
    total_entities: int = 0


class TemporalGraphResponse(BaseModel):
    """Graph data with temporal filtering and year range."""
    nodes: List[NodeResponse]
    edges: List[EdgeResponse]
    year_range: dict  # {min: int, max: int}
    temporal_stats: TemporalStatsResponse


@router.get("/temporal/{project_id}", response_model=TemporalGraphResponse)
async def get_temporal_graph(
    project_id: UUID,
    year_start: Optional[int] = Query(None, description="Filter entities from this year"),
    year_end: Optional[int] = Query(None, description="Filter entities up to this year"),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Get graph data filtered by year range for temporal evolution visualization.

    This enables the "time slider" feature - animate how the knowledge graph
    evolved over years as research progressed.

    Returns nodes/edges visible up to year_end, with opacity hints for
    nodes that appeared earlier vs recently.

    Requires auth in production.
    """
    # Verify project access
    await verify_project_access(database, project_id, current_user, "access")

    try:
        # Get temporal statistics
        stats_row = await database.fetchrow(
            """
            SELECT
                MIN(first_seen_year) as min_year,
                MAX(COALESCE(last_seen_year, first_seen_year)) as max_year,
                COUNT(DISTINCT first_seen_year) as year_count,
                COUNT(*) FILTER (WHERE first_seen_year IS NOT NULL) as entities_with_year,
                COUNT(*) as total_entities
            FROM entities
            WHERE project_id = $1
            """,
            str(project_id),
        )

        temporal_stats = TemporalStatsResponse(
            min_year=stats_row["min_year"],
            max_year=stats_row["max_year"],
            year_count=stats_row["year_count"] or 0,
            entities_with_year=stats_row["entities_with_year"] or 0,
            total_entities=stats_row["total_entities"] or 0,
        )

        # If no temporal data, fall back to year from properties
        if temporal_stats.min_year is None:
            # Try to get years from properties
            props_stats = await database.fetchrow(
                """
                SELECT
                    MIN((properties->>'year')::INTEGER) as min_year,
                    MAX((properties->>'year')::INTEGER) as max_year
                FROM entities
                WHERE project_id = $1
                AND properties->>'year' IS NOT NULL
                """,
                str(project_id),
            )
            if props_stats and props_stats["min_year"]:
                temporal_stats.min_year = props_stats["min_year"]
                temporal_stats.max_year = props_stats["max_year"]

        # Build year filter conditions
        year_filter = ""
        params = [str(project_id)]

        if year_start is not None and year_end is not None:
            year_filter = """
                AND (
                    first_seen_year IS NULL
                    OR (first_seen_year >= $2 AND first_seen_year <= $3)
                    OR (first_seen_year <= $3 AND (last_seen_year IS NULL OR last_seen_year >= $2))
                )
            """
            params.extend([year_start, year_end])
        elif year_end is not None:
            year_filter = """
                AND (first_seen_year IS NULL OR first_seen_year <= $2)
            """
            params.append(year_end)
        elif year_start is not None:
            year_filter = """
                AND (first_seen_year IS NULL OR first_seen_year >= $2)
            """
            params.append(year_start)

        # Get filtered nodes
        nodes_query = f"""
            SELECT id, entity_type::text, name, properties,
                   first_seen_year, last_seen_year, source_year
            FROM entities
            WHERE project_id = $1 {year_filter}
            ORDER BY
                CASE entity_type::text
                    WHEN 'Paper' THEN 1
                    WHEN 'Concept' THEN 2
                    WHEN 'Author' THEN 3
                    ELSE 4
                END,
                first_seen_year NULLS LAST,
                created_at DESC
            LIMIT 500
        """
        node_rows = await database.fetch(nodes_query, *params)

        # Add temporal properties to nodes
        nodes = []
        for row in node_rows:
            props = _parse_json_field(row["properties"])
            # Add temporal info to properties
            props["first_seen_year"] = row["first_seen_year"]
            props["last_seen_year"] = row["last_seen_year"]
            props["source_year"] = row["source_year"]

            nodes.append(
                NodeResponse(
                    id=str(row["id"]),
                    entity_type=row["entity_type"],
                    name=row["name"],
                    properties=props,
                )
            )

        # Get edges connecting visible nodes
        node_ids = [str(row["id"]) for row in node_rows]

        if node_ids:
            edges_query = """
                SELECT id, source_id, target_id, relationship_type::text,
                       properties, weight, first_seen_year
                FROM relationships
                WHERE project_id = $1
                AND source_id = ANY($2::uuid[])
                AND target_id = ANY($2::uuid[])
            """
            edge_rows = await database.fetch(
                edges_query,
                str(project_id),
                node_ids,
            )

            edges = []
            for row in edge_rows:
                props = _parse_json_field(row["properties"])
                props["first_seen_year"] = row["first_seen_year"]

                edges.append(
                    EdgeResponse(
                        id=str(row["id"]),
                        source=str(row["source_id"]),
                        target=str(row["target_id"]),
                        relationship_type=_normalize_relationship_type(row["relationship_type"]),
                        properties=props,
                        weight=row["weight"] or 1.0,
                    )
                )
        else:
            edges = []

        return TemporalGraphResponse(
            nodes=nodes,
            edges=edges,
            year_range={
                "min": temporal_stats.min_year or 2000,
                "max": temporal_stats.max_year or 2025,
            },
            temporal_stats=temporal_stats,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Temporal query failed (columns may not exist): {e}")
        # Return empty temporal response instead of 500
        return TemporalGraphResponse(
            nodes=[],
            edges=[],
            year_range={"min": None, "max": None},
            temporal_stats=TemporalStatsResponse(
                min_year=None,
                max_year=None,
                year_count=0,
                entities_with_year=0,
                total_entities=0,
            ),
        )


@router.post("/temporal/{project_id}/migrate")
async def migrate_temporal_data(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Migrate/backfill temporal data for existing entities in a project.

    This populates first_seen_year, last_seen_year from paper metadata.
    Run this after importing papers to enable temporal visualization.

    Requires auth in production.
    """
    # Verify project access
    await verify_project_access(database, project_id, current_user, "modify")

    try:
        # Run the migration function
        result = await database.fetchrow(
            "SELECT * FROM migrate_entity_temporal_data($1)",
            str(project_id),
        )

        return {
            "status": "success",
            "entities_updated": result["entities_updated"] if result else 0,
            "relationships_updated": result["relationships_updated"] if result else 0,
        }

    except Exception as e:
        logger.error(f"Failed to migrate temporal data: {e}")
        # If function doesn't exist, return a helpful message
        if "function migrate_entity_temporal_data" in str(e):
            raise HTTPException(
                status_code=500,
                detail="Temporal migration function not found. Please run database migration 013_entity_temporal.sql first."
            )
        raise HTTPException(status_code=500, detail="Failed to migrate temporal data")


# ============================================
# Temporal Timeline API (v0.12.1)
# ============================================

class YearBucket(BaseModel):
    year: int
    new_concepts: int
    total_concepts: int
    top_concepts: List[str]


class TemporalTimelineResponse(BaseModel):
    min_year: Optional[int] = None
    max_year: Optional[int] = None
    buckets: List[YearBucket]
    total_with_year: int
    total_without_year: int


@router.get("/temporal/{project_id}/timeline", response_model=TemporalTimelineResponse)
async def get_temporal_timeline(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get aggregated timeline data for temporal visualization."""
    await verify_project_access(database, project_id, current_user, "access")

    # TTL cache reuse (metrics_cache singleton)
    cache_key = f"timeline:{project_id}"
    cached = await metrics_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        year_rows = await database.fetch(
            """
            SELECT
                first_seen_year as year,
                COUNT(*) as concept_count,
                (ARRAY_AGG(name ORDER BY
                    CASE WHEN properties->>'centrality_pagerank' ~ '^-?\\d+(\\.\\d+)?$'
                         THEN (properties->>'centrality_pagerank')::float
                         ELSE 0 END
                    DESC NULLS LAST
                ) FILTER (WHERE name IS NOT NULL))[1:5] as top_names
            FROM entities
            WHERE project_id = $1
              AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem',
                                  'Dataset', 'Metric', 'Innovation', 'Limitation')
              AND first_seen_year IS NOT NULL
            GROUP BY first_seen_year
            ORDER BY first_seen_year
            """,
            str(project_id),
        )

        if not year_rows:
            # Fallback to source_year
            year_rows = await database.fetch(
                """
                SELECT
                    source_year as year,
                    COUNT(*) as concept_count,
                    (ARRAY_AGG(name ORDER BY name) FILTER (WHERE name IS NOT NULL))[1:5] as top_names
                FROM entities
                WHERE project_id = $1
                  AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem',
                                      'Dataset', 'Metric', 'Innovation', 'Limitation')
                  AND source_year IS NOT NULL
                GROUP BY source_year
                ORDER BY source_year
                """,
                str(project_id),
            )

        total_without = await database.fetchval(
            """
            SELECT COUNT(*) FROM entities
            WHERE project_id = $1
              AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem',
                                  'Dataset', 'Metric', 'Innovation', 'Limitation')
              AND first_seen_year IS NULL AND source_year IS NULL
            """,
            str(project_id),
        )

        if not year_rows:
            result = TemporalTimelineResponse(
                min_year=None, max_year=None,
                buckets=[], total_with_year=0,
                total_without_year=total_without or 0,
            )
            await metrics_cache.set(cache_key, result)
            return result

        buckets = []
        cumulative = 0
        for row in year_rows:
            cumulative += row["concept_count"]
            buckets.append(YearBucket(
                year=row["year"],
                new_concepts=row["concept_count"],
                total_concepts=cumulative,
                top_concepts=(row["top_names"] or [])[:5],
            ))

        result = TemporalTimelineResponse(
            min_year=year_rows[0]["year"],
            max_year=year_rows[-1]["year"],
            buckets=buckets,
            total_with_year=cumulative,
            total_without_year=total_without or 0,
        )
        await metrics_cache.set(cache_key, result)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get temporal timeline: {e}")
        raise HTTPException(500, "Failed to get temporal timeline data")


# ============================================
# Temporal Trends API (Phase 3A)
# ============================================

class TemporalTrend(BaseModel):
    id: str
    name: str
    entity_type: str
    first_seen_year: int
    last_seen_year: Optional[int] = None
    paper_count: int


class TemporalTrendsResponse(BaseModel):
    year_range: dict  # {min: int, max: int}
    emerging: List[TemporalTrend]
    stable: List[TemporalTrend]
    declining: List[TemporalTrend]
    summary: dict  # {total_classified, emerging_count, stable_count, declining_count}


@router.get("/temporal/{project_id}/trends", response_model=TemporalTrendsResponse)
async def get_temporal_trends(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Classify entities into Emerging / Stable / Declining based on temporal data.

    - Emerging: first appeared within the last 2 years AND in 2+ papers
    - Declining: last seen 3+ years before the most recent year
    - Stable: everything else with 3+ papers

    Requires auth in production.
    """
    await verify_project_access(database, project_id, current_user, "access")

    cache_key = f"temporal_trends:{project_id}"
    cached = await metrics_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        # Get the most recent year across the project
        max_year_row = await database.fetchrow(
            """
            SELECT MAX(COALESCE(last_seen_year, first_seen_year)) as max_year
            FROM entities
            WHERE project_id = $1
              AND first_seen_year IS NOT NULL
            """,
            str(project_id),
        )
        max_year = max_year_row["max_year"] if max_year_row else None

        if max_year is None:
            empty_result = TemporalTrendsResponse(
                year_range={"min": None, "max": None},
                emerging=[],
                stable=[],
                declining=[],
                summary={
                    "total_classified": 0,
                    "emerging_count": 0,
                    "stable_count": 0,
                    "declining_count": 0,
                },
            )
            await metrics_cache.set(cache_key, empty_result)
            return empty_result

        # Fetch all temporally-annotated entities for classification
        rows = await database.fetch(
            """
            SELECT id, name, entity_type::text,
                   first_seen_year, last_seen_year,
                   COALESCE(array_length(source_paper_ids, 1), 0) as paper_count,
                   properties
            FROM entities
            WHERE project_id = $1
              AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem',
                                  'Dataset', 'Metric', 'Innovation', 'Limitation')
              AND first_seen_year IS NOT NULL
            ORDER BY first_seen_year DESC
            """,
            str(project_id),
        )

        if not rows:
            empty_result = TemporalTrendsResponse(
                year_range={"min": None, "max": None},
                emerging=[],
                stable=[],
                declining=[],
                summary={
                    "total_classified": 0,
                    "emerging_count": 0,
                    "stable_count": 0,
                    "declining_count": 0,
                },
            )
            await metrics_cache.set(cache_key, empty_result)
            return empty_result

        min_year = min(row["first_seen_year"] for row in rows)

        emerging: List[TemporalTrend] = []
        stable: List[TemporalTrend] = []
        declining: List[TemporalTrend] = []

        for row in rows:
            trend = TemporalTrend(
                id=str(row["id"]),
                name=row["name"],
                entity_type=row["entity_type"],
                first_seen_year=row["first_seen_year"],
                last_seen_year=row["last_seen_year"],
                paper_count=row["paper_count"],
            )
            lsy = row["last_seen_year"]
            fsy = row["first_seen_year"]
            pc = row["paper_count"]

            # Emerging: first appeared within last 2 years AND in 2+ papers
            if fsy >= max_year - 2 and pc >= 2:
                emerging.append(trend)
            # Declining: hasn't appeared in recent 3+ years
            elif lsy is not None and lsy <= max_year - 3:
                declining.append(trend)
            # Stable: everything else with 3+ papers
            elif pc >= 3:
                stable.append(trend)

        result = TemporalTrendsResponse(
            year_range={"min": min_year, "max": max_year},
            emerging=emerging,
            stable=stable,
            declining=declining,
            summary={
                "total_classified": len(emerging) + len(stable) + len(declining),
                "emerging_count": len(emerging),
                "stable_count": len(stable),
                "declining_count": len(declining),
            },
        )
        await metrics_cache.set(cache_key, result)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get temporal trends: {e}")
        raise HTTPException(500, "Failed to get temporal trends data")


# ============================================
# Paper Citation Network (v0.13.0: On-Demand)
# ============================================

class CitationNodeResponse(BaseModel):
    paper_id: str
    local_id: Optional[str] = None
    title: str
    year: Optional[int] = None
    citation_count: int = 0
    doi: Optional[str] = None
    is_local: bool = False

class CitationEdgeResponse(BaseModel):
    source_id: str
    target_id: str

class CitationNetworkResponse(BaseModel):
    nodes: List[CitationNodeResponse]
    edges: List[CitationEdgeResponse]
    papers_matched: int
    papers_total: int
    build_time_seconds: float

class CitationBuildStatusResponse(BaseModel):
    state: str  # idle, building, completed, failed
    progress: int
    total: int
    phase: str = ""  # matching | references
    error: Optional[str] = None


@router.post("/citation/{project_id}/build")
async def build_citation_network_endpoint(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Start building citation network from Semantic Scholar."""
    await verify_project_access(database, project_id, current_user, "access")

    from graph.citation_builder import (
        get_build_status,
        build_citation_network as do_build,
        MAX_PAPERS_FOR_BUILD,
    )

    status = get_build_status(str(project_id))
    if status.state == "building":
        return {"message": "Build already in progress", "state": "building"}

    paper_rows = await database.fetch(
        """
        SELECT pm.id, pm.title, pm.doi, pm.year
        FROM paper_metadata pm
        WHERE pm.project_id = $1
        AND pm.doi IS NOT NULL
        """,
        str(project_id),
    )

    if not paper_rows:
        raise HTTPException(
            404, "No papers with DOIs found. Import papers with DOI metadata first."
        )

    papers = [
        {
            "local_id": str(row["id"]),
            "title": row["title"],
            "doi": row["doi"],
            "year": row["year"],
        }
        for row in paper_rows
    ]

    if len(papers) > MAX_PAPERS_FOR_BUILD:
        papers = papers[:MAX_PAPERS_FOR_BUILD]

    background_tasks.add_task(do_build, str(project_id), papers)

    return {
        "message": f"Building citation network for {len(papers)} papers",
        "state": "building",
        "total_papers": len(papers),
    }


@router.get("/citation/{project_id}/status",
            response_model=CitationBuildStatusResponse)
async def get_citation_build_status(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get citation network build status."""
    await verify_project_access(database, project_id, current_user, "access")

    from graph.citation_builder import get_build_status

    status = get_build_status(str(project_id))
    return CitationBuildStatusResponse(
        state=status.state,
        progress=status.progress,
        total=status.total,
        phase=status.phase,
        error=status.error,
    )


@router.get("/citation/{project_id}/network",
            response_model=CitationNetworkResponse)
async def get_citation_network_endpoint(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get cached citation network."""
    await verify_project_access(database, project_id, current_user, "access")

    from graph.citation_builder import get_cached_network

    network = get_cached_network(str(project_id))
    if not network:
        raise HTTPException(
            404, "Citation network not built. Click 'Build Citation Network' first."
        )

    return CitationNetworkResponse(
        nodes=[
            CitationNodeResponse(
                paper_id=n.paper_id, local_id=n.local_id, title=n.title,
                year=n.year, citation_count=n.citation_count,
                doi=n.doi, is_local=n.is_local,
            )
            for n in network.nodes
        ],
        edges=[
            CitationEdgeResponse(source_id=e.source_id, target_id=e.target_id)
            for e in network.edges
        ],
        papers_matched=network.papers_matched,
        papers_total=network.papers_total,
        build_time_seconds=network.build_time_seconds,
    )


# ============================================
# Relationship Evidence API (Phase 1: Contextual Edge Exploration)
# ============================================

@router.get("/relationships/{relationship_id}/evidence", response_model=RelationshipEvidenceResponse)
async def get_relationship_evidence(
    relationship_id: str,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Get evidence chunks that support a specific relationship.

    This enables "contextual edge exploration" - clicking an edge shows
    the source text passages that justify the relationship.

    Requires auth in production.
    """
    try:
        # Get the relationship details
        relationship = await database.fetchrow(
            """
            SELECT r.id, r.source_id, r.target_id, r.relationship_type::text, r.project_id,
                   src.name as source_name, tgt.name as target_name
            FROM relationships r
            JOIN entities src ON r.source_id = src.id
            JOIN entities tgt ON r.target_id = tgt.id
            WHERE r.id = $1
            """,
            relationship_id,
        )

        if not relationship:
            raise HTTPException(status_code=404, detail="Relationship not found")

        project_id = UUID(str(relationship["project_id"]))

        # Verify project access
        await verify_project_access(database, project_id, current_user, "access")

        # v0.8.0: Check if relationship_evidence table exists before querying
        table_exists = await database.fetchval(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'relationship_evidence'
            )
            """
        )

        evidence_rows = []
        ai_explanation = None

        if table_exists:
            # Try to get evidence from relationship_evidence table
            try:
                evidence_rows = await database.fetch(
                    """
                    SELECT
                        re.id as evidence_id,
                        re.chunk_id,
                        sc.text,
                        sc.section_type,
                        pm.id as paper_id,
                        pm.title as paper_title,
                        pm.authors as paper_authors,
                        pm.year as paper_year,
                        re.relevance_score,
                        re.context_snippet
                    FROM relationship_evidence re
                    JOIN semantic_chunks sc ON re.chunk_id = sc.id
                    JOIN paper_metadata pm ON sc.paper_id = pm.id
                    WHERE re.relationship_id = $1
                    ORDER BY re.relevance_score DESC
                    LIMIT 10
                    """,
                    relationship_id,
                )
            except Exception as e:
                # If query fails (e.g., RLS issues, missing columns), log and continue
                logger.warning(f"Failed to query relationship_evidence table: {e}")
                evidence_rows = []

        # Phase 7A: Try provenance-based evidence using source_chunk_ids
        # from entity properties. This finds chunks where both entities were
        # actually extracted from, providing precise provenance.
        if not evidence_rows:
            try:
                evidence_rows = await database.fetch(
                    """
                    WITH source_chunks AS (
                        SELECT jsonb_array_elements_text(properties->'source_chunk_ids')::UUID AS cid
                        FROM entities
                        WHERE id = $2
                          AND properties ? 'source_chunk_ids'
                    ),
                    target_chunks AS (
                        SELECT jsonb_array_elements_text(properties->'source_chunk_ids')::UUID AS cid
                        FROM entities
                        WHERE id = $3
                          AND properties ? 'source_chunk_ids'
                    ),
                    shared_chunks AS (
                        SELECT cid FROM source_chunks
                        INTERSECT
                        SELECT cid FROM target_chunks
                    ),
                    all_chunks AS (
                        -- Shared chunks first (higher relevance), then union of individual chunks
                        SELECT cid, 0.9 AS relevance FROM shared_chunks
                        UNION ALL
                        SELECT cid, 0.6 AS relevance FROM source_chunks WHERE cid NOT IN (SELECT cid FROM shared_chunks)
                        UNION ALL
                        SELECT cid, 0.6 AS relevance FROM target_chunks WHERE cid NOT IN (SELECT cid FROM shared_chunks)
                                                                          AND cid NOT IN (SELECT cid FROM source_chunks)
                    )
                    SELECT
                        sc.id as evidence_id,
                        sc.id as chunk_id,
                        sc.text,
                        sc.section_type,
                        pm.id as paper_id,
                        pm.title as paper_title,
                        pm.authors as paper_authors,
                        pm.year as paper_year,
                        ac.relevance as relevance_score,
                        NULL as context_snippet
                    FROM all_chunks ac
                    JOIN semantic_chunks sc ON sc.id = ac.cid
                    LEFT JOIN paper_metadata pm ON sc.paper_id = pm.id
                    WHERE sc.project_id = $1
                    ORDER BY ac.relevance DESC, sc.sequence_order
                    LIMIT 10
                    """,
                    str(project_id),
                    str(relationship["source_id"]),
                    str(relationship["target_id"]),
                )
            except Exception as e:
                logger.debug(f"Phase 7A provenance lookup failed (non-critical): {e}")
                evidence_rows = []

        # Fallback: try to find evidence from semantic chunks that mention both entities by name
        if not evidence_rows:
            source_name = relationship["source_name"]
            target_name = relationship["target_name"]

            # Search for chunks containing both entity names
            evidence_rows = await database.fetch(
                """
                SELECT
                    sc.id as evidence_id,
                    sc.id as chunk_id,
                    sc.text,
                    sc.section_type,
                    pm.id as paper_id,
                    pm.title as paper_title,
                    pm.authors as paper_authors,
                    pm.year as paper_year,
                    0.5 as relevance_score,
                    NULL as context_snippet
                FROM semantic_chunks sc
                JOIN paper_metadata pm ON sc.paper_id = pm.id
                WHERE sc.project_id = $1
                AND sc.text ILIKE $2
                AND sc.text ILIKE $3
                ORDER BY sc.created_at DESC
                LIMIT 5
                """,
                str(project_id),
                f"%{escape_sql_like(source_name)}%",
                f"%{escape_sql_like(target_name)}%",
            )

        # v0.11.0: AI explanation fallback for CO_OCCURS_WITH and no-evidence relationships
        if not evidence_rows:
            rel_type = relationship["relationship_type"]
            source_name = relationship["source_name"]
            target_name = relationship["target_name"]

            # For CO_OCCURS_WITH, provide co-occurrence based explanation
            if rel_type == "CO_OCCURS_WITH":
                ai_explanation = (
                    f"'{source_name}' and '{target_name}' frequently co-occur across multiple papers "
                    f"in this collection. This co-occurrence relationship was detected through "
                    f"statistical analysis of concept mentions within the same documents."
                )
            else:
                # Try LLM-based explanation if available
                try:
                    from llm.user_provider import create_llm_provider_for_user
                    user_id = str(current_user.id) if current_user else None
                    llm = await create_llm_provider_for_user(user_id)
                    if llm:
                        ai_explanation = await llm.generate(
                            f"Explain the academic relationship between '{source_name}' and '{target_name}' "
                            f"in the context of research. Keep it to 2-3 sentences."
                        )
                except Exception as e:
                    logger.warning(f"LLM explanation generation failed: {e}")

        evidence_chunks = [
            EvidenceChunkResponse(
                evidence_id=str(row["evidence_id"]),
                chunk_id=str(row["chunk_id"]),
                text=row["text"][:2000] if row["text"] else "",  # Limit text length
                section_type=row["section_type"] or "unknown",
                paper_id=str(row["paper_id"]) if row["paper_id"] else None,
                paper_title=row["paper_title"],
                paper_authors=row["paper_authors"],
                paper_year=row["paper_year"],
                relevance_score=float(row["relevance_score"]) if row["relevance_score"] else 0.5,
                context_snippet=row["context_snippet"],
            )
            for row in evidence_rows
        ]

        return RelationshipEvidenceResponse(
            relationship_id=relationship_id,
            source_name=relationship["source_name"],
            target_name=relationship["target_name"],
            relationship_type=relationship["relationship_type"],
            evidence_chunks=evidence_chunks,
            total_evidence=len(evidence_chunks),
            ai_explanation=ai_explanation,
        )

    except HTTPException:
        raise
    except asyncpg.exceptions.UndefinedTableError as e:
        logger.warning(f"Relationship evidence table missing: {e}")
        return RelationshipEvidenceResponse(
            relationship_id=relationship_id,
            source_name=relationship["source_name"] if relationship else "Unknown",
            target_name=relationship["target_name"] if relationship else "Unknown",
            relationship_type=relationship["relationship_type"] if relationship else "RELATED_TO",
            evidence_chunks=[],
            total_evidence=0,
            error_code="table_missing",
        )
    except asyncpg.exceptions.InsufficientPrivilegeError as e:
        logger.error(f"RLS permission denied for relationship evidence: {e}")
        return RelationshipEvidenceResponse(
            relationship_id=relationship_id,
            source_name=relationship["source_name"] if relationship else "Unknown",
            target_name=relationship["target_name"] if relationship else "Unknown",
            relationship_type=relationship["relationship_type"] if relationship else "RELATED_TO",
            evidence_chunks=[],
            total_evidence=0,
            error_code="permission_denied",
        )
    except Exception as e:
        logger.error(f"Failed to get relationship evidence: {e}")
        # Return empty response with error code instead of 500
        return RelationshipEvidenceResponse(
            relationship_id=relationship_id,
            source_name=relationship["source_name"] if relationship else "Unknown",
            target_name=relationship["target_name"] if relationship else "Unknown",
            relationship_type=relationship["relationship_type"] if relationship else "RELATED_TO",
            evidence_chunks=[],
            total_evidence=0,
            error_code="query_failed",
        )


# ============================================
# Graph Comparison API (Phase 5)
# ============================================

class ProjectComparisonNode(BaseModel):
    """Node with comparison metadata."""
    id: str
    name: str
    entity_type: str
    in_project_a: bool
    in_project_b: bool
    is_common: bool


class ProjectComparisonEdge(BaseModel):
    """Edge with comparison metadata."""
    id: str
    source: str
    target: str
    relationship_type: str
    in_project_a: bool
    in_project_b: bool
    is_common: bool


class GraphComparisonResponse(BaseModel):
    """Response for graph comparison."""
    project_a_id: str
    project_a_name: str
    project_b_id: str
    project_b_name: str
    # Statistics
    common_entities: int
    unique_to_a: int
    unique_to_b: int
    common_entity_names: List[str]
    # Comparison breakdown
    jaccard_similarity: float
    overlap_coefficient: float
    # Full data for visualization
    nodes: List[ProjectComparisonNode]
    edges: List[ProjectComparisonEdge]


@router.get("/compare/{project_a_id}/{project_b_id}", response_model=GraphComparisonResponse)
async def compare_graphs(
    project_a_id: UUID,
    project_b_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Compare two project knowledge graphs.

    Shows:
    - Common entities (intersection)
    - Unique to each project (difference)
    - Similarity metrics (Jaccard, overlap coefficient)

    Requires auth in production.
    """
    # Verify access to both projects
    await verify_project_access(database, project_a_id, current_user, "access")
    await verify_project_access(database, project_b_id, current_user, "access")

    try:
        # Get project names
        project_a = await database.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1",
            str(project_a_id),
        )
        project_b = await database.fetchrow(
            "SELECT id, name FROM projects WHERE id = $1",
            str(project_b_id),
        )

        if not project_a or not project_b:
            raise HTTPException(status_code=404, detail="One or both projects not found")

        # Get entities from both projects
        entities_a = await database.fetch(
            """
            SELECT id, name, entity_type::text
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            """,
            str(project_a_id),
        )

        entities_b = await database.fetch(
            """
            SELECT id, name, entity_type::text
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            """,
            str(project_b_id),
        )

        # Build name-based lookup for comparison (case-insensitive)
        names_a = {row["name"].lower(): row for row in entities_a}
        names_b = {row["name"].lower(): row for row in entities_b}

        # Find common and unique entities
        common_names = set(names_a.keys()) & set(names_b.keys())
        unique_a_names = set(names_a.keys()) - common_names
        unique_b_names = set(names_b.keys()) - common_names

        # Calculate similarity metrics
        total_unique = len(set(names_a.keys()) | set(names_b.keys()))
        jaccard_similarity = len(common_names) / total_unique if total_unique > 0 else 0

        min_size = min(len(names_a), len(names_b))
        overlap_coefficient = len(common_names) / min_size if min_size > 0 else 0

        # Build comparison nodes
        nodes = []

        # Common entities
        for name in common_names:
            entity = names_a[name]
            nodes.append(ProjectComparisonNode(
                id=f"common_{name}",
                name=entity["name"],
                entity_type=entity["entity_type"],
                in_project_a=True,
                in_project_b=True,
                is_common=True,
            ))

        # Unique to A
        for name in unique_a_names:
            entity = names_a[name]
            nodes.append(ProjectComparisonNode(
                id=f"a_{str(entity['id'])}",
                name=entity["name"],
                entity_type=entity["entity_type"],
                in_project_a=True,
                in_project_b=False,
                is_common=False,
            ))

        # Unique to B
        for name in unique_b_names:
            entity = names_b[name]
            nodes.append(ProjectComparisonNode(
                id=f"b_{str(entity['id'])}",
                name=entity["name"],
                entity_type=entity["entity_type"],
                in_project_a=False,
                in_project_b=True,
                is_common=False,
            ))

        # Get edges from both projects
        edges_a = await database.fetch(
            """
            SELECT r.id, src.name as source_name, tgt.name as target_name, r.relationship_type::text
            FROM relationships r
            JOIN entities src ON r.source_id = src.id
            JOIN entities tgt ON r.target_id = tgt.id
            WHERE r.project_id = $1
            """,
            str(project_a_id),
        )

        edges_b = await database.fetch(
            """
            SELECT r.id, src.name as source_name, tgt.name as target_name, r.relationship_type::text
            FROM relationships r
            JOIN entities src ON r.source_id = src.id
            JOIN entities tgt ON r.target_id = tgt.id
            WHERE r.project_id = $1
            """,
            str(project_b_id),
        )

        # Build edge comparison (by source-target name pairs)
        edge_key_a = {(r["source_name"].lower(), r["target_name"].lower(), r["relationship_type"]): r for r in edges_a}
        edge_key_b = {(r["source_name"].lower(), r["target_name"].lower(), r["relationship_type"]): r for r in edges_b}

        common_edge_keys = set(edge_key_a.keys()) & set(edge_key_b.keys())

        edges = []
        seen_edges = set()

        # Common edges
        for key in common_edge_keys:
            edge = edge_key_a[key]
            edge_id = f"common_{key[0]}_{key[1]}"
            if edge_id not in seen_edges:
                edges.append(ProjectComparisonEdge(
                    id=edge_id,
                    source=f"common_{key[0]}",
                    target=f"common_{key[1]}",
                    relationship_type=edge["relationship_type"],
                    in_project_a=True,
                    in_project_b=True,
                    is_common=True,
                ))
                seen_edges.add(edge_id)

        # Get common entity names for display
        common_entity_names = sorted([names_a[n]["name"] for n in list(common_names)[:20]])

        return GraphComparisonResponse(
            project_a_id=str(project_a_id),
            project_a_name=project_a["name"],
            project_b_id=str(project_b_id),
            project_b_name=project_b["name"],
            common_entities=len(common_names),
            unique_to_a=len(unique_a_names),
            unique_to_b=len(unique_b_names),
            common_entity_names=common_entity_names,
            jaccard_similarity=round(jaccard_similarity, 4),
            overlap_coefficient=round(overlap_coefficient, 4),
            nodes=nodes,
            edges=edges,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compare graphs: {e}")
        raise HTTPException(status_code=500, detail="Failed to compare graphs")


@router.post("/rebuild/{project_id}")
async def rebuild_embeddings_and_relationships(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Rebuild embeddings and relationships for an existing project.

    This is useful when:
    - The original import failed to create embeddings (missing API key)
    - You want to regenerate relationships with different parameters
    - Embeddings need to be updated after entity changes

    Requires authentication in production.
    """
    try:
        # Verify project access
        await verify_project_access(database, project_id, current_user, "edit")

        graph_store = GraphStore(database)

        # Step 1: Create embeddings for entities without them
        logger.info(f"Creating embeddings for project {project_id}")
        embeddings_created = await graph_store.create_embeddings(str(project_id))
        logger.info(f"Created {embeddings_created} embeddings")

        if embeddings_created == 0:
            # Check if it's because no entities need embeddings or API key issue
            entity_count = await database.fetchval(
                "SELECT COUNT(*) FROM entities WHERE project_id = $1",
                project_id,
            )
            entities_with_embeddings = await database.fetchval(
                "SELECT COUNT(*) FROM entities WHERE project_id = $1 AND embedding IS NOT NULL",
                project_id,
            )

            if entity_count == 0:
                return {
                    "status": "warning",
                    "message": "No entities found in project",
                    "embeddings_created": 0,
                    "relationships_created": 0,
                }
            elif entities_with_embeddings == entity_count:
                logger.info("All entities already have embeddings")
            else:
                # Some entities exist but no embeddings created - likely API key issue
                return {
                    "status": "warning",
                    "message": "No embeddings created. Check COHERE_API_KEY configuration.",
                    "entities_count": entity_count,
                    "embeddings_created": 0,
                    "relationships_created": 0,
                }

        # Step 2: Build relationships
        logger.info(f"Building relationships for project {project_id}")
        relationships_created = await graph_store.build_concept_relationships(str(project_id))
        logger.info(f"Created {relationships_created} relationships")

        return {
            "status": "success",
            "message": f"Rebuilt {embeddings_created} embeddings and {relationships_created} relationships",
            "embeddings_created": embeddings_created,
            "relationships_created": relationships_created,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rebuild embeddings/relationships: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to rebuild: {str(e)}"
        )


# ============================================
# Phase 10B: Cross-Paper Entity Linking
# ============================================

class CrossPaperLinkRequest(BaseModel):
    """Request body for cross-paper entity linking."""
    entity_types: Optional[List[str]] = None  # Defaults to ["Method", "Dataset", "Concept"]


@router.post("/{project_id}/cross-paper-links")
async def create_cross_paper_links(
    project_id: UUID,
    request: Optional[CrossPaperLinkRequest] = None,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Trigger cross-paper entity linking for a project.

    Finds entities with the same canonical name across different source papers
    and creates SAME_AS relationships between them.  This is a second-pass
    operation that should be run after entity extraction and standard entity
    resolution.

    Returns:
        JSON with groups_found, links_created, skipped_existing, entity_types.
    """
    try:
        await verify_project_access(database, project_id, current_user, "edit")

        entity_types = None
        if request and request.entity_types:
            entity_types = request.entity_types

        service = EntityResolutionService()
        result = await service.cross_paper_entity_linking(
            project_id=str(project_id),
            db=database,
            entity_types=entity_types,
        )

        return {
            "status": "success",
            "message": (
                f"Cross-paper linking complete: {result['links_created']} links "
                f"created from {result['groups_found']} entity groups"
            ),
            **result,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cross-paper entity linking failed for project {project_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Cross-paper entity linking failed: {str(e)}"
        )


@router.get("/communities/{project_id}")
async def get_communities(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Get community detection results for a project."""
    await verify_project_access(database, project_id, current_user, "access")

    try:
        from graph.community_detector import CommunityDetector
        detector = CommunityDetector(db_connection=database)
        communities = await detector.detect_communities(str(project_id))
        return {"communities": communities}
    except Exception as e:
        logger.error(f"Community detection failed for project {project_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Community detection failed: {str(e)}"
        )


# ============================================
# Phase 2A: Research Landscape Summary Endpoint
# ============================================

@router.get("/summary/{project_id}")
async def get_project_summary(
    project_id: UUID,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Get a unified research landscape summary for a project.

    Aggregates overview stats, quality metrics, top entities by PageRank,
    community clusters, structural gaps, and temporal info into a single response.
    """
    await verify_project_access(database, project_id, current_user, "access")

    cache_key = f"project_summary:{project_id}"
    cached = await metrics_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        # ---- Project name ----
        project_row = await database.fetchrow(
            "SELECT name FROM projects WHERE id = $1",
            str(project_id),
        )
        project_name = project_row["name"] if project_row else "Unknown Project"

        # ---- Overview: paper / entity / relationship counts ----
        paper_count = await database.fetchval(
            "SELECT COUNT(*) FROM paper_metadata WHERE project_id = $1",
            str(project_id),
        ) or 0

        entity_count = await database.fetchval(
            """
            SELECT COUNT(*) FROM entities
            WHERE project_id = $1
            """,
            str(project_id),
        ) or 0

        relationship_count = await database.fetchval(
            "SELECT COUNT(*) FROM relationships WHERE project_id = $1",
            str(project_id),
        ) or 0

        type_rows = await database.fetch(
            """
            SELECT entity_type::text, COUNT(*) as count
            FROM entities
            WHERE project_id = $1
            GROUP BY entity_type
            """,
            str(project_id),
        )
        entity_type_distribution = {r["entity_type"]: r["count"] for r in type_rows}

        # ---- Quality metrics via CentralityAnalyzer ----
        quality_metrics: dict = {}
        try:
            from graph.centrality_analyzer import centrality_analyzer, ClusterResult

            node_rows = await database.fetch(
                """
                SELECT id, entity_type::text, name, properties
                FROM entities
                WHERE project_id = $1
                AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                """,
                str(project_id),
            )
            edge_rows = await database.fetch(
                """
                SELECT id, source_id, target_id, relationship_type::text,
                       COALESCE(CASE WHEN properties->>'weight' ~ '^-?\\d+(\\.\\d+)?$' THEN (properties->>'weight')::float ELSE NULL END, 1.0) as weight
                FROM relationships
                WHERE project_id = $1
                """,
                str(project_id),
            )
            cluster_rows_q = await database.fetch(
                """
                SELECT cluster_id, concepts, size
                FROM concept_clusters
                WHERE project_id = $1
                ORDER BY cluster_id
                """,
                str(project_id),
            )

            nodes_list = [
                {
                    "id": str(r["id"]),
                    "entity_type": r["entity_type"],
                    "name": r["name"],
                    "properties": _parse_json_field(r["properties"]),
                }
                for r in node_rows
            ]
            edges_list = [
                {
                    "id": str(r["id"]),
                    "source": str(r["source_id"]),
                    "target": str(r["target_id"]),
                    "weight": _safe_float(r["weight"], 1.0),
                }
                for r in edge_rows
            ]
            clusters_list = [
                ClusterResult(
                    cluster_id=r["cluster_id"],
                    node_ids=[str(c) for c in (r["concepts"] or [])],
                    node_names=[],
                    centroid=None,
                    size=r["size"],
                )
                for r in cluster_rows_q
            ]

            if nodes_list:
                graph_metrics = centrality_analyzer.compute_graph_metrics(
                    nodes_list, edges_list, clusters_list
                )
                quality_metrics["modularity_raw"] = getattr(graph_metrics, "modularity_raw", None)
                quality_metrics["diversity"] = getattr(graph_metrics, "diversity", None)
                quality_metrics["density"] = getattr(graph_metrics, "density", None)

                # Cluster quality (silhouette, coherence, coverage)
                emb_rows = await database.fetch(
                    """
                    SELECT id, embedding
                    FROM entities
                    WHERE project_id = $1
                    AND embedding IS NOT NULL
                    AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                    """,
                    str(project_id),
                )
                embeddings_map = {}
                for row in emb_rows:
                    emb = _parse_embedding(row["embedding"])
                    if emb:
                        embeddings_map[str(row["id"])] = emb

                cluster_quality = centrality_analyzer.compute_cluster_quality(
                    nodes_list,
                    edges_list,
                    clusters_list,
                    embeddings_map=embeddings_map if embeddings_map else None,
                )
                quality_metrics["silhouette"] = getattr(cluster_quality, "silhouette_score", None)
                quality_metrics["coherence"] = getattr(cluster_quality, "coherence", None)
                quality_metrics["paper_coverage"] = getattr(cluster_quality, "paper_coverage", None)

            # Entity type diversity
            visualized_types = {"Concept", "Method", "Finding", "Problem", "Dataset", "Metric", "Innovation", "Limitation"}
            type_counts = {k: v for k, v in entity_type_distribution.items() if k in visualized_types}
            if type_counts:
                non_zero = sum(1 for v in type_counts.values() if v > 0)
                quality_metrics["entity_diversity"] = non_zero / len(visualized_types)
            else:
                quality_metrics["entity_diversity"] = 0.0

        except Exception as qm_err:
            logger.warning(f"Quality metrics computation failed for summary {project_id}: {qm_err}")

        # ---- Top entities by PageRank ----
        top_entity_rows = await database.fetch(
            """
            SELECT name, entity_type::text, properties
            FROM entities
            WHERE project_id = $1
            AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            AND properties->>'centrality_pagerank' IS NOT NULL
            ORDER BY CASE WHEN properties->>'centrality_pagerank' ~ '^-?\\d+(\\.\\d+)?$'
                          THEN (properties->>'centrality_pagerank')::float
                          ELSE 0 END DESC NULLS LAST
            LIMIT 10
            """,
            str(project_id),
        )
        top_entities = [
            {
                "name": r["name"],
                "entity_type": r["entity_type"],
                "pagerank": _safe_float(_parse_json_field(r["properties"]).get("centrality_pagerank", 0)),
            }
            for r in top_entity_rows
        ]

        # ---- Communities (clusters) ----
        community_rows = await database.fetch(
            """
            SELECT cluster_id, label, size, concept_names
            FROM concept_clusters
            WHERE project_id = $1
            ORDER BY size DESC
            """,
            str(project_id),
        )
        communities = [
            {
                "cluster_id": r["cluster_id"],
                "label": r["label"],
                "size": r["size"],
                "concept_names": (r["concept_names"] or [])[:8],
            }
            for r in community_rows
        ]

        # ---- Structural gaps (top 5) ----
        gap_rows = await database.fetch(
            """
            SELECT gap_strength, research_questions,
                   cluster_a_id, cluster_b_id,
                   cluster_a_names, cluster_b_names
            FROM structural_gaps
            WHERE project_id = $1
            ORDER BY gap_strength DESC
            LIMIT 5
            """,
            str(project_id),
        )

        # Resolve cluster labels from concept_clusters
        cluster_label_map: dict = {}
        for row in community_rows:
            cluster_label_map[row["cluster_id"]] = row["label"] or f"Cluster {row['cluster_id']}"

        structural_gaps = [
            {
                "cluster_a_id": r["cluster_a_id"],
                "cluster_b_id": r["cluster_b_id"],
                "cluster_a_label": cluster_label_map.get(r["cluster_a_id"], f"Cluster {r['cluster_a_id']}"),
                "cluster_b_label": cluster_label_map.get(r["cluster_b_id"], f"Cluster {r['cluster_b_id']}"),
                "cluster_a_names": (r["cluster_a_names"] or [])[:5],
                "cluster_b_names": (r["cluster_b_names"] or [])[:5],
                "gap_strength": _safe_float(r["gap_strength"]),
                "research_questions": r["research_questions"] or [],
                "impact_score": 0.0,
                "feasibility_score": 0.0,
                "research_significance": "",
                "quadrant": "",
            }
            for r in gap_rows
        ]

        # ---- Temporal info ----
        min_year = None
        max_year = None
        emerging_concepts: list = []
        try:
            temporal_row = await database.fetchrow(
                """
                SELECT
                    MIN(first_seen_year) as min_year,
                    MAX(COALESCE(last_seen_year, first_seen_year)) as max_year
                FROM entities
                WHERE project_id = $1
                """,
                str(project_id),
            )
            min_year = temporal_row["min_year"] if temporal_row else None
            max_year = temporal_row["max_year"] if temporal_row else None

            if max_year is not None:
                emerging_threshold = max_year - 2
                emerging_rows = await database.fetch(
                    """
                    SELECT name
                    FROM entities
                    WHERE project_id = $1
                    AND first_seen_year >= $2
                    AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                    ORDER BY CASE WHEN properties->>'centrality_pagerank' ~ '^-?\\d+(\\.\\d+)?$'
                                  THEN (properties->>'centrality_pagerank')::float
                                  ELSE 0 END DESC NULLS LAST
                    LIMIT 10
                    """,
                    str(project_id),
                    emerging_threshold,
                )
                emerging_concepts = [r["name"] for r in emerging_rows]
        except Exception as temporal_err:
            logger.warning(f"Temporal info computation failed for summary {project_id}: {temporal_err}")

        # ---- Assemble response ----
        payload = {
            "project_id": str(project_id),
            "project_name": project_name,
            "overview": {
                "total_papers": paper_count,
                "total_entities": entity_count,
                "total_relationships": relationship_count,
                "entity_type_distribution": entity_type_distribution,
            },
            "quality_metrics": quality_metrics,
            "top_entities": top_entities,
            "communities": communities,
            "structural_gaps": structural_gaps,
            "temporal_info": {
                "min_year": min_year,
                "max_year": max_year,
                "emerging_concepts": emerging_concepts,
            },
        }

        await metrics_cache.set(cache_key, payload, ttl=300)
        return payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compute project summary for {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to compute project summary")


# ============================================
# Phase 2B-2: Summary Export Endpoint (Markdown / HTML)
# ============================================

@router.get("/summary/{project_id}/export")
async def export_project_summary(
    project_id: UUID,
    format: str = Query("markdown", pattern="^(markdown|html)$"),
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Export the project research landscape summary as Markdown or HTML.

    Query params:
        format: "markdown" (default) or "html"
    """
    await verify_project_access(database, project_id, current_user, "access")

    try:
        from graph.report_generator import generate_markdown_report, generate_html_report

        # Reuse the summary logic — call the summary endpoint helper directly via DB
        # (same queries, no HTTP round-trip)
        summary_response = await get_project_summary(
            project_id=project_id,
            database=database,
            current_user=current_user,
        )

        project_name = summary_response.get("project_name", "Project")
        safe_name = project_name.replace(" ", "_").replace("/", "-")

        if format == "html":
            content = generate_html_report(summary_response, project_name)
            media_type = "text/html"
            filename = f"research_report_{safe_name}.html"
        else:
            content = generate_markdown_report(summary_response, project_name)
            media_type = "text/markdown"
            filename = f"research_report_{safe_name}.md"

        encoded = content.encode("utf-8")
        buffer = io.BytesIO(encoded)

        return StreamingResponse(
            buffer,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(encoded)),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to export project summary for {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export project summary")


# ============================================
# Paper Fit Analysis (v0.30.0)
# ============================================

class PaperFitRequest(BaseModel):
    title: str
    abstract: Optional[str] = None
    doi: Optional[str] = None


@router.post("/{project_id}/paper-fit")
async def analyze_paper_fit(
    project_id: UUID,
    request: PaperFitRequest,
    database=Depends(get_db),
    current_user: Optional[User] = Depends(require_auth_if_configured),
):
    """Analyze where a paper fits in the knowledge graph."""
    await verify_project_access(database, project_id, current_user, "access")

    abstract = request.abstract

    # If DOI provided, try to look up abstract
    if request.doi and not abstract:
        try:
            from integrations.semantic_scholar import SemanticScholarClient
            client = SemanticScholarClient()
            paper = await client.get_paper(request.doi)
            if paper and paper.abstract:
                abstract = paper.abstract
        except Exception as e:
            logger.warning(f"S2 lookup failed for DOI {request.doi}: {e}")

    if not abstract:
        abstract = request.title

    from graph.paper_fit_analyzer import PaperFitAnalyzer
    analyzer = PaperFitAnalyzer(database)
    result = await analyzer.analyze(project_id, request.title, abstract)

    return {
        "paper_title": result.paper_title,
        "paper_abstract": result.paper_abstract,
        "matched_entities": result.matched_entities,
        "community_relevance": result.community_relevance,
        "gap_connections": result.gap_connections,
        "fit_summary": result.fit_summary,
    }
