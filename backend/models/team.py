"""
Team and collaboration models for ScholaRAG_Graph.
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum
from pydantic import BaseModel, Field


class TeamRole(str, Enum):
    """Team member roles."""
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class ProjectVisibility(str, Enum):
    """Project visibility levels."""
    PRIVATE = "private"
    TEAM = "team"
    PUBLIC = "public"


class TeamBase(BaseModel):
    """Base team model."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class TeamCreate(TeamBase):
    """Team creation model."""
    pass


class TeamUpdate(BaseModel):
    """Team update model."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None


class Team(TeamBase):
    """Full team model."""
    id: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    member_count: int = 0

    class Config:
        from_attributes = True


class TeamMemberBase(BaseModel):
    """Base team member model."""
    user_id: str
    role: TeamRole = TeamRole.VIEWER


class TeamMemberInvite(BaseModel):
    """Team member invitation model."""
    email: str
    role: TeamRole = TeamRole.VIEWER


class TeamMember(TeamMemberBase):
    """Full team member model."""
    team_id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    joined_at: datetime
    invited_by: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectCollaboratorBase(BaseModel):
    """Base project collaborator model."""
    role: TeamRole = TeamRole.VIEWER


class ProjectCollaboratorInvite(BaseModel):
    """Project collaborator invitation model."""
    email: str
    role: TeamRole = TeamRole.VIEWER


class ProjectCollaborator(ProjectCollaboratorBase):
    """Full project collaborator model."""
    id: str
    project_id: str
    user_id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    invited_by: Optional[str] = None
    invited_at: datetime
    accepted_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectShareSettings(BaseModel):
    """Project sharing settings."""
    visibility: ProjectVisibility = ProjectVisibility.PRIVATE
    allow_comments: bool = True
    allow_suggestions: bool = False
    public_link_enabled: bool = False
    public_link_token: Optional[str] = None


class ProjectWithCollaborators(BaseModel):
    """Project with collaboration info."""
    id: str
    name: str
    description: Optional[str] = None
    owner_id: Optional[str] = None
    owner_email: Optional[str] = None
    owner_name: Optional[str] = None
    visibility: ProjectVisibility = ProjectVisibility.PRIVATE
    collaborators: List[ProjectCollaborator] = []
    user_role: Optional[TeamRole] = None  # Current user's role
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ActivityLog(BaseModel):
    """Activity log entry."""
    id: str
    user_id: str
    user_email: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    metadata: dict = {}
    created_at: datetime

    class Config:
        from_attributes = True
