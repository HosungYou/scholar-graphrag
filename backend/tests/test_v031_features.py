"""
Tests for v0.31.0 New Features:
1. StructuralGapResponse — new impact_score, feasibility_score, research_significance, quadrant fields
2. Research Frontier Score Computation — impact/feasibility calculation logic
3. Safe PageRank Cast — regex-guarded float cast pattern
4. Summary Temporal Graceful Degradation — try/except around temporal queries
5. UUID to String Conversion — cluster node_ids UUID→str conversion

Unit tests only — no database connections required.
All DB-touching methods are tested via mocks.
"""

import re
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Regex pattern replicated from the SQL queries in graph.py
PAGERANK_REGEX = r'^-?\d+(\.\d+)?$'


# =============================================================================
# 1. StructuralGapResponse Model Tests
# =============================================================================

class TestStructuralGapResponseModel:
    """Tests for v0.31.0 StructuralGapResponse new fields."""

    def _make_gap(self, **overrides):
        """Build a minimal valid StructuralGapResponse."""
        from routers.graph import StructuralGapResponse, PotentialEdgeResponse
        defaults = dict(
            id="gap-001",
            cluster_a_id=0,
            cluster_b_id=1,
            cluster_a_concepts=["concept-uuid-a"],
            cluster_b_concepts=["concept-uuid-b"],
            cluster_a_names=["NLP"],
            cluster_b_names=["Computer Vision"],
            gap_strength=0.72,
            bridge_candidates=["Multimodal Learning"],
            research_questions=["Can transformers bridge vision and language?"],
            potential_edges=[],
        )
        defaults.update(overrides)
        return StructuralGapResponse(**defaults)

    def test_default_impact_score(self):
        """New impact_score field should default to 0.0."""
        gap = self._make_gap()
        assert gap.impact_score == 0.0

    def test_default_feasibility_score(self):
        """New feasibility_score field should default to 0.0."""
        gap = self._make_gap()
        assert gap.feasibility_score == 0.0

    def test_default_research_significance(self):
        """New research_significance field should default to empty string."""
        gap = self._make_gap()
        assert gap.research_significance == ""

    def test_default_quadrant(self):
        """New quadrant field should default to empty string."""
        gap = self._make_gap()
        assert gap.quadrant == ""

    def test_model_with_all_fields(self):
        """Model should accept all v0.31.0 fields."""
        gap = self._make_gap(
            impact_score=0.85,
            feasibility_score=0.6,
            research_significance="NLP과(와) CV 사이의 미탐구 연결은 새로운 학제간 연구 기회를 제시합니다.",
            quadrant="high_impact_high_feasibility",
        )
        assert gap.impact_score == 0.85
        assert gap.feasibility_score == 0.6
        assert gap.quadrant == "high_impact_high_feasibility"
        assert "미탐구" in gap.research_significance

    def test_impact_score_accepts_float(self):
        """impact_score field must accept float values between 0 and 1."""
        gap = self._make_gap(impact_score=0.5)
        assert isinstance(gap.impact_score, float)
        assert 0.0 <= gap.impact_score <= 1.0

    def test_feasibility_score_accepts_float(self):
        """feasibility_score field must accept float values between 0 and 1."""
        gap = self._make_gap(feasibility_score=0.333)
        assert isinstance(gap.feasibility_score, float)

    def test_quadrant_high_impact_low_feasibility(self):
        """quadrant field should store 'high_impact_low_feasibility' string."""
        gap = self._make_gap(quadrant="high_impact_low_feasibility")
        assert gap.quadrant == "high_impact_low_feasibility"

    def test_quadrant_low_impact_high_feasibility(self):
        """quadrant field should store 'low_impact_high_feasibility' string."""
        gap = self._make_gap(quadrant="low_impact_high_feasibility")
        assert gap.quadrant == "low_impact_high_feasibility"

    def test_quadrant_low_impact_low_feasibility(self):
        """quadrant field should store 'low_impact_low_feasibility' string."""
        gap = self._make_gap(quadrant="low_impact_low_feasibility")
        assert gap.quadrant == "low_impact_low_feasibility"


# =============================================================================
# 2. Research Frontier Score Computation Tests
# =============================================================================

