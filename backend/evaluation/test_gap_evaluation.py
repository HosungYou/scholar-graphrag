"""
Unit tests for Gap Detection Evaluation System

Tests the GapDetectionMetrics class and evaluation functions.
"""

import pytest
from backend.evaluation.metrics import GapDetectionMetrics, GapDetectionResult


class TestGapDetectionMetrics:
    """Test suite for GapDetectionMetrics."""

    def setup_method(self):
        """Set up test fixtures."""
        self.metrics = GapDetectionMetrics(concept_match_threshold=0.3)

        # Ground truth gaps
        self.ground_truth = [
            {
                "gap_id": "GAP-001",
                "description": "Gap between AI chatbots and low-resource languages",
                "cluster_a_concepts": ["ai chatbot", "conversational agent", "dialogue system"],
                "cluster_b_concepts": ["low-resource languages", "minority languages"],
                "severity": "high",
                "annotator": "manual",
            },
            {
                "gap_id": "GAP-002",
                "description": "Gap between AI learning and longitudinal studies",
                "cluster_a_concepts": ["ai assisted learning", "adaptive learning"],
                "cluster_b_concepts": ["longitudinal study", "retention"],
                "severity": "high",
                "annotator": "manual",
            },
            {
                "gap_id": "GAP-003",
                "description": "Gap between grading and ethics",
                "cluster_a_concepts": ["automated grading", "ai assessment"],
                "cluster_b_concepts": ["ethics", "fairness", "bias"],
                "severity": "medium",
                "annotator": "manual",
            },
        ]

    def test_perfect_match(self):
        """Test case where all detected gaps match ground truth."""
        detected = [
            {
                "id": "det-1",
                "cluster_a_names": ["ai chatbot", "conversational agent"],
                "cluster_b_names": ["low-resource languages"],
                "gap_strength": 0.05,
            },
            {
                "id": "det-2",
                "cluster_a_names": ["ai assisted learning"],
                "cluster_b_names": ["longitudinal study"],
                "gap_strength": 0.08,
            },
            {
                "id": "det-3",
                "cluster_a_names": ["automated grading"],
                "cluster_b_names": ["ethics", "bias"],
                "gap_strength": 0.12,
            },
        ]

        result = self.metrics.evaluate(self.ground_truth, detected)

        assert result.gap_precision == 1.0
        assert result.gap_recall == 1.0
        assert result.gap_f1 == 1.0
        assert result.true_positives == 3
        assert result.false_positives == 0
        assert result.false_negatives == 0

    def test_partial_match(self):
        """Test case with some matches and some misses."""
        detected = [
            {
                "id": "det-1",
                "cluster_a_names": ["ai chatbot"],
                "cluster_b_names": ["low-resource languages"],
                "gap_strength": 0.05,
            },
            {
                "id": "det-2",
                "cluster_a_names": ["neural networks"],  # False positive
                "cluster_b_names": ["computer vision"],
                "gap_strength": 0.10,
            },
        ]

        result = self.metrics.evaluate(self.ground_truth, detected)

        assert result.true_positives == 1
        assert result.false_positives == 1
        assert result.false_negatives == 2
        assert result.gap_precision == 0.5  # 1/2
        assert result.gap_recall == pytest.approx(0.3333, rel=1e-3)  # 1/3
        assert len(result.matched_gaps) == 1
        assert len(result.unmatched_ground_truth) == 2
        assert len(result.unmatched_detected) == 1

    def test_no_matches(self):
        """Test case where nothing matches."""
        detected = [
            {
                "id": "det-1",
                "cluster_a_names": ["completely different"],
                "cluster_b_names": ["unrelated concepts"],
                "gap_strength": 0.05,
            },
        ]

        result = self.metrics.evaluate(self.ground_truth, detected)

        assert result.gap_precision == 0.0
        assert result.gap_recall == 0.0
        assert result.gap_f1 == 0.0
        assert result.true_positives == 0
        assert result.false_positives == 1
        assert result.false_negatives == 3

    def test_empty_detected(self):
        """Test case with no detected gaps."""
        result = self.metrics.evaluate(self.ground_truth, [])

        assert result.gap_precision == 0.0
        assert result.gap_recall == 0.0
        assert result.gap_f1 == 0.0
        assert result.false_negatives == 3

    def test_empty_ground_truth(self):
        """Test case with no ground truth."""
        detected = [
            {
                "id": "det-1",
                "cluster_a_names": ["concept a"],
                "cluster_b_names": ["concept b"],
                "gap_strength": 0.05,
            },
        ]

        result = self.metrics.evaluate([], detected)

        assert result.gap_precision == 0.0
        assert result.gap_recall == 0.0
        assert result.true_positives == 0
        assert result.false_positives == 1

    def test_threshold_sensitivity(self):
        """Test that threshold affects matching."""
        # High threshold (strict matching)
        strict_metrics = GapDetectionMetrics(concept_match_threshold=0.8)

        detected = [
            {
                "id": "det-1",
                "cluster_a_names": ["ai chatbot"],  # Only partial overlap
                "cluster_b_names": ["low-resource languages"],
                "gap_strength": 0.05,
            },
        ]

        strict_result = strict_metrics.evaluate(self.ground_truth, detected)
        lenient_result = self.metrics.evaluate(self.ground_truth, detected)

        # Strict threshold may not match, lenient should
        assert lenient_result.true_positives >= strict_result.true_positives

    def test_case_insensitive_matching(self):
        """Test that concept matching is case-insensitive."""
        detected = [
            {
                "id": "det-1",
                "cluster_a_names": ["AI CHATBOT", "Conversational Agent"],
                "cluster_b_names": ["Low-Resource Languages"],
                "gap_strength": 0.05,
            },
        ]

        result = self.metrics.evaluate(self.ground_truth, detected)

        assert result.true_positives == 1
        assert result.gap_precision == 1.0

    def test_alternative_field_names(self):
        """Test support for both cluster_a_names and cluster_a_concepts."""
        detected = [
            {
                "id": "det-1",
                "cluster_a_concepts": ["ai chatbot"],  # Using 'concepts' instead of 'names'
                "cluster_b_concepts": ["low-resource languages"],
                "gap_strength": 0.05,
            },
        ]

        result = self.metrics.evaluate(self.ground_truth, detected)

        assert result.true_positives == 1

    def test_jaccard_similarity_calculation(self):
        """Test Jaccard similarity matching logic."""
        # Exact overlap
        detected_exact = [
            {
                "id": "det-1",
                "cluster_a_names": ["ai chatbot", "conversational agent", "dialogue system"],
                "cluster_b_names": ["low-resource languages", "minority languages"],
                "gap_strength": 0.05,
            },
        ]

        result_exact = self.metrics.evaluate(self.ground_truth[:1], detected_exact)
        assert result_exact.true_positives == 1

        # Partial overlap (should still match if above threshold)
        detected_partial = [
            {
                "id": "det-2",
                "cluster_a_names": ["ai chatbot"],  # 1 out of 3
                "cluster_b_names": ["low-resource languages"],  # 1 out of 2
                "gap_strength": 0.05,
            },
        ]

        result_partial = self.metrics.evaluate(self.ground_truth[:1], detected_partial)
        # Jaccard = 2 / (3 + 2 + extra) = depends on union size
        # With threshold 0.3, should match

    def test_matched_gaps_structure(self):
        """Test that matched gaps preserve original data."""
        detected = [
            {
                "id": "det-1",
                "cluster_a_names": ["ai chatbot"],
                "cluster_b_names": ["low-resource languages"],
                "gap_strength": 0.05,
            },
        ]

        result = self.metrics.evaluate(self.ground_truth, detected)

        assert len(result.matched_gaps) == 1
        gt_gap, det_gap = result.matched_gaps[0]
        assert gt_gap["gap_id"] == "GAP-001"
        assert det_gap["id"] == "det-1"
        assert det_gap["gap_strength"] == 0.05


@pytest.mark.asyncio
async def test_benchmark_integration():
    """Test integration with benchmark module."""
    from backend.evaluation.benchmark import evaluate_gap_detection_with_data
    import tempfile
    import json

    ground_truth = [
        {
            "gap_id": "GAP-TEST-1",
            "description": "Test gap",
            "cluster_a_concepts": ["concept a"],
            "cluster_b_concepts": ["concept b"],
            "severity": "high",
            "annotator": "test",
        },
    ]

    detected = [
        {
            "id": "det-test-1",
            "cluster_a_names": ["concept a"],
            "cluster_b_names": ["concept b"],
            "gap_strength": 0.05,
        },
    ]

    with tempfile.TemporaryDirectory() as tmpdir:
        result = await evaluate_gap_detection_with_data(
            ground_truth_gaps=ground_truth,
            detected_gaps=detected,
            output_dir=tmpdir,
        )

        assert result["result"].gap_precision == 1.0
        assert result["result"].gap_recall == 1.0
        assert "summary" in result
        assert "results_file" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
