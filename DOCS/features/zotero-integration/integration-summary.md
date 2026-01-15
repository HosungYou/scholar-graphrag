# Zotero Hybrid Import - Complete Integration Summary

## Executive Summary

This document provides a comprehensive overview of the **Zotero Hybrid Import** feature for ScholaRAG_Graph_Review. The integration enables bidirectional synchronization between Zotero reference manager and the concept-centric knowledge graph, combining the strengths of both systems:

- **Zotero**: Authoritative bibliographic metadata, tags, collections, annotations
- **ScholaRAG_Graph**: LLM-extracted concepts, semantic relationships, gap detection

## Key Features

### 1. Hybrid Data Sources

Entities in ScholaRAG_Graph can originate from **three sources**:

| Source | Description | Example | Authority Level |
|--------|-------------|---------|-----------------|
| `zotero` | Imported from Zotero (tags, collections) | "Meta-Analysis" tag | High (bibliographic) |
| `pdf_llm` | Extracted from PDFs via LLM | "Transfer Learning" concept | High (semantic) |
| `manual` | Manually created by user | "Custom Concept" | Highest (user intent) |
| `merged` | Combined from multiple sources | Zotero tag + LLM extraction | Highest (comprehensive) |

### 2. Incremental Sync

- **Version Tracking**: Uses Zotero's `library_version` for efficient incremental updates
- **Change Detection**: Only fetches items modified since last sync
- **Conflict Resolution**: Detects and resolves conflicts between local and remote changes
- **Bidirectional**: Import from Zotero → ScholaRAG, Export ScholaRAG → Zotero

### 3. Concept-Centric Architecture

**Papers and Authors are NOT graph nodes** - they are stored as metadata:

```
┌─────────────────────────────────────────────────────────────┐
│                    Knowledge Graph Structure                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Visualized Nodes (entities table):                         │
│    - Concepts (e.g., "Transfer Learning")                   │
│    - Methods (e.g., "Meta-Analysis")                        │
│    - Findings (e.g., "Positive Effect, d=0.52")            │
│    - Problems (e.g., "Lack of Longitudinal Studies")        │
│                                                              │
│  Metadata Only (paper_metadata table):                      │
│    - Papers (title, abstract, authors, year, DOI)           │
│    - Authors (name, affiliation, ORCID)                     │
│    - Zotero tags, notes, collections                        │
└─────────────────────────────────────────────────────────────┘
```

**Why?** This prevents "hub-and-spoke" graphs dominated by highly-cited papers and focuses visualization on semantic relationships between research concepts.

## Database Schema

### New Tables (Migration 005)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `zotero_collections` | Collection hierarchy | `collection_key`, `parent_collection_key` |
| `zotero_sync_state` | Per-project sync tracking | `library_version`, `sync_status` |
| `zotero_sync_history` | Audit log | `sync_type`, `items_processed` |
| `entity_merge_history` | Track merged entities | `source_type`, `merge_strategy` |
| `zotero_sync_conflicts` | Conflict resolution | `conflict_type`, `resolution_status` |

### Extended Existing Tables

**entities** table (7 new columns):
- `zotero_item_key` - Zotero identifier
- `zotero_version` - Version for sync
- `zotero_collection_keys[]` - Collections
- `node_source` - Data origin enum
- `source_metadata` - JSON metadata
- `last_synced_at` - Last sync timestamp

**paper_metadata** table (8 new columns):
- `zotero_item_key` - Zotero paper identifier
- `zotero_version` - Version tracking
- `zotero_collection_keys[]` - Collections
- `zotero_date_added` - When added to Zotero
- `zotero_date_modified` - Last modified in Zotero
- `zotero_tags` - Zotero tags JSON
- `zotero_notes` - Concatenated notes
- `zotero_extra` - Extra field content

## Implementation Files

### Created Files

1. **`database/migrations/005_zotero_hybrid_import.sql`** (1,023 lines)
   - Complete PostgreSQL schema
   - 5 new tables, 15 new columns
   - 12 utility functions
   - 3 views for reporting
   - Triggers for automatic sync tracking

2. **`database/ZOTERO_SCHEMA_DESIGN.md`** (678 lines)
   - Detailed schema documentation
   - Design philosophy and rationale
   - Query examples and workflows
   - Best practices and recommendations

3. **`backend/importers/ZOTERO_IMPORTER_IMPLEMENTATION.md`** (587 lines)
   - Python implementation guide
   - Step-by-step code examples
   - FastAPI endpoint definitions
   - Testing strategies

### Existing Files to Modify

1. **`backend/integrations/zotero.py`** (EXISTING)
   - Already implements `ZoteroClient` class
   - Provides Zotero API access
   - Ready to use (no changes needed)

2. **`backend/importers/scholarag_importer.py`** (EXISTING)
   - Current ScholaRAG folder importer
   - Can be used as reference for hybrid importer

3. **`backend/routers/import_.py`** (TO MODIFY)
   - Add Zotero import endpoints
   - Add sync status endpoints

