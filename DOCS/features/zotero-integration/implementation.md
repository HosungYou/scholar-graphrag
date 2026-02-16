# Zotero Hybrid Importer Implementation Guide

## Overview

This guide describes how to implement the **Zotero Hybrid Importer** that uses the schema defined in migration 005.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Zotero Hybrid Import Flow                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Zotero API → Fetch papers/tags from collection              │
│         ↓                                                        │
│  2. Store in paper_metadata (with zotero_item_key)              │
│         ↓                                                        │
│  3. LLM Extraction → Extract Concepts/Methods/Findings          │
│         ↓                                                        │
│  4. Deduplication → Merge with existing entities                │
│         ↓                                                        │
│  5. Store entities (with node_source tracking)                  │
│         ↓                                                        │
│  6. Build relationships → Concept-concept connections            │
│         ↓                                                        │
│  7. Gap Detection → Identify research opportunities             │
│         ↓                                                        │
│  8. Update sync_state → Record library_version                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create ZoteroHybridImporter Class

Location: `/backend/importers/zotero_hybrid_importer.py`

```python
from integrations.zotero import ZoteroClient, ZoteroItem
from graph.entity_extractor import EntityExtractor
from graph.relationship_builder import ConceptCentricRelationshipBuilder
from graph.gap_detector import GapDetector

class ZoteroHybridImporter:
    """
    Import Zotero collections with hybrid entity extraction.

    Workflow:
    1. Fetch papers from Zotero collection
    2. Store papers in paper_metadata with zotero_item_key
    3. Extract concepts from abstracts using LLM
    4. Deduplicate entities (merge Zotero tags + LLM concepts)
    5. Build relationships between concepts
    6. Run gap detection
    7. Update sync state
    """

    def __init__(
        self,
        zotero_api_key: str,
        user_id: str,
        llm_provider,
        db_connection,
        graph_store,
        progress_callback=None,
    ):
        self.zotero_client = ZoteroClient(
            api_key=zotero_api_key,
            user_id=user_id,
        )
        self.llm = llm_provider
        self.db = db_connection
        self.graph_store = graph_store
        self.progress_callback = progress_callback

        # Specialized processors
        self.entity_extractor = EntityExtractor(llm_provider=llm_provider)
        self.relationship_builder = ConceptCentricRelationshipBuilder(
            llm_provider=llm_provider
        )
        self.gap_detector = GapDetector(llm_provider=llm_provider)

        # Caches
        self._entity_cache: dict[str, dict] = {}
        self._paper_metadata: dict[str, dict] = {}

    async def import_collection(
        self,
        project_id: str,
        collection_key: str,
        extract_concepts: bool = True,
        run_gap_detection: bool = True,
    ) -> dict:
        """Import a Zotero collection into a ScholaRAG project."""
        pass  # Implementation below
```

### Step 2: Fetch Papers from Zotero

```python
async def _fetch_zotero_papers(
    self,
    collection_key: str,
    since_version: int = 0,
) -> list[ZoteroItem]:
    """
    Fetch papers from Zotero collection.

    Args:
        collection_key: Zotero collection key
        since_version: Only fetch items modified since this version (incremental)

    Returns:
        List of Zotero items
    """
    logger.info(f"Fetching papers from Zotero collection: {collection_key}")

    if since_version > 0:
        # Incremental sync
        items = await self.zotero_client.get_items_all(
            collection_key=collection_key,
            since_version=since_version,
        )
        logger.info(f"Fetched {len(items)} modified papers (since version {since_version})")
    else:
        # Full import
        items = await self.zotero_client.get_items_all(
            collection_key=collection_key,
        )
        logger.info(f"Fetched {len(items)} total papers")

    # Filter out notes and attachments
    papers = [
        item for item in items
        if item.item_type not in ["note", "attachment"]
    ]

    return papers
```

### Step 3: Store Papers in paper_metadata