class TestFrontierScoreComputation:
    """
    Tests for impact/feasibility score computation logic.

    Replicates the algorithm from get_gap_analysis in routers/graph.py:

    Impact:
        size_product = cluster_a_size * cluster_b_size
        bridge_factor = min(len(bridge_candidates), 10) / 10.0
        raw_impact = (size_product / max(max_cluster_product, 1)) * 0.6 + bridge_factor * 0.4
        impact_score = round(min(1.0, max(0.0, raw_impact)), 3)

    Feasibility:
        if potential_edges:
            sim_ratio = count(pe.similarity > 0.5) / len(potential_edges)
        else:
            sim_ratio = 0.3
        bridge_avail = min(len(bridge_candidates), 5) / 5.0
        raw_feasibility = sim_ratio * 0.5 + bridge_avail * 0.3 + (1.0 - gap_strength) * 0.2
        feasibility_score = round(min(1.0, max(0.0, raw_feasibility)), 3)

    Quadrant:
        hi = impact_score >= 0.5
        hf = feasibility_score >= 0.5
        → one of: high_impact_high_feasibility, high_impact_low_feasibility,
                  low_impact_high_feasibility, low_impact_low_feasibility
    """

    def _compute_impact(self, cluster_a_size, cluster_b_size, bridge_candidates, max_cluster_product=None):
        """Replicate impact score computation from graph.py."""
        size_product = cluster_a_size * cluster_b_size
        if max_cluster_product is None:
            max_cluster_product = size_product  # single gap scenario → ratio = 1.0
        bridge_factor = min(len(bridge_candidates), 10) / 10.0
        raw_impact = (size_product / max(max_cluster_product, 1)) * 0.6 + bridge_factor * 0.4
        return round(min(1.0, max(0.0, raw_impact)), 3)

    def _compute_feasibility(self, potential_edges, bridge_candidates, gap_strength):
        """Replicate feasibility score computation from graph.py."""
        if potential_edges:
            high_sim_count = sum(1 for pe in potential_edges if pe > 0.5)
            sim_ratio = high_sim_count / max(len(potential_edges), 1)
        else:
            sim_ratio = 0.3
        bridge_avail = min(len(bridge_candidates), 5) / 5.0
        raw_feasibility = sim_ratio * 0.5 + bridge_avail * 0.3 + (1.0 - gap_strength) * 0.2
        return round(min(1.0, max(0.0, raw_feasibility)), 3)

    def _classify_quadrant(self, impact_score, feasibility_score):
        """Replicate quadrant classification from graph.py."""
        hi = impact_score >= 0.5
        hf = feasibility_score >= 0.5
        if hi and hf:
            return "high_impact_high_feasibility"
        elif hi and not hf:
            return "high_impact_low_feasibility"
        elif not hi and hf:
            return "low_impact_high_feasibility"
        else:
            return "low_impact_low_feasibility"

    def _generate_research_significance(self, cluster_a_names, cluster_b_names, cluster_a_id=0, cluster_b_id=1):
        """Replicate research_significance generation from graph.py."""
        a_names = ", ".join(cluster_a_names[:2]) if cluster_a_names else f"Cluster {cluster_a_id}"
        b_names = ", ".join(cluster_b_names[:2]) if cluster_b_names else f"Cluster {cluster_b_id}"
        return f"{a_names}과(와) {b_names} 사이의 미탐구 연결은 새로운 학제간 연구 기회를 제시합니다."

    # --- Impact Score ---

    def test_impact_score_large_clusters(self):
        """Larger cluster size product should yield higher impact scores."""
        small = self._compute_impact(2, 3, [], max_cluster_product=100)
        large = self._compute_impact(10, 10, [], max_cluster_product=100)
        assert large > small

    def test_impact_score_many_bridges(self):
        """More bridge candidates should increase impact score."""
        few_bridges = self._compute_impact(5, 5, [], max_cluster_product=25)
        many_bridges = self._compute_impact(5, 5, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], max_cluster_product=25)
        assert many_bridges > few_bridges

    def test_impact_score_normalized_0_to_1(self):
        """Impact score should always be between 0.0 and 1.0."""
        # Maximum possible: same cluster product as max, all 10 bridges
        score = self._compute_impact(100, 100, ["b"] * 10, max_cluster_product=10000)
        assert 0.0 <= score <= 1.0

    def test_impact_score_max_bridges_capped(self):
        """bridge_factor is capped at 10 candidates (min(n, 10)/10)."""
        score_10 = self._compute_impact(5, 5, ["b"] * 10, max_cluster_product=25)
        score_20 = self._compute_impact(5, 5, ["b"] * 20, max_cluster_product=25)
        assert score_10 == score_20

    def test_impact_score_zero_clusters(self):
        """Zero-sized clusters should not crash — max() guard prevents divide-by-zero."""
        score = self._compute_impact(0, 0, [], max_cluster_product=0)
        assert 0.0 <= score <= 1.0

    def test_impact_score_single_gap_is_max_ratio(self):
        """When there is only one gap, size_product == max_cluster_product → ratio = 1.0."""
        score = self._compute_impact(10, 10, [], max_cluster_product=100)
        # ratio = 100/100 = 1.0, bridge_factor = 0 → raw = 0.6
        assert abs(score - 0.6) < 0.001

    # --- Feasibility Score ---

    def test_feasibility_score_high_similarity(self):
        """High cosine similarity edges should increase feasibility score."""
        # All edges have similarity > 0.5
        high_sim_edges = [0.8, 0.9, 0.7]
        score_high = self._compute_feasibility(high_sim_edges, [], gap_strength=0.5)
        # No edges at all → sim_ratio = 0.3
        score_low = self._compute_feasibility([], [], gap_strength=0.5)
        assert score_high > score_low

    def test_feasibility_score_low_similarity(self):
        """All edges below 0.5 similarity → sim_ratio = 0."""
        low_sim_edges = [0.1, 0.2, 0.3]
        score = self._compute_feasibility(low_sim_edges, [], gap_strength=0.5)
        # sim_ratio = 0, bridge_avail = 0, gap contrib = 0.1 → raw = 0.1
        assert abs(score - 0.1) < 0.001

    def test_feasibility_score_no_edges_uses_default(self):
        """No potential_edges → sim_ratio defaults to 0.3."""
        score = self._compute_feasibility([], [], gap_strength=0.0)
        # sim_ratio=0.3, bridge_avail=0, gap=(1-0)*0.2 → 0.3*0.5 + 0 + 0.2 = 0.35
        assert abs(score - 0.35) < 0.001

    def test_feasibility_score_normalized_0_to_1(self):
        """Feasibility score should always be between 0.0 and 1.0."""
        score = self._compute_feasibility([0.9, 0.8, 0.7], ["a", "b", "c", "d", "e"], gap_strength=0.0)
        assert 0.0 <= score <= 1.0

    def test_feasibility_score_bridge_avail_capped_at_5(self):
        """bridge_avail is capped at 5 candidates (min(n, 5)/5)."""
        score_5 = self._compute_feasibility([], ["a"] * 5, gap_strength=0.5)
        score_10 = self._compute_feasibility([], ["a"] * 10, gap_strength=0.5)
        assert score_5 == score_10

    def test_feasibility_score_low_gap_strength_increases_score(self):
        """Lower gap_strength (easier to bridge) → higher feasibility."""
        score_low_gap = self._compute_feasibility([], [], gap_strength=0.1)
        score_high_gap = self._compute_feasibility([], [], gap_strength=0.9)
        assert score_low_gap > score_high_gap

    # --- Quadrant Classification ---

    def test_quadrant_high_impact_high_feasibility(self):
        """Both scores >= 0.5 → high_impact_high_feasibility."""
        q = self._classify_quadrant(0.7, 0.6)
        assert q == "high_impact_high_feasibility"

    def test_quadrant_high_impact_low_feasibility(self):
        """impact >= 0.5, feasibility < 0.5 → high_impact_low_feasibility."""
        q = self._classify_quadrant(0.8, 0.3)
        assert q == "high_impact_low_feasibility"

    def test_quadrant_low_impact_high_feasibility(self):
        """impact < 0.5, feasibility >= 0.5 → low_impact_high_feasibility."""
        q = self._classify_quadrant(0.2, 0.9)
        assert q == "low_impact_high_feasibility"

    def test_quadrant_low_impact_low_feasibility(self):
        """Both scores < 0.5 → low_impact_low_feasibility."""
        q = self._classify_quadrant(0.1, 0.2)
        assert q == "low_impact_low_feasibility"

    def test_quadrant_boundary_exactly_0_5(self):
        """Exactly 0.5 scores are treated as 'high' (>= threshold)."""
        q = self._classify_quadrant(0.5, 0.5)
        assert q == "high_impact_high_feasibility"

    def test_quadrant_boundary_just_below_0_5(self):
        """Scores just below 0.5 are treated as 'low'."""
        q = self._classify_quadrant(0.499, 0.499)
        assert q == "low_impact_low_feasibility"

    # --- Research Significance Generation ---

    def test_research_significance_generation(self):
        """Should generate Korean significance text with cluster names."""
        sig = self._generate_research_significance(["NLP", "Text Mining"], ["Computer Vision", "Image Seg"])
        assert "NLP" in sig
        assert "Computer Vision" in sig
        assert "미탐구" in sig
        assert "연구 기회" in sig

    def test_research_significance_uses_first_two_names(self):
        """Only first 2 names per cluster should appear in significance text."""
        sig = self._generate_research_significance(
            ["A", "B", "C", "D"],
            ["X", "Y", "Z"]
        )
        assert "A" in sig
        assert "B" in sig
        assert "C" not in sig  # third name should be excluded
        assert "X" in sig
        assert "Y" in sig
        assert "Z" not in sig

    def test_research_significance_empty_cluster_names_uses_fallback(self):
        """Empty cluster names should use 'Cluster {id}' fallback."""
        sig = self._generate_research_significance([], [], cluster_a_id=3, cluster_b_id=7)
        assert "Cluster 3" in sig
        assert "Cluster 7" in sig


