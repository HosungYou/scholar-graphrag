"""
Evaluation API Router

Provides access to evaluation metrics and reports for gap detection quality.
Phase 11E: Evaluation Report Viewer support.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import require_auth_if_configured
from auth.models import User
from evaluation.metrics import GapDetectionMetrics, GapDetectionResult

logger = logging.getLogger(__name__)
router = APIRouter()


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
