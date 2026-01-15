"""
ScholaRAG_Graph Evaluation Framework

AGENTiGraph-style benchmark for evaluating multi-agent knowledge graph QA systems.
Based on TutorQA methodology with extensions for academic literature review domain.

Evaluation Dimensions:
1. Task Classification Accuracy (Intent Agent)
2. Task Execution Success Rate (Query Execution Agent)
3. End-to-End Response Quality (Full Pipeline)
4. Knowledge Graph Quality (Entity/Relationship Accuracy)
"""

from .benchmark import ScholarQABenchmark, BenchmarkResult
from .metrics import EvaluationMetrics
from .dataset import ScholarQADataset, TestCase

__all__ = [
    "ScholarQABenchmark",
    "BenchmarkResult",
    "EvaluationMetrics",
    "ScholarQADataset",
    "TestCase",
]
