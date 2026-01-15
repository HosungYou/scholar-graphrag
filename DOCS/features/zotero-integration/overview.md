# Zotero Hybrid Import → Knowledge Graph Integration Design
## ScholaRAG_Graph_Review

**Date**: 2026-01-15
**Version**: 1.0
**Status**: Design Phase

---

## 1. Executive Summary

This document designs the integration between **Zotero Hybrid Import** and the **Knowledge Graph system** in ScholaRAG_Graph_Review. The goal is to merge metadata from Zotero with PDF-extracted entities using LLM, while tracking data sources (NodeSource) and implementing deduplication through a CanonicalEntityRegistry.

### Key Requirements
1. **Zotero Metadata → Entity Conversion**: Transform Zotero items (authors, tags, notes) into graph entities
2. **LLM + Zotero Data Fusion**: Merge LLM-extracted concepts with Zotero metadata
3. **Source Tracking**: Track whether each entity came from Zotero, PDF/LLM, or both
4. **Deduplication**: Canonical entity registry to merge duplicate concepts
5. **Integration with Existing System**: Work with current `entity_extractor.py` and `relationship_builder.py`

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                  Zotero Hybrid Import Pipeline                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [1] ZoteroClient → Fetch Collection                              │
│       ↓                                                            │
│  [2] ZoteroMetadataExtractor → Create entities from:              │
│       - Authors (Person entities)                                 │
│       - Tags (Concept entities with low confidence)               │
│       - Notes (Finding/Problem entities)                          │
│       - Collections (as properties)                               │
│       ↓                                                            │
│  [3] PDF Download (optional, based on import mode)                │
│       ↓                                                            │
│  [4] LLM Entity Extraction (existing EntityExtractor)             │
│       - Concepts, Methods, Findings, Problems                     │
│       ↓                                                            │
│  [5] EntityMerger → Merge Zotero + LLM entities                   │
│       - CanonicalEntityRegistry for deduplication                 │
│       - NodeSource tracking (zotero, llm, both)                   │
│       ↓                                                            │
│  [6] RelationshipBuilder → Create relationships                   │
│       - AUTHORED_BY (Paper → Author from Zotero)                  │
│       - DISCUSSES_CONCEPT (Paper → Concept from LLM or tags)      │
│       - RELATED_TO (Concept ↔ Concept via embeddings)             │
│       ↓                                                            │
│  [7] GraphStore → Store entities + relationships                  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
Zotero Collection
    ↓
┌───────────────────────────────────────────────────────────┐
│ ZoteroItem (Paper)                                        │
│ - title, abstract, authors, tags, notes, DOI             │
└───────────────────────────────────────────────────────────┘
    ↓                                 ↓
    ↓                                 ↓
[Zotero Path]                    [LLM Path]
    ↓                                 ↓
ZoteroMetadataExtractor          EntityExtractor (existing)
    ↓                                 ↓
Creates:                         Creates:
- Paper entity                   - Concept entities (from abstract)
- Author entities                - Method entities
- Tag→Concept (low conf)         - Finding entities
- Note→Finding/Problem           - Problem entities (research questions)
    ↓                                 ↓
    ↓                                 ↓
    └─────────────┬───────────────────┘
                  ↓
          ┌──────────────────┐
          │  EntityMerger    │
          │                  │
          │ Deduplication:   │
          │ - Name matching  │
          │ - Embedding sim  │
          │                  │
          │ NodeSource:      │
          │ - zotero         │
          │ - llm            │
          │ - both           │
          └──────────────────┘
                  ↓
          Merged Entity List
                  ↓
          RelationshipBuilder
                  ↓
          GraphStore (PostgreSQL)
```

---

## 3. Core Components Design

### 3.1 NodeSource Enumeration

Track the origin of each entity for transparency and debugging.

```python
# backend/graph/node_source.py

from enum import Enum

class NodeSource(str, Enum):
    """
    Tracks the data source for each entity in the knowledge graph.

    Values:
        ZOTERO: Entity created from Zotero metadata (authors, tags, notes)
        LLM: Entity extracted from PDF using LLM (concepts, methods, findings)
        BOTH: Entity exists in both sources and has been merged
        USER: Manually created by user
    """
    ZOTERO = "zotero"
    LLM = "llm"
    BOTH = "both"
    USER = "user"
```

### 3.2 CanonicalEntityRegistry

Manages entity deduplication and canonical name resolution.

```python
# backend/graph/canonical_entity_registry.py

"""
Canonical Entity Registry

Manages entity deduplication by:
1. Name-based matching (with synonym support)
2. Embedding-based similarity matching
3. Canonical name resolution
4. Source tracking and merging

Example:
    - LLM extracts: "AI" (confidence: 0.9)
    - Zotero tag: "artificial intelligence"
    - Registry merges them → canonical: "artificial intelligence"
      with source=BOTH, confidence=max(0.9, zotero_conf)
"""

import logging
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from .entity_extractor import ExtractedEntity, EntityType
from .node_source import NodeSource

logger = logging.getLogger(__name__)


@dataclass
class CanonicalEntity:
    """
    Represents a canonical (deduplicated) entity.

    Attributes:
        canonical_id: Unique identifier for this canonical entity
        entity_type: Type of entity (Concept, Method, etc.)
        canonical_name: The chosen canonical name
        aliases: Alternative names that map to this entity
        sources: Set of NodeSource values (zotero, llm, both)
        confidence: Merged confidence score
        merged_from: List of original ExtractedEntity IDs that were merged
        embedding: Representative embedding (averaged if multiple)
        properties: Merged properties from all sources
    """
    canonical_id: str
    entity_type: EntityType
    canonical_name: str
    aliases: Set[str] = field(default_factory=set)
    sources: Set[NodeSource] = field(default_factory=set)
    confidence: float = 0.0
    merged_from: List[str] = field(default_factory=list)
    embedding: Optional[np.ndarray] = None
    properties: Dict = field(default_factory=dict)

    def add_source(self, source: NodeSource):
        """Add a data source to this entity."""
        self.sources.add(source)

        # Update canonical source designation
        if len(self.sources) > 1:
            self.sources = {NodeSource.BOTH}

    def merge_embedding(self, new_embedding: Optional[np.ndarray]):
        """Merge a new embedding via averaging."""
        if new_embedding is None:
            return

        if self.embedding is None:
            self.embedding = new_embedding
        else:
            # Average embeddings
            self.embedding = (self.embedding + new_embedding) / 2


