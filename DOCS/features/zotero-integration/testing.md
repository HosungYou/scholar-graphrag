# Zotero Hybrid Import Test Suite Design
## ScholaRAG_Graph_Review Backend Testing Strategy

---

## 1. Test Structure Overview

```
backend/tests/
├── conftest.py                           # Existing pytest fixtures (extended)
├── fixtures/
│   ├── __init__.py
│   ├── zotero_fixtures.py               # Mock Zotero data
│   └── pdf_fixtures.py                  # Sample PDF data
├── unit/
│   ├── __init__.py
│   ├── test_zotero_local_client.py      # ZoteroLocalClient unit tests
│   ├── test_hybrid_importer.py          # HybridZoteroImporter phase tests
│   ├── test_merge_logic.py              # Merge algorithm tests
│   └── test_pdf_extraction.py           # PDF text extraction tests
├── integration/
│   ├── __init__.py
│   ├── test_zotero_desktop_integration.py   # Real Zotero Desktop tests
│   ├── test_end_to_end_pipeline.py          # Full pipeline tests
│   └── test_database_integration.py         # GraphStore integration
├── e2e/
│   ├── __init__.py
│   ├── test_api_endpoints.py            # API route tests
│   └── test_full_import_workflow.py     # Complete workflow tests
└── mocks/
    ├── __init__.py
    ├── mock_zotero_responses.py         # HTTP response mocks
    └── mock_pdf_files.py                # Test PDF generators
```

---

## 2. Pytest Configuration Updates

### 2.1 Extended pytest.ini

```ini
[pytest]
# Test configuration for ScholaRAG_Graph (Extended for Zotero)

# Test discovery
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

# Asyncio settings
asyncio_mode = auto

# Output settings
addopts =
    -v
    --tb=short
    --strict-markers
    --cov=routers
    --cov=agents
    --cov=importers
    --cov=integrations
    --cov-report=term-missing:skip-covered
    --cov-report=html:htmlcov
    --cov-fail-under=75

# Custom markers
markers =
    slow: marks tests as slow (deselect with '-m "not slow"')
    integration: marks tests as integration tests
    contract: marks tests as API contract tests
    requires_zotero: marks tests requiring Zotero Desktop connection
    requires_pdf: marks tests requiring PDF processing
    unit: marks tests as unit tests (fast, isolated)
    e2e: marks tests as end-to-end tests

# Logging
log_cli = true
log_cli_level = WARNING
log_file = tests.log
log_file_level = DEBUG

# Warnings
filterwarnings =
    ignore::DeprecationWarning
    ignore::PendingDeprecationWarning
    ignore:.*unclosed.*:ResourceWarning

# Environment variables for tests
env =
    TESTING=true
    DATABASE_URL=postgresql://test:test@localhost:5432/scholarag_test
```

---

## 3. Fixtures Design

### 3.1 Extended conftest.py

