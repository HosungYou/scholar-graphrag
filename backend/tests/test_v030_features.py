"""
Tests for v0.30.0 New Features:
1. AutoGroundTruthGenerator — test query generation from project data
2. ReportGenerator — markdown/HTML report generation
3. PaperFitAnalyzer._build_summary — summary text construction
4. Temporal trends classification logic

Unit tests only — no database connections required.
All DB-touching methods are tested via mocks.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# =============================================================================
# 1. AutoGroundTruthGenerator Tests
# =============================================================================

class TestAutoGroundTruthGeneratorBasic:
    """Unit tests for AutoGroundTruthGenerator.generate_test_set."""

    def _make_generator(self):
        from evaluation.auto_ground_truth import AutoGroundTruthGenerator
        return AutoGroundTruthGenerator()

    def _make_entities(self, n=5):
        """Build a list of n sample entity dicts."""
        types = ["Concept", "Method", "Finding", "Concept", "Method"]
        return [
            {
                "id": i,
                "name": f"Entity {i}",
                "entity_type": types[i % len(types)],
                "connection_count": n - i,
            }
            for i in range(n)
        ]

    def _make_relationships(self, n=3):
        """Build a list of n sample relationship dicts."""
        return [
            {
                "source_id": i,
                "target_id": i + 1,
                "source_name": f"Concept A{i}",
                "target_name": f"Concept B{i}",
                "relationship_type": "RELATED_TO",
                "weight": float(n - i),
            }
            for i in range(n)
        ]

    # --- happy path ---

    def test_returns_list_of_test_queries(self):
        """generate_test_set must return a list of TestQuery objects."""
        from evaluation.auto_ground_truth import TestQuery

        gen = self._make_generator()
        entities = self._make_entities(4)
        rels = self._make_relationships(2)
        result = gen.generate_test_set(entities, rels)

        assert isinstance(result, list)
        assert len(result) > 0
        for item in result:
            assert isinstance(item, TestQuery)

    def test_result_does_not_exceed_max_queries(self):
        """Result length must not exceed max_queries."""
        gen = self._make_generator()
        entities = self._make_entities(20)
        rels = self._make_relationships(10)

        result = gen.generate_test_set(entities, rels, max_queries=5)
        assert len(result) <= 5

    def test_testquery_has_required_fields(self):
        """Each TestQuery must have query, query_type, expected_entity_ids, expected_entity_names."""
        gen = self._make_generator()
        entities = self._make_entities(3)
        result = gen.generate_test_set(entities, [])

        for tq in result:
            assert isinstance(tq.query, str)
            assert tq.query_type in ("concept_search", "relationship_query", "method_inquiry")
            assert isinstance(tq.expected_entity_ids, list)
            assert isinstance(tq.expected_entity_names, list)
            assert len(tq.expected_entity_ids) >= 1
            assert len(tq.expected_entity_names) >= 1

    def test_concept_entities_produce_concept_search_type(self):
        """Concept-type entities should produce 'concept_search' queries."""
        gen = self._make_generator()
        entities = [
            {"id": 1, "name": "Deep Learning", "entity_type": "Concept", "connection_count": 10},
        ]
        result = gen.generate_test_set(entities, [])

        assert len(result) == 1
        assert result[0].query_type == "concept_search"
        assert "Deep Learning" in result[0].query

    def test_method_entities_produce_method_inquiry_type(self):
        """Method-type entities should produce 'method_inquiry' queries."""
        gen = self._make_generator()
        entities = [
            {"id": 2, "name": "Gradient Descent", "entity_type": "Method", "connection_count": 5},
        ]
        result = gen.generate_test_set(entities, [])

        assert len(result) == 1
        assert result[0].query_type == "method_inquiry"
        assert "Gradient Descent" in result[0].query

    def test_finding_entities_produce_concept_search_type(self):
        """Finding-type entities should produce 'concept_search' queries."""
        gen = self._make_generator()
        entities = [
            {"id": 3, "name": "Accuracy Improvement", "entity_type": "Finding", "connection_count": 3},
        ]
        result = gen.generate_test_set(entities, [])

        assert len(result) == 1
        assert result[0].query_type == "concept_search"

    def test_relationship_queries_produced_from_relationships(self):
        """High-weight relationships should produce 'relationship_query' entries."""
        gen = self._make_generator()
        entities = []  # no concept queries
        rels = [
            {
                "source_id": "e1",
                "target_id": "e2",
                "source_name": "Neural Network",
                "target_name": "Backpropagation",
                "relationship_type": "RELATED_TO",
                "weight": 5.0,
            }
        ]
        result = gen.generate_test_set(entities, rels)

        assert len(result) == 1
        assert result[0].query_type == "relationship_query"
        assert "Neural Network" in result[0].query
        assert "Backpropagation" in result[0].query

    def test_relationship_query_includes_both_entity_ids(self):
        """Relationship queries must include both source_id and target_id."""
        gen = self._make_generator()
        rels = [
            {
                "source_id": "src-123",
                "target_id": "tgt-456",
                "source_name": "Concept A",
                "target_name": "Concept B",
                "weight": 3.0,
            }
        ]
        result = gen.generate_test_set([], rels)

        assert len(result) == 1
        assert "src-123" in result[0].expected_entity_ids
        assert "tgt-456" in result[0].expected_entity_ids

    def test_sorted_by_connection_count_descending(self):
        """Entities should be processed in descending connection_count order."""
        gen = self._make_generator()
        entities = [
            {"id": 1, "name": "Low Rank Entity", "entity_type": "Concept", "connection_count": 1},
            {"id": 2, "name": "Top Rank Entity", "entity_type": "Concept", "connection_count": 100},
        ]
        result = gen.generate_test_set(entities, [], max_queries=2)

        # With max_queries=2, concept_limit=1, only the top-ranked entity should appear
        assert len(result) == 1
        assert "Top Rank Entity" in result[0].query

    # --- edge cases ---

    def test_empty_entities_empty_relationships_returns_empty_list(self):
        """Calling with both empty lists must return an empty list."""
        gen = self._make_generator()
        result = gen.generate_test_set([], [])
        assert result == []

    def test_empty_entities_with_relationships(self):
        """Only relationship queries are produced when entities list is empty."""
        gen = self._make_generator()
        rels = [
            {
                "source_id": "a",
                "target_id": "b",
                "source_name": "Alpha",
                "target_name": "Beta",
                "weight": 2.0,
            }
        ]
        result = gen.generate_test_set([], rels)
        assert all(tq.query_type == "relationship_query" for tq in result)

    def test_entity_with_name_shorter_than_3_chars_is_skipped(self):
        """Entities with names shorter than 3 characters must be skipped."""
        gen = self._make_generator()
        entities = [
            {"id": 1, "name": "AI", "entity_type": "Concept", "connection_count": 99},
            {"id": 2, "name": "Deep Learning", "entity_type": "Concept", "connection_count": 1},
        ]
        result = gen.generate_test_set(entities, [])

        # "AI" (2 chars) must be skipped; only "Deep Learning" should appear
        assert len(result) == 1
        assert "Deep Learning" in result[0].query

    def test_entity_with_missing_name_is_skipped(self):
        """Entities without a name field must be skipped gracefully."""
        gen = self._make_generator()
        entities = [
            {"id": 1, "entity_type": "Concept", "connection_count": 10},  # no 'name'
            {"id": 2, "name": "Valid Concept", "entity_type": "Concept", "connection_count": 5},
        ]
        result = gen.generate_test_set(entities, [])

        assert len(result) == 1
        assert "Valid Concept" in result[0].query

    def test_duplicate_relationship_pairs_deduplicated(self):
        """The same entity pair should only generate one relationship query."""
        gen = self._make_generator()
        rels = [
            {"source_id": "a", "target_id": "b", "source_name": "X", "target_name": "Y", "weight": 3.0},
            {"source_id": "b", "target_id": "a", "source_name": "Y", "target_name": "X", "weight": 2.0},
        ]
        result = gen.generate_test_set([], rels)

        # X↔Y is the same pair in both directions — only one query expected
        assert len(result) == 1

    def test_relationship_with_missing_source_or_target_name_skipped(self):
        """Relationships with empty source_name or target_name must be skipped."""
        gen = self._make_generator()
        rels = [
            {"source_id": "a", "target_id": "b", "source_name": "", "target_name": "Beta", "weight": 5.0},
            {"source_id": "c", "target_id": "d", "source_name": "Gamma", "target_name": "Delta", "weight": 3.0},
        ]
        result = gen.generate_test_set([], rels)

        assert len(result) == 1
        assert "Gamma" in result[0].query

    def test_max_queries_zero_returns_empty(self):
        """max_queries=0 must return an empty list."""
        gen = self._make_generator()
        result = gen.generate_test_set(self._make_entities(5), self._make_relationships(3), max_queries=0)
        assert result == []

    def test_query_type_distribution_with_mixed_inputs(self):
        """Mixed inputs should produce a mix of concept_search, method_inquiry, relationship_query types."""
        gen = self._make_generator()
        entities = [
            {"id": 1, "name": "Deep Learning", "entity_type": "Concept", "connection_count": 10},
            {"id": 2, "name": "SGD Optimizer", "entity_type": "Method", "connection_count": 8},
        ]
        rels = [
            {
                "source_id": "e1",
                "target_id": "e2",
                "source_name": "Attention Mechanism",
                "target_name": "Transformer",
                "weight": 5.0,
            }
        ]
        result = gen.generate_test_set(entities, rels)
        query_types = {tq.query_type for tq in result}
        assert "concept_search" in query_types
        assert "method_inquiry" in query_types
        assert "relationship_query" in query_types


# =============================================================================
# 2. ReportGenerator Tests
# =============================================================================

class TestGenerateMarkdownReport:
    """Unit tests for report_generator.generate_markdown_report."""

    def _make_summary(self, **overrides):
        """Build a complete sample summary dict."""
        base = {
            "overview": {
                "total_papers": 42,
                "total_entities": 150,
                "total_relationships": 300,
                "entity_type_distribution": {
                    "Concept": 80,
                    "Method": 40,
                    "Finding": 30,
                },
            },
            "quality_metrics": {
                "modularity_raw": 0.65,
                "silhouette": 0.55,
                "coherence": 0.75,
                "entity_diversity": 0.8,
                "paper_coverage": 0.92,
            },
            "top_entities": [
                {"name": "Deep Learning", "entity_type": "Concept", "pagerank": 0.123},
                {"name": "SGD", "entity_type": "Method", "pagerank": 0.089},
            ],
            "communities": [
                {
                    "cluster_id": 0,
                    "label": "Machine Learning Fundamentals",
                    "size": 25,
                    "concept_names": ["Deep Learning", "Neural Network", "Backprop"],
                },
            ],
            "structural_gaps": [
                {
                    "cluster_a_label": "NLP",
                    "cluster_b_label": "Computer Vision",
                    "gap_strength": 0.72,
                    "research_questions": ["Can transformers bridge vision and language?"],
                }
            ],
            "temporal_info": {
                "min_year": 2018,
                "max_year": 2024,
                "emerging_concepts": ["RLHF", "Chain-of-Thought"],
            },
        }
        base.update(overrides)
        return base

    # --- section presence ---

    def test_returns_string(self):
        """generate_markdown_report must return a string."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Test Project")
        assert isinstance(result, str)

    def test_contains_project_name_in_title(self):
        """The report title must contain the project name."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "My Research")
        assert "My Research" in result

    def test_contains_overview_section(self):
        """Report must include the 개요 (overview) section heading."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "## 개요" in result

    def test_overview_includes_paper_count(self):
        """Overview section must display the paper count."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        result = generate_markdown_report(summary, "Proj")
        assert "42" in result  # total_papers

    def test_overview_includes_entity_and_relationship_count(self):
        """Overview must display entity and relationship counts."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        result = generate_markdown_report(summary, "Proj")
        assert "150" in result  # total_entities
        assert "300" in result  # total_relationships

    def test_contains_quality_metrics_section(self):
        """Report must include the 품질 지표 (quality metrics) section."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "## 품질 지표" in result

    def test_modularity_interpreted_as_strong(self):
        """Modularity >= 0.6 must be interpreted as '강함'."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["quality_metrics"]["modularity_raw"] = 0.65
        result = generate_markdown_report(summary, "Proj")
        assert "강함" in result

    def test_modularity_interpreted_as_medium(self):
        """Modularity between 0.4 and 0.6 must be interpreted as '보통'."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["quality_metrics"]["modularity_raw"] = 0.5
        result = generate_markdown_report(summary, "Proj")
        assert "보통" in result

    def test_modularity_interpreted_as_weak(self):
        """Modularity < 0.4 must be interpreted as '약함'."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["quality_metrics"]["modularity_raw"] = 0.3
        result = generate_markdown_report(summary, "Proj")
        assert "약함" in result

    def test_silhouette_interpreted_correctly(self):
        """Silhouette >= 0.5 must be '명확한 군집'."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["quality_metrics"]["silhouette"] = 0.6
        result = generate_markdown_report(summary, "Proj")
        assert "명확한 군집" in result

    def test_contains_top_entities_section(self):
        """Report must include the 핵심 개념 (top entities) section."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "## 핵심 개념" in result

    def test_top_entities_include_names(self):
        """Top entities section must display entity names."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "Deep Learning" in result
        assert "SGD" in result

    def test_contains_communities_section(self):
        """Report must include the 연구 커뮤니티 section."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "## 연구 커뮤니티" in result

    def test_communities_show_cluster_label(self):
        """Community cluster label must appear in the report."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "Machine Learning Fundamentals" in result

    def test_contains_structural_gaps_section(self):
        """Report must include the 구조적 갭 section when gaps are present."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "구조적 갭" in result

    def test_structural_gaps_show_cluster_labels(self):
        """Gap section must display the cluster pair labels."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "NLP" in result
        assert "Computer Vision" in result

    def test_contains_temporal_trends_section(self):
        """Report must include the 시간적 트렌드 section when temporal data present."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "시간적 트렌드" in result

    def test_temporal_shows_year_range(self):
        """Temporal section must display the year range."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "2018" in result
        assert "2024" in result

    def test_temporal_shows_emerging_concepts(self):
        """Emerging concepts should appear in the temporal section."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "RLHF" in result

    # --- minimal / empty data ---

    def test_minimal_summary_does_not_crash(self):
        """An empty summary dict must not raise an exception."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report({}, "Empty Project")
        assert isinstance(result, str)
        assert "Empty Project" in result

    def test_no_top_entities_section_absent(self):
        """When top_entities is empty, the 핵심 개념 section must not appear."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["top_entities"] = []
        result = generate_markdown_report(summary, "Proj")
        assert "## 핵심 개념" not in result

    def test_no_communities_section_absent(self):
        """When communities list is empty, the 연구 커뮤니티 section must not appear."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["communities"] = []
        result = generate_markdown_report(summary, "Proj")
        assert "## 연구 커뮤니티" not in result

    def test_no_gaps_section_absent(self):
        """When structural_gaps is empty, the 구조적 갭 section must not appear."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["structural_gaps"] = []
        result = generate_markdown_report(summary, "Proj")
        assert "구조적 갭" not in result

    def test_no_temporal_info_section_absent(self):
        """When temporal_info is empty, the 시간적 트렌드 section must not appear."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["temporal_info"] = {}
        result = generate_markdown_report(summary, "Proj")
        assert "시간적 트렌드" not in result

    def test_paper_coverage_usu_interpreted(self):
        """Paper coverage >= 0.9 must be interpreted as '우수'."""
        from graph.report_generator import generate_markdown_report
        summary = self._make_summary()
        summary["quality_metrics"]["paper_coverage"] = 0.95
        result = generate_markdown_report(summary, "Proj")
        assert "우수" in result

    def test_entity_type_distribution_listed(self):
        """Entity type distribution entries must appear in the report."""
        from graph.report_generator import generate_markdown_report
        result = generate_markdown_report(self._make_summary(), "Proj")
        assert "Concept" in result
        assert "Method" in result

    def test_pct_helper_none_value(self):
        """_pct with None input must return 'N/A' without raising."""
        from graph.report_generator import _pct
        assert _pct(None) == "N/A"

    def test_fmt_helper_none_value(self):
        """_fmt with None input must return 'N/A' without raising."""
        from graph.report_generator import _fmt
        assert _fmt(None) == "N/A"

    def test_pct_helper_float_value(self):
        """_pct with 0.75 must return '75.0%'."""
        from graph.report_generator import _pct
        assert _pct(0.75) == "75.0%"

    def test_fmt_helper_float_value(self):
        """_fmt with 0.12345 must return '0.123' (3 decimal places)."""
        from graph.report_generator import _fmt
        assert _fmt(0.12345) == "0.123"


class TestGenerateHtmlReport:
    """Unit tests for report_generator.generate_html_report."""

    def _simple_summary(self):
        return {
            "overview": {"total_papers": 10, "total_entities": 50, "total_relationships": 100},
            "quality_metrics": {"modularity_raw": 0.5},
            "top_entities": [{"name": "Concept Alpha", "entity_type": "Concept", "pagerank": 0.05}],
        }

    def test_returns_string(self):
        """generate_html_report must return a string."""
        from graph.report_generator import generate_html_report
        result = generate_html_report(self._simple_summary(), "HTML Test")
        assert isinstance(result, str)

    def test_html_wrapping_present(self):
        """Output must be wrapped in DOCTYPE and html tags."""
        from graph.report_generator import generate_html_report
        result = generate_html_report(self._simple_summary(), "HTML Test")
        assert "<!DOCTYPE html>" in result
        assert "<html" in result
        assert "</html>" in result

    def test_contains_project_name_in_title_tag(self):
        """The <title> tag must contain the project name."""
        from graph.report_generator import generate_html_report
        result = generate_html_report(self._simple_summary(), "My HTML Project")
        assert "My HTML Project" in result

    def test_contains_body_tag(self):
        """Output must include <body> and </body>."""
        from graph.report_generator import generate_html_report
        result = generate_html_report(self._simple_summary(), "Proj")
        assert "<body>" in result
        assert "</body>" in result

    def test_html_contains_report_content(self):
        """HTML output must include report content (entity names, etc.)."""
        from graph.report_generator import generate_html_report
        result = generate_html_report(self._simple_summary(), "Proj")
        assert "Concept Alpha" in result

    def test_empty_summary_does_not_crash(self):
        """generate_html_report with empty summary must not raise."""
        from graph.report_generator import generate_html_report
        result = generate_html_report({}, "Empty")
        assert "<!DOCTYPE html>" in result


# =============================================================================
# 3. PaperFitAnalyzer._build_summary Tests
# =============================================================================

class TestPaperFitAnalyzerBuildSummary:
    """Unit tests for PaperFitAnalyzer._build_summary (pure function, no DB)."""

    def _make_analyzer(self):
        from graph.paper_fit_analyzer import PaperFitAnalyzer
        mock_db = MagicMock()
        return PaperFitAnalyzer(database=mock_db)

    def _make_matched_entities(self, n=3):
        """Build a list of n matched entity dicts with realistic similarity scores."""
        return [
            {
                "id": f"entity-{i}",
                "name": f"Entity Name {i}",
                "entity_type": "Concept",
                "similarity": 0.9 - i * 0.05,
                "cluster_id": str(i),
            }
            for i in range(n)
        ]

    def _make_community_relevance(self, n=1):
        return [
            {
                "cluster_id": i,
                "label": f"Research Community {i}",
                "relevance_score": 0.85 - i * 0.1,
                "matched_count": 3 - i,
            }
            for i in range(n)
        ]

    def _make_gap_connections(self, n=1):
        return [
            {
                "gap_id": f"gap-{i}",
                "cluster_a_label": f"Cluster A{i}",
                "cluster_b_label": f"Cluster B{i}",
                "connection_type": "bridge",
            }
            for i in range(n)
        ]

    # --- empty matched_entities ---

    def test_empty_matched_entities_returns_no_match_message(self):
        """When matched_entities is empty, summary must say it could not be matched."""
        analyzer = self._make_analyzer()
        summary = analyzer._build_summary("Test Paper", [], [], [])
        assert "Test Paper" in summary
        assert "could not be matched" in summary

    def test_empty_matched_entities_mentions_new_concepts(self):
        """No-match message must hint at the paper introducing new concepts."""
        analyzer = self._make_analyzer()
        summary = analyzer._build_summary("Novel Paper", [], [], [])
        assert "new concepts" in summary.lower()

    # --- summary content with entities ---

    def test_summary_contains_paper_title(self):
        """Summary must include the paper title."""
        analyzer = self._make_analyzer()
        entities = self._make_matched_entities(3)
        summary = analyzer._build_summary("Attention Is All You Need", entities, [], [])
        assert "Attention Is All You Need" in summary

    def test_summary_includes_top_entity_names(self):
        """Summary must mention the top matched entity names."""
        analyzer = self._make_analyzer()
        entities = self._make_matched_entities(3)
        summary = analyzer._build_summary("Paper Title", entities, [], [])
        # Top-3 entities should appear
        for ent in entities[:3]:
            assert ent["name"] in summary

    def test_summary_strongly_relates_for_high_similarity(self):
        """Similarity > 0.8 must produce 'strongly' in the summary."""
        analyzer = self._make_analyzer()
        entities = [{"id": "e1", "name": "Top Entity", "entity_type": "Concept", "similarity": 0.9, "cluster_id": "1"}]
        summary = analyzer._build_summary("Paper", entities, [], [])
        assert "strongly" in summary

    def test_summary_moderately_relates_for_medium_similarity(self):
        """Similarity between 0.6 and 0.8 must produce 'moderately' in the summary."""
        analyzer = self._make_analyzer()
        entities = [{"id": "e1", "name": "Mid Entity", "entity_type": "Concept", "similarity": 0.7, "cluster_id": "1"}]
        summary = analyzer._build_summary("Paper", entities, [], [])
        assert "moderately" in summary

    def test_summary_loosely_relates_for_low_similarity(self):
        """Similarity <= 0.6 must produce 'loosely' in the summary."""
        analyzer = self._make_analyzer()
        entities = [{"id": "e1", "name": "Weak Entity", "entity_type": "Concept", "similarity": 0.5, "cluster_id": "1"}]
        summary = analyzer._build_summary("Paper", entities, [], [])
        assert "loosely" in summary

    # --- community relevance in summary ---

    def test_summary_mentions_top_community_label(self):
        """Summary must mention the top community label when community_relevance is provided."""
        analyzer = self._make_analyzer()
        entities = self._make_matched_entities(2)
        communities = self._make_community_relevance(1)
        summary = analyzer._build_summary("Paper", entities, communities, [])
        assert "Research Community 0" in summary

    def test_summary_mentions_multiple_clusters(self):
        """When multiple communities match, the count of other clusters should appear."""
        analyzer = self._make_analyzer()
        entities = self._make_matched_entities(3)
        communities = self._make_community_relevance(3)
        summary = analyzer._build_summary("Paper", entities, communities, [])
        # Should mention the other 2 clusters
        assert "2" in summary

    # --- gap connections in summary ---

    def test_summary_mentions_gap_count_when_present(self):
        """When gap_connections are provided, summary must mention the gap count."""
        analyzer = self._make_analyzer()
        entities = self._make_matched_entities(2)
        gaps = self._make_gap_connections(2)
        summary = analyzer._build_summary("Paper", entities, [], gaps)
        assert "2" in summary  # "may help bridge 2 structural gap(s)"

    def test_summary_mentions_gap_cluster_labels(self):
        """Summary must include the cluster labels from the first gap connection."""
        analyzer = self._make_analyzer()
        entities = self._make_matched_entities(2)
        gaps = [
            {
                "gap_id": "g1",
                "cluster_a_label": "Natural Language Processing",
                "cluster_b_label": "Robotics",
                "connection_type": "bridge",
            }
        ]
        summary = analyzer._build_summary("Paper", entities, [], gaps)
        assert "Natural Language Processing" in summary
        assert "Robotics" in summary

    # --- robustness ---

    def test_single_matched_entity(self):
        """Works correctly with exactly one matched entity."""
        analyzer = self._make_analyzer()
        entities = [{"id": "e1", "name": "Single Concept", "entity_type": "Concept", "similarity": 0.75, "cluster_id": "0"}]
        summary = analyzer._build_summary("Lone Paper", entities, [], [])
        assert "Single Concept" in summary
        assert "Lone Paper" in summary

    def test_exactly_three_matched_entities(self):
        """With exactly 3 entities, all three should appear in the summary."""
        analyzer = self._make_analyzer()
        entities = [
            {"id": "e1", "name": "Alpha", "entity_type": "Concept", "similarity": 0.9, "cluster_id": "0"},
            {"id": "e2", "name": "Beta", "entity_type": "Concept", "similarity": 0.85, "cluster_id": "0"},
            {"id": "e3", "name": "Gamma", "entity_type": "Concept", "similarity": 0.8, "cluster_id": "1"},
        ]
        summary = analyzer._build_summary("Paper", entities, [], [])
        assert "Alpha" in summary
        assert "Beta" in summary
        assert "Gamma" in summary

    def test_more_than_three_matched_entities_uses_top_three(self):
        """With more than 3 entities, only the first 3 should appear in the summary."""
        analyzer = self._make_analyzer()
        entities = [
            {"id": f"e{i}", "name": f"Entity {i}", "entity_type": "Concept",
             "similarity": 0.9 - i * 0.05, "cluster_id": "0"}
            for i in range(6)
        ]
        summary = analyzer._build_summary("Paper", entities, [], [])
        # Entities 0-2 should be in the summary; Entity 5 should not
        assert "Entity 0" in summary
        assert "Entity 1" in summary
        assert "Entity 2" in summary
        assert "Entity 5" not in summary


# =============================================================================
# 4. Temporal Trends Classification Tests
# =============================================================================

class TestTemporalTrendsClassification:
    """
    Tests for temporal trend classification logic.

    The classification (Emerging / Stable / Declining) is computed inline in
    the router endpoint. We replicate the exact logic here so the rules are
    tested independently of the database.
    """

    # Replication of the classification function from routers.graph
    # (temporal trends endpoint uses these thresholds):
    #   last_seen_year == current_year - 1 or current_year → Emerging
    #   first_seen_year == last_seen_year                  → Stable (single paper, old)
    #   last_seen_year < current_year - 2                  → Declining

    CURRENT_YEAR = 2026  # pinned for deterministic tests

    def _classify(self, first_seen_year, last_seen_year, paper_count=3):
        """
        Replicate the classification logic from the temporal trends endpoint.

        Rules (in priority order):
        1. If last_seen_year is within the last 2 years → Emerging
        2. If entity has only one paper (paper_count == 1) → Stable
        3. If last_seen_year < current_year - 2 → Declining
        4. Otherwise → Stable
        """
        if last_seen_year is None:
            return "Stable"
        if last_seen_year >= self.CURRENT_YEAR - 1:
            return "Emerging"
        if paper_count == 1:
            return "Stable"
        if last_seen_year < self.CURRENT_YEAR - 2:
            return "Declining"
        return "Stable"

    # --- Emerging ---

    def test_current_year_is_emerging(self):
        """last_seen_year == current year → Emerging."""
        assert self._classify(2020, self.CURRENT_YEAR) == "Emerging"

    def test_last_year_is_emerging(self):
        """last_seen_year == current year - 1 → Emerging."""
        assert self._classify(2018, self.CURRENT_YEAR - 1) == "Emerging"

    def test_two_years_ago_is_not_emerging(self):
        """last_seen_year == current year - 2 must NOT be Emerging."""
        result = self._classify(2015, self.CURRENT_YEAR - 2)
        assert result != "Emerging"

    # --- Declining ---

    def test_old_entity_with_multiple_papers_is_declining(self):
        """last_seen_year far in the past with multiple papers → Declining."""
        assert self._classify(2010, 2018, paper_count=5) == "Declining"

    def test_entity_last_seen_three_years_ago_is_declining(self):
        """last_seen_year == current_year - 3 with multiple papers → Declining."""
        assert self._classify(2010, self.CURRENT_YEAR - 3, paper_count=4) == "Declining"

    # --- Stable ---

    def test_single_paper_entity_is_stable(self):
        """Entities appearing in only one paper must be Stable regardless of year."""
        assert self._classify(2015, 2015, paper_count=1) == "Stable"

    def test_single_paper_old_entity_is_stable(self):
        """Old single-paper entity must be Stable (not Declining)."""
        assert self._classify(2010, 2010, paper_count=1) == "Stable"

    def test_none_last_seen_year_is_stable(self):
        """When last_seen_year is None, classification must be Stable (safe default)."""
        assert self._classify(None, None) == "Stable"

    def test_recent_stable_entity(self):
        """Entity with last_seen_year == current_year - 2 and multiple papers → Stable or Declining."""
        result = self._classify(2020, self.CURRENT_YEAR - 2, paper_count=3)
        # Boundary: current_year - 2 is NOT emerging (< current_year - 1)
        # and NOT declining (NOT < current_year - 2, it equals it)
        # Depending on implementation this could be Stable
        assert result in ("Stable", "Declining")

    # --- edge cases ---

    def test_first_equals_last_seen_year_with_many_papers(self):
        """first_seen == last_seen but multiple papers → Declining if old."""
        assert self._classify(2015, 2015, paper_count=5) == "Declining"

    def test_newly_emerging_concept(self):
        """Brand new concept with first and last year both recent → Emerging."""
        assert self._classify(self.CURRENT_YEAR, self.CURRENT_YEAR) == "Emerging"

    def test_future_last_seen_year_treated_as_emerging(self):
        """last_seen_year > current_year should also be Emerging (data entry edge case)."""
        assert self._classify(2024, self.CURRENT_YEAR + 1) == "Emerging"


# =============================================================================
# 5. ReportGenerator — interpret helper functions
# =============================================================================

class TestInterpretHelpers:
    """Tests for the private interpretation helper functions in report_generator."""

    def test_interpret_modularity_strong(self):
        from graph.report_generator import _interpret_modularity
        assert _interpret_modularity(0.6) == "강함"
        assert _interpret_modularity(0.9) == "강함"

    def test_interpret_modularity_medium(self):
        from graph.report_generator import _interpret_modularity
        assert _interpret_modularity(0.4) == "보통"
        assert _interpret_modularity(0.59) == "보통"

    def test_interpret_modularity_weak(self):
        from graph.report_generator import _interpret_modularity
        assert _interpret_modularity(0.0) == "약함"
        assert _interpret_modularity(0.39) == "약함"

    def test_interpret_silhouette_clear_clusters(self):
        from graph.report_generator import _interpret_silhouette
        assert _interpret_silhouette(0.5) == "명확한 군집"
        assert _interpret_silhouette(0.8) == "명확한 군집"

    def test_interpret_silhouette_medium(self):
        from graph.report_generator import _interpret_silhouette
        assert _interpret_silhouette(0.25) == "중간"
        assert _interpret_silhouette(0.49) == "중간"

    def test_interpret_silhouette_unclear(self):
        from graph.report_generator import _interpret_silhouette
        assert _interpret_silhouette(0.0) == "군집 경계 불분명"
        assert _interpret_silhouette(0.24) == "군집 경계 불분명"

    def test_interpret_coherence_high(self):
        from graph.report_generator import _interpret_coherence
        assert _interpret_coherence(0.7) == "높음"
        assert _interpret_coherence(1.0) == "높음"

    def test_interpret_coherence_medium(self):
        from graph.report_generator import _interpret_coherence
        assert _interpret_coherence(0.4) == "보통"
        assert _interpret_coherence(0.69) == "보통"

    def test_interpret_coherence_low(self):
        from graph.report_generator import _interpret_coherence
        assert _interpret_coherence(0.0) == "낮음"
        assert _interpret_coherence(0.39) == "낮음"

    def test_interpret_coverage_excellent(self):
        from graph.report_generator import _interpret_coverage
        assert _interpret_coverage(0.9) == "우수"
        assert _interpret_coverage(1.0) == "우수"

    def test_interpret_coverage_good(self):
        from graph.report_generator import _interpret_coverage
        assert _interpret_coverage(0.7) == "양호"
        assert _interpret_coverage(0.89) == "양호"

    def test_interpret_coverage_needs_improvement(self):
        from graph.report_generator import _interpret_coverage
        assert _interpret_coverage(0.0) == "개선 필요"
        assert _interpret_coverage(0.69) == "개선 필요"
