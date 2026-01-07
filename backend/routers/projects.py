"""
Projects API Router

Handles project CRUD operations.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime


router = APIRouter()


# Pydantic Models
class ProjectCreate(BaseModel):
    name: str
    research_question: Optional[str] = None
    source_path: Optional[str] = None


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    research_question: Optional[str]
    source_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    stats: Optional[dict] = None


class ProjectStats(BaseModel):
    total_papers: int = 0
    total_authors: int = 0
    total_concepts: int = 0
    total_methods: int = 0
    total_findings: int = 0
    total_relationships: int = 0


# In-memory storage (will be replaced with PostgreSQL)
_projects_db: dict = {}


@router.get("/", response_model=List[ProjectResponse])
async def list_projects():
    """List all projects."""
    return list(_projects_db.values())


@router.post("/", response_model=ProjectResponse)
async def create_project(project: ProjectCreate):
    """Create a new project."""
    from uuid import uuid4

    project_id = uuid4()
    now = datetime.now()

    new_project = ProjectResponse(
        id=project_id,
        name=project.name,
        research_question=project.research_question,
        source_path=project.source_path,
        created_at=now,
        updated_at=now,
        stats=ProjectStats().model_dump(),
    )

    _projects_db[str(project_id)] = new_project.model_dump()
    return new_project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID):
    """Get project by ID."""
    project = _projects_db.get(str(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
async def delete_project(project_id: UUID):
    """Delete project by ID."""
    if str(project_id) not in _projects_db:
        raise HTTPException(status_code=404, detail="Project not found")
    del _projects_db[str(project_id)]
    return {"status": "deleted", "project_id": str(project_id)}


@router.get("/{project_id}/stats", response_model=ProjectStats)
async def get_project_stats(project_id: UUID):
    """Get project statistics."""
    project = _projects_db.get(str(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # TODO: Calculate actual stats from database
    return ProjectStats(
        total_papers=0,
        total_authors=0,
        total_concepts=0,
        total_methods=0,
        total_findings=0,
        total_relationships=0,
    )