class CanonicalEntityRegistry:
    """
    Registry for managing canonical entities and deduplication.

    Features:
    - Name-based matching with synonym support
    - Embedding-based similarity matching
    - Confidence-based canonical name selection
    - Multi-source entity merging

    Usage:
        registry = CanonicalEntityRegistry(similarity_threshold=0.85)

        # Add LLM-extracted entities
        llm_entities = extractor.extract_from_paper(title, abstract)
        for entity in llm_entities['concepts']:
            registry.register_entity(entity, source=NodeSource.LLM)

        # Add Zotero tag entities
        for tag in zotero_tags:
            tag_entity = ExtractedEntity(
                entity_type=EntityType.CONCEPT,
                name=tag,
                confidence=0.6,
                source_paper_id=paper_id
            )
            registry.register_entity(tag_entity, source=NodeSource.ZOTERO)

        # Get deduplicated results
        canonical_entities = registry.get_all_canonical()
    """

    def __init__(
        self,
        name_similarity_threshold: float = 0.85,
        embedding_similarity_threshold: float = 0.80,
    ):
        """
        Initialize the registry.

        Args:
            name_similarity_threshold: Minimum similarity for name-based matching
            embedding_similarity_threshold: Minimum cosine similarity for embeddings
        """
        self.name_threshold = name_similarity_threshold
        self.embedding_threshold = embedding_similarity_threshold

        # Canonical entity storage
        self._canonical: Dict[str, CanonicalEntity] = {}

        # Mapping: (entity_type, normalized_name) → canonical_id
        self._name_index: Dict[Tuple[EntityType, str], str] = {}

        # Manual synonym mappings (pre-configured)
        self._synonyms: Dict[str, str] = {}
        self._load_default_synonyms()

    def _load_default_synonyms(self):
        """Load pre-configured academic synonyms."""
        # Same as in entity_extractor.py DEFAULT_SYNONYMS
        synonyms = [
            ("artificial intelligence", "ai", "A.I."),
            ("machine learning", "ml", "M.L."),
            ("natural language processing", "nlp", "N.L.P."),
            ("large language model", "llm", "L.L.M.", "large language models"),
            ("randomized controlled trial", "rct", "R.C.T."),
            ("chatbot", "chat bot", "conversational agent", "dialogue system"),
            ("deep learning", "dl", "D.L."),
            ("neural network", "nn", "neural net", "neural networks"),
        ]

        for group in synonyms:
            canonical = group[0]
            for synonym in group[1:]:
                self._synonyms[synonym.lower()] = canonical.lower()

    def add_synonym(self, canonical: str, *synonyms: str):
        """Add a manual synonym mapping."""
        canonical_lower = canonical.lower()
        for syn in synonyms:
            self._synonyms[syn.lower()] = canonical_lower

    def _normalize_name(self, name: str) -> str:
        """
        Normalize entity name for comparison.

        Steps:
        1. Lowercase
        2. Strip whitespace
        3. Resolve synonyms
        """
        normalized = name.strip().lower()
        return self._synonyms.get(normalized, normalized)

    def _compute_name_similarity(self, name1: str, name2: str) -> float:
        """
        Compute similarity between two names.

        Uses Jaccard similarity on word sets.

        Returns:
            Similarity score 0.0-1.0
        """
        words1 = set(name1.lower().split())
        words2 = set(name2.lower().split())

        if not words1 or not words2:
            return 0.0

        intersection = words1 & words2
        union = words1 | words2

        return len(intersection) / len(union) if union else 0.0

    def _find_matching_canonical(
        self,
        entity: ExtractedEntity,
    ) -> Optional[str]:
        """
        Find a matching canonical entity for deduplication.

        Matching strategies (in order):
        1. Exact normalized name match
        2. Name similarity above threshold
        3. Embedding similarity above threshold (if embedding available)

        Args:
            entity: Entity to find match for

        Returns:
            Canonical ID if match found, else None
        """
        normalized_name = self._normalize_name(entity.name)

        # Strategy 1: Exact normalized name match
        exact_key = (entity.entity_type, normalized_name)
        if exact_key in self._name_index:
            return self._name_index[exact_key]

        # Strategy 2: Name similarity matching
        for (etype, stored_name), canonical_id in self._name_index.items():
            if etype != entity.entity_type:
                continue

            similarity = self._compute_name_similarity(normalized_name, stored_name)
            if similarity >= self.name_threshold:
                logger.debug(
                    f"Name match: '{entity.name}' ~ '{stored_name}' "
                    f"(similarity: {similarity:.2f})"
                )
                return canonical_id

        # Strategy 3: Embedding similarity (if available)
        if entity.properties.get("embedding") is not None:
            entity_emb = np.array(entity.properties["embedding"]).reshape(1, -1)

            for canonical_id, canonical in self._canonical.items():
                if canonical.entity_type != entity.entity_type:
                    continue

                if canonical.embedding is not None:
                    canonical_emb = canonical.embedding.reshape(1, -1)
                    similarity = cosine_similarity(entity_emb, canonical_emb)[0][0]

                    if similarity >= self.embedding_threshold:
                        logger.debug(
                            f"Embedding match: '{entity.name}' ~ '{canonical.canonical_name}' "
                            f"(similarity: {similarity:.2f})"
                        )
                        return canonical_id

        return None

    def register_entity(
        self,
        entity: ExtractedEntity,
        source: NodeSource,
        entity_id: Optional[str] = None,
    ) -> str:
        """
        Register an entity in the registry.

        If a matching canonical entity exists, merge with it.
        Otherwise, create a new canonical entity.

        Args:
            entity: The entity to register
            source: Data source (ZOTERO, LLM, etc.)
            entity_id: Optional custom ID for this entity instance

        Returns:
            Canonical ID that this entity maps to
        """
        # Find matching canonical entity
        canonical_id = self._find_matching_canonical(entity)

        if canonical_id:
            # Merge with existing canonical entity
            canonical = self._canonical[canonical_id]

            # Add alias
            canonical.aliases.add(entity.name.lower())

            # Add source
            canonical.add_source(source)

            # Update confidence (take maximum)
            canonical.confidence = max(canonical.confidence, entity.confidence)

            # Merge embedding
            if entity.properties.get("embedding"):
                canonical.merge_embedding(
                    np.array(entity.properties["embedding"])
                )

            # Track merged entity
            if entity_id:
                canonical.merged_from.append(entity_id)

            # Merge properties (source-prefixed to avoid conflicts)
            source_prefix = source.value
            for key, value in entity.properties.items():
                if key != "embedding":  # Skip embeddings
                    canonical.properties[f"{source_prefix}_{key}"] = value

            logger.debug(
                f"Merged '{entity.name}' → '{canonical.canonical_name}' "
                f"(sources: {canonical.sources})"
            )

            return canonical_id

        else:
            # Create new canonical entity
            import uuid
            canonical_id = str(uuid.uuid4())

            embedding = None
            if entity.properties.get("embedding"):
                embedding = np.array(entity.properties["embedding"])

            canonical = CanonicalEntity(
                canonical_id=canonical_id,
                entity_type=entity.entity_type,
                canonical_name=entity.name.lower(),
                aliases={entity.name.lower()},
                sources={source},
                confidence=entity.confidence,
                merged_from=[entity_id] if entity_id else [],
                embedding=embedding,
                properties=entity.properties.copy(),
            )

            self._canonical[canonical_id] = canonical

            # Index by normalized name
            normalized_name = self._normalize_name(entity.name)
            self._name_index[(entity.entity_type, normalized_name)] = canonical_id

            logger.debug(
                f"Created canonical entity: '{canonical.canonical_name}' "
                f"(source: {source})"
            )

            return canonical_id

    def get_canonical(self, canonical_id: str) -> Optional[CanonicalEntity]:
        """Get a canonical entity by ID."""
        return self._canonical.get(canonical_id)

    def get_all_canonical(self) -> List[CanonicalEntity]:
        """Get all canonical entities."""
        return list(self._canonical.values())

    def get_by_entity_type(self, entity_type: EntityType) -> List[CanonicalEntity]:
        """Get all canonical entities of a specific type."""
        return [
            c for c in self._canonical.values()
            if c.entity_type == entity_type
        ]

    def get_statistics(self) -> Dict:
        """
        Get registry statistics.

        Returns:
            Dict with counts by entity type and source
        """
        stats = {
            "total_canonical": len(self._canonical),
            "by_type": defaultdict(int),
            "by_source": defaultdict(int),
            "merged_count": 0,
        }

        for canonical in self._canonical.values():
            stats["by_type"][canonical.entity_type.value] += 1

            for source in canonical.sources:
                stats["by_source"][source.value] += 1

            if len(canonical.merged_from) > 1:
                stats["merged_count"] += 1

        return dict(stats)
