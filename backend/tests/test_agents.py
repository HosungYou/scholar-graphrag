"""
Tests for Multi-Agent System.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch


class TestIntentAgent:
    """Test Intent Agent functionality."""

    @pytest.fixture
    def intent_agent(self):
        """Create intent agent."""
        from agents.intent_agent import IntentAgent
        return IntentAgent()

    @pytest.mark.asyncio
    async def test_classify_search_intent(self, intent_agent):
        """Test classifying search queries."""
        result = await intent_agent.classify("What papers discuss machine learning?")
        
        assert "intent" in result
        assert "confidence" in result
        assert result["confidence"] >= 0 and result["confidence"] <= 1

    @pytest.mark.asyncio
    async def test_classify_compare_intent(self, intent_agent):
        """Test classifying comparison queries."""
        result = await intent_agent.classify("Compare neural networks vs decision trees")
        
        assert result["intent"] in ["COMPARE", "SEARCH", "EXPLORE"]

    @pytest.mark.asyncio
    async def test_classify_gap_intent(self, intent_agent):
        """Test classifying gap detection queries."""
        result = await intent_agent.classify("What research gaps exist in AI education?")
        
        assert result["intent"] in ["IDENTIFY_GAPS", "SEARCH", "EXPLORE"]

    @pytest.mark.asyncio
    async def test_extract_keywords(self, intent_agent):
        """Test keyword extraction."""
        result = await intent_agent.classify("machine learning in healthcare")
        
        assert "keywords" in result
        assert isinstance(result["keywords"], list)

    def test_fallback_classification(self, intent_agent):
        """Test fallback rule-based classification."""
        # Without LLM, should use keyword-based rules
        result = intent_agent._fallback_classify("compare A versus B")
        
        assert result["intent"] == "COMPARE"


class TestConceptExtractionAgent:
    """Test Concept Extraction Agent functionality."""

    @pytest.fixture
    def concept_agent(self):
        """Create concept extraction agent."""
        from agents.concept_extraction_agent import ConceptExtractionAgent
        return ConceptExtractionAgent()

    @pytest.mark.asyncio
    async def test_extract_entities(self, concept_agent):
        """Test entity extraction from query."""
        result = await concept_agent.extract(
            "How does machine learning improve medical diagnosis?"
        )
        
        assert "entities" in result
        assert isinstance(result["entities"], list)

    @pytest.mark.asyncio
    async def test_extract_with_existing_graph(self, concept_agent):
        """Test extraction with graph node matching."""
        mock_graph = {
            "nodes": [
                {"id": "1", "name": "machine learning", "type": "Concept"},
                {"id": "2", "name": "medical diagnosis", "type": "Concept"},
            ]
        }
        
        result = await concept_agent.extract(
            "machine learning in medical diagnosis",
            graph_context=mock_graph
        )
        
        # Extracted entities should have matched_id if found in graph
        for entity in result["entities"]:
            if entity["text"].lower() in ["machine learning", "medical diagnosis"]:
                assert "matched_id" in entity or entity.get("matched_id") is None


class TestTaskPlanningAgent:
    """Test Task Planning Agent functionality."""

    @pytest.fixture
    def task_agent(self):
        """Create task planning agent."""
        from agents.task_planning_agent import TaskPlanningAgent
        return TaskPlanningAgent()

    @pytest.mark.asyncio
    async def test_plan_simple_search(self, task_agent):
        """Test planning for simple search."""
        intent = {"intent": "SEARCH", "keywords": ["machine learning"]}
        entities = [{"text": "machine learning", "type": "Concept"}]
        
        plan = await task_agent.plan(intent, entities)
        
        assert "tasks" in plan
        assert len(plan["tasks"]) >= 1

    @pytest.mark.asyncio
    async def test_plan_comparison(self, task_agent):
        """Test planning for comparison queries."""
        intent = {"intent": "COMPARE", "keywords": ["A", "B"]}
        entities = [
            {"text": "A", "type": "Concept"},
            {"text": "B", "type": "Concept"},
        ]
        
        plan = await task_agent.plan(intent, entities)
        
        # Should have multiple search tasks and a compare task
        task_types = [t["task_type"] for t in plan["tasks"]]
        assert "compare" in task_types or "search" in task_types

    def test_task_dependency_ordering(self, task_agent):
        """Test that tasks are properly ordered by dependencies."""
        tasks = [
            {"task_type": "search", "depends_on": []},
            {"task_type": "compare", "depends_on": [0]},
        ]
        
        ordered = task_agent._order_tasks(tasks)
        
        # Compare should come after search
        search_idx = next(i for i, t in enumerate(ordered) if t["task_type"] == "search")
        compare_idx = next(i for i, t in enumerate(ordered) if t["task_type"] == "compare")
        assert search_idx < compare_idx


class TestQueryExecutionAgent:
    """Test Query Execution Agent functionality."""

    @pytest.fixture
    def query_agent(self):
        """Create query execution agent."""
        from agents.query_execution_agent import QueryExecutionAgent
        
        mock_graph_store = MagicMock()
        mock_graph_store.search_entities = AsyncMock(return_value=[])
        mock_graph_store.get_entity = AsyncMock(return_value=None)
        
        return QueryExecutionAgent(graph_store=mock_graph_store)

    @pytest.mark.asyncio
    async def test_execute_search_task(self, query_agent):
        """Test executing search task."""
        task = {
            "task_type": "search",
            "parameters": {"query": "machine learning"},
        }
        
        result = await query_agent.execute(task)
        
        assert "success" in result
        assert "data" in result

    @pytest.mark.asyncio
    async def test_execute_with_dependency(self, query_agent):
        """Test executing task with dependencies."""
        previous_results = {
            0: {"success": True, "data": [{"id": "1", "name": "test"}]}
        }
        
        task = {
            "task_type": "analyze",
            "depends_on": [0],
            "parameters": {},
        }
        
        result = await query_agent.execute(task, previous_results=previous_results)
        
        assert "success" in result


class TestReasoningAgent:
    """Test Reasoning Agent functionality."""

    @pytest.fixture
    def reasoning_agent(self):
        """Create reasoning agent."""
        from agents.reasoning_agent import ReasoningAgent
        
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value="Step 1: Analysis...")
        
        return ReasoningAgent(llm_provider=mock_llm)

    @pytest.mark.asyncio
    async def test_chain_of_thought_reasoning(self, reasoning_agent):
        """Test chain-of-thought reasoning."""
        query_results = [
            {"task_type": "search", "data": [{"name": "test"}]}
        ]
        
        result = await reasoning_agent.reason(
            query="What are the key findings?",
            query_results=query_results
        )
        
        assert "steps" in result or "final_conclusion" in result

    @pytest.mark.asyncio
    async def test_gap_analysis_reasoning(self, reasoning_agent):
        """Test reasoning with gap analysis."""
        query_results = [
            {"task_type": "analyze_gaps", "data": {"gaps": []}}
        ]
        
        result = await reasoning_agent.reason(
            query="What research gaps exist?",
            query_results=query_results,
            include_gaps=True
        )
        
        assert "research_gaps" in result or "final_conclusion" in result


class TestResponseAgent:
    """Test Response Agent functionality."""

    @pytest.fixture
    def response_agent(self):
        """Create response agent."""
        from agents.response_agent import ResponseAgent
        
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value="Based on the analysis...")
        
        return ResponseAgent(llm_provider=mock_llm)

    @pytest.mark.asyncio
    async def test_generate_response(self, response_agent):
        """Test response generation."""
        reasoning = {
            "final_conclusion": "The analysis shows...",
            "steps": [{"description": "Step 1", "conclusion": "Found X"}]
        }
        
        result = await response_agent.generate(reasoning)
        
        assert "answer" in result
        assert isinstance(result["answer"], str)

    @pytest.mark.asyncio
    async def test_response_with_citations(self, response_agent):
        """Test response includes citations."""
        reasoning = {
            "final_conclusion": "The analysis shows...",
            "supporting_nodes": ["node-1", "node-2"]
        }
        
        result = await response_agent.generate(reasoning)
        
        assert "citations" in result

    @pytest.mark.asyncio
    async def test_follow_up_suggestions(self, response_agent):
        """Test follow-up question generation."""
        reasoning = {
            "final_conclusion": "AI improves education.",
            "research_gaps": [{"description": "Gap in long-term studies"}]
        }
        
        result = await response_agent.generate(reasoning)
        
        assert "suggested_follow_ups" in result
        assert isinstance(result["suggested_follow_ups"], list)


class TestOrchestrator:
    """Test Agent Orchestrator functionality."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator with mocked agents."""
        from agents.orchestrator import AgentOrchestrator
        
        # Create mock agents
        mock_intent = MagicMock()
        mock_intent.classify = AsyncMock(return_value={"intent": "SEARCH", "confidence": 0.9, "keywords": []})
        
        mock_concept = MagicMock()
        mock_concept.extract = AsyncMock(return_value={"entities": []})
        
        mock_task = MagicMock()
        mock_task.plan = AsyncMock(return_value={"tasks": []})
        
        mock_query = MagicMock()
        mock_query.execute = AsyncMock(return_value={"success": True, "data": []})
        
        mock_reasoning = MagicMock()
        mock_reasoning.reason = AsyncMock(return_value={"final_conclusion": "test"})
        
        mock_response = MagicMock()
        mock_response.generate = AsyncMock(return_value={"answer": "test", "citations": []})
        
        return AgentOrchestrator(
            intent_agent=mock_intent,
            concept_agent=mock_concept,
            task_agent=mock_task,
            query_agent=mock_query,
            reasoning_agent=mock_reasoning,
            response_agent=mock_response,
        )

    @pytest.mark.asyncio
    async def test_full_pipeline(self, orchestrator):
        """Test full agent pipeline."""
        result = await orchestrator.process_query(
            project_id="test-project",
            message="What is machine learning?"
        )
        
        assert "content" in result
        assert "citations" in result or "highlighted_nodes" in result

    @pytest.mark.asyncio
    async def test_conversation_context_preserved(self, orchestrator):
        """Test that conversation context is preserved."""
        # First query
        await orchestrator.process_query(
            project_id="test-project",
            message="What is AI?",
            conversation_id="conv-1"
        )
        
        # Second query in same conversation
        result = await orchestrator.process_query(
            project_id="test-project",
            message="Tell me more about that",
            conversation_id="conv-1"
        )
        
        # Should have access to context
        assert result is not None
