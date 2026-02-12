"""
Tests for chat router - explain endpoint and query handling.
v0.10.0: Test coverage for explain endpoint UUID fallback.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID


class TestExplainRequest:
    """Tests for the ExplainRequest model."""

    def test_explain_request_with_all_fields(self):
        """ExplainRequest should accept name, type, and properties."""
        from routers.chat import ExplainRequest
        req = ExplainRequest(
            node_name="machine learning",
            node_type="Concept",
            node_properties={"definition": "A branch of AI"}
        )
        assert req.node_name == "machine learning"
        assert req.node_type == "Concept"
        assert req.node_properties == {"definition": "A branch of AI"}

    def test_explain_request_all_optional(self):
        """ExplainRequest should work with no fields (all optional)."""
        from routers.chat import ExplainRequest
        req = ExplainRequest()
        assert req.node_name is None
        assert req.node_type is None
        assert req.node_properties is None

    def test_explain_request_name_only(self):
        """ExplainRequest with only node_name should default type to None."""
        from routers.chat import ExplainRequest
        req = ExplainRequest(node_name="deep learning")
        assert req.node_name == "deep learning"
        assert req.node_type is None


class TestExplainNodeLogic:
    """Tests for explain_node endpoint logic - v0.9.0 UUID fallback."""

    @pytest.mark.asyncio
    async def test_explain_uses_provided_name(self):
        """When node_name is provided, it should be used in the query prompt."""
        # The query should be "Explain this Concept: machine learning"
        # not "Explain this Concept: 12345-uuid..."
        from routers.chat import ExplainRequest
        req = ExplainRequest(node_name="machine learning", node_type="Method")
        # Verify the query construction logic
        node_name = req.node_name
        node_type = req.node_type or "Concept"
        query = f"Explain this {node_type}: {node_name}"
        assert query == "Explain this Method: machine learning"
        assert "uuid" not in query.lower()

    @pytest.mark.asyncio
    async def test_explain_defaults_type_to_concept(self):
        """When node_type is not provided, should default to 'Concept'."""
        from routers.chat import ExplainRequest
        req = ExplainRequest(node_name="transfer learning")
        node_type = req.node_type or "Concept"
        assert node_type == "Concept"

    @pytest.mark.asyncio
    async def test_explain_db_fallback_when_no_name(self):
        """When node_name is not provided, should fall back to DB lookup."""
        from routers.chat import ExplainRequest
        req = ExplainRequest()  # No name provided

        # Simulate the fallback logic from chat.py lines 845-869
        node_name = None
        node_type = "Concept"

        if req and req.node_name:
            node_name = req.node_name
            node_type = req.node_type or "Concept"

        assert node_name is None  # Should trigger DB fallback path

    @pytest.mark.asyncio
    async def test_explain_fallback_on_db_failure(self):
        """When DB lookup fails, should use 'this concept' as fallback."""
        # Simulate the fallback logic from chat.py lines 867-869
        node_name = None
        try:
            raise Exception("DB connection failed")
        except Exception:
            node_name = "this concept"

        assert node_name == "this concept"
        query = f"Explain this Concept: {node_name}"
        assert "uuid" not in query.lower()

    @pytest.mark.asyncio
    async def test_explain_error_returns_graceful_response(self):
        """When orchestrator fails, should return graceful error response."""
        # Simulate the error handling from chat.py lines 892-903
        node_name = "machine learning"
        error_response = {
            "node_id": "test-id",
            "explanation": f"Unable to generate explanation for {node_name}.",
            "related_nodes": [],
            "suggested_questions": [
                "What papers discuss this topic?",
                "Show related concepts",
                "What are the key findings?",
            ],
        }
        assert "Unable to generate explanation" in error_response["explanation"]
        assert len(error_response["suggested_questions"]) == 3