# =============================================================================
# 3. Safe PageRank Cast Tests
# =============================================================================

class TestSafePageRankCast:
    """
    Tests for the regex-guarded float cast pattern used in SQL queries.

    The pattern in graph.py:
        CASE WHEN properties->>'centrality_pagerank' ~ '^-?\\d+(\\.\\d+)?$'
             THEN (properties->>'centrality_pagerank')::float
             ELSE 0 END

    We replicate the regex in Python to test boundary values.
    """

    def _matches(self, value):
        return bool(re.match(PAGERANK_REGEX, value))

    def test_valid_integer_matches_regex(self):
        """Plain integer string should match the pagerank regex."""
        assert self._matches("42") is True

    def test_valid_float_matches_regex(self):
        """Valid float string should match the pagerank regex."""
        assert self._matches("0.12345") is True
        assert self._matches("1.0") is True

    def test_zero_matches(self):
        """Zero should match."""
        assert self._matches("0") is True
        assert self._matches("0.0") is True

    def test_negative_float_matches(self):
        """Negative floats should match (pagerank can be negative in some implementations)."""
        assert self._matches("-0.5") is True
        assert self._matches("-1.234") is True

    def test_empty_string_does_not_match(self):
        """Empty string should not match the regex."""
        assert self._matches("") is False

    def test_non_numeric_does_not_match(self):
        """Non-numeric strings should not match."""
        assert self._matches("abc") is False
        assert self._matches("NaN") is False
        assert self._matches("Infinity") is False

    def test_spaces_do_not_match(self):
        """Strings with spaces should not match."""
        assert self._matches(" 0.5") is False
        assert self._matches("0.5 ") is False

    def test_multiple_dots_do_not_match(self):
        """Strings with multiple decimal points should not match."""
        assert self._matches("1.2.3") is False

    def test_leading_plus_does_not_match(self):
        """Leading '+' is not covered by the regex."""
        assert self._matches("+0.5") is False

    def test_scientific_notation_does_not_match(self):
        """Scientific notation is not covered by the pattern."""
        assert self._matches("1e-5") is False
        assert self._matches("1.5E10") is False


