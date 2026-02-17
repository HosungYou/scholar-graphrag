"""
Evaluation API Router

Provides access to evaluation metrics and reports for gap detection quality.
Phase 11E: Evaluation Report Viewer support.
"""

import logging
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import require_auth_if_configured
from auth.models import User
from evaluation.metrics import GapDetectionMetrics, GapDetectionResult
from database import db
from routers.graph import verify_project_access

logger = logging.getLogger(__name__)
router = APIRouter()


async def get_db():
    """Dependency to get database connection."""
    if not db.is_connected:
        await db.connect()
    return db


# Response Models
class GapMatch(BaseModel):
    ground_truth_id: str
    ground_truth_description: str
    detected_id: str
    gap_strength: float
    cluster_a_concepts: list[str]
    cluster_b_concepts: list[str]


class UnmatchedGroundTruth(BaseModel):
    gap_id: str
    description: str
    cluster_a_concepts: list[str]
    cluster_b_concepts: list[str]


class UnmatchedDetected(BaseModel):
    id: str
    gap_strength: float
    cluster_a_concepts: list[str]
    cluster_b_concepts: list[str]


class GapEvaluationReport(BaseModel):
    """Gap detection evaluation report response."""
    recall: float
    precision: float
    f1: float
    true_positives: int
    false_positives: int
    false_negatives: int
    matched_gaps: list[GapMatch]
    unmatched_gaps: list[UnmatchedGroundTruth]
    false_positives_list: list[UnmatchedDetected]
    ground_truth_count: int
    detected_count: int


