"""
Teams router for ScholaRAG_Graph.

Handles team creation, member management, and project collaboration.
"""

import logging
from datetime import datetime
from typing import Optional, List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status, Query

from auth.dependencies import get_current_user, get_optional_user
from auth.models import User
from database import db
from models.team import (
    Team, TeamCreate, TeamUpdate,
    TeamMember, TeamMemberInvite, TeamRole,
    ProjectCollaborator, ProjectCollaboratorInvite,
    ProjectVisibility, ProjectShareSettings,
    ProjectWithCollaborators, ActivityLog,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================
# Team Management
# ============================================

@router.post("/", response_model=Team)
async def create_team(
    team_data: TeamCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new team."""
    team_id = str(uuid4())
    
    try:
        await db.execute(
            """
            INSERT INTO teams (id, name, description, created_by, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            """,
            team_id, team_data.name, team_data.description, current_user.id
        )
        
        # Add creator as owner
        await db.execute(
            """
            INSERT INTO team_members (id, team_id, user_id, role, joined_at)
            VALUES ($1, $2, $3, $4, NOW())
            """,
            str(uuid4()), team_id, current_user.id, TeamRole.OWNER.value
        )
        
        return Team(
            id=team_id,
            name=team_data.name,
            description=team_data.description,
            created_by=current_user.id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            member_count=1
        )
        
    except Exception as e:
        logger.error(f"Error creating team: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create team"
        )


@router.get("/", response_model=List[Team])
async def list_teams(
    current_user: User = Depends(get_current_user)
):
    """List teams the current user belongs to."""
    try:
        rows = await db.fetch(
            """
            SELECT t.*, COUNT(tm2.user_id) as member_count
            FROM teams t
            JOIN team_members tm ON t.id = tm.team_id
            LEFT JOIN team_members tm2 ON t.id = tm2.team_id
            WHERE tm.user_id = $1
            GROUP BY t.id
            ORDER BY t.created_at DESC
            """,
            current_user.id
        )
        
        return [Team(**dict(row)) for row in rows]
        
    except Exception as e:
        logger.error(f"Error listing teams: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list teams"
        )


@router.get("/{team_id}", response_model=Team)
async def get_team(
    team_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get team details."""
    # Verify membership
    member = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id, current_user.id
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this team"
        )
    
    row = await db.fetchrow(
        """
        SELECT t.*, COUNT(tm.user_id) as member_count
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.id = $1
        GROUP BY t.id
        """,
        team_id
    )
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )
    
    return Team(**dict(row))


@router.patch("/{team_id}", response_model=Team)
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update team details. Requires admin or owner role."""
    # Verify admin/owner role
    member = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')",
        team_id, current_user.id
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires admin or owner role"
        )
    
    updates = []
    values = []
    idx = 1
    
    if team_data.name is not None:
        updates.append(f"name = ${idx}")
        values.append(team_data.name)
        idx += 1
    
    if team_data.description is not None:
        updates.append(f"description = ${idx}")
        values.append(team_data.description)
        idx += 1
    
    if updates:
        updates.append("updated_at = NOW()")
        values.append(team_id)
        
        await db.execute(
            f"UPDATE teams SET {', '.join(updates)} WHERE id = ${idx}",
            *values
        )
    
    return await get_team(team_id, current_user)


@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a team. Requires owner role."""
    # Verify owner role
    member = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = 'owner'",
        team_id, current_user.id
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires owner role"
        )
    
    await db.execute("DELETE FROM teams WHERE id = $1", team_id)
    
    return {"message": "Team deleted"}


# ============================================
# Team Members
# ============================================

@router.get("/{team_id}/members", response_model=List[TeamMember])
async def list_team_members(
    team_id: str,
    current_user: User = Depends(get_current_user)
):
    """List team members."""
    # Verify membership
    member = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id, current_user.id
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this team"
        )
    
    rows = await db.fetch(
        """
        SELECT tm.*, up.email, up.full_name, up.avatar_url
        FROM team_members tm
        JOIN user_profiles up ON tm.user_id = up.id
        WHERE tm.team_id = $1
        ORDER BY tm.role, tm.joined_at
        """,
        team_id
    )
    
    return [TeamMember(**dict(row)) for row in rows]


@router.post("/{team_id}/members", response_model=TeamMember)
async def invite_team_member(
    team_id: str,
    invite: TeamMemberInvite,
    current_user: User = Depends(get_current_user)
):
    """Invite a user to the team. Requires admin or owner role."""
    # Verify admin/owner role
    member = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')",
        team_id, current_user.id
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires admin or owner role"
        )
    
    # Find user by email
    user = await db.fetchrow(
        "SELECT * FROM user_profiles WHERE email = $1",
        invite.email
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if already a member
    existing = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id, user["id"]
    )
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a team member"
        )
    
    # Add member
    member_id = str(uuid4())
    await db.execute(
        """
        INSERT INTO team_members (id, team_id, user_id, role, invited_by, joined_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        """,
        member_id, team_id, user["id"], invite.role.value, current_user.id
    )
    
    return TeamMember(
        team_id=team_id,
        user_id=user["id"],
        email=user["email"],
        full_name=user.get("full_name"),
        avatar_url=user.get("avatar_url"),
        role=invite.role,
        joined_at=datetime.now(),
        invited_by=current_user.id
    )


