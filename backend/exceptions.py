"""
ScholaRAG Exception Hierarchy
Provides structured error handling across the application
"""
from typing import Optional, Dict, Any


class ScholaRAGException(Exception):
    """
    Base exception for all ScholaRAG errors.

    All custom exceptions should inherit from this class.
    """

    def __init__(
        self,
        message: str,
        code: str = "UNKNOWN_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses"""
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details
            }
        }


# ============================================================================
# LLM Provider Exceptions
# ============================================================================

class LLMProviderError(ScholaRAGException):
    """Base exception for LLM provider errors"""

    def __init__(
        self,
        message: str,
        provider: str,
        code: str = "LLM_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, details)
        self.provider = provider
        self.details["provider"] = provider


class LLMRateLimitError(LLMProviderError):
    """Raised when LLM provider rate limit is exceeded"""

    def __init__(
        self,
        provider: str,
        retry_after: Optional[int] = None,
        message: str = "Rate limit exceeded"
    ):
        super().__init__(
            message=message,
            provider=provider,
            code="LLM_RATE_LIMIT",
            details={"retry_after_seconds": retry_after}
        )
        self.retry_after = retry_after


class LLMAuthenticationError(LLMProviderError):
    """Raised when LLM provider authentication fails"""

    def __init__(self, provider: str, message: str = "Authentication failed"):
        super().__init__(
            message=message,
            provider=provider,
            code="LLM_AUTH_ERROR"
        )


class LLMResponseParseError(LLMProviderError):
    """Raised when LLM response cannot be parsed"""

    def __init__(
        self,
        provider: str,
        raw_response: Optional[str] = None,
        message: str = "Failed to parse LLM response"
    ):
        super().__init__(
            message=message,
            provider=provider,
            code="LLM_PARSE_ERROR",
            details={"raw_response": raw_response[:500] if raw_response else None}
        )


class LLMUnavailableError(LLMProviderError):
    """Raised when LLM provider is unavailable (circuit breaker open)"""

    def __init__(self, provider: str, message: str = "LLM service unavailable"):
        super().__init__(
            message=message,
            provider=provider,
            code="LLM_UNAVAILABLE"
        )


# ============================================================================
# Graph Store Exceptions
# ============================================================================

class GraphStoreError(ScholaRAGException):
    """Base exception for graph storage errors"""

    def __init__(
        self,
        message: str,
        code: str = "GRAPH_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, details)


class EntityNotFoundError(GraphStoreError):
    """Raised when entity is not found"""

    def __init__(self, entity_id: str, entity_type: Optional[str] = None):
        super().__init__(
            message=f"Entity not found: {entity_id}",
            code="ENTITY_NOT_FOUND",
            details={"entity_id": entity_id, "entity_type": entity_type}
        )


class RelationshipNotFoundError(GraphStoreError):
    """Raised when relationship is not found"""

    def __init__(self, relationship_id: str):
        super().__init__(
            message=f"Relationship not found: {relationship_id}",
            code="RELATIONSHIP_NOT_FOUND",
            details={"relationship_id": relationship_id}
        )


class DuplicateEntityError(GraphStoreError):
    """Raised when trying to create duplicate entity"""

    def __init__(
        self,
        entity_name: str,
        existing_id: Optional[str] = None
    ):
        super().__init__(
            message=f"Entity already exists: {entity_name}",
            code="DUPLICATE_ENTITY",
            details={"entity_name": entity_name, "existing_id": existing_id}
        )


class GraphQueryError(GraphStoreError):
    """Raised when graph query fails"""

    def __init__(self, query_type: str, message: str):
        super().__init__(
            message=message,
            code="GRAPH_QUERY_ERROR",
            details={"query_type": query_type}
        )


# ============================================================================
# Import Exceptions
# ============================================================================

class DataImportError(ScholaRAGException):
    """Base exception for import processing errors (renamed from ImportError to avoid shadowing builtin)"""

    def __init__(
        self,
        message: str,
        source_type: str,
        code: str = "IMPORT_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, details)
        self.source_type = source_type
        self.details["source_type"] = source_type


class PDFExtractionError(DataImportError):
    """Raised when PDF extraction fails"""

    def __init__(
        self,
        filename: str,
        reason: str,
        message: str = "Failed to extract PDF content"
    ):
        super().__init__(
            message=message,
            source_type="pdf",
            code="PDF_EXTRACTION_ERROR",
            details={"filename": filename, "reason": reason}
        )


class ZoteroSyncError(DataImportError):
    """Raised when Zotero sync fails"""

    def __init__(self, message: str, library_id: Optional[str] = None):
        super().__init__(
            message=message,
            source_type="zotero",
            code="ZOTERO_SYNC_ERROR",
            details={"library_id": library_id}
        )


class ScholarAGImportError(DataImportError):
    """Raised when ScholaRAG project import fails"""

    def __init__(self, message: str, project_path: Optional[str] = None):
        super().__init__(
            message=message,
            source_type="scholarag",
            code="SCHOLARAG_IMPORT_ERROR",
            details={"project_path": project_path}
        )


# ============================================================================
# Authentication Exceptions
# ============================================================================

class AuthenticationError(ScholaRAGException):
    """Base exception for authentication errors"""

    def __init__(
        self,
        message: str = "Authentication required",
        code: str = "AUTH_ERROR"
    ):
        super().__init__(message, code)


class InvalidTokenError(AuthenticationError):
    """Raised when token is invalid or expired"""

    def __init__(self, message: str = "Invalid or expired token"):
        super().__init__(message, "INVALID_TOKEN")


class InsufficientPermissionsError(AuthenticationError):
    """Raised when user lacks required permissions"""

    def __init__(
        self,
        required_permission: str,
        message: str = "Insufficient permissions"
    ):
        super().__init__(message, "INSUFFICIENT_PERMISSIONS")
        self.details["required_permission"] = required_permission


# ============================================================================
# Project Exceptions
# ============================================================================

class ProjectError(ScholaRAGException):
    """Base exception for project-related errors"""
    pass


class ProjectNotFoundError(ProjectError):
    """Raised when project is not found"""

    def __init__(self, project_id: str):
        super().__init__(
            message=f"Project not found: {project_id}",
            code="PROJECT_NOT_FOUND",
            details={"project_id": project_id}
        )


class ProjectAccessDeniedError(ProjectError):
    """Raised when user cannot access project"""

    def __init__(self, project_id: str):
        super().__init__(
            message="Access denied to project",
            code="PROJECT_ACCESS_DENIED",
            details={"project_id": project_id}
        )


# ============================================================================
# Quota Exceptions
# ============================================================================

class QuotaExceededError(ScholaRAGException):
    """Raised when API quota is exceeded"""

    def __init__(
        self,
        api_type: str,
        current_usage: int,
        limit: int,
        reset_at: Optional[str] = None
    ):
        super().__init__(
            message=f"Quota exceeded for {api_type}",
            code="QUOTA_EXCEEDED",
            details={
                "api_type": api_type,
                "current_usage": current_usage,
                "limit": limit,
                "reset_at": reset_at
            }
        )
