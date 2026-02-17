"""Paper Fit Analyzer - determines where a user's paper fits in the knowledge graph."""

import logging
from dataclasses import dataclass, field
from typing import List, Optional
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass
class PaperFitResult:
    """Result of paper fit analysis."""

    paper_title: str
    paper_abstract: Optional[str]
    matched_entities: List[dict]  # [{id, name, entity_type, similarity, cluster_id}]
    community_relevance: List[dict]  # [{cluster_id, label, relevance_score, matched_count}]
    gap_connections: List[dict]  # [{gap_id, cluster_a_label, cluster_b_label, connection_type}]
    fit_summary: str  # Brief text summary


class PaperFitAnalyzer:
    """Analyzes how a paper fits into the existing knowledge graph."""

    def __init__(self, database):
        self.database = database

    async def analyze(
        self,
        project_id: UUID,
        paper_title: str,
        paper_abstract: str,
    ) -> PaperFitResult:
        """Analyze where a paper fits in the knowledge graph.

        Steps:
        1. Generate embedding for abstract (or title if no abstract)
        2. Find similar entities via pgvector cosine similarity
        3. Map to communities / clusters
        4. Check gap connections
        5. Build summary
        """
        text_to_embed = paper_abstract if paper_abstract and paper_abstract.strip() else paper_title

        # 1. Generate embedding
        embedding = await self._get_embedding(text_to_embed)

        if not embedding:
            logger.warning("Could not generate embedding for paper fit analysis")
            return PaperFitResult(
                paper_title=paper_title,
                paper_abstract=paper_abstract,
                matched_entities=[],
                community_relevance=[],
                gap_connections=[],
                fit_summary="Embedding generation unavailable. Cannot analyze paper fit at this time.",
            )

        # 2. Similar entities via pgvector
        matched_entities = await self._find_similar_entities(project_id, embedding)

        # 3. Community mapping
        community_relevance = await self._map_to_communities(project_id, matched_entities)

        # 4. Gap connections
        gap_connections = await self._find_gap_connections(project_id, matched_entities)

        # 5. Summary
        fit_summary = self._build_summary(
            paper_title, matched_entities, community_relevance, gap_connections
        )

        return PaperFitResult(
            paper_title=paper_title,
            paper_abstract=paper_abstract if paper_abstract else None,
            matched_entities=matched_entities,
            community_relevance=community_relevance,
            gap_connections=gap_connections,
            fit_summary=fit_summary,
        )

    async def _get_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding using project's EmbeddingService (Azure OpenAI)."""
        try:
            from embedding_service import get_embedding_service

            service = get_embedding_service()
            return service.embed_text(text)
        except Exception as e:
            logger.error(f"EmbeddingService failed: {e}. Trying OpenAI fallback.")

        # OpenAI fallback (if OPENAI_API_KEY configured)
        try:
            import openai
            from config import settings

            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
            )
            return response.data[0].embedding
        except Exception as e2:
            logger.error(f"OpenAI embedding fallback also failed: {e2}")
            return None

    async def _find_similar_entities(
        self, project_id: UUID, embedding: List[float]
    ) -> List[dict]:
        """Find the 20 most similar entities in the knowledge graph."""
        try:
            # Convert embedding list to pgvector format string
            embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

            rows = await self.database.fetch(
                """
                SELECT id, name, entity_type::text,
                       1 - (embedding <=> $2::vector) AS similarity,
                       properties->>'cluster_id' AS cluster_id,
                       first_seen_year, last_seen_year
                FROM entities
                WHERE project_id = $1
                  AND embedding IS NOT NULL
                  AND entity_type IN (
                      'Concept', 'Method', 'Finding', 'Problem',
                      'Dataset', 'Metric', 'Innovation', 'Limitation'
                  )
                ORDER BY embedding <=> $2::vector
                LIMIT 20
                """,
                str(project_id),
                embedding_str,
            )

            return [
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "entity_type": row["entity_type"],
                    "similarity": float(row["similarity"]) if row["similarity"] is not None else 0.0,
                    "cluster_id": row["cluster_id"],
                }
                for row in rows
            ]
        except Exception as e:
            logger.error(f"Failed to find similar entities: {e}")
            return []

    async def _map_to_communities(
        self, project_id: UUID, matched_entities: List[dict]
    ) -> List[dict]:
        """Map matched entities to their communities / clusters."""
        if not matched_entities:
            return []

        # Collect cluster_ids from matched entities
        cluster_ids = [
            e["cluster_id"]
            for e in matched_entities
            if e.get("cluster_id") is not None
        ]

        if not cluster_ids:
            # Fall back: look up cluster_id from DB properties
            entity_ids = [e["id"] for e in matched_entities]
            try:
                rows = await self.database.fetch(
                    """
                    SELECT id, properties->>'cluster_id' AS cluster_id
                    FROM entities
                    WHERE id = ANY($1::uuid[])
                      AND properties->>'cluster_id' IS NOT NULL
                    """,
                    entity_ids,
                )
                for row in rows:
                    for entity in matched_entities:
                        if entity["id"] == str(row["id"]):
                            entity["cluster_id"] = row["cluster_id"]
                            break
                cluster_ids = [
                    e["cluster_id"]
                    for e in matched_entities
                    if e.get("cluster_id") is not None
                ]
            except Exception as e:
                logger.error(f"Failed to look up cluster IDs: {e}")

        if not cluster_ids:
            return []

        # Count matches per cluster
        cluster_counts: dict = {}
        cluster_similarities: dict = {}
        for entity in matched_entities:
            cid = entity.get("cluster_id")
            if cid is not None:
                cluster_counts[cid] = cluster_counts.get(cid, 0) + 1
                cluster_similarities.setdefault(cid, []).append(entity["similarity"])

        # Fetch cluster labels
        try:
            int_cluster_ids = []
            for cid in cluster_counts:
                try:
                    int_cluster_ids.append(int(cid))
                except (ValueError, TypeError):
                    pass

            label_rows = await self.database.fetch(
                """
                SELECT cluster_id, label, size
                FROM concept_clusters
                WHERE project_id = $1
                  AND cluster_id = ANY($2::int[])
                """,
                str(project_id),
                int_cluster_ids,
            )
            label_map = {
                str(row["cluster_id"]): row["label"] or f"Cluster {row['cluster_id']}"
                for row in label_rows
            }
        except Exception as e:
            logger.warning(f"Could not fetch cluster labels: {e}")
            label_map = {}

        # Build result
        result = []
        for cid, count in sorted(cluster_counts.items(), key=lambda x: -x[1]):
            sims = cluster_similarities.get(cid, [0.0])
            avg_sim = sum(sims) / len(sims)
            result.append(
                {
                    "cluster_id": int(cid) if str(cid).isdigit() else cid,
                    "label": label_map.get(str(cid), f"Cluster {cid}"),
                    "relevance_score": round(avg_sim, 4),
                    "matched_count": count,
                }
            )

        return result

    async def _find_gap_connections(
        self, project_id: UUID, matched_entities: List[dict]
    ) -> List[dict]:
        """Find structural gaps that the paper might help bridge."""
        if not matched_entities:
            return []

        entity_ids = [e["id"] for e in matched_entities]

        try:
            # Look for gaps where bridge_candidates include any matched entity
            rows = await self.database.fetch(
                """
                SELECT sg.id,
                       ca.label AS cluster_a_label,
                       cb.label AS cluster_b_label,
                       sg.connection_type
                FROM structural_gaps sg
                LEFT JOIN concept_clusters ca
                    ON ca.project_id = sg.project_id
                   AND ca.cluster_id = sg.cluster_a_id
                LEFT JOIN concept_clusters cb
                    ON cb.project_id = sg.project_id
                   AND cb.cluster_id = sg.cluster_b_id
                WHERE sg.project_id = $1
                  AND (
                      sg.bridge_candidates::text ~ ANY(
                          SELECT unnest($2::text[])
                      )
                  )
                LIMIT 5
                """,
                str(project_id),
                entity_ids,
            )

            if rows:
                return [
                    {
                        "gap_id": str(row["id"]),
                        "cluster_a_label": row["cluster_a_label"] or "Unknown Cluster A",
                        "cluster_b_label": row["cluster_b_label"] or "Unknown Cluster B",
                        "connection_type": row["connection_type"] or "bridge",
                    }
                    for row in rows
                ]
        except Exception as e:
            logger.warning(f"Gap connection query failed (non-critical): {e}")

        # Simpler fallback: check cluster pairs in gaps against matched community clusters
        try:
            matched_cluster_ids = list(
                {
                    int(e["cluster_id"])
                    for e in matched_entities
                    if e.get("cluster_id") and str(e["cluster_id"]).isdigit()
                }
            )
            if not matched_cluster_ids:
                return []

            rows = await self.database.fetch(
                """
                SELECT sg.id,
                       ca.label AS cluster_a_label,
                       cb.label AS cluster_b_label,
                       sg.connection_type
                FROM structural_gaps sg
                LEFT JOIN concept_clusters ca
                    ON ca.project_id = sg.project_id
                   AND ca.cluster_id = sg.cluster_a_id
                LEFT JOIN concept_clusters cb
                    ON cb.project_id = sg.project_id
                   AND cb.cluster_id = sg.cluster_b_id
                WHERE sg.project_id = $1
                  AND (
                      sg.cluster_a_id = ANY($2::int[])
                      OR sg.cluster_b_id = ANY($2::int[])
                  )
                LIMIT 5
                """,
                str(project_id),
                matched_cluster_ids,
            )

            return [
                {
                    "gap_id": str(row["id"]),
                    "cluster_a_label": row["cluster_a_label"] or "Unknown Cluster A",
                    "cluster_b_label": row["cluster_b_label"] or "Unknown Cluster B",
                    "connection_type": row["connection_type"] or "bridge",
                }
                for row in rows
            ]
        except Exception as e:
            logger.warning(f"Fallback gap query also failed: {e}")
            return []

    def _build_summary(
        self,
        paper_title: str,
        matched_entities: List[dict],
        community_relevance: List[dict],
        gap_connections: List[dict],
    ) -> str:
        """Build a brief human-readable summary of where the paper fits."""
        if not matched_entities:
            return (
                f'"{paper_title}" could not be matched to existing entities in the knowledge graph. '
                "It may introduce entirely new concepts."
            )

        top_entities = matched_entities[:3]
        entity_names = ", ".join(e["name"] for e in top_entities)
        top_sim = matched_entities[0]["similarity"] if matched_entities else 0.0

        sim_desc = (
            "strongly" if top_sim > 0.8
            else "moderately" if top_sim > 0.6
            else "loosely"
        )

        community_part = ""
        if community_relevance:
            top_community = community_relevance[0]["label"]
            community_part = f' It aligns most closely with the "{top_community}" research community'
            if len(community_relevance) > 1:
                community_part += f" and {len(community_relevance) - 1} other cluster(s)"
            community_part += "."

        gap_part = ""
        if gap_connections:
            gap_part = (
                f" The paper may help bridge {len(gap_connections)} structural gap(s) in the literature, "
                f'including between "{gap_connections[0]["cluster_a_label"]}" '
                f'and "{gap_connections[0]["cluster_b_label"]}".'
            )

        return (
            f'"{paper_title}" {sim_desc} relates to existing knowledge around: {entity_names}.'
            f"{community_part}{gap_part}"
        )
