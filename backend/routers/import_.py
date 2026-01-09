"""
Import API Router

Handles data import from ScholaRAG folders, PDFs, and CSVs.
"""

import logging
import os
from pathlib import Path
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Query
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

from database import db
from graph.graph_store import GraphStore
from importers.scholarag_importer import ScholarAGImporter

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Folder Browser API - 파일 탐색기 기능
# ============================================================================

class FolderItem(BaseModel):
    """폴더/파일 항목"""
    name: str
    path: str
    is_directory: bool
    is_scholarag_project: bool = False  # config.yaml이 있는 폴더인지
    has_subprojects: bool = False  # projects 하위 폴더에 프로젝트가 있는지


class BrowseResponse(BaseModel):
    """폴더 브라우징 응답"""
    current_path: str
    parent_path: Optional[str]
    items: List[FolderItem]
    is_scholarag_project: bool = False
    suggested_projects: List[FolderItem] = []  # 자동 감지된 프로젝트 목록


class DiscoveredProject(BaseModel):
    """발견된 ScholaRAG 프로젝트"""
    name: str
    path: str
    papers_count: int = 0
    has_config: bool = True


def _is_scholarag_project(folder: Path) -> bool:
    """폴더가 ScholaRAG 프로젝트인지 확인"""
    config_path = folder / "config.yaml"
    return config_path.exists()


def _get_safe_home_paths() -> List[str]:
    """안전한 시작 경로 목록 반환"""
    home = Path.home()
    paths = [
        str(home),
        str(home / "Documents"),
        str(home / "Desktop"),
        str(home / "Downloads"),
    ]
    # macOS의 /Volumes 경로도 허용
    volumes = Path("/Volumes")
    if volumes.exists():
        paths.append(str(volumes))
    return paths


def _is_path_allowed(path: str) -> bool:
    """경로 접근이 허용되는지 확인 (보안)"""
    try:
        resolved = Path(path).resolve()
        # 홈 디렉토리 또는 /Volumes 하위만 허용
        home = Path.home().resolve()
        allowed_roots = [home, Path("/Volumes").resolve()]
        return any(
            str(resolved).startswith(str(root)) or resolved == root
            for root in allowed_roots
        )
    except Exception:
        return False


