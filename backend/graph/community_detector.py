"""
Community Detection for Knowledge Graph

Detects communities/clusters in the knowledge graph using graph topology.
Supports Leiden algorithm (if available) with fallback to simple connected components.
"""

import logging
from typing import Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class Community:
    """A detected community of entities."""
    community_id: int
    entity_ids: list[str] = field(default_factory=list)
    label: str = ""
    size: int = 0
    detection_method: str = "connected_components"
    level: int = 0
    summary: str = ""


class CommunityDetector:
    """
    Detects communities in the knowledge graph.

    Uses Leiden algorithm if igraph+leidenalg are available,
    otherwise falls back to simple connected components via SQL.
    """

    def __init__(self, db_connection=None, llm_provider=None):
        self.db = db_connection
        self.llm = llm_provider
        self._has_leiden = self._check_leiden_available()

    def _check_leiden_available(self) -> bool:
        """Check if igraph and leidenalg are installed."""
        try:
            import igraph
            import leidenalg
            return True
        except ImportError:
            logger.info("igraph/leidenalg not available, using SQL-based clustering")
            return False

    async def detect_communities(
        self,
        project_id: str,
        min_community_size: int = 3,
        resolution: float = 1.0,
    ) -> list[Community]:
        """
        Detect communities in the project's knowledge graph.

        Args:
            project_id: Project to analyze
            min_community_size: Minimum entities per community
            resolution: Leiden resolution parameter (higher = more communities)
        """
        if not self.db:
            return []

        if self._has_leiden:
            try:
                return await self._detect_with_leiden(project_id, min_community_size, resolution)
            except Exception as e:
                logger.warning(f"Leiden detection failed: {e}, falling back to SQL")

        return await self._detect_with_sql(project_id, min_community_size)

    async def _detect_with_leiden(
        self,
        project_id: str,
        min_community_size: int,
        resolution: float,
    ) -> list[Community]:
        """Use Leiden algorithm for community detection."""
        import igraph as ig
        import leidenalg

        # Fetch entities and relationships
        entities = await self.db.fetch(
            """
            SELECT id::text, name, entity_type
            FROM entities
            WHERE project_id = $1 AND entity_type != 'Paper'
            """,
            project_id,
        )

        if not entities:
            return []

        entity_id_to_idx = {row["id"]: i for i, row in enumerate(entities)}

        relationships = await self.db.fetch(
            """
            SELECT source_id::text, target_id::text, weight
            FROM relationships r
            JOIN entities e1 ON r.source_id = e1.id
            JOIN entities e2 ON r.target_id = e2.id
            WHERE e1.project_id = $1
                AND e1.entity_type != 'Paper'
                AND e2.entity_type != 'Paper'
            """,
            project_id,
        )

        # Build igraph graph
        edges = []
        weights = []
        for rel in relationships:
            src_idx = entity_id_to_idx.get(rel["source_id"])
            tgt_idx = entity_id_to_idx.get(rel["target_id"])
            if src_idx is not None and tgt_idx is not None:
                edges.append((src_idx, tgt_idx))
                weights.append(float(rel["weight"] or 1.0))

        if not edges:
            return []

        g = ig.Graph(n=len(entities), edges=edges, directed=False)
        g.es["weight"] = weights

        # Run Leiden
        partition = leidenalg.find_partition(
            g, leidenalg.RBConfigurationVertexPartition,
            weights=weights, resolution_parameter=resolution,
        )

        # Build communities
        communities = []
        for comm_id, members in enumerate(partition):
            if len(members) < min_community_size:
                continue

            entity_ids = [entities[idx]["id"] for idx in members]
            # Use most common entity type as label hint
            types = [entities[idx]["entity_type"] for idx in members]
            top_names = [entities[idx]["name"] for idx in members[:10]]
            from graph.cluster_labeler import fallback_label
            label = fallback_label(top_names)

            communities.append(Community(
                community_id=comm_id,
                entity_ids=entity_ids,
                label=label,
                size=len(members),
                detection_method="leiden",
                level=0,
            ))

        return communities

    async def _detect_with_sql(
        self,
        project_id: str,
        min_community_size: int,
    ) -> list[Community]:
        """
        SQL-based community detection using connected components.
        Groups entities that are connected via relationships.
        """
        # Get all non-Paper entities with their connections
        rows = await self.db.fetch(
            """
            WITH entity_connections AS (
                SELECT
                    e.id::text as entity_id,
                    e.name,
                    e.entity_type,
                    array_agg(DISTINCT
                        CASE
                            WHEN r.source_id = e.id THEN r.target_id::text
                            ELSE r.source_id::text
                        END
                    ) FILTER (WHERE r.id IS NOT NULL) as connected_ids
                FROM entities e
                LEFT JOIN relationships r ON (e.id = r.source_id OR e.id = r.target_id)
                    AND r.relationship_type NOT IN ('AUTHORED_BY', 'CITES')
                WHERE e.project_id = $1
                    AND e.entity_type NOT IN ('Paper', 'Author')
                GROUP BY e.id, e.name, e.entity_type
            )
            SELECT * FROM entity_connections
            """,
            project_id,
        )

        if not rows:
            return []

        # Simple union-find for connected components
        parent = {}

        def find(x):
            while parent.get(x, x) != x:
                parent[x] = parent.get(parent[x], parent[x])
                x = parent[x]
            return x

        def union(x, y):
            px, py = find(x), find(y)
            if px != py:
                parent[px] = py

        # Initialize all entities
        entity_map = {}
        for row in rows:
            eid = row["entity_id"]
            entity_map[eid] = {"name": row["name"], "entity_type": row["entity_type"]}
            parent[eid] = eid

        # Union connected entities
        for row in rows:
            eid = row["entity_id"]
            connected = row["connected_ids"] or []
            for cid in connected:
                if cid in entity_map:
                    union(eid, cid)

        # Group by component
        components = {}
        for eid in entity_map:
            root = find(eid)
            if root not in components:
                components[root] = []
            components[root].append(eid)

        # Build communities
        communities = []
        for comm_id, (root, members) in enumerate(
            sorted(components.items(), key=lambda x: len(x[1]), reverse=True)
        ):
            if len(members) < min_community_size:
                continue

            top_names = [entity_map[m]["name"] for m in members[:10]]
            from graph.cluster_labeler import fallback_label
            communities.append(Community(
                community_id=comm_id,
                entity_ids=members,
                label=fallback_label(top_names),
                size=len(members),
                detection_method="connected_components",
                level=0,
            ))

        return communities

    async def store_communities(
        self,
        project_id: str,
        communities: list[Community],
    ) -> None:
        """Store detected communities in the database."""
        if not self.db:
            return

        for comm in communities:
            await self.db.execute(
                """
                INSERT INTO concept_clusters
                    (project_id, cluster_label, entity_ids, detection_method, community_level)
                VALUES ($1, $2, $3::uuid[], $4, $5)
                """,
                project_id,
                comm.label,
                comm.entity_ids,
                comm.detection_method,
                comm.level,
            )