```python
"""
Extended pytest fixtures for Zotero Hybrid Import tests.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import MagicMock, AsyncMock, patch
from pathlib import Path
import tempfile
import json

# Import app lazily to avoid circular imports
@pytest.fixture
def app():
    """Get FastAPI app instance."""
    from main import app
    return app


@pytest_asyncio.fixture
async def async_client(app):
    """Create async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def mock_db():
    """Mock database connection."""
    db = MagicMock()
    db.is_connected = True
    db.fetch = AsyncMock(return_value=[])
    db.fetchrow = AsyncMock(return_value=None)
    db.fetchval = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value="INSERT 0 1")
    db.executemany = AsyncMock(return_value=None)
    return db


# ==================== Zotero-Specific Fixtures ====================

@pytest.fixture
def sample_zotero_collection():
    """Sample Zotero collection data."""
    return {
        "key": "ABCD1234",
        "version": 100,
        "data": {
            "name": "AI Research Collection",
            "parentCollection": False,
        },
        "meta": {
            "numItems": 15,
        }
    }


@pytest.fixture
def sample_zotero_items():
    """Sample Zotero items (papers) for testing."""
    return [
        {
            "key": "ITEM001",
            "version": 50,
            "data": {
                "itemType": "journalArticle",
                "title": "Deep Learning for NLP: A Survey",
                "abstractNote": "This paper surveys recent advances in deep learning...",
                "date": "2024-01-15",
                "DOI": "10.1234/dl-nlp-2024",
                "url": "https://example.com/paper1.pdf",
                "creators": [
                    {"creatorType": "author", "firstName": "Alice", "lastName": "Johnson"},
                    {"creatorType": "author", "firstName": "Bob", "lastName": "Smith"},
                ],
                "publicationTitle": "Journal of AI Research",
                "volume": "25",
                "issue": "3",
                "pages": "100-125",
                "tags": [{"tag": "deep learning"}, {"tag": "NLP"}],
                "collections": ["ABCD1234"],
            },
        },
        {
            "key": "ITEM002",
            "version": 52,
            "data": {
                "itemType": "conferencePaper",
                "title": "Transformer Architectures Explained",
                "abstractNote": "We explain the core concepts of transformer models...",
                "date": "2024-03-20",
                "DOI": "10.5678/transformers-2024",
                "url": "https://example.com/paper2.pdf",
                "creators": [
                    {"creatorType": "author", "firstName": "Charlie", "lastName": "Davis"},
                ],
                "publicationTitle": "NeurIPS 2024",
                "pages": "1-12",
                "tags": [{"tag": "transformers"}, {"tag": "attention"}],
                "collections": ["ABCD1234"],
            },
        },
    ]


@pytest.fixture
def sample_zotero_attachments():
    """Sample Zotero PDF attachments."""
    return [
        {
            "key": "ATTACH001",
            "version": 10,
            "data": {
                "itemType": "attachment",
                "title": "Deep Learning for NLP - Full Text PDF",
                "linkMode": "linked_file",
                "path": "/Users/test/Zotero/storage/ABC123/paper1.pdf",
                "contentType": "application/pdf",
                "parentItem": "ITEM001",
            },
        },
        {
            "key": "ATTACH002",
            "version": 12,
            "data": {
                "itemType": "attachment",
                "title": "Transformer Architectures - Supplementary.pdf",
                "linkMode": "linked_file",
                "path": "/Users/test/Zotero/storage/DEF456/paper2.pdf",
                "contentType": "application/pdf",
                "parentItem": "ITEM002",
            },
        },
    ]


@pytest.fixture
def mock_zotero_local_client():
    """Mock ZoteroLocalClient for testing without actual Zotero Desktop."""
    client = MagicMock()
    client.is_connected = AsyncMock(return_value=True)
    client.get_collections = AsyncMock(return_value=[
        {"key": "ABCD1234", "name": "AI Research Collection", "numItems": 15}
    ])
    client.get_items = AsyncMock(return_value=[])
    client.get_attachments = AsyncMock(return_value=[])
    return client


@pytest.fixture
def temp_pdf_directory():
    """Create temporary directory for test PDFs."""
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_dir = Path(tmpdir) / "test_pdfs"
        pdf_dir.mkdir(parents=True, exist_ok=True)
        yield pdf_dir


@pytest.fixture
def sample_pdf_content():
    """Sample PDF text content for testing."""
    return {
        "ITEM001": {
            "text": """
            Deep Learning for NLP: A Survey

            Abstract: This paper surveys recent advances in deep learning
            for natural language processing tasks.

            1. Introduction
            Natural language processing has been revolutionized by deep learning...

            2. Methods
            We used a transformer-based architecture with 12 layers...

            3. Results
            Our model achieved 95% accuracy on benchmark datasets...

            4. Conclusion
            Deep learning shows great promise for NLP applications.
            """,
            "metadata": {
                "title": "Deep Learning for NLP: A Survey",
                "authors": "Alice Johnson, Bob Smith",
                "year": 2024,
                "pages": 25,
            }
        },
        "ITEM002": {
            "text": """
            Transformer Architectures Explained

            Abstract: We explain the core concepts of transformer models.

            1. Background
            Transformers have become the dominant architecture...

            2. Methodology
            The self-attention mechanism computes weighted representations...

            3. Experiments
            We conducted experiments on WMT2014 translation tasks...

            4. Discussion
            Transformers outperform RNNs in many tasks.
            """,
            "metadata": {
                "title": "Transformer Architectures Explained",
                "authors": "Charlie Davis",
                "year": 2024,
                "pages": 12,
            }
        },
    }


@pytest.fixture
def mock_graph_store():
    """Mock GraphStore for testing without database."""
    store = MagicMock()
    store.create_project = AsyncMock(return_value="proj-12345")
    store.add_node = AsyncMock(return_value="node-12345")
    store.add_edge = AsyncMock(return_value="edge-12345")
    store.get_node_by_property = AsyncMock(return_value=None)
    return store


@pytest.fixture
def mock_llm_provider():
    """Mock LLM provider for entity extraction."""
    provider = MagicMock()
    provider.extract_entities = AsyncMock(return_value={
        "concepts": ["deep learning", "NLP", "transformers"],
        "methods": ["transformer architecture", "self-attention"],
        "findings": ["95% accuracy", "outperforms RNNs"],
    })
    return provider


# ==================== Hybrid Import Specific Fixtures ====================

@pytest.fixture
def hybrid_import_config():
    """Configuration for hybrid import testing."""
    return {
        "import_mode": "selective",
        "extract_concepts": True,
        "extract_methods": True,
        "extract_findings": True,
        "pdf_extraction_enabled": True,
        "merge_strategy": "prefer_pdf",  # or "prefer_zotero"
        "llm_provider": "anthropic",
        "llm_model": "claude-3-5-haiku-20241022",
    }


@pytest.fixture
def merge_test_scenarios():
    """Test scenarios for merge logic."""
    return {
        "scenario_1_identical": {
            "zotero_data": {
                "title": "Deep Learning Survey",
                "abstract": "This paper surveys...",
                "year": 2024,
            },
            "pdf_data": {
                "title": "Deep Learning Survey",
                "abstract": "This paper surveys...",
                "year": 2024,
            },
            "expected": {
                "title": "Deep Learning Survey",
                "abstract": "This paper surveys...",
                "year": 2024,
                "confidence": 1.0,
            }
        },
        "scenario_2_title_mismatch": {
            "zotero_data": {
                "title": "Deep Learning: A Survey",  # Punctuation diff
                "abstract": "This paper surveys...",
                "year": 2024,
            },
            "pdf_data": {
                "title": "Deep Learning A Survey",  # No punctuation
                "abstract": "This paper surveys...",
                "year": 2024,
            },
            "expected": {
                "title": "Deep Learning: A Survey",  # Prefer Zotero
                "abstract": "This paper surveys...",
                "year": 2024,
                "confidence": 0.95,
            }
        },
        "scenario_3_abstract_conflict": {
            "zotero_data": {
                "title": "Deep Learning Survey",
                "abstract": "Short abstract",  # Truncated in Zotero
                "year": 2024,
            },
            "pdf_data": {
                "title": "Deep Learning Survey",
                "abstract": "This is a much longer and more detailed abstract...",  # Full text
                "year": 2024,
            },
            "expected": {
                "title": "Deep Learning Survey",
                "abstract": "This is a much longer and more detailed abstract...",  # Prefer PDF
                "year": 2024,
                "confidence": 0.9,
            }
        },
    }


@pytest.fixture
def phase_test_checkpoints():
    """Expected checkpoints for each phase of hybrid import."""
    return {
        "phase_1_zotero_fetch": {
            "items_fetched": 15,
            "collections_loaded": 1,
            "duration_max_seconds": 5,
        },
        "phase_2_pdf_retrieval": {
            "pdfs_found": 12,  # 3 missing
            "pdfs_extracted": 12,
            "duration_max_seconds": 30,
        },
        "phase_3_merge": {
            "papers_merged": 12,
            "conflicts_resolved": 3,
            "duration_max_seconds": 10,
        },
        "phase_4_entity_extraction": {
            "concepts_extracted": 45,
            "methods_extracted": 20,
            "findings_extracted": 18,
            "duration_max_seconds": 120,
        },
        "phase_5_graph_building": {
            "nodes_created": 97,  # 12 papers + 45 concepts + 20 methods + 18 findings + 2 authors
            "edges_created": 156,
            "duration_max_seconds": 15,
        },
    }
```

---

## 4. Unit Tests

### 4.1 test_zotero_local_client.py

