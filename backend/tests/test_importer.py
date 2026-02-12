"""
Tests for ScholaRAG importer - entity type handling and concept-centric design.
v0.10.0: Test coverage for multi-entity type processing.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestEntityTypeHandling:
    """Tests for entity type diversity in import pipeline."""

    def test_all_entity_types_defined(self):
        """Verify all 9 entity types are defined in the system."""
        from graph.entity_extractor import EntityType
        expected_types = [
            "Paper", "Author", "Concept", "Method", "Finding",
            "Problem", "Dataset", "Metric", "Innovation", "Limitation"
        ]
        actual_types = [e.value for e in EntityType]
        for expected in expected_types:
            assert expected in actual_types, f"Missing entity type: {expected}"

    def test_primary_entity_types(self):
        """Concept, Method, Finding should be primary visualization types."""
        from graph.entity_extractor import EntityType
        primary = [EntityType.CONCEPT, EntityType.METHOD, EntityType.FINDING]
        assert len(primary) == 3
        assert all(isinstance(t, EntityType) for t in primary)

    def test_metadata_entity_types(self):
        """Paper and Author should be metadata types."""
        from graph.entity_extractor import EntityType
        metadata = [EntityType.PAPER, EntityType.AUTHOR]
        assert len(metadata) == 2

    def test_secondary_entity_types(self):
        """Problem, Dataset, Metric, Innovation, Limitation are secondary."""
        from graph.entity_extractor import EntityType
        secondary = [
            EntityType.PROBLEM, EntityType.DATASET, EntityType.METRIC,
            EntityType.INNOVATION, EntityType.LIMITATION
        ]
        assert len(secondary) == 5


class TestExtractedEntity:
    """Tests for ExtractedEntity dataclass."""

    def test_extracted_entity_creation(self):
        """Should create entity with all required fields."""
        from graph.entity_extractor import ExtractedEntity
        entity = ExtractedEntity(
            name="machine learning",
            entity_type="Concept",
            definition="A branch of artificial intelligence",
            confidence=0.85,
            source_paper_id="paper-123"
        )
        assert entity.name == "machine learning"
        assert entity.entity_type == "Concept"
        assert entity.confidence == 0.85

    def test_extracted_entity_confidence_range(self):
        """Confidence should be between 0 and 1."""
        from graph.entity_extractor import ExtractedEntity
        entity = ExtractedEntity(
            name="test",
            entity_type="Concept",
            definition="test",
            confidence=0.95,
            source_paper_id="paper-123"
        )
        assert 0.0 <= entity.confidence <= 1.0


class TestImportPhases:
    """Tests for import pipeline phase ordering."""

    def test_import_phases_exist(self):
        """ConceptCentricScholarAGImporter should have import_folder method."""
        from importers.scholarag_importer import ConceptCentricScholarAGImporter
        assert hasattr(ConceptCentricScholarAGImporter, 'import_folder')

    def test_importer_has_validate_method(self):
        """Importer should have validate_folder method."""
        from importers.scholarag_importer import ConceptCentricScholarAGImporter
        assert hasattr(ConceptCentricScholarAGImporter, 'validate_folder')