```

### 3.3 ZoteroMetadataExtractor

Converts Zotero items into graph entities.

```python
# backend/graph/zotero_metadata_extractor.py

"""
Zotero Metadata Extractor

Converts Zotero items (papers, authors, tags, notes) into graph entities.
Works alongside LLM-based EntityExtractor for hybrid entity extraction.
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from .entity_extractor import ExtractedEntity, EntityType
from .node_source import NodeSource
from ..integrations.zotero import ZoteroItem

logger = logging.getLogger(__name__)


@dataclass
class ZoteroExtractedEntities:
    """
    Entities extracted from a Zotero item.

    Attributes:
        paper_id: ID of the paper entity
        authors: Author entities
        concepts: Concept entities (from tags)
        problems: Problem entities (from notes)
        findings: Finding entities (from notes)
    """
    paper_id: str
    authors: List[ExtractedEntity]
    concepts: List[ExtractedEntity]
    problems: List[ExtractedEntity]
    findings: List[ExtractedEntity]


class ZoteroMetadataExtractor:
    """
    Extracts entities from Zotero metadata.

    Entity Mapping:
    - ZoteroItem → Paper (entity_type=PAPER)
    - Creators (authors) → Author (entity_type=AUTHOR)
    - Tags → Concept (entity_type=CONCEPT, low confidence)
    - Notes → Problem or Finding (heuristic-based)

    Confidence Levels:
    - Author: 1.0 (metadata is always accurate)
    - Tag→Concept: 0.6 (tags are user-assigned, less precise than LLM)
    - Note→Problem: 0.5 (heuristic extraction)
    - Note→Finding: 0.5
    """

    def __init__(self):
        """Initialize extractor."""
        pass

    def extract_from_zotero_item(
        self,
        item: ZoteroItem,
        paper_id: str,
    ) -> ZoteroExtractedEntities:
        """
        Extract entities from a Zotero item.

        Args:
            item: Zotero item (paper)
            paper_id: Graph entity ID for this paper

        Returns:
            ZoteroExtractedEntities with all extracted entities
        """
        authors = self._extract_authors(item, paper_id)
        concepts = self._extract_concepts_from_tags(item, paper_id)
        problems, findings = self._extract_from_notes(item, paper_id)

        return ZoteroExtractedEntities(
            paper_id=paper_id,
            authors=authors,
            concepts=concepts,
            problems=problems,
            findings=findings,
        )

    def _extract_authors(
        self,
        item: ZoteroItem,
        paper_id: str,
    ) -> List[ExtractedEntity]:
        """
        Extract author entities from Zotero creators.

        Returns:
            List of Author entities
        """
        authors = []

        for creator in item.creators:
            if creator.get("creatorType") != "author":
                continue

            # Build full name
            name_parts = []
            if creator.get("firstName"):
                name_parts.append(creator["firstName"])
            if creator.get("lastName"):
                name_parts.append(creator["lastName"])
            if creator.get("name"):
                name_parts.append(creator["name"])

            if not name_parts:
                continue

            full_name = " ".join(name_parts)

            authors.append(
                ExtractedEntity(
                    entity_type=EntityType.AUTHOR,
                    name=full_name,
                    confidence=1.0,  # Metadata is always accurate
                    source_paper_id=paper_id,
                    properties={
                        "first_name": creator.get("firstName"),
                        "last_name": creator.get("lastName"),
                    }
                )
            )

        return authors

    def _extract_concepts_from_tags(
        self,
        item: ZoteroItem,
        paper_id: str,
    ) -> List[ExtractedEntity]:
        """
        Extract concept entities from Zotero tags.

        Tags are treated as concepts with lower confidence (0.6)
        since they're user-assigned and less precise than LLM extraction.

        Returns:
            List of Concept entities
        """
        concepts = []

        for tag_obj in item.tags:
            tag = tag_obj.get("tag")
            if not tag:
                continue

            concepts.append(
                ExtractedEntity(
                    entity_type=EntityType.CONCEPT,
                    name=tag,
                    definition=f"User-tagged concept: {tag}",
                    confidence=0.6,  # Lower than LLM extraction
                    source_paper_id=paper_id,
                    properties={
                        "tag_type": tag_obj.get("type", "automatic"),
                    }
                )
            )

        return concepts

    def _extract_from_notes(
        self,
        item: ZoteroItem,
        paper_id: str,
    ) -> tuple[List[ExtractedEntity], List[ExtractedEntity]]:
        """
        Extract Problem and Finding entities from Zotero notes.

        Heuristics:
        - Notes containing "?", "research question", "problem" → Problem
        - Notes containing "found", "result", "showed", "evidence" → Finding

        Returns:
            Tuple of (problems, findings)
        """
        problems = []
        findings = []

        for note_text in item.notes:
            if not note_text:
                continue

            note_lower = note_text.lower()

            # Heuristic classification
            is_problem = any(
                keyword in note_lower
                for keyword in ["?", "research question", "problem", "gap", "investigate"]
            )

            is_finding = any(
                keyword in note_lower
                for keyword in ["found", "result", "showed", "evidence", "demonstrated", "revealed"]
            )

            if is_problem:
                problems.append(
                    ExtractedEntity(
                        entity_type=EntityType.PROBLEM,
                        name=note_text[:200],  # First 200 chars
                        description=note_text,
                        confidence=0.5,  # Heuristic extraction
                        source_paper_id=paper_id,
                    )
                )

            if is_finding:
                findings.append(
                    ExtractedEntity(
                        entity_type=EntityType.FINDING,
                        name=note_text[:200],
                        description=note_text,
                        confidence=0.5,
                        source_paper_id=paper_id,
                    )
                )

        return problems, findings
```

### 3.4 EntityMerger

Orchestrates the merging of Zotero and LLM entities.

```python
# backend/graph/entity_merger.py

"""
Entity Merger