@router.patch("/{team_id}/members/{user_id}")
async def update_member_role(
    team_id: str,
    user_id: str,
    role: TeamRole,
    current_user: User = Depends(get_current_user)
):
    """Update a member's role. Requires owner role."""
    # Verify owner role
    member = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2 AND role = 'owner'",
        team_id, current_user.id
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires owner role"
        )
    
    # Can't change own role
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role"
        )
    
    await db.execute(
        "UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3",
        role.value, team_id, user_id
    )
    
    return {"message": "Role updated"}


@router.delete("/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a member from the team."""
    # Check permissions
    member = await db.fetchrow(
        "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id, current_user.id
    )
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this team"
        )
    
    # Users can remove themselves, admins/owners can remove others
    if user_id != current_user.id and member["role"] not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires admin or owner role to remove others"
        )
    
    # Can't remove the last owner
    if user_id == current_user.id and member["role"] == "owner":
        owner_count = await db.fetchval(
            "SELECT COUNT(*) FROM team_members WHERE team_id = $1 AND role = 'owner'",
            team_id
        )
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last owner"
            )
    
    await db.execute(
        "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id, user_id
    )
    
    return {"message": "Member removed"}


# ============================================
# Project Collaboration
# ============================================

@router.get("/projects/{project_id}/collaborators", response_model=List[ProjectCollaborator])
async def list_project_collaborators(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """List project collaborators."""
    # Verify access
    project = await db.fetchrow(
        "SELECT * FROM projects WHERE id = $1",
        project_id
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check if user has access
    if project["owner_id"] != current_user.id:
        collab = await db.fetchrow(
            "SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2",
            project_id, current_user.id
        )
        if not collab and project.get("visibility") != "public":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No access to this project"
            )
    
    rows = await db.fetch(
        """
        SELECT pc.*, up.email, up.full_name, up.avatar_url
        FROM project_collaborators pc
        JOIN user_profiles up ON pc.user_id = up.id
        WHERE pc.project_id = $1
        ORDER BY pc.role, pc.invited_at
        """,
        project_id
    )
    
    return [ProjectCollaborator(**dict(row)) for row in rows]


@router.post("/projects/{project_id}/collaborators", response_model=ProjectCollaborator)
async def invite_collaborator(
    project_id: str,
    invite: ProjectCollaboratorInvite,
    current_user: User = Depends(get_current_user)
):
    """Invite a collaborator to a project."""
    # Verify ownership or admin role
    project = await db.fetchrow(
        "SELECT * FROM projects WHERE id = $1",
        project_id
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if project["owner_id"] != current_user.id:
        collab = await db.fetchrow(
            """
            SELECT * FROM project_collaborators 
            WHERE project_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')
            """,
            project_id, current_user.id
        )
        if not collab:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requires owner or admin role"
            )
    
    # Find user by email
    user = await db.fetchrow(
        "SELECT * FROM user_profiles WHERE email = $1",
        invite.email
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if already a collaborator
    existing = await db.fetchrow(
        "SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2",
        project_id, user["id"]
    )
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a collaborator"
        )
    
    # Add collaborator
    collab_id = str(uuid4())
    await db.execute(
        """
        INSERT INTO project_collaborators (id, project_id, user_id, role, invited_by, invited_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        """,
        collab_id, project_id, user["id"], invite.role.value, current_user.id
    )
    
    return ProjectCollaborator(
        id=collab_id,
        project_id=project_id,
        user_id=user["id"],
        email=user["email"],
        full_name=user.get("full_name"),
        avatar_url=user.get("avatar_url"),
        role=invite.role,
        invited_by=current_user.id,
        invited_at=datetime.now(),
        accepted_at=None
    )


@router.patch("/projects/{project_id}/visibility")
async def update_project_visibility(
    project_id: str,
    visibility: ProjectVisibility,
    current_user: User = Depends(get_current_user)
):
    """Update project visibility. Requires owner role."""
    project = await db.fetchrow(
        "SELECT * FROM projects WHERE id = $1",
        project_id
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    if project["owner_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can change visibility"
        )
    
    await db.execute(
        "UPDATE projects SET visibility = $1, is_public = $2, updated_at = NOW() WHERE id = $3",
        visibility.value,
        visibility == ProjectVisibility.PUBLIC,
        project_id
    )
    
    return {"message": "Visibility updated", "visibility": visibility.value}


@router.delete("/projects/{project_id}/collaborators/{user_id}")
async def remove_collaborator(
    project_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a collaborator from a project."""
    project = await db.fetchrow(
        "SELECT * FROM projects WHERE id = $1",
        project_id
    )
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Owner can remove anyone, users can remove themselves
    if project["owner_id"] != current_user.id and user_id != current_user.id:
        collab = await db.fetchrow(
            """
            SELECT * FROM project_collaborators 
            WHERE project_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')
            """,
            project_id, current_user.id
        )
        if not collab:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Requires owner or admin role"
            )
    
    await db.execute(
        "DELETE FROM project_collaborators WHERE project_id = $1 AND user_id = $2",
        project_id, user_id
    )
    
    return {"message": "Collaborator removed"}
