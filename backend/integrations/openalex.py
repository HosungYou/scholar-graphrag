"""
OpenAlex API Integration for ScholaRAG_Graph.

OpenAlex is a free, open catalog of the global research system.
It provides:
- 250M+ works (papers, books, etc.)
- 100M+ authors
- 100K+ institutions
- Concepts and topics taxonomy
- Open access coverage tracking

API: https://docs.openalex.org/
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import httpx

logger = logging.getLogger(__name__)


@dataclass
class OpenAlexWork:
    """OpenAlex work (paper/publication) data model."""

    id: str  # OpenAlex ID (e.g., "W2741809807")
    title: str
    abstract: Optional[str] = None
    publication_year: Optional[int] = None
    publication_date: Optional[str] = None
    type: Optional[str] = None  # journal-article, book-chapter, etc.
    doi: Optional[str] = None
    open_access_url: Optional[str] = None
    is_open_access: bool = False
    open_access_status: Optional[str] = None  # gold, green, hybrid, bronze, closed
    citation_count: int = 0
    referenced_works_count: int = 0
    authors: List[Dict[str, Any]] = field(default_factory=list)
    concepts: List[Dict[str, Any]] = field(default_factory=list)
    topics: List[Dict[str, Any]] = field(default_factory=list)
    primary_location: Optional[Dict[str, Any]] = None
    biblio: Optional[Dict[str, Any]] = None  # volume, issue, first_page, last_page

    # Additional IDs
    pmid: Optional[str] = None
    pmcid: Optional[str] = None
    mag_id: Optional[str] = None

    @classmethod
    def from_api_response(cls, data: Dict[str, Any]) -> "OpenAlexWork":
        """Create work from API response."""
        ids = data.get("ids", {})
        open_access = data.get("open_access", {})

        # Extract best available abstract
        abstract = None
        if data.get("abstract_inverted_index"):
            abstract = cls._reconstruct_abstract(data["abstract_inverted_index"])

        # Extract authors with affiliations
        authors = []
        for authorship in data.get("authorships", []):
            author_data = authorship.get("author", {})
            institutions = [
                {
                    "id": inst.get("id"),
                    "display_name": inst.get("display_name"),
                    "ror": inst.get("ror"),
                    "country_code": inst.get("country_code"),
                }
                for inst in authorship.get("institutions", [])
            ]
            authors.append({
                "id": author_data.get("id"),
                "display_name": author_data.get("display_name"),
                "orcid": author_data.get("orcid"),
                "author_position": authorship.get("author_position"),
                "institutions": institutions,
            })

        # Extract concepts with scores
        concepts = [
            {
                "id": c.get("id"),
                "display_name": c.get("display_name"),
                "level": c.get("level"),
                "score": c.get("score"),
            }
            for c in data.get("concepts", [])
        ]

        # Extract topics
        topics = [
            {
                "id": t.get("id"),
                "display_name": t.get("display_name"),
                "score": t.get("score"),
                "subfield": t.get("subfield", {}).get("display_name"),
                "field": t.get("field", {}).get("display_name"),
                "domain": t.get("domain", {}).get("display_name"),
            }
            for t in data.get("topics", [])
        ]

        return cls(
            id=data.get("id", ""),
            title=data.get("title") or data.get("display_name", ""),
            abstract=abstract,
            publication_year=data.get("publication_year"),
            publication_date=data.get("publication_date"),
            type=data.get("type"),
            doi=ids.get("doi") or data.get("doi"),
            open_access_url=open_access.get("oa_url"),
            is_open_access=open_access.get("is_oa", False),
            open_access_status=open_access.get("oa_status"),
            citation_count=data.get("cited_by_count", 0),
            referenced_works_count=data.get("referenced_works_count", 0),
            authors=authors,
            concepts=concepts,
            topics=topics,
            primary_location=data.get("primary_location"),
            biblio=data.get("biblio"),
            pmid=ids.get("pmid"),
            pmcid=ids.get("pmcid"),
            mag_id=ids.get("mag"),
        )

    @staticmethod
    def _reconstruct_abstract(inverted_index: Dict[str, List[int]]) -> str:
        """Reconstruct abstract from inverted index format."""
        if not inverted_index:
            return ""

        # Find max position
        max_pos = 0
        for positions in inverted_index.values():
            if positions:
                max_pos = max(max_pos, max(positions))

        # Build words array
        words = [""] * (max_pos + 1)
        for word, positions in inverted_index.items():
            for pos in positions:
                words[pos] = word

        return " ".join(words)


@dataclass
class OpenAlexAuthor:
    """OpenAlex author data model."""

    id: str
    display_name: str
    orcid: Optional[str] = None
    works_count: int = 0
    citation_count: int = 0
    h_index: int = 0
    i10_index: int = 0
    last_known_institution: Optional[Dict[str, Any]] = None
    topics: List[Dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_api_response(cls, data: Dict[str, Any]) -> "OpenAlexAuthor":
        """Create author from API response."""
        summary = data.get("summary_stats", {})

        return cls(
            id=data.get("id", ""),
            display_name=data.get("display_name", ""),
            orcid=data.get("orcid"),
            works_count=data.get("works_count", 0),
            citation_count=data.get("cited_by_count", 0),
            h_index=summary.get("h_index", 0),
            i10_index=summary.get("i10_index", 0),
            last_known_institution=data.get("last_known_institution"),
            topics=data.get("topics", []),
        )


@dataclass
class OpenAlexConcept:
    """OpenAlex concept data model."""

    id: str
    display_name: str
    level: int = 0
    description: Optional[str] = None
    works_count: int = 0
    citation_count: int = 0
    ancestors: List[Dict[str, Any]] = field(default_factory=list)
    related_concepts: List[Dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_api_response(cls, data: Dict[str, Any]) -> "OpenAlexConcept":
        """Create concept from API response."""
        return cls(
            id=data.get("id", ""),
            display_name=data.get("display_name", ""),
            level=data.get("level", 0),
            description=data.get("description"),
            works_count=data.get("works_count", 0),
            citation_count=data.get("cited_by_count", 0),
            ancestors=data.get("ancestors", []),
            related_concepts=data.get("related_concepts", []),
        )


class OpenAlexClient:
    """
    OpenAlex API client.

    Features:
    - Work (paper) search and retrieval
    - Author search and disambiguation
    - Concept/topic taxonomy navigation
    - Citation graph traversal
    - Open access coverage tracking
    - Polite pool access (with mailto)
    """

    BASE_URL = "https://api.openalex.org"

    def __init__(
        self,
        email: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """
        Initialize the client.

        Args:
            email: Email for polite pool access (higher rate limits)
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts
        """
        self.email = email
        self.timeout = timeout
        self.max_retries = max_retries

        headers = {
            "Accept": "application/json",
            "User-Agent": "ScholaRAG_Graph/1.0 (mailto:scholarag@example.com)",
        }

        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers=headers,
        )

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    def _build_params(self, **kwargs) -> Dict[str, str]:
        """Build query parameters with polite pool email."""
        params = {k: str(v) for k, v in kwargs.items() if v is not None}
        if self.email:
            params["mailto"] = self.email
        return params

    async def _request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Make an API request with retry logic."""
        for attempt in range(self.max_retries):
            try:
                response = await self._client.request(method, url, **kwargs)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(f"Rate limited, waiting {retry_after}s")
                    await asyncio.sleep(retry_after)
                    continue

                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"HTTP error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)

            except httpx.RequestError as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"Request error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)

        return {}

    # ==================== Works (Papers) ====================

    async def search_works(
        self,
        query: Optional[str] = None,
        title: Optional[str] = None,
        abstract: Optional[str] = None,
        filter_params: Optional[Dict[str, str]] = None,
        sort: str = "relevance_score:desc",
        per_page: int = 25,
        page: int = 1,
    ) -> List[OpenAlexWork]:
        """
        Search for works (papers).

        Args:
            query: Full-text search query
            title: Search in title only
            abstract: Search in abstract only
            filter_params: Filter parameters (e.g., {"publication_year": "2020-2024"})
            sort: Sort order (relevance_score, cited_by_count, publication_date)
            per_page: Results per page (max 200)
            page: Page number

        Returns:
            List of works matching the query

        Example filters:
            - publication_year: "2020" or "2020-2024"
            - type: "journal-article"
            - is_oa: "true"
            - primary_location.source.id: "S123456789" (specific journal)
            - authorships.author.id: "A123456789" (specific author)
            - concepts.id: "C123456789" (specific concept)
        """
        params = self._build_params(
            sort=sort,
            per_page=min(per_page, 200),
            page=page,
        )

        # Build search query
        search_parts = []
        if query:
            search_parts.append(query)
        if title:
            params["filter"] = params.get("filter", "") + f",title.search:{title}"
        if abstract:
            params["filter"] = params.get("filter", "") + f",abstract.search:{abstract}"

        if search_parts:
            params["search"] = " ".join(search_parts)

        # Add filter params
        if filter_params:
            filter_str = ",".join([f"{k}:{v}" for k, v in filter_params.items()])
            if "filter" in params:
                params["filter"] += "," + filter_str
            else:
                params["filter"] = filter_str

        url = f"{self.BASE_URL}/works"
        data = await self._request("GET", url, params=params)

        return [
            OpenAlexWork.from_api_response(item)
            for item in data.get("results", [])
        ]

    async def search_works_bulk(
        self,
        query: str,
        max_results: int = 1000,
        **kwargs
    ) -> List[OpenAlexWork]:
        """
        Search for works with pagination.

        Args:
            query: Search query
            max_results: Maximum total results
            **kwargs: Additional arguments passed to search_works

        Returns:
            List of all works found
        """
        all_works = []
        page = 1
        per_page = min(200, max_results)

        while len(all_works) < max_results:
            works = await self.search_works(
                query=query,
                per_page=per_page,
                page=page,
                **kwargs
            )

            if not works:
                break

            all_works.extend(works)
            page += 1

            if len(works) < per_page:
                break

        return all_works[:max_results]

    async def get_work(
        self,
        work_id: str,
    ) -> Optional[OpenAlexWork]:
        """
        Get a specific work by ID.

        Args:
            work_id: OpenAlex work ID, DOI, PMID, etc.
                - OpenAlex ID: "W2741809807"
                - DOI: "https://doi.org/10.1234/example"
                - PMID: "pmid:12345678"

        Returns:
            Work details or None if not found
        """
        # Handle different ID formats
        if work_id.startswith("W"):
            url = f"{self.BASE_URL}/works/{work_id}"
        elif work_id.startswith("https://doi.org/"):
            url = f"{self.BASE_URL}/works/{work_id}"
        elif work_id.startswith("10."):
            url = f"{self.BASE_URL}/works/https://doi.org/{work_id}"
        else:
            url = f"{self.BASE_URL}/works/{work_id}"

        params = self._build_params()

        try:
            data = await self._request("GET", url, params=params)
            return OpenAlexWork.from_api_response(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_works_batch(
        self,
        work_ids: List[str],
    ) -> List[OpenAlexWork]:
        """
        Get multiple works by IDs using filter.

        Args:
            work_ids: List of OpenAlex work IDs

        Returns:
            List of works found
        """
        if not work_ids:
            return []

        # OpenAlex supports OR filter for batch retrieval
        all_works = []

        # Process in batches of 50 (URL length limits)
        for i in range(0, len(work_ids), 50):
            batch = work_ids[i:i + 50]
            ids_filter = "|".join(batch)

            works = await self.search_works(
                filter_params={"ids.openalex": ids_filter},
                per_page=len(batch),
            )
            all_works.extend(works)

        return all_works

    async def get_references(
        self,
        work_id: str,
        limit: int = 100,
    ) -> List[OpenAlexWork]:
        """
        Get works that this work references.

        Args:
            work_id: Work ID
            limit: Maximum references

        Returns:
            List of referenced works
        """
        work = await self.get_work(work_id)
        if not work:
            return []

        # Get referenced_works from the work
        # OpenAlex provides referenced_works as a list of IDs
        # We need to fetch them separately
        works = await self.search_works(
            filter_params={"cited_by": work_id},
            per_page=min(limit, 200),
        )

        return works

    async def get_citations(
        self,
        work_id: str,
        limit: int = 100,
    ) -> List[OpenAlexWork]:
        """
        Get works that cite this work.

        Args:
            work_id: Work ID
            limit: Maximum citations

        Returns:
            List of citing works
        """
        return await self.search_works(
            filter_params={"cites": work_id},
            per_page=min(limit, 200),
            sort="cited_by_count:desc",
        )

    async def enrich_work_metadata(
        self,
        doi: Optional[str] = None,
        title: Optional[str] = None,
    ) -> Optional[OpenAlexWork]:
        """
        Enrich work metadata using DOI or title.

        Args:
            doi: Work DOI
            title: Work title (used if DOI not provided)

        Returns:
            Enriched work data or None if not found
        """
        if doi:
            work = await self.get_work(doi)
            if work:
                return work

        if title:
            works = await self.search_works(title=title, per_page=5)
            if works:
                # Find best match
                title_lower = title.lower()
                for work in works:
                    if work.title and work.title.lower() == title_lower:
                        return work
                return works[0]

        return None

    # ==================== Authors ====================

    async def search_authors(
        self,
        query: str,
        per_page: int = 25,
    ) -> List[OpenAlexAuthor]:
        """
        Search for authors.

        Args:
            query: Author name to search
            per_page: Results per page

        Returns:
            List of matching authors
        """
        params = self._build_params(
            search=query,
            per_page=min(per_page, 200),
        )

        url = f"{self.BASE_URL}/authors"
        data = await self._request("GET", url, params=params)

        return [
            OpenAlexAuthor.from_api_response(item)
            for item in data.get("results", [])
        ]

    async def get_author(
        self,
        author_id: str,
    ) -> Optional[OpenAlexAuthor]:
        """
        Get author by ID.

        Args:
            author_id: OpenAlex author ID or ORCID

        Returns:
            Author details or None if not found
        """
        url = f"{self.BASE_URL}/authors/{author_id}"
        params = self._build_params()

        try:
            data = await self._request("GET", url, params=params)
            return OpenAlexAuthor.from_api_response(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_author_works(
        self,
        author_id: str,
        limit: int = 100,
    ) -> List[OpenAlexWork]:
        """
        Get works by an author.

        Args:
            author_id: Author ID
            limit: Maximum works

        Returns:
            List of works by the author
        """
        return await self.search_works(
            filter_params={"authorships.author.id": author_id},
            per_page=min(limit, 200),
            sort="publication_date:desc",
        )

    # ==================== Concepts ====================

    async def search_concepts(
        self,
        query: str,
        per_page: int = 25,
    ) -> List[OpenAlexConcept]:
        """
        Search for concepts.

        Args:
            query: Concept name to search
            per_page: Results per page

        Returns:
            List of matching concepts
        """
        params = self._build_params(
            search=query,
            per_page=min(per_page, 200),
        )

        url = f"{self.BASE_URL}/concepts"
        data = await self._request("GET", url, params=params)

        return [
            OpenAlexConcept.from_api_response(item)
            for item in data.get("results", [])
        ]

    async def get_concept(
        self,
        concept_id: str,
    ) -> Optional[OpenAlexConcept]:
        """
        Get concept by ID.

        Args:
            concept_id: OpenAlex concept ID

        Returns:
            Concept details or None if not found
        """
        url = f"{self.BASE_URL}/concepts/{concept_id}"
        params = self._build_params()

        try:
            data = await self._request("GET", url, params=params)
            return OpenAlexConcept.from_api_response(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def get_related_concepts(
        self,
        concept_id: str,
        limit: int = 20,
    ) -> List[OpenAlexConcept]:
        """
        Get related concepts.

        Args:
            concept_id: Source concept ID
            limit: Maximum related concepts

        Returns:
            List of related concepts
        """
        concept = await self.get_concept(concept_id)
        if not concept:
            return []

        # Fetch full details of related concepts
        related_ids = [c.get("id") for c in concept.related_concepts[:limit]]
        related = []

        for rid in related_ids:
            c = await self.get_concept(rid)
            if c:
                related.append(c)

        return related

    # ==================== Open Access Statistics ====================

    async def get_oa_statistics(
        self,
        filter_params: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Get open access statistics for works matching a filter.

        Args:
            filter_params: Filter parameters

        Returns:
            Statistics about open access coverage
        """
        params = self._build_params(
            group_by="open_access.oa_status",
        )

        if filter_params:
            params["filter"] = ",".join([f"{k}:{v}" for k, v in filter_params.items()])

        url = f"{self.BASE_URL}/works"
        data = await self._request("GET", url, params=params)

        # Parse group_by results
        total = data.get("meta", {}).get("count", 0)
        groups = {
            g["key"]: g["count"]
            for g in data.get("group_by", [])
        }

        oa_count = total - groups.get("closed", 0)

        return {
            "total_works": total,
            "open_access_count": oa_count,
            "open_access_percentage": (oa_count / total * 100) if total > 0 else 0,
            "by_status": groups,
        }
