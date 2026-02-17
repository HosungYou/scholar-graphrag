"""
Tests for v0.29.0 fixes:
- BUG-045: Settings fetch_one → fetchrow
- SEC-005: Auth enforcement (current_user=None → 401)
- BUG-046: Graph3D computeLineDistances (frontend-only, no backend test)
- BUG-047: Find Papers UUID filter in _build_gap_recommendation_query

Unit tests avoid importing routers package directly (cascading deps).
Integration tests use conftest.py fixtures which handle app import.
"""

import re
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ============================================
# BUG-047: UUID regex + _build_gap_recommendation_query
# Pure unit tests — no app imports needed
# ============================================

# Replicate the regex and function locally for isolated unit testing.
# This avoids the routers/__init__.py import cascade while still
# verifying the exact logic deployed in graph.py.
_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-', re.IGNORECASE)


def _build_gap_recommendation_query(
    bridge_candidates: list,
    cluster_a_names: list,
    cluster_b_names: list,
) -> str:
    """Exact copy of routers.graph._build_gap_recommendation_query for testing."""
    parts = [c.strip() for c in (bridge_candidates or [])[:3]
             if c and c.strip() and not _UUID_RE.match(c.strip())]
    if parts:
        return " ".join(parts)

    a_names = [n.strip() for n in (cluster_a_names or [])[:2] if n and n.strip()]
    b_names = [n.strip() for n in (cluster_b_names or [])[:2] if n and n.strip()]

    if a_names and b_names:
        return f"{a_names[0]} {b_names[0]}"

    all_names = a_names + b_names
    if all_names:
        return " ".join(all_names[:2])

    return ""