Merges entities from multiple sources (Zotero metadata and LLM extraction)
using the CanonicalEntityRegistry for deduplication.
"""

import logging
from typing import List, Dict, Any

from .entity_extractor import ExtractedEntity, EntityType
from .canonical_entity_registry import CanonicalEntityRegistry, CanonicalEntity
from .node_source import NodeSource
from .zotero_metadata_extractor import ZoteroExtractedEntities

logger = logging.getLogger(__name__)


class EntityMerger:
    """
    Merges entities from Zotero and LLM sources.

    Workflow:
    1. Create CanonicalEntityRegistry
    2. Register Zotero entities with source=ZOTERO
    3. Register LLM entities with source=LLM
    4. Deduplication happens automatically in registry
    5. Return merged canonical entities

    Example:
        merger = EntityMerger()

        canonical_entities = merger.merge(
            zotero_entities=zotero_extracted,
            llm_entities=llm_extracted,
        )

        # canonical_entities now contains deduplicated entities
        # with source tracking (zotero, llm, or both)
    """

    def __init__(
        self,
        name_similarity_threshold: float = 0.85,
        embedding_similarity_threshold: float = 0.80,
    ):
        """
        Initialize merger.

        Args:
            name_similarity_threshold: Threshold for name-based matching
            embedding_similarity_threshold: Threshold for embedding similarity
        """
        self.name_threshold = name_similarity_threshold
        self.embedding_threshold = embedding_similarity_threshold

    def merge(
        self,
        zotero_entities: ZoteroExtractedEntities,
        llm_entities: Dict[str, List[ExtractedEntity]],
    ) -> List[CanonicalEntity]:
        """
        Merge Zotero and LLM entities with deduplication.

        Args:
            zotero_entities: Entities extracted from Zotero metadata
            llm_entities: Entities extracted by LLM (from entity_extractor)
                Format: {"concepts": [...], "methods": [...], etc.}

        Returns:
            List of canonical (deduplicated) entities
        """
        registry = CanonicalEntityRegistry(
            name_similarity_threshold=self.name_threshold,
            embedding_similarity_threshold=self.embedding_threshold,
        )

        # Register Zotero entities
        logger.info("Registering Zotero entities...")
        self._register_zotero_entities(registry, zotero_entities)

        # Register LLM entities
        logger.info("Registering LLM entities...")
        self._register_llm_entities(registry, llm_entities)

        # Get deduplicated results
        canonical_entities = registry.get_all_canonical()

        # Log statistics
        stats = registry.get_statistics()
        logger.info(
            f"Entity merge complete: {stats['total_canonical']} canonical entities "
            f"({stats['merged_count']} merged from multiple sources)"
        )
        logger.info(f"By type: {dict(stats['by_type'])}")
        logger.info(f"By source: {dict(stats['by_source'])}")

        return canonical_entities

    def _register_zotero_entities(
        self,
        registry: CanonicalEntityRegistry,
        zotero_entities: ZoteroExtractedEntities,
    ):
        """Register all Zotero-extracted entities."""
        # Register authors
        for author in zotero_entities.authors:
            registry.register_entity(author, source=NodeSource.ZOTERO)

        # Register concepts (from tags)
        for concept in zotero_entities.concepts:
            registry.register_entity(concept, source=NodeSource.ZOTERO)

        # Register problems (from notes)
        for problem in zotero_entities.problems:
            registry.register_entity(problem, source=NodeSource.ZOTERO)

        # Register findings (from notes)
        for finding in zotero_entities.findings:
            registry.register_entity(finding, source=NodeSource.ZOTERO)

    def _register_llm_entities(
        self,
        registry: CanonicalEntityRegistry,
        llm_entities: Dict[str, List[ExtractedEntity]],
    ):
        """Register all LLM-extracted entities."""
        # Register concepts
        for concept in llm_entities.get("concepts", []):
            registry.register_entity(concept, source=NodeSource.LLM)

        # Register methods
        for method in llm_entities.get("methods", []):
            registry.register_entity(method, source=NodeSource.LLM)

        # Register findings
        for finding in llm_entities.get("findings", []):
            registry.register_entity(finding, source=NodeSource.LLM)

        # Register problems
        for problem in llm_entities.get("problems", []):
            registry.register_entity(problem, source=NodeSource.LLM)

        # Register innovations
        for innovation in llm_entities.get("innovations", []):
            registry.register_entity(innovation, source=NodeSource.LLM)

        # Register limitations
        for limitation in llm_entities.get("limitations", []):
            registry.register_entity(limitation, source=NodeSource.LLM)
```

---

## 4. Integration with Existing Components

### 4.1 Modified `entity_extractor.py`

No changes needed. Existing `EntityExtractor` continues to work as-is. The `EntityMerger` consumes its output.

### 4.2 Modified `relationship_builder.py`

Add support for `NodeSource` tracking in relationship properties.

```python
# In backend/graph/relationship_builder.py

# Add to RelationshipCandidate properties:
properties={
    "source": source.value,  # Track relationship source
    "confidence": confidence,
    ...
}
```

### 4.3 Modified `graph_store.py`

Update `Node` dataclass to include `source` field:

```python
# In backend/graph/graph_store.py

@dataclass
class Node:
    """Graph node representing an entity."""

    id: str
    project_id: str
    entity_type: str
    name: str
    properties: dict
    embedding: Optional[list[float]] = None
    source: str = "llm"  # NEW: Track node source (zotero, llm, both, user)
```

---

## 5. Implementation Files

### File Structure

```
backend/
├── graph/
│   ├── node_source.py                    # NEW: NodeSource enum
│   ├── canonical_entity_registry.py      # NEW: Deduplication registry
│   ├── zotero_metadata_extractor.py      # NEW: Zotero → entities
│   ├── entity_merger.py                  # NEW: Merge Zotero + LLM
│   ├── entity_extractor.py               # EXISTING: No changes
│   ├── relationship_builder.py           # MODIFIED: Add source tracking
│   └── graph_store.py                    # MODIFIED: Add source field to Node
├── importers/
│   └── zotero_hybrid_importer.py         # NEW: Main orchestrator
└── tests/
    ├── test_canonical_entity_registry.py # NEW: Test deduplication
    ├── test_entity_merger.py             # NEW: Test merging
    └── test_zotero_metadata_extractor.py # NEW: Test Zotero extraction
```

### Main Orchestrator: ZoteroHybridImporter

```python
# backend/importers/zotero_hybrid_importer.py

"""
Zotero Hybrid Importer

Main orchestrator for importing Zotero collections with hybrid entity extraction.
Combines Zotero metadata with LLM-based PDF analysis.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from enum import Enum

