"""
Chunk DAO - Data Access Object for Semantic Chunk persistence.

Extracted from GraphStore for Single Responsibility Principle.
"""

import logging
from typing import Optional, List
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)


def _get_chunk_attr(chunk, attr: str, default=None):
    """
    BUG-030 Fix: Get attribute from either dict or object.

    SemanticChunker.chunk_academic_text() returns dicts, but some code
    paths might use Chunk objects. This helper handles both cases.
    """
    if isinstance(chunk, dict):
        return chunk.get(attr, default)
    return getattr(chunk, attr, default)


class ChunkDAO:
    """
    Data Access Object for Semantic Chunk persistence.

    Handles:
    - Chunk storage (parent/child hierarchy)
    - Chunk retrieval by paper or section
    - Chunk context retrieval
    """

    def __init__(self, db=None):
        """
        Initialize ChunkDAO.

        Args:
            db: Database instance from backend/database.py
        """
        self.db = db

    async def store_chunks(
        self,
        project_id: str,
        paper_id: str,
        chunks: list,
        create_embeddings: bool = True,
        embedding_pipeline=None,
    ) -> int:
        """
        Store semantic chunks from a paper.

        Args:
            project_id: Project UUID
            paper_id: Paper UUID
            chunks: List of Chunk objects from SemanticChunker
            create_embeddings: Whether to create embeddings immediately
            embedding_pipeline: Optional EmbeddingPipeline instance

        Returns:
            Number of chunks stored
        """
        if not self.db:
            logger.warning("No database - cannot store chunks")
            return 0

        project_uuid = UUID(project_id) if isinstance(project_id, str) else project_id
        paper_uuid = UUID(paper_id) if isinstance(paper_id, str) else paper_id

        stored_count = 0
        chunk_id_map = {}  # Map chunk.id to database UUID for parent references

        # First pass: Store parent chunks (level 0)
        # BUG-030 Fix: Use _get_chunk_attr() to support both dict and Chunk objects
        for chunk in chunks:
            if _get_chunk_attr(chunk, 'chunk_level', 0) != 0:
                continue

            chunk_uuid = uuid4()
            chunk_id = _get_chunk_attr(chunk, 'id')
            chunk_id_map[chunk_id] = chunk_uuid

            try:
                section_type = _get_chunk_attr(chunk, 'section_type', 'unknown')
                section_type_str = section_type.value if hasattr(section_type, 'value') else str(section_type)

                # Get metadata - could be dict or object attribute
                metadata = _get_chunk_attr(chunk, 'metadata', {})
                section_title = metadata.get("title", "") if isinstance(metadata, dict) else ""

                await self.db.execute(
                    """
                    INSERT INTO semantic_chunks (
                        id, project_id, paper_id, text, section_type,
                        section_title, chunk_level, token_count, sequence_order
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """,
                    chunk_uuid,
                    project_uuid,
                    paper_uuid,
                    _get_chunk_attr(chunk, 'text', ''),
                    section_type_str,
                    section_title,
                    _get_chunk_attr(chunk, 'chunk_level', 0),
                    _get_chunk_attr(chunk, 'token_count', 0),
                    _get_chunk_attr(chunk, 'sequence_order', 0),
                )
                stored_count += 1
            except Exception as e:
                logger.warning(f"Failed to store parent chunk: {e}")

        # Second pass: Store child chunks (level 1) with parent references
        # BUG-030 Fix: Use _get_chunk_attr() to support both dict and Chunk objects
        for chunk in chunks:
            if _get_chunk_attr(chunk, 'chunk_level', 0) != 1:
                continue

            chunk_uuid = uuid4()
            parent_id = _get_chunk_attr(chunk, 'parent_id')
            parent_uuid = chunk_id_map.get(parent_id) if parent_id else None

            try:
                section_type = _get_chunk_attr(chunk, 'section_type', 'unknown')
                section_type_str = section_type.value if hasattr(section_type, 'value') else str(section_type)

                await self.db.execute(
                    """
                    INSERT INTO semantic_chunks (
                        id, project_id, paper_id, text, section_type,
                        parent_chunk_id, chunk_level, token_count, sequence_order
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """,
                    chunk_uuid,
                    project_uuid,
                    paper_uuid,
                    _get_chunk_attr(chunk, 'text', ''),
                    section_type_str,
                    parent_uuid,
                    _get_chunk_attr(chunk, 'chunk_level', 1),
                    _get_chunk_attr(chunk, 'token_count', 0),
                    _get_chunk_attr(chunk, 'sequence_order', 0),
                )
                stored_count += 1
            except Exception as e:
                logger.warning(f"Failed to store child chunk: {e}")

        logger.info(f"Stored {stored_count} chunks for paper {paper_id}")

        # Create embeddings if requested
        if create_embeddings and stored_count > 0 and embedding_pipeline:
            await embedding_pipeline.create_chunk_embeddings(project_id)

        return stored_count

    async def search_chunks(
        self,
        project_id: str,
        query_embedding: list,
        top_k: int = 5,
        section_filter: list = None,
        min_score: float = 0.5,
    ) -> list:
        """
        Search chunks by vector similarity.

        Args:
            project_id: Project UUID
            query_embedding: Query embedding vector
            top_k: Number of results (max 100 for safety)
            section_filter: Optional list of section types to filter
            min_score: Minimum similarity score

        Returns:
            List of matching chunks with scores
        """
        if not self.db:
            return []

        # SECURITY: Validate and sanitize top_k to prevent injection
        top_k = max(1, min(int(top_k), 100))

        project_uuid = UUID(project_id) if isinstance(project_id, str) else project_id

        # Build query with parameterized LIMIT
        sql = """
            SELECT
                sc.id,
                sc.text,
                sc.section_type,
                sc.chunk_level,
                sc.parent_chunk_id,
                sc.paper_id,
                sc.token_count,
                pm.title as paper_title,
                1 - (sc.embedding <=> $1::vector) AS similarity
            FROM semantic_chunks sc
            LEFT JOIN paper_metadata pm ON sc.paper_id = pm.id
            WHERE sc.project_id = $2
              AND sc.embedding IS NOT NULL
              AND 1 - (sc.embedding <=> $1::vector) >= $3
        """

        params = [query_embedding, project_uuid, min_score]

        if section_filter:
            next_param_idx = len(params) + 1
            placeholders = ", ".join(f"${next_param_idx + i}" for i in range(len(section_filter)))
            sql += f"\n  AND sc.section_type IN ({placeholders})"
            params.extend(section_filter)

        # Add LIMIT as parameterized query (last parameter)
        limit_param_idx = len(params) + 1
        sql += f"\nORDER BY similarity DESC\nLIMIT ${limit_param_idx}"
        params.append(top_k)

        rows = await self.db.fetch(sql, *params)

        return [
            {
                "id": str(row["id"]),
                "text": row["text"],
                "section_type": row["section_type"],
                "chunk_level": row["chunk_level"],
                "parent_chunk_id": str(row["parent_chunk_id"]) if row["parent_chunk_id"] else None,
                "paper_id": str(row["paper_id"]) if row["paper_id"] else None,
                "paper_title": row["paper_title"],
                "similarity": float(row["similarity"]),
            }
            for row in rows
        ]

    async def get_chunk_with_context(
        self,
        chunk_id: str,
    ) -> dict:
        """
        Get a chunk with its parent context.

        Uses the database function get_chunk_with_context()
        to retrieve both the chunk and its siblings.

        Args:
            chunk_id: Chunk UUID

        Returns:
            Dict with chunk and context
        """
        if not self.db:
            return {}

        chunk_uuid = UUID(chunk_id) if isinstance(chunk_id, str) else chunk_id

        rows = await self.db.fetch(
            "SELECT * FROM get_chunk_with_context($1)",
            chunk_uuid,
        )

        result = {
            "target": None,
            "context": [],
        }

        for row in rows:
            chunk_data = {
                "id": str(row["id"]),
                "text": row["text"],
                "section_type": row["section_type"],
                "chunk_level": row["chunk_level"],
            }

            if row["is_target"]:
                result["target"] = chunk_data
            else:
                result["context"].append(chunk_data)

        return result

    async def get_chunks_by_paper(
        self,
        paper_id: str,
        section_type: str = None,
    ) -> list:
        """
        Get all chunks for a paper, optionally filtered by section.

        Args:
            paper_id: Paper UUID
            section_type: Optional section type filter

        Returns:
            List of chunks
        """
        if not self.db:
            return []

        paper_uuid = UUID(paper_id) if isinstance(paper_id, str) else paper_id

        sql = """
            SELECT id, text, section_type, chunk_level, parent_chunk_id,
                   token_count, sequence_order
            FROM semantic_chunks
            WHERE paper_id = $1
        """
        params = [paper_uuid]

        if section_type:
            sql += " AND section_type = $2"
            params.append(section_type)

        sql += " ORDER BY sequence_order"

        rows = await self.db.fetch(sql, *params)

        return [
            {
                "id": str(row["id"]),
                "text": row["text"],
                "section_type": row["section_type"],
                "chunk_level": row["chunk_level"],
                "parent_chunk_id": str(row["parent_chunk_id"]) if row["parent_chunk_id"] else None,
                "token_count": row["token_count"],
                "sequence_order": row["sequence_order"],
            }
            for row in rows
        ]
