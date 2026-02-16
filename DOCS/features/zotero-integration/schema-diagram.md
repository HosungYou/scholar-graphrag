# Zotero Hybrid Import - Schema Diagram

## Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ScholaRAG_Graph Database Schema                      │
│                        With Zotero Hybrid Import (v005)                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────┐
│     projects       │
│────────────────────│
│ id (PK)            │──────┐
│ name               │      │
│ research_question  │      │
│ source_path        │      │
│ created_at         │      │
│ updated_at         │      │
└────────────────────┘      │
                            │
                            │ 1:1
                            ↓
┌─────────────────────────────────────┐
│     zotero_sync_state               │
│─────────────────────────────────────│
│ id (PK)                             │
│ project_id (FK) UNIQUE              │
│ library_id                          │
│ library_type (user/group)           │
│ library_version ← CRITICAL          │
│ last_sync_at                        │
│ last_successful_sync_at             │
│ sync_status                         │
│ items_synced, items_added, etc.     │
└─────────────────────────────────────┘
                            │
                            │ 1:N
                            ↓
┌─────────────────────────────────────┐
│     zotero_sync_history             │
│─────────────────────────────────────│
│ id (PK)                             │
│ project_id (FK)                     │
│ sync_type (full/incremental)        │
│ sync_direction (import/export)      │
│ started_at, completed_at            │
│ from_version, to_version            │
│ status (success/failed/partial)     │
│ items_processed, items_added, etc.  │
│ error_details (JSONB)               │
│ initiated_by                        │
└─────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────────────┐
│                         Core Data Tables                               │
└────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│     zotero_collections              │
│─────────────────────────────────────│
│ id (PK)                             │
│ project_id (FK)                     │
│ collection_key UNIQUE               │
│ name                                │
│ parent_collection_key (FK self)     │ ← Hierarchical
│ collection_version                  │
│ item_count                          │
│ subcollection_count                 │
│ last_synced_at                      │
└─────────────────────────────────────┘
            │
            │ Hierarchy
            └─────┐
                  ↓
┌─────────────────────────────────────────────────────────┐
│           Recursive Collection Tree                      │
│─────────────────────────────────────────────────────────│
│  Example:                                               │
│    Meta-Analysis 2024 (COLL1)                           │
│    ├── Education (COLL2, parent=COLL1)                  │
│    │   └── K-12 Studies (COLL3, parent=COLL2)           │
│    └── Psychology (COLL4, parent=COLL1)                 │
└─────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│     paper_metadata (Papers are NOT graph nodes)                 │
│─────────────────────────────────────────────────────────────────│
│ id (PK)                                                         │
│ project_id (FK)                                                 │
│                                                                 │
│ ── Original Fields ──                                           │
│ paper_id, doi, title, abstract                                 │
│ authors (JSONB)                                                 │
│ year, source, citation_count                                   │
│ pdf_url                                                         │
│ screening_status, relevance_score                              │
│ extracted_concept_ids[] (UUIDs)                                │
│ extracted_method_ids[] (UUIDs)                                 │
│ extracted_finding_ids[] (UUIDs)                                │
│ embedding (vector)                                             │
│                                                                 │
│ ── NEW: Zotero Tracking ──                                     │
│ zotero_item_key VARCHAR(20)                                    │
│ zotero_version INTEGER                                         │
│ zotero_collection_keys[] (array)                               │
│ zotero_date_added                                              │
│ zotero_date_modified                                           │
│ zotero_tags (JSONB)                                            │
│ zotero_notes TEXT                                              │
│ zotero_extra TEXT                                              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ Papers reference concepts
                            │ (via extracted_concept_ids)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│     entities (Concepts, Methods, Findings - VISUALIZED)         │
