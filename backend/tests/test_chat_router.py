"""
Tests for chat router - explain endpoint and query handling.
v0.10.0: Test coverage for explain endpoint UUID fallback.
"""



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