```python
"""
Unit tests for ZoteroLocalClient.

Tests the low-level Zotero Desktop API communication without mocks.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from integrations.zotero_local import ZoteroLocalClient, ZoteroConnectionError


class TestZoteroLocalClientConnection:
    """Test Zotero Desktop connection logic."""

    @pytest.mark.asyncio
    async def test_connection_success(self):
        """Test successful connection to Zotero Desktop."""
        with patch('httpx.AsyncClient.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"version": "6.0.30"}
            mock_get.return_value = mock_response

            client = ZoteroLocalClient()
            is_connected = await client.is_connected()

            assert is_connected is True
            mock_get.assert_called_once()

    @pytest.mark.asyncio
    async def test_connection_failure_timeout(self):
        """Test connection failure due to timeout."""
        with patch('httpx.AsyncClient.get', side_effect=httpx.TimeoutException):
            client = ZoteroLocalClient()
            is_connected = await client.is_connected()

            assert is_connected is False

    @pytest.mark.asyncio
    async def test_connection_failure_refused(self):
        """Test connection failure when Zotero is not running."""
        with patch('httpx.AsyncClient.get', side_effect=httpx.ConnectError):
            client = ZoteroLocalClient()
            is_connected = await client.is_connected()

            assert is_connected is False


class TestZoteroLocalClientCollections:
    """Test collection fetching."""

    @pytest.mark.asyncio
    async def test_get_collections_success(self, sample_zotero_collection):
        """Test fetching collections from Zotero."""
        with patch('httpx.AsyncClient.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = [sample_zotero_collection]
            mock_get.return_value = mock_response

            client = ZoteroLocalClient()
            collections = await client.get_collections()

            assert len(collections) == 1
            assert collections[0]["key"] == "ABCD1234"
            assert collections[0]["data"]["name"] == "AI Research Collection"

    @pytest.mark.asyncio
    async def test_get_collections_empty(self):
        """Test fetching when no collections exist."""
        with patch('httpx.AsyncClient.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = []
            mock_get.return_value = mock_response

            client = ZoteroLocalClient()
            collections = await client.get_collections()

            assert collections == []


class TestZoteroLocalClientItems:
    """Test item fetching."""

    @pytest.mark.asyncio
    async def test_get_items_in_collection(self, sample_zotero_items):
        """Test fetching items from a specific collection."""
        with patch('httpx.AsyncClient.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = sample_zotero_items
            mock_get.return_value = mock_response

            client = ZoteroLocalClient()
            items = await client.get_items(collection_key="ABCD1234")

            assert len(items) == 2
            assert items[0]["data"]["title"] == "Deep Learning for NLP: A Survey"
            assert items[1]["data"]["title"] == "Transformer Architectures Explained"

    @pytest.mark.asyncio
    async def test_get_items_filters_non_papers(self, sample_zotero_items):
        """Test that non-paper items (notes, attachments) are filtered out."""
        items_with_notes = sample_zotero_items + [
            {
                "key": "NOTE001",
                "data": {"itemType": "note", "note": "Test note"}
            }
        ]

        with patch('httpx.AsyncClient.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = items_with_notes
            mock_get.return_value = mock_response

            client = ZoteroLocalClient()
            items = await client.get_items()

            # Should only return papers, not notes
            assert len(items) == 2
            assert all(item["data"]["itemType"] in ["journalArticle", "conferencePaper"]
                      for item in items)


class TestZoteroLocalClientAttachments:
    """Test attachment (PDF) fetching."""

    @pytest.mark.asyncio
    async def test_get_attachments_for_item(self, sample_zotero_attachments):
        """Test fetching PDF attachments for a specific item."""
        with patch('httpx.AsyncClient.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = [sample_zotero_attachments[0]]
            mock_get.return_value = mock_response

            client = ZoteroLocalClient()
            attachments = await client.get_attachments(parent_item="ITEM001")

            assert len(attachments) == 1
            assert attachments[0]["data"]["contentType"] == "application/pdf"
            assert "path" in attachments[0]["data"]

    @pytest.mark.asyncio
    async def test_get_attachments_no_pdfs(self):
        """Test when item has no PDF attachments."""
        with patch('httpx.AsyncClient.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = []
            mock_get.return_value = mock_response

            client = ZoteroLocalClient()
            attachments = await client.get_attachments(parent_item="ITEM999")

            assert attachments == []


# ==================== Integration Test Flag ====================

@pytest.mark.integration
@pytest.mark.requires_zotero
class TestZoteroLocalClientLive:
    """
    Live integration tests requiring actual Zotero Desktop connection.

    Run with: pytest -m "requires_zotero"
    Skip with: pytest -m "not requires_zotero"
    """

    @pytest.mark.asyncio
    async def test_real_zotero_connection(self):
        """Test connection to actual Zotero Desktop instance."""
        client = ZoteroLocalClient()
        is_connected = await client.is_connected()

        # This test passes only if Zotero Desktop is running
        if not is_connected:
            pytest.skip("Zotero Desktop is not running")

        assert is_connected is True

    @pytest.mark.asyncio
    async def test_real_collections_fetch(self):
        """Test fetching real collections from user's Zotero."""
        client = ZoteroLocalClient()

        if not await client.is_connected():
            pytest.skip("Zotero Desktop is not running")

        collections = await client.get_collections()

        # Should return list (even if empty)
        assert isinstance(collections, list)
```

### 4.2 test_hybrid_importer.py