│─────────────────────────────────────────────────────────────────│
│ id (PK)                                                         │
│ project_id (FK)                                                 │
│ entity_type (Concept/Method/Finding/Problem)                   │
│ name, properties (JSONB)                                        │
│ definition TEXT                                                 │
│ embedding (vector)                                             │
│ is_visualized BOOLEAN (always TRUE for concepts)               │
│                                                                 │
│ ── NEW: Source Tracking ──                                     │
│ node_source (zotero/pdf_llm/manual/merged/auto_inferred)       │
│ source_metadata (JSONB)                                         │
│ source_paper_ids[] (UUIDs of papers)                           │
│ zotero_item_key VARCHAR(20)                                    │
│ zotero_version INTEGER                                         │
│ zotero_collection_keys[] (array)                               │
│ last_synced_at                                                 │
│                                                                 │
│ ── Gap Detection Metrics ──                                    │
│ cluster_id (FK)                                                │
│ centrality_degree, centrality_betweenness, centrality_pagerank │
│                                                                 │
│ created_at, updated_at                                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ N:M via relationships
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│     relationships (Edges between concepts)                      │
│─────────────────────────────────────────────────────────────────│
│ id (PK)                                                         │
│ project_id (FK)                                                 │
│ source_id (FK → entities)                                       │
│ target_id (FK → entities)                                       │
│ relationship_type (DISCUSSES_CONCEPT/RELATED_TO/USES_METHOD)   │
│ properties (JSONB)                                              │
│ weight FLOAT                                                    │
│ created_at                                                      │
│                                                                 │
│ UNIQUE (source_id, target_id, relationship_type)               │
└─────────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────────────┐
│                      Merge & Conflict Tracking                         │
└────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│     entity_merge_history                                        │
│─────────────────────────────────────────────────────────────────│
│ id (PK)                                                         │
│ entity_id (FK → entities)                                       │
│ source_type (zotero/pdf_llm/manual)                            │
│ source_entity_id (e.g., zotero_item_key)                       │
│ source_confidence FLOAT                                         │
│ merged_at, merged_by                                           │
│ merge_strategy (manual/auto_title_match/auto_doi_match/llm)   │
│ changes_applied (JSONB)                                         │
└─────────────────────────────────────────────────────────────────┘

Example merge history:
┌────────────────────────────────────────────────────────────────┐
│ Entity: "Transfer Learning" (uuid-123, node_source='merged')  │
│ Merge History:                                                 │
│   1. 2024-01-10: Zotero tag "Transfer Learning" (confidence=1.0)│
│   2. 2024-01-12: LLM extracted "transfer learning" (0.92)     │
│   3. 2024-01-15: Manual edit by user (definition updated)     │
└────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│     zotero_sync_conflicts                                       │
│─────────────────────────────────────────────────────────────────│
│ id (PK)                                                         │
│ project_id (FK)                                                 │
│ entity_id (FK → entities, nullable)                             │
│ paper_metadata_id (FK → paper_metadata, nullable)               │
│ conflict_type (field_mismatch/deletion_conflict/merge_conflict)│
│ local_data (JSONB)                                              │
│ remote_data (JSONB)                                             │
│ conflicting_fields[] (array)                                    │
│ resolution_status (pending/resolved_local/resolved_remote)     │
│ resolved_at, resolved_by                                       │
│ resolution_notes TEXT                                           │
│ detected_at                                                     │
└─────────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────────────┐
│                         Gap Detection Tables                           │
└────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│     concept_clusters                                            │
│─────────────────────────────────────────────────────────────────│
│ id (PK)                                                         │
│ project_id (FK)                                                 │
│ name                                                            │
│ color                                                           │
│ concept_count                                                   │
│ keywords[] (array)                                              │
└─────────────────────────────────────────────────────────────────┘
            │
            │ Clusters have many concepts
            ↓
┌─────────────────────────────────────────────────────────────────┐
│     entities (with cluster_id)                                  │
│─────────────────────────────────────────────────────────────────│
│ ...                                                             │
│ cluster_id (FK → concept_clusters)                              │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
            │
            │ Gaps between clusters
            ↓
┌─────────────────────────────────────────────────────────────────┐
│     structural_gaps                                             │
│─────────────────────────────────────────────────────────────────│
│ id (PK)                                                         │
│ project_id (FK)                                                 │
│ cluster_a_id (FK → concept_clusters)                            │
│ cluster_b_id (FK → concept_clusters)                            │
│ gap_strength FLOAT                                              │
│ concept_a_ids[] (array)                                         │
│ concept_b_ids[] (array)                                         │
│ suggested_bridge_concepts[] (array)                             │
│ suggested_research_questions[] (array)                          │
│ status (pending/investigating/resolved)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Zotero Hybrid Import Flow                          │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: Fetch from Zotero
──────────────────────────────────────────
┌─────────────┐    API    ┌──────────────────┐
│   Zotero    │──────────▶│  150 Papers      │
│  Collection │           │  45 Tags         │
│   "Meta-    │           │  3 Collections   │
│  Analysis"  │           │  library_version │
└─────────────┘           │  = 123           │
                          └──────────────────┘
                                   │
                                   ↓

