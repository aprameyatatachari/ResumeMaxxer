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

import logging
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

logger = logging.getLogger("resumemaxxer.database")

# Vercel sets `VERCEL=1` in every build and runtime environment. It is the only
# signal needed here, and it keeps the pool sizing question out of
# `ENVIRONMENT`, which gates unrelated things like `create_all` and the docs UI.
IS_SERVERLESS: bool = bool(os.getenv("VERCEL"))

# --- Pool sizing -----------------------------------------------------------
# Two very different shapes, hence two sets of defaults.
#
# On a long-lived server, one process handles every request, so a pool of 5
# with burst room is right - connections are opened once and reused for the
# process's whole life.
#
# On Vercel each instance is one of many, and they come and go with traffic.
# Two limits bite:
#
#   * Neon caps total connections. 10 per instance times a few dozen instances
#     during a placement-season spike exhausts the database, and the failure
#     mode is every student seeing an error at once.
#   * A Vercel Function shares 1,024 file descriptors across its concurrent
#     executions, and every held socket counts against that.
#
# So the per-instance pool is deliberately tiny. It is not zero (`NullPool`)
# because Fluid compute reuses an instance across concurrent requests and keeps
# it warm - a pool of one saves the TLS handshake on the majority of calls
# while still letting bursts open a few more. `pool_recycle` is shorter than
# the default too: Neon idles connections out from its side, and a serverless
# instance sits idle far more of the time than a server does.
DEFAULT_POOL_SIZE = 1 if IS_SERVERLESS else 5
DEFAULT_MAX_OVERFLOW = 4 if IS_SERVERLESS else 5
DEFAULT_POOL_RECYCLE = 180 if IS_SERVERLESS else 300

POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", DEFAULT_POOL_SIZE))
MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", DEFAULT_MAX_OVERFLOW))
POOL_RECYCLE: int = int(os.getenv("DB_POOL_RECYCLE", DEFAULT_POOL_RECYCLE))


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

    * Ensure ``sslmode=require`` for REMOTE databases only
      Neon only accepts TLS connections, so a URL without the parameter gets it
      added. A database on localhost is left alone: local PostgreSQL usually
      has no TLS configured, and demanding it there fails the connection with
      "server does not support SSL connections" rather than falling back. An
      explicit ``sslmode`` in the URL always wins.
    """
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql://", 1)

    url = make_url(raw_url)

    # `make_url(...).query` is an immutable mapping; build a mutable copy.
    query = dict(url.query)
    if url.host not in {"localhost", "127.0.0.1", "::1"}:
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

    url = _normalise_database_url(DATABASE_URL)

    # Neon offers a direct endpoint and a pooled one (PgBouncer, host contains
    # "-pooler"). On a handful of long-lived processes either works; with
    # serverless instances coming and going, the direct endpoint runs out of
    # connections. This is the single most likely deployment misconfiguration,
    # and it fails under load rather than on the first request, so say so
    # loudly at startup instead of leaving it to be discovered in production.
    if IS_SERVERLESS and "-pooler" not in (make_url(url).host or ""):
        logger.warning(
            "DATABASE_URL points at Neon's DIRECT endpoint while running "
            "serverless. Use the pooled connection string (its host contains "
            "'-pooler') or the database will refuse connections under load."
        )

    return create_engine(
        url,
        echo=SQL_ECHO,
        # --- Pool settings (see the constants above for the reasoning) ----
        pool_size=POOL_SIZE,            # steady-state connections held open
        max_overflow=MAX_OVERFLOW,      # burst capacity above pool_size
        pool_timeout=30,                # seconds to wait for a free connection
        pool_recycle=POOL_RECYCLE,      # Neon idles connections out from its side
        pool_pre_ping=True,             # cheap SELECT 1 before reuse; kills stale sockets
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
