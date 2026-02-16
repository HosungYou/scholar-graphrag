"""
Community Summarizer

Generates LLM-based summaries for detected communities.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class CommunitySummarizer:
    """Generates natural language summaries for knowledge graph communities."""

    SUMMARY_PROMPT = """Summarize this research community in 2-3 sentences.

Community entities:
{entities_text}

Focus on: what research theme connects these concepts/methods, and what this cluster represents in the broader research landscape.

Write a concise summary (2-3 sentences only):"""

    def __init__(self, llm_provider=None, db_connection=None):
        self.llm = llm_provider
        self.db = db_connection

    async def summarize_community(
        self,
        entity_ids: list[str],
        project_id: str,
    ) -> str:
        """Generate a summary for a community of entities."""
        if not self.db:
            return ""

        # Fetch entity details
        rows = await self.db.fetch(
            """
            SELECT name, entity_type, description, properties
            FROM entities
            WHERE id = ANY($1::uuid[]) AND project_id = $2
            ORDER BY entity_type, name
            LIMIT 20
            """,
            entity_ids,
            project_id,
        )

        if not rows:
            return ""

        # Build entities text
        entities_text = "\n".join([
            f"- {row['name']} ({row['entity_type']})"
            + (f": {row['description'][:100]}" if row.get('description') else "")
            for row in rows
        ])

        if not self.llm:
            # Fallback: simple concatenation
            types = set(row["entity_type"] for row in rows)
            names = [row["name"] for row in rows[:5]]
            return f"Community of {len(rows)} entities ({', '.join(types)}) including {', '.join(names)}."

        try:
            prompt = self.SUMMARY_PROMPT.format(entities_text=entities_text)
            response = await self.llm.generate(prompt, max_tokens=200, temperature=0.3)
            summary = response.strip()

            # Cache the summary
            await self._cache_summary(entity_ids, project_id, summary)

            return summary
        except Exception as e:
            logger.warning(f"Community summarization failed: {e}")
            return f"Community of {len(rows)} entities."

    async def _cache_summary(
        self,
        entity_ids: list[str],
        project_id: str,
        summary: str,
    ) -> None:
        """Cache community summary in the database."""
        if not self.db:
            return

        try:
            await self.db.execute(
                """
                UPDATE concept_clusters
                SET summary = $1, summary_updated_at = NOW()
                WHERE project_id = $2 AND entity_ids = $3::uuid[]
                """,
                summary,
                project_id,
                entity_ids,
            )
        except Exception as e:
            logger.debug(f"Failed to cache summary: {e}")

    async def summarize_all_communities(
        self,
        project_id: str,
    ) -> list[dict]:
        """Summarize all communities in a project."""
        if not self.db:
            return []

        rows = await self.db.fetch(
            """
            SELECT id, cluster_label, entity_ids, detection_method, community_level, summary
            FROM concept_clusters
            WHERE project_id = $1
            ORDER BY array_length(entity_ids, 1) DESC NULLS LAST
            """,
            project_id,
        )

        results = []
        for row in rows:
            entity_ids = [str(eid) for eid in (row["entity_ids"] or [])]
            summary = row["summary"]

            # Generate summary if missing
            if not summary and entity_ids:
                summary = await self.summarize_community(entity_ids, project_id)

            results.append({
                "id": row["id"],
                "label": row["cluster_label"],
                "entity_ids": entity_ids,
                "size": len(entity_ids),
                "detection_method": row["detection_method"],
                "level": row["community_level"],
                "summary": summary or "",
            })

        return results