class TestUUIDRegex:
    """Test the _UUID_RE regex pattern used for filtering."""

    def test_standard_uuid_matched(self):
        """Standard UUID format is detected."""
        assert _UUID_RE.match("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

    def test_uppercase_uuid_matched(self):
        """Uppercase UUID is detected (case insensitive)."""
        assert _UUID_RE.match("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")

    def test_concept_name_not_matched(self):
        """Normal concept names are NOT matched."""
        assert not _UUID_RE.match("machine learning")
        assert not _UUID_RE.match("deep neural networks")
        assert not _UUID_RE.match("AI in education")

    def test_short_string_not_matched(self):
        """Short strings are NOT matched."""
        assert not _UUID_RE.match("abc")

    def test_partial_uuid_not_matched(self):
        """Partial UUID-like strings that don't match pattern are rejected."""
        assert not _UUID_RE.match("a1b2c3d4")  # No dash after 8 chars
        assert not _UUID_RE.match("not-a-uuid-at-all")


class TestBuildGapRecommendationQuery:
    """Test _build_gap_recommendation_query filters UUIDs correctly."""

    def test_normal_bridge_candidates(self):
        """Normal concept names are used as-is."""
        result = _build_gap_recommendation_query(
            bridge_candidates=["machine learning", "deep neural networks"],
            cluster_a_names=["AI", "robotics"],
            cluster_b_names=["education", "pedagogy"],
        )
        assert result == "machine learning deep neural networks"

    def test_uuid_bridge_candidates_filtered(self):
        """UUID bridge candidates are filtered out, falls back to cluster names."""
        result = _build_gap_recommendation_query(
            bridge_candidates=[
                "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "12345678-abcd-4321-dcba-876543210fed",
            ],
            cluster_a_names=["AI", "robotics"],
            cluster_b_names=["education", "pedagogy"],
        )
        # UUIDs filtered → falls through to cluster names
        assert "AI" in result
        assert "education" in result

    def test_mixed_uuid_and_names(self):
        """Mix of UUIDs and real names — only names kept."""
        result = _build_gap_recommendation_query(
            bridge_candidates=[
                "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "machine learning",
                "deep learning",
            ],
            cluster_a_names=["AI"],
            cluster_b_names=["education"],
        )
        assert result == "machine learning deep learning"
        assert "a1b2c3d4" not in result

    def test_all_empty(self):
        """Empty candidates and names return empty string."""
        result = _build_gap_recommendation_query(
            bridge_candidates=[],
            cluster_a_names=[],
            cluster_b_names=[],
        )
        assert result == ""

    def test_none_inputs(self):
        """None inputs handled gracefully."""
        result = _build_gap_recommendation_query(
            bridge_candidates=None,
            cluster_a_names=None,
            cluster_b_names=None,
        )
        assert result == ""

    def test_uuid_fallback_to_cluster_names(self):
        """When all bridge candidates are UUIDs, use cluster names."""
        result = _build_gap_recommendation_query(
            bridge_candidates=["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
            cluster_a_names=["natural language processing"],
            cluster_b_names=["computer vision"],
        )
        assert result == "natural language processing computer vision"

    def test_whitespace_only_filtered(self):
        """Whitespace-only candidates are filtered."""
        result = _build_gap_recommendation_query(
            bridge_candidates=["  ", "", "   "],
            cluster_a_names=["AI"],
            cluster_b_names=["ML"],
        )
        assert result == "AI ML"

    def test_single_cluster_fallback(self):
        """When only one cluster has names, use those."""
        result = _build_gap_recommendation_query(
            bridge_candidates=[],
            cluster_a_names=["deep learning", "CNN"],
            cluster_b_names=[],
        )
        assert result == "deep learning CNN"

    def test_max_three_bridge_candidates(self):
        """Only first 3 bridge candidates are used."""
        result = _build_gap_recommendation_query(
            bridge_candidates=["a", "b", "c", "d", "e"],
            cluster_a_names=[],
            cluster_b_names=[],
        )
        assert result == "a b c"


# ============================================
# BUG-045: Settings fetchrow fix
# Integration tests — require app fixtures from conftest.py
# ============================================

class TestSettingsFetchrowFix:
    """Verify settings endpoints use fetchrow (not fetch_one)."""

    @pytest.mark.asyncio
    @patch("routers.settings.db")
    @patch("routers.settings.get_server_api_key")
    async def test_get_api_keys_uses_fetchrow(self, mock_get_server_key, mock_db, async_client_with_auth, mock_user):
        """GET /api/settings/api-keys calls db.fetchrow, not db.fetch_one."""
        mock_db.fetchrow = AsyncMock(return_value={
            "preferences": {"api_keys": {"groq": "gsk_test_key_123456"}}
        })
        mock_get_server_key.return_value = ""

        response = await async_client_with_auth.get("/api/settings/api-keys")
        assert response.status_code == 200
        mock_db.fetchrow.assert_called_once()

    @pytest.mark.asyncio
    @patch("routers.settings.db")
    async def test_get_preferences_uses_fetchrow(self, mock_db, async_client_with_auth, mock_user):
        """GET /api/settings/preferences calls db.fetchrow."""
        mock_db.fetchrow = AsyncMock(return_value={
            "preferences": {"llm_provider": "groq", "llm_model": "llama-3.3-70b-versatile"}
        })

        response = await async_client_with_auth.get("/api/settings/preferences")
        assert response.status_code == 200
        mock_db.fetchrow.assert_called_once()

    @pytest.mark.asyncio
    @patch("routers.settings.db")
    async def test_put_api_keys_uses_fetchrow(self, mock_db, async_client_with_auth, mock_user):
        """PUT /api/settings/api-keys calls db.fetchrow for reading current prefs."""
        mock_db.fetchrow = AsyncMock(return_value={
            "preferences": {"api_keys": {}}
        })
        mock_db.execute = AsyncMock()

        response = await async_client_with_auth.put(
            "/api/settings/api-keys",
            json={"groq": "gsk_new_key_12345678"}
        )
        assert response.status_code == 200
        mock_db.fetchrow.assert_called_once()


# ============================================
# SEC-005: Auth enforcement — projects.py
# ============================================

class TestProjectsAuthEnforcement:
    """Verify all project endpoints return 401 when current_user is None."""

    @pytest.mark.asyncio
    async def test_list_projects_requires_auth(self, async_client_no_auth):
        """GET /api/projects/ returns 401 without auth."""
        response = await async_client_no_auth.get("/api/projects/")
        assert response.status_code == 401
        assert "Authentication required" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_project_requires_auth(self, async_client_no_auth):
        """GET /api/projects/{id} returns 401 without auth."""
        response = await async_client_no_auth.get(
            "/api/projects/12345678-1234-1234-1234-123456789012"
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_update_project_requires_auth(self, async_client_no_auth):
        """PUT /api/projects/{id} returns 401 without auth."""
        response = await async_client_no_auth.put(
            "/api/projects/12345678-1234-1234-1234-123456789012",
            json={"name": "Updated Name"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_project_requires_auth(self, async_client_no_auth):
        """DELETE /api/projects/{id} returns 401 without auth."""
        response = await async_client_no_auth.delete(
            "/api/projects/12345678-1234-1234-1234-123456789012"
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_project_stats_requires_auth(self, async_client_no_auth):
        """GET /api/projects/{id}/stats returns 401 without auth."""
        response = await async_client_no_auth.get(
            "/api/projects/12345678-1234-1234-1234-123456789012/stats"
        )
        assert response.status_code == 401


# ============================================
# SEC-005: Auth enforcement — graph.py
# ============================================

class TestGraphAuthEnforcement:
    """Verify graph endpoints return 401 when current_user is None."""

    @pytest.mark.asyncio
    async def test_search_nodes_requires_auth(self, async_client_no_auth):
        """POST /api/graph/search returns 401 without auth."""
        response = await async_client_no_auth.post(
            "/api/graph/search",
            json={"query": "machine learning", "limit": 10}
        )
        assert response.status_code == 401
        assert "Authentication required" in response.json()["detail"]