```python
"""
Unit tests for HybridZoteroImporter phases.

Tests each phase of the hybrid import pipeline in isolation.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

from importers.hybrid_zotero_importer import HybridZoteroImporter, ImportPhase


class TestHybridImporterPhase1:
    """Test Phase 1: Zotero Metadata Fetch."""

    @pytest.mark.asyncio
    async def test_phase1_fetch_success(
        self,
        mock_zotero_local_client,
        sample_zotero_items,
        hybrid_import_config
    ):
        """Test successful fetch of Zotero items."""
        mock_zotero_local_client.get_items.return_value = sample_zotero_items

        importer = HybridZoteroImporter(
            zotero_client=mock_zotero_local_client,
            config=hybrid_import_config
        )

        result = await importer.execute_phase_1(collection_key="ABCD1234")

        assert result["success"] is True
        assert result["items_fetched"] == 2
        assert len(result["items"]) == 2
        mock_zotero_local_client.get_items.assert_called_once_with(
            collection_key="ABCD1234"
        )

    @pytest.mark.asyncio
    async def test_phase1_empty_collection(self, mock_zotero_local_client):
        """Test handling of empty collection."""
        mock_zotero_local_client.get_items.return_value = []

        importer = HybridZoteroImporter(zotero_client=mock_zotero_local_client)
        result = await importer.execute_phase_1(collection_key="EMPTY123")

        assert result["success"] is True
        assert result["items_fetched"] == 0
        assert result["items"] == []

    @pytest.mark.asyncio
    async def test_phase1_connection_failure(self, mock_zotero_local_client):
        """Test handling of connection failure."""
        mock_zotero_local_client.get_items.side_effect = Exception("Connection refused")

        importer = HybridZoteroImporter(zotero_client=mock_zotero_local_client)
        result = await importer.execute_phase_1(collection_key="ABCD1234")

        assert result["success"] is False
        assert "Connection refused" in result["error"]


class TestHybridImporterPhase2:
    """Test Phase 2: PDF Retrieval and Extraction."""

    @pytest.mark.asyncio
    @pytest.mark.requires_pdf
    async def test_phase2_pdf_extraction_success(
        self,
        mock_zotero_local_client,
        sample_zotero_attachments,
        sample_pdf_content,
        temp_pdf_directory
    ):
        """Test successful PDF extraction."""
        # Mock attachment fetching
        mock_zotero_local_client.get_attachments.return_value = [
            sample_zotero_attachments[0]
        ]

        # Mock PDF extraction
        with patch('importers.hybrid_zotero_importer.extract_text_from_pdf') as mock_extract:
            mock_extract.return_value = sample_pdf_content["ITEM001"]["text"]

            importer = HybridZoteroImporter(zotero_client=mock_zotero_local_client)
            result = await importer.execute_phase_2(
                items=[{"key": "ITEM001", "data": {}}]
            )

            assert result["success"] is True
            assert result["pdfs_found"] == 1
            assert result["pdfs_extracted"] == 1
            assert "ITEM001" in result["extracted_texts"]

    @pytest.mark.asyncio
    async def test_phase2_missing_pdf(self, mock_zotero_local_client):
        """Test handling when PDF file is missing."""
        # No attachments found
        mock_zotero_local_client.get_attachments.return_value = []

        importer = HybridZoteroImporter(zotero_client=mock_zotero_local_client)
        result = await importer.execute_phase_2(
            items=[{"key": "ITEM001", "data": {}}]
        )

        assert result["success"] is True
        assert result["pdfs_found"] == 0
        assert result["pdfs_extracted"] == 0

    @pytest.mark.asyncio
    async def test_phase2_pdf_extraction_failure(
        self,
        mock_zotero_local_client,
        sample_zotero_attachments
    ):
        """Test handling of PDF extraction failure."""
        mock_zotero_local_client.get_attachments.return_value = [
            sample_zotero_attachments[0]
        ]

        with patch('importers.hybrid_zotero_importer.extract_text_from_pdf') as mock_extract:
            mock_extract.side_effect = Exception("Corrupted PDF")

            importer = HybridZoteroImporter(zotero_client=mock_zotero_local_client)
            result = await importer.execute_phase_2(
                items=[{"key": "ITEM001", "data": {}}]
            )

            # Should gracefully handle failure, not crash
            assert result["success"] is True
            assert result["pdfs_extracted"] == 0
            assert "ITEM001" not in result["extracted_texts"]


class TestHybridImporterPhase3:
    """Test Phase 3: Merge Zotero + PDF Data."""

    @pytest.mark.asyncio
    async def test_phase3_merge_identical_data(self, merge_test_scenarios):
        """Test merging when Zotero and PDF data are identical."""
        scenario = merge_test_scenarios["scenario_1_identical"]

        importer = HybridZoteroImporter()
        result = await importer.execute_phase_3(
            zotero_items=[{"key": "ITEM001", "data": scenario["zotero_data"]}],
            pdf_extracts={"ITEM001": scenario["pdf_data"]}
        )

        assert result["success"] is True
        assert result["papers_merged"] == 1
        merged = result["merged_papers"][0]
        assert merged["title"] == scenario["expected"]["title"]
        assert merged["confidence"] >= 0.95

    @pytest.mark.asyncio
    async def test_phase3_merge_prefer_pdf_abstract(self, merge_test_scenarios):
        """Test merge logic prefers PDF abstract when longer."""
        scenario = merge_test_scenarios["scenario_3_abstract_conflict"]

        importer = HybridZoteroImporter(merge_strategy="prefer_pdf")
        result = await importer.execute_phase_3(
            zotero_items=[{"key": "ITEM001", "data": scenario["zotero_data"]}],
            pdf_extracts={"ITEM001": scenario["pdf_data"]}
        )

        merged = result["merged_papers"][0]
        assert len(merged["abstract"]) > len(scenario["zotero_data"]["abstract"])
        assert merged["abstract"] == scenario["expected"]["abstract"]

    @pytest.mark.asyncio
    async def test_phase3_merge_no_pdf_available(self):
        """Test merge when PDF extraction failed (Zotero-only mode)."""
        zotero_data = {
            "title": "Deep Learning Survey",
            "abstract": "This paper surveys...",
            "year": 2024,
        }

        importer = HybridZoteroImporter()
        result = await importer.execute_phase_3(
            zotero_items=[{"key": "ITEM001", "data": zotero_data}],
            pdf_extracts={}  # No PDF data
        )

        assert result["success"] is True
        merged = result["merged_papers"][0]
        assert merged["title"] == zotero_data["title"]
        assert merged["source"] == "zotero_only"


class TestHybridImporterPhase4:
    """Test Phase 4: Entity Extraction (LLM)."""

    @pytest.mark.asyncio
    async def test_phase4_entity_extraction_success(self, mock_llm_provider):
        """Test entity extraction using LLM."""
        mock_llm_provider.extract_entities.return_value = {
            "concepts": ["deep learning", "NLP"],
            "methods": ["transformer architecture"],
            "findings": ["95% accuracy"],
        }

        importer = HybridZoteroImporter(llm_provider=mock_llm_provider)
        result = await importer.execute_phase_4(
            merged_papers=[
                {
                    "key": "ITEM001",
                    "title": "Deep Learning Survey",
                    "abstract": "This paper...",
                    "full_text": "1. Introduction...",
                }
            ]
        )

        assert result["success"] is True
        assert result["concepts_extracted"] == 2
        assert result["methods_extracted"] == 1
        assert result["findings_extracted"] == 1

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_phase4_batch_processing(self, mock_llm_provider):
        """Test batch processing of multiple papers."""
        mock_llm_provider.extract_entities.return_value = {
            "concepts": ["AI"],
            "methods": ["method1"],
            "findings": ["result1"],
        }

        papers = [{"key": f"ITEM{i:03d}", "title": f"Paper {i}"}
                  for i in range(50)]

        importer = HybridZoteroImporter(llm_provider=mock_llm_provider, batch_size=10)
        result = await importer.execute_phase_4(merged_papers=papers)

        assert result["success"] is True
        # Should process all 50 papers in batches
        assert mock_llm_provider.extract_entities.call_count == 5


class TestHybridImporterPhase5:
    """Test Phase 5: Graph Construction."""

    @pytest.mark.asyncio
    async def test_phase5_graph_building_success(self, mock_graph_store):
        """Test graph construction from merged papers and entities."""
        papers_with_entities = [
            {
                "key": "ITEM001",
                "title": "Deep Learning Survey",
                "authors": ["Alice Johnson", "Bob Smith"],
                "concepts": ["deep learning", "NLP"],
                "methods": ["transformer"],
                "findings": ["95% accuracy"],
            }
        ]

        importer = HybridZoteroImporter(graph_store=mock_graph_store)
        result = await importer.execute_phase_5(
            papers_with_entities=papers_with_entities,
            project_id="proj-12345"
        )

        assert result["success"] is True
        assert result["nodes_created"] > 0
        assert result["edges_created"] > 0

        # Verify node creation calls
        assert mock_graph_store.add_node.call_count > 0

    @pytest.mark.asyncio
    async def test_phase5_deduplication(self, mock_graph_store):
        """Test that duplicate concepts are not created."""
        # Two papers sharing same concept
        papers = [
            {"key": "ITEM001", "concepts": ["deep learning"]},
            {"key": "ITEM002", "concepts": ["deep learning"]},  # Same concept
        ]

        mock_graph_store.get_node_by_property.side_effect = [
            None,  # First paper: concept not found, create new
            {"id": "concept-1", "name": "deep learning"},  # Second paper: reuse
        ]

        importer = HybridZoteroImporter(graph_store=mock_graph_store)
        result = await importer.execute_phase_5(
            papers_with_entities=papers,
            project_id="proj-12345"
        )

        # Should create concept node only once
        concept_creations = [
            call for call in mock_graph_store.add_node.call_args_list
            if call[0][0] == "Concept"
        ]
        assert len(concept_creations) == 1


# ==================== End-to-End Phase Testing ====================

class TestHybridImporterFullPipeline:
    """Test complete pipeline execution."""

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_full_pipeline_execution(
        self,
        mock_zotero_local_client,
        sample_zotero_items,
        sample_pdf_content,
        mock_llm_provider,
        mock_graph_store,
        phase_test_checkpoints
    ):
        """Test complete hybrid import pipeline."""
        # Setup mocks
        mock_zotero_local_client.get_items.return_value = sample_zotero_items
        mock_zotero_local_client.get_attachments.return_value = []
        mock_llm_provider.extract_entities.return_value = {
            "concepts": ["AI"],
            "methods": ["method"],
            "findings": ["result"],
        }

        importer = HybridZoteroImporter(
            zotero_client=mock_zotero_local_client,
            llm_provider=mock_llm_provider,
            graph_store=mock_graph_store,
        )

        # Execute full pipeline
        result = await importer.execute_full_import(
            collection_key="ABCD1234",
            project_name="Test Project",
            mode="selective"
        )

        assert result["success"] is True
        assert result["project_id"] is not None
        assert "phase_results" in result
        assert len(result["phase_results"]) == 5

        # Verify all phases completed
        for phase in ImportPhase:
            assert phase.name in result["phase_results"]
            assert result["phase_results"][phase.name]["success"] is True
```

