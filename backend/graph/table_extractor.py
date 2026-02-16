"""
Table Extractor - SOTA Comparison Table -> Knowledge Graph

Detects tables in academic PDFs and extracts Model/Dataset/Metric entities
with EVALUATED_ON relationships.

Phase 9A: Table Detection and Graph Conversion Pipeline
"""
import logging
import re
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TableCell:
    text: str
    row: int
    col: int


@dataclass
class ExtractedTable:
    """A table detected in a PDF."""
    page_num: int
    rows: list[list[str]]
    headers: list[str]
    caption: str = ""
    table_type: str = "unknown"  # "sota_comparison", "results", "dataset_summary", "other"


@dataclass
class TableEntity:
    """An entity extracted from a table."""
    name: str
    entity_type: str  # "Method", "Dataset", "Metric"
    properties: dict = field(default_factory=dict)
    source_type: str = "table"


@dataclass
class TableRelationship:
    """A relationship extracted from a table."""
    source_name: str  # Method name
    target_name: str  # Dataset name
    relationship_type: str = "EVALUATED_ON"
    properties: dict = field(default_factory=dict)  # score, metric_name, metric_value


class TableExtractor:
    """Extract entities and relationships from PDF tables."""

    def __init__(self, llm_provider=None):
        self.llm = llm_provider

    def detect_tables(self, pdf_path: str) -> list[ExtractedTable]:
        """Detect tables in a PDF using PyMuPDF."""
        try:
            import fitz
        except ImportError:
            logger.warning("PyMuPDF not available for table detection")
            return []

        tables = []
        try:
            doc = fitz.open(pdf_path)
            for page_num, page in enumerate(doc):
                try:
                    page_tables = page.find_tables()
                    for table in page_tables.tables:
                        rows = []
                        for row in table.extract():
                            cleaned_row = [cell.strip() if cell else "" for cell in row]
                            if any(cleaned_row):  # Skip empty rows
                                rows.append(cleaned_row)

                        if len(rows) >= 2:  # At least header + 1 data row
                            tables.append(ExtractedTable(
                                page_num=page_num + 1,
                                rows=rows[1:],  # Data rows
                                headers=[h.lower().strip() for h in rows[0]],
                                caption=self._find_table_caption(page, table),
                            ))
                except Exception as e:
                    logger.debug(f"Table detection failed on page {page_num}: {e}")
            doc.close()
        except Exception as e:
            logger.warning(f"PDF table detection failed: {e}")

        return tables

    def _find_table_caption(self, page, table) -> str:
        """Try to find caption text near a table."""
        try:
            text_blocks = page.get_text("blocks")
            for block in text_blocks:
                block_text = block[4] if len(block) > 4 else ""
                if re.match(r'table\s+\d+', block_text.lower().strip()):
                    return block_text.strip()[:200]
        except Exception:
            pass
        return ""

    def classify_table(self, table: ExtractedTable) -> str:
        """Classify table type based on headers."""
        headers_text = " ".join(table.headers).lower()

        # SOTA comparison patterns
        sota_patterns = ["model", "method", "approach", "system", "architecture"]
        metric_patterns = ["accuracy", "f1", "bleu", "rouge", "precision", "recall",
                          "score", "performance", "result", "error", "loss", "auc"]
        dataset_patterns = ["dataset", "benchmark", "corpus", "task"]

        has_model = any(p in headers_text for p in sota_patterns)
        has_metric = any(p in headers_text for p in metric_patterns)
        has_dataset = any(p in headers_text for p in dataset_patterns)

        if has_model and has_metric:
            return "sota_comparison"
        elif has_dataset:
            return "dataset_summary"
        elif has_metric:
            return "results"
        return "other"

    def _classify_columns(self, headers: list[str]) -> dict[int, str]:
        """Classify each column as model/dataset/metric/score/other."""
        classifications = {}

        model_keywords = {"model", "method", "approach", "system", "architecture", "algorithm"}
        dataset_keywords = {"dataset", "benchmark", "corpus", "task", "data"}
        metric_keywords = {"metric", "measure"}
        score_keywords = {"accuracy", "f1", "bleu", "rouge", "precision", "recall",
                         "score", "performance", "error", "loss", "auc", "map", "ndcg",
                         "perplexity", "wer", "cer", "meteor"}

        for i, header in enumerate(headers):
            h = header.lower().strip()
            tokens = set(re.split(r'[\s_\-/]+', h))

            if tokens & model_keywords:
                classifications[i] = "model"
            elif tokens & dataset_keywords:
                classifications[i] = "dataset"
            elif tokens & metric_keywords:
                classifications[i] = "metric"
            elif tokens & score_keywords or re.match(r'^[a-z]+[\-@\d]', h):
                classifications[i] = "score"
            else:
                classifications[i] = "other"

        return classifications

    def extract_from_table(self, table: ExtractedTable) -> tuple[list[TableEntity], list[TableRelationship]]:
        """Extract entities and relationships from a classified table."""
        table.table_type = self.classify_table(table)

        if table.table_type not in ("sota_comparison", "results"):
            return [], []

        col_types = self._classify_columns(table.headers)

        # Find model, dataset, and score columns
        model_cols = [i for i, t in col_types.items() if t == "model"]
        dataset_cols = [i for i, t in col_types.items() if t == "dataset"]
        score_cols = [i for i, t in col_types.items() if t == "score"]

        if not model_cols:
            return [], []

        entities = []
        relationships = []
        seen_entities: set[str] = set()

        model_col = model_cols[0]

        for row in table.rows:
            if len(row) <= model_col:
                continue

            model_name = row[model_col].strip()
            if not model_name or len(model_name) < 2:
                continue

            # Create Method entity for model
            model_key = model_name.lower()
            if model_key not in seen_entities:
                entities.append(TableEntity(
                    name=model_key,
                    entity_type="Method",
                    properties={
                        "source_type": "table",
                        "page_num": table.page_num,
                        "table_caption": table.caption,
                    }
                ))
                seen_entities.add(model_key)

            # Extract scores and create relationships
            for score_col in score_cols:
                if score_col >= len(row):
                    continue
                score_text = row[score_col].strip()

                # Parse numeric score
                score_value = self._parse_score(score_text)
                if score_value is None:
                    continue

                metric_name = table.headers[score_col] if score_col < len(table.headers) else "unknown"

                # Dataset from column or table caption
                dataset_name = None
                for dc in dataset_cols:
                    if dc < len(row) and row[dc].strip():
                        dataset_name = row[dc].strip().lower()
                        break

                if not dataset_name:
                    # Try to infer from caption
                    dataset_name = self._infer_dataset_from_caption(table.caption)

                if dataset_name and dataset_name not in seen_entities:
                    entities.append(TableEntity(
                        name=dataset_name,
                        entity_type="Dataset",
                        properties={"source_type": "table"}
                    ))
                    seen_entities.add(dataset_name)

                # Create Metric entity for the metric name
                metric_key = metric_name.lower().strip()
                if metric_key and metric_key != "unknown" and metric_key not in seen_entities:
                    entities.append(TableEntity(
                        name=metric_key,
                        entity_type="Metric",
                        properties={"source_type": "table"}
                    ))
                    seen_entities.add(metric_key)

                # Create EVALUATED_ON relationship
                relationships.append(TableRelationship(
                    source_name=model_key,
                    target_name=dataset_name or "unknown_dataset",
                    relationship_type="EVALUATED_ON",
                    properties={
                        "metric_name": metric_name,
                        "metric_value": score_value,
                        "raw_score_text": score_text,
                        "page_num": table.page_num,
                        "source_type": "table",
                    }
                ))

        return entities, relationships

    def _parse_score(self, text: str) -> Optional[float]:
        """Parse a numeric score from table cell text."""
        if not text:
            return None
        # Remove common annotations
        clean = re.sub(r'[+-\*\u2020\u2021\u00a7\u00b6\u00b1]', '', text).strip()
        # Match patterns like "91.5", "0.856", "91.5%"
        match = re.match(r'^(\d+\.?\d*)\s*%?$', clean)
        if match:
            return float(match.group(1))
        return None

    def _infer_dataset_from_caption(self, caption: str) -> Optional[str]:
        """Try to infer dataset name from table caption."""
        if not caption:
            return None
        known_datasets = [
            "squad", "glue", "superglue", "imagenet", "coco", "cifar",
            "mnli", "sst", "qqp", "mrpc", "rte", "wnli",
        ]
        caption_lower = caption.lower()
        for ds in known_datasets:
            if ds in caption_lower:
                return ds
        return None

    def extract_all_tables(self, pdf_path: str) -> tuple[list[TableEntity], list[TableRelationship]]:
        """Detect and extract from all tables in a PDF."""
        tables = self.detect_tables(pdf_path)
        all_entities: list[TableEntity] = []
        all_relationships: list[TableRelationship] = []

        for table in tables:
            entities, relationships = self.extract_from_table(table)
            all_entities.extend(entities)
            all_relationships.extend(relationships)

        logger.info(f"Table extraction: {len(tables)} tables found, "
                    f"{len(all_entities)} entities, {len(all_relationships)} relationships")
        return all_entities, all_relationships
