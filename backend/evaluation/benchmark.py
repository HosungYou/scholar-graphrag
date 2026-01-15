"""
ScholarQA Benchmark Runner

Main benchmark class for evaluating ScholaRAG_Graph system.
Following AGENTiGraph evaluation methodology.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from .dataset import ScholarQADataset, TestCase, TaskType
from .metrics import (
    EvaluationMetrics,
    ClassificationMetrics,
    ExecutionMetrics,
    RetrievalMetrics,
    GenerationMetrics,
    EndToEndMetrics,
)

logger = logging.getLogger(__name__)


@dataclass
class BenchmarkConfig:
    """Configuration for benchmark run."""
    name: str = "ScholarQA Benchmark"
    dataset_path: Optional[str] = None
    cases_per_type: int = 100  # Reduced for faster testing
    sample_size: Optional[int] = None  # If set, only run this many cases
    include_llm_evaluation: bool = False
    timeout_seconds: float = 30.0
    parallel_workers: int = 1
    save_results: bool = True
    output_dir: str = "evaluation_results"


@dataclass
class TestCaseResult:
    """Result of a single test case evaluation."""
    test_case_id: str
    query: str
    expected_intent: str
    predicted_intent: str
    intent_correct: bool
    execution_success: bool
    execution_time_ms: float
    response: str
    highlighted_nodes: list[str]
    citations: list[str]
    error: Optional[str] = None


@dataclass
class BenchmarkResult:
    """Complete benchmark evaluation result."""
    config: BenchmarkConfig
    timestamp: str
    total_cases: int
    completed_cases: int
    failed_cases: int
    metrics: EndToEndMetrics
    results_by_task_type: dict[str, dict] = field(default_factory=dict)
    results_by_difficulty: dict[str, dict] = field(default_factory=dict)
    individual_results: list[TestCaseResult] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "config": asdict(self.config),
            "timestamp": self.timestamp,
            "total_cases": self.total_cases,
            "completed_cases": self.completed_cases,
            "failed_cases": self.failed_cases,
            "metrics": {
                "overall_success_rate": self.metrics.overall_success_rate,
                "avg_latency_ms": self.metrics.avg_latency_ms,
                "classification": {
                    "accuracy": self.metrics.classification.accuracy,
                    "macro_f1": self.metrics.classification.macro_f1,
                    "precision_per_class": self.metrics.classification.precision_per_class,
                    "recall_per_class": self.metrics.classification.recall_per_class,
                },
                "execution": {
                    "success_rate": self.metrics.execution.success_rate,
                    "avg_execution_time_ms": self.metrics.execution.avg_execution_time_ms,
                },
                "retrieval": {
                    "precision_at_k": self.metrics.retrieval.precision_at_k,
                    "mrr": self.metrics.retrieval.mrr,
                    "hit_rate": self.metrics.retrieval.hit_rate,
                },
                "generation": {
                    "keyword_coverage": self.metrics.generation.keyword_coverage,
                    "avg_response_length": self.metrics.generation.avg_response_length,
                },
            },
            "results_by_task_type": self.results_by_task_type,
            "results_by_difficulty": self.results_by_difficulty,
            "errors": self.errors,
        }

    def summary(self) -> str:
        """Generate human-readable summary."""
        lines = [
            "=" * 60,
            f"ScholarQA Benchmark Results",
            f"Timestamp: {self.timestamp}",
            "=" * 60,
            "",
            f"📊 Overall Results",
            f"   Total Cases: {self.total_cases}",
            f"   Completed: {self.completed_cases}",
            f"   Failed: {self.failed_cases}",
            "",
            f"🎯 Key Metrics (AGENTiGraph Style)",
            f"   Task Classification Accuracy: {self.metrics.classification.accuracy:.2%}",
            f"   Task Execution Success Rate: {self.metrics.execution.success_rate:.2%}",
            f"   Overall Success Rate: {self.metrics.overall_success_rate:.2%}",
            f"   Average Latency: {self.metrics.avg_latency_ms:.1f}ms",
            "",
            f"📈 Classification Performance",
            f"   Macro F1: {self.metrics.classification.macro_f1:.3f}",
        ]

        # Per-class accuracy
        if self.metrics.classification.precision_per_class:
            lines.append("   Per-Class F1:")
            for cls, f1 in sorted(self.metrics.classification.f1_per_class.items()):
                lines.append(f"      {cls}: {f1:.3f}")

        lines.extend([
            "",
            f"🔍 Retrieval Performance",
            f"   MRR: {self.metrics.retrieval.mrr:.3f}",
            f"   Hit Rate: {self.metrics.retrieval.hit_rate:.2%}",
        ])

        if self.metrics.retrieval.precision_at_k:
            for k, p in sorted(self.metrics.retrieval.precision_at_k.items()):
                lines.append(f"   P@{k}: {p:.3f}")

        lines.extend([
            "",
            f"✍️ Generation Performance",
            f"   Keyword Coverage: {self.metrics.generation.keyword_coverage:.2%}",
            f"   Avg Response Length: {self.metrics.generation.avg_response_length:.1f} words",
            "",
            "=" * 60,
        ])

        return "\n".join(lines)


class ScholarQABenchmark:
    """
    Main benchmark runner for ScholaRAG_Graph evaluation.

    Usage:
        benchmark = ScholarQABenchmark(orchestrator, config)
        result = await benchmark.run()
        print(result.summary())
    """

    def __init__(
        self,
        orchestrator=None,
        config: BenchmarkConfig = None,
        llm_judge=None,
    ):
        """
        Initialize benchmark runner.

        Args:
            orchestrator: AgentOrchestrator instance to evaluate
            config: Benchmark configuration
            llm_judge: Optional LLM for quality evaluation
        """
        self.orchestrator = orchestrator
        self.config = config or BenchmarkConfig()
        self.metrics_calculator = EvaluationMetrics(llm_judge=llm_judge)
        self.dataset = ScholarQADataset()
        self.results: list[TestCaseResult] = []

    async def run(self, project_id: str = "test_project") -> BenchmarkResult:
        """
        Run the full benchmark evaluation.

        Args:
            project_id: Project ID to use for queries

        Returns:
            BenchmarkResult with comprehensive metrics
        """
        logger.info(f"Starting ScholarQA Benchmark: {self.config.name}")
        start_time = datetime.now()

        # Load or generate dataset
        test_cases = self._load_dataset()
        logger.info(f"Loaded {len(test_cases)} test cases")

        # Sample if configured
        if self.config.sample_size and self.config.sample_size < len(test_cases):
            test_cases = self.dataset.get_sample(self.config.sample_size)
            logger.info(f"Sampled {len(test_cases)} test cases")

        # Run evaluation
        self.results = []
        errors = []

        for i, test_case in enumerate(test_cases):
            if (i + 1) % 50 == 0:
                logger.info(f"Progress: {i + 1}/{len(test_cases)}")

            try:
                result = await self._evaluate_case(test_case, project_id)
                self.results.append(result)
            except Exception as e:
                logger.error(f"Error evaluating case {test_case.id}: {e}")
                errors.append(f"{test_case.id}: {str(e)}")

        # Compute metrics
        metrics = self._compute_metrics()

        # Compute per-task-type metrics
        results_by_type = self._compute_metrics_by_task_type()
        results_by_difficulty = self._compute_metrics_by_difficulty()

        # Build result
        benchmark_result = BenchmarkResult(
            config=self.config,
            timestamp=start_time.isoformat(),
            total_cases=len(test_cases),
            completed_cases=len(self.results),
            failed_cases=len(errors),
            metrics=metrics,
            results_by_task_type=results_by_type,
            results_by_difficulty=results_by_difficulty,
            individual_results=self.results,
            errors=errors,
        )

        # Save results
        if self.config.save_results:
            self._save_results(benchmark_result)

        logger.info(f"Benchmark complete. Success rate: {metrics.overall_success_rate:.2%}")
        return benchmark_result

    def _load_dataset(self) -> list[TestCase]:
        """Load or generate test dataset."""
        if self.config.dataset_path and Path(self.config.dataset_path).exists():
            return self.dataset.load(self.config.dataset_path)
        else:
            return self.dataset.generate_dataset(
                cases_per_type=self.config.cases_per_type
            )

    async def _evaluate_case(
        self, test_case: TestCase, project_id: str
    ) -> TestCaseResult:
        """Evaluate a single test case."""
        start_time = time.time()

        predicted_intent = ""
        response = ""
        highlighted_nodes = []
        citations = []
        execution_success = False
        error = None

        try:
            if self.orchestrator:
                # Run through the full pipeline
                result = await asyncio.wait_for(
                    self.orchestrator.process_query(
                        query=test_case.query,
                        project_id=project_id,
                    ),
                    timeout=self.config.timeout_seconds,
                )

                predicted_intent = result.intent or ""
                response = result.content or ""
                highlighted_nodes = result.highlighted_nodes or []
                citations = result.citations or []
                execution_success = bool(result.content)
            else:
                # Mock evaluation for testing without orchestrator
                predicted_intent = test_case.expected_intent
                response = f"Mock response for: {test_case.query}"
                execution_success = True

        except asyncio.TimeoutError:
            error = "Timeout"
        except Exception as e:
            error = str(e)

        execution_time = (time.time() - start_time) * 1000  # ms

        return TestCaseResult(
            test_case_id=test_case.id,
            query=test_case.query,
            expected_intent=test_case.expected_intent,
            predicted_intent=predicted_intent,
            intent_correct=predicted_intent == test_case.expected_intent,
            execution_success=execution_success,
            execution_time_ms=execution_time,
            response=response,
            highlighted_nodes=highlighted_nodes,
            citations=citations,
            error=error,
        )

    def _compute_metrics(self) -> EndToEndMetrics:
        """Compute all metrics from results."""
        if not self.results:
            return EndToEndMetrics()

        # Prepare data for metrics
        full_results = []
        for r in self.results:
            full_results.append({
                "query": r.query,
                "predicted_intent": r.predicted_intent,
                "expected_intent": r.expected_intent,
                "execution_result": {
                    "success": r.execution_success,
                    "time_ms": r.execution_time_ms,
                    "error": r.error,
                },
                "retrieved_ids": r.highlighted_nodes,
                "relevant_ids": [],  # Would need ground truth
                "response": r.response,
                "expected_keywords": [],
                "latency_ms": r.execution_time_ms,
            })

        return self.metrics_calculator.compute_end_to_end_metrics(full_results)

    def _compute_metrics_by_task_type(self) -> dict[str, dict]:
        """Compute metrics broken down by task type."""
        results_by_type = {}

        for task_type in TaskType:
            type_results = [
                r for r in self.results
                if r.expected_intent == task_type.value
            ]

            if type_results:
                correct = sum(1 for r in type_results if r.intent_correct)
                successful = sum(1 for r in type_results if r.execution_success)

                results_by_type[task_type.value] = {
                    "total": len(type_results),
                    "classification_accuracy": correct / len(type_results),
                    "execution_success_rate": successful / len(type_results),
                    "avg_latency_ms": sum(r.execution_time_ms for r in type_results) / len(type_results),
                }

        return results_by_type

    def _compute_metrics_by_difficulty(self) -> dict[str, dict]:
        """Compute metrics broken down by difficulty."""
        # Would need difficulty info from test cases
        # Placeholder implementation
        return {
            "easy": {"total": 0, "success_rate": 0.0},
            "medium": {"total": 0, "success_rate": 0.0},
            "hard": {"total": 0, "success_rate": 0.0},
        }

    def _save_results(self, result: BenchmarkResult) -> None:
        """Save benchmark results to file."""
        output_dir = Path(self.config.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"benchmark_results_{timestamp}.json"
        filepath = output_dir / filename

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result.to_dict(), f, indent=2, ensure_ascii=False)

        # Also save summary
        summary_path = output_dir / f"benchmark_summary_{timestamp}.txt"
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(result.summary())

        logger.info(f"Results saved to {filepath}")


async def run_quick_benchmark(orchestrator, project_id: str = "test") -> BenchmarkResult:
    """
    Run a quick benchmark with reduced test cases.

    Useful for development and quick validation.
    """
    config = BenchmarkConfig(
        name="Quick Validation",
        cases_per_type=10,
        sample_size=50,
        save_results=False,
    )

    benchmark = ScholarQABenchmark(orchestrator=orchestrator, config=config)
    return await benchmark.run(project_id=project_id)


async def run_full_benchmark(orchestrator, project_id: str = "test") -> BenchmarkResult:
    """
    Run the full AGENTiGraph-style benchmark (3,500 cases).

    For research evaluation and paper results.
    """
    config = BenchmarkConfig(
        name="Full ScholarQA Benchmark",
        cases_per_type=500,
        save_results=True,
        output_dir="evaluation_results/full",
    )

    benchmark = ScholarQABenchmark(orchestrator=orchestrator, config=config)
    return await benchmark.run(project_id=project_id)
