"""
Concept Normalizer

Handles concept deduplication and normalization through:
1. Fuzzy string matching (Levenshtein distance)
2. Synonym dictionary management
3. LLM-based synonym suggestion

This ensures "ML", "Machine Learning", and "machine-learning" all map to
a single canonical concept, reducing graph fragmentation.
"""

import logging
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Optional
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass
class NormalizationResult:
    """Result of concept normalization."""

    original_name: str
    canonical_name: str
    canonical_id: Optional[str] = None
    confidence: float = 1.0
    match_type: str = "exact"  # exact, fuzzy, alias, llm


# Common academic concept aliases (manually curated)
CONCEPT_ALIASES = {
    # AI/ML
    "artificial intelligence": ["ai", "a.i.", "A.I."],
    "machine learning": ["ml", "m.l.", "ML"],
    "deep learning": ["dl", "DL", "deep neural networks"],
    "natural language processing": ["nlp", "NLP", "n.l.p."],
    "large language model": ["llm", "LLM", "large language models", "llms"],
    "neural network": ["nn", "NN", "neural networks", "neural net"],
    "convolutional neural network": ["cnn", "CNN", "convnet"],
    "recurrent neural network": ["rnn", "RNN"],
    "transformer": ["transformers", "transformer model", "transformer architecture"],
    "generative ai": ["genai", "gen-ai", "generative artificial intelligence"],
    "chatbot": ["chat bot", "chat-bot", "conversational agent", "dialogue system"],
    "reinforcement learning": ["rl", "RL"],

    # Education
    "higher education": ["he", "tertiary education", "university education"],
    "k-12": ["k12", "primary education", "secondary education"],
    "online learning": ["e-learning", "elearning", "distance learning", "remote learning"],
    "blended learning": ["hybrid learning", "mixed-mode learning"],
    "student engagement": ["learner engagement", "engagement"],
    "learning outcome": ["learning outcomes", "educational outcome", "educational outcomes"],
    "personalized learning": ["personalised learning", "adaptive learning", "individualized instruction"],
    "self-regulated learning": ["srl", "SRL", "self-regulation"],

    # Research methods
    "randomized controlled trial": ["rct", "RCT", "randomized trial"],
    "quasi-experimental": ["quasi experimental", "quasi-experiment"],
    "meta-analysis": ["meta analysis", "metaanalysis"],
    "systematic review": ["systematic literature review", "slr", "SLR"],
    "mixed methods": ["mixed method", "mixed-methods research"],
    "qualitative research": ["qualitative study", "qualitative analysis"],
    "quantitative research": ["quantitative study", "quantitative analysis"],
    "case study": ["case studies", "case-study"],

    # Statistics
    "effect size": ["effect sizes", "effect-size", "ES"],
    "statistical significance": ["significance", "p-value", "p value"],
    "standard deviation": ["sd", "SD", "std dev"],
    "confidence interval": ["ci", "CI", "confidence intervals"],
}

# Build reverse lookup: alias -> canonical
ALIAS_TO_CANONICAL = {}
for canonical, aliases in CONCEPT_ALIASES.items():
    for alias in aliases:
        ALIAS_TO_CANONICAL[alias.lower()] = canonical


def normalize_string(s: str) -> str:
    """
    Normalize a string for comparison.

    - Lowercase
    - Remove extra whitespace
    - Remove special characters (except hyphens)
    - Collapse hyphens
    """
    s = s.lower().strip()
    s = re.sub(r'\s+', ' ', s)  # Collapse whitespace
    s = re.sub(r'[^\w\s-]', '', s)  # Remove special chars except hyphen
    s = re.sub(r'-+', '-', s)  # Collapse multiple hyphens
    return s


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        s1, s2 = s2, s1

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def similarity_ratio(s1: str, s2: str) -> float:
    """Calculate similarity ratio between two strings (0.0 to 1.0)."""
    return SequenceMatcher(None, s1, s2).ratio()


