"""
Intent Agent

Classifies user intent using Few-Shot Learning.
Categories: search, explore, explain, compare, create
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel


class IntentType(str, Enum):
    SEARCH = "search"           # Find papers/concepts matching criteria
    EXPLORE = "explore"         # Navigate the graph
    EXPLAIN = "explain"         # Explain a concept/paper/relationship
    COMPARE = "compare"         # Compare multiple entities
    CREATE = "create"           # Create new entities/relationships
    SUMMARIZE = "summarize"     # Summarize a set of papers
    IDENTIFY_GAPS = "identify_gaps"  # Find research gaps


class IntentResult(BaseModel):
    intent: IntentType
    confidence: float
    entities_mentioned: list[str] = []
    keywords: list[str] = []


class IntentAgent:
    """
    Intent Agent using Few-Shot Learning to classify user queries.
    """

    # Few-shot examples for intent classification
    FEW_SHOT_EXAMPLES = [
        {
            "query": "What papers discuss machine learning?",
            "intent": "search",
            "reason": "User wants to find papers about a specific topic",
        },
        {
            "query": "Show me papers connected to this author",
            "intent": "explore",
            "reason": "User wants to navigate the graph from a specific node",
        },
        {
            "query": "Explain what this methodology means",
            "intent": "explain",
            "reason": "User wants an explanation of a concept",
        },
        {
            "query": "Compare paper A with paper B",
            "intent": "compare",
            "reason": "User wants to compare multiple entities",
        },
        {
            "query": "What are the research gaps in this field?",
            "intent": "identify_gaps",
            "reason": "User wants to find under-researched areas",
        },
        {
            "query": "Summarize the findings from these papers",
            "intent": "summarize",
            "reason": "User wants a summary of multiple sources",
        },
    ]

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    async def classify(self, query: str) -> IntentResult:
        """
        Classify the intent of a user query.
        """
        # TODO: Use LLM with few-shot examples for classification
        # For now, use simple keyword matching

        query_lower = query.lower()

        # Simple keyword-based classification
        if any(word in query_lower for word in ["compare", "versus", "vs", "difference"]):
            intent = IntentType.COMPARE
        elif any(word in query_lower for word in ["explain", "what is", "what does", "define"]):
            intent = IntentType.EXPLAIN
        elif any(word in query_lower for word in ["gap", "missing", "underresearched"]):
            intent = IntentType.IDENTIFY_GAPS
        elif any(word in query_lower for word in ["summarize", "summary", "overview"]):
            intent = IntentType.SUMMARIZE
        elif any(word in query_lower for word in ["show", "navigate", "connected", "related"]):
            intent = IntentType.EXPLORE
        else:
            intent = IntentType.SEARCH

        return IntentResult(
            intent=intent,
            confidence=0.8,  # Placeholder confidence
            entities_mentioned=[],  # Will be extracted by ConceptExtractionAgent
            keywords=query_lower.split()[:5],  # Simple keyword extraction
        )
