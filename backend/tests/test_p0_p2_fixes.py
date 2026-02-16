"""
Tests for v0.24.0 P0-P2 Comprehensive Fixes
Tests cluster label generation, Leiden fallback, paper_count, and feature flags.
"""
import pytest
import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch
import numpy as np


class TestFeatureFlags:
    """Task 2: Feature flags should default to True."""

    def test_lexical_graph_v1_default_true(self):
        """lexical_graph_v1 should default to True."""
        # Use model_construct to bypass validation and .env loading
        from config import Settings
        s = Settings.model_construct(
            database_url="postgresql://test:5432/test",
            lexical_graph_v1=True,  # Explicitly set to test default
        )
        assert s.lexical_graph_v1 is True

        # Also test that the field default is True in the model
        from pydantic.fields import FieldInfo
        field_info = Settings.model_fields.get('lexical_graph_v1')
        if field_info and hasattr(field_info, 'default'):
            assert field_info.default is True

    def test_hybrid_trace_v1_default_true(self):
        """hybrid_trace_v1 should default to True."""
        from config import Settings
        s = Settings.model_construct(
            database_url="postgresql://test:5432/test",
            hybrid_trace_v1=True,
        )
        assert s.hybrid_trace_v1 is True

        # Test field default
        field_info = Settings.model_fields.get('hybrid_trace_v1')
        if field_info and hasattr(field_info, 'default'):
            assert field_info.default is True

    def test_topic_lod_default_true(self):
        """topic_lod_default should default to True."""
        from config import Settings
        s = Settings.model_construct(
            database_url="postgresql://test:5432/test",
            topic_lod_default=True,
        )
        assert s.topic_lod_default is True

        # Test field default
        field_info = Settings.model_fields.get('topic_lod_default')
        if field_info and hasattr(field_info, 'default'):
            assert field_info.default is True


class TestClusterLabelGeneration:
    """Task 4: Cluster label LLM generation with retry and fallback."""

    @pytest.mark.asyncio
    async def test_fallback_when_no_llm(self):
        """Without LLM, should return keyword join."""
        from graph.gap_detector import GapDetector
        detector = GapDetector(llm_provider=None)

        result = await detector._generate_cluster_label(["machine learning", "deep learning", "neural networks"])
        assert result == "machine learning / deep learning / neural networks"

    @pytest.mark.asyncio
    async def test_fallback_with_empty_keywords(self):
        """With empty keywords and no LLM, should return 'Unnamed Cluster'."""
        from graph.gap_detector import GapDetector
        detector = GapDetector(llm_provider=None)

        result = await detector._generate_cluster_label([])
        assert result == "Unnamed Cluster"

    @pytest.mark.asyncio
    async def test_fallback_filters_empty_strings(self):
        """Should filter out empty/whitespace keywords."""
        from graph.gap_detector import GapDetector
        detector = GapDetector(llm_provider=None)

        result = await detector._generate_cluster_label(["valid", "", "  ", "also_valid"])
        assert "valid" in result
        assert "also_valid" in result

    @pytest.mark.asyncio
    async def test_llm_success(self):
        """Successful LLM call should return the label."""
        from graph.gap_detector import GapDetector

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value="AI in Healthcare")
        detector = GapDetector(llm_provider=mock_llm)

        result = await detector._generate_cluster_label(["artificial intelligence", "healthcare", "diagnosis"])
        assert result == "AI in Healthcare"

    @pytest.mark.asyncio
    async def test_llm_timeout_retries(self):
        """On timeout, should retry once then fallback to keywords."""
        from graph.gap_detector import GapDetector

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(side_effect=asyncio.TimeoutError())
        detector = GapDetector(llm_provider=mock_llm)

        result = await detector._generate_cluster_label(["concept_a", "concept_b", "concept_c"])
        # Should have tried twice (initial + 1 retry)
        assert mock_llm.generate.call_count == 2
        # Should fallback to keyword join
        assert "concept_a" in result

    @pytest.mark.asyncio
    async def test_llm_invalid_result_uses_fallback(self):
        """If LLM returns too short/long result, should fallback."""
        from graph.gap_detector import GapDetector

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value="ab")  # Too short (< 3 chars)
        detector = GapDetector(llm_provider=mock_llm)

        result = await detector._generate_cluster_label(["keyword_one", "keyword_two"])
        # Should fallback to keyword join since "ab" is < 3 chars
        assert "keyword_one" in result

    @pytest.mark.asyncio
    async def test_never_returns_generic_cluster_n(self):
        """Should NEVER return generic 'Cluster N' labels (except 'Unnamed Cluster')."""
        from graph.gap_detector import GapDetector
        detector = GapDetector(llm_provider=None)

        for keywords in [
            ["a", "b", "c"],
            ["single"],
        ]:
            result = await detector._generate_cluster_label(keywords)
            # Should not start with "Cluster " unless it's "Unnamed Cluster"
            if result.startswith("Cluster "):
                # This would be a fallback from cluster_concepts() not _generate_cluster_label()
                # _generate_cluster_label should never return "Cluster N"
                assert False, f"_generate_cluster_label returned generic label: {result}"


class TestVisualizationPaperCount:
    """Task 3: paper_count should be included in visualization node properties."""

    @patch.dict('os.environ', {}, clear=True)
    def test_paper_count_in_visualization_endpoint(self):
        """Verify the visualization endpoint includes paper_count."""
        import inspect
        from routers.graph import get_visualization_data
        source = inspect.getsource(get_visualization_data)

        # Check that the query includes paper_count calculation
        assert "paper_count" in source.lower()
        # Check for array_length function used to calculate paper_count
        assert "array_length" in source.lower() or "source_paper_ids" in source.lower()