@router.get("/browse", response_model=BrowseResponse)
async def browse_folder(
    path: Optional[str] = Query(None, description="탐색할 폴더 경로 (없으면 홈 디렉토리)"),
):
    """
    폴더 내용을 탐색합니다.

    보안: 사용자 홈 디렉토리 및 /Volumes 하위만 접근 가능
    """
    # 기본 경로 설정
    if not path:
        path = str(Path.home())

    folder = Path(path)

    # 경로 유효성 검사
    if not folder.exists():
        raise HTTPException(status_code=404, detail=f"경로를 찾을 수 없습니다: {path}")

    if not folder.is_dir():
        raise HTTPException(status_code=400, detail="파일이 아닌 폴더 경로를 입력하세요")

    # 보안 검사
    if not _is_path_allowed(path):
        raise HTTPException(status_code=403, detail="접근이 허용되지 않은 경로입니다")

    # 부모 경로 계산
    parent_path = None
    if folder.parent != folder:  # 루트가 아니면
        parent = folder.parent
        if _is_path_allowed(str(parent)):
            parent_path = str(parent)

    # 폴더 내용 읽기
    items: List[FolderItem] = []
    suggested_projects: List[FolderItem] = []

    try:
        for entry in sorted(folder.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            # 숨김 파일 제외 (. 으로 시작하는 파일)
            if entry.name.startswith('.'):
                continue

            is_dir = entry.is_dir()
            is_project = False
            has_subprojects = False

            if is_dir:
                is_project = _is_scholarag_project(entry)
                # projects 하위 폴더 확인
                projects_subdir = entry / "projects"
                if projects_subdir.exists() and projects_subdir.is_dir():
                    try:
                        for sub in projects_subdir.iterdir():
                            if sub.is_dir() and _is_scholarag_project(sub):
                                has_subprojects = True
                                suggested_projects.append(FolderItem(
                                    name=sub.name,
                                    path=str(sub),
                                    is_directory=True,
                                    is_scholarag_project=True,
                                ))
                    except PermissionError:
                        pass

            items.append(FolderItem(
                name=entry.name,
                path=str(entry),
                is_directory=is_dir,
                is_scholarag_project=is_project,
                has_subprojects=has_subprojects,
            ))
    except PermissionError:
        raise HTTPException(status_code=403, detail="폴더를 읽을 권한이 없습니다")

    return BrowseResponse(
        current_path=str(folder),
        parent_path=parent_path,
        items=items,
        is_scholarag_project=_is_scholarag_project(folder),
        suggested_projects=suggested_projects,
    )


@router.get("/browse/quick-access")
async def get_quick_access_paths():
    """
    빠른 접근 경로 목록 반환 (홈, Documents, Volumes 등)
    """
    home = Path.home()
    paths = []

    # 기본 경로들
    default_paths = [
        ("홈", home),
        ("Documents", home / "Documents"),
        ("Desktop", home / "Desktop"),
        ("Downloads", home / "Downloads"),
    ]

    for name, p in default_paths:
        if p.exists():
            paths.append({
                "name": name,
                "path": str(p),
                "icon": "folder"
            })

    # 외장 드라이브 (macOS의 /Volumes)
    volumes = Path("/Volumes")
    if volumes.exists():
        try:
            for vol in volumes.iterdir():
                if vol.is_dir() and not vol.name.startswith('.'):
                    # 내장 디스크 (Macintosh HD) 제외
                    if vol.name != "Macintosh HD":
                        paths.append({
                            "name": f"📁 {vol.name}",
                            "path": str(vol),
                            "icon": "hard-drive"
                        })
        except PermissionError:
            pass

    return {"paths": paths}


@router.post("/scholarag/discover")
async def discover_scholarag_projects(path: str = Query(..., description="탐색할 루트 경로")):
    """
    주어진 경로에서 ScholaRAG 프로젝트를 자동으로 찾습니다.

    루트 폴더나 projects 폴더를 입력하면 하위의 모든 프로젝트를 찾습니다.
    """
    folder = Path(path)

    if not folder.exists():
        raise HTTPException(status_code=404, detail=f"경로를 찾을 수 없습니다: {path}")

    if not _is_path_allowed(path):
        raise HTTPException(status_code=403, detail="접근이 허용되지 않은 경로입니다")

    projects: List[DiscoveredProject] = []

    # 현재 폴더가 프로젝트인지 확인
    if _is_scholarag_project(folder):
        papers_count = _count_papers(folder)
        projects.append(DiscoveredProject(
            name=folder.name,
            path=str(folder),
            papers_count=papers_count,
        ))

    # projects 하위 폴더 탐색
    projects_dir = folder / "projects"
    if projects_dir.exists():
        for sub in projects_dir.iterdir():
            if sub.is_dir() and _is_scholarag_project(sub):
                papers_count = _count_papers(sub)
                projects.append(DiscoveredProject(
                    name=sub.name,
                    path=str(sub),
                    papers_count=papers_count,
                ))

    # 직접 하위 폴더도 탐색 (depth 1)
    if not projects and folder.is_dir():
        try:
            for sub in folder.iterdir():
                if sub.is_dir() and _is_scholarag_project(sub):
                    papers_count = _count_papers(sub)
                    projects.append(DiscoveredProject(
                        name=sub.name,
                        path=str(sub),
                        papers_count=papers_count,
                    ))
        except PermissionError:
            pass

    return {
        "root_path": path,
        "projects": projects,
        "count": len(projects),
    }


def _count_papers(folder: Path) -> int:
    """폴더에서 논문 수 카운트"""
    csv_paths = [
        folder / "data" / "02_screening" / "relevant_papers.csv",
        folder / "data" / "02_screening" / "all_screened_papers.csv",
    ]

    for csv_path in csv_paths:
        if csv_path.exists():
            try:
                with open(csv_path, "r", encoding="utf-8") as f:
                    return max(0, sum(1 for _ in f) - 1)
            except Exception:
                pass
    return 0


# ============================================================================
# Import API
# ============================================================================


# Enums
class ImportStatus(str, Enum):
    PENDING = "pending"
    VALIDATING = "validating"
    EXTRACTING = "extracting"
    PROCESSING = "processing"
    BUILDING_GRAPH = "building_graph"
    COMPLETED = "completed"
    FAILED = "failed"


# Pydantic Models
class ScholaRAGImportRequest(BaseModel):
    folder_path: str
    project_name: Optional[str] = None
    extract_entities: bool = True  # Use LLM to extract Concept, Method, Finding


class ImportJobResponse(BaseModel):
    job_id: str
    status: ImportStatus
    progress: float  # 0.0 to 1.0
    message: str
    project_id: Optional[UUID] = None
    stats: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


class ImportValidationResponse(BaseModel):
    valid: bool
    folder_path: str
    config_found: bool
    scholarag_metadata_found: bool
    papers_csv_found: bool
    papers_count: int
    pdfs_count: int
    chroma_db_found: bool
    errors: list = []
    warnings: list = []


# In-memory storage
_import_jobs: dict = {}


@router.post("/scholarag/validate", response_model=ImportValidationResponse)
async def validate_scholarag_folder(request: ScholaRAGImportRequest):
    """
    Validate a ScholaRAG project folder before import.

    Checks:
    - config.yaml exists
    - .scholarag metadata exists
    - data/02_screening/relevant_papers.csv exists
    - data/03_pdfs/ contains PDFs
    - data/04_rag/chroma_db/ exists (optional)
    """
    from pathlib import Path

    folder = Path(request.folder_path)

    validation = ImportValidationResponse(
        valid=True,
        folder_path=request.folder_path,
        config_found=False,
        scholarag_metadata_found=False,
        papers_csv_found=False,
        papers_count=0,
        pdfs_count=0,
        chroma_db_found=False,
        errors=[],
        warnings=[],
    )

    # Check folder exists
    if not folder.exists():
        validation.valid = False
        validation.errors.append(f"Folder not found: {request.folder_path}")
        return validation

    # Check config.yaml
    config_path = folder / "config.yaml"
    validation.config_found = config_path.exists()
    if not validation.config_found:
        validation.errors.append("config.yaml not found")
        validation.valid = False

    # Check .scholarag
    metadata_path = folder / ".scholarag"
    validation.scholarag_metadata_found = metadata_path.exists()
    if not validation.scholarag_metadata_found:
        validation.warnings.append(".scholarag metadata not found (optional)")

    # Check papers CSV
    papers_csv = folder / "data" / "02_screening" / "relevant_papers.csv"
    validation.papers_csv_found = papers_csv.exists()
    if validation.papers_csv_found:
        # Count rows (excluding header)
        try:
            with open(papers_csv, "r", encoding="utf-8") as f:
                validation.papers_count = sum(1 for _ in f) - 1
        except Exception as e:
            validation.warnings.append(f"Could not count papers: {e}")
    else:
        # Try alternative path
        alt_csv = folder / "data" / "02_screening" / "all_screened_papers.csv"
        if alt_csv.exists():
            validation.papers_csv_found = True
            validation.warnings.append("Using all_screened_papers.csv instead")

    if not validation.papers_csv_found:
        validation.errors.append("No papers CSV found in data/02_screening/")
        validation.valid = False

    # Check PDFs
    pdfs_dir = folder / "data" / "03_pdfs"
    if pdfs_dir.exists():
        validation.pdfs_count = len(list(pdfs_dir.rglob("*.pdf")))
    else:
        validation.warnings.append("No PDFs directory found")

    # Check ChromaDB
    chroma_dir = folder / "data" / "04_rag" / "chroma_db"
    validation.chroma_db_found = chroma_dir.exists() and any(chroma_dir.iterdir()) if chroma_dir.exists() else False

    return validation


@router.post("/scholarag", response_model=ImportJobResponse)
async def import_scholarag_folder(
    request: ScholaRAGImportRequest,
    background_tasks: BackgroundTasks,
):
    """
    Start importing a ScholaRAG project folder.

    Process:
    1. Validate folder structure
    2. Parse config.yaml → Create Project
    3. Parse relevant_papers.csv → Create Paper entities
    4. Extract Authors from papers
    5. (If extract_entities=True) Use LLM to extract Concept, Method, Finding
    6. Build relationships (AUTHORED_BY, DISCUSSES_CONCEPT, etc.)
    7. Store in PostgreSQL + pgvector
    """
    from uuid import uuid4

    # Create import job
    job_id = str(uuid4())
    now = datetime.now()

    job = ImportJobResponse(
        job_id=job_id,
        status=ImportStatus.PENDING,
        progress=0.0,
        message="Import job created",
        project_id=None,
        stats=None,
        created_at=now,
        updated_at=now,
    )

    _import_jobs[job_id] = job.model_dump()

    # Start background import task
    background_tasks.add_task(
        _run_scholarag_import,
        job_id=job_id,
        folder_path=request.folder_path,
        project_name=request.project_name,
        extract_entities=request.extract_entities,
    )

    return job


async def _run_scholarag_import(
    job_id: str,
    folder_path: str,
    project_name: Optional[str],
    extract_entities: bool,
):
    """Background task to run ScholaRAG import."""
    logger.info(f"[Import {job_id}] Starting import from: {folder_path}")

    def progress_callback(progress):
        """Update job status from importer progress."""
        status_map = {
            "validating": ImportStatus.VALIDATING,
            "extracting": ImportStatus.EXTRACTING,
            "processing": ImportStatus.PROCESSING,
            "building_graph": ImportStatus.BUILDING_GRAPH,
            "completed": ImportStatus.COMPLETED,
            "failed": ImportStatus.FAILED,
        }
        _import_jobs[job_id]["status"] = status_map.get(progress.status, ImportStatus.PROCESSING)
        _import_jobs[job_id]["progress"] = progress.progress
        _import_jobs[job_id]["message"] = progress.message
        _import_jobs[job_id]["updated_at"] = datetime.now()
        logger.info(f"[Import {job_id}] {progress.status}: {progress.progress:.1%} - {progress.message}")

    try:
        # Create importer with database connection and GraphStore
        graph_store = GraphStore(db=db)
        importer = ScholarAGImporter(
            db_connection=db,
            graph_store=graph_store,
            progress_callback=progress_callback,
        )

        # Run the import
        result = await importer.import_folder(
            folder_path=folder_path,
            project_name=project_name,
            extract_entities=extract_entities,
        )

        if result["success"]:
            # Update job with results
            _import_jobs[job_id]["status"] = ImportStatus.COMPLETED
            _import_jobs[job_id]["progress"] = 1.0
            _import_jobs[job_id]["message"] = "Import completed successfully!"
            _import_jobs[job_id]["project_id"] = result.get("project_id")
            _import_jobs[job_id]["stats"] = result.get("stats", {})
            _import_jobs[job_id]["updated_at"] = datetime.now()

            logger.info(f"[Import {job_id}] Completed successfully: {result.get('stats', {})}")
        else:
            # Import failed
            _import_jobs[job_id]["status"] = ImportStatus.FAILED
            _import_jobs[job_id]["message"] = f"Import failed: {result.get('error', 'Unknown error')}"
            _import_jobs[job_id]["updated_at"] = datetime.now()
            _import_jobs[job_id]["stats"] = {
                "papers_imported": 0,
                "authors_extracted": 0,
                "concepts_extracted": 0,
                "relationships_created": 0,
            }

            logger.error(f"[Import {job_id}] Failed: {result.get('error')}")

    except Exception as e:
        logger.exception(f"[Import {job_id}] Exception during import: {e}")
        _import_jobs[job_id]["status"] = ImportStatus.FAILED
        _import_jobs[job_id]["message"] = f"Import failed: {str(e)}"
        _import_jobs[job_id]["updated_at"] = datetime.now()
        _import_jobs[job_id]["stats"] = {
            "papers_imported": 0,
            "authors_extracted": 0,
            "concepts_extracted": 0,
            "relationships_created": 0,
        }


@router.get("/status/{job_id}", response_model=ImportJobResponse)
async def get_import_status(job_id: str):
    """Get the status of an import job."""
    job = _import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return ImportJobResponse(**job)


@router.post("/pdf")
async def import_pdf(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Import a single PDF file."""
    from uuid import uuid4

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    job_id = str(uuid4())

    # TODO: Implement PDF import
    return {
        "job_id": job_id,
        "status": "pending",
        "filename": file.filename,
        "message": "PDF import not yet implemented",
    }


@router.post("/csv")
async def import_csv(
    project_id: UUID,
    file: UploadFile = File(...),
):
    """Import papers from a CSV file."""
    from uuid import uuid4

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    job_id = str(uuid4())

    # TODO: Implement CSV import
    return {
        "job_id": job_id,
        "status": "pending",
        "filename": file.filename,
        "message": "CSV import not yet implemented",
    }
