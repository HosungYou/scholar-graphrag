"""
Entity Resolution utilities for academic graph ingestion.

This module centralizes canonicalization and duplicate merge logic so that
all importers (ScholaRAG, PDF, Zotero) apply the same rules.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from difflib import SequenceMatcher
import json
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine_similarity

from graph.entity_extractor import ExtractedEntity, create_default_disambiguator

logger = logging.getLogger(__name__)


@dataclass
class EntityResolutionStats:
    """Summary metrics for one resolution pass."""

    raw_entities: int
    resolved_entities: int
    merged_entities: int
    canonicalization_rate: float
    llm_pairs_reviewed: int = 0
    llm_pairs_confirmed: int = 0
    potential_false_merge_count: int = 0
    potential_false_merge_samples: List[Dict[str, Any]] = field(default_factory=list)
    embedding_candidates_found: int = 0
    string_candidates_found: int = 0


class EntityResolutionService:
    """
    Canonicalizes and merges extracted entities.

    Key behaviors:
    - Uses the default academic synonym map from EntityDisambiguator.
    - Preserves entity types while resolving names.
    - Merges duplicates by (entity_type, canonical_name).
    """

    def __init__(
        self,
        llm_provider=None,
        auto_merge_threshold: float = 0.95,
        llm_review_threshold: float = 0.82,
        max_llm_pair_checks: int = 40,
        llm_batch_size: int = 20,
    ):
        self.llm = llm_provider
        self._disambiguator = create_default_disambiguator()
        self._learned_acronyms: Dict[str, str] = {}
        self.auto_merge_threshold = auto_merge_threshold
        self.llm_review_threshold = llm_review_threshold
        self.max_llm_pair_checks = max_llm_pair_checks
        self.llm_batch_size = llm_batch_size
        # Canonical surface forms that frequently collide across domains.
        self._homonym_context_rules: Dict[str, Dict[str, List[str]]] = {
            "sat": {
                "logic": [
                    "boolean",
                    "satisfiability",
                    "cnf",
                    "solver",
                    "constraint",
                    "propositional",
                    "clause",
                ],
                "education": [
                    "scholastic",
                    "aptitude",
                    "student",
                    "exam",
                    "test score",
                    "college",
                    "assessment",
                ],
                "attention": [
                    "self attention",
                    "attention mechanism",
                    "transformer",
                    "token",
                    "sequence model",
                ],
            },
            "transformer": {
                "deep_learning": [
                    "neural",
                    "language model",
                    "self attention",
                    "token",
                    "encoder",
                    "decoder",
                    "vision transformer",
                    "embedding",
                ],
                "electrical": [
                    "voltage",
                    "current",
                    "power grid",
                    "electrical",
                    "winding",
                    "coil",
                ],
            },
        }

    def _normalize_surface(self, value: str) -> str:
        """
        Normalize surface forms to improve deterministic matching.
        """
        normalized = (value or "").strip().lower()
        normalized = normalized.replace("_", " ").replace("-", " ").replace("/", " ")
        normalized = normalized.replace(".", "")
        normalized = normalized.replace("(", " ").replace(")", " ")
        normalized = re.sub(r"\s+", " ", normalized).strip()

        # Common academic spelling variants.
        alias_map = {
            "finetuning": "fine tuning",
        }
        return alias_map.get(normalized, normalized)

    def _normalize_acronym_key(self, value: str) -> str:
        """Normalize acronym to alphanumeric key for lookup (e.g., G.C.N. -> gcn)."""
        return re.sub(r"[^a-z0-9]", "", (value or "").lower())

    def _is_valid_acronym(self, long_form: str, acronym: str) -> bool:
        """
        Validate acronym mapping using initials from long form.
        """
        tokens = [token for token in re.split(r"\s+", long_form.strip()) if token]
        initials = "".join(
            token[0]
            for token in tokens
            if token and token[0].isalnum()
        )
        acronym_key = self._normalize_acronym_key(acronym)
        if self._normalize_acronym_key(initials) == acronym_key:
            return True

        # Single-token abbreviations like "satisfiability" -> "sat"
        if len(tokens) == 1:
            word_key = self._normalize_acronym_key(tokens[0])
            if len(acronym_key) >= 2 and word_key.startswith(acronym_key):
                return True

        return False

    def _learn_acronym_mapping(self, raw_name: str) -> Optional[str]:
        """
        Learn mapping from 'Long Form (ACR)' patterns and return normalized long form.
        """
        match = re.match(r"^\s*(?P<long>[^()]+?)\s*\((?P<acr>[A-Za-z][A-Za-z0-9\.\-]{1,15})\)\s*$", raw_name or "")
        if not match:
            return None

        long_form = self._normalize_surface(match.group("long"))
        acronym = self._normalize_surface(match.group("acr"))
        if not long_form or not acronym:
            return None

        if self._is_valid_acronym(long_form, acronym):
            self._learned_acronyms[acronym] = long_form
            self._learned_acronyms[self._normalize_acronym_key(acronym)] = long_form
            return long_form

        return None

    def _iter_property_strings(self, value) -> List[str]:
        """Extract text fragments from nested property payloads."""
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, (int, float, bool)):
            return [str(value)]
        if isinstance(value, list):
            parts: List[str] = []
            for item in value:
                parts.extend(self._iter_property_strings(item))
            return parts
        if isinstance(value, dict):
            parts: List[str] = []
            for item in value.values():
                parts.extend(self._iter_property_strings(item))
            return parts
        return [str(value)]

    def _build_context_text(self, entity: ExtractedEntity) -> str:
        """Build context corpus for homonym disambiguation."""
        chunks = [
            entity.name or "",
            entity.definition or "",
            entity.description or "",
        ]
        chunks.extend(self._iter_property_strings(entity.properties or {}))
        return " ".join(chunks).lower()

    def _infer_context_bucket(self, canonical_name: str, entity: ExtractedEntity) -> Optional[str]:
        """
        Infer context bucket for ambiguous canonical names.

        Returns:
            - bucket name for ambiguous terms
            - None for non-ambiguous terms
        """
        rules = self._homonym_context_rules.get(canonical_name)
        if not rules:
            return None

        text = self._build_context_text(entity)
        best_bucket = "generic"
        best_score = 0

        for bucket, keywords in rules.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > best_score:
                best_score = score
                best_bucket = bucket

        return best_bucket

    def canonicalize_name(self, name: str) -> str:
        """Convert a raw entity name to canonical form."""
        if not name:
            return ""

        learned_long_form = self._learn_acronym_mapping(name)
        normalized = self._normalize_surface(learned_long_form or name)
        if not normalized:
            return ""

        # Resolve learned acronym aliases first.
        if normalized in self._learned_acronyms:
            normalized = self._learned_acronyms[normalized]
        else:
            acronym_key = self._normalize_acronym_key(normalized)
            if acronym_key in self._learned_acronyms:
                normalized = self._learned_acronyms[acronym_key]

        canonical = self._disambiguator.get_canonical_name(normalized)
        canonical = self._normalize_surface(canonical)
        if canonical in self._learned_acronyms:
            return self._learned_acronyms[canonical]

        acronym_key = self._normalize_acronym_key(canonical)
        return self._learned_acronyms.get(acronym_key, canonical)

    def _tokenize(self, value: str) -> Set[str]:
        """Tokenize a normalized value for similarity scoring."""
        return {token for token in re.split(r"\s+", value.strip()) if token}

    def _similarity_score(self, left: str, right: str) -> float:
        """
        Hybrid similarity score used for merge candidate generation.
        """
        if left == right:
            return 1.0

        left_tokens = self._tokenize(left)
        right_tokens = self._tokenize(right)
        if not left_tokens or not right_tokens:
            return 0.0

        jaccard = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
        char_ratio = SequenceMatcher(None, left, right).ratio()
        score = 0.55 * char_ratio + 0.45 * jaccard

        # Mild boost when one form is very likely an abbreviation.
        left_key = self._normalize_acronym_key(left)
        right_key = self._normalize_acronym_key(right)
        if left_key and right_key:
            if left_key.startswith(right_key) or right_key.startswith(left_key):
                score = min(1.0, score + 0.1)

        return score

    def _build_records(self, entities: List[ExtractedEntity]) -> List[Dict[str, Any]]:
        """Build normalized records from extracted entities."""
        records: List[Dict[str, Any]] = []
        for entity in entities:
            entity_type = (
                entity.entity_type.value if hasattr(entity.entity_type, "value") else str(entity.entity_type)
            )
            canonical_name = self.canonicalize_name(entity.name)
            if not canonical_name:
                continue
            context_bucket = self._infer_context_bucket(canonical_name, entity) or "__default__"
            records.append(
                {
                    "entity": entity,
                    "entity_type": entity_type,
                    "canonical_name": canonical_name,
                    "context_bucket": context_bucket,
                }
            )
        return records

    def _build_name_stats(self, records: List[Dict[str, Any]]) -> Dict[Tuple[str, str, str], Dict[str, float]]:
        """Aggregate support stats per canonical-name key."""
        stats: Dict[Tuple[str, str, str], Dict[str, float]] = {}
        for record in records:
            key = (
                record["entity_type"],
                record["context_bucket"],
                record["canonical_name"],
            )
            entity = record["entity"]
            if key not in stats:
                stats[key] = {"count": 0, "max_conf": 0.0}
            stats[key]["count"] += 1
            stats[key]["max_conf"] = max(stats[key]["max_conf"], float(entity.confidence or 0.0))
        return stats

    def _generate_candidate_pairs(
        self,
        name_keys: List[Tuple[str, str, str]],
        min_similarity: float,
        max_pairs: Optional[int] = None,
    ) -> List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]]:
        """
        Generate candidate merge pairs within (entity_type, context_bucket).
        """
        if len(name_keys) < 2:
            return []

        grouped: Dict[Tuple[str, str], List[Tuple[str, str, str]]] = {}
        for key in name_keys:
            grouped.setdefault((key[0], key[1]), []).append(key)

        candidates: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]] = []
        for bucket_keys in grouped.values():
            if len(bucket_keys) < 2:
                continue
            ordered = sorted(bucket_keys, key=lambda x: x[2])
            for i in range(len(ordered)):
                left = ordered[i]
                for j in range(i + 1, len(ordered)):
                    right = ordered[j]
                    # Lightweight blocking to keep runtime practical.
                    if abs(len(left[2]) - len(right[2])) > 20:
                        continue
                    score = self._similarity_score(left[2], right[2])
                    if score >= min_similarity:
                        candidates.append((left, right, score))

        candidates.sort(key=lambda item: item[2], reverse=True)
        if max_pairs is not None:
            return candidates[:max_pairs]
        return candidates

    def _generate_embedding_candidate_pairs(
        self,
        entities_with_embeddings: List[Dict[str, Any]],
        embedding_auto_merge_threshold: float = 0.95,
        embedding_review_threshold: float = 0.88,
        max_pairs: Optional[int] = None,
    ) -> List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]]:
        """
        Generate candidate merge pairs using embedding cosine similarity.

        This method is designed for re-resolution of entities that already have
        embeddings (e.g., cross-paper resolution of stored entities). It
        complements the string-based ``_generate_candidate_pairs`` by capturing
        semantic similarity that surface-form heuristics may miss.

        Args:
            entities_with_embeddings: List of dicts, each containing:
                - ``entity_type`` (str)
                - ``context_bucket`` (str)
                - ``canonical_name`` (str)
                - ``embedding`` (list[float] | np.ndarray) – 1-D vector
            embedding_auto_merge_threshold: Cosine similarity above which pairs
                are considered auto-merge candidates (default 0.95).
            embedding_review_threshold: Cosine similarity above which pairs
                are surfaced for LLM review (default 0.88).
            max_pairs: Optional cap on returned pairs.

        Returns:
            List of ``(left_key, right_key, cosine_similarity)`` tuples sorted
            by similarity descending.  Only pairs with similarity >=
            *embedding_review_threshold* are included.
        """
        if len(entities_with_embeddings) < 2:
            return []

        # Group by (entity_type, context_bucket) – same blocking as string-based.
        grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        for rec in entities_with_embeddings:
            emb = rec.get("embedding")
            if emb is None:
                continue
            bucket_key = (rec["entity_type"], rec["context_bucket"])
            grouped.setdefault(bucket_key, []).append(rec)

        candidates: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]] = []

        for bucket_recs in grouped.values():
            if len(bucket_recs) < 2:
                continue

            # Build matrix of embeddings for efficient pairwise computation.
            keys: List[Tuple[str, str, str]] = []
            vectors: List[np.ndarray] = []
            for rec in bucket_recs:
                keys.append((rec["entity_type"], rec["context_bucket"], rec["canonical_name"]))
                vec = rec["embedding"]
                if not isinstance(vec, np.ndarray):
                    vec = np.asarray(vec, dtype=np.float64)
                vectors.append(vec)

            # De-duplicate keys within this bucket – keep first occurrence.
            seen_keys: Dict[Tuple[str, str, str], int] = {}
            unique_indices: List[int] = []
            for idx, key in enumerate(keys):
                if key not in seen_keys:
                    seen_keys[key] = idx
                    unique_indices.append(idx)

            if len(unique_indices) < 2:
                continue

            unique_keys = [keys[i] for i in unique_indices]
            matrix = np.vstack([vectors[i].reshape(1, -1) for i in unique_indices])

            # Compute pairwise cosine similarity in one pass.
            sim_matrix = sklearn_cosine_similarity(matrix)

            for i in range(len(unique_keys)):
                for j in range(i + 1, len(unique_keys)):
                    score = float(sim_matrix[i, j])
                    if score >= embedding_review_threshold:
                        candidates.append((unique_keys[i], unique_keys[j], score))

        candidates.sort(key=lambda item: item[2], reverse=True)
        if max_pairs is not None:
            return candidates[:max_pairs]
        return candidates

    def _select_cluster_canonical(
        self,
        cluster_keys: List[Tuple[str, str, str]],
        name_stats: Dict[Tuple[str, str, str], Dict[str, float]],
    ) -> str:
        """Pick canonical name for merged cluster."""
        ranked = sorted(
            cluster_keys,
            key=lambda key: (
                int(name_stats.get(key, {}).get("count", 0)),
                float(name_stats.get(key, {}).get("max_conf", 0.0)),
                len(key[2]),
            ),
            reverse=True,
        )
        return ranked[0][2]

    def _build_alias_map(
        self,
        name_keys: List[Tuple[str, str, str]],
        name_stats: Dict[Tuple[str, str, str], Dict[str, float]],
        confirmed_pairs: Set[Tuple[Tuple[str, str, str], Tuple[str, str, str]]],
    ) -> Dict[Tuple[str, str, str], str]:
        """Build alias map from pair decisions using union-find clustering."""
        if not name_keys:
            return {}

        auto_pairs = self._generate_candidate_pairs(
            name_keys=name_keys,
            min_similarity=self.auto_merge_threshold,
            max_pairs=None,
        )
        accepted_pairs: Set[Tuple[Tuple[str, str, str], Tuple[str, str, str]]] = {
            (left, right) for left, right, _ in auto_pairs
        }
        accepted_pairs.update(confirmed_pairs)

        parent: Dict[Tuple[str, str, str], Tuple[str, str, str]] = {key: key for key in name_keys}

        def find(node: Tuple[str, str, str]) -> Tuple[str, str, str]:
            while parent[node] != node:
                parent[node] = parent[parent[node]]
                node = parent[node]
            return node

        def union(a: Tuple[str, str, str], b: Tuple[str, str, str]) -> None:
            ra = find(a)
            rb = find(b)
            if ra != rb:
                parent[rb] = ra

        for left, right in accepted_pairs:
            if left in parent and right in parent:
                union(left, right)

        clusters: Dict[Tuple[str, str, str], List[Tuple[str, str, str]]] = {}
        for key in name_keys:
            clusters.setdefault(find(key), []).append(key)

        alias_map: Dict[Tuple[str, str, str], str] = {}
        for cluster_keys in clusters.values():
            canonical_name = self._select_cluster_canonical(cluster_keys, name_stats)
            for key in cluster_keys:
                alias_map[key] = canonical_name
        return alias_map

    def _resolve_with_alias_map(
        self,
        records: List[Dict[str, Any]],
        alias_map: Dict[Tuple[str, str, str], str],
    ) -> List[ExtractedEntity]:
        """Apply alias map and produce resolved entities."""
        grouped: Dict[Tuple[str, str, str], List[ExtractedEntity]] = {}
        for record in records:
            entity = record["entity"]
            key = (
                record["entity_type"],
                record["context_bucket"],
                record["canonical_name"],
            )
            canonical_name = alias_map.get(key, record["canonical_name"])
            merged_key = (record["entity_type"], record["context_bucket"], canonical_name)
            grouped.setdefault(merged_key, []).append(entity)

        resolved: List[ExtractedEntity] = []
        for (_entity_type, context_bucket, canonical_name), group in grouped.items():
            best = max(group, key=lambda e: e.confidence)
            source_paper_ids = set()
            aliases = set()

            for item in group:
                aliases.add(item.name)
                if item.source_paper_id:
                    source_paper_ids.add(item.source_paper_id)
                for source_id in item.properties.get("source_paper_ids", []):
                    if source_id:
                        source_paper_ids.add(str(source_id))

            properties = dict(best.properties or {})
            properties["source_paper_ids"] = sorted(source_paper_ids)
            properties["alias_count"] = len(aliases)
            if aliases:
                properties["aliases"] = sorted(aliases)
            if context_bucket != "__default__":
                properties["resolution_context_bucket"] = context_bucket

            resolved.append(
                ExtractedEntity(
                    entity_type=best.entity_type,
                    name=canonical_name,
                    definition=best.definition,
                    description=best.description,
                    confidence=max(e.confidence for e in group),
                    source_paper_id=None,
                    properties=properties,
                )
            )

        return resolved

    def _extract_json_block(self, text: str) -> dict:
        """Parse first JSON object from LLM output."""
        try:
            return json.loads(text)
        except Exception:
            pass
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except Exception:
                return {}
        return {}

    def _build_potential_false_merge_samples(
        self,
        uncertain_pairs: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]],
        confirmed_pairs: Set[Tuple[Tuple[str, str, str], Tuple[str, str, str]]],
        sample_limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Build conservative samples for manual false-merge audit.

        We only sample pairs that required LLM confirmation (below auto-merge threshold),
        because these are the highest-risk merges for over-canonicalization.
        """
        if not uncertain_pairs or not confirmed_pairs:
            return []

        score_map: Dict[Tuple[Tuple[str, str, str], Tuple[str, str, str]], float] = {}
        for left, right, score in uncertain_pairs:
            score_map[(left, right)] = score
            score_map[(right, left)] = score

        sampled: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]] = []
        for left, right in confirmed_pairs:
            score = score_map.get((left, right))
            if score is None:
                continue
            sampled.append((left, right, score))

        sampled.sort(key=lambda item: item[2])  # Lowest similarity first

        return [
            {
                "entity_type": left[0],
                "context_bucket": left[1],
                "left": left[2],
                "right": right[2],
                "similarity": round(score, 3),
            }
            for left, right, score in sampled[:sample_limit]
        ]

    async def _confirm_candidate_pairs_with_llm(
        self,
        review_pairs: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]],
    ) -> Set[Tuple[Tuple[str, str, str], Tuple[str, str, str]]]:
        """
        Batch-confirm uncertain candidate pairs with LLM.
        """
        if not self.llm or not review_pairs:
            return set()

        confirmed: Set[Tuple[Tuple[str, str, str], Tuple[str, str, str]]] = set()
        system_prompt = (
            "You are an entity-resolution verifier for academic concepts. "
            "Decide whether each pair refers to the same academic concept. "
            "Return strict JSON only."
        )

        for batch_start in range(0, len(review_pairs), self.llm_batch_size):
            batch = review_pairs[batch_start: batch_start + self.llm_batch_size]
            if not batch:
                continue

            lines: List[str] = []
            id_to_pair: Dict[str, Tuple[Tuple[str, str, str], Tuple[str, str, str]]] = {}
            for idx, (left, right, score) in enumerate(batch, start=1):
                pair_id = f"p{batch_start + idx}"
                id_to_pair[pair_id] = (left, right)
                lines.append(
                    f"- id={pair_id}; type={left[0]}; context={left[1]}; "
                    f"a='{left[2]}'; b='{right[2]}'; similarity={score:.3f}"
                )

            prompt = (
                "Evaluate the following candidate entity pairs.\n"
                "Respond with JSON: "
                '{"decisions":[{"id":"p1","same":true},{"id":"p2","same":false}]}\n\n'
                "Pairs:\n"
                + "\n".join(lines)
            )

            try:
                response = await self.llm.generate(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    max_tokens=600,
                    temperature=0.0,
                )
                payload = self._extract_json_block(response)
                for decision in payload.get("decisions", []):
                    if not isinstance(decision, dict):
                        continue
                    pair_id = str(decision.get("id", ""))
                    same = bool(decision.get("same", False))
                    if same and pair_id in id_to_pair:
                        confirmed.add(id_to_pair[pair_id])
            except Exception as exc:
                logger.warning("LLM confirmation batch failed: %s", exc)

        return confirmed

    def resolve_entities(
        self,
        entities: List[ExtractedEntity],
    ) -> Tuple[List[ExtractedEntity], EntityResolutionStats]:
        """
        Resolve duplicates and synonyms in a list of entities.

        Returns:
            (resolved_entities, stats)
        """
        if not entities:
            stats = EntityResolutionStats(
                raw_entities=0,
                resolved_entities=0,
                merged_entities=0,
                canonicalization_rate=0.0,
            )
            return [], stats

        records = self._build_records(entities)
        name_stats = self._build_name_stats(records)
        name_keys = list(name_stats.keys())
        alias_map = self._build_alias_map(
            name_keys=name_keys,
            name_stats=name_stats,
            confirmed_pairs=set(),
        )
        resolved = self._resolve_with_alias_map(records, alias_map)

        raw_count = len(entities)
        resolved_count = len(resolved)
        merged_count = max(0, raw_count - resolved_count)
        rate = (merged_count / raw_count) if raw_count else 0.0

        stats = EntityResolutionStats(
            raw_entities=raw_count,
            resolved_entities=resolved_count,
            merged_entities=merged_count,
            canonicalization_rate=rate,
        )

        return resolved, stats

    async def resolve_entities_async(
        self,
        entities: List[ExtractedEntity],
        use_llm_confirmation: bool = True,
        embeddings: Optional[Dict[str, List[float]]] = None,
    ) -> Tuple[List[ExtractedEntity], EntityResolutionStats]:
        """
        Resolve entities with optional LLM-based confirmation for uncertain candidate pairs.

        This is the recommended path for batch ingestion pipelines.

        Args:
            entities: Extracted entities to resolve.
            use_llm_confirmation: Whether to use LLM for uncertain pairs.
            embeddings: Optional dict mapping entity canonical_name to embedding
                vector.  When provided, embedding-based candidate pairs are
                generated and unioned with string-based candidates before LLM
                review.  This is useful for re-resolution of entities that
                already have stored embeddings.
        """
        if not entities:
            return self.resolve_entities(entities)

        # If embeddings provided, delegate to the enhanced method.
        if embeddings:
            return await self.resolve_entities_with_embeddings(
                entities=entities,
                embeddings=embeddings,
                use_llm_confirmation=use_llm_confirmation,
            )

        records = self._build_records(entities)
        name_stats = self._build_name_stats(records)
        name_keys = list(name_stats.keys())

        confirmed_pairs: Set[Tuple[Tuple[str, str, str], Tuple[str, str, str]]] = set()
        uncertain_pairs: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]] = []
        string_candidates_found = 0
        if use_llm_confirmation and self.llm and len(name_keys) >= 2:
            review_candidates = self._generate_candidate_pairs(
                name_keys=name_keys,
                min_similarity=self.llm_review_threshold,
                max_pairs=self.max_llm_pair_checks,
            )
            string_candidates_found = len(review_candidates)
            uncertain_pairs = [
                pair for pair in review_candidates if pair[2] < self.auto_merge_threshold
            ]
            confirmed_pairs = await self._confirm_candidate_pairs_with_llm(uncertain_pairs)

        alias_map = self._build_alias_map(
            name_keys=name_keys,
            name_stats=name_stats,
            confirmed_pairs=confirmed_pairs,
        )
        resolved = self._resolve_with_alias_map(records, alias_map)

        raw_count = len(entities)
        resolved_count = len(resolved)
        merged_count = max(0, raw_count - resolved_count)
        rate = (merged_count / raw_count) if raw_count else 0.0
        potential_false_merge_samples = self._build_potential_false_merge_samples(
            uncertain_pairs=uncertain_pairs,
            confirmed_pairs=confirmed_pairs,
        )
        score_map: Dict[Tuple[Tuple[str, str, str], Tuple[str, str, str]], float] = {}
        for left, right, score in uncertain_pairs:
            score_map[(left, right)] = score
            score_map[(right, left)] = score
        potential_false_merge_count = sum(
            1 for left, right in confirmed_pairs if (left, right) in score_map
        )

        stats = EntityResolutionStats(
            raw_entities=raw_count,
            resolved_entities=resolved_count,
            merged_entities=merged_count,
            canonicalization_rate=rate,
            llm_pairs_reviewed=len(uncertain_pairs),
            llm_pairs_confirmed=len(confirmed_pairs),
            potential_false_merge_count=potential_false_merge_count,
            potential_false_merge_samples=potential_false_merge_samples,
            embedding_candidates_found=0,
            string_candidates_found=string_candidates_found,
        )

        return resolved, stats

    async def resolve_entities_with_embeddings(
        self,
        entities: List[ExtractedEntity],
        embeddings: Optional[Dict[str, List[float]]] = None,
        use_llm_confirmation: bool = True,
    ) -> Tuple[List[ExtractedEntity], EntityResolutionStats]:
        """
        Enhanced resolution that combines string similarity with embedding similarity.

        This method is designed for re-resolution of entities that already have
        stored embeddings (e.g., cross-paper resolution after initial import).
        It generates candidate pairs from both string-based and embedding-based
        similarity, unions them, and sends uncertain pairs to LLM review.

        For the initial import pipeline where embeddings are not yet available,
        use ``resolve_entities_async`` without the *embeddings* parameter.

        Args:
            entities: Extracted entities to resolve.
            embeddings: Dict mapping entity canonical_name to embedding vector
                (list[float]).  If None or empty, falls back to string-only
                resolution via ``resolve_entities_async``.
            use_llm_confirmation: Whether to use LLM for uncertain pairs.

        Returns:
            Tuple of (resolved_entities, stats).
        """
        if not entities:
            return self.resolve_entities(entities)

        # Fall back to string-only when no embeddings available.
        if not embeddings:
            return await self.resolve_entities_async(
                entities=entities,
                use_llm_confirmation=use_llm_confirmation,
            )

        records = self._build_records(entities)
        name_stats = self._build_name_stats(records)
        name_keys = list(name_stats.keys())

        # --- Step 1: String-based candidate pairs ---
        string_candidates: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]] = []
        if len(name_keys) >= 2:
            string_candidates = self._generate_candidate_pairs(
                name_keys=name_keys,
                min_similarity=self.llm_review_threshold,
                max_pairs=None,  # No cap yet; we union before capping.
            )

        # --- Step 2: Embedding-based candidate pairs ---
        # Build embedding records by attaching vectors to canonicalized records.
        entities_with_emb: List[Dict[str, Any]] = []
        for key in name_keys:
            canonical_name = key[2]
            emb = embeddings.get(canonical_name)
            if emb is not None:
                entities_with_emb.append(
                    {
                        "entity_type": key[0],
                        "context_bucket": key[1],
                        "canonical_name": canonical_name,
                        "embedding": emb,
                    }
                )

        embedding_candidates: List[Tuple[Tuple[str, str, str], Tuple[str, str, str], float]] = []
        if len(entities_with_emb) >= 2:
            embedding_candidates = self._generate_embedding_candidate_pairs(
                entities_with_embeddings=entities_with_emb,
                embedding_review_threshold=self.llm_review_threshold,
                embedding_auto_merge_threshold=self.auto_merge_threshold,
                max_pairs=None,
            )

        # --- Step 3: Union candidate sets ---
        # Use a dict keyed by (left_key, right_key) to keep highest similarity
        # from either source.
        pair_best_score: Dict[
            Tuple[Tuple[str, str, str], Tuple[str, str, str]], float
        ] = {}
        for left, right, score in string_candidates:
            pair_key = (left, right) if left <= right else (right, left)
            if score > pair_best_score.get(pair_key, 0.0):
                pair_best_score[pair_key] = score
        for left, right, score in embedding_candidates:
            pair_key = (left, right) if left <= right else (right, left)
            if score > pair_best_score.get(pair_key, 0.0):
                pair_best_score[pair_key] = score

        combined_candidates = [
            (left, right, score) for (left, right), score in pair_best_score.items()
        ]
        combined_candidates.sort(key=lambda item: item[2], reverse=True)

        # Cap total pairs sent to LLM.
        if self.max_llm_pair_checks is not None:
            combined_candidates = combined_candidates[: self.max_llm_pair_checks]

        # --- Step 4: LLM confirmation for uncertain pairs ---
        confirmed_pairs: Set[Tuple[Tuple[str, str, str], Tuple[str, str, str]]] = set()
        uncertain_pairs = [
            pair for pair in combined_candidates if pair[2] < self.auto_merge_threshold
        ]
        if use_llm_confirmation and self.llm and uncertain_pairs:
            confirmed_pairs = await self._confirm_candidate_pairs_with_llm(uncertain_pairs)

        # --- Step 5: Build alias map and resolve ---
        alias_map = self._build_alias_map(
            name_keys=name_keys,
            name_stats=name_stats,
            confirmed_pairs=confirmed_pairs,
        )
        resolved = self._resolve_with_alias_map(records, alias_map)

        # --- Step 6: Build stats ---
        raw_count = len(entities)
        resolved_count = len(resolved)
        merged_count = max(0, raw_count - resolved_count)
        rate = (merged_count / raw_count) if raw_count else 0.0
        potential_false_merge_samples = self._build_potential_false_merge_samples(
            uncertain_pairs=uncertain_pairs,
            confirmed_pairs=confirmed_pairs,
        )
        score_map: Dict[Tuple[Tuple[str, str, str], Tuple[str, str, str]], float] = {}
        for left, right, score in uncertain_pairs:
            score_map[(left, right)] = score
            score_map[(right, left)] = score
        potential_false_merge_count = sum(
            1 for left, right in confirmed_pairs if (left, right) in score_map
        )

        stats = EntityResolutionStats(
            raw_entities=raw_count,
            resolved_entities=resolved_count,
            merged_entities=merged_count,
            canonicalization_rate=rate,
            llm_pairs_reviewed=len(uncertain_pairs),
            llm_pairs_confirmed=len(confirmed_pairs),
            potential_false_merge_count=potential_false_merge_count,
            potential_false_merge_samples=potential_false_merge_samples,
            embedding_candidates_found=len(embedding_candidates),
            string_candidates_found=len(string_candidates),
        )

        return resolved, stats

    # ------------------------------------------------------------------
    # Phase 10B: Cross-Paper Entity Linking (SAME_AS relationships)
    # ------------------------------------------------------------------

    async def cross_paper_entity_linking(
        self,
        project_id: str,
        db,
        entity_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Second-pass entity linking: find entities with the same canonical_name
        across different source papers and create SAME_AS relationships.

        This runs *after* standard entity resolution.  It queries the persisted
        ``entities`` table, groups rows by ``(entity_type, name)`` where the
        entities originate from more than one source paper, and inserts
        ``SAME_AS`` relationship rows for each cross-paper pair.

        Args:
            project_id: UUID string of the project.
            db: Database connection (asyncpg-compatible with ``fetch`` /
                ``fetchval`` / ``execute`` helpers).
            entity_types: Entity types to consider.  Defaults to
                ``["Method", "Dataset", "Concept"]``.

        Returns:
            Dict with keys ``groups_found``, ``links_created``,
            ``entity_types``, and ``skipped_existing``.
        """
        if entity_types is None:
            entity_types = ["Method", "Dataset", "Concept"]

        # -----------------------------------------------------------------
        # Step 1: Find entities grouped by (entity_type, name) that appear
        #         in more than one distinct source paper.
        # -----------------------------------------------------------------
        # ``properties->>'source_paper_id'`` stores the originating paper for
        # each entity row.  We aggregate entity ids and distinct paper ids.
        type_placeholders = ", ".join(
            f"${i + 2}" for i in range(len(entity_types))
        )
        query = f"""
            SELECT
                entity_type::text AS entity_type,
                name,
                array_agg(id) AS entity_ids,
                array_agg(DISTINCT properties->>'source_paper_id')
                    FILTER (WHERE properties->>'source_paper_id' IS NOT NULL)
                    AS paper_ids
            FROM entities
            WHERE project_id = $1
              AND entity_type::text IN ({type_placeholders})
              AND properties->>'source_paper_id' IS NOT NULL
            GROUP BY entity_type, name
            HAVING COUNT(DISTINCT properties->>'source_paper_id') > 1
        """

        params: list = [project_id] + entity_types
        groups = await db.fetch(query, *params)

        groups_found = len(groups)
        links_created = 0
        skipped_existing = 0

        logger.info(
            "Cross-paper linking for project %s: %d groups across types %s",
            project_id,
            groups_found,
            entity_types,
        )

        # -----------------------------------------------------------------
        # Step 2: For each group, create SAME_AS relationships between all
        #         pairs of entities from *different* papers.
        # -----------------------------------------------------------------
        for row in groups:
            entity_ids = list(row["entity_ids"])
            canonical_name = row["name"]
            etype = row["entity_type"]

            if len(entity_ids) < 2:
                continue

            # Build a mapping of entity_id -> source_paper_id so we only
            # link entities from different papers.
            id_paper_query = """
                SELECT id, properties->>'source_paper_id' AS paper_id
                FROM entities
                WHERE id = ANY($1::uuid[])
            """
            id_rows = await db.fetch(id_paper_query, entity_ids)
            id_to_paper: Dict[str, Optional[str]] = {
                str(r["id"]): r["paper_id"] for r in id_rows
            }

            for left_id, right_id in itertools.combinations(
                [str(eid) for eid in entity_ids], 2
            ):
                left_paper = id_to_paper.get(left_id)
                right_paper = id_to_paper.get(right_id)

                # Only link across different papers
                if left_paper == right_paper:
                    continue

                # Normalise direction so (left, right) is deterministic
                if left_id > right_id:
                    left_id, right_id = right_id, left_id

                # Check if SAME_AS relationship already exists
                existing = await db.fetchval(
                    """
                    SELECT 1 FROM relationships
                    WHERE project_id = $1
                      AND source_id = $2::uuid
                      AND target_id = $3::uuid
                      AND relationship_type = 'SAME_AS'
                    LIMIT 1
                    """,
                    project_id,
                    left_id,
                    right_id,
                )

                if existing:
                    skipped_existing += 1
                    continue

                properties = json.dumps({
                    "auto_generated": True,
                    "link_type": "cross_paper",
                    "canonical_name": canonical_name,
                    "entity_type": etype,
                })

                await db.execute(
                    """
                    INSERT INTO relationships
                        (project_id, source_id, target_id,
                         relationship_type, weight, properties)
                    VALUES ($1, $2::uuid, $3::uuid, 'SAME_AS', 1.0, $4)
                    ON CONFLICT (source_id, target_id, relationship_type)
                    DO NOTHING
                    """,
                    project_id,
                    left_id,
                    right_id,
                    properties,
                )
                links_created += 1

        logger.info(
            "Cross-paper linking complete: %d groups, %d links created, "
            "%d skipped (already exist)",
            groups_found,
            links_created,
            skipped_existing,
        )

        return {
            "groups_found": groups_found,
            "links_created": links_created,
            "skipped_existing": skipped_existing,
            "entity_types": entity_types,
        }
