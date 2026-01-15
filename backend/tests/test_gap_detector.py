"""
Tests for Gap Detector module.
"""

import pytest
import numpy as np
from unittest.mock import MagicMock, AsyncMock, patch


class TestGapDetector:
    """Test gap detection functionality."""

    @pytest.fixture
    def sample_concepts(self):
        """Sample concept data for testing."""
        return [
            {"id": "1", "name": "machine learning", "embedding": [0.1, 0.2, 0.3]},
            {"id": "2", "name": "deep learning", "embedding": [0.15, 0.25, 0.35]},
            {"id": "3", "name": "education", "embedding": [0.8, 0.7, 0.6]},
            {"id": "4", "name": "pedagogy", "embedding": [0.85, 0.75, 0.65]},
            {"id": "5", "name": "assessment", "embedding": [0.82, 0.72, 0.62]},
        ]

    @pytest.fixture
    def sample_edges(self):
        """Sample edge data for testing."""
        return [
            {"source": "1", "target": "2", "weight": 0.9},
            {"source": "3", "target": "4", "weight": 0.85},
            {"source": "4", "target": "5", "weight": 0.8},
        ]

    @pytest.fixture
    def gap_detector(self):
        """Create gap detector instance."""
        from graph.gap_detector import GapDetector
        return GapDetector()

    def test_detector_initialization(self, gap_detector):
        """Test gap detector initializes correctly."""
        assert gap_detector is not None

    def test_cluster_concepts(self, gap_detector, sample_concepts):
        """Test concept clustering."""
        embeddings = np.array([c["embedding"] for c in sample_concepts])
        
        clusters = gap_detector.cluster_concepts(sample_concepts, n_clusters=2)
        
        assert isinstance(clusters, list)
        assert len(clusters) == 2
        
        # Each cluster should have required fields
        for cluster in clusters:
            assert "id" in cluster
            assert "concept_ids" in cluster
            assert "color" in cluster

    def test_cluster_with_few_concepts(self, gap_detector):
        """Test clustering with fewer concepts than clusters."""
        concepts = [
            {"id": "1", "name": "test", "embedding": [0.1, 0.2, 0.3]},
        ]
        
        clusters = gap_detector.cluster_concepts(concepts, n_clusters=2)
        
        # Should handle gracefully
        assert isinstance(clusters, list)

    def test_detect_gaps(self, gap_detector, sample_concepts, sample_edges):
        """Test gap detection between clusters."""
        # First cluster concepts
        clusters = gap_detector.cluster_concepts(sample_concepts, n_clusters=2)
        
        # Then detect gaps
        gaps = gap_detector.detect_gaps(clusters, sample_edges)
        
        assert isinstance(gaps, list)
        
        # Each gap should have required fields
        for gap in gaps:
            assert "cluster_a_id" in gap
            assert "cluster_b_id" in gap
            assert "gap_strength" in gap
            assert 0 <= gap["gap_strength"] <= 1

    def test_gap_strength_calculation(self, gap_detector):
        """Test gap strength calculation."""
        # Clusters with no connections should have high gap strength
        cluster_a = {"id": 0, "concept_ids": ["1", "2"]}
        cluster_b = {"id": 1, "concept_ids": ["3", "4"]}
        edges = []  # No connections
        
        gap_strength = gap_detector._calculate_gap_strength(cluster_a, cluster_b, edges)
        
        assert gap_strength > 0.5  # Should be high (weak connection)

    def test_gap_strength_with_connections(self, gap_detector):
        """Test gap strength with existing connections."""
        cluster_a = {"id": 0, "concept_ids": ["1", "2"]}
        cluster_b = {"id": 1, "concept_ids": ["3", "4"]}
        edges = [
            {"source": "1", "target": "3", "weight": 0.9},
            {"source": "2", "target": "4", "weight": 0.8},
        ]
        
        gap_strength = gap_detector._calculate_gap_strength(cluster_a, cluster_b, edges)
        
        assert gap_strength < 0.5  # Should be lower (stronger connection)

    def test_calculate_centrality(self, gap_detector, sample_concepts, sample_edges):
        """Test centrality calculation."""
        centrality = gap_detector.calculate_centrality(sample_concepts, sample_edges)
        
        assert isinstance(centrality, dict)
        
        # Each concept should have centrality metrics
        for concept_id, metrics in centrality.items():
            assert "degree" in metrics
            assert "betweenness" in metrics
            assert metrics["degree"] >= 0

    def test_find_bridge_candidates(self, gap_detector, sample_concepts, sample_edges):
        """Test finding bridge concept candidates."""
        centrality = gap_detector.calculate_centrality(sample_concepts, sample_edges)
        
        bridges = gap_detector.find_bridge_candidates(centrality, top_k=3)
        
        assert isinstance(bridges, list)
        assert len(bridges) <= 3

    def test_optimal_cluster_determination(self, gap_detector, sample_concepts):
        """Test automatic cluster number determination."""
        embeddings = np.array([c["embedding"] for c in sample_concepts])
        
        optimal_k = gap_detector._determine_optimal_clusters(embeddings)
        
        assert isinstance(optimal_k, int)
        assert 2 <= optimal_k <= len(sample_concepts)


