"""
database.py
===========
NeonDB (serverless PostgreSQL) connection layer for ResumeMaxxer.

Responsibilities
----------------
1. Load configuration from the environment (never hard-code secrets).
2. Normalise the Neon connection string into a SQLAlchemy-compatible URL.
3. Create a single, process-wide SQLModel/SQLAlchemy `Engine` tuned for a
   *serverless* Postgres backend.
4. Expose a FastAPI dependency (`get_session`) that yields a scoped session.

Why the extra care around pooling?
----------------------------------
Neon puts your compute to sleep when idle and terminates connections from its
side. A long-lived connection pool therefore accumulates dead sockets. We guard
against that with `pool_pre_ping` (validates a connection before handing it out)
and `pool_recycle` (proactively discards connections older than N seconds).
"""

from __future__ import annotations

import os
from collections.abc import Generator
from functools import lru_cache

from dotenv import load_dotenv
from sqlalchemy.engine import Engine, make_url
from sqlmodel import Session, SQLModel, create_engine

# ---------------------------------------------------------------------------
# 1. Environment loading
# ---------------------------------------------------------------------------
# `load_dotenv` is a no-op in production (Render/Fly/Railway inject real env
# vars); locally it reads `backend/.env`. `override=False` means a genuine
# environment variable always beats the file — important for CI and prod.
load_dotenv(override=False)

# The raw Neon connection string, e.g.
#   postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
DATABASE_URL: str | None = os.getenv("DATABASE_URL")

# Echo every emitted SQL statement to stdout. Handy while modelling; noisy in
# production, so it is opt-in via env var.
SQL_ECHO: bool = os.getenv("SQL_ECHO", "false").lower() in {"1", "true", "yes"}


# ---------------------------------------------------------------------------
# 2. URL normalisation
# ---------------------------------------------------------------------------
def _normalise_database_url(raw_url: str) -> str:
    """
    Make a Neon-provided connection string safe for SQLAlchemy 2.0.

    Two fixes are applied:

    * ``postgres://`` -> ``postgresql://``
      Neon (and Heroku-style providers) still emit the legacy ``postgres://``
      scheme, which SQLAlchemy 2.0 refuses to parse.

    * Ensure ``sslmode=require``
      Neon only accepts TLS connections. If the developer pasted a URL without
      the query parameter, we add it rather than failing at connect time.
    """
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql://", 1)

    url = make_url(raw_url)

    # `make_url(...).query` is an immutable mapping; build a mutable copy.
    query = dict(url.query)
    query.setdefault("sslmode", "require")

    return url.set(query=query).render_as_string(hide_password=False)


# ---------------------------------------------------------------------------
# 3. Engine construction
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """
    Build (once) and return the process-wide SQLAlchemy engine.

    `lru_cache` gives us lazy, thread-safe singleton semantics: the engine is
    only created the first time it is actually needed, which keeps import-time
    side effects out of test collection and lets tests override `DATABASE_URL`
    before the first call.
    """
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy backend/.env.example to backend/.env "
            "and paste your NeonDB connection string into it."
        )

    return create_engine(
        _normalise_database_url(DATABASE_URL),
        echo=SQL_ECHO,
        # --- Serverless-friendly pool settings ---------------------------
        pool_size=5,          # steady-state connections held open
        max_overflow=5,       # burst capacity above pool_size
        pool_timeout=30,      # seconds to wait for a free connection
        pool_recycle=300,     # drop connections older than 5 min (Neon idles out)
        pool_pre_ping=True,   # cheap SELECT 1 before reuse; kills stale sockets
        # Fail fast instead of hanging if Neon's compute is cold/unreachable.
        connect_args={"connect_timeout": 10},
    )


# ---------------------------------------------------------------------------
# 4. Schema creation
# ---------------------------------------------------------------------------
def init_db() -> None:
    """
    Create any tables that do not yet exist.

    Importing `models` here (rather than at module top level) keeps this module
    free of circular-import risk and guarantees every SQLModel subclass has been
    registered on `SQLModel.metadata` *before* `create_all` runs.

    The backend uses a flat module layout (no package), so run the server from
    inside this directory: `cd backend && uvicorn main:app --reload`.

    NOTE: `create_all` never ALTERs existing tables. Once the schema stabilises,
    swap this for Alembic migrations before the first real deploy.
    """
    import models  # noqa: F401  (import registers the table metadata)

    SQLModel.metadata.create_all(get_engine())


# ---------------------------------------------------------------------------
# 5. FastAPI dependency
# ---------------------------------------------------------------------------
def get_session() -> Generator[Session, None, None]:
    """
    Yield a database session for the lifetime of a single request.

    Usage in a router::

        @router.get("/vault")
        def read_vault(session: Session = Depends(get_session)):
            ...

    The `with` block guarantees the connection is returned to the pool even if
    the endpoint raises.
    """
    with Session(get_engine()) as session:
        yield session