class ConceptNormalizer:
    """
    Normalizes concepts to canonical forms for graph deduplication.
    """

    def __init__(
        self,
        db_connection=None,
        llm_provider=None,
        fuzzy_threshold: float = 0.85,
    ):
        """
        Initialize the concept normalizer.

        Args:
            db_connection: Database connection for alias lookups
            llm_provider: LLM provider for synonym suggestion
            fuzzy_threshold: Minimum similarity for fuzzy matching (0.0-1.0)
        """
        self.db = db_connection
        self.llm = llm_provider
        self.fuzzy_threshold = fuzzy_threshold

        # In-memory cache: normalized_name -> canonical_name
        self._canonical_cache: dict[str, str] = {}

        # Database-loaded aliases (loaded on first use)
        self._db_aliases_loaded = False
        self._db_aliases: dict[str, str] = {}

    async def normalize(
        self,
        concept_name: str,
        project_id: Optional[str] = None,
        use_llm: bool = False,
    ) -> NormalizationResult:
        """
        Normalize a concept name to its canonical form.

        Args:
            concept_name: The concept name to normalize
            project_id: Optional project ID for project-specific lookups
            use_llm: Whether to use LLM for synonym suggestion

        Returns:
            NormalizationResult with canonical name and metadata
        """
        original = concept_name
        normalized = normalize_string(concept_name)

        # 1. Check in-memory cache
        if normalized in self._canonical_cache:
            return NormalizationResult(
                original_name=original,
                canonical_name=self._canonical_cache[normalized],
                confidence=1.0,
                match_type="cache",
            )

        # 2. Check built-in aliases
        if normalized in ALIAS_TO_CANONICAL:
            canonical = ALIAS_TO_CANONICAL[normalized]
            self._canonical_cache[normalized] = canonical
            return NormalizationResult(
                original_name=original,
                canonical_name=canonical,
                confidence=1.0,
                match_type="alias",
            )

        # 3. Check database aliases
        if self.db and not self._db_aliases_loaded:
            await self._load_db_aliases(project_id)

        if normalized in self._db_aliases:
            canonical = self._db_aliases[normalized]
            self._canonical_cache[normalized] = canonical
            return NormalizationResult(
                original_name=original,
                canonical_name=canonical,
                confidence=0.95,
                match_type="db_alias",
            )

        # 4. Fuzzy matching against known concepts
        best_match = await self._find_fuzzy_match(normalized, project_id)
        if best_match:
            self._canonical_cache[normalized] = best_match.canonical_name
            return best_match

        # 5. LLM-based normalization (optional)
        if use_llm and self.llm:
            llm_result = await self._llm_normalize(concept_name)
            if llm_result:
                self._canonical_cache[normalized] = llm_result.canonical_name
                return llm_result

        # 6. No match found - use normalized form as canonical
        canonical = concept_name.strip().title()
        self._canonical_cache[normalized] = canonical

        return NormalizationResult(
            original_name=original,
            canonical_name=canonical,
            confidence=1.0,
            match_type="new",
        )

    async def _load_db_aliases(self, project_id: Optional[str] = None):
        """Load aliases from database."""
        if not self.db:
            return

        try:
            query = """
                SELECT ca.alias, e.name as canonical_name
                FROM concept_aliases ca
                JOIN entities e ON ca.canonical_concept_id = e.id
            """
            params = []

            if project_id:
                query += " WHERE e.project_id = $1"
                params.append(project_id)

            rows = await self.db.fetch(query, *params)

            for row in rows:
                alias = normalize_string(row["alias"])
                self._db_aliases[alias] = row["canonical_name"]

            self._db_aliases_loaded = True
            logger.info(f"Loaded {len(self._db_aliases)} aliases from database")

        except Exception as e:
            logger.warning(f"Failed to load database aliases: {e}")
            self._db_aliases_loaded = True  # Don't retry on failure

    async def _find_fuzzy_match(
        self,
        normalized_name: str,
        project_id: Optional[str] = None,
    ) -> Optional[NormalizationResult]:
        """Find a fuzzy match among known concepts."""
        best_match = None
        best_score = 0.0

        # Check against built-in canonicals
        for canonical in CONCEPT_ALIASES.keys():
            normalized_canonical = normalize_string(canonical)
            score = similarity_ratio(normalized_name, normalized_canonical)

            if score > best_score and score >= self.fuzzy_threshold:
                best_score = score
                best_match = canonical

        # Check against database concepts
        if self.db and project_id:
            try:
                rows = await self.db.fetch(
                    """
                    SELECT name FROM entities
                    WHERE project_id = $1 AND entity_type = 'Concept'
                    """,
                    project_id,
                )

                for row in rows:
                    db_normalized = normalize_string(row["name"])
                    score = similarity_ratio(normalized_name, db_normalized)

                    if score > best_score and score >= self.fuzzy_threshold:
                        best_score = score
                        best_match = row["name"]

            except Exception as e:
                logger.warning(f"Fuzzy match database query failed: {e}")

        if best_match:
            return NormalizationResult(
                original_name=normalized_name,
                canonical_name=best_match,
                confidence=best_score,
                match_type="fuzzy",
            )

        return None

    async def _llm_normalize(self, concept_name: str) -> Optional[NormalizationResult]:
        """Use LLM to suggest canonical form."""
        if not self.llm:
            return None

        prompt = f"""You are an expert at normalizing academic concept names.
Given a concept name, suggest its most common canonical form.

Concept: "{concept_name}"

Rules:
1. Use title case (e.g., "Machine Learning" not "machine learning")
2. Expand common abbreviations (e.g., "ML" -> "Machine Learning")
3. Use the most widely recognized term in academic literature
4. If the concept is already in canonical form, return it as-is

Return ONLY the canonical concept name, nothing else."""

        try:
            response = await self.llm.generate(
                prompt,
                max_tokens=50,
                temperature=0.0,
            )
            canonical = response.strip().strip('"').strip("'")

            if canonical and len(canonical) > 1:
                return NormalizationResult(
                    original_name=concept_name,
                    canonical_name=canonical,
                    confidence=0.8,
                    match_type="llm",
                )

        except Exception as e:
            logger.warning(f"LLM normalization failed: {e}")

        return None

    async def add_alias(
        self,
        canonical_concept_id: str,
        alias: str,
        source: str = "manual",
        confidence: float = 1.0,
    ) -> bool:
        """
        Add a new alias for a canonical concept.

        Args:
            canonical_concept_id: UUID of the canonical concept entity
            alias: The alias to add
            source: Where this alias came from (manual, llm, import)
            confidence: Confidence score

        Returns:
            True if alias was added successfully
        """
        if not self.db:
            logger.warning("No database connection - cannot add alias")
            return False

        try:
            await self.db.execute(
                """
                INSERT INTO concept_aliases (canonical_concept_id, alias, source, confidence)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (canonical_concept_id, alias) DO UPDATE
                SET source = $3, confidence = $4
                """,
                canonical_concept_id,
                alias,
                source,
                confidence,
            )

            # Update local cache
            normalized = normalize_string(alias)
            # We need to look up the canonical name
            row = await self.db.fetchrow(
                "SELECT name FROM entities WHERE id = $1",
                canonical_concept_id,
            )
            if row:
                self._db_aliases[normalized] = row["name"]

            return True

        except Exception as e:
            logger.error(f"Failed to add alias: {e}")
            return False

    async def merge_concepts(
        self,
        canonical_id: str,
        duplicate_id: str,
        project_id: str,
    ) -> bool:
        """
        Merge a duplicate concept into a canonical concept.

        Updates all relationships pointing to the duplicate to point to canonical,
        copies aliases, and marks the duplicate with canonical_id reference.

        Args:
            canonical_id: UUID of the canonical (surviving) concept
            duplicate_id: UUID of the duplicate (to be merged) concept
            project_id: Project ID for validation

        Returns:
            True if merge was successful
        """
        if not self.db:
            return False

        try:
            async with self.db.transaction() as conn:
                # 1. Copy duplicate's name as alias
                dup_row = await conn.fetchrow(
                    "SELECT name FROM entities WHERE id = $1 AND project_id = $2",
                    duplicate_id,
                    project_id,
                )
                if dup_row:
                    await conn.execute(
                        """
                        INSERT INTO concept_aliases (canonical_concept_id, alias, source)
                        VALUES ($1, $2, 'merge')
                        ON CONFLICT DO NOTHING
                        """,
                        canonical_id,
                        dup_row["name"],
                    )

                # 2. Update relationships pointing to duplicate
                await conn.execute(
                    """
                    UPDATE relationships
                    SET target_id = $1
                    WHERE target_id = $2 AND project_id = $3
                    """,
                    canonical_id,
                    duplicate_id,
                    project_id,
                )

                await conn.execute(
                    """
                    UPDATE relationships
                    SET source_id = $1
                    WHERE source_id = $2 AND project_id = $3
                    """,
                    canonical_id,
                    duplicate_id,
                    project_id,
                )

                # 3. Mark duplicate with canonical reference
                await conn.execute(
                    """
                    UPDATE entities
                    SET canonical_id = $1
                    WHERE id = $2
                    """,
                    canonical_id,
                    duplicate_id,
                )

                logger.info(f"Merged concept {duplicate_id} into {canonical_id}")
                return True

        except Exception as e:
            logger.error(f"Failed to merge concepts: {e}")
            return False

    async def find_duplicates(
        self,
        project_id: str,
        threshold: float = 0.85,
    ) -> list[tuple[str, str, float]]:
        """
        Find potential duplicate concepts in a project.

        Args:
            project_id: Project ID to scan
            threshold: Minimum similarity for potential duplicates

        Returns:
            List of (concept1_id, concept2_id, similarity) tuples
        """
        if not self.db:
            return []

        try:
            rows = await self.db.fetch(
                """
                SELECT id, name FROM entities
                WHERE project_id = $1 AND entity_type = 'Concept'
                AND canonical_id IS NULL
                """,
                project_id,
            )

            duplicates = []
            concepts = [(str(row["id"]), row["name"]) for row in rows]

            for i, (id1, name1) in enumerate(concepts):
                normalized1 = normalize_string(name1)

                for id2, name2 in concepts[i + 1:]:
                    normalized2 = normalize_string(name2)
                    score = similarity_ratio(normalized1, normalized2)

                    if score >= threshold:
                        duplicates.append((id1, id2, score))

            return sorted(duplicates, key=lambda x: -x[2])

        except Exception as e:
            logger.error(f"Failed to find duplicates: {e}")
            return []


# Convenience function for quick normalization
async def normalize_concept(
    concept_name: str,
    db_connection=None,
    project_id: Optional[str] = None,
) -> str:
    """
    Quick concept normalization.

    Args:
        concept_name: Concept name to normalize
        db_connection: Optional database connection
        project_id: Optional project ID

    Returns:
        Canonical concept name
    """
    normalizer = ConceptNormalizer(db_connection=db_connection)
    result = await normalizer.normalize(concept_name, project_id)
    return result.canonical_name
