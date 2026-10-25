"""
FastAPI application for ai-service.

Owns:
  - Feature 7: Automated Root-Cause Correlation (GET /anomalies, 30s background detector scheduler)
  - Future Feature 8: MCP server client integration
  - Future Feature 9 & 19: AI investigation assistant (POST /ask)
  - Future Feature 20: Natural-language search (POST /parse-filter)
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import get_db, close_db
from .jobs.scheduler import run_scheduler
from .routers import anomalies, mcp
from .mcp.server import mcp_server

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai_service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and graceful shutdown."""
    cfg = get_settings()
    logger.info("Initializing ai-service database...")
    # Initialize DB schema
    conn = get_db()
    logger.info("Database schema initialized at %s", cfg.DUCKDB_PATH)

    # Start the 30-second background anomaly detector scheduler
    scheduler_task = asyncio.create_task(run_scheduler())
    app.state.scheduler_task = scheduler_task
    logger.info("Scheduler task created in background.")

    try:
        yield
    finally:
        logger.info("Shutting down ai-service...")
        if scheduler_task and not scheduler_task.done():
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass
        close_db()
        logger.info("ai-service shutdown complete.")


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(
        title="Eye of Agamotto - AI & Anomaly Service",
        description="Automated root-cause correlation, statistical anomaly detection, and AI assistant.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.CORS_ORIGINS or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Standard error formatting: { "error": { "code", "message", "details" } }
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled server error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An internal server error occurred.",
                    "details": str(exc) if "test" in cfg.DUCKDB_PATH or cfg.DUCKDB_PATH == ":memory:" else None,
                }
            },
        )

    # Health check endpoints
    @app.get("/healthz", tags=["health"])
    @app.get("/health", tags=["health"])
    async def health_check():
        return {
            "status": "ok",
            "service": "ai-service",
            "features": [
                "feature-7-anomaly-detection",
                "feature-8-mcp-server",
            ],
        }

    # Mount routers at both root and versioned prefixes
    app.include_router(anomalies.router)
    app.include_router(anomalies.router, prefix="/api/v1")
    app.include_router(mcp.router)
    app.include_router(mcp.router, prefix="/api/v1")

    # Mount native MCP SSE transport
    app.mount("/mcp/sse", mcp_server.sse_app())

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8002, reload=True)