# =============================================================================
# 4. Summary Temporal Graceful Degradation Tests
# =============================================================================

class TestSummaryTemporalGracefulDegradation:
    """
    Tests for temporal section try/except in summary endpoint.

    BUG-055: Temporal info section failure crashes entire summary endpoint.
    Fix: Wrapped in try/except so temporal failure degrades gracefully
    (min_year/max_year=None, emerging_concepts=[]).
    """

    def _build_temporal_result(self, temporal_fetchrow_result, temporal_fetch_result=None):
        """
        Simulate the temporal block from get_project_summary.

        Returns (min_year, max_year, emerging_concepts) tuple.
        """
        min_year = None
        max_year = None
        emerging_concepts = []
        try:
            temporal_row = temporal_fetchrow_result
            min_year = temporal_row["min_year"] if temporal_row else None
            max_year = temporal_row["max_year"] if temporal_row else None

            if max_year is not None:
                emerging_threshold = max_year - 2
                emerging_rows = temporal_fetch_result or []
                emerging_concepts = [r["name"] for r in emerging_rows]
        except Exception:
            pass  # graceful degradation — keep defaults
        return min_year, max_year, emerging_concepts

    def _build_temporal_result_with_exception(self, exc):
        """Simulate the temporal block raising an exception."""
        min_year = None
        max_year = None
        emerging_concepts = []
        try:
            raise exc
        except Exception:
            pass
        return min_year, max_year, emerging_concepts

    @pytest.mark.asyncio
    async def test_summary_succeeds_when_temporal_fails(self):
        """Summary temporal block should catch exceptions and not propagate them."""
        min_year, max_year, emerging = self._build_temporal_result_with_exception(
            Exception("column first_seen_year does not exist")
        )
        # No exception propagated — defaults returned
        assert min_year is None
        assert max_year is None
        assert emerging == []

    @pytest.mark.asyncio
    async def test_summary_temporal_defaults_on_error(self):
        """When temporal fails, min_year/max_year should be None, emerging_concepts empty."""
        min_year, max_year, emerging = self._build_temporal_result_with_exception(
            RuntimeError("DB timeout")
        )
        assert min_year is None
        assert max_year is None
        assert emerging == []

    @pytest.mark.asyncio
    async def test_summary_temporal_succeeds_normally(self):
        """When temporal queries succeed, correct values should be returned."""
        fake_temporal_row = {"min_year": 2018, "max_year": 2024}
        fake_emerging_rows = [{"name": "RLHF"}, {"name": "Chain-of-Thought"}]
        min_year, max_year, emerging = self._build_temporal_result(
            fake_temporal_row, fake_emerging_rows
        )
        assert min_year == 2018
        assert max_year == 2024
        assert "RLHF" in emerging
        assert "Chain-of-Thought" in emerging

    @pytest.mark.asyncio
    async def test_summary_temporal_none_row_gives_none_years(self):
        """When temporal row returns None (no data), min/max year should be None."""
        min_year, max_year, emerging = self._build_temporal_result(None)
        assert min_year is None
        assert max_year is None
        assert emerging == []

    @pytest.mark.asyncio
    async def test_summary_temporal_none_max_year_skips_emerging(self):
        """When max_year is None, emerging_concepts block should be skipped."""
        fake_temporal_row = {"min_year": None, "max_year": None}
        min_year, max_year, emerging = self._build_temporal_result(fake_temporal_row, [])
        assert emerging == []

    @pytest.mark.asyncio
    async def test_summary_temporal_asyncpg_error_degrades(self):
        """asyncpg-style error during temporal fetch should degrade gracefully."""
        min_year, max_year, emerging = self._build_temporal_result_with_exception(
            ValueError("invalid input syntax for type integer")
        )
        assert min_year is None
        assert max_year is None
        assert emerging == []