```python
async def _store_zotero_papers(
    self,
    project_id: str,
    papers: list[ZoteroItem],
) -> dict[str, str]:
    """
    Store Zotero papers in paper_metadata table.

    Returns:
        Mapping of zotero_item_key → paper_metadata.id (UUID)
    """
    paper_uuid_map = {}

    for paper in papers:
        # Check if already exists
        existing = await self.db.fetchrow(
            """
            SELECT id FROM paper_metadata
            WHERE project_id = $1 AND zotero_item_key = $2
            """,
            project_id,
            paper.key,
        )

        if existing:
            paper_uuid = existing["id"]
            # Update existing
            await self.db.execute(
                """
                UPDATE paper_metadata SET
                    title = $1,
                    authors = $2,
                    abstract = $3,
                    year = $4,
                    doi = $5,
                    zotero_version = $6,
                    zotero_date_modified = $7,
                    zotero_tags = $8,
                    zotero_extra = $9
                WHERE id = $10
                """,
                paper.title[:500],
                json.dumps([{"name": c["firstName"] + " " + c["lastName"]}
                           for c in paper.creators if c.get("creatorType") == "author"]),
                paper.abstract,
                paper.year,
                paper.doi,
                paper.version,
                paper.date_modified,
                json.dumps(paper.tags),
                paper.extra,
                paper_uuid,
            )
            logger.info(f"Updated paper: {paper.title[:50]}...")
        else:
            # Insert new
            paper_uuid = str(uuid4())
            await self.db.execute(
                """
                INSERT INTO paper_metadata (
                    id, project_id, paper_id, doi, title, authors,
                    abstract, year, source, citation_count,
                    zotero_item_key, zotero_version,
                    zotero_collection_keys, zotero_date_added,
                    zotero_date_modified, zotero_tags, zotero_extra
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                """,
                paper_uuid,
                project_id,
                paper.doi or paper.key,  # Use DOI or Zotero key as paper_id
                paper.doi,
                paper.title[:500],
                json.dumps([{"name": c["firstName"] + " " + c["lastName"]}
                           for c in paper.creators if c.get("creatorType") == "author"]),
                paper.abstract,
                paper.year,
                "zotero",
                0,  # citation_count (not available from Zotero)
                paper.key,
                paper.version,
                paper.collections,
                paper.date_added,
                paper.date_modified,
                json.dumps(paper.tags),
                paper.extra,
            )
            logger.info(f"Inserted paper: {paper.title[:50]}...")

        paper_uuid_map[paper.key] = paper_uuid
        self._paper_metadata[paper.key] = {
            "uuid": paper_uuid,
            "title": paper.title,
        }

    return paper_uuid_map
```

### Step 4: Extract Entities from Papers + Zotero Tags

