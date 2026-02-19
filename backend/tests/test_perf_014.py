"""
Tests for PERF-014: Zotero Import Speed Optimization

Verifies:
1. batch_add_relationships uses executemany (EntityDAO + GraphStore)
2. _process_single_paper uses asyncio.to_thread for PDF extraction
3. _concept_cache protected by asyncio.Lock
4. _build_cooccurrence_relationships uses single batch call (not O(n²) individual INSERTs)
5. EmbeddingPipeline default batch_size is 50
6. Post-import phases (embeddings + co-occurrence) invoked
"""

import asyncio
import inspect
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call


# ---------------------------------------------------------------------------
# TestBatchAddRelationships
# ---------------------------------------------------------------------------

class TestBatchAddRelationships:
    """Test EntityDAO.batch_add_relationships() and GraphStore.batch_add_relationships()."""

    @pytest.mark.asyncio
    async def test_batch_add_relationships_calls_executemany(self):
        """executemany should be called once with the correct SQL and data tuples."""
        from graph.persistence.entity_dao import EntityDAO

        mock_db = AsyncMock()
        mock_db.executemany = AsyncMock(return_value=None)

        dao = EntityDAO(db=mock_db)

        relationships = [
            ("id-1", "proj-id", "src-1", "tgt-1", "CO_OCCURS_WITH", '{"auto_generated": true}', 1.0),
            ("id-2", "proj-id", "src-2", "tgt-2", "CO_OCCURS_WITH", '{"auto_generated": true}', 1.0),
        ]

        result = await dao.batch_add_relationships("proj-id", relationships)

        assert result == 2
        mock_db.executemany.assert_called_once()

        # Verify the SQL contains INSERT INTO relationships and ON CONFLICT
        call_args = mock_db.executemany.call_args
        sql = call_args[0][0]
        assert "INSERT INTO relationships" in sql
        assert "ON CONFLICT" in sql
        # Verify data passed is the relationships list
        data = call_args[0][1]
        assert data == relationships

    @pytest.mark.asyncio
    async def test_batch_add_relationships_empty_list_returns_zero(self):
        """Empty relationship list returns 0 without any DB call."""
        from graph.persistence.entity_dao import EntityDAO

        mock_db = AsyncMock()
        mock_db.executemany = AsyncMock()

        dao = EntityDAO(db=mock_db)
        result = await dao.batch_add_relationships("proj-id", [])

        assert result == 0
        mock_db.executemany.assert_not_called()

    @pytest.mark.asyncio
    async def test_batch_add_relationships_no_db_returns_zero(self):
        """When db=None, returns 0 without error."""
        from graph.persistence.entity_dao import EntityDAO

        dao = EntityDAO(db=None)
        result = await dao.batch_add_relationships("proj-id", [("id-1", "proj-id", "s", "t", "CO_OCCURS_WITH", "{}", 1.0)])

        assert result == 0

    @pytest.mark.asyncio
    async def test_batch_add_relationships_fallback_on_executemany_failure(self):
        """When executemany raises, falls back to individual db.execute calls."""
        from graph.persistence.entity_dao import EntityDAO

        mock_db = AsyncMock()
        mock_db.executemany = AsyncMock(side_effect=Exception("batch failed"))
        mock_db.execute = AsyncMock(return_value=None)

        dao = EntityDAO(db=mock_db)

        relationships = [
            ("id-1", "proj-id", "src-1", "tgt-1", "CO_OCCURS_WITH", '{}', 1.0),
            ("id-2", "proj-id", "src-2", "tgt-2", "CO_OCCURS_WITH", '{}', 1.0),
        ]

        result = await dao.batch_add_relationships("proj-id", relationships)

        # executemany was tried
        mock_db.executemany.assert_called_once()
        # Individual execute called for each relationship
        assert mock_db.execute.call_count == 2
        # Returns count of individually inserted rows
        assert result == 2

    @pytest.mark.asyncio
    async def test_graph_store_batch_add_relationships_delegates_to_dao(self):
        """GraphStore.batch_add_relationships delegates to entity_dao."""
        from graph.graph_store import GraphStore

        mock_db = AsyncMock()
        store = GraphStore(db=mock_db)

        relationships = [
            ("id-1", "proj-id", "src-1", "tgt-1", "CO_OCCURS_WITH", '{}', 1.0),
        ]

        store._entity_dao.batch_add_relationships = AsyncMock(return_value=1)
        result = await store.batch_add_relationships("proj-id", relationships)

        store._entity_dao.batch_add_relationships.assert_called_once_with("proj-id", relationships)
        assert result == 1


