"""
Agent Type Definitions
Centralized enums and type definitions for the 6-agent pipeline
"""
from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


# ============================================================================
# Intent Classification
# ============================================================================

class IntentType(str, Enum):
    """User intent categories for the intent agent"""
    SEARCH = "search"                    # Find papers/concepts matching criteria
    COMPARE = "compare"                  # Compare two or more entities
    ANALYZE_GAPS = "analyze_gaps"        # Find research gaps
    EXPLAIN = "explain"                  # Explain a concept/relationship
    SUMMARIZE = "summarize"              # Summarize content
    FILTER = "filter"                    # Filter/narrow results
    EXPLORE = "explore"                  # Explore connections
    RECOMMEND = "recommend"              # Get recommendations
    TEMPORAL = "temporal"                # Temporal analysis
    UNKNOWN = "unknown"                  # Unable to classify


class IntentResult(BaseModel):
    """Result from IntentAgent"""
    intent: IntentType
    confidence: float = Field(ge=0.0, le=1.0)
    sub_intents: List[IntentType] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# Entity Types
# ============================================================================

class EntityType(str, Enum):
    """Types of entities in the knowledge graph"""
    PAPER = "Paper"
    AUTHOR = "Author"
    CONCEPT = "Concept"
    METHOD = "Method"
    FINDING = "Finding"
    PROBLEM = "Problem"
    DATASET = "Dataset"
    METRIC = "Metric"
    INNOVATION = "Innovation"
    LIMITATION = "Limitation"
    THEORY = "Theory"
    HYPOTHESIS = "Hypothesis"


class RelationshipType(str, Enum):
    """Types of relationships between entities"""
    DISCUSSES_CONCEPT = "DISCUSSES_CONCEPT"
    USES_METHOD = "USES_METHOD"
    HAS_FINDING = "HAS_FINDING"
    CITES = "CITES"
    AUTHORED_BY = "AUTHORED_BY"
    RELATED_TO = "RELATED_TO"
    ADDRESSES_PROBLEM = "ADDRESSES_PROBLEM"
    USES_DATASET = "USES_DATASET"
    PROPOSES_THEORY = "PROPOSES_THEORY"
    TESTS_HYPOTHESIS = "TESTS_HYPOTHESIS"
    EXTENDS = "EXTENDS"
    CONTRADICTS = "CONTRADICTS"
    SUPPORTS = "SUPPORTS"


class ExtractedEntity(BaseModel):
    """Entity extracted by ConceptExtractionAgent"""
    name: str
    type: EntityType
    confidence: float = Field(ge=0.0, le=1.0)
    matched_id: Optional[str] = None  # ID if matched to existing entity
    context: Optional[str] = None


class ExtractionResult(BaseModel):
    """Result from ConceptExtractionAgent"""
    entities: List[ExtractedEntity]
    relationships: List[Dict[str, Any]] = Field(default_factory=list)


# ============================================================================
# Task Planning
# ============================================================================

class TaskType(str, Enum):
    """Types of tasks the system can execute"""
    VECTOR_SEARCH = "vector_search"
    KEYWORD_SEARCH = "keyword_search"
    ENTITY_LOOKUP = "entity_lookup"
    RELATIONSHIP_QUERY = "relationship_query"
    GAP_ANALYSIS = "gap_analysis"
    TEMPORAL_ANALYSIS = "temporal_analysis"
    CENTRALITY_ANALYSIS = "centrality_analysis"
    CLUSTER_ANALYSIS = "cluster_analysis"
    COMPARISON = "comparison"
    AGGREGATION = "aggregation"


class SubTask(BaseModel):
    """Individual task in task plan"""
    id: str
    type: TaskType
    description: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    dependencies: List[str] = Field(default_factory=list)  # IDs of dependent tasks
    priority: int = Field(default=1, ge=1, le=10)


class TaskPlan(BaseModel):
    """Result from TaskPlanningAgent"""
    tasks: List[SubTask]
    execution_order: List[str]  # Task IDs in execution order
    estimated_complexity: str = Field(default="medium")  # low, medium, high


# ============================================================================
# Query Execution
# ============================================================================

class ExecutionStatus(str, Enum):
    """Status of task execution"""
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    SKIPPED = "skipped"


class TaskResult(BaseModel):
    """Result of a single task execution"""
    task_id: str
    status: ExecutionStatus
    data: Any = None
    error: Optional[str] = None
    execution_time_ms: float = 0


class ExecutionResult(BaseModel):
    """Result from QueryExecutionAgent"""
    task_results: List[TaskResult]
    combined_data: Dict[str, Any] = Field(default_factory=dict)
    entities_found: List[Dict[str, Any]] = Field(default_factory=list)
    relationships_found: List[Dict[str, Any]] = Field(default_factory=list)


# ============================================================================
# Reasoning
# ============================================================================

class ReasoningStep(BaseModel):
    """Single step in chain-of-thought reasoning"""
    step_number: int
    thought: str
    observation: Optional[str] = None
    conclusion: Optional[str] = None


class GapInfo(BaseModel):
    """Information about a detected research gap"""
    gap_id: str
    description: str
    cluster_a: List[str]
    cluster_b: List[str]
    strength: float = Field(ge=0.0, le=1.0)
    suggested_questions: List[str] = Field(default_factory=list)


class ReasoningResult(BaseModel):
    """Result from ReasoningAgent"""
    reasoning_chain: List[ReasoningStep]
    main_findings: List[str]
    gaps_detected: List[GapInfo] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    supporting_evidence: List[Dict[str, Any]] = Field(default_factory=list)


# ============================================================================
# Response Generation
# ============================================================================

class Citation(BaseModel):
    """Citation reference in response"""
    id: str
    title: str
    authors: List[str] = Field(default_factory=list)
    year: Optional[int] = None
    relevance_score: float = Field(ge=0.0, le=1.0)


class ResponseResult(BaseModel):
    """Result from ResponseAgent"""
    answer: str
    citations: List[Citation] = Field(default_factory=list)
    suggested_followups: List[str] = Field(default_factory=list)
    highlighted_entities: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


# ============================================================================
# Pipeline Result
# ============================================================================

class PipelineResult(BaseModel):
    """Complete result from the 6-agent pipeline"""
    intent: IntentResult
    extraction: ExtractionResult
    task_plan: TaskPlan
    execution: ExecutionResult
    reasoning: ReasoningResult
    response: ResponseResult
    total_processing_time_ms: float = 0
    agent_trace: List[Dict[str, Any]] = Field(default_factory=list)
