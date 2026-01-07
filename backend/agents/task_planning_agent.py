"""
Task Planning Agent

Decomposes complex queries into sub-tasks.
Example: "Compare A and B" → [Search A, Search B, Find common concepts, Analyze differences]
"""

from typing import Optional
from pydantic import BaseModel
from .intent_agent import IntentType


class SubTask(BaseModel):
    task_type: str  # search, retrieve, analyze, compare, summarize
    description: str
    parameters: dict = {}
    depends_on: list[int] = []  # Indices of tasks this depends on


class TaskPlan(BaseModel):
    original_query: str
    intent: IntentType
    tasks: list[SubTask]
    estimated_complexity: str  # low, medium, high


class TaskPlanningAgent:
    """
    Decomposes queries into executable sub-tasks.
    """

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    async def plan(
        self, query: str, intent: IntentType, extracted_entities: list
    ) -> TaskPlan:
        """
        Create a task plan based on intent and extracted entities.
        """
        tasks = []

        if intent == IntentType.SEARCH:
            tasks.append(
                SubTask(
                    task_type="search",
                    description="Search for relevant entities",
                    parameters={"query": query, "limit": 20},
                )
            )
            tasks.append(
                SubTask(
                    task_type="analyze",
                    description="Analyze search results",
                    depends_on=[0],
                )
            )

        elif intent == IntentType.COMPARE:
            # Extract entities to compare
            tasks.append(
                SubTask(
                    task_type="search",
                    description="Find first entity",
                    parameters={"entity_index": 0},
                )
            )
            tasks.append(
                SubTask(
                    task_type="search",
                    description="Find second entity",
                    parameters={"entity_index": 1},
                )
            )
            tasks.append(
                SubTask(
                    task_type="compare",
                    description="Compare the two entities",
                    depends_on=[0, 1],
                )
            )

        elif intent == IntentType.EXPLAIN:
            tasks.append(
                SubTask(
                    task_type="retrieve",
                    description="Retrieve entity details",
                    parameters={"query": query},
                )
            )
            tasks.append(
                SubTask(
                    task_type="explain",
                    description="Generate explanation",
                    depends_on=[0],
                )
            )

        elif intent == IntentType.IDENTIFY_GAPS:
            tasks.append(
                SubTask(
                    task_type="analyze_gaps",
                    description="Find research gaps in the graph",
                    parameters={"min_papers": 3},
                )
            )

        else:
            # Default: simple search and summarize
            tasks.append(
                SubTask(
                    task_type="search",
                    description="Search for relevant information",
                    parameters={"query": query},
                )
            )

        return TaskPlan(
            original_query=query,
            intent=intent,
            tasks=tasks,
            estimated_complexity="medium" if len(tasks) > 2 else "low",
        )
