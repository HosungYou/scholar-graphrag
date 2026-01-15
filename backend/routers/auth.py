"""
Authentication router for ScholaRAG_Graph.

Handles user registration, login, logout, and profile management.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Response
from gotrue.errors import AuthApiError

from auth.supabase_client import get_supabase
from auth.dependencies import get_current_user, get_optional_user
from auth.models import (
    User,
    UserCreate,
    UserLogin,
    TokenResponse,
    RefreshTokenRequest,
    PasswordResetRequest,
    PasswordUpdateRequest,
    ProfileUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/signup", response_model=TokenResponse)
async def signup(user_data: UserCreate, supabase=Depends(get_supabase)):
    """
    Register a new user.
    
    Creates a new user account with email and password.
    Sends a verification email to the user.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        # Create user with Supabase Auth
        response = supabase.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password,
            "options": {
                "data": {
                    "full_name": user_data.full_name,
                }
            }
        })
        
        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user"
            )
        
        # Return tokens if auto-confirmed, otherwise indicate email verification needed
        if response.session:
            return TokenResponse(
                access_token=response.session.access_token,
                refresh_token=response.session.refresh_token,
                expires_in=response.session.expires_in or 3600,
                user=User(
                    id=response.user.id,
                    email=response.user.email,
                    email_confirmed=response.user.email_confirmed_at is not None,
                    created_at=response.user.created_at,
                    full_name=user_data.full_name,
                )
            )
        else:
            # Email confirmation required
            return TokenResponse(
                access_token="",
                refresh_token="",
                expires_in=0,
                user=User(
                    id=response.user.id,
                    email=response.user.email,
                    email_confirmed=False,
                    created_at=response.user.created_at,
                    full_name=user_data.full_name,
                )
            )
            
    except AuthApiError as e:
        logger.error(f"Signup error: {e}")
        if "already registered" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email already exists"
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, supabase=Depends(get_supabase)):
    """
    Log in with email and password.
    
    Returns access and refresh tokens on success.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password,
        })
        
        if not response.session or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        user_metadata = response.user.user_metadata or {}
        
        return TokenResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            expires_in=response.session.expires_in or 3600,
            user=User(
                id=response.user.id,
                email=response.user.email,
                email_confirmed=response.user.email_confirmed_at is not None,
                created_at=response.user.created_at,
                full_name=user_metadata.get("full_name"),
                avatar_url=user_metadata.get("avatar_url"),
            )
        )
        
    except AuthApiError as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    supabase=Depends(get_supabase)
):
    """
    Log out the current user.
    
    Invalidates the current session.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        supabase.auth.sign_out()
        return {"message": "Successfully logged out"}
    except Exception as e:
        logger.error(f"Logout error: {e}")
        # Still return success - client should clear tokens anyway
        return {"message": "Logged out"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    supabase=Depends(get_supabase)
):
    """
    Refresh an access token using a refresh token.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        response = supabase.auth.refresh_session(request.refresh_token)
        
        if not response.session or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        user_metadata = response.user.user_metadata or {}
        
        return TokenResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            expires_in=response.session.expires_in or 3600,
            user=User(
                id=response.user.id,
                email=response.user.email,
                email_confirmed=response.user.email_confirmed_at is not None,
                created_at=response.user.created_at,
                full_name=user_metadata.get("full_name"),
                avatar_url=user_metadata.get("avatar_url"),
            )
        )
        
    except AuthApiError as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )


@router.get("/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Get the current user's information.
    """
    return current_user


@router.patch("/me", response_model=User)
async def update_profile(
    profile: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    supabase=Depends(get_supabase)
):
    """
    Update the current user's profile.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        # Build update data
        update_data = {}
        if profile.full_name is not None:
            update_data["full_name"] = profile.full_name
        if profile.avatar_url is not None:
            update_data["avatar_url"] = profile.avatar_url
        
        if update_data:
            response = supabase.auth.update_user({
                "data": update_data
            })
            
            if response.user:
                user_metadata = response.user.user_metadata or {}
                return User(
                    id=response.user.id,
                    email=response.user.email,
                    email_confirmed=response.user.email_confirmed_at is not None,
                    created_at=response.user.created_at,
                    full_name=user_metadata.get("full_name"),
                    avatar_url=user_metadata.get("avatar_url"),
                )
        
        return current_user
        
    except AuthApiError as e:
        logger.error(f"Profile update error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/password/reset")
async def request_password_reset(
    request: PasswordResetRequest,
    supabase=Depends(get_supabase)
):
    """
    Request a password reset email.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        supabase.auth.reset_password_email(request.email)
        # Always return success to prevent email enumeration
        return {"message": "If an account exists, a reset email has been sent"}
        
    except Exception as e:
        logger.error(f"Password reset error: {e}")
        # Still return success to prevent email enumeration
        return {"message": "If an account exists, a reset email has been sent"}


@router.post("/password/update")
async def update_password(
    request: PasswordUpdateRequest,
    current_user: User = Depends(get_current_user),
    supabase=Depends(get_supabase)
):
    """
    Update the current user's password.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    try:
        supabase.auth.update_user({
            "password": request.password
        })
        return {"message": "Password updated successfully"}
        
    except AuthApiError as e:
        logger.error(f"Password update error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/providers")
async def get_oauth_providers():
    """
    Get available OAuth providers.
    """
    return {
        "providers": [
            {"name": "google", "enabled": True},
            {"name": "github", "enabled": True},
            {"name": "orcid", "enabled": False},  # Planned for researchers
        ]
    }


@router.get("/oauth/{provider}/url")
async def get_oauth_url(
    provider: str,
    redirect_to: Optional[str] = None,
    supabase=Depends(get_supabase)
):
    """
    Get OAuth authorization URL for a provider.
    """
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service not configured"
        )
    
    valid_providers = ["google", "github"]
    if provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider. Must be one of: {valid_providers}"
        )
    
    try:
        options = {}
        if redirect_to:
            options["redirect_to"] = redirect_to
            
        response = supabase.auth.sign_in_with_oauth({
            "provider": provider,
            "options": options
        })
        
        return {"url": response.url}
        
    except Exception as e:
        logger.error(f"OAuth URL error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate OAuth URL"
        )