# ---------------------------------------------------------------------------
# TestConcurrentPipeline
# ---------------------------------------------------------------------------

class TestConcurrentPipeline:
    """Test PERF-014 concurrency controls in _process_single_paper."""

    def test_process_single_paper_uses_semaphore(self):
        """_process_single_paper signature accepts a semaphore parameter."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter

        sig = inspect.signature(ZoteroRDFImporter._process_single_paper)
        assert "semaphore" in sig.parameters, (
            "_process_single_paper must accept a 'semaphore' parameter"
        )

    @pytest.mark.asyncio
    async def test_process_single_paper_uses_thread_for_pdf(self):
        """asyncio.to_thread is called with extract_text_from_pdf when a PDF is available."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter, ZoteroItem

        mock_graph_store = AsyncMock()
        mock_graph_store.store_paper_metadata = AsyncMock(return_value="paper-uuid")
        mock_graph_store.store_chunks = AsyncMock(return_value=0)

        importer = ZoteroRDFImporter(
            llm_provider=None,
            db_connection=None,
            graph_store=mock_graph_store,
        )

        item = ZoteroItem(
            item_key="ABC123",
            item_type="Article",
            title="Test Paper",
            abstract="An abstract.",
        )
        pdf_map = {"ABC123": "/fake/path.pdf"}
        semaphore = asyncio.Semaphore(3)
        concept_cache_lock = asyncio.Lock()
        results = {
            "papers_imported": 0,
            "pdfs_processed": 0,
            "concepts_extracted": 0,
            "entities_stored_unique": 0,
            "merges_applied": 0,
            "errors": [],
        }
        results_lock = asyncio.Lock()

        with patch("asyncio.to_thread", new=AsyncMock(return_value="extracted text")) as mock_to_thread:
            await importer._process_single_paper(
                item=item,
                pdf_map=pdf_map,
                project_id="proj-1",
                research_question=None,
                extract_concepts=False,
                semaphore=semaphore,
                concept_cache_lock=concept_cache_lock,
                results=results,
                results_lock=results_lock,
            )

        mock_to_thread.assert_called_once()
        # First positional arg should be the extract_text_from_pdf method
        called_fn = mock_to_thread.call_args[0][0]
        assert called_fn == importer.extract_text_from_pdf

    def test_concept_cache_lock_attribute_exists(self):
        """ZoteroRDFImporter._concept_cache exists and _process_single_paper uses concept_cache_lock."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter

        importer = ZoteroRDFImporter(llm_provider=None, db_connection=None, graph_store=None)

        # _concept_cache dict exists
        assert hasattr(importer, "_concept_cache")
        assert isinstance(importer._concept_cache, dict)

        # _process_single_paper accepts concept_cache_lock parameter
        sig = inspect.signature(ZoteroRDFImporter._process_single_paper)
        assert "concept_cache_lock" in sig.parameters, (
            "_process_single_paper must accept 'concept_cache_lock' for thread safety"
        )


# ---------------------------------------------------------------------------
# TestBatchCooccurrence
# ---------------------------------------------------------------------------

class TestBatchCooccurrence:
    """Test that _build_cooccurrence_relationships uses a single batch call."""

    @pytest.mark.asyncio
    async def test_cooccurrence_collects_batch(self):
        """batch_add_relationships called once with all pairs, not per-pair."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter, PaperEntities

        mock_graph_store = AsyncMock()
        mock_graph_store.batch_add_relationships = AsyncMock(return_value=3)

        importer = ZoteroRDFImporter(
            llm_provider=None,
            db_connection=None,
            graph_store=mock_graph_store,
        )

        # Set up two papers each with 2 entities → 1 pair per paper = 2 pairs total
        importer._paper_entities = {
            "paper-1": PaperEntities(paper_id="paper-1", entity_ids=["e1", "e2"]),
            "paper-2": PaperEntities(paper_id="paper-2", entity_ids=["e3", "e4"]),
        }

        result = await importer._build_cooccurrence_relationships(project_id="proj-id")

        # batch_add_relationships called exactly once (batch, not per-pair)
        mock_graph_store.batch_add_relationships.assert_called_once()
        call_kwargs = mock_graph_store.batch_add_relationships.call_args

        # project_id passed correctly
        assert call_kwargs.kwargs.get("project_id") == "proj-id" or call_kwargs[1].get("project_id") == "proj-id" or call_kwargs[0][0] == "proj-id"

        # relationships batch contains both pairs
        if call_kwargs.kwargs.get("relationships") is not None:
            batch = call_kwargs.kwargs["relationships"]
        else:
            batch = call_kwargs[1].get("relationships") or call_kwargs[0][1]

        assert len(batch) == 2, f"Expected 2 relationship pairs, got {len(batch)}"

        # Each tuple has 7 elements: (id, proj, src, tgt, type, props, weight)
        for rel in batch:
            assert len(rel) == 7
            assert rel[4] == "CO_OCCURS_WITH"

    @pytest.mark.asyncio
    async def test_cooccurrence_empty_entities_no_call(self):
        """With no tracked paper entities, batch_add_relationships is never called."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter

        mock_graph_store = AsyncMock()
        mock_graph_store.batch_add_relationships = AsyncMock(return_value=0)

        importer = ZoteroRDFImporter(
            llm_provider=None,
            db_connection=None,
            graph_store=mock_graph_store,
        )
        # _paper_entities is empty by default
        assert len(importer._paper_entities) == 0

        result = await importer._build_cooccurrence_relationships(project_id="proj-id")

        mock_graph_store.batch_add_relationships.assert_not_called()
        assert result == 0

    @pytest.mark.asyncio
    async def test_cooccurrence_single_entity_paper_skipped(self):
        """Papers with only one entity produce no pairs → batch not called."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter, PaperEntities

        mock_graph_store = AsyncMock()
        mock_graph_store.batch_add_relationships = AsyncMock(return_value=0)

        importer = ZoteroRDFImporter(
            llm_provider=None,
            db_connection=None,
            graph_store=mock_graph_store,
        )

        importer._paper_entities = {
            "paper-1": PaperEntities(paper_id="paper-1", entity_ids=["e1"]),
        }

        result = await importer._build_cooccurrence_relationships(project_id="proj-id")

        mock_graph_store.batch_add_relationships.assert_not_called()
        assert result == 0

    @pytest.mark.asyncio
    async def test_cooccurrence_deduplicates_pairs(self):
        """Same entity pair across multiple papers is only inserted once."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter, PaperEntities

        mock_graph_store = AsyncMock()
        mock_graph_store.batch_add_relationships = AsyncMock(return_value=1)

        importer = ZoteroRDFImporter(
            llm_provider=None,
            db_connection=None,
            graph_store=mock_graph_store,
        )

        # Both papers share the same entity pair (e1, e2)
        importer._paper_entities = {
            "paper-1": PaperEntities(paper_id="paper-1", entity_ids=["e1", "e2"]),
            "paper-2": PaperEntities(paper_id="paper-2", entity_ids=["e1", "e2"]),
        }

        await importer._build_cooccurrence_relationships(project_id="proj-id")

        call_kwargs = mock_graph_store.batch_add_relationships.call_args
        if call_kwargs.kwargs.get("relationships") is not None:
            batch = call_kwargs.kwargs["relationships"]
        else:
            batch = call_kwargs[1].get("relationships") or call_kwargs[0][1]

        # Only 1 unique pair despite 2 papers
        assert len(batch) == 1


# ---------------------------------------------------------------------------
# TestEmbeddingBatchSize
# ---------------------------------------------------------------------------

class TestEmbeddingBatchSize:
    """Test that PERF-014 raised EmbeddingPipeline default batch_size from 5 to 50."""

    def test_default_batch_size_is_50(self):
        """EmbeddingPipeline.create_chunk_embeddings default batch_size is 50."""
        from graph.embedding.embedding_pipeline import EmbeddingPipeline

        sig = inspect.signature(EmbeddingPipeline.create_chunk_embeddings)
        batch_size_param = sig.parameters.get("batch_size")

        assert batch_size_param is not None, "create_chunk_embeddings must have batch_size param"
        assert batch_size_param.default == 50, (
            f"PERF-014: batch_size default should be 50, got {batch_size_param.default}"
        )

    def test_graph_store_chunk_embeddings_default_batch_50(self):
        """GraphStore.create_chunk_embeddings also has batch_size default of 50."""
        from graph.graph_store import GraphStore

        sig = inspect.signature(GraphStore.create_chunk_embeddings)
        batch_size_param = sig.parameters.get("batch_size")

        assert batch_size_param is not None, "GraphStore.create_chunk_embeddings must have batch_size param"
        assert batch_size_param.default == 50, (
            f"PERF-014: GraphStore batch_size default should be 50, got {batch_size_param.default}"
        )


# ---------------------------------------------------------------------------
# TestPostImportParallelization
# ---------------------------------------------------------------------------

class TestPostImportParallelization:
    """Test that post-import phases (embeddings + co-occurrence) are both invoked."""

    @pytest.mark.asyncio
    async def test_post_import_runs_embeddings_and_cooccurrence(self):
        """Both create_embeddings and _build_cooccurrence_relationships are called during import."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter
        import tempfile
        from pathlib import Path

        # Minimal RDF
        rdf_content = """<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:bib="http://purl.org/net/biblio#"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:dcterms="http://purl.org/dc/terms/">
    <bib:Article rdf:about="#item_TEST1">
        <dc:title>Test Paper One</dc:title>
        <dcterms:abstract>An abstract about machine learning.</dcterms:abstract>
        <dc:date>2023</dc:date>
    </bib:Article>
</rdf:RDF>
"""
        mock_graph_store = AsyncMock()
        mock_graph_store.create_project = AsyncMock(return_value="proj-uuid")
        mock_graph_store.store_paper_metadata = AsyncMock(return_value="paper-uuid")
        mock_graph_store.store_chunks = AsyncMock(return_value=0)
        mock_graph_store.create_embeddings = AsyncMock(return_value=5)
        mock_graph_store.build_concept_relationships = AsyncMock(return_value=3)
        mock_graph_store._entity_dao = MagicMock()
        mock_graph_store._entity_dao.clear_memory_cache = MagicMock()

        importer = ZoteroRDFImporter(
            llm_provider=None,
            db_connection=None,
            graph_store=mock_graph_store,
        )

        # Patch _build_cooccurrence_relationships to track invocation
        importer._build_cooccurrence_relationships = AsyncMock(return_value=2)
        # Seed some concepts_extracted so post-processing branch is entered
        importer.progress.concepts_extracted = 3

        with tempfile.TemporaryDirectory() as tmpdir:
            rdf_path = Path(tmpdir) / "export.rdf"
            rdf_path.write_text(rdf_content, encoding="utf-8")

            # Patch entity_extractor.clear_cache to avoid AttributeError
            importer.entity_extractor.clear_cache = MagicMock()

            result = await importer.import_folder(
                folder_path=tmpdir,
                project_name="Test Project",
                extract_concepts=False,  # skip LLM calls
            )

        assert result["success"] is True

        # Both post-import methods must have been called
        mock_graph_store.create_embeddings.assert_called()
        importer._build_cooccurrence_relationships.assert_called()

    @pytest.mark.asyncio
    async def test_post_import_cooccurrence_receives_project_id(self):
        """_build_cooccurrence_relationships is called with the correct project_id."""
        from importers.zotero_rdf_importer import ZoteroRDFImporter
        import tempfile
        from pathlib import Path

        rdf_content = """<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:bib="http://purl.org/net/biblio#"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:dcterms="http://purl.org/dc/terms/">
    <bib:Article rdf:about="#item_PROJ1">
        <dc:title>Project Test Paper</dc:title>
        <dcterms:abstract>Abstract text here.</dcterms:abstract>
        <dc:date>2024</dc:date>
    </bib:Article>
</rdf:RDF>
"""
        expected_project_id = "fixed-project-uuid"

        mock_graph_store = AsyncMock()
        mock_graph_store.create_project = AsyncMock(return_value=expected_project_id)
        mock_graph_store.store_paper_metadata = AsyncMock(return_value="paper-uuid")
        mock_graph_store.store_chunks = AsyncMock(return_value=0)
        mock_graph_store.create_embeddings = AsyncMock(return_value=0)
        mock_graph_store.build_concept_relationships = AsyncMock(return_value=0)
        mock_graph_store._entity_dao = MagicMock()
        mock_graph_store._entity_dao.clear_memory_cache = MagicMock()

        importer = ZoteroRDFImporter(
            llm_provider=None,
            db_connection=None,
            graph_store=mock_graph_store,
        )

        importer._build_cooccurrence_relationships = AsyncMock(return_value=0)
        importer.progress.concepts_extracted = 1
        importer.entity_extractor.clear_cache = MagicMock()

        with tempfile.TemporaryDirectory() as tmpdir:
            rdf_path = Path(tmpdir) / "export.rdf"
            rdf_path.write_text(rdf_content, encoding="utf-8")

            result = await importer.import_folder(
                folder_path=tmpdir,
                project_name="Test",
                extract_concepts=False,
            )

        importer._build_cooccurrence_relationships.assert_called_once_with(
            project_id=expected_project_id
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
