"""
External API integrations for ScholaRAG_Graph.

This module provides integrations with:
- Semantic Scholar API: Academic paper metadata and citation graphs
- OpenAlex: Open academic knowledge graph
- Zotero: Reference management synchronization
"""

from integrations.semantic_scholar import SemanticScholarClient
from integrations.openalex import OpenAlexClient
from integrations.zotero import ZoteroClient

__all__ = [
    "SemanticScholarClient",
    "OpenAlexClient",
    "ZoteroClient",
]