```python
async def _extract_hybrid_entities(
    self,
    project_id: str,
    papers: list[ZoteroItem],
) -> list[dict]:
    """
    Extract entities from BOTH Zotero tags AND LLM extraction.

    Strategy:
    1. Import Zotero tags as Concepts (node_source='zotero')
    2. Extract Concepts/Methods/Findings from abstracts (node_source='pdf_llm')
    3. Deduplicate and merge similar entities (node_source='merged')

    Returns:
        List of entity dictionaries
    """
    all_entities = []

    for paper in papers:
        # Phase 1: Import Zotero tags as Concepts
        for tag_obj in paper.tags:
            tag_name = tag_obj.get("tag", "").strip()
            if not tag_name:
                continue

            normalized = tag_name.lower()
            if normalized not in self._entity_cache:
                entity_id = str(uuid4())
                entity_data = {
                    "id": entity_id,
                    "name": tag_name,
                    "definition": f"Concept from Zotero tags",
                    "entity_type": "Concept",
                    "node_source": "zotero",
                    "confidence": 1.0,  # Zotero tags are authoritative
                    "source_paper_ids": [paper.key],
                    "zotero_item_key": paper.key,
                    "source_metadata": {
                        "extraction_method": "zotero_tag",
                        "zotero_item_key": paper.key,
                    },
                }
                self._entity_cache[normalized] = entity_data
                all_entities.append(entity_data)
            else:
                # Tag exists, add this paper as source
                self._entity_cache[normalized]["source_paper_ids"].append(paper.key)

        # Phase 2: Extract Concepts/Methods/Findings from abstract using LLM
        if paper.abstract:
            extracted = await self.entity_extractor.extract_entities(
                title=paper.title,
                abstract=paper.abstract,
                paper_id=paper.key,
            )

            for entity in extracted:
                normalized = entity.name.strip().lower()

                # Check if similar entity exists (Zotero tag or previous LLM extraction)
                existing = self._entity_cache.get(normalized)

                if existing:
                    # Merge: Update to 'merged' source
                    if existing["node_source"] != entity.entity_type:
                        existing["node_source"] = "merged"
                        existing["source_metadata"]["merged_sources"] = [
                            existing["node_source"],
                            "pdf_llm",
                        ]

                    # Use LLM definition if better
                    if len(entity.definition or "") > len(existing.get("definition", "")):
                        existing["definition"] = entity.definition

                    existing["source_paper_ids"].append(paper.key)
                else:
                    # New entity from LLM
                    entity_id = str(uuid4())
                    entity_data = {
                        "id": entity_id,
                        "name": entity.name,
                        "definition": entity.definition,
                        "entity_type": entity.entity_type.value,
                        "node_source": "pdf_llm",
                        "confidence": entity.confidence,
                        "source_paper_ids": [paper.key],
                        "source_metadata": {
                            "extraction_method": "llm",
                            "model": self.llm.model_name,
                            "confidence": entity.confidence,
                        },
                    }
                    self._entity_cache[normalized] = entity_data
                    all_entities.append(entity_data)

    logger.info(f"Extracted {len(all_entities)} unique entities")
    logger.info(f"  - {sum(1 for e in all_entities if e['node_source'] == 'zotero')} from Zotero tags")
    logger.info(f"  - {sum(1 for e in all_entities if e['node_source'] == 'pdf_llm')} from LLM extraction")
    logger.info(f"  - {sum(1 for e in all_entities if e['node_source'] == 'merged')} merged entities")

    return all_entities
```

### Step 5: Store Entities with Source Tracking

```python
async def _store_hybrid_entities(
    self,
    project_id: str,
    entities: list[dict],
) -> dict[str, str]:
    """
    Store entities with node_source and zotero_item_key tracking.

    Returns:
        Mapping of entity_id → database UUID
    """
    id_mapping = {}

    for entity in entities:
        entity_id = entity["id"]
        id_mapping[entity_id] = entity_id

        # Get paper UUIDs for source_paper_ids
        source_paper_uuids = [
            self._paper_metadata[pid]["uuid"]
            for pid in entity.get("source_paper_ids", [])
            if pid in self._paper_metadata
        ]

        # Determine zotero_item_key (if entity came from single Zotero item)
        zotero_item_key = None
        if entity["node_source"] == "zotero":
            # For Zotero tags, use the item_key from source_metadata
            zotero_item_key = entity["source_metadata"].get("zotero_item_key")

        await self.db.execute(
            """
            INSERT INTO entities (
                id, project_id, entity_type, name, properties,
                is_visualized, source_paper_ids, definition,
                node_source, source_metadata,
                zotero_item_key, zotero_version
            ) VALUES ($1, $2, $3::entity_type, $4, $5, $6, $7, $8, $9::node_source, $10, $11, $12)
            ON CONFLICT (id) DO UPDATE SET
                source_paper_ids = EXCLUDED.source_paper_ids,
                definition = EXCLUDED.definition,
                node_source = EXCLUDED.node_source,
                source_metadata = EXCLUDED.source_metadata
            """,
            entity_id,
            project_id,
            entity["entity_type"],
            entity["name"][:500],
            json.dumps({"confidence": entity.get("confidence", 0.8)}),
            True,  # is_visualized = True for concepts
            source_paper_uuids,
            entity.get("definition", ""),
            entity["node_source"],
            json.dumps(entity.get("source_metadata", {})),
            zotero_item_key,
            None,  # zotero_version (only for Paper entities)
        )

        # Store embedding if available
        if entity.get("embedding"):
            await self.db.execute(
                """
                UPDATE entities SET embedding = $1 WHERE id = $2
                """,
                entity["embedding"],
                entity_id,
            )

    return id_mapping
```