4. **`frontend/app/import/page.tsx`** (TO MODIFY)
   - Add Zotero import UI
   - Add collection selector
   - Add sync status display

## Workflows

### Workflow 1: Initial Import

```
User Action: "Import Zotero Collection 'Meta-Analysis 2024'"
     ↓
1. Fetch 150 papers from Zotero API
     ↓
2. Store papers in paper_metadata (with zotero_item_key)
     ↓
3. Extract 45 Zotero tags → 45 Concept entities (node_source='zotero')
     ↓
4. Extract 120 concepts from abstracts via LLM (node_source='pdf_llm')
     ↓
5. Deduplicate: Merge 25 similar entities → node_source='merged'
     ↓
6. Final result: 140 unique Concept entities
     ↓
7. Build 350 relationships (DISCUSSES_CONCEPT, RELATED_TO, etc.)
     ↓
8. Run gap detection → Identify 12 structural gaps
     ↓
9. Update zotero_sync_state (library_version=123)
     ↓
10. Log sync_history (status='success', items_added=150)
```

### Workflow 2: Incremental Sync

```
User Action: "Sync with Zotero" (button click)
     ↓
1. Check zotero_sync_state.library_version (current: 123)
     ↓
2. Fetch items from Zotero API (since_version=123)
     ↓
3. Zotero returns 5 modified papers (version 124-128)
     ↓
4. Update 5 papers in paper_metadata
     ↓
5. Extract concepts from 5 papers (only new/modified)
     ↓
6. Merge with existing entities
     ↓
7. Update zotero_sync_state (library_version=128)
     ↓
8. Log sync_history (status='success', items_updated=5)
```

### Workflow 3: Export to Zotero

```
User Action: "Export Project to Zotero Collection"
     ↓
1. Find papers without zotero_item_key (10 papers)
     ↓
2. Convert to Zotero format (ZoteroItem objects)
     ↓
3. Create Zotero collection "ScholaRAG Export - Project Name"
     ↓
4. Upload 10 papers to Zotero via API
     ↓
5. Update paper_metadata with new zotero_item_keys
     ↓
6. Export concept tags → Zotero tags
     ↓
7. Update zotero_sync_state (items_added=10)
```

### Workflow 4: Conflict Resolution

```
Scenario: Paper modified in both Zotero and ScholaRAG
     ↓
1. During sync, detect title mismatch:
   - Zotero: "Meta-Analysis of AI in Education"
   - Local:  "Meta-Analysis of AI in Education (Updated)"
     ↓
2. Create conflict record in zotero_sync_conflicts:
   - conflict_type: 'field_mismatch'
   - conflicting_fields: ['title']
   - local_data: {...}
   - remote_data: {...}
     ↓
3. Show conflict in UI with options:
   - "Keep Zotero Version" → resolution_status='resolved_remote'
   - "Keep Local Version" → resolution_status='resolved_local'
   - "Merge Manually" → resolution_status='resolved_manual'
     ↓
4. User selects "Keep Zotero Version"
     ↓
5. Apply resolution:
   - UPDATE paper_metadata SET title = remote_data->>'title'
   - UPDATE zotero_sync_conflicts SET resolution_status='resolved_remote'
```

## Utility Functions

### SQL Functions (12 Total)

```sql
-- 1. Get entities by Zotero collection
SELECT * FROM get_entities_by_zotero_collection('COLL_KEY');

-- 2. Find papers needing sync
SELECT * FROM get_papers_pending_zotero_sync('project-uuid');

-- 3. Find duplicate entities for merge
SELECT * FROM find_duplicate_entities_for_merge('project-uuid', 0.85);

-- 4. Get sync statistics
SELECT * FROM get_zotero_sync_stats('project-uuid');
```

### Views (3 Total)

```sql
-- 1. Papers with sync status
SELECT * FROM papers_with_zotero_status WHERE sync_status='not_synced';

-- 2. Entity source distribution
SELECT * FROM entity_source_distribution WHERE project_id='uuid';

-- 3. Zotero collection hierarchy
SELECT * FROM zotero_collection_tree;
```

## Testing Strategy

### Unit Tests (8 Tests)

1. `test_import_zotero_collection` - Full import workflow
2. `test_incremental_sync` - Only fetch modified items
3. `test_entity_merge` - Merge Zotero tags with LLM concepts
4. `test_conflict_detection` - Detect field mismatches
5. `test_conflict_resolution` - Apply user resolution
6. `test_export_to_zotero` - Create Zotero items
7. `test_collection_hierarchy` - Parse nested collections
8. `test_sync_state_update` - Update library_version

### Integration Tests (4 Tests)

1. `test_full_import_workflow` - End-to-end import
2. `test_bidirectional_sync` - Import → Modify → Export → Sync
3. `test_multi_source_merge` - Zotero + PDF + Manual
4. `test_gap_detection_after_import` - Gap detection works with Zotero data

## Performance Considerations

### Optimization Strategies