class TestStructuralGap:
    """Test StructuralGap dataclass."""

    def test_structural_gap_creation(self):
        """Test creating a StructuralGap."""
        from graph.gap_detector import StructuralGap
        
        gap = StructuralGap(
            id="gap-1",
            cluster_a_id=0,
            cluster_b_id=1,
            gap_strength=0.8,
            concept_a_ids=["1", "2"],
            concept_b_ids=["3", "4"],
            bridge_concepts=["5"],
            suggested_research_questions=["How can A connect to B?"],
            status="detected"
        )
        
        assert gap.id == "gap-1"
        assert gap.gap_strength == 0.8
        assert gap.status == "detected"


class TestConceptCluster:
    """Test ConceptCluster dataclass."""

    def test_concept_cluster_creation(self):
        """Test creating a ConceptCluster."""
        from graph.gap_detector import ConceptCluster
        
        cluster = ConceptCluster(
            id=0,
            name="AI Cluster",
            color="#FF5733",
            concept_ids=["1", "2", "3"],
            centroid=np.array([0.1, 0.2, 0.3]),
            keywords=["machine learning", "AI"],
            avg_centrality=0.5
        )
        
        assert cluster.id == 0
        assert cluster.name == "AI Cluster"
        assert len(cluster.concept_ids) == 3


class TestResearchQuestionGeneration:
    """Test research question generation."""

    @pytest.fixture
    def gap_detector_with_llm(self):
        """Create gap detector with mocked LLM."""
        from graph.gap_detector import GapDetector
        
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value="How can machine learning improve education?")
        
        detector = GapDetector(llm_provider=mock_llm)
        return detector

    @pytest.mark.asyncio
    async def test_generate_research_questions(self, gap_detector_with_llm):
        """Test generating research questions for a gap."""
        gap = {
            "cluster_a_name": "Machine Learning",
            "cluster_b_name": "Education",
            "concept_a_keywords": ["AI", "neural networks"],
            "concept_b_keywords": ["pedagogy", "assessment"],
        }
        
        questions = await gap_detector_with_llm.generate_research_questions(gap)
        
        assert isinstance(questions, list)


class TestClusterColors:
    """Test cluster color assignment."""

    def test_cluster_colors_distinct(self):
        """Test that cluster colors are visually distinct."""
        from graph.gap_detector import CLUSTER_COLORS
        
        assert len(CLUSTER_COLORS) >= 8  # Should have enough colors
        
        # All colors should be unique
        assert len(set(CLUSTER_COLORS)) == len(CLUSTER_COLORS)

    def test_color_assignment(self):
        """Test color assignment to clusters."""
        from graph.gap_detector import GapDetector
        
        detector = GapDetector()
        
        # Create clusters and check color assignment
        concepts = [
            {"id": str(i), "name": f"concept{i}", "embedding": [i * 0.1, i * 0.2, i * 0.3]}
            for i in range(10)
        ]
        
        clusters = detector.cluster_concepts(concepts, n_clusters=3)
        
        colors = [c["color"] for c in clusters]
        assert len(set(colors)) == 3  # Each cluster has unique color
