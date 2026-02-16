"""
PRISMA diagram router for ScholaRAG_Graph.

Handles PRISMA 2020 flow diagram generation and export.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response, HTMLResponse
from pydantic import BaseModel

from auth.dependencies import get_current_user, get_optional_user
from auth.models import User
from database import db
from graph.prisma_generator import (
    PRISMAGenerator,
    PRISMAStatistics,
    OutputFormat,
    generate_prisma_from_project,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class PRISMAStatsInput(BaseModel):
    """Input model for custom PRISMA statistics."""
    
    # Identification
    records_identified_databases: int = 0
    records_identified_registers: int = 0
    records_identified_other: int = 0
    database_sources: dict[str, int] = {}
    
    # Duplicates
    duplicates_removed: int = 0
    
    # Screening
    records_screened: int = 0
    records_excluded_screening: int = 0
    
    # Eligibility
    reports_sought: int = 0
    reports_not_retrieved: int = 0
    reports_assessed: int = 0
    reports_excluded: int = 0
    exclusion_reasons: dict[str, int] = {}
    
    # Included
    studies_included: int = 0
    reports_included: int = 0
    
    # Title
    title: Optional[str] = None


@router.get("/{project_id}")
async def get_prisma_stats(
    project_id: str,
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Get PRISMA statistics for a project.
    
    Returns the statistics that will be used to generate the diagram.
    """
    # Verify project access
    project = await db.fetchrow(
        "SELECT * FROM projects WHERE id = $1",
        project_id
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check access (public projects or owner)
    if project.get("visibility") != "public":
        if not current_user or project.get("owner_id") != current_user.id:
            # Check collaborator
            if current_user:
                collab = await db.fetchrow(
                    "SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2",
                    project_id, current_user.id
                )
                if not collab:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="No access to this project"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Authentication required"
                )
    
    try:
        stats = await generate_prisma_from_project(project_id, db)
        
        return {
            "success": True,
            "data": {
                "identification": {
                    "databases": stats.records_identified_databases,
                    "registers": stats.records_identified_registers,
                    "other": stats.records_identified_other,
                    "sources": stats.database_sources,
                    "total": stats.total_identified,
                },
                "deduplication": {
                    "removed": stats.duplicates_removed,
                    "remaining": stats.after_deduplication,
                },
                "screening": {
                    "screened": stats.records_screened,
                    "excluded": stats.records_excluded_screening,
                },
                "eligibility": {
                    "sought": stats.reports_sought,
                    "not_retrieved": stats.reports_not_retrieved,
                    "assessed": stats.reports_assessed,
                    "excluded": stats.reports_excluded,
                    "exclusion_reasons": stats.exclusion_reasons,
                },
                "included": {
                    "studies": stats.studies_included,
                    "reports": stats.reports_included,
                },
                "validation_errors": stats.validate(),
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting PRISMA stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PRISMA statistics"
        )


@router.get("/{project_id}/diagram")
async def get_prisma_diagram(
    project_id: str,
    format: OutputFormat = Query(OutputFormat.SVG, description="Output format"),
    title: Optional[str] = Query(None, description="Custom title"),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Generate PRISMA 2020 flow diagram for a project.
    
    Supports SVG, HTML, JSON, and Mermaid formats.
    """
    # Same access check as above
    project = await db.fetchrow(
        "SELECT * FROM projects WHERE id = $1",
        project_id
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Access check
    if project.get("visibility") != "public":
        if not current_user or project.get("owner_id") != current_user.id:
            if current_user:
                collab = await db.fetchrow(
                    "SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2",
                    project_id, current_user.id
                )
                if not collab:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="No access to this project"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Authentication required"
                )
    
    try:
        stats = await generate_prisma_from_project(project_id, db)
        
        diagram_title = title or f"PRISMA 2020 - {project['name']}"
        generator = PRISMAGenerator(stats, diagram_title)
        
        diagram = generator.generate(format)
        
        # Set appropriate content type
        if format == OutputFormat.SVG:
            return Response(
                content=diagram,
                media_type="image/svg+xml",
                headers={
                    "Content-Disposition": f'inline; filename="prisma_{project_id}.svg"'
                }
            )
        elif format == OutputFormat.HTML:
            return HTMLResponse(content=diagram)
        elif format == OutputFormat.JSON:
            return Response(
                content=diagram,
                media_type="application/json"
            )
        else:  # Mermaid
            return Response(
                content=diagram,
                media_type="text/plain",
                headers={
                    "Content-Disposition": f'inline; filename="prisma_{project_id}.mmd"'
                }
            )
            
    except Exception as e:
        logger.error(f"Error generating PRISMA diagram: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PRISMA diagram"
        )


@router.post("/generate")
async def generate_custom_prisma(
    stats_input: PRISMAStatsInput,
    format: OutputFormat = Query(OutputFormat.SVG, description="Output format"),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """
    Generate PRISMA diagram from custom statistics.
    
    Useful for creating diagrams without a project or with manual data.
    """
    stats = PRISMAStatistics(
        records_identified_databases=stats_input.records_identified_databases,
        records_identified_registers=stats_input.records_identified_registers,
        records_identified_other=stats_input.records_identified_other,
        database_sources=stats_input.database_sources,
        duplicates_removed=stats_input.duplicates_removed,
        records_screened=stats_input.records_screened,
        records_excluded_screening=stats_input.records_excluded_screening,
        reports_sought=stats_input.reports_sought,
        reports_not_retrieved=stats_input.reports_not_retrieved,
        reports_assessed=stats_input.reports_assessed,
        reports_excluded=stats_input.reports_excluded,
        exclusion_reasons=stats_input.exclusion_reasons,
        studies_included=stats_input.studies_included,
        reports_included=stats_input.reports_included,
    )
    
    # Validate
    errors = stats.validate()
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Invalid statistics", "errors": errors}
        )
    
    title = stats_input.title or "PRISMA 2020 Flow Diagram"
    generator = PRISMAGenerator(stats, title)
    
    diagram = generator.generate(format)
    
    # Return based on format
    if format == OutputFormat.SVG:
        return Response(
            content=diagram,
            media_type="image/svg+xml",
            headers={
                "Content-Disposition": 'inline; filename="prisma_custom.svg"'
            }
        )
    elif format == OutputFormat.HTML:
        return HTMLResponse(content=diagram)
    elif format == OutputFormat.JSON:
        return Response(
            content=diagram,
            media_type="application/json"
        )
    else:  # Mermaid
        return Response(
            content=diagram,
            media_type="text/plain",
            headers={
                "Content-Disposition": 'inline; filename="prisma_custom.mmd"'
            }
        )
