"""
Zotero API Integration for ScholaRAG_Graph.

Provides bidirectional synchronization with Zotero reference manager:
- Import collections from Zotero
- Export project papers to Zotero
- Sync annotations and notes
- Track collection updates

API: https://www.zotero.org/support/dev/web_api/v3/start
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


class ZoteroItemType(str, Enum):
    """Zotero item types."""
    JOURNAL_ARTICLE = "journalArticle"
    BOOK = "book"
    BOOK_SECTION = "bookSection"
    CONFERENCE_PAPER = "conferencePaper"
    THESIS = "thesis"
    REPORT = "report"
    PREPRINT = "preprint"
    WEBPAGE = "webpage"
    NOTE = "note"
    ATTACHMENT = "attachment"


@dataclass
class ZoteroItem:
    """Zotero item (paper/reference) data model."""

    key: str
    version: int
    item_type: str
    title: str
    abstract: Optional[str] = None
    date: Optional[str] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    creators: List[Dict[str, str]] = field(default_factory=list)
    publication_title: Optional[str] = None  # Journal name
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    tags: List[Dict[str, str]] = field(default_factory=list)
    collections: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    attachments: List[Dict[str, Any]] = field(default_factory=list)
    extra: Optional[str] = None  # Additional data
    date_added: Optional[str] = None
    date_modified: Optional[str] = None

    @classmethod
    def from_api_response(cls, data: Dict[str, Any]) -> "ZoteroItem":
        """Create item from API response."""
        item_data = data.get("data", {})

        # Parse year from date
        year = None
        date_str = item_data.get("date")
        if date_str:
            try:
                year = int(date_str[:4])
            except (ValueError, IndexError):
                pass

        return cls(
            key=data.get("key", ""),
            version=data.get("version", 0),
            item_type=item_data.get("itemType", ""),
            title=item_data.get("title", ""),
            abstract=item_data.get("abstractNote"),
            date=date_str,
            year=year,
            doi=item_data.get("DOI"),
            url=item_data.get("url"),
            creators=item_data.get("creators", []),
            publication_title=item_data.get("publicationTitle"),
            volume=item_data.get("volume"),
            issue=item_data.get("issue"),
            pages=item_data.get("pages"),
            tags=item_data.get("tags", []),
            collections=item_data.get("collections", []),
            extra=item_data.get("extra"),
            date_added=item_data.get("dateAdded"),
            date_modified=item_data.get("dateModified"),
        )

    def to_api_format(self) -> Dict[str, Any]:
        """Convert to Zotero API format for creation/update."""
        data = {
            "itemType": self.item_type,
            "title": self.title,
            "creators": self.creators,
            "tags": self.tags,
        }

        if self.abstract:
            data["abstractNote"] = self.abstract
        if self.date:
            data["date"] = self.date
        if self.doi:
            data["DOI"] = self.doi
        if self.url:
            data["url"] = self.url
        if self.publication_title:
            data["publicationTitle"] = self.publication_title
        if self.volume:
            data["volume"] = self.volume
        if self.issue:
            data["issue"] = self.issue
        if self.pages:
            data["pages"] = self.pages
        if self.collections:
            data["collections"] = self.collections
        if self.extra:
            data["extra"] = self.extra

        return data


@dataclass
class ZoteroCollection:
    """Zotero collection data model."""

    key: str
    version: int
    name: str
    parent_collection: Optional[str] = None
    num_items: int = 0

    @classmethod
    def from_api_response(cls, data: Dict[str, Any]) -> "ZoteroCollection":
        """Create collection from API response."""
        collection_data = data.get("data", {})
        meta = data.get("meta", {})

        return cls(
            key=data.get("key", ""),
            version=data.get("version", 0),
            name=collection_data.get("name", ""),
            parent_collection=collection_data.get("parentCollection"),
            num_items=meta.get("numItems", 0),
        )


@dataclass
class ZoteroLibrary:
    """Zotero library info."""

    library_id: str
    library_type: str  # "user" or "group"
    name: str
    version: int = 0


class ZoteroClient:
    """
    Zotero API client for reference management synchronization.

    Features:
    - Library and collection management
    - Item (paper) CRUD operations
    - Bidirectional sync with ScholaRAG_Graph projects
    - Tag and note synchronization
    - Attachment handling
    """

    BASE_URL = "https://api.zotero.org"

    def __init__(
        self,
        api_key: str,
        user_id: Optional[str] = None,
        group_id: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """
        Initialize the client.

        Args:
            api_key: Zotero API key (from zotero.org/settings/keys)
            user_id: User library ID (numeric user ID)
            group_id: Group library ID (alternative to user_id)
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts
        """
        self.api_key = api_key
        self.user_id = user_id
        self.group_id = group_id
        self.timeout = timeout
        self.max_retries = max_retries

        # Determine library prefix
        if group_id:
            self.library_prefix = f"/groups/{group_id}"
            self.library_type = "group"
        elif user_id:
            self.library_prefix = f"/users/{user_id}"
            self.library_type = "user"
        else:
            self.library_prefix = ""
            self.library_type = "unknown"

        headers = {
            "Zotero-API-Key": api_key,
            "Zotero-API-Version": "3",
            "Accept": "application/json",
        }

        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers=headers,
        )

        # Track library version for sync
        self._library_version: int = 0

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """
        Make an API request with retry logic.

        Returns:
            Tuple of (response_data, response_headers)
        """
        url = f"{self.BASE_URL}{endpoint}"

        for attempt in range(self.max_retries):
            try:
                response = await self._client.request(method, url, **kwargs)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(f"Rate limited, waiting {retry_after}s")
                    await asyncio.sleep(retry_after)
                    continue

                response.raise_for_status()

                # Update library version from response
                if "Last-Modified-Version" in response.headers:
                    self._library_version = int(response.headers["Last-Modified-Version"])

                return response.json() if response.content else {}, dict(response.headers)

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 304:
                    # Not modified
                    return {}, dict(e.response.headers)
                if attempt == self.max_retries - 1:
                    logger.error(f"HTTP error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)

            except httpx.RequestError as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"Request error after {self.max_retries} attempts: {e}")
                    raise
                await asyncio.sleep(2 ** attempt)

        return {}, {}

    # ==================== Library Info ====================

    async def get_key_permissions(self) -> Dict[str, Any]:
        """Get API key permissions and accessible libraries."""
        data, _ = await self._request("GET", "/keys/current")
        return data

    async def get_libraries(self) -> List[ZoteroLibrary]:
        """Get accessible libraries for the API key."""
        data = await self.get_key_permissions()

        libraries = []

        # User library
        if data.get("userID"):
            libraries.append(ZoteroLibrary(
                library_id=str(data["userID"]),
                library_type="user",
                name="My Library",
            ))

        # Group libraries
        for group in data.get("access", {}).get("groups", {}):
            libraries.append(ZoteroLibrary(
                library_id=str(group),
                library_type="group",
                name=f"Group {group}",
            ))

        return libraries

    # ==================== Collections ====================

    async def get_collections(
        self,
        top_level_only: bool = False,
    ) -> List[ZoteroCollection]:
        """
        Get all collections in the library.

        Args:
            top_level_only: Only return top-level collections

        Returns:
            List of collections
        """
        endpoint = f"{self.library_prefix}/collections"
        if top_level_only:
            endpoint += "/top"

        data, _ = await self._request("GET", endpoint)

        return [
            ZoteroCollection.from_api_response(item)
            for item in data
        ] if isinstance(data, list) else []

    async def get_collection(
        self,
        collection_key: str,
    ) -> Optional[ZoteroCollection]:
        """
        Get a specific collection.

        Args:
            collection_key: Collection key

        Returns:
            Collection or None if not found
        """
        endpoint = f"{self.library_prefix}/collections/{collection_key}"

        try:
            data, _ = await self._request("GET", endpoint)
            return ZoteroCollection.from_api_response(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def create_collection(
        self,
        name: str,
        parent_key: Optional[str] = None,
    ) -> Optional[ZoteroCollection]:
        """
        Create a new collection.

        Args:
            name: Collection name
            parent_key: Parent collection key (for subcollections)

        Returns:
            Created collection or None on failure
        """
        endpoint = f"{self.library_prefix}/collections"

        payload = [{
            "name": name,
        }]
        if parent_key:
            payload[0]["parentCollection"] = parent_key

        data, headers = await self._request(
            "POST",
            endpoint,
            json=payload,
        )

        # Response contains success/failed keys
        successful = data.get("successful", {})
        if "0" in successful:
            return ZoteroCollection.from_api_response(successful["0"])

        return None

    async def delete_collection(
        self,
        collection_key: str,
    ) -> bool:
        """
        Delete a collection.

        Args:
            collection_key: Collection key

        Returns:
            True if deleted successfully
        """
        endpoint = f"{self.library_prefix}/collections/{collection_key}"

        try:
            await self._request(
                "DELETE",
                endpoint,
                headers={"If-Unmodified-Since-Version": str(self._library_version)},
            )
            return True
        except httpx.HTTPStatusError:
            return False

    # ==================== Items (Papers) ====================

    async def get_items(
        self,
        collection_key: Optional[str] = None,
        item_type: Optional[str] = None,
        tag: Optional[str] = None,
        since_version: Optional[int] = None,
        limit: int = 100,
        start: int = 0,
    ) -> List[ZoteroItem]:
        """
        Get items from the library.

        Args:
            collection_key: Filter by collection
            item_type: Filter by item type
            tag: Filter by tag
            since_version: Only get items modified since version
            limit: Maximum items to return
            start: Start offset for pagination

        Returns:
            List of items
        """
        if collection_key:
            endpoint = f"{self.library_prefix}/collections/{collection_key}/items"
        else:
            endpoint = f"{self.library_prefix}/items"

        params = {
            "limit": min(limit, 100),
            "start": start,
        }

        if item_type:
            params["itemType"] = item_type
        if tag:
            params["tag"] = tag
        if since_version is not None:
            params["since"] = since_version

        data, _ = await self._request("GET", endpoint, params=params)

        items = []
        for item in data if isinstance(data, list) else []:
            # Filter out attachment and note items
            item_data = item.get("data", {})
            if item_data.get("itemType") not in ["attachment", "note"]:
                items.append(ZoteroItem.from_api_response(item))

        return items

    async def get_items_all(
        self,
        collection_key: Optional[str] = None,
        **kwargs
    ) -> List[ZoteroItem]:
        """
        Get all items with pagination.

        Args:
            collection_key: Filter by collection
            **kwargs: Additional arguments passed to get_items

        Returns:
            All items
        """
        all_items = []
        start = 0
        limit = 100

        while True:
            items = await self.get_items(
                collection_key=collection_key,
                limit=limit,
                start=start,
                **kwargs
            )

            if not items:
                break

            all_items.extend(items)
            start += len(items)

            if len(items) < limit:
                break

        return all_items

    async def get_item(
        self,
        item_key: str,
    ) -> Optional[ZoteroItem]:
        """
        Get a specific item.

        Args:
            item_key: Item key

        Returns:
            Item or None if not found
        """
        endpoint = f"{self.library_prefix}/items/{item_key}"

        try:
            data, _ = await self._request("GET", endpoint)
            return ZoteroItem.from_api_response(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    async def create_items(
        self,
        items: List[ZoteroItem],
        collection_key: Optional[str] = None,
    ) -> List[ZoteroItem]:
        """
        Create multiple items.

        Args:
            items: Items to create
            collection_key: Collection to add items to

        Returns:
            Created items
        """
        endpoint = f"{self.library_prefix}/items"

        # Prepare payload
        payload = []
        for item in items:
            item_data = item.to_api_format()
            if collection_key:
                item_data["collections"] = [collection_key]
            payload.append(item_data)

        data, _ = await self._request("POST", endpoint, json=payload)

        created = []
        for key, item_data in data.get("successful", {}).items():
            created.append(ZoteroItem.from_api_response(item_data))

        return created

    async def update_item(
        self,
        item: ZoteroItem,
    ) -> bool:
        """
        Update an existing item.

        Args:
            item: Item to update

        Returns:
            True if updated successfully
        """
        endpoint = f"{self.library_prefix}/items/{item.key}"

        try:
            await self._request(
                "PATCH",
                endpoint,
                json=item.to_api_format(),
                headers={"If-Unmodified-Since-Version": str(item.version)},
            )
            return True
        except httpx.HTTPStatusError:
            return False

    async def delete_item(
        self,
        item_key: str,
        version: int,
    ) -> bool:
        """
        Delete an item.

        Args:
            item_key: Item key
            version: Item version

        Returns:
            True if deleted successfully
        """
        endpoint = f"{self.library_prefix}/items/{item_key}"

        try:
            await self._request(
                "DELETE",
                endpoint,
                headers={"If-Unmodified-Since-Version": str(version)},
            )
            return True
        except httpx.HTTPStatusError:
            return False

    async def add_item_to_collection(
        self,
        item_key: str,
        collection_key: str,
    ) -> bool:
        """
        Add an item to a collection.

        Args:
            item_key: Item key
            collection_key: Collection key

        Returns:
            True if added successfully
        """
        item = await self.get_item(item_key)
        if not item:
            return False

        if collection_key not in item.collections:
            item.collections.append(collection_key)
            return await self.update_item(item)

        return True

    # ==================== Tags ====================

    async def get_tags(self) -> List[Dict[str, Any]]:
        """
        Get all tags in the library.

        Returns:
            List of tags with counts
        """
        endpoint = f"{self.library_prefix}/tags"
        data, _ = await self._request("GET", endpoint)

        return [
            {"tag": item.get("tag"), "num_items": item.get("meta", {}).get("numItems", 0)}
            for item in data
        ] if isinstance(data, list) else []

    # ==================== Sync Operations ====================

    async def get_library_version(self) -> int:
        """
        Get the current library version for sync.

        Returns:
            Library version number
        """
        endpoint = f"{self.library_prefix}/items"
        _, headers = await self._request("GET", endpoint, params={"limit": 0})
        return int(headers.get("Last-Modified-Version", 0))

    async def get_deleted_items(
        self,
        since_version: int,
    ) -> List[str]:
        """
        Get items deleted since a version.

        Args:
            since_version: Version to check from

        Returns:
            List of deleted item keys
        """
        endpoint = f"{self.library_prefix}/deleted"
        params = {"since": since_version}

        data, _ = await self._request("GET", endpoint, params=params)
        return data.get("items", [])

    async def sync_collection(
        self,
        collection_key: str,
        last_sync_version: int = 0,
    ) -> Dict[str, Any]:
        """
        Sync a collection since last sync.

        Args:
            collection_key: Collection to sync
            last_sync_version: Last known version

        Returns:
            Sync result with new/modified/deleted items
        """
        current_version = await self.get_library_version()

        if current_version == last_sync_version:
            return {
                "status": "up_to_date",
                "version": current_version,
                "new_items": [],
                "modified_items": [],
                "deleted_items": [],
            }

        # Get modified items
        items = await self.get_items_all(
            collection_key=collection_key,
            since_version=last_sync_version,
        )

        # Get deleted items
        deleted = await self.get_deleted_items(last_sync_version)

        return {
            "status": "updated",
            "version": current_version,
            "previous_version": last_sync_version,
            "new_items": [i for i in items if i.version > last_sync_version],
            "modified_items": items,
            "deleted_items": deleted,
        }

    # ==================== ScholaRAG Integration ====================

    async def import_collection_to_project(
        self,
        collection_key: str,
    ) -> List[Dict[str, Any]]:
        """
        Import a Zotero collection as ScholaRAG paper data.

        Args:
            collection_key: Collection to import

        Returns:
            List of paper data ready for ScholaRAG import
        """
        items = await self.get_items_all(collection_key=collection_key)

        papers = []
        for item in items:
            # Skip non-paper types
            if item.item_type in ["note", "attachment"]:
                continue

            # Convert Zotero creators to author list
            authors = []
            for creator in item.creators:
                if creator.get("creatorType") == "author":
                    name_parts = []
                    if creator.get("firstName"):
                        name_parts.append(creator["firstName"])
                    if creator.get("lastName"):
                        name_parts.append(creator["lastName"])
                    if creator.get("name"):
                        name_parts.append(creator["name"])
                    authors.append(" ".join(name_parts))

            papers.append({
                "zotero_key": item.key,
                "title": item.title,
                "abstract": item.abstract,
                "year": item.year,
                "doi": item.doi,
                "authors": authors,
                "journal": item.publication_title,
                "volume": item.volume,
                "issue": item.issue,
                "pages": item.pages,
                "url": item.url,
                "tags": [t.get("tag") for t in item.tags],
            })

        return papers

    async def export_papers_to_collection(
        self,
        papers: List[Dict[str, Any]],
        collection_name: str,
        parent_collection: Optional[str] = None,
    ) -> Tuple[ZoteroCollection, List[ZoteroItem]]:
        """
        Export ScholaRAG papers to a new Zotero collection.

        Args:
            papers: Papers to export (ScholaRAG format)
            collection_name: Name for the new collection
            parent_collection: Parent collection key

        Returns:
            Tuple of (created collection, created items)
        """
        # Create collection
        collection = await self.create_collection(collection_name, parent_collection)
        if not collection:
            raise ValueError("Failed to create collection")

        # Convert papers to Zotero items
        zotero_items = []
        for paper in papers:
            # Build creators list
            creators = []
            for author in paper.get("authors", []):
                if isinstance(author, str):
                    name_parts = author.rsplit(" ", 1)
                    if len(name_parts) == 2:
                        creators.append({
                            "creatorType": "author",
                            "firstName": name_parts[0],
                            "lastName": name_parts[1],
                        })
                    else:
                        creators.append({
                            "creatorType": "author",
                            "name": author,
                        })

            # Build tags
            tags = [{"tag": t} for t in paper.get("tags", [])]

            item = ZoteroItem(
                key="",
                version=0,
                item_type=ZoteroItemType.JOURNAL_ARTICLE.value,
                title=paper.get("title", ""),
                abstract=paper.get("abstract"),
                date=str(paper.get("year")) if paper.get("year") else None,
                year=paper.get("year"),
                doi=paper.get("doi"),
                url=paper.get("url"),
                creators=creators,
                publication_title=paper.get("journal"),
                volume=paper.get("volume"),
                issue=paper.get("issue"),
                pages=paper.get("pages"),
                tags=tags,
                collections=[collection.key],
            )
            zotero_items.append(item)

        # Create items in batches of 50
        created_items = []
        for i in range(0, len(zotero_items), 50):
            batch = zotero_items[i:i + 50]
            created = await self.create_items(batch, collection.key)
            created_items.extend(created)

        return collection, created_items
