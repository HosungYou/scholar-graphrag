# ADR-001: Concept-Centric Knowledge Graph Architecture

**Status**: Accepted
**Date**: 2025-01-07
**Deciders**: Development Team
**Related Sessions**: Initial architecture design

---

## Context

ScholaRAG_Graph needs to visualize academic literature as a knowledge graph. Traditional approaches create nodes for every paper and author, leading to:
- "Hub-and-spoke" graphs dominated by highly-cited papers
- Visual clutter with thousands of paper nodes
- Difficulty finding conceptual patterns across literature

---

## Decision Drivers

1. **Visual Clarity**: Users need to see conceptual relationships, not citation networks
2. **Scalability**: Must handle 100+ papers without overwhelming the UI
3. **Research Focus**: Concepts, methods, and findings are more actionable than paper metadata
4. **Deduplication**: Same concept appearing in multiple papers should be one node

---

## Considered Options

### Option 1: Paper-Centric Graph
**Description**: Every paper is a node, with edges for citations and authorship

| Pros | Cons |
|------|------|
| Complete data representation | Visually overwhelming |
| Direct paper navigation | Hides conceptual patterns |
| Familiar citation network | Hard to identify research gaps |

### Option 2: Hybrid Graph
**Description**: Show papers AND concepts as equal nodes

| Pros | Cons |
|------|------|
| Comprehensive view | Complex filtering needed |
| Multiple perspectives | Performance concerns |

### Option 3: Concept-Centric Graph (Selected)
**Description**: Papers/Authors stored as metadata, only Concepts/Methods/Findings visualized

| Pros | Cons |
|------|------|
| Clear conceptual view | Papers not directly visible |
| Scalable visualization | Requires LLM extraction |
| Research gap detection | Higher processing cost |

---

## Decision

We will implement **Concept-Centric Graph** architecture:

1. **Papers and Authors** → Stored as `paper_metadata` table, NOT as graph nodes
2. **Concepts, Methods, Findings** → Stored as `entities` table, visualized as nodes
3. **Relationships** → Only between concept-level entities

### Technical Approach

```sql
-- Papers are metadata, not entities
CREATE TABLE paper_metadata (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    title TEXT,
    abstract TEXT,
    -- ... other fields
);

-- Only concepts are graph entities
CREATE TABLE entities (
    id UUID PRIMARY KEY,
    entity_type entity_type_enum, -- Concept, Method, Finding
    name TEXT,
    embedding vector(1536)
);

-- Relationships link concepts, not papers
CREATE TABLE relationships (
    source_id UUID REFERENCES entities(id),
    target_id UUID REFERENCES entities(id),
    relationship_type TEXT
);
```

---

## Consequences

### Positive
- Clean, scannable knowledge graphs
- Easy to spot research gaps (isolated concept clusters)
- Concepts from multiple papers merge into single nodes
- Better LLM reasoning over conceptual relationships

### Negative
- Cannot directly click paper nodes in graph - Mitigation: Paper list in sidebar
- Requires LLM for entity extraction - Mitigation: Caching and batch processing
- Some metadata loss in visualization - Mitigation: Detailed node inspection panel

### Neutral
- Changes how users think about literature visualization
- Requires user education on concept-centric approach

---

## Implementation Notes

### Files Affected
- `backend/graph/entity_extractor.py` - Extract concepts from abstracts
- `backend/importers/scholarag_importer.py` - Import papers as metadata
- `database/migrations/004_concept_centric.sql` - Schema changes
- `frontend/components/graph/KnowledgeGraph.tsx` - Only render concept nodes

### Migration Strategy
- Existing projects: Re-extract concepts from paper abstracts
- New projects: Concept extraction in import pipeline

---

## Validation Criteria

- [x] Papers stored in `paper_metadata`, not `entities`
- [x] Graph shows only Concept/Method/Finding nodes
- [x] Same concept from multiple papers = single node
- [x] Paper details accessible via node inspection

---

## References

- [AGENTiGraph Paper](https://arxiv.org/abs/example)
- [DOCS/architecture/overview.md](../architecture/overview.md)