### 4.3 test_merge_logic.py

```python
"""
Unit tests for merge logic algorithms.

Tests the core algorithms for merging Zotero metadata with PDF-extracted data.
"""

import pytest
from importers.hybrid_zotero_importer import DataMerger, MergeStrategy


class TestTitleMerge:
    """Test title merging logic."""

    def test_identical_titles(self):
        """Test merging identical titles."""
        merger = DataMerger(strategy=MergeStrategy.PREFER_ZOTERO)

        result = merger.merge_title(
            zotero_title="Deep Learning Survey",
            pdf_title="Deep Learning Survey"
        )

        assert result["value"] == "Deep Learning Survey"
        assert result["confidence"] == 1.0
        assert result["source"] == "both"

    def test_similar_titles_with_punctuation(self):
        """Test titles with minor punctuation differences."""
        merger = DataMerger(strategy=MergeStrategy.PREFER_ZOTERO)

        result = merger.merge_title(
            zotero_title="Deep Learning: A Survey",
            pdf_title="Deep Learning A Survey"
        )

        assert result["value"] == "Deep Learning: A Survey"  # Prefer Zotero
        assert result["confidence"] >= 0.9

    def test_case_insensitive_matching(self):
        """Test case-insensitive title matching."""
        merger = DataMerger(strategy=MergeStrategy.PREFER_ZOTERO)

        result = merger.merge_title(
            zotero_title="Deep learning survey",
            pdf_title="DEEP LEARNING SURVEY"
        )

        assert result["value"].lower() == "deep learning survey"
        assert result["confidence"] >= 0.95


class TestAbstractMerge:
    """Test abstract merging logic."""

    def test_prefer_longer_abstract(self):
        """Test preferring longer (more complete) abstract."""
        merger = DataMerger(strategy=MergeStrategy.PREFER_PDF)

        zotero_abstract = "Short abstract."
        pdf_abstract = "This is a much longer and more detailed abstract " * 10

        result = merger.merge_abstract(
            zotero_abstract=zotero_abstract,
            pdf_abstract=pdf_abstract
        )

        assert result["value"] == pdf_abstract
        assert result["source"] == "pdf"

    def test_abstract_truncation_detection(self):
        """Test detection of truncated abstracts."""
        merger = DataMerger(strategy=MergeStrategy.PREFER_ZOTERO)

        full_abstract = "This is a complete abstract with all details."
        truncated = "This is a complete abstract with..."  # Truncated

        result = merger.merge_abstract(
            zotero_abstract=truncated,
            pdf_abstract=full_abstract
        )

        # Should detect truncation and prefer PDF
        assert result["value"] == full_abstract
        assert result["source"] == "pdf"


class TestAuthorsMerge:
    """Test authors merging logic."""

    def test_merge_identical_authors(self):
        """Test merging identical author lists."""
        merger = DataMerger()

        zotero_authors = ["Alice Johnson", "Bob Smith"]
        pdf_authors = ["Alice Johnson", "Bob Smith"]

        result = merger.merge_authors(
            zotero_authors=zotero_authors,
            pdf_authors=pdf_authors
        )

        assert result["value"] == zotero_authors
        assert result["confidence"] == 1.0

    def test_merge_with_name_variations(self):
        """Test merging authors with name format variations."""
        merger = DataMerger()

        zotero_authors = ["Alice B. Johnson", "Bob Smith"]
        pdf_authors = ["A. Johnson", "B. Smith"]  # Abbreviated

        result = merger.merge_authors(
            zotero_authors=zotero_authors,
            pdf_authors=pdf_authors
        )

        # Should prefer Zotero (more complete names)
        assert result["value"] == zotero_authors
        assert result["confidence"] >= 0.85

    def test_merge_with_extra_pdf_authors(self):
        """Test when PDF has additional authors."""
        merger = DataMerger()

        zotero_authors = ["Alice Johnson", "Bob Smith"]
        pdf_authors = ["Alice Johnson", "Bob Smith", "Charlie Davis"]

        result = merger.merge_authors(
            zotero_authors=zotero_authors,
            pdf_authors=pdf_authors
        )

        # Should include all authors from PDF
        assert len(result["value"]) == 3
        assert "Charlie Davis" in result["value"]


class TestMergeStrategies:
    """Test different merge strategies."""

    def test_prefer_zotero_strategy(self):
        """Test PREFER_ZOTERO strategy."""
        merger = DataMerger(strategy=MergeStrategy.PREFER_ZOTERO)

        result = merger.merge_field(
            field_name="title",
            zotero_value="Zotero Title",
            pdf_value="PDF Title"
        )

        assert result["value"] == "Zotero Title"
        assert result["source"] == "zotero"

    def test_prefer_pdf_strategy(self):
        """Test PREFER_PDF strategy."""
        merger = DataMerger(strategy=MergeStrategy.PREFER_PDF)

        result = merger.merge_field(
            field_name="title",
            zotero_value="Zotero Title",
            pdf_value="PDF Title"
        )

        assert result["value"] == "PDF Title"
        assert result["source"] == "pdf"

    def test_smart_merge_strategy(self):
        """Test SMART_MERGE strategy (field-specific logic)."""
        merger = DataMerger(strategy=MergeStrategy.SMART_MERGE)

        # For abstracts, should prefer longer
        abstract_result = merger.merge_field(
            field_name="abstract",
            zotero_value="Short",
            pdf_value="Much longer abstract with details" * 5
        )

        assert len(abstract_result["value"]) > len("Short")
        assert abstract_result["source"] == "pdf"


class TestConflictResolution:
    """Test conflict resolution logic."""

    def test_year_mismatch_resolution(self):
        """Test handling year conflicts."""
        merger = DataMerger()

        result = merger.merge_field(
            field_name="year",
            zotero_value=2024,
            pdf_value=2023  # Conflict
        )

        # Should prefer Zotero for structured metadata
        assert result["value"] == 2024
        assert result["confidence"] < 1.0  # Lower confidence due to conflict

    def test_doi_normalization(self):
        """Test DOI normalization and matching."""
        merger = DataMerger()

        result = merger.merge_field(
            field_name="doi",
            zotero_value="10.1234/test",
            pdf_value="https://doi.org/10.1234/test"  # URL format
        )

        # Should recognize as same DOI despite format difference
        assert "10.1234/test" in result["value"]
        assert result["confidence"] >= 0.95
```