### Step 6: Update Sync State

```python
async def _update_sync_state(
    self,
    project_id: str,
    library_version: int,
    stats: dict,
):
    """
    Update zotero_sync_state after import.

    Args:
        project_id: Project UUID
        library_version: Current Zotero library version
        stats: Import statistics
    """
    # Check if sync state exists
    existing = await self.db.fetchrow(
        """
        SELECT id FROM zotero_sync_state WHERE project_id = $1
        """,
        project_id,
    )

    if existing:
        # Update existing
        await self.db.execute(
            """
            UPDATE zotero_sync_state SET
                library_version = $1,
                last_sync_at = NOW(),
                last_successful_sync_at = NOW(),
                sync_status = 'up_to_date',
                items_synced = items_synced + $2,
                items_added = items_added + $3,
                items_updated = items_updated + $4,
                updated_at = NOW()
            WHERE project_id = $5
            """,
            library_version,
            stats.get("papers_imported", 0),
            stats.get("papers_added", 0),
            stats.get("papers_updated", 0),
            project_id,
        )
    else:
        # Create new
        await self.db.execute(
            """
            INSERT INTO zotero_sync_state (
                id, project_id, library_id, library_type, library_version,
                last_sync_at, last_successful_sync_at, sync_status,
                items_synced, items_added
            ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 'up_to_date', $6, $7)
            """,
            str(uuid4()),
            project_id,
            self.zotero_client.user_id,
            self.zotero_client.library_type,
            library_version,
            stats.get("papers_imported", 0),
            stats.get("papers_added", 0),
        )
```

### Step 7: Log Sync History

```python
async def _log_sync_history(
    self,
    project_id: str,
    sync_type: str,  # 'full' or 'incremental'
    started_at: datetime,
    completed_at: datetime,
    from_version: int,
    to_version: int,
    stats: dict,
    status: str = "success",
    error_details: dict = None,
):
    """Log sync operation in zotero_sync_history."""
    await self.db.execute(
        """
        INSERT INTO zotero_sync_history (
            id, project_id, sync_type, sync_direction,
            started_at, completed_at, duration_seconds,
            from_version, to_version,
            status, items_processed, items_added, items_updated,
            errors_encountered, error_details,
            initiated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        """,
        str(uuid4()),
        project_id,
        sync_type,
        "import",
        started_at,
        completed_at,
        (completed_at - started_at).total_seconds(),
        from_version,
        to_version,
        status,
        stats.get("papers_imported", 0),
        stats.get("papers_added", 0),
        stats.get("papers_updated", 0),
        len(error_details or []),
        json.dumps(error_details) if error_details else None,
        "system",  # Or user_id if available
    )
```

### Step 8: Main Import Method