from ..integrations.zotero import ZoteroClient, ZoteroItem
from ..graph.entity_extractor import EntityExtractor
from ..graph.zotero_metadata_extractor import ZoteroMetadataExtractor
from ..graph.entity_merger import EntityMerger
from ..graph.relationship_builder import ConceptCentricRelationshipBuilder
from ..graph.graph_store import GraphStore
from ..graph.node_source import NodeSource

logger = logging.getLogger(__name__)


class ImportMode(str, Enum):
    """
    Import modes defining trade-offs between speed, cost, and quality.
    """
    ZOTERO_ONLY = "zotero_only"      # Metadata only, no LLM (free, fast)
    SELECTIVE = "selective"           # Metadata + methods/findings ($0.01/paper)
    FULL = "full"                     # Complete extraction ($0.02/paper)


class ZoteroHybridImporter:
    """
    Imports Zotero collections into knowledge graph with hybrid entity extraction.

    Workflow:
    1. Fetch items from Zotero collection
    2. For each item:
        a. Extract metadata entities (authors, tags, notes)
        b. (Optional) Extract LLM entities from PDF
        c. Merge entities via CanonicalEntityRegistry
        d. Build relationships
        e. Store in GraphStore

    Import Modes:
        - ZOTERO_ONLY: Metadata only (no PDF download, no LLM)
        - SELECTIVE: Metadata + LLM extraction of methods/findings
        - FULL: Complete LLM entity extraction

    Example:
        importer = ZoteroHybridImporter(
            zotero_client=client,
            graph_store=store,
            llm_provider=llm,
        )

        result = await importer.import_collection(
            collection_key="ABC123",
            project_id="project-uuid",
            mode=ImportMode.SELECTIVE,
        )
    """

    def __init__(
        self,
        zotero_client: ZoteroClient,
        graph_store: GraphStore,
        llm_provider=None,
    ):
        """
        Initialize importer.

        Args:
            zotero_client: Zotero API client
            graph_store: Graph storage backend
            llm_provider: LLM provider for entity extraction (optional)
        """
        self.zotero = zotero_client
        self.graph = graph_store
        self.llm = llm_provider

        self.zotero_extractor = ZoteroMetadataExtractor()
        self.llm_extractor = EntityExtractor(llm_provider=llm_provider)
        self.entity_merger = EntityMerger()
        self.relationship_builder = ConceptCentricRelationshipBuilder(llm_provider=llm_provider)

    async def import_collection(
        self,
        collection_key: str,
        project_id: str,
        mode: ImportMode = ImportMode.SELECTIVE,
        progress_callback=None,
    ) -> Dict[str, Any]:
        """
        Import a Zotero collection into the knowledge graph.

        Args:
            collection_key: Zotero collection key
            project_id: Graph project ID
            mode: Import mode (zotero_only, selective, full)
            progress_callback: Optional callback(current, total, message)

        Returns:
            Import statistics dict
        """
        logger.info(f"Starting Zotero hybrid import: collection={collection_key}, mode={mode}")

        # Fetch collection items
        items = await self.zotero.get_items_all(collection_key=collection_key)
        total_items = len(items)

        logger.info(f"Fetched {total_items} items from Zotero")

        if progress_callback:
            progress_callback(0, total_items, "Fetching items from Zotero...")

        # Statistics
        stats = {
            "items_processed": 0,
            "papers_imported": 0,
            "entities_created": 0,
            "relationships_created": 0,
            "errors": [],
        }

        # Process each item
        for i, item in enumerate(items):
            try:
                await self._import_single_item(
                    item=item,
                    project_id=project_id,
                    mode=mode,
                )

                stats["items_processed"] += 1
                stats["papers_imported"] += 1

                if progress_callback:
                    progress_callback(
                        i + 1,
                        total_items,
                        f"Processing: {item.title[:50]}..."
                    )

            except Exception as e:
                logger.error(f"Failed to import item '{item.title}': {e}")
                stats["errors"].append({
                    "item_key": item.key,
                    "title": item.title,
                    "error": str(e),
                })

        # Build relationships across all papers
        logger.info("Building cross-paper relationships...")
        await self._build_cross_paper_relationships(project_id)

        logger.info(f"Import complete: {stats}")
        return stats

    async def _import_single_item(
        self,
        item: ZoteroItem,
        project_id: str,
        mode: ImportMode,
    ):
        """
        Import a single Zotero item.

        Steps:
        1. Create Paper entity
        2. Extract Zotero metadata entities
        3. (Optional) Extract LLM entities
        4. Merge entities
        5. Store in graph
        6. Build relationships
        """
        # Step 1: Create Paper entity
        paper_id = await self.graph.add_entity(
            project_id=project_id,
            entity_type="Paper",
            name=item.title,
            properties={
                "abstract": item.abstract,
                "year": item.year,
                "doi": item.doi,
                "url": item.url,
                "journal": item.publication_title,
                "zotero_key": item.key,
                "source": NodeSource.ZOTERO.value,
            }
        )

        # Step 2: Extract Zotero metadata
        zotero_entities = self.zotero_extractor.extract_from_zotero_item(
            item=item,
            paper_id=paper_id,
        )

        # Step 3: Extract LLM entities (mode-dependent)
        llm_entities = {}
        if mode != ImportMode.ZOTERO_ONLY and self.llm:
            llm_entities = await self.llm_extractor.extract_from_paper(
                title=item.title,
                abstract=item.abstract or "",
                paper_id=paper_id,
                use_accurate_model=(mode == ImportMode.FULL),
            )

        # Step 4: Merge entities
        canonical_entities = self.entity_merger.merge(
            zotero_entities=zotero_entities,
            llm_entities=llm_entities,
        )

        # Step 5: Store entities in graph
        entity_id_mapping = {}  # canonical_id → graph_id

        for canonical in canonical_entities:
            graph_id = await self.graph.add_entity(
                project_id=project_id,
                entity_type=canonical.entity_type.value,
                name=canonical.canonical_name,
                properties={
                    **canonical.properties,
                    "aliases": list(canonical.aliases),
                    "sources": [s.value for s in canonical.sources],
                    "confidence": canonical.confidence,
                },
                embedding=canonical.embedding.tolist() if canonical.embedding is not None else None,
            )
            entity_id_mapping[canonical.canonical_id] = graph_id

        # Step 6: Build relationships
        # AUTHORED_BY relationships (Paper → Author)
        for author in zotero_entities.authors:
            # Find canonical ID for this author
            for canonical in canonical_entities:
                if author.name.lower() in canonical.aliases:
                    author_graph_id = entity_id_mapping[canonical.canonical_id]

                    await self.graph.add_relationship(
                        project_id=project_id,
                        source_id=paper_id,
                        target_id=author_graph_id,
                        relationship_type="AUTHORED_BY",
                        properties={"source": NodeSource.ZOTERO.value},
                    )
                    break

        # DISCUSSES_CONCEPT relationships (Paper → Concept)
        for canonical in canonical_entities:
            if canonical.entity_type.value == "Concept":
                concept_graph_id = entity_id_mapping[canonical.canonical_id]

                await self.graph.add_relationship(
                    project_id=project_id,
                    source_id=paper_id,
                    target_id=concept_graph_id,
                    relationship_type="DISCUSSES_CONCEPT",
                    properties={
                        "source": list(canonical.sources)[0].value if canonical.sources else "unknown",
                        "confidence": canonical.confidence,
                    },
                )

    async def _build_cross_paper_relationships(self, project_id: str):
        """
        Build relationships across papers (concept-concept, etc.).

        This is done after all papers are imported to ensure full graph context.
        """
        # Get all concepts
        concepts = await self.graph.get_entities(
            project_id=project_id,
            entity_type="Concept",
        )

        # Build semantic similarity relationships
        semantic_rels = self.relationship_builder.build_semantic_relationships(
            concepts=concepts,
            similarity_threshold=0.7,
        )

        # Store relationships
        for rel in semantic_rels:
            await self.graph.add_relationship(
                project_id=project_id,
                source_id=rel.source_id,
                target_id=rel.target_id,
                relationship_type=rel.relationship_type,
                properties=rel.properties,
                weight=rel.confidence,
            )
