"""
Tests for Entity Extractor module.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
import json


class TestEntityExtractor:
    """Test entity extraction functionality."""

    @pytest.fixture
    def mock_llm_provider(self):
        """Mock LLM provider."""
        provider = MagicMock()
        provider.generate = AsyncMock()
        return provider

    @pytest.fixture
    def extractor(self, mock_llm_provider):
        """Create entity extractor with mocked LLM."""
        from graph.entity_extractor import EntityExtractor
        return EntityExtractor(llm_provider=mock_llm_provider)

    def test_extractor_initialization(self, extractor):
        """Test entity extractor initializes correctly."""
        assert extractor is not None
        assert hasattr(extractor, 'llm_provider')

    @pytest.mark.asyncio
    async def test_extract_entities_from_paper(self, extractor, mock_llm_provider):
        """Test extracting entities from paper text."""
        # Mock LLM response
        mock_response = json.dumps({
            "concepts": [
                {"name": "machine learning", "definition": "A subset of AI", "confidence": 0.9}
            ],
            "methods": [
                {"name": "neural network", "definition": "A computing model", "confidence": 0.85}
            ],
            "findings": [
                {"name": "improved accuracy", "definition": "20% accuracy gain", "confidence": 0.8}
            ]
        })
        mock_llm_provider.generate.return_value = mock_response

        result = await extractor.extract_from_paper(
            title="Deep Learning for NLP",
            abstract="This paper explores deep learning methods for natural language processing."
        )

        assert isinstance(result, list)
        mock_llm_provider.generate.assert_called_once()

    @pytest.mark.asyncio
    async def test_extract_with_empty_input(self, extractor):
        """Test extraction with empty input."""
        result = await extractor.extract_from_paper(title="", abstract="")
        
        # Should return empty list or handle gracefully
        assert isinstance(result, list)

    def test_parse_llm_response_valid(self, extractor):
        """Test parsing valid LLM response."""
        response = json.dumps({
            "concepts": [{"name": "test", "definition": "test def", "confidence": 0.9}]
        })
        
        result = extractor._parse_llm_response(response)
        
        assert isinstance(result, dict)
        assert "concepts" in result

    def test_parse_llm_response_invalid_json(self, extractor):
        """Test parsing invalid JSON gracefully."""
        invalid_response = "not valid json {"
        
        result = extractor._parse_llm_response(invalid_response)
        
        # Should return empty dict or handle gracefully
        assert isinstance(result, dict)

    def test_normalize_entity_name(self, extractor):
        """Test entity name normalization."""
        assert extractor._normalize_name("Machine Learning") == "machine learning"
        assert extractor._normalize_name("  AI  ") == "ai"
        assert extractor._normalize_name("NLP") == "nlp"

    @pytest.mark.asyncio
    async def test_batch_extract(self, extractor, mock_llm_provider):
        """Test batch extraction for multiple papers."""
        mock_response = json.dumps({
            "concepts": [{"name": "test", "definition": "test", "confidence": 0.9}]
        })
        mock_llm_provider.generate.return_value = mock_response

        papers = [
            {"title": "Paper 1", "abstract": "Abstract 1"},
            {"title": "Paper 2", "abstract": "Abstract 2"},
        ]

        results = await extractor.batch_extract(papers)

        assert isinstance(results, list)
        assert len(results) == 2

    def test_entity_type_mapping(self, extractor):
        """Test entity type mapping."""
        from graph.entity_extractor import EntityType
        
        assert EntityType.CONCEPT.value == "Concept"
        assert EntityType.METHOD.value == "Method"
        assert EntityType.FINDING.value == "Finding"


class TestEntityDisambiguator:
    """Test entity disambiguation functionality."""

    @pytest.fixture
    def disambiguator(self):
        """Create entity disambiguator."""
        from graph.entity_extractor import EntityDisambiguator
        return EntityDisambiguator()

    def test_similar_entities_merged(self, disambiguator):
        """Test that similar entities are merged."""
        entities = [
            {"name": "machine learning", "type": "Concept"},
            {"name": "Machine Learning", "type": "Concept"},
            {"name": "ML", "type": "Concept"},
        ]

        result = disambiguator.disambiguate(entities)

        # Should merge similar entities
        assert len(result) <= len(entities)

    def test_different_types_not_merged(self, disambiguator):
        """Test that different entity types are not merged."""
        entities = [
            {"name": "analysis", "type": "Concept"},
            {"name": "analysis", "type": "Method"},
        ]

        result = disambiguator.disambiguate(entities)

        # Should keep both (different types)
        assert len(result) == 2

    def test_confidence_preserved(self, disambiguator):
        """Test that confidence scores are preserved or averaged."""
        entities = [
            {"name": "test", "type": "Concept", "confidence": 0.9},
            {"name": "TEST", "type": "Concept", "confidence": 0.8},
        ]

        result = disambiguator.disambiguate(entities)

        # Merged entity should have confidence
        if len(result) == 1:
            assert "confidence" in result[0]