---

## 5. Integration Tests

### 5.1 test_zotero_desktop_integration.py

```python
"""
Integration tests with actual Zotero Desktop.

These tests require Zotero Desktop to be running with test data loaded.
"""

import pytest
from integrations.zotero_local import ZoteroLocalClient
from importers.hybrid_zotero_importer import HybridZoteroImporter


@pytest.mark.integration
@pytest.mark.requires_zotero
class TestZoteroDesktopIntegration:
    """Integration tests requiring real Zotero Desktop connection."""

    @pytest.mark.asyncio
    async def test_fetch_real_collection(self):
        """Test fetching a real collection from Zotero Desktop."""
        client = ZoteroLocalClient()

        if not await client.is_connected():
            pytest.skip("Zotero Desktop not running")

        collections = await client.get_collections()
        assert isinstance(collections, list)

        if len(collections) == 0:
            pytest.skip("No collections found in Zotero")

        # Fetch items from first collection
        first_collection = collections[0]
        items = await client.get_items(collection_key=first_collection["key"])

        assert isinstance(items, list)
        if len(items) > 0:
            # Verify item structure
            assert "key" in items[0]
            assert "data" in items[0]
            assert "title" in items[0]["data"]

    @pytest.mark.asyncio
    async def test_fetch_real_pdf_attachments(self):
        """Test fetching PDF attachments from real papers."""
        client = ZoteroLocalClient()

        if not await client.is_connected():
            pytest.skip("Zotero Desktop not running")

        collections = await client.get_collections()
        if len(collections) == 0:
            pytest.skip("No collections found")

        items = await client.get_items(collection_key=collections[0]["key"])
        if len(items) == 0:
            pytest.skip("No items in collection")

        # Try to fetch attachments for first item
        attachments = await client.get_attachments(parent_item=items[0]["key"])

        # May or may not have attachments
        assert isinstance(attachments, list)


@pytest.mark.integration
@pytest.mark.requires_zotero
@pytest.mark.requires_pdf
@pytest.mark.slow
class TestFullHybridImportIntegration:
    """Full hybrid import integration test with real Zotero data."""

    @pytest.mark.asyncio
    async def test_complete_import_workflow(self, mock_graph_store, mock_llm_provider):
        """Test complete import workflow with real Zotero data."""
        client = ZoteroLocalClient()

        if not await client.is_connected():
            pytest.skip("Zotero Desktop not running")

        collections = await client.get_collections()
        if len(collections) == 0:
            pytest.skip("No test collections available")

        # Use first collection for testing
        test_collection = collections[0]

        importer = HybridZoteroImporter(
            zotero_client=client,
            llm_provider=mock_llm_provider,  # Mock LLM to avoid costs
            graph_store=mock_graph_store,
            config={"import_mode": "zotero_only"}  # Fast mode for testing
        )

        result = await importer.execute_full_import(
            collection_key=test_collection["key"],
            project_name=f"Test Import - {test_collection['name']}",
            mode="zotero_only"
        )

        assert result["success"] is True
        assert "project_id" in result
        assert result["items_imported"] > 0
```

