"""
Tests for authentication module.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from auth.models import User, UserCreate, UserLogin, TokenResponse
from auth.dependencies import get_current_user, get_optional_user
from auth.supabase_client import SupabaseClient, verify_jwt


class TestAuthModels:
    """Tests for auth Pydantic models."""

    def test_user_create_valid(self):
        """Test valid user creation model."""
        user = UserCreate(
            email="test@example.com",
            password="securepassword123",
            full_name="Test User"
        )
        assert user.email == "test@example.com"
        assert user.password == "securepassword123"
        assert user.full_name == "Test User"

    def test_user_create_short_password(self):
        """Test user creation with short password fails."""
        with pytest.raises(ValueError):
            UserCreate(
                email="test@example.com",
                password="short",  # Less than 8 chars
            )

    def test_user_create_invalid_email(self):
        """Test user creation with invalid email fails."""
        with pytest.raises(ValueError):
            UserCreate(
                email="not-an-email",
                password="securepassword123",
            )

    def test_user_model(self):
        """Test User model."""
        user = User(
            id="123e4567-e89b-12d3-a456-426614174000",
            email="test@example.com",
            email_confirmed=True,
            full_name="Test User"
        )
        assert user.id == "123e4567-e89b-12d3-a456-426614174000"
        assert user.email_confirmed is True

    def test_token_response(self):
        """Test TokenResponse model."""
        response = TokenResponse(
            access_token="abc123",
            refresh_token="def456",
            expires_in=3600,
            user=User(
                id="123e4567-e89b-12d3-a456-426614174000",
                email="test@example.com"
            )
        )
        assert response.token_type == "bearer"
        assert response.expires_in == 3600


class TestSupabaseClient:
    """Tests for Supabase client."""

    def test_client_not_initialized(self):
        """Test client returns None when not initialized."""
        # Reset the client
        SupabaseClient._client = None
        SupabaseClient._url = None
        SupabaseClient._key = None
        
        assert SupabaseClient.get_client() is None
        assert SupabaseClient.is_configured() is False

    def test_client_initialization_without_credentials(self):
        """Test client initialization without credentials."""
        SupabaseClient._client = None
        SupabaseClient.initialize("", "")
        
        assert SupabaseClient.is_configured() is False


class TestAuthDependencies:
    """Tests for auth dependencies."""

    @pytest.mark.asyncio
    async def test_get_current_user_no_credentials(self):
        """Test get_current_user raises 401 without credentials."""
        # Mock supabase as configured
        with patch.object(SupabaseClient, 'is_configured', return_value=True):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=None)
            
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_service_not_configured(self):
        """Test get_current_user raises 503 when service not configured."""
        with patch.object(SupabaseClient, 'is_configured', return_value=False):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=None)
            
            assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_get_optional_user_no_credentials(self):
        """Test get_optional_user returns None without credentials."""
        with patch.object(SupabaseClient, 'is_configured', return_value=True):
            result = await get_optional_user(credentials=None)
            assert result is None

    @pytest.mark.asyncio
    async def test_get_optional_user_service_not_configured(self):
        """Test get_optional_user returns None when service not configured."""
        with patch.object(SupabaseClient, 'is_configured', return_value=False):
            result = await get_optional_user(credentials=None)
            assert result is None


class TestVerifyJwt:
    """Tests for JWT verification."""

    @pytest.mark.asyncio
    async def test_verify_jwt_no_client(self):
        """Test verify_jwt returns None when client not configured."""
        with patch.object(SupabaseClient, 'get_client', return_value=None):
            result = await verify_jwt("some-token")
            assert result is None

    @pytest.mark.asyncio
    async def test_verify_jwt_valid_token(self):
        """Test verify_jwt with valid token."""
        mock_user = Mock()
        mock_user.id = "123e4567-e89b-12d3-a456-426614174000"
        mock_user.email = "test@example.com"
        mock_user.email_confirmed_at = "2024-01-01T00:00:00Z"
        mock_user.created_at = "2024-01-01T00:00:00Z"
        mock_user.user_metadata = {"full_name": "Test User"}

        mock_response = Mock()
        mock_response.user = mock_user

        mock_client = Mock()
        mock_client.auth.get_user.return_value = mock_response

        with patch.object(SupabaseClient, 'get_client', return_value=mock_client):
            result = await verify_jwt("valid-token")
            
            assert result is not None
            assert result["id"] == "123e4567-e89b-12d3-a456-426614174000"
            assert result["email"] == "test@example.com"
            assert result["email_confirmed"] is True

    @pytest.mark.asyncio
    async def test_verify_jwt_invalid_token(self):
        """Test verify_jwt with invalid token."""
        mock_client = Mock()
        mock_client.auth.get_user.side_effect = Exception("Invalid token")

        with patch.object(SupabaseClient, 'get_client', return_value=mock_client):
            result = await verify_jwt("invalid-token")
            assert result is None
