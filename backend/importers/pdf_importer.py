"""
PDF File Importer

Imports individual PDF files and extracts paper entities.

Process:
1. Extract text from PDF using PyMuPDF
2. Extract metadata (title, authors if available)
3. Use LLM to extract title/abstract if metadata is incomplete
4. Create Paper entity
5. Optionally extract Concepts, Methods, Findings using LLM
"""

import fitz  # PyMuPDF
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable
from uuid import uuid4

from graph.entity_extractor import EntityExtractor

try:
    from config import settings
except ImportError:
    settings = None

logger = logging.getLogger(__name__)


@dataclass
class PDFImportProgress:
    """Track PDF import progress."""
    status: str = "pending"
    progress: float = 0.0
    message: str = ""
    filename: str = ""
    paper_id: Optional[str] = None
    entities_created: int = 0
    error: Optional[str] = None


@dataclass
class ExtractedPDFData:
    """Data extracted from a PDF file."""
    title: str
    abstract: str
    authors: list[str]
    year: Optional[int]
    full_text: str
    page_count: int
    filename: str


class PDFImporter:
    """
    Imports individual PDF files into ScholaRAG_Graph.
    """

    def __init__(
        self,
        db_connection=None,
        graph_store=None,
        llm_provider=None,
        progress_callback: Optional[Callable[[PDFImportProgress], None]] = None,
    ):
        self.db = db_connection
        self.graph_store = graph_store
        self.llm = llm_provider
        self.progress_callback = progress_callback
        self.progress = PDFImportProgress()
        self.entity_extractor = EntityExtractor(llm_provider=llm_provider)

    def _update_progress(
        self,
        status: Optional[str] = None,
        progress: Optional[float] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
    ):
        """Update and broadcast progress."""
        if status:
            self.progress.status = status
        if progress is not None:
            self.progress.progress = progress
        if message:
            self.progress.message = message
        if error:
            self.progress.error = error

        if self.progress_callback:
            self.progress_callback(self.progress)

    def extract_pdf_data(self, pdf_path: str) -> ExtractedPDFData:
        """
        Extract text and metadata from a PDF file.

        Uses PyMuPDF for extraction.
        """
        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        filename = path.name

        try:
            doc = fitz.open(pdf_path)
        except Exception as e:
            raise ValueError(f"Failed to open PDF: {e}")

        # Extract metadata
        metadata = doc.metadata or {}
        title = metadata.get("title", "").strip()
        author = metadata.get("author", "").strip()

        # Parse authors
        authors = []
        if author:
            # Try to split by common delimiters
            for sep in [";", ",", " and ", "&"]:
                if sep in author:
                    authors = [a.strip() for a in author.split(sep) if a.strip()]
                    break
            if not authors:
                authors = [author]

        # Try to extract year from metadata or text
        year = None
        creation_date = metadata.get("creationDate", "")
        if creation_date and len(creation_date) >= 4:
            try:
                year = int(creation_date[2:6])  # D:YYYYMMDD format
            except ValueError:
                pass

        # Extract text from all pages
        full_text = ""
        for page in doc:
            full_text += page.get_text() + "\n"

        page_count = len(doc)
        doc.close()

        # Extract title from first page if not in metadata
        if not title:
            title = self._extract_title_from_text(full_text, filename)

        # Extract abstract from text
        abstract = self._extract_abstract_from_text(full_text)

        # Try to find year in text if not found
        if not year:
            year = self._extract_year_from_text(full_text)

        return ExtractedPDFData(
            title=title,
            abstract=abstract,
            authors=authors,
            year=year,
            full_text=full_text,
            page_count=page_count,
            filename=filename,
        )

    def _extract_title_from_text(self, text: str, filename: str) -> str:
        """Extract title from PDF text or filename."""
        lines = text.strip().split("\n")[:20]  # Look at first 20 lines

        # Find the first non-empty line that looks like a title
        for line in lines:
            line = line.strip()
            if len(line) > 10 and len(line) < 200:
                # Skip lines that look like headers/footers
                if not any(skip in line.lower() for skip in ["page", "copyright", "©", "doi:", "http"]):
                    return line

        # Fallback to filename
        return filename.replace(".pdf", "").replace("_", " ").replace("-", " ").strip()

    def _extract_abstract_from_text(self, text: str) -> str:
        """Extract abstract from PDF text."""
        text_lower = text.lower()

        # Look for abstract section
        abstract_patterns = [
            r"abstract[:\s]*\n(.+?)(?:\n\s*\n|\nintroduction|\nkeywords)",
            r"abstract[:\s]*(.+?)(?:\n\s*\n|\nintroduction|\nkeywords)",
            r"summary[:\s]*\n(.+?)(?:\n\s*\n|\nintroduction)",
        ]

        for pattern in abstract_patterns:
            match = re.search(pattern, text_lower, re.DOTALL | re.IGNORECASE)
            if match:
                abstract = match.group(1).strip()
                # Clean up
                abstract = re.sub(r"\s+", " ", abstract)
                if len(abstract) > 100:
                    return abstract[:2000]  # Limit length

        # Fallback: use first few paragraphs
        paragraphs = text.split("\n\n")
        if len(paragraphs) > 1:
            return paragraphs[1][:1000]

        return ""

    def _extract_year_from_text(self, text: str) -> Optional[int]:
        """Extract publication year from PDF text."""
        # Look for years in common formats
        year_patterns = [
            r"(?:published|received|accepted)[:\s]*.*?(\d{4})",
            r"©\s*(\d{4})",
            r"\b(19\d{2}|20[0-2]\d)\b",  # Match 1900-2029
        ]

        for pattern in year_patterns:
            matches = re.findall(pattern, text[:5000], re.IGNORECASE)
            if matches:
                year = int(matches[0])
                if 1900 <= year <= datetime.now().year + 1:
                    return year

        return None

    async def import_pdf(
        self,
        pdf_path: str,
        project_id: str,
        extract_entities: bool = True,
    ) -> dict:
        """
        Import a PDF file into a project.

        Returns:
            dict with success status, paper_id, and stats
        """
        self.progress.filename = Path(pdf_path).name
        self._update_progress(status="processing", progress=0.1, message="PDF 파일 읽는 중...")

        try:
            # Extract PDF data
            pdf_data = self.extract_pdf_data(pdf_path)
            self._update_progress(progress=0.3, message="텍스트 추출 완료")

            # Create Paper entity
            paper_id = str(uuid4())
            paper_properties = {
                "title": pdf_data.title,
                "abstract": pdf_data.abstract,
                "authors": pdf_data.authors,
                "year": pdf_data.year,
                "source": "pdf_import",
                "filename": pdf_data.filename,
                "page_count": pdf_data.page_count,
            }

            self._update_progress(progress=0.5, message="Paper 엔티티 생성 중...")

            # Store Paper entity
            if self.graph_store:
                await self.graph_store.create_entity(
                    project_id=project_id,
                    entity_type="Paper",
                    name=pdf_data.title,
                    properties=paper_properties,
                )
                self.progress.entities_created += 1

            # Create Author entities
            if pdf_data.authors and self.graph_store:
                self._update_progress(progress=0.6, message="저자 엔티티 생성 중...")
                for author_name in pdf_data.authors:
                    await self.graph_store.create_entity(
                        project_id=project_id,
                        entity_type="Author",
                        name=author_name,
                        properties={"affiliation": None},
                    )
                    self.progress.entities_created += 1

            # Extract concepts using LLM (optional)
            if extract_entities and self.llm:
                self._update_progress(progress=0.7, message="개념 추출 중 (LLM)...")
                try:
                    use_full_text = (
                        settings is not None
                        and settings.lexical_graph_v1
                        and pdf_data.full_text
                        and len(pdf_data.full_text) > 500
                    )

                    if use_full_text:
                        # Full-text section-aware extraction
                        extraction_result = await self.entity_extractor.extract_from_full_text(
                            title=pdf_data.title,
                            full_text=pdf_data.full_text,
                        )
                        # Store all extracted entity types
                        for entity_key in ['concepts', 'methods', 'findings', 'results', 'claims', 'datasets']:
                            for entity in extraction_result.get(entity_key, []):
                                if self.graph_store and entity.name:
                                    entity_type_map = {
                                        'concepts': 'Concept',
                                        'methods': 'Method',
                                        'findings': 'Finding',
                                        'results': 'Result',
                                        'claims': 'Claim',
                                        'datasets': 'Dataset',
                                    }
                                    props = {
                                        "description": entity.description,
                                        "confidence": entity.confidence,
                                        "source_paper": pdf_data.title,
                                        "extraction_source": "full_text",
                                    }
                                    if entity.extraction_section:
                                        props["extraction_section"] = entity.extraction_section
                                    if entity.evidence_spans:
                                        props["evidence_spans"] = entity.evidence_spans

                                    await self.graph_store.create_entity(
                                        project_id=project_id,
                                        entity_type=entity_type_map.get(entity_key, 'Concept'),
                                        name=entity.name,
                                        properties=props,
                                    )
                                    self.progress.entities_created += 1
                    elif pdf_data.abstract:
                        # Existing abstract-only extraction (unchanged)
                        concepts = await self._extract_concepts_with_llm(pdf_data.abstract)
                        for concept in concepts[:10]:  # Limit to 10 concepts
                            if self.graph_store:
                                await self.graph_store.create_entity(
                                    project_id=project_id,
                                    entity_type="Concept",
                                    name=concept,
                                    properties={"source_paper": pdf_data.title},
                                )
                                self.progress.entities_created += 1
                except Exception as e:
                    logger.warning(f"Failed to extract concepts with LLM: {e}")

            self._update_progress(
                status="completed",
                progress=1.0,
                message=f"Import 완료: {pdf_data.title}"
            )
            self.progress.paper_id = paper_id

            return {
                "success": True,
                "paper_id": paper_id,
                "title": pdf_data.title,
                "stats": {
                    "entities_created": self.progress.entities_created,
                    "authors": len(pdf_data.authors),
                    "page_count": pdf_data.page_count,
                },
            }

        except Exception as e:
            logger.exception(f"PDF import failed: {e}")
            self._update_progress(
                status="failed",
                progress=0.0,
                message=f"Import 실패: {str(e)}",
                error=str(e),
            )
            return {
                "success": False,
                "error": str(e),
            }

    async def _extract_concepts_with_llm(self, abstract: str) -> list[str]:
        """Use LLM to extract key concepts from abstract."""
        if not self.llm:
            return []

        prompt = f"""Extract 5-10 key concepts/keywords from this academic abstract.
Return only the concepts, one per line, without numbering or bullets.

Abstract:
{abstract}

Concepts:"""

        try:
            response = await self.llm.generate(prompt, max_tokens=200)
            concepts = [c.strip() for c in response.strip().split("\n") if c.strip()]
            return concepts
        except Exception as e:
            logger.warning(f"LLM concept extraction failed: {e}")
            return []


async def import_pdf_from_upload(
    file_content: bytes,
    filename: str,
    project_id: str,
    db_connection=None,
    graph_store=None,
    progress_callback=None,
) -> dict:
    """
    Import a PDF from uploaded content.

    Saves the file temporarily, imports it, then cleans up.
    """
    import tempfile

    # Save to temp file
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, filename)

    try:
        with open(temp_path, "wb") as f:
            f.write(file_content)

        importer = PDFImporter(
            db_connection=db_connection,
            graph_store=graph_store,
            progress_callback=progress_callback,
        )

        result = await importer.import_pdf(
            pdf_path=temp_path,
            project_id=project_id,
            extract_entities=True,
        )

        return result

    finally:
        # Cleanup temp file
        try:
            os.remove(temp_path)
            os.rmdir(temp_dir)
        except Exception:
            pass