### 5.2 test_end_to_end_pipeline.py

```python
"""
End-to-end pipeline tests.

Tests the complete import pipeline from Zotero to graph database.
"""

import pytest
from pathlib import Path
import tempfile


@pytest.mark.integration
@pytest.mark.slow
class TestEndToEndPipeline:
    """End-to-end pipeline tests."""

    @pytest.mark.asyncio
    async def test_pipeline_with_mock_data(
        self,
        mock_zotero_local_client,
        sample_zotero_items,
        mock_llm_provider,
        mock_db,
        phase_test_checkpoints
    ):
        """Test complete pipeline with fully mocked data."""
        from importers.hybrid_zotero_importer import HybridZoteroImporter
        from graph.graph_store import GraphStore

        # Setup mocks
        mock_zotero_local_client.get_items.return_value = sample_zotero_items
        mock_zotero_local_client.get_attachments.return_value = []

        graph_store = GraphStore(db=mock_db)

        importer = HybridZoteroImporter(
            zotero_client=mock_zotero_local_client,
            llm_provider=mock_llm_provider,
            graph_store=graph_store,
        )

        # Execute pipeline
        result = await importer.execute_full_import(
            collection_key="TEST123",
            project_name="E2E Test Project",
            mode="selective"
        )

        # Verify checkpoints
        assert result["success"] is True
        assert result["duration"] < 300  # Should complete in 5 minutes

        # Check each phase
        checkpoints = phase_test_checkpoints
        assert result["items_fetched"] >= checkpoints["phase_1_zotero_fetch"]["items_fetched"]

    @pytest.mark.asyncio
    async def test_error_recovery(
        self,
        mock_zotero_local_client,
        mock_llm_provider,
        mock_graph_store
    ):
        """Test pipeline error recovery and partial completion."""
        # Simulate failure in phase 2 (PDF extraction)
        mock_zotero_local_client.get_items.return_value = [
            {"key": "ITEM001", "data": {"title": "Test Paper"}}
        ]
        mock_zotero_local_client.get_attachments.side_effect = Exception("Storage error")

        importer = HybridZoteroImporter(
            zotero_client=mock_zotero_local_client,
            llm_provider=mock_llm_provider,
            graph_store=mock_graph_store,
        )

        result = await importer.execute_full_import(
            collection_key="TEST123",
            project_name="Error Recovery Test",
            mode="selective",
            fail_fast=False  # Continue on errors
        )

        # Should complete with partial success
        assert result["phase_results"]["phase_1"]["success"] is True
        assert result["phase_results"]["phase_2"]["success"] is False
        # Later phases should still attempt with available data
        assert result["phase_results"]["phase_3"]["success"] is True
```

---

## 6. E2E Tests (API Endpoints)

### 6.1 test_api_endpoints.py

```python
"""
E2E tests for Zotero import API endpoints.
"""

import pytest


@pytest.mark.e2e
class TestZoteroImportAPIEndpoints:
    """Test Zotero import API endpoints."""

    @pytest.mark.asyncio
    async def test_check_zotero_status_endpoint(self, async_client):
        """Test GET /api/import/zotero/status endpoint."""
        response = await async_client.get("/api/import/zotero/status")

        assert response.status_code == 200
        data = response.json()
        assert "connected" in data
        assert isinstance(data["connected"], bool)

    @pytest.mark.asyncio
    async def test_get_collections_endpoint(self, async_client, mock_zotero_local_client):
        """Test GET /api/import/zotero/collections endpoint."""
        with patch("routers.import_routes.zotero_client", mock_zotero_local_client):
            mock_zotero_local_client.get_collections.return_value = [
                {"key": "ABC123", "name": "Test Collection", "numItems": 10}
            ]

            response = await async_client.get("/api/import/zotero/collections")

            assert response.status_code == 200
            collections = response.json()
            assert len(collections) == 1
            assert collections[0]["name"] == "Test Collection"

    @pytest.mark.asyncio
    async def test_start_import_endpoint(self, async_client):
        """Test POST /api/import/zotero/import endpoint."""
        import_request = {
            "collectionKey": "ABC123",
            "projectName": "Test Project",
            "mode": "selective",
            "extractConcepts": True,
        }

        response = await async_client.post(
            "/api/import/zotero/import",
            json=import_request
        )

        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert isinstance(data["job_id"], str)

    @pytest.mark.asyncio
    async def test_get_import_status_endpoint(self, async_client):
        """Test GET /api/import/status/{job_id} endpoint."""
        # Assume a job was created
        job_id = "test-job-123"

        response = await async_client.get(f"/api/import/status/{job_id}")

        # Should return 200 (if exists) or 404 (if not found)
        assert response.status_code in [200, 404]

        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert data["status"] in ["pending", "running", "completed", "failed"]


@pytest.mark.e2e
@pytest.mark.slow
class TestZoteroImportJobPolling:
    """Test job status polling during import."""

    @pytest.mark.asyncio
    async def test_job_lifecycle(self, async_client):
        """Test complete job lifecycle from start to completion."""
        # Start import
        response = await async_client.post(
            "/api/import/zotero/import",
            json={
                "collectionKey": "TEST123",
                "projectName": "Lifecycle Test",
                "mode": "zotero_only",  # Fast mode
            }
        )

        assert response.status_code == 200
        job_id = response.json()["job_id"]

        # Poll status until completion
        max_polls = 30
        poll_count = 0
        final_status = None

        while poll_count < max_polls:
            status_response = await async_client.get(f"/api/import/status/{job_id}")
            assert status_response.status_code == 200

            status_data = status_response.json()
            current_status = status_data["status"]

            if current_status in ["completed", "failed"]:
                final_status = current_status
                break

            poll_count += 1
            await asyncio.sleep(2)

        assert final_status is not None, "Job did not complete within timeout"
        assert final_status == "completed"
```