```python
async def import_collection(
    self,
    project_id: str,
    collection_key: str,
    extract_concepts: bool = True,
    run_gap_detection: bool = True,
) -> dict:
    """
    Import a Zotero collection with hybrid entity extraction.

    Args:
        project_id: ScholaRAG project UUID
        collection_key: Zotero collection key
        extract_concepts: Whether to use LLM for concept extraction
        run_gap_detection: Whether to run gap detection after import

    Returns:
        Import result with statistics
    """
    started_at = datetime.now()

    try:
        # 1. Get current library version (for incremental sync)
        current_state = await self.db.fetchrow(
            """
            SELECT library_version FROM zotero_sync_state WHERE project_id = $1
            """,
            project_id,
        )
        since_version = current_state["library_version"] if current_state else 0

        # 2. Fetch papers from Zotero
        self._update_progress("fetching", 0.1, "Fetching papers from Zotero...")
        papers = await self._fetch_zotero_papers(collection_key, since_version)

        if not papers:
            return {
                "success": True,
                "message": "No new papers to import",
                "stats": {"papers_imported": 0},
            }

        # 3. Store papers in paper_metadata
        self._update_progress("storing", 0.2, "Storing paper metadata...")
        paper_uuid_map = await self._store_zotero_papers(project_id, papers)

        # 4. Extract entities (Zotero tags + LLM)
        self._update_progress("extracting", 0.3, "Extracting concepts...")
        entities = await self._extract_hybrid_entities(project_id, papers)

        # 5. Generate embeddings
        self._update_progress("embedding", 0.5, "Generating embeddings...")
        entities = await self._generate_embeddings(entities)

        # 6. Store entities
        self._update_progress("storing", 0.6, "Storing entities...")
        id_mapping = await self._store_hybrid_entities(project_id, entities)

        # 7. Build relationships
        self._update_progress("relationships", 0.7, "Building relationships...")
        relationships = await self._build_relationships(project_id, entities)

        # 8. Run gap detection
        if run_gap_detection:
            self._update_progress("gaps", 0.8, "Detecting research gaps...")
            gap_analysis = await self.gap_detector.analyze_graph(
                concepts=[e for e in entities if e["entity_type"] == "Concept"],
                relationships=relationships,
            )
            await self._store_gap_analysis(project_id, gap_analysis)

        # 9. Get final library version
        library_version = await self.zotero_client.get_library_version()

        # 10. Update sync state
        stats = {
            "papers_imported": len(papers),
            "papers_added": sum(1 for k in paper_uuid_map if k not in self._paper_metadata),
            "papers_updated": sum(1 for k in paper_uuid_map if k in self._paper_metadata),
            "concepts_extracted": len(entities),
        }
        await self._update_sync_state(project_id, library_version, stats)

        # 11. Log sync history
        completed_at = datetime.now()
        await self._log_sync_history(
            project_id=project_id,
            sync_type="incremental" if since_version > 0 else "full",
            started_at=started_at,
            completed_at=completed_at,
            from_version=since_version,
            to_version=library_version,
            stats=stats,
            status="success",
        )

        self._update_progress("completed", 1.0, "Import completed!")

        return {
            "success": True,
            "project_id": project_id,
            "stats": stats,
        }

    except Exception as e:
        logger.exception(f"Import failed: {e}")
        completed_at = datetime.now()
        await self._log_sync_history(
            project_id=project_id,
            sync_type="full",
            started_at=started_at,
            completed_at=completed_at,
            from_version=0,
            to_version=0,
            stats={},
            status="failed",
            error_details={"error": str(e)},
        )
        return {"success": False, "error": str(e)}
```

## FastAPI Endpoint

Location: `/backend/routers/zotero.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/zotero", tags=["zotero"])

class ImportCollectionRequest(BaseModel):
    project_id: str
    collection_key: str
    extract_concepts: bool = True
    run_gap_detection: bool = True

@router.post("/import")
async def import_zotero_collection(
    request: ImportCollectionRequest,
    zotero_api_key: str = Depends(get_zotero_api_key),
    user_id: str = Depends(get_user_id),
    db: Database = Depends(get_database),
    llm: LLMProvider = Depends(get_llm_provider),
):
    """Import a Zotero collection into a ScholaRAG project."""
    importer = ZoteroHybridImporter(
        zotero_api_key=zotero_api_key,
        user_id=user_id,
        llm_provider=llm,
        db_connection=db,
        graph_store=None,  # TODO: Add graph store
    )

    result = await importer.import_collection(
        project_id=request.project_id,
        collection_key=request.collection_key,
        extract_concepts=request.extract_concepts,
        run_gap_detection=request.run_gap_detection,
    )

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error"))

    return result

@router.get("/sync-status/{project_id}")
async def get_sync_status(
    project_id: str,
    db: Database = Depends(get_database),
):
    """Get Zotero sync status for a project."""
    status = await db.fetchrow(
        """
        SELECT * FROM zotero_sync_state WHERE project_id = $1
        """,
        project_id,
    )

    if not status:
        return {
            "project_id": project_id,
            "sync_status": "never_synced",
            "last_sync_at": None,
        }

    return dict(status)

@router.get("/sync-history/{project_id}")
async def get_sync_history(
    project_id: str,
    limit: int = 10,
    db: Database = Depends(get_database),
):
    """Get sync history for a project."""
    history = await db.fetch(
        """
        SELECT * FROM zotero_sync_history
        WHERE project_id = $1
        ORDER BY started_at DESC
        LIMIT $2
        """,
        project_id,
        limit,
    )

    return [dict(h) for h in history]
```

