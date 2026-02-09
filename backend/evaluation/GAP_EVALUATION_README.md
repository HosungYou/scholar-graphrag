# Gap Detection Evaluation System

## Overview

Phase 9B implementation: Evaluation framework for assessing the quality of research gap detection against ground truth annotations.

## Components

### 1. Ground Truth Dataset

**Location**: `backend/evaluation/gap_evaluation_data/`

**Structure**:
```json
{
    "domain": "AI in Education",
    "source_review": {
        "title": "Review paper title",
        "doi": "DOI",
        "year": 2023
    },
    "ground_truth_gaps": [
        {
            "gap_id": "GAP-001",
            "description": "Gap description",
            "cluster_a_concepts": ["concept1", "concept2"],
            "cluster_b_concepts": ["concept3", "concept4"],
            "severity": "high|medium|low",
            "annotator": "manual|expert|llm"
        }
    ],
    "cited_papers_count": 85,
    "annotation_date": "2026-02-08",
    "notes": "Annotation methodology notes"
}
```

**Included Datasets**:
- `ai_education_gaps.json`: 5 manually annotated gaps in AI education domain

### 2. Evaluation Metrics

**Class**: `GapDetectionMetrics` (in `metrics.py`)

**Metrics Computed**:
- **Precision**: What fraction of detected gaps match ground truth
- **Recall**: What fraction of ground truth gaps were detected
- **F1 Score**: Harmonic mean of precision and recall
- **True Positives**: Correctly detected gaps
- **False Positives**: Detected gaps without ground truth match
- **False Negatives**: Ground truth gaps not detected

**Matching Algorithm**:
- Uses Jaccard similarity on concept sets
- Threshold: 0.3 (configurable)
- Formula: `overlap = |A ∩ B| / |A ∪ B|`
- Match criterion: `overlap ≥ threshold`

### 3. Evaluation Functions

**Function**: `evaluate_gap_detection_with_data()`

**Parameters**:
```python
async def evaluate_gap_detection_with_data(
    ground_truth_gaps: list[dict],
    detected_gaps: list[dict],
    concept_match_threshold: float = 0.3,
    output_dir: str = "evaluation_results/gap_detection",
) -> dict
```

**Returns**:
```python
{
    "result": GapDetectionResult,  # Metrics object
    "ground_truth_count": int,
    "detected_count": int,
    "summary": str,  # Human-readable report
    "results_file": str,  # Path to JSON results
    "summary_file": str  # Path to text summary
}
```

## Usage

### Basic Example

```python
import asyncio
import json
from backend.evaluation.benchmark import evaluate_gap_detection_with_data

async def evaluate_gaps():
    # 1. Load ground truth
    with open("gap_evaluation_data/ai_education_gaps.json") as f:
        gt_data = json.load(f)

    # 2. Format detected gaps from GapDetector
    detected_gaps = [
        {
            "id": gap.id,
            "cluster_a_id": gap.cluster_a_id,
            "cluster_b_id": gap.cluster_b_id,
            "gap_strength": gap.gap_strength,
            "cluster_a_names": [...],  # Concept names
            "cluster_b_names": [...],
        }
        for gap in analysis["gaps"]
    ]

    # 3. Evaluate
    result = await evaluate_gap_detection_with_data(
        ground_truth_gaps=gt_data["ground_truth_gaps"],
        detected_gaps=detected_gaps,
    )

    # 4. Print results
    print(result["summary"])
    print(f"Precision: {result['result'].gap_precision:.2%}")
    print(f"Recall: {result['result'].gap_recall:.2%}")
    print(f"F1: {result['result'].gap_f1:.2%}")

asyncio.run(evaluate_gaps())
```

### Integration with GapDetector

```python
from backend.graph.gap_detector import GapDetector
from backend.llm.provider import get_llm_provider

# 1. Run gap detection
llm = get_llm_provider()
detector = GapDetector(llm_provider=llm)
analysis = await detector.analyze_graph(concepts, relationships)

# 2. Convert to evaluation format
concepts_by_id = {c["id"]: c for c in concepts}
detected_gaps_for_eval = [
    {
        "id": gap.id,
        "cluster_a_id": gap.cluster_a_id,
        "cluster_b_id": gap.cluster_b_id,
        "gap_strength": gap.gap_strength,
        "cluster_a_names": [
            concepts_by_id[cid]["name"]
            for cid in gap.concept_a_ids
        ],
        "cluster_b_names": [
            concepts_by_id[cid]["name"]
            for cid in gap.concept_b_ids
        ],
    }
    for gap in analysis["gaps"]
]

# 3. Evaluate
result = await evaluate_gap_detection_with_data(
    ground_truth_gaps=ground_truth["ground_truth_gaps"],
    detected_gaps=detected_gaps_for_eval,
)
```

## Output Files

### JSON Results (`gap_eval_YYYYMMDD_HHMMSS.json`)