@router.get("/api/evaluation/report", response_model=GapEvaluationReport)
async def get_evaluation_report(
    user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Get gap detection evaluation report.

    Returns evaluation metrics comparing detected gaps against ground truth
    from the AI Education domain dataset.

    Phase 11E: Used by frontend evaluation page to display gap detection quality.
    """
    try:
        import json
        from pathlib import Path

        # Load ground truth data
        ground_truth_path = Path(__file__).parent.parent / "evaluation" / "gap_evaluation_data" / "ai_education_gaps.json"

        if not ground_truth_path.exists():
            logger.warning(f"Ground truth file not found: {ground_truth_path}")
            # Return empty report if ground truth doesn't exist
            return GapEvaluationReport(
                recall=0.0,
                precision=0.0,
                f1=0.0,
                true_positives=0,
                false_positives=0,
                false_negatives=0,
                matched_gaps=[],
                unmatched_gaps=[],
                false_positives_list=[],
                ground_truth_count=0,
                detected_count=0,
            )

        with open(ground_truth_path, "r", encoding="utf-8") as f:
            ground_truth_data = json.load(f)

        ground_truth_gaps = ground_truth_data.get("ground_truth_gaps", [])

        # For now, return a mock evaluation result
        # In production, this would fetch detected gaps from the database
        # and run the actual evaluation

        # Mock detected gaps (in production, this would come from database)
        detected_gaps = []

        # Run evaluation
        metrics = GapDetectionMetrics(concept_match_threshold=0.3)
        result = metrics.evaluate(ground_truth_gaps, detected_gaps)

        # Format matched gaps
        matched_gaps = [
            GapMatch(
                ground_truth_id=gt["gap_id"],
                ground_truth_description=gt["description"],
                detected_id=det.get("id", "unknown"),
                gap_strength=det.get("gap_strength", 0.0),
                cluster_a_concepts=det.get("cluster_a_names", det.get("cluster_a_concepts", [])),
                cluster_b_concepts=det.get("cluster_b_names", det.get("cluster_b_concepts", [])),
            )
            for gt, det in result.matched_gaps
        ]

        # Format unmatched ground truth
        unmatched_gaps = [
            UnmatchedGroundTruth(
                gap_id=gap["gap_id"],
                description=gap["description"],
                cluster_a_concepts=gap.get("cluster_a_concepts", []),
                cluster_b_concepts=gap.get("cluster_b_concepts", []),
            )
            for gap in result.unmatched_ground_truth
        ]

        # Format false positives (unmatched detected)
        false_positives_list = [
            UnmatchedDetected(
                id=gap.get("id", "unknown"),
                gap_strength=gap.get("gap_strength", 0.0),
                cluster_a_concepts=gap.get("cluster_a_names", gap.get("cluster_a_concepts", [])),
                cluster_b_concepts=gap.get("cluster_b_names", gap.get("cluster_b_concepts", [])),
            )
            for gap in result.unmatched_detected
        ]

        return GapEvaluationReport(
            recall=result.gap_recall,
            precision=result.gap_precision,
            f1=result.gap_f1,
            true_positives=result.true_positives,
            false_positives=result.false_positives,
            false_negatives=result.false_negatives,
            matched_gaps=matched_gaps,
            unmatched_gaps=unmatched_gaps,
            false_positives_list=false_positives_list,
            ground_truth_count=len(ground_truth_gaps),
            detected_count=len(detected_gaps),
        )

    except Exception as e:
        logger.error(f"Error generating evaluation report: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate evaluation report: {str(e)}"
        )


# ============================================
# v0.30.0: Retrieval Quality Evaluation
# ============================================

class RetrievalEvaluationRequest(BaseModel):
    """Request for retrieval quality evaluation."""
    max_queries: int = 20
    k_values: list[int] = [1, 3, 5, 10]


class RetrievalEvaluationResponse(BaseModel):
    """Retrieval quality evaluation results."""
    total_queries: int
    precision_at_k: dict[int, float]
    recall_at_k: dict[int, float]
    mrr: float
    hit_rate: float
    by_query_type: dict[str, dict]


@router.post("/api/evaluation/retrieval/{project_id}", response_model=RetrievalEvaluationResponse)
async def evaluate_retrieval_quality(
    project_id: UUID,
    request: RetrievalEvaluationRequest = RetrievalEvaluationRequest(),
    database=Depends(get_db),
    user: Optional[User] = Depends(require_auth_if_configured),
):
    """
    Evaluate retrieval quality for a project's knowledge graph.

    v0.30.0: Auto-generates test queries from top entities,
    runs entity search, and computes IR metrics.
    """
    await verify_project_access(database, project_id, user, "access")

    try:
        from evaluation.auto_ground_truth import auto_ground_truth
        from evaluation.metrics import EvaluationMetrics

        # 1. Get entities with connection counts
        entity_rows = await database.fetch(
            """
            SELECT e.id, e.name, e.entity_type::text,
                   (SELECT COUNT(*) FROM relationships r
                    WHERE r.project_id = $1
                    AND (r.source_id = e.id OR r.target_id = e.id)) as connection_count
            FROM entities e
            WHERE e.project_id = $1
            AND e.entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
            ORDER BY connection_count DESC
            LIMIT 100
            """,
            str(project_id),
        )

        if not entity_rows:
            return RetrievalEvaluationResponse(
                total_queries=0,
                precision_at_k={k: 0.0 for k in request.k_values},
                recall_at_k={k: 0.0 for k in request.k_values},
                mrr=0.0,
                hit_rate=0.0,
                by_query_type={},
            )

        # 2. Get relationships for query generation
        rel_rows = await database.fetch(
            """
            SELECT r.source_id, r.target_id, r.relationship_type::text,
                   COALESCE((r.properties->>'weight')::float, 1.0) as weight,
                   es.name as source_name, et.name as target_name
            FROM relationships r
            JOIN entities es ON r.source_id = es.id
            JOIN entities et ON r.target_id = et.id
            WHERE r.project_id = $1
            ORDER BY weight DESC
            LIMIT 200
            """,
            str(project_id),
        )

        entities = [
            {
                "id": str(row["id"]),
                "name": row["name"],
                "entity_type": row["entity_type"],
                "connection_count": row["connection_count"],
            }
            for row in entity_rows
        ]

        relationships = [
            {
                "source_id": str(row["source_id"]),
                "target_id": str(row["target_id"]),
                "source_name": row["source_name"],
                "target_name": row["target_name"],
                "relationship_type": row["relationship_type"],
                "weight": row["weight"],
            }
            for row in rel_rows
        ]

        # 3. Generate test queries
        test_queries = auto_ground_truth.generate_test_set(
            entities, relationships, max_queries=request.max_queries
        )

        if not test_queries:
            return RetrievalEvaluationResponse(
                total_queries=0,
                precision_at_k={k: 0.0 for k in request.k_values},
                recall_at_k={k: 0.0 for k in request.k_values},
                mrr=0.0,
                hit_rate=0.0,
                by_query_type={},
            )

        # 4. Run retrieval for each query using pgvector similarity search
        retrieved_ids_all: list[list[str]] = []
        relevant_ids_all: list[list[str]] = []
        query_type_results: dict[str, list[dict]] = {}

        max_k = max(request.k_values)

        for tq in test_queries:
            try:
                # Use existing search functionality via embedding similarity
                search_results = await database.fetch(
                    """
                    SELECT id, name, entity_type::text,
                           1 - (embedding <=> (
                               SELECT embedding FROM entities
                               WHERE id = $2 AND embedding IS NOT NULL
                               LIMIT 1
                           )) as similarity
                    FROM entities
                    WHERE project_id = $1
                    AND embedding IS NOT NULL
                    AND entity_type IN ('Concept', 'Method', 'Finding', 'Problem', 'Dataset', 'Metric', 'Innovation', 'Limitation')
                    ORDER BY embedding <=> (
                        SELECT embedding FROM entities
                        WHERE id = $2 AND embedding IS NOT NULL
                        LIMIT 1
                    )
                    LIMIT $3
                    """,
                    str(project_id),
                    tq.expected_entity_ids[0],  # Use first expected entity as query vector
                    max_k,
                )

                retrieved = [str(row["id"]) for row in search_results]
            except Exception as e:
                logger.warning(f"Search failed for query '{tq.query}': {e}")
                retrieved = []

            retrieved_ids_all.append(retrieved)
            relevant_ids_all.append(tq.expected_entity_ids)

            # Track by query type
            if tq.query_type not in query_type_results:
                query_type_results[tq.query_type] = {"retrieved": [], "relevant": []}
            query_type_results[tq.query_type]["retrieved"].append(retrieved)
            query_type_results[tq.query_type]["relevant"].append(tq.expected_entity_ids)

        # 5. Compute metrics
        eval_metrics = EvaluationMetrics()
        overall = eval_metrics.compute_retrieval_metrics(
            retrieved_ids_all, relevant_ids_all, k_values=request.k_values
        )

        # 6. Compute per-type metrics
        by_query_type = {}
        for qtype, data in query_type_results.items():
            type_metrics = eval_metrics.compute_retrieval_metrics(
                data["retrieved"], data["relevant"], k_values=request.k_values
            )
            by_query_type[qtype] = {
                "count": len(data["retrieved"]),
                "precision_at_k": {str(k): round(v, 4) for k, v in type_metrics.precision_at_k.items()},
                "recall_at_k": {str(k): round(v, 4) for k, v in type_metrics.recall_at_k.items()},
                "mrr": round(type_metrics.mrr, 4),
                "hit_rate": round(type_metrics.hit_rate, 4),
            }

        return RetrievalEvaluationResponse(
            total_queries=len(test_queries),
            precision_at_k={k: round(v, 4) for k, v in overall.precision_at_k.items()},
            recall_at_k={k: round(v, 4) for k, v in overall.recall_at_k.items()},
            mrr=round(overall.mrr, 4),
            hit_rate=round(overall.hit_rate, 4),
            by_query_type=by_query_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retrieval evaluation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to evaluate retrieval quality: {str(e)}"
        )
