"""
CORS Error Handler Middleware for ScholaRAG_Graph.

INFRA-007: Ensures CORS headers are included in error responses from FastAPI.

NOTE: This middleware cannot fix CORS issues when Render's load balancer
returns 502/503 directly (before reaching FastAPI). For those cases,
the frontend must handle CORS errors gracefully.

Scenarios this middleware handles:
1. Unhandled exceptions in route handlers
2. HTTPException responses
3. Validation errors (422)
4. Internal server errors (500)

Scenarios this middleware CANNOT handle:
1. Render LB returning 502 (backend process crashed)
2. Render LB returning 503 (backend not responding)
3. Network timeouts before reaching backend

For the unhandleable cases, see frontend guidance in:
DOCS/development/frontend-cors-error-handling.md
"""

import logging
import traceback
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)


class CORSErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Middleware that ensures CORS headers are included in error responses.

    This must be added AFTER CORSMiddleware in the middleware stack
    (which means it runs BEFORE CORSMiddleware in the request flow).

    How it works:
    1. Catches any unhandled exception
    2. Converts it to a JSONResponse with proper error structure
    3. The response then passes through CORSMiddleware which adds CORS headers
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        try:
            response = await call_next(request)
            return response
        except Exception as exc:
            # Log the exception with full traceback
            error_type = type(exc).__name__
            error_msg = str(exc) if str(exc) else "(no message)"

            logger.error(
                f"INFRA-007: Unhandled exception in request {request.method} {request.url.path}: "
                f"{error_type}: {error_msg}"
            )
            logger.debug(f"Full traceback:\n{traceback.format_exc()}")

            # Return a JSON response that will pass through CORSMiddleware
            # This ensures CORS headers are added to the error response
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "error_type": error_type,
                    # Don't expose internal error messages in production
                    # The error is already logged above
                },
            )


def add_cors_error_handling(app: FastAPI) -> None:
    """
    Add exception handlers to ensure CORS headers on error responses.

    This is an alternative approach using FastAPI's exception handlers
    instead of middleware. Both approaches work, but this one is more
    explicit about which exceptions are handled.

    Usage:
        from middleware.cors_error_handler import add_cors_error_handling
        add_cors_error_handling(app)
    """
    from fastapi import HTTPException
    from fastapi.exceptions import RequestValidationError
    from starlette.exceptions import HTTPException as StarletteHTTPException

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        """Handle any unhandled exception with CORS-safe response."""
        error_type = type(exc).__name__
        error_msg = str(exc) if str(exc) else "(no message)"

        logger.error(
            f"INFRA-007: Unhandled exception: {error_type}: {error_msg} "
            f"(path: {request.url.path})"
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "error_type": error_type,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        """Handle HTTP exceptions with CORS-safe response."""
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle validation errors with CORS-safe response."""
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Validation error",
                "errors": exc.errors(),
            },
        )


# ============================================================================
# Frontend Guidance for CORS Errors
# ============================================================================
#
# When the frontend receives a CORS error (especially for 502/503 from Render LB),
# it cannot access the response body due to browser security restrictions.
#
# Recommended frontend handling:
#
# try {
#     const response = await fetch('/api/endpoint');
#     if (!response.ok) {
#         // Handle HTTP errors (this works when CORS headers are present)
#         const error = await response.json();
#         throw new Error(error.detail || 'Request failed');
#     }
#     return await response.json();
# } catch (error) {
#     if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
#         // CORS error or network error
#         // Cannot distinguish between these, so show generic message
#         throw new Error(
#             'Unable to reach the server. The service may be temporarily unavailable. ' +
#             'Please try again in a few moments.'
#         );
#     }
#     throw error;
# }
#
# ============================================================================