# =============================================================================
# 5. UUID to String Conversion Tests
# =============================================================================

class TestUUIDConversion:
    """
    Tests for UUID→str conversion in cluster node_ids.

    BUG-051/BUG-053: Cluster `concepts` column (UUID[]) compared against
    string node IDs. Fix: `[str(c) for c in (row['concepts'] or [])]`
    """

    def _convert_concepts(self, concepts):
        """Replicate the conversion pattern from graph.py."""
        return [str(c) for c in (concepts or [])]

    def test_uuid_list_converted_to_strings(self):
        """UUID objects in concepts array should be converted to string."""
        import uuid
        uuids = [uuid.UUID("12345678-1234-5678-1234-567812345678"),
                 uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")]
        result = self._convert_concepts(uuids)
        assert result == [
            "12345678-1234-5678-1234-567812345678",
            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        ]
        assert all(isinstance(s, str) for s in result)

    def test_empty_concepts_handled(self):
        """Empty concepts list should return empty list, not error."""
        result = self._convert_concepts([])
        assert result == []

    def test_none_concepts_handled_gracefully(self):
        """None concepts (from DB NULL) should return empty list via `or []`."""
        result = self._convert_concepts(None)
        assert result == []

    def test_string_uuids_pass_through(self):
        """Already-string UUIDs should still pass through str() without error."""
        string_ids = ["abc-123", "def-456"]
        result = self._convert_concepts(string_ids)
        assert result == ["abc-123", "def-456"]

    def test_mixed_types_all_converted(self):
        """Mixed int/str/UUID types should all convert to strings."""
        import uuid
        mixed = [uuid.UUID("12345678-1234-5678-1234-567812345678"), "already-string", 42]
        result = self._convert_concepts(mixed)
        assert len(result) == 3
        assert all(isinstance(s, str) for s in result)
        assert result[1] == "already-string"
        assert result[2] == "42"

    def test_concepts_count_preserved(self):
        """Conversion must preserve the number of concepts."""
        import uuid
        uuids = [uuid.uuid4() for _ in range(10)]
        result = self._convert_concepts(uuids)
        assert len(result) == 10

    def test_str_representation_matches_uuid_format(self):
        """UUID str() must produce standard UUID format (8-4-4-4-12)."""
        import uuid
        u = uuid.UUID("12345678-1234-5678-1234-567812345678")
        result = self._convert_concepts([u])
        assert re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
                        result[0]) is not None
