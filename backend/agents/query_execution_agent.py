"""
Query Execution Agent

Executes sub-tasks by running SQL queries, vector searches, and graph traversals.
Implements hybrid search (pgvector + keyword), entity retrieval, and gap analysis.
"""

import json
import logging
import time
from typing import Any, Optional
from pydantic import BaseModel

from embedding_service import EmbeddingService, get_embedding_service
from graph.reranker import SemanticReranker

logger = logging.getLogger(__name__)


class QueryResult(BaseModel):
    task_index: int
    success: bool
    data: Any = None
    error: str | None = None


class TraceStep(BaseModel):
    step_index: int
    action: str  # 'vector_search', 'keyword_search', 'graph_traverse', 'gap_analysis', 'aggregate'
    node_ids: list[str] = []
    edge_ids: list[str] = []
    thought: str = ""
    duration_ms: int = 0


class ExecutionResult(BaseModel):
    results: list[QueryResult]
    nodes_accessed: list[str] = []
    edges_traversed: list[str] = []
    trace_steps: list[TraceStep] = []


class QueryExecutionAgent:
    """
    Executes queries against the database and graph.

    Supports:
    - Hybrid search (vector similarity + keyword matching)
    - Entity retrieval with relationship expansion
    - Research gap analysis
    - Graph traversal queries
    """

    def __init__(self, db_connection=None, vector_store=None, graph_store=None,
                 embedding_service: Optional[EmbeddingService] = None):
        self.db = db_connection
        self.vector_store = vector_store
        self.graph_store = graph_store
        self._embedding_service = embedding_service
        self.reranker = SemanticReranker(embedding_service=embedding_service)

    @property
    def embedding_service(self) -> Optional[EmbeddingService]:
        """Lazy-load embedding service."""
        if self._embedding_service is None:
            try:
                self._embedding_service = get_embedding_service()
            except Exception as e:
                logger.warning(f"EmbeddingService unavailable: {e}")
        return self._embedding_service

    async def execute(self, task_plan) -> ExecutionResult:
        """
        Execute all tasks in the plan.
        """
        results = []
        nodes_accessed = []
        edges_traversed = []
        trace_steps = []

        for i, task in enumerate(task_plan.tasks):
            # Check dependencies
            deps_satisfied = all(
                results[dep].success for dep in task.depends_on if dep < len(results)
            )

            if not deps_satisfied:
                results.append(
                    QueryResult(
                        task_index=i,
                        success=False,
                        error="Dependencies not satisfied",
                    )
                )
                continue

            try:
                start_time = time.time()

                if task.task_type == "search":
                    data = await self._execute_search(task.parameters)
                    action = "vector_search"
                elif task.task_type == "retrieve":
                    data = await self._execute_retrieve(task.parameters)
                    action = "graph_traverse"
                elif task.task_type == "analyze_gaps":
                    data = await self._execute_gap_analysis(task.parameters)
                    action = "gap_analysis"
                elif task.task_type == "traverse":
                    data = await self._execute_traversal(task.parameters)
                    action = "graph_traverse"
                elif task.task_type == "aggregate":
                    data = await self._execute_aggregation(task.parameters)
                    action = "aggregate"
                else:
                    data = {"placeholder": True, "task_type": task.task_type}
                    action = task.task_type

                duration_ms = int((time.time() - start_time) * 1000)

                # Track accessed nodes
                step_node_ids = []
                if isinstance(data, dict) and "nodes" in data:
                    step_node_ids = [n.get("id") for n in data["nodes"] if n.get("id")]
                    nodes_accessed.extend(step_node_ids)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get("id"):
                            step_node_ids.append(item["id"])
                            nodes_accessed.append(item["id"])

                # Record trace step
                trace_steps.append(TraceStep(
                    step_index=i,
                    action=action,
                    node_ids=step_node_ids[:20],  # Limit for payload size
                    thought=f"Executed {task.task_type} task",
                    duration_ms=duration_ms,
                ))

                results.append(
                    QueryResult(task_index=i, success=True, data=data)
                )

            except Exception as e:
                logger.error(f"Task {i} execution failed: {e}")
                results.append(
                    QueryResult(task_index=i, success=False, error=str(e))
                )

        return ExecutionResult(
            results=results,
            nodes_accessed=list(set(nodes_accessed)),
            edges_traversed=list(set(edges_traversed)),
            trace_steps=trace_steps,
        )

    async def _execute_search(self, params: dict) -> list:
        """
        Execute a hybrid search query combining vector similarity and keyword matching.

        Params:
            query: Search query string
            entity_types: Optional list of entity types to filter
            project_id: Project ID to search within
            limit: Maximum number of results
            use_vector: Whether to use vector similarity (default True)
            use_keyword: Whether to use keyword matching (default True)
        """
        query = params.get("query", "")
        entity_types = params.get("entity_types", [])
        project_id = params.get("project_id")
        limit = params.get("limit", 20)
        use_vector = params.get("use_vector", True)
        use_keyword = params.get("use_keyword", True)

        if not query:
            return []

        results = []

        # Vector search
        if use_vector and self.vector_store:
            try:
                vector_results = await self._vector_search(query, project_id, entity_types, limit)
                results.extend(vector_results)
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")

        # Keyword search
        if use_keyword and self.db:
            try:
                keyword_results = await self._keyword_search(query, project_id, entity_types, limit)

                # Merge results, avoiding duplicates
                existing_ids = {r["id"] for r in results}
                for kr in keyword_results:
                    if kr["id"] not in existing_ids:
                        results.append(kr)
                        existing_ids.add(kr["id"])

            except Exception as e:
                logger.warning(f"Keyword search failed: {e}")

        # Sort by relevance score if available
        results.sort(key=lambda x: x.get("score", 0), reverse=True)

        # Apply semantic reranking if we have enough results
        if len(results) > 1:
            try:
                results = await self.reranker.rerank(
                    query=query,
                    results=results,
                    top_k=limit,
                )
            except Exception as e:
                logger.warning(f"Reranking failed, using original order: {e}")

        return results[:limit]

    async def _vector_search(
        self,
        query: str,
        project_id: Optional[str],
        entity_types: list[str],
        limit: int,
    ) -> list[dict]:
        """Execute vector similarity search using pgvector."""
        if not self.db or not self.embedding_service:
            return []

        try:
            # Generate embedding for the query text
            query_embedding = self.embedding_service.embed_text(query)

            # Build parameterized query
            base_query = """
                SELECT e.id::text, e.name, e.entity_type, e.properties,
                       1 - (e.embedding <=> $1::vector) as score
                FROM entities e
                WHERE e.embedding IS NOT NULL
            """
            params: list[Any] = [str(query_embedding)]
            param_idx = 2

            if project_id:
                base_query += f" AND e.project_id = ${param_idx}"
                params.append(project_id)
                param_idx += 1

            if entity_types:
                base_query += f" AND e.entity_type = ANY(${param_idx}::text[])"
                params.append(entity_types)
                param_idx += 1

            base_query += f" ORDER BY e.embedding <=> $1::vector LIMIT ${param_idx}"
            params.append(limit)

            rows = await self.db.fetch(base_query, *params)

            results = []
            for row in rows:
                props = row["properties"]
                if isinstance(props, str):
                    try:
                        props = json.loads(props)
                    except Exception:
                        props = {}

                results.append({
                    "id": row["id"],
                    "name": row["name"],
                    "entity_type": row["entity_type"],
                    "properties": props,
                    "score": float(row["score"]),
                })

            return results

        except Exception as e:
            logger.warning(f"Vector search failed: {e}")
            return []

    async def _keyword_search(
        self,
        query: str,
        project_id: Optional[str],
        entity_types: list[str],
        limit: int,
    ) -> list[dict]:
        """Execute keyword/text search using ILIKE and trigram similarity."""
        if not self.db:
            return []

        # Build search pattern
        search_pattern = f"%{query}%"

        # Build query
        sql = """
            SELECT
                id::text,
                name,
                entity_type,
                properties,
                CASE
                    WHEN LOWER(name) = LOWER($1) THEN 1.0
                    WHEN LOWER(name) LIKE LOWER($1) || '%' THEN 0.9
                    WHEN LOWER(name) LIKE '%' || LOWER($1) THEN 0.8
                    ELSE 0.5
                END as score
            FROM entities
            WHERE name ILIKE $2
        """
        params = [query, search_pattern]
        param_idx = 3

        if project_id:
            sql += f" AND project_id = ${param_idx}"
            params.append(project_id)
            param_idx += 1

        if entity_types:
            sql += f" AND entity_type = ANY(${param_idx}::text[])"
            params.append(entity_types)
            param_idx += 1

        sql += f" ORDER BY score DESC, name LIMIT ${param_idx}"
        params.append(limit)

        try:
            rows = await self.db.fetch(sql, *params)
            results = []

            for row in rows:
                props = row["properties"]
                if isinstance(props, str):
                    try:
                        props = json.loads(props)
                    except:
                        props = {}

                results.append({
                    "id": row["id"],
                    "name": row["name"],
                    "entity_type": row["entity_type"],
                    "properties": props,
                    "score": float(row["score"]),
                })

            return results

        except Exception as e:
            logger.error(f"Keyword search failed: {e}")
            return []

    async def _execute_retrieve(self, params: dict) -> dict:
        """
        Retrieve entity details with optional relationship expansion.

        Params:
            entity_id: ID of entity to retrieve
            include_relationships: Whether to include connected entities (default True)
            relationship_types: Optional filter for relationship types
            depth: How many hops to traverse (default 1)
        """
        entity_id = params.get("entity_id")
        include_relationships = params.get("include_relationships", True)
        relationship_types = params.get("relationship_types", [])
        depth = params.get("depth", 1)

        if not entity_id or not self.db:
            return {}

        try:
            # Get main entity
            entity_row = await self.db.fetchrow(
                """
                SELECT id::text, name, entity_type, properties, description,
                       confidence, concept_type_id
                FROM entities
                WHERE id = $1
                """,
                entity_id,
            )

            if not entity_row:
                return {}

            props = entity_row["properties"]
            if isinstance(props, str):
                try:
                    props = json.loads(props)
                except:
                    props = {}

            result = {
                "id": entity_row["id"],
                "name": entity_row["name"],
                "entity_type": entity_row["entity_type"],
                "properties": props,
                "description": entity_row["description"],
                "confidence": entity_row["confidence"],
                "relationships": [],
                "connected_entities": [],
            }

            # Get relationships
            if include_relationships:
                rel_query = """
                    SELECT
                        r.id::text as rel_id,
                        r.relationship_type,
                        r.properties as rel_properties,
                        r.weight,
                        CASE WHEN r.source_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction,
                        CASE WHEN r.source_id = $1 THEN r.target_id ELSE r.source_id END as connected_id
                    FROM relationships r
                    WHERE r.source_id = $1 OR r.target_id = $1
                """
                rel_params = [entity_id]

                if relationship_types:
                    rel_query += " AND r.relationship_type = ANY($2::text[])"
                    rel_params.append(relationship_types)

                rel_rows = await self.db.fetch(rel_query, *rel_params)

                connected_ids = []
                for rel_row in rel_rows:
                    rel_props = rel_row["rel_properties"]
                    if isinstance(rel_props, str):
                        try:
                            rel_props = json.loads(rel_props)
                        except:
                            rel_props = {}

                    result["relationships"].append({
                        "id": rel_row["rel_id"],
                        "type": rel_row["relationship_type"],
                        "direction": rel_row["direction"],
                        "connected_id": str(rel_row["connected_id"]),
                        "weight": rel_row["weight"],
                        "properties": rel_props,
                    })
                    connected_ids.append(rel_row["connected_id"])

                # Get connected entities
                if connected_ids:
                    conn_rows = await self.db.fetch(
                        """
                        SELECT id::text, name, entity_type, properties
                        FROM entities
                        WHERE id = ANY($1::uuid[])
                        """,
                        connected_ids,
                    )

                    for conn_row in conn_rows:
                        conn_props = conn_row["properties"]
                        if isinstance(conn_props, str):
                            try:
                                conn_props = json.loads(conn_props)
                            except:
                                conn_props = {}

                        result["connected_entities"].append({
                            "id": conn_row["id"],
                            "name": conn_row["name"],
                            "entity_type": conn_row["entity_type"],
                            "properties": conn_props,
                        })

            return result

        except Exception as e:
            logger.error(f"Entity retrieval failed: {e}")
            return {}

    async def _execute_gap_analysis(self, params: dict) -> list:
        """
        Analyze research gaps - concepts with few supporting papers or evidence.

        Params:
            project_id: Project to analyze
            min_papers: Minimum papers for a concept to not be a gap (default 3)
            entity_type: Type to analyze (default "Concept")
            include_stats: Include detailed statistics (default True)
        """
        project_id = params.get("project_id")
        min_papers = params.get("min_papers", 3)
        entity_type = params.get("entity_type", "Concept")
        include_stats = params.get("include_stats", True)

        if not project_id or not self.db:
            return []

        try:
            # Find concepts with fewer than min_papers connected papers
            sql = """
                SELECT
                    e.id::text,
                    e.name,
                    e.entity_type,
                    e.properties,
                    e.description,
                    COUNT(DISTINCT r.source_id) as paper_count,
                    COUNT(DISTINCT r2.id) as related_concept_count
                FROM entities e
                LEFT JOIN relationships r ON e.id = r.target_id
                    AND r.relationship_type = 'DISCUSSES_CONCEPT'
                LEFT JOIN relationships r2 ON e.id = r2.source_id
                    AND r2.relationship_type = 'RELATED_TO'
                WHERE e.project_id = $1
                    AND e.entity_type = $2
                GROUP BY e.id, e.name, e.entity_type, e.properties, e.description
                HAVING COUNT(DISTINCT r.source_id) < $3
                ORDER BY COUNT(DISTINCT r.source_id) ASC, e.name
            """

            rows = await self.db.fetch(sql, project_id, entity_type, min_papers)

            gaps = []
            for row in rows:
                props = row["properties"]
                if isinstance(props, str):
                    try:
                        props = json.loads(props)
                    except:
                        props = {}

                gap = {
                    "id": row["id"],
                    "name": row["name"],
                    "entity_type": row["entity_type"],
                    "properties": props,
                    "description": row["description"],
                    "gap_reason": f"Only {row['paper_count']} papers discuss this concept",
                }

                if include_stats:
                    gap["stats"] = {
                        "paper_count": row["paper_count"],
                        "related_concept_count": row["related_concept_count"],
                    }

                gaps.append(gap)

            return gaps

        except Exception as e:
            logger.error(f"Gap analysis failed: {e}")
            return []

    async def _execute_traversal(self, params: dict) -> dict:
        """
        Execute graph traversal from a starting node.

        Params:
            start_node: Starting entity ID
            relationship_types: Optional filter for relationship types
            direction: "outgoing", "incoming", or "both" (default "both")
            max_depth: Maximum traversal depth (default 2)
            limit: Maximum nodes to return (default 50)
        """
        start_node = params.get("start_node")
        relationship_types = params.get("relationship_types", [])
        direction = params.get("direction", "both")
        max_depth = params.get("max_depth", 2)
        limit = params.get("limit", 50)

        if not start_node or not self.db:
            return {"nodes": [], "edges": []}

        try:
            visited = {start_node}
            current_layer = [start_node]
            all_nodes = []
            all_edges = []

            for depth in range(max_depth):
                if not current_layer or len(all_nodes) >= limit:
                    break

                # Build relationship query based on direction
                if direction == "outgoing":
                    rel_condition = "r.source_id = ANY($1::uuid[])"
                    connected_col = "r.target_id"
                elif direction == "incoming":
                    rel_condition = "r.target_id = ANY($1::uuid[])"
                    connected_col = "r.source_id"
                else:  # both
                    rel_condition = "(r.source_id = ANY($1::uuid[]) OR r.target_id = ANY($1::uuid[]))"
                    connected_col = "CASE WHEN r.source_id = ANY($1::uuid[]) THEN r.target_id ELSE r.source_id END"

                rel_query = f"""
                    SELECT
                        r.id::text as edge_id,
                        r.source_id::text,
                        r.target_id::text,
                        r.relationship_type,
                        r.properties as rel_properties,
                        {connected_col}::text as connected_id
                    FROM relationships r
                    WHERE {rel_condition}
                """
                rel_params = [current_layer]

                if relationship_types:
                    rel_query += " AND r.relationship_type = ANY($2::text[])"
                    rel_params.append(relationship_types)

                rel_rows = await self.db.fetch(rel_query, *rel_params)

                next_layer = []
                for rel_row in rel_rows:
                    connected_id = rel_row["connected_id"]

                    if connected_id not in visited:
                        visited.add(connected_id)
                        next_layer.append(connected_id)

                    rel_props = rel_row["rel_properties"]
                    if isinstance(rel_props, str):
                        try:
                            rel_props = json.loads(rel_props)
                        except:
                            rel_props = {}

                    all_edges.append({
                        "id": rel_row["edge_id"],
                        "source": rel_row["source_id"],
                        "target": rel_row["target_id"],
                        "type": rel_row["relationship_type"],
                        "properties": rel_props,
                    })

                current_layer = next_layer[:limit - len(all_nodes)]

            # Fetch all visited nodes
            if visited:
                node_rows = await self.db.fetch(
                    """
                    SELECT id::text, name, entity_type, properties
                    FROM entities
                    WHERE id = ANY($1::uuid[])
                    """,
                    list(visited),
                )

                for node_row in node_rows:
                    props = node_row["properties"]
                    if isinstance(props, str):
                        try:
                            props = json.loads(props)
                        except:
                            props = {}

                    all_nodes.append({
                        "id": node_row["id"],
                        "name": node_row["name"],
                        "entity_type": node_row["entity_type"],
                        "properties": props,
                    })

            return {
                "nodes": all_nodes[:limit],
                "edges": all_edges,
            }

        except Exception as e:
            logger.error(f"Graph traversal failed: {e}")
            return {"nodes": [], "edges": []}

    async def _execute_aggregation(self, params: dict) -> dict:
        """
        Execute aggregation queries for statistics and summaries.

        Params:
            project_id: Project to aggregate
            aggregation_type: Type of aggregation (count_by_type, top_concepts, temporal_distribution)
            entity_type: Optional entity type filter
            limit: Maximum results for top-N queries
        """
        project_id = params.get("project_id")
        aggregation_type = params.get("aggregation_type", "count_by_type")
        entity_type = params.get("entity_type")
        limit = params.get("limit", 10)

        if not project_id or not self.db:
            return {}

        try:
            if aggregation_type == "count_by_type":
                rows = await self.db.fetch(
                    """
                    SELECT entity_type, COUNT(*) as count
                    FROM entities
                    WHERE project_id = $1
                    GROUP BY entity_type
                    ORDER BY count DESC
                    """,
                    project_id,
                )
                return {
                    "aggregation_type": "count_by_type",
                    "data": [{"entity_type": r["entity_type"], "count": r["count"]} for r in rows],
                }

            elif aggregation_type == "top_concepts":
                rows = await self.db.fetch(
                    """
                    SELECT e.id::text, e.name, COUNT(r.id) as paper_count
                    FROM entities e
                    LEFT JOIN relationships r ON e.id = r.target_id
                        AND r.relationship_type = 'DISCUSSES_CONCEPT'
                    WHERE e.project_id = $1 AND e.entity_type = 'Concept'
                    GROUP BY e.id, e.name
                    ORDER BY paper_count DESC
                    LIMIT $2
                    """,
                    project_id,
                    limit,
                )
                return {
                    "aggregation_type": "top_concepts",
                    "data": [{"id": r["id"], "name": r["name"], "paper_count": r["paper_count"]} for r in rows],
                }

            elif aggregation_type == "temporal_distribution":
                rows = await self.db.fetch(
                    """
                    SELECT
                        (properties->>'year')::int as year,
                        COUNT(*) as count
                    FROM entities
                    WHERE project_id = $1
                        AND entity_type = 'Paper'
                        AND properties->>'year' IS NOT NULL
                    GROUP BY (properties->>'year')::int
                    ORDER BY year
                    """,
                    project_id,
                )
                return {
                    "aggregation_type": "temporal_distribution",
                    "data": [{"year": r["year"], "count": r["count"]} for r in rows],
                }

            elif aggregation_type == "relationship_distribution":
                rows = await self.db.fetch(
                    """
                    SELECT r.relationship_type, COUNT(*) as count
                    FROM relationships r
                    JOIN entities e ON r.source_id = e.id
                    WHERE e.project_id = $1
                    GROUP BY r.relationship_type
                    ORDER BY count DESC
                    """,
                    project_id,
                )
                return {
                    "aggregation_type": "relationship_distribution",
                    "data": [{"relationship_type": r["relationship_type"], "count": r["count"]} for r in rows],
                }

            else:
                return {"error": f"Unknown aggregation type: {aggregation_type}"}

        except Exception as e:
            logger.error(f"Aggregation failed: {e}")
            return {"error": str(e)}
