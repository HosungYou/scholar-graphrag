"""
Query Performance Metrics Collector

Tracks query timing for graph operations to support data-driven
decisions about native GraphDB migration (SDD Section 7).
"""
import time
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, Dict, List
from functools import wraps

logger = logging.getLogger(__name__)


@dataclass
class QueryMetric:
    """Single query timing record."""
    query_type: str  # "entity_search", "vector_search", "subgraph", "multi_hop", etc.
    hop_count: int = 0
    result_count: int = 0
    latency_ms: float = 0.0
    timestamp: float = 0.0
    project_id: str = ""


@dataclass
class QueryMetricsSummary:
    """Aggregated metrics summary."""
    total_queries: int = 0
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    max_latency_ms: float = 0.0
    by_type: Dict[str, Dict] = field(default_factory=dict)
    by_hop_count: Dict[int, Dict] = field(default_factory=dict)
    graphdb_recommendation: str = "not_needed"  # "not_needed", "evaluate", "recommended"


class QueryMetricsCollector:
    """Collects and aggregates query performance metrics."""

    _instance = None

    def __init__(self, max_history: int = 1000):
        self._metrics: List[QueryMetric] = []
        self._max_history = max_history

    @classmethod
    def get_instance(cls) -> "QueryMetricsCollector":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def record(self, metric: QueryMetric):
        """Record a query metric."""
        self._metrics.append(metric)
        if len(self._metrics) > self._max_history:
            self._metrics = self._metrics[-self._max_history:]

        # Log slow queries
        if metric.latency_ms > 500:
            logger.warning(
                f"Slow query: {metric.query_type} ({metric.hop_count} hops) "
                f"took {metric.latency_ms:.1f}ms, {metric.result_count} results"
            )

    def get_summary(self) -> QueryMetricsSummary:
        """Get aggregated metrics summary."""
        if not self._metrics:
            return QueryMetricsSummary()

        latencies = [m.latency_ms for m in self._metrics]
        latencies.sort()

        summary = QueryMetricsSummary(
            total_queries=len(self._metrics),
            avg_latency_ms=round(sum(latencies) / len(latencies), 2),
            p95_latency_ms=round(latencies[int(len(latencies) * 0.95)] if latencies else 0, 2),
            max_latency_ms=round(max(latencies) if latencies else 0, 2),
        )

        # Group by query type
        by_type = defaultdict(list)
        for m in self._metrics:
            by_type[m.query_type].append(m.latency_ms)

        for qtype, lats in by_type.items():
            lats.sort()
            summary.by_type[qtype] = {
                "count": len(lats),
                "avg_ms": round(sum(lats) / len(lats), 2),
                "p95_ms": round(lats[int(len(lats) * 0.95)] if lats else 0, 2),
                "max_ms": round(max(lats) if lats else 0, 2),
            }

        # Group by hop count
        by_hop = defaultdict(list)
        for m in self._metrics:
            if m.hop_count > 0:
                by_hop[m.hop_count].append(m.latency_ms)

        for hops, lats in by_hop.items():
            lats.sort()
            summary.by_hop_count[hops] = {
                "count": len(lats),
                "avg_ms": round(sum(lats) / len(lats), 2),
                "p95_ms": round(lats[int(len(lats) * 0.95)] if lats else 0, 2),
                "max_ms": round(max(lats) if lats else 0, 2),
            }

        # GraphDB recommendation based on 3-hop query performance
        three_hop_metrics = summary.by_hop_count.get(3, {})
        if three_hop_metrics.get("avg_ms", 0) > 500:
            summary.graphdb_recommendation = "recommended"
        elif three_hop_metrics.get("p95_ms", 0) > 500:
            summary.graphdb_recommendation = "evaluate"

        return summary

    def clear(self):
        """Clear all metrics."""
        self._metrics.clear()


def timed_query(query_type: str, hop_count: int = 0):
    """Decorator to time async query functions and record metrics."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start = time.perf_counter()
            result = await func(*args, **kwargs)
            elapsed_ms = (time.perf_counter() - start) * 1000

            # Determine result count
            result_count = 0
            if isinstance(result, list):
                result_count = len(result)
            elif isinstance(result, dict):
                result_count = len(result.get("nodes", result.get("results", [])))

            # Extract project_id if available
            project_id = ""
            if args and len(args) > 1:
                project_id = str(args[1]) if args[1] else ""
            elif "project_id" in kwargs:
                project_id = str(kwargs["project_id"])

            collector = QueryMetricsCollector.get_instance()
            collector.record(QueryMetric(
                query_type=query_type,
                hop_count=hop_count,
                result_count=result_count,
                latency_ms=round(elapsed_ms, 2),
                timestamp=time.time(),
                project_id=project_id,
            ))

            return result
        return wrapper
    return decorator
