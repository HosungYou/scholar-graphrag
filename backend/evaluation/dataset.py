"""
ScholarQA Dataset

Test case generation and management for academic literature review QA evaluation.
Following AGENTiGraph's TutorQA methodology with 7 task types.
"""

import json
import logging
import random
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class TaskType(str, Enum):
    """Task types following AGENTiGraph taxonomy + academic extensions."""
    SEARCH = "search"           # Find papers about X
    EXPLORE = "explore"         # Show papers connected to Y
    EXPLAIN = "explain"         # Explain concept Z
    COMPARE = "compare"         # Compare methodology A vs B
    SUMMARIZE = "summarize"     # Summarize findings on topic W
    IDENTIFY_GAPS = "identify_gaps"  # Research gaps in field X
    FREE_FORM = "free_form"     # Open-ended research questions


@dataclass
class TestCase:
    """Single test case for evaluation."""
    id: str
    query: str
    task_type: TaskType
    expected_intent: str
    expected_entities: list[str] = field(default_factory=list)
    expected_answer_keywords: list[str] = field(default_factory=list)
    ground_truth_answer: Optional[str] = None
    ground_truth_nodes: list[str] = field(default_factory=list)
    difficulty: str = "medium"  # easy, medium, hard
    domain: str = "general"
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "query": self.query,
            "task_type": self.task_type.value,
            "expected_intent": self.expected_intent,
            "expected_entities": self.expected_entities,
            "expected_answer_keywords": self.expected_answer_keywords,
            "ground_truth_answer": self.ground_truth_answer,
            "ground_truth_nodes": self.ground_truth_nodes,
            "difficulty": self.difficulty,
            "domain": self.domain,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TestCase":
        return cls(
            id=data["id"],
            query=data["query"],
            task_type=TaskType(data["task_type"]),
            expected_intent=data["expected_intent"],
            expected_entities=data.get("expected_entities", []),
            expected_answer_keywords=data.get("expected_answer_keywords", []),
            ground_truth_answer=data.get("ground_truth_answer"),
            ground_truth_nodes=data.get("ground_truth_nodes", []),
            difficulty=data.get("difficulty", "medium"),
            domain=data.get("domain", "general"),
            metadata=data.get("metadata", {}),
        )


