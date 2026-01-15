"""
Evaluation Metrics

Comprehensive metrics for evaluating ScholaRAG_Graph performance.
Based on AGENTiGraph evaluation methodology.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional
from collections import Counter

logger = logging.getLogger(__name__)


@dataclass
class ClassificationMetrics:
    """Metrics for intent/task classification evaluation."""
    accuracy: float = 0.0
    precision_per_class: dict[str, float] = field(default_factory=dict)
    recall_per_class: dict[str, float] = field(default_factory=dict)
    f1_per_class: dict[str, float] = field(default_factory=dict)
    macro_f1: float = 0.0
    confusion_matrix: dict = field(default_factory=dict)
    total_samples: int = 0
    correct_predictions: int = 0


@dataclass
class ExecutionMetrics:
    """Metrics for task execution evaluation."""
    success_rate: float = 0.0
    partial_success_rate: float = 0.0
    failure_rate: float = 0.0
    avg_execution_time_ms: float = 0.0
    error_types: dict[str, int] = field(default_factory=dict)
    total_tasks: int = 0
    successful_tasks: int = 0


@dataclass
class RetrievalMetrics:
    """Metrics for retrieval/search quality."""
    precision_at_k: dict[int, float] = field(default_factory=dict)
    recall_at_k: dict[int, float] = field(default_factory=dict)
    mrr: float = 0.0  # Mean Reciprocal Rank
    ndcg: float = 0.0  # Normalized Discounted Cumulative Gain
    hit_rate: float = 0.0


@dataclass
class GenerationMetrics:
    """Metrics for response generation quality."""
    answer_relevance: float = 0.0  # How relevant is the answer
    faithfulness: float = 0.0  # Does answer match retrieved context
    completeness: float = 0.0  # Does answer cover all aspects
    citation_accuracy: float = 0.0  # Are citations correct
    keyword_coverage: float = 0.0  # Expected keywords found
    avg_response_length: float = 0.0
    hallucination_rate: float = 0.0


@dataclass
class EndToEndMetrics:
    """Combined end-to-end evaluation metrics."""
    overall_success_rate: float = 0.0
    avg_latency_ms: float = 0.0
    classification: ClassificationMetrics = field(default_factory=ClassificationMetrics)
    execution: ExecutionMetrics = field(default_factory=ExecutionMetrics)
    retrieval: RetrievalMetrics = field(default_factory=RetrievalMetrics)
    generation: GenerationMetrics = field(default_factory=GenerationMetrics)


class EvaluationMetrics:
    """
    Compute evaluation metrics for ScholaRAG_Graph.

    Evaluation Dimensions (following AGENTiGraph):
    1. Task Classification Accuracy
    2. Task Execution Success Rate
    3. Retrieval Quality
    4. Generation Quality
    5. End-to-End Performance
    """

    def __init__(self, llm_judge=None):
        """
        Initialize metrics calculator.

        Args:
            llm_judge: Optional LLM provider for quality evaluation
        """
        self.llm_judge = llm_judge

    def compute_classification_metrics(
        self,
        predictions: list[str],
        ground_truths: list[str],
    ) -> ClassificationMetrics:
        """
        Compute classification metrics for intent detection.

        Args:
            predictions: Predicted intent labels
            ground_truths: Ground truth intent labels

        Returns:
            ClassificationMetrics object
        """
        if len(predictions) != len(ground_truths):
            raise ValueError("Predictions and ground truths must have same length")

        n = len(predictions)
        if n == 0:
            return ClassificationMetrics()

        # Overall accuracy
        correct = sum(1 for p, g in zip(predictions, ground_truths) if p == g)
        accuracy = correct / n

        # Per-class metrics
        classes = set(ground_truths) | set(predictions)
        precision_per_class = {}
        recall_per_class = {}
        f1_per_class = {}

        for cls in classes:
            # True positives, false positives, false negatives
            tp = sum(1 for p, g in zip(predictions, ground_truths) if p == cls and g == cls)
            fp = sum(1 for p, g in zip(predictions, ground_truths) if p == cls and g != cls)
            fn = sum(1 for p, g in zip(predictions, ground_truths) if p != cls and g == cls)

            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

            precision_per_class[cls] = precision
            recall_per_class[cls] = recall
            f1_per_class[cls] = f1

        # Macro F1
        macro_f1 = sum(f1_per_class.values()) / len(f1_per_class) if f1_per_class else 0.0

        # Confusion matrix
        confusion = {}
        for p, g in zip(predictions, ground_truths):
            if g not in confusion:
                confusion[g] = {}
            confusion[g][p] = confusion[g].get(p, 0) + 1

        return ClassificationMetrics(
            accuracy=accuracy,
            precision_per_class=precision_per_class,
            recall_per_class=recall_per_class,
            f1_per_class=f1_per_class,
            macro_f1=macro_f1,
            confusion_matrix=confusion,
            total_samples=n,
            correct_predictions=correct,
        )

    def compute_execution_metrics(
        self,
        execution_results: list[dict],
    ) -> ExecutionMetrics:
        """
        Compute task execution metrics.

        Args:
            execution_results: List of execution result dicts with
                             'success', 'partial', 'error', 'time_ms' keys

        Returns:
            ExecutionMetrics object
        """
        if not execution_results:
            return ExecutionMetrics()

        n = len(execution_results)
        successful = sum(1 for r in execution_results if r.get("success"))
        partial = sum(1 for r in execution_results if r.get("partial") and not r.get("success"))
        failed = n - successful - partial

        # Error type analysis
        error_types = Counter()
        for r in execution_results:
            if r.get("error"):
                error_type = r.get("error_type", "unknown")
                error_types[error_type] += 1

        # Average execution time
        times = [r.get("time_ms", 0) for r in execution_results if r.get("time_ms")]
        avg_time = sum(times) / len(times) if times else 0.0

        return ExecutionMetrics(
            success_rate=successful / n,
            partial_success_rate=partial / n,
            failure_rate=failed / n,
            avg_execution_time_ms=avg_time,
            error_types=dict(error_types),
            total_tasks=n,
            successful_tasks=successful,
        )

    def compute_retrieval_metrics(
        self,
        retrieved_ids: list[list[str]],
        relevant_ids: list[list[str]],
        k_values: list[int] = None,
    ) -> RetrievalMetrics:
        """
        Compute retrieval quality metrics.

        Args:
            retrieved_ids: List of retrieved document ID lists (ordered by relevance)
            relevant_ids: List of ground truth relevant document ID lists
            k_values: K values for precision@k and recall@k

        Returns:
            RetrievalMetrics object
        """
        if not retrieved_ids or not relevant_ids:
            return RetrievalMetrics()

        k_values = k_values or [1, 3, 5, 10]
        n = len(retrieved_ids)

        # Precision@K and Recall@K
        precision_at_k = {k: 0.0 for k in k_values}
        recall_at_k = {k: 0.0 for k in k_values}

        for retrieved, relevant in zip(retrieved_ids, relevant_ids):
            relevant_set = set(relevant)

            for k in k_values:
                top_k = retrieved[:k]
                relevant_in_k = len(set(top_k) & relevant_set)

                precision_at_k[k] += relevant_in_k / k if k > 0 else 0.0
                recall_at_k[k] += relevant_in_k / len(relevant_set) if relevant_set else 0.0

        precision_at_k = {k: v / n for k, v in precision_at_k.items()}
        recall_at_k = {k: v / n for k, v in recall_at_k.items()}

        # Mean Reciprocal Rank
        mrr = 0.0
        for retrieved, relevant in zip(retrieved_ids, relevant_ids):
            relevant_set = set(relevant)
            for rank, doc_id in enumerate(retrieved, 1):
                if doc_id in relevant_set:
                    mrr += 1.0 / rank
                    break
        mrr /= n

        # Hit Rate (at least one relevant in top-k)
        hit_rate = 0.0
        k = max(k_values)
        for retrieved, relevant in zip(retrieved_ids, relevant_ids):
            if set(retrieved[:k]) & set(relevant):
                hit_rate += 1.0
        hit_rate /= n

        return RetrievalMetrics(
            precision_at_k=precision_at_k,
            recall_at_k=recall_at_k,
            mrr=mrr,
            hit_rate=hit_rate,
        )

    def compute_generation_metrics(
        self,
        responses: list[str],
        expected_keywords: list[list[str]],
        citations: list[list[str]] = None,
        ground_truth_citations: list[list[str]] = None,
    ) -> GenerationMetrics:
        """
        Compute response generation quality metrics.

        Args:
            responses: Generated response texts
            expected_keywords: Expected keywords per response
            citations: Generated citations per response
            ground_truth_citations: Ground truth citations

        Returns:
            GenerationMetrics object
        """
        if not responses:
            return GenerationMetrics()

        n = len(responses)

        # Keyword coverage
        keyword_coverage = 0.0
        for response, keywords in zip(responses, expected_keywords):
            if keywords:
                response_lower = response.lower()
                found = sum(1 for kw in keywords if kw.lower() in response_lower)
                keyword_coverage += found / len(keywords)
        keyword_coverage /= n

        # Average response length
        avg_length = sum(len(r.split()) for r in responses) / n

        # Citation accuracy
        citation_accuracy = 0.0
        if citations and ground_truth_citations:
            for gen_cites, gt_cites in zip(citations, ground_truth_citations):
                if gt_cites:
                    correct = len(set(gen_cites) & set(gt_cites))
                    citation_accuracy += correct / len(gt_cites)
            citation_accuracy /= n

        return GenerationMetrics(
            keyword_coverage=keyword_coverage,
            avg_response_length=avg_length,
            citation_accuracy=citation_accuracy,
        )

    async def compute_generation_metrics_with_llm(
        self,
        queries: list[str],
        responses: list[str],
        contexts: list[str] = None,
    ) -> GenerationMetrics:
        """
        Compute generation metrics using LLM as judge.

        Args:
            queries: Original queries
            responses: Generated responses
            contexts: Retrieved context used for generation

        Returns:
            GenerationMetrics with LLM-evaluated scores
        """
        if not self.llm_judge:
            logger.warning("No LLM judge configured, skipping LLM evaluation")
            return GenerationMetrics()

        relevance_scores = []
        faithfulness_scores = []
        completeness_scores = []

        for query, response, context in zip(queries, responses, contexts or [None] * len(queries)):
            # Relevance evaluation
            relevance_prompt = f"""
