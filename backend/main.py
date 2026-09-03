"""
main.py
=======
FastAPI application entry point for the ResumeMaxxer backend.

Run locally (from inside the `backend/` directory)::

    pip install -r requirements.txt
    cp .env.example .env          # then paste your Neon / Gemini values
    uvicorn main:app --reload --port 8000

Interactive API docs: http://localhost:8000/docs

Scope of this file
------------------
This is deliberately thin: app construction, middleware, lifespan and the
health probe. Feature endpoints (Vault CRUD, GitHub import, the tailoring
engine) land in `routers/` and are mounted here with `app.include_router(...)`.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from database import get_engine, init_db

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv(override=False)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("resumemaxxer")

# `ENVIRONMENT` gates behaviour that must never be on in production, such as
# auto-creating tables and exposing the Swagger UI.
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION: bool = ENVIRONMENT == "production"

# Allowed browser origins. Defaults cover the Vite dev server on its standard
# port; deployments override this with a comma-separated env var, e.g.
#   CORS_ORIGINS=https://resumemaxxer.app,https://www.resumemaxxer.app
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).split(",")
    if origin.strip()
]


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage resources that must outlive a single request.

    On startup we create any missing tables. That is fine for the MVP, but note
    `create_all` only ever CREATEs - it will not ALTER a table whose columns
    changed. Before the first production deploy, switch to Alembic migrations
    and drop the `init_db()` call (which is already disabled in production).
    """
    logger.info("Starting ResumeMaxxer API (environment=%s)", ENVIRONMENT)

    if IS_PRODUCTION:
        logger.info("Production mode: skipping create_all, expecting migrations")
    else:
        try:
            init_db()
            logger.info("Database schema synchronised")
        except Exception:
            # Do not crash the process: a developer who has not filled in
            # DATABASE_URL yet should still get a running server and a clear
            # error from /health rather than a stack trace on boot.
            logger.exception("Could not initialise the database schema")

    yield  # ---- application serves requests here ----

    # Dispose the pool so Neon does not hold sockets open after a reload.
    get_engine().dispose()
    logger.info("Shutdown complete: database connection pool disposed")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ResumeMaxxer API",
    description=(
        "Backend for the AI-powered resume tailoring app. Stores a student's "
        "Master Vault and uses the Gemini API to generate 1-page, "
        "ATS-friendly resumes tailored to a specific job description."
    ),
    version="0.1.0",
    lifespan=lifespan,
    # Hide the interactive docs in production - they advertise the full API
    # surface to anyone who finds the host.
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
# The Vite frontend runs on a different origin (5173) from this API (8000), so
# every request from the browser is cross-origin and needs these headers.
#
# `allow_credentials=True` requires an explicit origin list - the wildcard "*"
# is rejected by browsers in that combination. We send a Better Auth JWT in an
# `Authorization` header rather than a cookie, but credentials stay on so the
# same setup keeps working if that ever changes.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    # Lets the browser cache the preflight (OPTIONS) response for 10 minutes.
    max_age=600,
)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["system"], summary="Liveness and database probe")
def health_check() -> JSONResponse:
    """Report whether the API is up and whether NeonDB is reachable.

    Returns HTTP 200 when the database answers, and HTTP 503 when it does not,
    so container orchestrators and uptime monitors can act on the status code
    alone without parsing the body.

    Neon suspends idle compute, so the very first call after a quiet period may
    take a second or two while the instance wakes up.
    """
    payload: dict[str, Any] = {
        "status": "ok",
        "environment": ENVIRONMENT,
        "version": app.version,
        "database": "ok",
    }

    try:
        # `SELECT 1` is the cheapest possible round trip that still proves the
        # credentials, TLS handshake and network path all work.
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Health check: database unreachable (%s)", exc)
        payload["status"] = "degraded"
        payload["database"] = "unreachable"
        return JSONResponse(
            content=payload,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return JSONResponse(content=payload, status_code=status.HTTP_200_OK)


@app.get("/", tags=["system"], summary="Service banner")
def root() -> dict[str, str]:
    """Tiny landing payload so hitting the bare host is not a 404."""
    return {
        "service": "ResumeMaxxer API",
        "version": app.version,
        "docs": "disabled in production" if IS_PRODUCTION else "/docs",
    }


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
# Every endpoint below requires a valid Better Auth JWT (enforced per-route by the
# `get_current_user` dependency). Only `/` and `/health` are public.
from routers import github, tailor, vault  # noqa: E402  (after app config)

app.include_router(vault.router, prefix="/api/vault", tags=["vault"])
app.include_router(github.router, prefix="/api/github", tags=["github"])
app.include_router(tailor.router, prefix="/api/tailor", tags=["tailor"])


if __name__ == "__main__":
    # Convenience entry point: `python main.py`. The canonical way to run the
    # server is still `uvicorn main:app --reload`.
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=not IS_PRODUCTION,
    )
