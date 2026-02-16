"""
ScholaRAG_Graph FastAPI Backend

AGENTiGraph-style GraphRAG platform for visualizing and exploring
knowledge graphs built from ScholaRAG literature review data.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import db, init_db, close_db
from routers.projects import router as projects_router
from routers.graph import router as graph_router
from routers.chat import router as chat_router
from routers.import_ import router as import_router
from routers.metrics import router as metrics_router
from routers.settings import router as settings_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("ScholaRAG_Graph Backend starting...")
    db_url = settings.database_url
    if "://" in db_url and "@" in db_url:
        prefix, rest = db_url.split("://", 1)
        creds, host = rest.split("@", 1)
        if ":" in creds:
            user, _password = creds.split(":", 1)
            db_url = f"{prefix}://{user}:***@{host}"
    logger.info(f"   Database: {db_url}")
    logger.info(f"   Default LLM: {settings.default_llm_provider}/{settings.default_llm_model}")

    # Initialize database connection
    try:
        await init_db()
        logger.info("   Database connected successfully")

        # Check pgvector availability
        if await db.check_pgvector():
            logger.info("   pgvector extension: available")
        else:
            logger.warning("   pgvector extension: NOT available")
    except Exception as e:
        logger.error(f"   Database connection failed: {e}")
        logger.warning("   Running in memory-only mode")

    yield

    # Shutdown
    logger.info("ScholaRAG_Graph Backend shutting down...")
    await close_db()


app = FastAPI(
    title="ScholaRAG_Graph API",
    description="AGENTiGraph-style GraphRAG platform for academic literature",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api/projects", tags=["Projects"])
app.include_router(graph_router, prefix="/api/graph", tags=["Graph"])
app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
app.include_router(import_router, prefix="/api/import", tags=["Import"])
app.include_router(metrics_router, prefix="/api/metrics", tags=["Metrics"])
app.include_router(settings_router, prefix="/api/settings", tags=["Settings"])


@app.get("/")
async def root():
    """Root endpoint - health check."""
    return {
        "status": "healthy",
        "service": "ScholaRAG_Graph",
        "version": "0.1.0",
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    db_status = "disconnected"
    pgvector_status = "unavailable"

    try:
        if await db.health_check():
            db_status = "connected"
        if await db.check_pgvector():
            pgvector_status = "available"
    except Exception:
        pass

    return {
        "status": "healthy",
        "database": db_status,
        "pgvector": pgvector_status,
        "llm_provider": settings.default_llm_provider,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