class ScholarQADataset:
    """
    Dataset manager for ScholarQA benchmark.

    Structure following AGENTiGraph TutorQA:
    - 7 task types
    - 500 test cases per task type (configurable)
    - Total: 3,500 test cases
    """

    # Query templates for each task type
    QUERY_TEMPLATES = {
        TaskType.SEARCH: [
            "Find papers about {topic}",
            "Search for research on {topic}",
            "What papers discuss {topic}?",
            "Show me studies related to {topic}",
            "List publications about {topic}",
        ],
        TaskType.EXPLORE: [
            "Show papers connected to {entity}",
            "What is related to {entity}?",
            "Explore the network around {entity}",
            "Find connections for {entity}",
            "What papers cite {entity}?",
        ],
        TaskType.EXPLAIN: [
            "Explain {concept}",
            "What is {concept}?",
            "Define {concept} in context of this research",
            "Help me understand {concept}",
            "Describe {concept} based on the literature",
        ],
        TaskType.COMPARE: [
            "Compare {entity1} and {entity2}",
            "What are the differences between {entity1} and {entity2}?",
            "How does {entity1} differ from {entity2}?",
            "{entity1} vs {entity2}: what are the key differences?",
            "Contrast {entity1} with {entity2}",
        ],
        TaskType.SUMMARIZE: [
            "Summarize the findings on {topic}",
            "What are the key conclusions about {topic}?",
            "Give me an overview of research on {topic}",
            "What does the literature say about {topic}?",
            "Synthesize the evidence on {topic}",
        ],
        TaskType.IDENTIFY_GAPS: [
            "What are the research gaps in {topic}?",
            "What hasn't been studied about {topic}?",
            "Identify unexplored areas in {topic}",
            "Where is more research needed on {topic}?",
            "What questions remain unanswered about {topic}?",
        ],
        TaskType.FREE_FORM: [
            "I'm researching {topic}. What should I know?",
            "Help me with my literature review on {topic}",
            "What's the current state of {topic} research?",
            "I want to understand {topic} better",
            "Tell me about recent developments in {topic}",
        ],
    }

    # Academic domain topics
    ACADEMIC_TOPICS = {
        "education": [
            "AI in education", "chatbots for learning", "educational technology",
            "online learning effectiveness", "personalized learning", "student engagement",
            "learning analytics", "adaptive learning systems", "MOOC completion rates",
            "gamification in education", "virtual reality in training",
        ],
        "healthcare": [
            "AI diagnosis", "clinical decision support", "telemedicine",
            "patient outcomes", "drug discovery", "medical imaging",
            "healthcare chatbots", "electronic health records",
        ],
        "nlp": [
            "large language models", "natural language processing", "text generation",
            "sentiment analysis", "named entity recognition", "question answering",
            "dialogue systems", "machine translation",
        ],
        "methodology": [
            "randomized controlled trials", "meta-analysis", "systematic review",
            "qualitative research", "mixed methods", "effect size",
            "statistical significance", "sample size calculation",
        ],
    }

    CONCEPTS = [
        "machine learning", "deep learning", "neural networks", "transformers",
        "attention mechanism", "reinforcement learning", "transfer learning",
        "few-shot learning", "prompt engineering", "retrieval augmented generation",
    ]

    METHODOLOGIES = [
        "RCT", "quasi-experimental design", "meta-analysis", "systematic review",
        "survey research", "case study", "mixed methods", "longitudinal study",
    ]

    def __init__(self, seed: int = 42):
        self.seed = seed
        self.random = random.Random(seed)
        self.test_cases: list[TestCase] = []
        self._case_counter = 0

    def generate_dataset(
        self,
        cases_per_type: int = 500,
        domains: list[str] = None,
    ) -> list[TestCase]:
        """
        Generate a complete benchmark dataset.

        Args:
            cases_per_type: Number of test cases per task type
            domains: Domains to include (default: all)

        Returns:
            List of TestCase objects
        """
        domains = domains or list(self.ACADEMIC_TOPICS.keys())
        self.test_cases = []
        self._case_counter = 0

        for task_type in TaskType:
            logger.info(f"Generating {cases_per_type} cases for {task_type.value}")

            for i in range(cases_per_type):
                domain = self.random.choice(domains)
                test_case = self._generate_case(task_type, domain)
                self.test_cases.append(test_case)

        self.random.shuffle(self.test_cases)
        logger.info(f"Generated {len(self.test_cases)} total test cases")
        return self.test_cases

    def _generate_case(self, task_type: TaskType, domain: str) -> TestCase:
        """Generate a single test case."""
        self._case_counter += 1
        case_id = f"{task_type.value}_{self._case_counter:05d}"

        topics = self.ACADEMIC_TOPICS.get(domain, self.ACADEMIC_TOPICS["education"])
        topic = self.random.choice(topics)
        concept = self.random.choice(self.CONCEPTS)
        methodology = self.random.choice(self.METHODOLOGIES)

        # Select and fill template
        template = self.random.choice(self.QUERY_TEMPLATES[task_type])

        if task_type == TaskType.COMPARE:
            entity1 = self.random.choice(self.METHODOLOGIES)
            entity2 = self.random.choice([m for m in self.METHODOLOGIES if m != entity1])
            query = template.format(entity1=entity1, entity2=entity2)
            expected_entities = [entity1, entity2]
        elif "{concept}" in template:
            query = template.format(concept=concept)
            expected_entities = [concept]
        elif "{entity}" in template:
            entity = self.random.choice([topic, concept, methodology])
            query = template.format(entity=entity)
            expected_entities = [entity]
        else:
            query = template.format(topic=topic)
            expected_entities = [topic]

        # Determine expected keywords based on task type
        expected_keywords = self._get_expected_keywords(task_type, topic, concept)

        # Assign difficulty based on task complexity
        difficulty = self._assess_difficulty(task_type, query)

        return TestCase(
            id=case_id,
            query=query,
            task_type=task_type,
            expected_intent=task_type.value,
            expected_entities=expected_entities,
            expected_answer_keywords=expected_keywords,
            difficulty=difficulty,
            domain=domain,
            metadata={
                "generated_at": datetime.now().isoformat(),
                "template_used": template,
                "seed": self.seed,
            },
        )

    def _get_expected_keywords(
        self, task_type: TaskType, topic: str, concept: str
    ) -> list[str]:
        """Get expected answer keywords based on task type."""
        base_keywords = topic.lower().split()

        if task_type == TaskType.SEARCH:
            return base_keywords + ["paper", "study", "research"]
        elif task_type == TaskType.EXPLORE:
            return base_keywords + ["related", "connected", "network"]
        elif task_type == TaskType.EXPLAIN:
            return [concept.lower()] + ["definition", "means", "refers"]
        elif task_type == TaskType.COMPARE:
            return ["difference", "similar", "both", "whereas", "compared"]
        elif task_type == TaskType.SUMMARIZE:
            return base_keywords + ["findings", "conclude", "evidence", "results"]
        elif task_type == TaskType.IDENTIFY_GAPS:
            return ["gap", "unexplored", "future", "needed", "limited"]
        else:
            return base_keywords

    def _assess_difficulty(self, task_type: TaskType, query: str) -> str:
        """Assess difficulty level of a test case."""
        word_count = len(query.split())

        # Complex tasks are harder
        hard_tasks = [TaskType.COMPARE, TaskType.IDENTIFY_GAPS]
        easy_tasks = [TaskType.SEARCH, TaskType.EXPLORE]

        if task_type in hard_tasks:
            return "hard"
        elif task_type in easy_tasks and word_count < 6:
            return "easy"
        else:
            return "medium"

    def save(self, path: str | Path) -> None:
        """Save dataset to JSON file."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "metadata": {
                "version": "1.0",
                "total_cases": len(self.test_cases),
                "cases_by_type": {
                    t.value: sum(1 for c in self.test_cases if c.task_type == t)
                    for t in TaskType
                },
                "generated_at": datetime.now().isoformat(),
                "seed": self.seed,
            },
            "test_cases": [c.to_dict() for c in self.test_cases],
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved dataset to {path}")

    def load(self, path: str | Path) -> list[TestCase]:
        """Load dataset from JSON file."""
        path = Path(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.test_cases = [TestCase.from_dict(c) for c in data["test_cases"]]
        logger.info(f"Loaded {len(self.test_cases)} test cases from {path}")
        return self.test_cases

    def get_by_task_type(self, task_type: TaskType) -> list[TestCase]:
        """Get test cases filtered by task type."""
        return [c for c in self.test_cases if c.task_type == task_type]

    def get_by_difficulty(self, difficulty: str) -> list[TestCase]:
        """Get test cases filtered by difficulty."""
        return [c for c in self.test_cases if c.difficulty == difficulty]

    def get_sample(self, n: int = 100) -> list[TestCase]:
        """Get a random sample of test cases."""
        return self.random.sample(self.test_cases, min(n, len(self.test_cases)))