```

---

## 6. Algorithm Pseudocode

### Entity Merging Algorithm

```
FUNCTION merge_entities(zotero_entities, llm_entities):
    registry = new CanonicalEntityRegistry()

    # Phase 1: Register Zotero entities
    FOR each entity IN zotero_entities:
        canonical_id = registry.find_match(entity)

        IF canonical_id EXISTS:
            # Merge with existing
            canonical = registry.get(canonical_id)
            canonical.add_alias(entity.name)
            canonical.add_source(ZOTERO)
            canonical.confidence = max(canonical.confidence, entity.confidence)
        ELSE:
            # Create new canonical
            registry.create_canonical(entity, source=ZOTERO)

    # Phase 2: Register LLM entities
    FOR each entity IN llm_entities:
        canonical_id = registry.find_match(entity)

        IF canonical_id EXISTS:
            # Merge with existing (possibly ZOTERO)
            canonical = registry.get(canonical_id)
            canonical.add_alias(entity.name)
            canonical.add_source(LLM)
            canonical.confidence = max(canonical.confidence, entity.confidence)

            # Mark as BOTH if previously ZOTERO
            IF ZOTERO IN canonical.sources:
                canonical.sources = {BOTH}
        ELSE:
            # Create new canonical
            registry.create_canonical(entity, source=LLM)

    RETURN registry.get_all_canonical()


FUNCTION find_match(entity) → canonical_id:
    # Strategy 1: Exact normalized name
    normalized = normalize_name(entity.name)
    IF (entity.type, normalized) IN name_index:
        RETURN name_index[(entity.type, normalized)]

    # Strategy 2: Name similarity
    FOR each (type, stored_name) IN name_index:
        IF type == entity.type:
            similarity = jaccard_similarity(normalized, stored_name)
            IF similarity >= 0.85:
                RETURN name_index[(type, stored_name)]

    # Strategy 3: Embedding similarity
    IF entity.embedding EXISTS:
        FOR each canonical IN registry:
            IF canonical.type == entity.type AND canonical.embedding EXISTS:
                similarity = cosine_similarity(entity.embedding, canonical.embedding)
                IF similarity >= 0.80:
                    RETURN canonical.id

    RETURN None
```

---

## 7. Class Design Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Core Data Models                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  NodeSource (Enum)                                                  │
│  ├─ ZOTERO                                                          │
│  ├─ LLM                                                             │
│  ├─ BOTH                                                            │
│  └─ USER                                                            │
│                                                                      │
│  CanonicalEntity (Dataclass)                                        │
│  ├─ canonical_id: str                                               │
│  ├─ entity_type: EntityType                                         │
│  ├─ canonical_name: str                                             │
│  ├─ aliases: Set[str]                                               │
│  ├─ sources: Set[NodeSource]                                        │
│  ├─ confidence: float                                               │
│  ├─ merged_from: List[str]                                          │
│  ├─ embedding: Optional[np.ndarray]                                 │
│  └─ properties: Dict                                                │
│                                                                      │
│  ZoteroExtractedEntities (Dataclass)                                │
│  ├─ paper_id: str                                                   │
│  ├─ authors: List[ExtractedEntity]                                  │
│  ├─ concepts: List[ExtractedEntity]                                 │
│  ├─ problems: List[ExtractedEntity]                                 │
│  └─ findings: List[ExtractedEntity]                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     Entity Processing Pipeline                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ZoteroMetadataExtractor                                            │
│  ├─ extract_from_zotero_item(item) → ZoteroExtractedEntities       │
│  ├─ _extract_authors(item) → List[Author]                          │
│  ├─ _extract_concepts_from_tags(item) → List[Concept]              │
│  └─ _extract_from_notes(item) → (problems, findings)               │
│                                                                      │
│  CanonicalEntityRegistry                                            │
│  ├─ register_entity(entity, source) → canonical_id                 │
│  ├─ _find_matching_canonical(entity) → Optional[canonical_id]      │
│  ├─ _normalize_name(name) → str                                    │
│  ├─ _compute_name_similarity(name1, name2) → float                 │
│  ├─ get_canonical(canonical_id) → CanonicalEntity                  │
│  ├─ get_all_canonical() → List[CanonicalEntity]                    │
│  └─ get_statistics() → Dict                                        │
│                                                                      │
│  EntityMerger                                                       │
│  ├─ merge(zotero_entities, llm_entities) → List[CanonicalEntity]  │
│  ├─ _register_zotero_entities(registry, entities)                  │
│  └─ _register_llm_entities(registry, entities)                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                         Main Orchestrator                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ZoteroHybridImporter                                               │
│  ├─ __init__(zotero_client, graph_store, llm_provider)             │
│  ├─ import_collection(key, project_id, mode) → stats               │
│  ├─ _import_single_item(item, project_id, mode)                    │
│  └─ _build_cross_paper_relationships(project_id)                   │
│                                                                      │
│  Dependencies:                                                      │
│  ├─ ZoteroClient (from integrations.zotero)                        │
│  ├─ GraphStore (from graph.graph_store)                            │
│  ├─ EntityExtractor (existing, from graph.entity_extractor)        │
│  ├─ ZoteroMetadataExtractor                                        │
│  ├─ EntityMerger                                                    │
│  └─ ConceptCentricRelationshipBuilder                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     Relationship Building                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Relationship Types (with source tracking):                         │
│  ├─ AUTHORED_BY (Paper → Author) [source: zotero]                  │
│  ├─ DISCUSSES_CONCEPT (Paper → Concept) [source: zotero/llm/both] │
│  ├─ USES_METHOD (Paper → Method) [source: llm]                     │
│  ├─ SUPPORTS (Finding → Concept) [source: llm]                     │
│  ├─ RELATED_TO (Concept ↔ Concept) [source: llm, via embeddings]  │
│  └─ CO_OCCURS_WITH (Concept ↔ Concept) [source: llm]              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 8. Duplicate Detection Strategy

### Three-Tier Matching Strategy

```
Priority 1: EXACT MATCH (Normalized Name)
    ↓
    "AI" → "ai"
    "artificial intelligence" → "artificial intelligence"
    Check synonym mapping: "ai" → "artificial intelligence"
    ↓
    Match? → MERGE

