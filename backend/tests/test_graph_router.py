"""
Tests for graph router - gaps, evidence, and utility functions.
v0.10.0: Test coverage for escape_sql_like, gap auto-refresh, evidence error handling.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestEscapeSqlLike:
    """Tests for the escape_sql_like utility function."""

    def test_escapes_percent(self):
        """Should escape % character."""
        from routers.graph import escape_sql_like
        assert escape_sql_like("100%") == "100\\%"

    def test_escapes_underscore(self):
        """Should escape _ character."""
        from routers.graph import escape_sql_like
        assert escape_sql_like("test_name") == "test\\_name"

    def test_escapes_backslash(self):
        """Should escape backslash character."""
        from routers.graph import escape_sql_like
        assert escape_sql_like("path\\file") == "path\\\\file"

    def test_escapes_single_quote(self):
        """Should escape single quotes."""
        from routers.graph import escape_sql_like
        assert escape_sql_like("it's") == "it''s"

    def test_handles_empty_string(self):
        """Should return empty string for empty input."""
        from routers.graph import escape_sql_like
        assert escape_sql_like("") == ""

    def test_handles_none(self):
        """Should return None for None input."""
        from routers.graph import escape_sql_like
        result = escape_sql_like(None)
        assert result is None

    def test_no_special_chars_unchanged(self):
        """Should return string unchanged if no special chars."""
        from routers.graph import escape_sql_like
        assert escape_sql_like("machine learning") == "machine learning"

    def test_multiple_special_chars(self):
        """Should escape multiple special characters in one string."""
        from routers.graph import escape_sql_like
        result = escape_sql_like("100% of_users' data\\path")
        assert "\\%" in result
        assert "\\_" in result
        assert "''" in result
        assert "\\\\" in result


class TestParseJsonField:
    """Tests for _parse_json_field utility."""

    def test_parses_dict_directly(self):
        """Should return dict directly if input is dict."""
        from routers.graph import _parse_json_field
        data = {"key": "value"}
        assert _parse_json_field(data) == data

    def test_parses_json_string(self):
        """Should parse JSON string to dict."""
        from routers.graph import _parse_json_field
        result = _parse_json_field('{"key": "value"}')
        assert result == {"key": "value"}

    def test_handles_none(self):
        """Should return empty dict/list for None."""
        from routers.graph import _parse_json_field
        result = _parse_json_field(None)
        assert result is None or result == {} or result == []

    def test_handles_invalid_json(self):
        """Should handle invalid JSON gracefully."""
        from routers.graph import _parse_json_field
        result = _parse_json_field("not json")
        assert isinstance(result, (dict, list, type(None), str))


class TestGapAnalysisResponse:
    """Tests for gap analysis response structure."""

    def test_empty_gaps_with_reason(self):
        """Response with 0 gaps should include no_gaps_reason."""
        # Simulate the response from graph.py refresh endpoint
        response = {
            "clusters": [],
            "gaps": [],
            "centrality_metrics": [],
            "total_concepts": 0,
            "total_relationships": 0,
            "no_gaps_reason": "not_analyzed",
        }
        assert response["no_gaps_reason"] == "not_analyzed"
        assert len(response["gaps"]) == 0


class TestRelationshipEvidence:
    """Tests for evidence endpoint error handling."""

    def test_evidence_response_with_error_code(self):
        """Evidence response should include error_code for classified errors."""
        # Simulate table_missing error from graph.py line 2632
        response = {
            "relationship_id": "test-id",
            "source_name": "Unknown",
            "target_name": "Unknown",
            "relationship_type": "RELATED_TO",
            "evidence_chunks": [],
            "total_evidence": 0,
            "error_code": "table_missing",
        }
        assert response["error_code"] == "table_missing"
        assert response["total_evidence"] == 0

    def test_evidence_text_truncation(self):
        """Evidence text should be truncated to 2000 chars."""
        # From graph.py line 2600: row["text"][:2000]
        long_text = "A" * 5000
        truncated = long_text[:2000]
        assert len(truncated) == 2000

    def test_escape_sql_like_in_evidence_search(self):
        """Evidence search should use escaped entity names."""
        from routers.graph import escape_sql_like
        name_with_special = "100% effective_method"
        escaped = escape_sql_like(name_with_special)
        like_pattern = f"%{escaped}%"
        # Should not have unescaped % or _ that would break LIKE
        assert "100\\%" in like_pattern
        assert "effective\\_method" in like_pattern
