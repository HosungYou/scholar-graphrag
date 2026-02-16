"""
Response Agent

Generates user-friendly responses with citations and graph highlights.
"""

import json
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)


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
    retrieval_trace: dict | None = None


class ResponseAgent:
    """Generates final responses with citations and graph highlights."""

    SYSTEM_PROMPT = """You are a helpful research assistant presenting knowledge graph analysis results.
Generate clear, informative responses that:
1. Directly answer the user's question
2. Reference specific findings from the analysis
3. Suggest relevant follow-up questions

Respond with JSON:
{
    "answer": "natural language response",
    "suggested_follow_ups": ["question 1", "question 2", "question 3"]
}"""

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    async def generate(self, query: str, reasoning_result, intent) -> ResponseResult:
        """Generate response. Uses LLM if available."""
        if self.llm:
            try:
                return await self._generate_with_llm(query, reasoning_result, intent)
            except Exception as e:
                logger.warning(f"LLM response generation failed: {e}")
        return self._generate_fallback(query, reasoning_result, intent)

    async def _generate_with_llm(self, query: str, reasoning_result, intent) -> ResponseResult:
        """Use LLM to generate natural language response."""
        steps_text = "\n".join([
            f"{s.step_number}. {s.description}: {s.conclusion}" for s in reasoning_result.steps
        ])

        context = f"""User question: {query}
Intent: {intent.value if hasattr(intent, 'value') else str(intent)}
Analysis conclusion: {reasoning_result.final_conclusion}
Reasoning steps:
{steps_text}
Confidence: {reasoning_result.confidence}"""

        prompt = f"Generate a helpful response based on this analysis:\n{context}"
        response = await self.llm.generate(
            prompt=prompt, system_prompt=self.SYSTEM_PROMPT, max_tokens=1000, temperature=0.7
        )

        try:
            json_str = response.strip().replace("```json", "").replace("```", "").strip()
            data = json.loads(json_str)

            # Build retrieval trace
            trace = None
            if hasattr(reasoning_result, 'trace_steps') and reasoning_result.trace_steps:
                trace = {
                    "strategy": "hybrid",
                    "steps": [
                        {
                            "step_index": s.step_index,
                            "action": s.action,
                            "node_ids": s.node_ids,
                            "thought": s.thought,
                            "duration_ms": s.duration_ms,
                        } if hasattr(s, 'step_index') else s
                        for s in reasoning_result.trace_steps
                    ],
                    "reasoning_path": reasoning_result.supporting_nodes[:20],
                    "metrics": {
                        "total_steps": len(reasoning_result.trace_steps),
                        "total_latency_ms": sum(
                            getattr(s, 'duration_ms', 0) for s in reasoning_result.trace_steps
                        ),
                    },
                }

            return ResponseResult(
                answer=data.get("answer", reasoning_result.final_conclusion),
                citations=[],
                highlighted_nodes=reasoning_result.supporting_nodes,
                highlighted_edges=reasoning_result.supporting_edges,
                suggested_follow_ups=data.get("suggested_follow_ups", self._default_follow_ups(intent)),
                retrieval_trace=trace,
            )
        except Exception:
            return self._generate_fallback(query, reasoning_result, intent)

    def _generate_fallback(self, query: str, reasoning_result, intent) -> ResponseResult:
        """Fallback response generation."""
        answer_parts = [reasoning_result.final_conclusion]

        if reasoning_result.steps:
            answer_parts.append("\n**Analysis:**")
            for step in reasoning_result.steps:
                if step.conclusion:
                    answer_parts.append(f"• {step.conclusion}")

        return ResponseResult(
            answer="\n".join(answer_parts),
            citations=[],
            highlighted_nodes=reasoning_result.supporting_nodes,
            highlighted_edges=reasoning_result.supporting_edges,
            suggested_follow_ups=self._default_follow_ups(intent),
            retrieval_trace=None,
        )

    def _default_follow_ups(self, intent) -> list[str]:
        """Generate default follow-up questions based on intent."""
        intent_val = intent.value if hasattr(intent, 'value') else str(intent)
        follow_ups_map = {
            "search": ["What methods do these papers use?", "Show related concepts", "Who are the key authors?"],
            "explore": ["What are the main findings?", "Show citation network", "Compare with related papers"],
            "explain": ["Show me examples", "What papers discuss this?", "Are there related concepts?"],
            "compare": ["What methods differ?", "Which has more citations?", "What do they have in common?"],
            "summarize": ["What are the research gaps?", "Show the timeline", "Who contributed most?"],
            "identify_gaps": ["What topics are well-covered?", "Suggest research directions", "Show recent trends"],
        }
        return follow_ups_map.get(intent_val, ["Show related papers", "What methods are used?", "Find research gaps"])