Priority 2: NAME SIMILARITY (Jaccard)
    ↓
    "machine learning" vs "ml techniques"
    Jaccard similarity = |{machine, learning} ∩ {ml, techniques}| / |{machine, learning, ml, techniques}|
                      = 0 / 4 = 0.0 → NO MATCH

    "deep learning" vs "deep neural networks"
    Jaccard = |{deep}| / 4 = 0.25 → NO MATCH

    "neural network" vs "neural networks"
    Jaccard = |{neural, network}| / 3 = 0.67 → NO MATCH (threshold: 0.85)
    ↓
    Match? → MERGE

Priority 3: EMBEDDING SIMILARITY (Cosine)
    ↓
    Compute cosine_similarity(emb_a, emb_b)
    ↓
    similarity >= 0.80? → MERGE
    ↓
    Otherwise → CREATE NEW CANONICAL
```

### Example Scenarios

#### Scenario 1: Direct Synonym Match
```
Zotero Tag: "AI"
LLM Entity: "artificial intelligence" (confidence: 0.9)

Registry Lookup:
1. Normalize "AI" → "ai" → Synonym map → "artificial intelligence"
2. Exact match: "artificial intelligence" already exists
3. Merge:
   - canonical_name: "artificial intelligence"
   - aliases: {"ai", "artificial intelligence"}
   - sources: {BOTH}
   - confidence: 0.9 (max of 0.6 from tag, 0.9 from LLM)
```

#### Scenario 2: Embedding Similarity Match
```
Zotero Tag: "chatbot"
LLM Entity: "conversational agent" (confidence: 0.85)

Registry Lookup:
1. Exact match: None
2. Name similarity: "chatbot" vs "conversational agent" → 0.0 (no overlap)
3. Embedding similarity:
   - emb_chatbot = [0.12, 0.45, 0.78, ...]
   - emb_conv_agent = [0.15, 0.42, 0.81, ...]
   - cosine_sim = 0.92 → MATCH!
4. Merge:
   - canonical_name: "conversational agent" (higher LLM confidence)
   - aliases: {"chatbot", "conversational agent"}
   - sources: {BOTH}
   - confidence: 0.85
```

#### Scenario 3: No Match (Create Separate Entities)
```
Zotero Tag: "statistics"
LLM Entity: "neural network" (confidence: 0.88)

Registry Lookup:
1. Exact match: None
2. Name similarity: 0.0
3. Embedding similarity: 0.35 → NO MATCH (< 0.80)
4. Result: Create two separate canonical entities
```

---

## 9. Test Cases

### 9.1 Unit Tests: CanonicalEntityRegistry

```python
# backend/tests/test_canonical_entity_registry.py

import pytest
from backend.graph.canonical_entity_registry import CanonicalEntityRegistry, CanonicalEntity
from backend.graph.entity_extractor import ExtractedEntity, EntityType
from backend.graph.node_source import NodeSource


def test_exact_synonym_match():
    """Test that 'AI' matches 'artificial intelligence' via synonym."""
    registry = CanonicalEntityRegistry()

    # Register LLM entity
    llm_entity = ExtractedEntity(
        entity_type=EntityType.CONCEPT,
        name="artificial intelligence",
        confidence=0.9,
    )
    canonical_id = registry.register_entity(llm_entity, NodeSource.LLM)

    # Register Zotero tag
    tag_entity = ExtractedEntity(
        entity_type=EntityType.CONCEPT,
        name="AI",
        confidence=0.6,
    )
    same_id = registry.register_entity(tag_entity, NodeSource.ZOTERO)

    # Should be same canonical entity
    assert canonical_id == same_id

    canonical = registry.get_canonical(canonical_id)
    assert NodeSource.BOTH in canonical.sources
    assert canonical.confidence == 0.9  # Max of 0.9 and 0.6


def test_embedding_similarity_match():
    """Test embedding-based matching."""
    registry = CanonicalEntityRegistry(embedding_similarity_threshold=0.85)

    # Create entities with similar embeddings
    entity1 = ExtractedEntity(
        entity_type=EntityType.CONCEPT,
        name="chatbot",
        confidence=0.8,
    )
    entity1.properties["embedding"] = [0.1, 0.5, 0.8]

    entity2 = ExtractedEntity(
        entity_type=EntityType.CONCEPT,
        name="conversational agent",
        confidence=0.9,
    )
    entity2.properties["embedding"] = [0.12, 0.48, 0.82]  # Similar

    id1 = registry.register_entity(entity1, NodeSource.ZOTERO)
    id2 = registry.register_entity(entity2, NodeSource.LLM)

    # Should match based on embedding similarity
    assert id1 == id2


def test_no_match_different_types():
    """Test that entities of different types never match."""
    registry = CanonicalEntityRegistry()

    concept = ExtractedEntity(
        entity_type=EntityType.CONCEPT,
        name="experiment",
        confidence=0.8,
    )

    method = ExtractedEntity(
        entity_type=EntityType.METHOD,
        name="experiment",
        confidence=0.9,
    )

    id1 = registry.register_entity(concept, NodeSource.LLM)
    id2 = registry.register_entity(method, NodeSource.LLM)

    # Different entity types → different canonical entities
    assert id1 != id2


def test_statistics():
    """Test registry statistics."""
    registry = CanonicalEntityRegistry()

    # Add various entities
    for i in range(5):
        entity = ExtractedEntity(
            entity_type=EntityType.CONCEPT,
            name=f"concept_{i}",
            confidence=0.8,
        )
        registry.register_entity(entity, NodeSource.LLM)

    stats = registry.get_statistics()

    assert stats["total_canonical"] == 5
    assert stats["by_type"]["Concept"] == 5
    assert stats["by_source"]["llm"] == 5
```

### 9.2 Integration Tests: EntityMerger

```python
# backend/tests/test_entity_merger.py

import pytest
from backend.graph.entity_merger import EntityMerger
from backend.graph.entity_extractor import ExtractedEntity, EntityType
from backend.graph.zotero_metadata_extractor import ZoteroExtractedEntities
from backend.integrations.zotero import ZoteroItem