## Testing

### Unit Tests

```python
import pytest
from importers.zotero_hybrid_importer import ZoteroHybridImporter

@pytest.mark.asyncio
async def test_import_zotero_collection(mock_zotero_client, mock_llm, mock_db):
    """Test full Zotero collection import."""
    importer = ZoteroHybridImporter(
        zotero_api_key="test_key",
        user_id="12345",
        llm_provider=mock_llm,
        db_connection=mock_db,
        graph_store=None,
    )

    result = await importer.import_collection(
        project_id="test-project",
        collection_key="TEST_COLL",
    )

    assert result["success"] is True
    assert result["stats"]["papers_imported"] > 0

@pytest.mark.asyncio
async def test_incremental_sync(mock_zotero_client, mock_db):
    """Test incremental sync (only new/modified items)."""
    # Set up existing sync state
    await mock_db.execute(
        """
        INSERT INTO zotero_sync_state (project_id, library_version)
        VALUES ('test-project', 100)
        """
    )

    # Import should only fetch items with version > 100
    importer = ZoteroHybridImporter(...)
    result = await importer.import_collection("test-project", "TEST_COLL")

    # Verify only new items were imported
    assert result["stats"]["papers_added"] == 5  # Only 5 new papers

@pytest.mark.asyncio
async def test_entity_merge(mock_llm, mock_db):
    """Test merging Zotero tags with LLM-extracted concepts."""
    # Zotero tag: "Transfer Learning"
    # LLM extracted: "transfer learning" (lowercase)
    # Expected: Single merged entity with node_source='merged'

    importer = ZoteroHybridImporter(...)
    entities = await importer._extract_hybrid_entities(
        project_id="test-project",
        papers=[mock_paper_with_tag_and_abstract],
    )

    # Find "transfer learning" entity
    transfer_learning = next(
        e for e in entities
        if e["name"].lower() == "transfer learning"
    )

    assert transfer_learning["node_source"] == "merged"
    assert len(transfer_learning["source_paper_ids"]) == 1
```

## Configuration

Add to `.env`:

```bash
# Zotero API
ZOTERO_API_KEY=your_api_key_here
ZOTERO_USER_ID=12345678

# Import settings
ZOTERO_HYBRID_IMPORT_ENABLED=true
ZOTERO_AUTO_EXTRACT_CONCEPTS=true
ZOTERO_AUTO_RUN_GAP_DETECTION=true

# Merge settings
ZOTERO_TAG_MERGE_THRESHOLD=0.85  # Similarity threshold for auto-merge
ZOTERO_PREFER_ZOTERO_METADATA=true  # Prefer Zotero for bibliographic data
```

## Next Steps

1. [ ] Implement `ZoteroHybridImporter` class
2. [ ] Add FastAPI endpoints
3. [ ] Create frontend UI for Zotero import
4. [ ] Implement incremental sync
5. [ ] Add conflict resolution UI
6. [ ] Implement export to Zotero
7. [ ] Add real-time sync (webhooks)
8. [ ] Write comprehensive tests
