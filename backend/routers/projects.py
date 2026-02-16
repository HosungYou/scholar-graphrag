"""
Projects API Router

Handles project CRUD operations using PostgreSQL.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime

from database import db

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


def _record_to_response(record) -> dict:
    """Convert asyncpg Record to dict for ProjectResponse."""
    return {
        "id": record["id"],
        "name": record["name"],
        "research_question": record["research_question"],
        "source_path": record["source_path"],
        "created_at": record["created_at"],
        "updated_at": record["updated_at"],
        "stats": None,
    }


@router.get("/", response_model=List[ProjectResponse])
async def list_projects():
    """List all projects."""
    try:
        rows = await db.fetch(
            """
            SELECT id, name, research_question, source_path, created_at, updated_at
            FROM projects
            ORDER BY updated_at DESC
            """
        )
        return [_record_to_response(row) for row in rows]
    except Exception as e:
        # If database is not available, return empty list
        import logging
        logging.error(f"Failed to list projects: {e}")
        return []


@router.post("/", response_model=ProjectResponse)
async def create_project(project: ProjectCreate):
    """Create a new project."""
    try:
        row = await db.fetchrow(
            """
            INSERT INTO projects (name, research_question, source_path)
            VALUES ($1, $2, $3)
            RETURNING id, name, research_question, source_path, created_at, updated_at
            """,
            project.name,
            project.research_question,
            project.source_path,
        )
        return _record_to_response(row)
    except Exception as e:
        import logging
        logging.error(f"Failed to create project: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID):
    """Get project by ID."""
    try:
        row = await db.fetchrow(
            """
            SELECT id, name, research_question, source_path, created_at, updated_at
            FROM projects
            WHERE id = $1
            """,
            project_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return _record_to_response(row)
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Failed to get project: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.delete("/{project_id}")
async def delete_project(project_id: UUID):
    """Delete project by ID."""
    try:
        result = await db.execute(
            "DELETE FROM projects WHERE id = $1",
            project_id,
        )
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "deleted", "project_id": str(project_id)}
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Failed to delete project: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/{project_id}/stats", response_model=ProjectStats)
async def get_project_stats(project_id: UUID):
    """Get project statistics."""
    try:
        # First verify project exists
        project = await db.fetchrow(
            "SELECT id FROM projects WHERE id = $1",
            project_id,
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get entity counts from entities table
        stats_row = await db.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE entity_type = 'Paper') as total_papers,
                COUNT(*) FILTER (WHERE entity_type = 'Author') as total_authors,
                COUNT(*) FILTER (WHERE entity_type = 'Concept') as total_concepts,
                COUNT(*) FILTER (WHERE entity_type = 'Method') as total_methods,
                COUNT(*) FILTER (WHERE entity_type = 'Finding') as total_findings
            FROM entities
            WHERE project_id = $1
            """,
            project_id,
        )

        # Get relationship count
        rel_count = await db.fetchval(
            """
            SELECT COUNT(*) FROM relationships r
            JOIN entities e ON r.source_id = e.id
            WHERE e.project_id = $1
            """,
            project_id,
        )

        if stats_row:
            return ProjectStats(
                total_papers=stats_row["total_papers"] or 0,
                total_authors=stats_row["total_authors"] or 0,
                total_concepts=stats_row["total_concepts"] or 0,
                total_methods=stats_row["total_methods"] or 0,
                total_findings=stats_row["total_findings"] or 0,
                total_relationships=rel_count or 0,
            )
        return ProjectStats()
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Failed to get project stats: {e}")
        # Return empty stats if query fails (e.g., entities table doesn't exist)
        return ProjectStats()