---

## 7. Mock Data Generators

### 7.1 fixtures/zotero_fixtures.py

```python
"""
Reusable Zotero mock data fixtures.
"""

import pytest
from datetime import datetime
from typing import List, Dict, Any


def generate_zotero_item(
    key: str,
    title: str,
    item_type: str = "journalArticle",
    year: int = 2024,
    doi: str | None = None,
    authors: List[str] | None = None,
) -> Dict[str, Any]:
    """Generate a mock Zotero item."""
    if authors is None:
        authors = ["John Doe"]

    creators = [
        {
            "creatorType": "author",
            "firstName": author.split()[0],
            "lastName": " ".join(author.split()[1:]) or author.split()[0],
        }
        for author in authors
    ]

    return {
        "key": key,
        "version": 1,
        "data": {
            "itemType": item_type,
            "title": title,
            "abstractNote": f"Abstract for {title}",
            "date": f"{year}-01-01",
            "DOI": doi,
            "creators": creators,
            "tags": [],
            "collections": [],
        },
    }


def generate_zotero_collection(
    key: str,
    name: str,
    num_items: int = 10
) -> Dict[str, Any]:
    """Generate a mock Zotero collection."""
    return {
        "key": key,
        "version": 1,
        "data": {
            "name": name,
            "parentCollection": False,
        },
        "meta": {
            "numItems": num_items,
        },
    }


@pytest.fixture
def large_zotero_collection():
    """Generate a large collection for performance testing."""
    items = [
        generate_zotero_item(
            key=f"ITEM{i:04d}",
            title=f"Test Paper {i}",
            year=2020 + (i % 5),
            doi=f"10.1234/test{i}",
            authors=[f"Author{j}" for j in range(1, (i % 3) + 2)],
        )
        for i in range(100)
    ]
    return items
```

---

## 8. CI/CD Integration

### 8.1 GitHub Actions Workflow

```yaml
# .github/workflows/backend-tests.yml

name: Backend Tests

on:
  push:
    branches: [main, develop]
    paths:
      - 'backend/**'
      - '.github/workflows/backend-tests.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'backend/**'

jobs:
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov

      - name: Run unit tests
        run: |
          cd backend
          pytest tests/unit/ -v -m "not requires_zotero" --cov=importers --cov=integrations

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./backend/htmlcov/index.html

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: unit-tests

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: scholarag_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-asyncio

      - name: Run integration tests
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/scholarag_test
        run: |
          cd backend
          pytest tests/integration/ -v -m "not requires_zotero" --maxfail=3

  e2e-tests:
    name: E2E API Tests
    runs-on: ubuntu-latest
    needs: integration-tests

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: scholarag_test
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pytest pytest-asyncio httpx

      - name: Start backend server
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/scholarag_test
        run: |
          cd backend
          uvicorn main:app --host 0.0.0.0 --port 8000 &
          sleep 5  # Wait for server to start

      - name: Run E2E tests
        run: |
          cd backend
          pytest tests/e2e/ -v --maxfail=1
```

---

## 9. Test Coverage Requirements

### Coverage Targets

| Module | Target Coverage |
|--------|----------------|
| `integrations/zotero_local.py` | 85% |
| `importers/hybrid_zotero_importer.py` | 90% |
| Merge logic | 95% |
| API endpoints | 80% |
| **Overall** | **80%** |

### Coverage Report Commands

```bash
# Generate HTML coverage report
pytest --cov=importers --cov=integrations --cov-report=html

# Generate terminal report
pytest --cov=importers --cov=integrations --cov-report=term-missing

# Fail if coverage below threshold
pytest --cov=importers --cov-fail-under=80
```

---

## 10. Running Tests

### Test Execution Commands

```bash
# Run all tests
pytest

# Run only unit tests (fast)
pytest tests/unit/ -v

# Run integration tests (requires services)
pytest tests/integration/ -v -m "not requires_zotero"

# Run tests requiring Zotero Desktop (manual)
pytest -m "requires_zotero" -v

# Run E2E tests
pytest tests/e2e/ -v

# Run specific test file
pytest tests/unit/test_hybrid_importer.py -v

# Run specific test
pytest tests/unit/test_merge_logic.py::TestTitleMerge::test_identical_titles -v

# Run with coverage
pytest --cov=importers --cov-report=html

# Run slow tests (disabled by default)
pytest -m "slow" -v

# Run tests in parallel (requires pytest-xdist)
pytest -n auto
```

### Environment Setup for Tests

```bash
# Set environment variables
export TESTING=true
export DATABASE_URL=postgresql://test:test@localhost:5432/scholarag_test
export ANTHROPIC_API_KEY=your_test_key_here

# Or use .env.test file
cp .env.example .env.test
# Edit .env.test with test credentials
pytest --envfile .env.test
```

---

## Summary

This test suite design provides:

1. **Comprehensive Coverage**: Unit, integration, and E2E tests
2. **Isolated Testing**: Mocks for external dependencies (Zotero, LLM, PDF)
3. **Real Integration Tests**: Optional tests with actual Zotero Desktop
4. **Phase-by-Phase Testing**: Each import phase tested independently
5. **CI/CD Ready**: GitHub Actions workflow configuration
6. **Performance Testing**: Large dataset fixtures for load testing
7. **Error Handling**: Tests for failure scenarios and recovery
8. **Documentation**: Clear test structure and naming conventions

**Test Execution Priority**:
1. Unit tests (fast, run on every commit)
2. Integration tests (medium, run on PR)
3. E2E tests (slow, run before merge to main)
4. Manual Zotero tests (when Zotero Desktop available)
