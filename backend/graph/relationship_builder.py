"""
Relationship Builder

Builds relationships between entities based on various heuristics:
- Author collaborations
- Concept co-occurrence
- Citation networks
- Method similarity
"""

import logging
from dataclasses import dataclass
from typing import Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class RelationshipCandidate:
    """Candidate relationship to be created."""

    source_id: str
    target_id: str
    relationship_type: str
    confidence: float
    properties: dict = None

    def __post_init__(self):
        if self.properties is None:
            self.properties = {}


class RelationshipBuilder:
    """
    Builds relationships between entities.

    Relationship Types:
    - AUTHORED_BY: Paper → Author
    - CITES: Paper → Paper
    - DISCUSSES_CONCEPT: Paper → Concept
    - USES_METHOD: Paper → Method
    - SUPPORTS: Paper → Finding
    - CONTRADICTS: Paper → Finding
    - RELATED_TO: Concept → Concept (co-occurrence based)
    - COLLABORATION: Author → Author (co-authorship based)
    """

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    def build_author_relationships(
        self,
        papers: list[dict],
        authors: list[dict],
    ) -> list[RelationshipCandidate]:
        """
        Build AUTHORED_BY relationships from paper-author data.
        Also builds COLLABORATION relationships between co-authors.

        Args:
            papers: List of paper dicts with 'id' and 'authors' (list of names)
            authors: List of author dicts with 'id' and 'name'

        Returns:
            List of relationship candidates
        """
        relationships = []

        # Build author name to ID mapping
        author_name_to_id = {}
        for author in authors:
            normalized = author["name"].strip().lower()
            author_name_to_id[normalized] = author["id"]

        # Track co-authorships
        coauthor_pairs = defaultdict(int)

        for paper in papers:
            paper_id = paper["id"]
            paper_author_ids = []

            for author_name in paper.get("authors", []):
                normalized = author_name.strip().lower()
                author_id = author_name_to_id.get(normalized)

                if author_id:
                    # AUTHORED_BY relationship
                    relationships.append(
                        RelationshipCandidate(
                            source_id=paper_id,
                            target_id=author_id,
                            relationship_type="AUTHORED_BY",
                            confidence=1.0,
                        )
                    )
                    paper_author_ids.append(author_id)

            # Track co-authorships
            for i, a1 in enumerate(paper_author_ids):
                for a2 in paper_author_ids[i + 1 :]:
                    pair = tuple(sorted([a1, a2]))
                    coauthor_pairs[pair] += 1

        # Build COLLABORATION relationships
        for (a1, a2), count in coauthor_pairs.items():
            relationships.append(
                RelationshipCandidate(
                    source_id=a1,
                    target_id=a2,
                    relationship_type="COLLABORATION",
                    confidence=min(1.0, count / 5),  # More papers = higher confidence
                    properties={"paper_count": count},
                )
            )

        return relationships

    def build_concept_relationships(
        self,
        papers: list[dict],
        concepts: list[dict],
        paper_concepts: dict[str, list[str]],
    ) -> list[RelationshipCandidate]:
        """
        Build DISCUSSES_CONCEPT and RELATED_TO relationships.

        Args:
            papers: List of paper dicts
            concepts: List of concept dicts with 'id' and 'name'
            paper_concepts: Mapping of paper_id -> list of concept_ids

        Returns:
            List of relationship candidates
        """
        relationships = []

        # Build DISCUSSES_CONCEPT relationships
        for paper_id, concept_ids in paper_concepts.items():
            for concept_id in concept_ids:
                relationships.append(
                    RelationshipCandidate(
                        source_id=paper_id,
                        target_id=concept_id,
                        relationship_type="DISCUSSES_CONCEPT",
                        confidence=0.8,
                    )
                )

        # Build RELATED_TO relationships based on co-occurrence
        concept_cooccurrence = defaultdict(int)

        for concept_ids in paper_concepts.values():
            for i, c1 in enumerate(concept_ids):
                for c2 in concept_ids[i + 1 :]:
                    pair = tuple(sorted([c1, c2]))
                    concept_cooccurrence[pair] += 1

        # Create RELATED_TO for frequently co-occurring concepts
        for (c1, c2), count in concept_cooccurrence.items():
            if count >= 2:  # At least 2 co-occurrences
                relationships.append(
                    RelationshipCandidate(
                        source_id=c1,
                        target_id=c2,
                        relationship_type="RELATED_TO",
                        confidence=min(1.0, count / 10),
                        properties={"co_occurrence_count": count},
                    )
                )

        return relationships

    def build_method_relationships(
        self,
        papers: list[dict],
        methods: list[dict],
        paper_methods: dict[str, list[str]],
    ) -> list[RelationshipCandidate]:
        """
        Build USES_METHOD relationships.

        Args:
            papers: List of paper dicts
            methods: List of method dicts
            paper_methods: Mapping of paper_id -> list of method_ids

        Returns:
            List of relationship candidates
        """
        relationships = []

        for paper_id, method_ids in paper_methods.items():
            for method_id in method_ids:
                relationships.append(
                    RelationshipCandidate(
                        source_id=paper_id,
                        target_id=method_id,
                        relationship_type="USES_METHOD",
                        confidence=0.8,
                    )
                )

        return relationships

    def build_finding_relationships(
        self,
        papers: list[dict],
        findings: list[dict],
        paper_findings: dict[str, list[tuple[str, str]]],
    ) -> list[RelationshipCandidate]:
        """
        Build SUPPORTS and CONTRADICTS relationships.

        Args:
            papers: List of paper dicts
            findings: List of finding dicts
            paper_findings: Mapping of paper_id -> list of (finding_id, relation_type)
                          where relation_type is 'supports' or 'contradicts'

        Returns:
            List of relationship candidates
        """
        relationships = []

        for paper_id, finding_relations in paper_findings.items():
            for finding_id, relation_type in finding_relations:
                rel_type = (
                    "SUPPORTS" if relation_type == "supports" else "CONTRADICTS"
                )
                relationships.append(
                    RelationshipCandidate(
                        source_id=paper_id,
                        target_id=finding_id,
                        relationship_type=rel_type,
                        confidence=0.7,
                    )
                )

        return relationships

    async def infer_citation_relationships(
        self,
        papers: list[dict],
    ) -> list[RelationshipCandidate]:
        """
        Infer CITES relationships from paper metadata.

        This requires papers to have 'references' or 'citations' field
        with DOIs or paper IDs.
        """
        relationships = []

        # Build DOI to paper ID mapping
        doi_to_id = {}
        for paper in papers:
            if paper.get("doi"):
                doi_to_id[paper["doi"].lower()] = paper["id"]

        # Look for citation relationships
        for paper in papers:
            paper_id = paper["id"]
            references = paper.get("references", []) or paper.get("citations", [])

            for ref in references:
                # Reference could be a DOI or paper ID
                ref_lower = ref.lower() if isinstance(ref, str) else ref

                if ref_lower in doi_to_id:
                    target_id = doi_to_id[ref_lower]
                    relationships.append(
                        RelationshipCandidate(
                            source_id=paper_id,
                            target_id=target_id,
                            relationship_type="CITES",
                            confidence=1.0,
                        )
                    )

        return relationships

    def deduplicate_relationships(
        self,
        relationships: list[RelationshipCandidate],
    ) -> list[RelationshipCandidate]:
        """
        Remove duplicate relationships, keeping highest confidence.
        """
        unique = {}

        for rel in relationships:
            key = (rel.source_id, rel.target_id, rel.relationship_type)

            if key not in unique or rel.confidence > unique[key].confidence:
                unique[key] = rel

        return list(unique.values())
