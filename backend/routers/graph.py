"""
Graph API Router

Handles knowledge graph queries and visualization data.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from enum import Enum


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


# Pydantic Models
class NodeResponse(BaseModel):
    id: str
    entity_type: EntityType
    name: str
    properties: dict = {}


class EdgeResponse(BaseModel):
    id: str
    source: str
    target: str
    relationship_type: RelationshipType
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


# In-memory storage (will be replaced with PostgreSQL)
_nodes_db: dict = {}
_edges_db: dict = {}


@router.get("/nodes", response_model=List[NodeResponse])
async def get_nodes(
    project_id: UUID,
    entity_type: Optional[EntityType] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
):
    """Get all nodes for a project, optionally filtered by type."""
    nodes = list(_nodes_db.values())

    if entity_type:
        nodes = [n for n in nodes if n.get("entity_type") == entity_type]

    return nodes[offset : offset + limit]


@router.get("/edges", response_model=List[EdgeResponse])
async def get_edges(
    project_id: UUID,
    relationship_type: Optional[RelationshipType] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
):
    """Get all edges for a project, optionally filtered by type."""
    edges = list(_edges_db.values())

    if relationship_type:
        edges = [e for e in edges if e.get("relationship_type") == relationship_type]

    return edges[offset : offset + limit]


@router.get("/visualization/{project_id}", response_model=GraphDataPageResponse)
async def get_visualization_data(
    project_id: UUID,
    entity_types: Optional[List[EntityType]] = Query(None),
    limit: int = Query(200, le=500),
    cursor: Optional[str] = Query(None),
    max_nodes: Optional[int] = Query(None, le=500),
):
    """Get graph data optimized for visualization (React Flow format)."""
    nodes = list(_nodes_db.values())

    if entity_types:
        nodes = [n for n in nodes if n.get("entity_type") in entity_types]

    total = len(nodes)
    effective_limit = max_nodes or limit
    start = int(cursor) if cursor and cursor.isdigit() else 0
    end = start + effective_limit

    nodes = nodes[start:end]
    edges = list(_edges_db.values())

    node_ids = {n["id"] for n in nodes}
    edges = [e for e in edges if e["source"] in node_ids and e["target"] in node_ids]

    next_cursor = str(end) if end < total else None

    return GraphDataPageResponse(nodes=nodes, edges=edges, cursor=next_cursor, total=total)


@router.get("/subgraph/{node_id}", response_model=GraphDataResponse)
async def get_subgraph(
    node_id: str,
    depth: int = Query(1, le=3),
    max_nodes: int = Query(50, le=200),
):
    """Get subgraph centered around a specific node."""
    # TODO: Implement BFS/DFS traversal from the node
    center_node = _nodes_db.get(node_id)
    if not center_node:
        raise HTTPException(status_code=404, detail="Node not found")

    # For now, return just the center node
    return GraphDataResponse(nodes=[center_node], edges=[])


@router.post("/search", response_model=List[NodeResponse])
async def search_nodes(request: SearchRequest):
    """Search nodes by query string."""
    query_lower = request.query.lower()

    results = []
    for node in _nodes_db.values():
        if query_lower in node["name"].lower():
            if request.entity_types is None or node["entity_type"] in request.entity_types:
                results.append(node)
                if len(results) >= request.limit:
                    break

    return results


@router.get("/similar/{node_id}", response_model=List[NodeResponse])
async def get_similar_nodes(
    node_id: str,
    limit: int = Query(10, le=50),
):
    """Get similar nodes using vector similarity (pgvector)."""
    node = _nodes_db.get(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # TODO: Implement pgvector similarity search
    return []


@router.get("/gaps/{project_id}", response_model=List[NodeResponse])
async def get_research_gaps(
    project_id: UUID,
    min_papers: int = Query(3, description="Concepts with fewer papers are gaps"),
):
    """Identify research gaps - concepts with few connected papers."""
    # TODO: Implement research gap identification
    return []
