"""
Citation Builder — On-demand citation network construction.
Fetches inter-paper citation data from Semantic Scholar and caches
the result in-memory. No DB persistence (by design decision).
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# --- Configuration ---
MAX_PAPERS_FOR_BUILD = 100  # Large project guard
S2_API_KEY = os.getenv("S2_API_KEY")

# --- Data Models ---

@dataclass
class CitationNode:
    paper_id: str  # Semantic Scholar ID
    local_id: Optional[str] = None
    title: str = ""
    year: Optional[int] = None
    citation_count: int = 0
    doi: Optional[str] = None
    is_local: bool = False


@dataclass
class CitationEdge:
    source_id: str
    target_id: str


@dataclass
class CitationNetwork:
    nodes: list[CitationNode] = field(default_factory=list)
    edges: list[CitationEdge] = field(default_factory=list)
    papers_matched: int = 0
    papers_total: int = 0
    build_time_seconds: float = 0.0
    built_at: float = 0.0


@dataclass
class BuildStatus:
    state: str = "idle"  # idle, building, completed, failed
    progress: int = 0
    total: int = 0
    phase: str = ""  # "matching" | "references" | ""
    error: Optional[str] = None
    started_at: float = 0.0


# --- Module State ---
_cache: dict[str, CitationNetwork] = {}
_cache_ttl = 3600  # 1 hour
_build_status: dict[str, BuildStatus] = {}
_build_locks: dict[str, asyncio.Lock] = {}
_global_build_semaphore = asyncio.Semaphore(1)  # Global: only 1 build at a time


# --- DOI Normalization ---
def _normalize_doi(doi: str) -> str:
    """Normalize DOI: strip prefixes, lowercase, trim whitespace."""
    if not doi:
        return doi
    doi = doi.strip()
    for prefix in ["https://doi.org/", "http://doi.org/", "doi:", "DOI:"]:
        if doi.startswith(prefix):
            doi = doi[len(prefix):]
            break
    return doi.strip().lower()


# --- Public API ---

def get_cached_network(project_id: str) -> Optional[CitationNetwork]:
    """Get cached citation network if still valid."""
    network = _cache.get(project_id)
    if network and (time.time() - network.built_at) < _cache_ttl:
        return network
    if network:
        del _cache[project_id]
    return None


def get_build_status(project_id: str) -> BuildStatus:
    """Get current build status for a project."""
    return _build_status.get(project_id, BuildStatus())


async def build_citation_network(
    project_id: str,
    papers: list[dict],  # [{doi, title, local_id, year}]
) -> CitationNetwork:
    """Build citation network by fetching references from Semantic Scholar."""
    from integrations.semantic_scholar import SemanticScholarClient

    if project_id not in _build_locks:
        _build_locks[project_id] = asyncio.Lock()

    # Global semaphore: only 1 build at a time across all projects
    async with _global_build_semaphore:
        async with _build_locks[project_id]:
            # Clear stale cache and status on new build
            _cache.pop(project_id, None)

            total_phases = len(papers) * 2  # Phase1 + Phase2
            status = BuildStatus(
                state="building",
                total=total_phases,
                phase="matching",
                started_at=time.time(),
            )
            _build_status[project_id] = status

            start_time = time.time()
            nodes: dict[str, CitationNode] = {}
            edges: list[CitationEdge] = []
            matched = 0

            try:
                # 1 req/sec throttle with API key
                async with SemanticScholarClient(
                    api_key=S2_API_KEY,
                    requests_per_interval=1,
                    interval_seconds=1,
                ) as client:
                    # Phase 1: Resolve local papers via DOI
                    for paper in papers:
                        raw_doi = paper.get("doi")
                        local_id = paper.get("local_id")
                        title = paper.get("title", "")
                        year = paper.get("year")

                        if not raw_doi:
                            status.progress += 1
                            continue

                        doi = _normalize_doi(raw_doi)
                        s2_paper = await client.get_paper(f"DOI:{doi}")

                        if s2_paper:
                            matched += 1
                            node = CitationNode(
                                paper_id=s2_paper.paper_id,
                                local_id=local_id,
                                title=s2_paper.title or title,
                                year=s2_paper.year or year,
                                citation_count=s2_paper.citation_count,
                                doi=s2_paper.doi or doi,
                                is_local=True,
                            )
                            nodes[s2_paper.paper_id] = node

                        status.progress += 1

                    # Phase 2: Fetch references for matched papers
                    status.phase = "references"
                    local_s2_ids = set(nodes.keys())
                    for s2_id in list(local_s2_ids):
                        try:
                            refs = await client.get_references(s2_id, limit=50)
                            for ref in refs:
                                if ref.paper_id not in nodes:
                                    nodes[ref.paper_id] = CitationNode(
                                        paper_id=ref.paper_id,
                                        title=ref.title,
                                        year=ref.year,
                                        citation_count=ref.citation_count,
                                        doi=ref.doi,
                                        is_local=False,
                                    )
                                edges.append(CitationEdge(
                                    source_id=s2_id,
                                    target_id=ref.paper_id,
                                ))
                        except Exception as e:
                            logger.warning(f"Failed to get refs for {s2_id}: {e}")

                        status.progress += 1

                build_time = time.time() - start_time
                network = CitationNetwork(
                    nodes=list(nodes.values()),
                    edges=edges,
                    papers_matched=matched,
                    papers_total=len(papers),
                    build_time_seconds=round(build_time, 1),
                    built_at=time.time(),
                )
                _cache[project_id] = network
                status.state = "completed"
                status.progress = total_phases
                status.phase = ""
                logger.info(
                    f"Citation network: {matched}/{len(papers)} matched, "
                    f"{len(nodes)} nodes, {len(edges)} edges in {build_time:.1f}s"
                )
                return network

            except Exception as e:
                status.state = "failed"
                status.error = str(e)
                logger.error(f"Citation network build failed: {e}")
                raise