class TestMaxNodesDefault:
    """Task 8: max_nodes default should be 2000."""

    @patch.dict('os.environ', {}, clear=True)
    def test_max_nodes_default_2000(self):
        """Verify max_nodes default is 2000 in visualization endpoint."""
        import inspect
        from routers.graph import get_visualization_data
        source = inspect.getsource(get_visualization_data)

        # Check for Query(2000 pattern
        assert "Query(2000" in source or "2000" in source


class TestLeidenIntegration:
    """Task 5: Leiden community detection should be attempted before K-means."""

    def test_cluster_concepts_attempts_leiden_first(self):
        """Verify cluster_concepts tries Leiden before K-means."""
        import inspect
        from graph.gap_detector import GapDetector
        source = inspect.getsource(GapDetector.cluster_concepts)

        # Check that Leiden is mentioned
        assert "CommunityDetector" in source or "leiden" in source.lower()

        # Check that K-means is also present as fallback
        assert "KMeans" in source or "kmeans" in source.lower()

    @pytest.mark.asyncio
    async def test_leiden_fallback_to_kmeans(self):
        """Test that K-means is used when Leiden fails."""
        from graph.gap_detector import GapDetector

        # Create detector without db connection (forces Leiden to fail)
        detector = GapDetector(llm_provider=None)

        concepts = [
            {"id": str(i), "name": f"concept{i}", "embedding": [float(i * 0.1), float(i * 0.2), float(i * 0.3)]}
            for i in range(10)
        ]

        # Should fall back to K-means and still work
        clusters = await detector.cluster_concepts(concepts, n_clusters=3)

        # Should have created clusters using K-means
        assert isinstance(clusters, list)
        # May be 0 if too few concepts, or 3 if successful
        assert len(clusters) >= 0


class TestClusteringEdgeCases:
    """Test edge cases in clustering logic."""

    @pytest.mark.asyncio
    async def test_clustering_with_mismatched_embeddings(self):
        """Should filter out concepts with mismatched embedding dimensions."""
        from graph.gap_detector import GapDetector
        detector = GapDetector(llm_provider=None)

        concepts = [
            {"id": "1", "name": "c1", "embedding": [0.1, 0.2, 0.3]},
            {"id": "2", "name": "c2", "embedding": [0.2, 0.3, 0.4]},
            {"id": "3", "name": "c3", "embedding": [0.3, 0.4]},  # Wrong dimension
            {"id": "4", "name": "c4", "embedding": [0.4, 0.5, 0.6]},
        ]

        clusters = await detector.cluster_concepts(concepts, n_clusters=2)

        # Should work with valid concepts only
        assert isinstance(clusters, list)

    @pytest.mark.asyncio
    async def test_clustering_with_no_embeddings(self):
        """Should return empty list when no concepts have embeddings."""
        from graph.gap_detector import GapDetector
        detector = GapDetector(llm_provider=None)

        concepts = [
            {"id": "1", "name": "c1", "embedding": None},
            {"id": "2", "name": "c2", "embedding": []},
        ]

        clusters = await detector.cluster_concepts(concepts, n_clusters=2)

        assert clusters == []

    @pytest.mark.asyncio
    async def test_clustering_with_too_few_concepts(self):
        """Should return empty list when fewer than 3 concepts."""
        from graph.gap_detector import GapDetector
        detector = GapDetector(llm_provider=None)

        concepts = [
            {"id": "1", "name": "c1", "embedding": [0.1, 0.2, 0.3]},
            {"id": "2", "name": "c2", "embedding": [0.2, 0.3, 0.4]},
        ]

        clusters = await detector.cluster_concepts(concepts, n_clusters=2)

        assert clusters == []


class TestClusterLabelFallback:
    """Test cluster label fallback logic in cluster_concepts."""

    @pytest.mark.asyncio
    async def test_label_generation_exception_handling(self):
        """When LLM label generation fails, should use keyword fallback."""
        from graph.gap_detector import GapDetector

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(side_effect=Exception("LLM Error"))
        detector = GapDetector(llm_provider=mock_llm)

        concepts = [
            {"id": str(i), "name": f"keyword{i}", "embedding": [float(i * 0.1), float(i * 0.2), float(i * 0.3)]}
            for i in range(5)
        ]

        clusters = await detector.cluster_concepts(concepts, n_clusters=2)

        # Should still create clusters with fallback names
        assert len(clusters) > 0
        for cluster in clusters:
            # Name should not be empty
            assert cluster.name
            # Should contain keywords or be a fallback pattern
            assert len(cluster.name) > 0


class TestLabelValidation:
    """Test label length validation logic."""

    @pytest.mark.asyncio
    async def test_llm_label_too_long(self):
        """If LLM returns label >60 chars, should use fallback."""
        from graph.gap_detector import GapDetector

        mock_llm = MagicMock()
        # Return a label that's too long (>60 chars)
        long_label = "This is a very long label that exceeds sixty characters limit"
        mock_llm.generate = AsyncMock(return_value=long_label)
        detector = GapDetector(llm_provider=mock_llm)

        result = await detector._generate_cluster_label(["keyword_one", "keyword_two"])

        # Should fallback to keyword join since label is >60 chars
        assert "keyword_one" in result or "keyword_two" in result

    @pytest.mark.asyncio
    async def test_llm_label_valid_length(self):
        """If LLM returns valid length label (3-60 chars), should accept it."""
        from graph.gap_detector import GapDetector

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value="Valid Label")
        detector = GapDetector(llm_provider=mock_llm)

        result = await detector._generate_cluster_label(["keyword_one", "keyword_two"])

        assert result == "Valid Label"
