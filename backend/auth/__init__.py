"""
Authentication module for ScholaRAG_Graph.

Uses Supabase Auth for user management and JWT verification.
"""

from .supabase_client import supabase_client, get_supabase
from .dependencies import get_current_user, get_optional_user, require_auth
from .models import User, UserCreate, UserProfile

__all__ = [
    "supabase_client",
    "get_supabase",
    "get_current_user",
    "get_optional_user",
    "require_auth",
    "User",
    "UserCreate", 
    "UserProfile",
]
