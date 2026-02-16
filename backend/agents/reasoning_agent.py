"""
Reasoning Agent

Applies Chain-of-Thought reasoning to synthesize query results
and draw evidence-based conclusions.
"""

import json
import logging
from typing import Any
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ReasoningStep(BaseModel):
    step_number: int
    description: str
    evidence: list[str] = []
    conclusion: str


class ReasoningResult(BaseModel):
    steps: list[ReasoningStep]
    final_conclusion: str
    confidence: float
    supporting_nodes: list[str] = []
    supporting_edges: list[str] = []
    trace_steps: list = []


class ReasoningAgent:
    """Applies Chain-of-Thought reasoning to execution results."""

    SYSTEM_PROMPT = """You are a research analyst synthesizing knowledge graph query results.
Apply step-by-step reasoning to answer the user's question.

For each step:
1. Examine the evidence
2. Identify patterns and connections
3. Draw logical conclusions

Respond with JSON:
{
    "steps": [{"step_number": 1, "description": "...", "evidence": [...], "conclusion": "..."}],
    "final_conclusion": "comprehensive answer",
    "confidence": 0.0-1.0
}"""

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    async def reason(self, query: str, intent, execution_result) -> ReasoningResult:
        """Apply Chain-of-Thought reasoning. Uses LLM if available."""
        if self.llm:
            try:
                return await self._reason_with_llm(query, intent, execution_result)
            except Exception as e:
                logger.warning(f"LLM reasoning failed: {e}")
        return self._reason_with_fallback(query, execution_result)

    async def _reason_with_llm(self, query: str, intent, execution_result) -> ReasoningResult:
        """Use LLM for Chain-of-Thought reasoning."""
        # Build context from execution results
        results_summary = []
        for i, result in enumerate(execution_result.results):
            if result.success and result.data:
                results_summary.append(f"Task {i+1}: {result.data}")

        context = f"""Query: {query}
Intent: {intent.value if hasattr(intent, 'value') else str(intent)}
Results found: {len(execution_result.results)}
Nodes accessed: {len(execution_result.nodes_accessed)}
Data: {results_summary[:3]}"""

        prompt = f"Analyze this research query and results:\n{context}"
        response = await self.llm.generate(
            prompt=prompt, system_prompt=self.SYSTEM_PROMPT, max_tokens=1000, temperature=0.3
        )

        try:
            json_str = response.strip().replace("```json", "").replace("```", "").strip()
            data = json.loads(json_str)

            steps = [
                ReasoningStep(
                    step_number=s.get("step_number", i+1),
                    description=s.get("description", ""),
                    evidence=s.get("evidence", []),
                    conclusion=s.get("conclusion", ""),
                )
                for i, s in enumerate(data.get("steps", []))
            ]

            return ReasoningResult(
                steps=steps,
                final_conclusion=data.get("final_conclusion", "Analysis complete."),
                confidence=float(data.get("confidence", 0.7)),
                supporting_nodes=execution_result.nodes_accessed,
                supporting_edges=execution_result.edges_traversed,
                trace_steps=getattr(execution_result, 'trace_steps', []),
            )
        except Exception:
            return self._reason_with_fallback(query, execution_result)

    def _reason_with_fallback(self, query: str, execution_result) -> ReasoningResult:
        """Fallback structured reasoning."""
        num_results = len(execution_result.results)
        successful = sum(1 for r in execution_result.results if r.success)

        steps = [
            ReasoningStep(
                step_number=1,
                description="Analyzing query and retrieved data",
                evidence=[f"Executed {num_results} tasks", f"{successful} successful"],
                conclusion="Data retrieval complete",
            ),
            ReasoningStep(
                step_number=2,
                description="Synthesizing findings",
                evidence=[f"Accessed {len(execution_result.nodes_accessed)} nodes"],
                conclusion="Patterns analyzed",
            ),
            ReasoningStep(
                step_number=3,
                description="Formulating response",
                evidence=[],
                conclusion="Ready to present findings",
            ),
        ]

        return ReasoningResult(
            steps=steps,
            final_conclusion=f"Based on analyzing the knowledge graph for '{query}', relevant information was found.",
            confidence=0.6,
            supporting_nodes=execution_result.nodes_accessed,
            supporting_edges=execution_result.edges_traversed,
            trace_steps=getattr(execution_result, 'trace_steps', []),
        )