```json
{
    "timestamp": "2026-02-08T10:30:00",
    "config": {
        "concept_match_threshold": 0.3,
        "ground_truth_count": 5,
        "detected_count": 4
    },
    "metrics": {
        "precision": 0.75,
        "recall": 0.60,
        "f1": 0.67,
        "true_positives": 3,
        "false_positives": 1,
        "false_negatives": 2
    },
    "matched_gaps": [...],
    "unmatched_ground_truth": [...],
    "unmatched_detected": [...]
}
```

### Text Summary (`gap_eval_summary_YYYYMMDD_HHMMSS.txt`)

```
============================================================
Gap Detection Evaluation Results
Timestamp: 2026-02-08T10:30:00
============================================================

Ground Truth Gaps: 5
Detected Gaps: 4
Match Threshold: 0.30 (Jaccard similarity)

Metrics:
  Precision: 75.00%
  Recall: 60.00%
  F1 Score: 66.67%

True Positives: 3
False Positives: 1
False Negatives: 2

Matched Gaps:
  - GAP-001: Limited research on AI chatbot effectiveness...
  - GAP-002: Lack of longitudinal studies on AI-assisted...
  - GAP-004: Missing connection between AI personalization...

Unmatched Ground Truth (2):
  - GAP-003: Insufficient research on ethical implications...
  - GAP-005: Gap between AI writing assistants and academic...

Unmatched Detected Gaps (1):
  - detected-gap-4: strength=0.15
============================================================
```

## TaskType Extension

Added to `dataset.py`:
```python
class TaskType(str, Enum):
    ...
    GAP_EVALUATION = "gap_evaluation"  # Evaluate gap detection quality
```

## Creating New Ground Truth Datasets

### 1. Manual Annotation

```json
{
    "domain": "Your Domain",
    "source_review": {
        "title": "Review paper",
        "doi": "10.xxxx/xxxxx",
        "year": 2024
    },
    "ground_truth_gaps": [
        {
            "gap_id": "GAP-001",
            "description": "Clear description of the gap",
            "cluster_a_concepts": [
                "concept1", "concept2", "concept3"
            ],
            "cluster_b_concepts": [
                "concept4", "concept5", "concept6"
            ],
            "severity": "high",
            "annotator": "manual"
        }
    ],
    "cited_papers_count": 100,
    "annotation_date": "2026-02-08",
    "notes": "Gaps identified from systematic review discussion section"
}
```

### 2. Best Practices

1. **Concept Selection**: Include 3-6 representative concepts per cluster
2. **Description**: Be specific and actionable
3. **Severity Levels**:
   - `high`: Critical research gap, significant impact
   - `medium`: Important but not urgent
   - `low`: Minor gap, incremental research
4. **Source**: Always cite the review paper used for annotation
5. **Date**: Record annotation date for provenance

### 3. Validation Checklist

- [ ] All gaps have unique gap_id
- [ ] Descriptions are clear and specific
- [ ] Concept lists are non-empty
- [ ] No overlap between cluster_a and cluster_b concepts
- [ ] Severity levels are consistent
- [ ] Source review is cited
- [ ] JSON is valid

## Evaluation Workflow

```
┌──────────────────────────────────────────────────────────┐
│                  Gap Evaluation Pipeline                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Load Ground Truth                                    │
│     └─> gap_evaluation_data/*.json                      │
│                                                          │
│  2. Run Gap Detection                                    │
│     └─> GapDetector.analyze_graph()                     │
│                                                          │
│  3. Format Detected Gaps                                 │
│     └─> Convert to evaluation schema                    │
│                                                          │
│  4. Compute Metrics                                      │
│     └─> GapDetectionMetrics.evaluate()                  │
│                                                          │
│  5. Match Gaps (Jaccard Similarity)                      │
│     └─> Threshold: 0.3                                  │
│                                                          │
│  6. Generate Report                                      │
│     ├─> JSON results                                    │
│     └─> Text summary                                    │
│                                                          │
│  7. Save to evaluation_results/gap_detection/            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Testing

Run the example script:
```bash
cd backend/evaluation
python gap_evaluation_example.py
```

Expected output:
- Evaluation summary printed to console
- JSON results file in `evaluation_results/gap_detection/`
- Text summary file in `evaluation_results/gap_detection/`

## Future Enhancements

### Phase 9C (Planned)
- [ ] Multi-annotator agreement metrics (Cohen's Kappa)
- [ ] Severity-weighted evaluation
- [ ] Temporal gap tracking (how gaps evolve over time)
- [ ] Automated ground truth generation from review papers

### Phase 9D (Planned)
- [ ] Cross-domain gap transfer evaluation
- [ ] Gap bridging effectiveness metrics
- [ ] Integration with PRISMA systematic review workflow

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| `metrics.py` | 571 (+110) | GapDetectionMetrics, GapDetectionResult |
| `dataset.py` | 347 (+1) | GAP_EVALUATION TaskType |
| `benchmark.py` | 672 (+239) | Evaluation runner functions |
| `gap_evaluation_data/ai_education_gaps.json` | NEW | Ground truth dataset |
| `gap_evaluation_example.py` | NEW | Usage examples |

## References

- AGENTiGraph evaluation methodology
- InfraNodus gap detection algorithm
- PRISMA 2020 systematic review guidelines