| Operation | Strategy | Performance Impact |
|-----------|----------|-------------------|
| Paper fetching | Pagination (100 items/page) | 150 papers = 2 API calls |
| Embedding generation | Batch processing | 140 entities = 14 batches (10 items each) |
| Entity deduplication | Similarity index | O(n log n) vs O(n²) |
| Relationship building | Parallel processing | 350 relationships in ~10 seconds |
| Gap detection | Clustering first | 12 gaps found in 5 seconds |

### Recommended Indexes

```sql
-- Fast Zotero key lookups
CREATE INDEX idx_entities_zotero_key ON entities(zotero_item_key);
CREATE INDEX idx_paper_meta_zotero_key ON paper_metadata(zotero_item_key);

-- Incremental sync queries
CREATE INDEX idx_paper_meta_zotero_version ON paper_metadata(zotero_version);

-- Collection membership
CREATE INDEX idx_entities_zotero_collections ON entities USING gin (zotero_collection_keys);

-- Conflict resolution
CREATE INDEX idx_zotero_conflicts_status ON zotero_sync_conflicts(resolution_status);
```

## Security Considerations

### API Key Management

```env
# Store in .env (NEVER commit to git)
ZOTERO_API_KEY=your_secret_key_here
ZOTERO_USER_ID=12345678
```

### Row-Level Security (RLS)

```sql
-- Example: Users can only access their own projects
ALTER TABLE zotero_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync state"
ON zotero_sync_state FOR SELECT
USING (auth.uid() = (SELECT user_id FROM projects WHERE id = project_id));
```

## Future Enhancements

### Phase 2 (Next 3 months)

- [ ] Real-time sync using Zotero webhooks
- [ ] Automatic conflict resolution using LLM
- [ ] Bulk export of concept clusters to Zotero tags
- [ ] Collection-based project organization
- [ ] Zotero annotation import (PDF highlights)

### Phase 3 (6-12 months)

- [ ] Multi-library sync (personal + group libraries)
- [ ] Selective sync (specific collections only)
- [ ] Version control for entities (git-like diffs)
- [ ] Collaborative editing with conflict detection
- [ ] Mobile app with offline sync

## Migration Checklist

### Database Setup

- [x] Create migration file `005_zotero_hybrid_import.sql`
- [ ] Run migration in Supabase SQL Editor
- [ ] Verify 5 new tables created
- [ ] Verify 15 new columns added to existing tables
- [ ] Test utility functions
- [ ] Test views return correct data

### Backend Implementation

- [ ] Create `backend/importers/zotero_hybrid_importer.py`
- [ ] Add FastAPI endpoints in `backend/routers/zotero.py`
- [ ] Update `main.py` to include Zotero router
- [ ] Add Zotero configuration to `.env`
- [ ] Write unit tests
- [ ] Write integration tests

### Frontend Implementation

- [ ] Create Zotero import UI component
- [ ] Add collection selector dropdown
- [ ] Add sync status display
- [ ] Add conflict resolution modal
- [ ] Add sync history timeline
- [ ] Update project settings page

### Documentation

- [x] Schema design document
- [x] Implementation guide
- [ ] API documentation (Swagger/OpenAPI)
- [ ] User guide (screenshots + tutorials)
- [ ] Video walkthrough

### Testing

- [ ] Unit tests pass (8/8)
- [ ] Integration tests pass (4/4)
- [ ] Load testing (1000+ papers)
- [ ] Conflict resolution testing
- [ ] Security testing (API key handling)

### Deployment

- [ ] Deploy database migration to production
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Update environment variables
- [ ] Monitor error logs
- [ ] Collect user feedback

## Support Resources

### Documentation

- [Zotero Web API v3](https://www.zotero.org/support/dev/web_api/v3/start)
- [PostgreSQL Recursive Queries](https://www.postgresql.org/docs/current/queries-with.html)
- [AGENTiGraph Paper](https://arxiv.org/abs/2410.11531)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

### Example Queries

See `database/ZOTERO_SCHEMA_DESIGN.md` for 20+ example queries covering:
- Initial import
- Incremental sync
- Conflict resolution
- Entity merging
- Gap detection
- Performance optimization

### Code Examples

See `backend/importers/ZOTERO_IMPORTER_IMPLEMENTATION.md` for:
- Complete Python implementation
- FastAPI endpoint definitions
- Testing strategies
- Configuration examples

## Contact

For questions or issues related to Zotero Hybrid Import:

- **Technical Issues**: Open GitHub issue with tag `zotero-integration`
- **Feature Requests**: Open GitHub discussion with tag `enhancement`
- **Documentation**: See `/database/ZOTERO_SCHEMA_DESIGN.md`

## Version History

- **v1.0** (2024-01-15): Initial schema design and documentation
- **v1.1** (TBD): Implementation and testing
- **v2.0** (TBD): Bidirectional sync and conflict resolution
- **v3.0** (TBD): Real-time sync and webhooks

---

**Status**: Schema Complete ✅ | Implementation Pending ⏳ | Testing Pending ⏳
