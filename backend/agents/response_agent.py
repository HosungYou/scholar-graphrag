"""
Response Agent

Generates user-friendly responses with citations and graph highlights.
"""

from pydantic import BaseModel


class Citation(BaseModel):
    node_id: str
    label: str
    entity_type: str


class ResponseResult(BaseModel):
    answer: str
    citations: list[Citation] = []
    highlighted_nodes: list[str] = []
    highlighted_edges: list[str] = []
    suggested_follow_ups: list[str] = []


class ResponseAgent:
    """
    Generates final responses with citations and graph highlights.
    """

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    async def generate(
        self, query: str, reasoning_result, intent
    ) -> ResponseResult:
        """
        Generate a user-friendly response.
        """
        # TODO: Use LLM to generate natural language response

        # Build answer from reasoning
        answer_parts = []
        answer_parts.append(f"Based on the analysis of your query: '{query}'")
        answer_parts.append("")
        answer_parts.append(reasoning_result.final_conclusion)

        # Add reasoning steps
        if reasoning_result.steps:
            answer_parts.append("")
            answer_parts.append("**Analysis Steps:**")
            for step in reasoning_result.steps:
                answer_parts.append(f"{step.step_number}. {step.conclusion}")

        answer = "\n".join(answer_parts)

        # Generate suggested follow-up questions
        follow_ups = self._generate_follow_ups(intent, reasoning_result)

        return ResponseResult(
            answer=answer,
            citations=[],  # TODO: Extract citations from reasoning
            highlighted_nodes=reasoning_result.supporting_nodes,
            highlighted_edges=reasoning_result.supporting_edges,
            suggested_follow_ups=follow_ups,
        )

    def _generate_follow_ups(self, intent, reasoning_result) -> list[str]:
        """Generate suggested follow-up questions."""
        follow_ups = [
            "What methods do these papers use?",
            "Show me related concepts",
            "What are the key findings?",
        ]
        return follow_ups[:3]