def test_merge_zotero_and_llm_concepts():
    """Test merging overlapping concepts from Zotero and LLM."""
    merger = EntityMerger()

    # Zotero entities (from tags)
    zotero_entities = ZoteroExtractedEntities(
        paper_id="paper1",
        authors=[],
        concepts=[
            ExtractedEntity(
                entity_type=EntityType.CONCEPT,
                name="AI",
                confidence=0.6,
            ),
            ExtractedEntity(
                entity_type=EntityType.CONCEPT,
                name="education",
                confidence=0.6,
            ),
        ],
        problems=[],
        findings=[],
    )

    # LLM entities
    llm_entities = {
        "concepts": [
            ExtractedEntity(
                entity_type=EntityType.CONCEPT,
                name="artificial intelligence",
                confidence=0.9,
            ),
            ExtractedEntity(
                entity_type=EntityType.CONCEPT,
                name="pedagogy",
                confidence=0.85,
            ),
        ]
    }

    canonical = merger.merge(zotero_entities, llm_entities)

    # Should have 3 canonical entities (AI+artificial intelligence merged)
    assert len(canonical) == 3

    # Find the merged AI entity
    ai_entity = next(c for c in canonical if "artificial intelligence" in c.canonical_name)
    assert NodeSource.BOTH in ai_entity.sources
    assert ai_entity.confidence == 0.9


def test_author_extraction():
    """Test that authors are properly extracted from Zotero."""
    merger = EntityMerger()

    zotero_entities = ZoteroExtractedEntities(
        paper_id="paper1",
        authors=[
            ExtractedEntity(
                entity_type=EntityType.AUTHOR,
                name="John Smith",
                confidence=1.0,
            ),
            ExtractedEntity(
                entity_type=EntityType.AUTHOR,
                name="Jane Doe",
                confidence=1.0,
            ),
        ],
        concepts=[],
        problems=[],
        findings=[],
    )

    canonical = merger.merge(zotero_entities, llm_entities={})

    # Should have 2 authors
    authors = [c for c in canonical if c.entity_type == EntityType.AUTHOR]
    assert len(authors) == 2
    assert all(c.confidence == 1.0 for c in authors)
```

---

## 10. Implementation Checklist

### Phase 1: Core Data Models (Day 1)
- [ ] Create `backend/graph/node_source.py` (NodeSource enum)
- [ ] Create `backend/graph/canonical_entity_registry.py`
- [ ] Create `backend/graph/zotero_metadata_extractor.py`
- [ ] Write unit tests for CanonicalEntityRegistry
- [ ] Write unit tests for ZoteroMetadataExtractor

### Phase 2: Entity Merging (Day 2-3)
- [ ] Create `backend/graph/entity_merger.py`
- [ ] Write unit tests for EntityMerger
- [ ] Test with sample Zotero + LLM data
- [ ] Validate deduplication logic

### Phase 3: Integration (Day 4-5)
- [ ] Create `backend/importers/zotero_hybrid_importer.py`
- [ ] Update `backend/graph/graph_store.py` (add source field to Node)
- [ ] Update `backend/graph/relationship_builder.py` (add source tracking)
- [ ] Write integration tests

### Phase 4: API Endpoints (Day 6)
- [ ] Add endpoint: `POST /api/import/zotero/hybrid-import`
- [ ] Add job status tracking for long-running imports
- [ ] Test with real Zotero collection

### Phase 5: Frontend Updates (Day 7-8)
- [ ] Update `ZoteroImporter.tsx` to use hybrid import
- [ ] Add mode selector (zotero_only, selective, full)
- [ ] Show entity source badges in UI (Zotero, LLM, Both)
- [ ] Display merge statistics

### Phase 6: Testing & Polish (Day 9-10)
- [ ] End-to-end testing with real data
- [ ] Performance optimization (batch processing)
- [ ] Error handling improvements
- [ ] Documentation updates

---

## 11. Performance Considerations

### Bottlenecks

1. **LLM API Calls**: Most expensive operation
   - Mitigation: Batch processing, caching
   - Selective mode: Only extract methods/findings (~50% cost reduction)

2. **Embedding Similarity**: O(n²) comparisons
   - Mitigation:
     - Only compare within same entity type
     - Use approximate nearest neighbor (Annoy, FAISS) for >1000 entities

3. **Database Writes**: Many small inserts
   - Mitigation: Batch inserts (50-100 entities at once)

### Optimization Strategies

```python
# Batch processing example
async def import_batch(items: List[ZoteroItem], batch_size=10):
    for i in range(0, len(items), batch_size):
        batch = items[i:i+batch_size]

        # Process batch in parallel
        tasks = [
            _import_single_item(item, project_id, mode)
            for item in batch
        ]
        await asyncio.gather(*tasks)
```

### Scalability

| Collection Size | Mode | Estimated Time | Cost |
|-----------------|------|----------------|------|
| 50 papers | ZOTERO_ONLY | 1 min | $0 |
| 50 papers | SELECTIVE | 3-5 min | $0.50 |
| 50 papers | FULL | 6-10 min | $1.00 |
| 500 papers | ZOTERO_ONLY | 5 min | $0 |
| 500 papers | SELECTIVE | 30-50 min | $5.00 |
| 500 papers | FULL | 60-100 min | $10.00 |

---

## 12. Future Enhancements

### 12.1 Confidence-Based Filtering
Allow users to filter entities by confidence threshold:
```python
# Show only high-confidence entities
canonical = [c for c in canonical_entities if c.confidence >= 0.8]
```

### 12.2 Manual Entity Linking UI
Frontend interface for users to manually merge/split entities:
```typescript
<EntityCard entity={concept}>
  <Button onClick={() => mergeSuggestions(concept)}>
    Suggest Merges
  </Button>
</EntityCard>
```

### 12.3 Active Learning
Use user feedback to improve deduplication:
- Track user-approved merges → Update similarity thresholds
- Track user-rejected merges → Add to synonym blacklist

### 12.4 Multi-Language Support
Support non-English Zotero libraries:
- Translate tags before entity extraction
- Use multilingual embeddings (e.g., `multilingual-e5-large`)

---

## 13. Summary

This design provides a comprehensive solution for merging Zotero metadata with LLM-extracted entities while maintaining:

1. **Source Transparency**: Every entity tracks its origin (Zotero, LLM, or both)
2. **Intelligent Deduplication**: Three-tier matching (exact, name similarity, embeddings)
3. **Flexible Modes**: Trade-off between speed/cost/quality
4. **Backward Compatibility**: Works with existing `EntityExtractor` and `RelationshipBuilder`
5. **Scalability**: Optimized for collections up to 500+ papers

### Key Components

1. **NodeSource** - Enum tracking data origin
2. **CanonicalEntityRegistry** - Deduplication engine
3. **ZoteroMetadataExtractor** - Zotero → entity converter
4. **EntityMerger** - Orchestrates merging
5. **ZoteroHybridImporter** - Main pipeline orchestrator

### Implementation Priority

**Must Have (MVP)**:
- CanonicalEntityRegistry
- ZoteroMetadataExtractor
- EntityMerger
- Basic source tracking

**Nice to Have**:
- Embedding-based deduplication
- Active learning feedback
- Performance optimizations

**Future**:
- Multi-language support
- Manual entity linking UI
- Advanced analytics dashboard

---

**End of Design Document**