Rate the relevance of this response to the query on a scale of 1-5.
Query: {query}
Response: {response}
Output only a number from 1 to 5.
"""
            try:
                score = await self.llm_judge.generate(prompt=relevance_prompt, max_tokens=10)
                relevance_scores.append(float(re.search(r'[1-5]', score).group()) / 5)
            except Exception:
                relevance_scores.append(0.5)

            # Faithfulness evaluation (if context provided)
            if context:
                faith_prompt = f"""
Rate if the response is faithful to the context (no hallucination) on a scale of 1-5.
Context: {context[:1000]}
Response: {response}
Output only a number from 1 to 5.
"""
                try:
                    score = await self.llm_judge.generate(prompt=faith_prompt, max_tokens=10)
                    faithfulness_scores.append(float(re.search(r'[1-5]', score).group()) / 5)
                except Exception:
                    faithfulness_scores.append(0.5)

        metrics = GenerationMetrics()
        if relevance_scores:
            metrics.answer_relevance = sum(relevance_scores) / len(relevance_scores)
        if faithfulness_scores:
            metrics.faithfulness = sum(faithfulness_scores) / len(faithfulness_scores)
            metrics.hallucination_rate = 1.0 - metrics.faithfulness

        return metrics

    def compute_end_to_end_metrics(
        self,
        results: list[dict],
    ) -> EndToEndMetrics:
        """
        Compute comprehensive end-to-end metrics.

        Args:
            results: List of full pipeline results with structure:
                {
                    'query': str,
                    'predicted_intent': str,
                    'expected_intent': str,
                    'execution_result': dict,
                    'retrieved_ids': list,
                    'relevant_ids': list,
                    'response': str,
                    'expected_keywords': list,
                    'latency_ms': float,
                }

        Returns:
            EndToEndMetrics object
        """
        if not results:
            return EndToEndMetrics()

        # Extract data for each metric type
        predictions = [r.get("predicted_intent", "") for r in results]
        ground_truths = [r.get("expected_intent", "") for r in results]

        execution_results = [r.get("execution_result", {}) for r in results]

        retrieved_ids = [r.get("retrieved_ids", []) for r in results]
        relevant_ids = [r.get("relevant_ids", []) for r in results]

        responses = [r.get("response", "") for r in results]
        expected_keywords = [r.get("expected_keywords", []) for r in results]

        latencies = [r.get("latency_ms", 0) for r in results if r.get("latency_ms")]

        # Compute individual metrics
        classification = self.compute_classification_metrics(predictions, ground_truths)
        execution = self.compute_execution_metrics(execution_results)
        retrieval = self.compute_retrieval_metrics(retrieved_ids, relevant_ids)
        generation = self.compute_generation_metrics(responses, expected_keywords)

        # Overall success rate
        successful = sum(
            1 for r in results
            if r.get("predicted_intent") == r.get("expected_intent")
            and r.get("execution_result", {}).get("success")
        )
        overall_success = successful / len(results)

        return EndToEndMetrics(
            overall_success_rate=overall_success,
            avg_latency_ms=sum(latencies) / len(latencies) if latencies else 0.0,
            classification=classification,
            execution=execution,
            retrieval=retrieval,
            generation=generation,
        )