Step 2: Store Papers as Metadata
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  paper_metadata          │
                          │  ─────────────────────── │
                          │  • 150 papers inserted   │
                          │  • zotero_item_key set   │
                          │  • zotero_tags stored    │
                          │  • NOT graph nodes       │
                          └──────────────────────────┘
                                   │
                                   ↓

Step 3: Extract Entities (Hybrid)
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  Entity Extraction       │
                          │  ─────────────────────── │
                          │  Source 1: Zotero Tags   │
                          │    → 45 Concepts         │
                          │    → node_source='zotero'│
                          │                          │
                          │  Source 2: LLM (abstracts│
                          │    → 120 Concepts        │
                          │    → node_source='pdf_llm│
                          └──────────────────────────┘
                                   │
                                   ↓

Step 4: Deduplicate & Merge
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  Deduplication           │
                          │  ─────────────────────── │
                          │  • Title similarity > 0.85│
                          │  • DOI exact match       │
                          │  • Semantic match (embed)│
                          │                          │
                          │  Result: 25 duplicates   │
                          │  → Merge to node_source= │
                          │     'merged'             │
                          └──────────────────────────┘
                                   │
                                   ↓

Step 5: Store Entities (Nodes)
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  entities table          │
                          │  ─────────────────────── │
                          │  • 140 unique entities   │
                          │    - 20 from Zotero only │
                          │    - 95 from LLM only    │
                          │    - 25 merged           │
                          │  • is_visualized = true  │
                          │  • source_paper_ids set  │
                          └──────────────────────────┘
                                   │
                                   ↓

Step 6: Build Relationships
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  relationships table     │
                          │  ─────────────────────── │
                          │  • 350 edges created     │
                          │  • DISCUSSES_CONCEPT     │
                          │  • RELATED_TO            │
                          │  • USES_METHOD           │
                          │  • weight calculated     │
                          └──────────────────────────┘
                                   │
                                   ↓

Step 7: Gap Detection
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  Gap Detection           │
                          │  ─────────────────────── │
                          │  • Clustering (5 clusters│
                          │  • Centrality metrics    │
                          │  • 12 structural gaps    │
                          │  • Bridge concepts       │
                          │  • Research questions    │
                          └──────────────────────────┘
                                   │
                                   ↓

Step 8: Update Sync State
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  zotero_sync_state       │
                          │  ─────────────────────── │
                          │  • library_version = 123 │
                          │  • sync_status = 'up_to_date
                          │  • items_synced = 150    │
                          │  • last_sync_at = NOW()  │
                          └──────────────────────────┘
                                   │
                                   ↓

Step 9: Log History
──────────────────────────────────────────
                          ┌──────────────────────────┐
                          │  zotero_sync_history     │
                          │  ─────────────────────── │
                          │  • sync_type = 'full'    │
                          │  • status = 'success'    │
                          │  • items_processed = 150 │
                          │  • duration = 45 seconds │
                          └──────────────────────────┘

                          ✅ Import Complete!
```

## Source Tracking Example

```
┌─────────────────────────────────────────────────────────────────────────┐
│           Entity: "Transfer Learning" (Concept)                         │
│                 node_source = 'merged'                                  │
└─────────────────────────────────────────────────────────────────────────┘

Timeline:
─────────────────────────────────────────────────────────────────────────

2024-01-10 14:30:00 (Import from Zotero)
┌──────────────────────────────────────┐
│ Source: Zotero Tag                   │
│ ──────────────────────────────────── │
│ name: "Transfer Learning"            │
│ node_source: 'zotero'                │
│ confidence: 1.0 (authoritative)      │
│ source_paper_ids: ['paper-1']        │
│ zotero_item_key: 'ABC123XY'          │
└──────────────────────────────────────┘
                │
                ↓ Store in entities table
                │
                │
2024-01-12 10:15:00 (LLM Extraction)
┌──────────────────────────────────────┐
│ Source: PDF Abstract LLM             │
│ ──────────────────────────────────── │
│ name: "transfer learning" (lowercase)│
│ definition: "Technique where..."    │
│ confidence: 0.92                     │
│ source_paper_ids: ['paper-5']        │
└──────────────────────────────────────┘
                │
                ↓ Detected similarity > 0.85
                │
                ↓ MERGE OPERATION
                │
┌──────────────────────────────────────────────────────────────┐
│ Merged Entity                                                │
│ ──────────────────────────────────────────────────────────── │
│ id: uuid-123                                                 │
│ name: "Transfer Learning" (keep capitalized from Zotero)    │
│ definition: "Technique where..." (use LLM's better def)     │
│ node_source: 'merged' ← CHANGED                             │
│ confidence: 0.96 (averaged)                                  │
│ source_paper_ids: ['paper-1', 'paper-5'] ← COMBINED         │
│ source_metadata: {                                           │
│   "merged_sources": ["zotero", "pdf_llm"],                  │
│   "zotero_confidence": 1.0,                                  │
│   "llm_confidence": 0.92                                     │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘
                │
                ↓ Log merge in entity_merge_history
                │
┌──────────────────────────────────────────────────────────────┐
│ entity_merge_history                                         │
│ ──────────────────────────────────────────────────────────── │
│ entity_id: uuid-123                                          │
│ source_type: 'pdf_llm'                                       │
│ source_entity_id: 'paper-5'                                  │
│ merge_strategy: 'auto_title_match'                           │
│ changes_applied: {                                           │
│   "definition": "updated",                                   │
│   "confidence": "averaged",                                  │
│   "source_paper_ids": "appended"                             │
│ }                                                            │
│ merged_at: 2024-01-12 10:15:00                              │
└──────────────────────────────────────────────────────────────┘
                │
                │
2024-01-15 09:00:00 (Manual Edit)
┌──────────────────────────────────────────────────────────────┐
│ User Action: Refine definition                               │
│ ──────────────────────────────────────────────────────────── │
│ definition: "Advanced technique where pre-trained models..." │
│ node_source: still 'merged' (doesn't change)                 │
│ updated_at: 2024-01-15 09:00:00                             │
└──────────────────────────────────────────────────────────────┘
                │
                ↓ Mark as needing sync
                │
┌──────────────────────────────────────────────────────────────┐
│ zotero_sync_state                                            │
│ ──────────────────────────────────────────────────────────── │
│ sync_status: 'pending_changes' ← CHANGED                     │
│ updated_at: 2024-01-15 09:00:00                             │
└──────────────────────────────────────────────────────────────┘

Final State:
────────────────────────────────────────────────────────────────
Entity "Transfer Learning" is a MERGED entity with contributions from:
  1. Zotero tag (authoritative name, collection membership)
  2. LLM extraction (semantic definition, confidence score)
  3. Manual edit (refined definition by user)

All sources tracked in source_metadata for auditability.
```

## Index Strategy Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Index Strategy                                │
└─────────────────────────────────────────────────────────────────────────┘

Query Pattern: "Find papers from Zotero collection 'Meta-Analysis 2024'"
────────────────────────────────────────────────────────────────────────
┌────────────────────┐
│ zotero_collections │
│────────────────────│
│ SELECT collection_ │ ← idx_zotero_coll_key (B-tree)
│ key FROM ...       │   O(log n) lookup
│ WHERE name = 'Meta'│
└────────────────────┘
         │
         ↓ collection_key = 'COLL_META'
         │
┌────────────────────┐
│  paper_metadata    │
│────────────────────│
│ SELECT * FROM ...  │ ← idx_paper_meta_zotero_collections (GIN)
│ WHERE 'COLL_META'  │   Bitmap index scan
│ = ANY(zotero_coll) │   O(1) array membership
└────────────────────┘


Query Pattern: "Incremental sync (fetch only modified papers)"
────────────────────────────────────────────────────────────────────────
┌────────────────────┐
│ zotero_sync_state  │
│────────────────────│
│ SELECT library_ver │ ← idx_zotero_sync_project (B-tree)
│ sion FROM ...      │   O(log n) lookup
│ WHERE project_id = │
│ 'uuid'             │
└────────────────────┘
         │
         ↓ library_version = 123
         │
┌────────────────────┐
│  paper_metadata    │
│────────────────────│
│ SELECT * FROM ...  │ ← idx_paper_meta_zotero_version (B-tree)
│ WHERE zotero_versi │   Index scan with version > 123
│ on > 123           │   Only scans modified papers
└────────────────────┘


Query Pattern: "Find entities by source (Zotero tags)"
────────────────────────────────────────────────────────────────────────
┌────────────────────┐
│     entities       │
│────────────────────│
│ SELECT * FROM ...  │ ← idx_entities_node_source (B-tree)
│ WHERE node_source  │   Bitmap index scan
│ = 'zotero'         │   + idx_entities_project (B-tree)
│ AND project_id = ' │   Index intersection
│ uuid'              │   Very efficient!
└────────────────────┘


Query Pattern: "Find similar entities for merge (deduplication)"
────────────────────────────────────────────────────────────────────────
┌────────────────────┐
│     entities       │
│────────────────────│
│ SELECT e1.*, e2.*  │ ← idx_entities_project_type_name (Composite)
│ FROM entities e1   │   Reduces search space to same project/type
│ JOIN entities e2   │
│ ON similarity(e1.n │ ← idx_entities_name_trgm (GIN trigram)
│ ame, e2.name) > 0. │   Fast fuzzy text search
│ 85                 │
│ WHERE e1.project_i │ ← idx_entities_node_source (Filter)
│ d = 'uuid'         │   Only compare across sources
│ AND e1.node_source │
│ != e2.node_source  │
└────────────────────┘


Query Pattern: "Semantic search (find related concepts)"
────────────────────────────────────────────────────────────────────────
┌────────────────────┐
│     entities       │
│────────────────────│
│ SELECT * FROM ...  │ ← idx_entities_embedding (HNSW)
│ WHERE embedding    │   Approximate nearest neighbor
│ <=> $1             │   Sub-millisecond search
│ ORDER BY embedding │   Even with 10,000+ entities
│ <=> $1             │
│ LIMIT 10           │
└────────────────────┘


Query Pattern: "Find pending conflicts"
────────────────────────────────────────────────────────────────────────
┌────────────────────────┐
│ zotero_sync_conflicts  │
│────────────────────────│
│ SELECT * FROM ...      │ ← idx_zotero_conflicts_status (Partial)
│ WHERE resolution_statu │   Only indexes pending rows
│ s = 'pending'          │   Very small index!
└────────────────────────┘


Performance Summary:
────────────────────────────────────────────────────────────────────────
Operation                     Index Type      Time Complexity  Actual Time
───────────────────────────────────────────────────────────────────────────
Zotero key lookup             B-tree         O(log n)          < 1ms
Collection membership         GIN (array)     O(1)              < 1ms
Incremental sync query        B-tree         O(log n + k)      < 5ms
Semantic search (10 results)  HNSW (vector)   O(log n)          < 10ms
Fuzzy name matching           GIN (trigram)   O(m)              < 20ms
Find pending conflicts        Partial index   O(k)              < 1ms

Where:
  n = total rows in table
  k = matching rows
  m = number of trigrams in query string
```

## Key Takeaways

### 1. Papers are Metadata, NOT Nodes
```
❌ Bad: Paper → Author → Concept (hub-and-spoke)
✅ Good: Concept ↔ Concept (semantic network)
```

### 2. Source Tracking is Critical
```
Every entity knows its origin:
  - zotero: From Zotero tags/collections
  - pdf_llm: Extracted from PDFs
  - manual: User-created
  - merged: Combined from multiple sources
```

### 3. Incremental Sync is Efficient
```
Only fetch changes since last sync:
  Zotero API: ?since=123
  PostgreSQL: WHERE zotero_version > 123
```

### 4. Conflict Resolution is Automatic (where possible)
```
Bibliographic fields → Prefer Zotero
Extracted concepts → Prefer LLM
Manual edits → Always prefer local
```

### 5. Merge History is Auditability
```
Every merge operation is logged:
  - What sources were merged?
  - What strategy was used?
  - What fields were changed?
  - Who initiated the merge?
```
