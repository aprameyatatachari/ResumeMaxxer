"""
Shared pytest fixtures.

Everything runs against in-memory SQLite, so the suite needs no database, no
network and no API keys - which is what lets CI run it in seconds. The schema
is identical to production apart from `resume_json`, which is JSONB on
PostgreSQL and JSON on SQLite via the variant in `models.JSONBType`.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

# Must be set before importing anything that builds the engine at import time.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("BETTER_AUTH_URL", "http://localhost:3000")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

import main  # noqa: E402
from auth import get_current_user  # noqa: E402
from database import get_session  # noqa: E402
from models import User  # noqa: E402


@pytest.fixture(name="engine")
def engine_fixture():
    """A fresh in-memory database per test.

    `StaticPool` plus a shared connection is required: without it every
    connection gets its own empty `:memory:` database, so the tables created
    here would be invisible to the request being tested.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session")
def session_fixture(engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session


@pytest.fixture(name="user")
def user_fixture(session: Session) -> User:
    """The signed-in student for authenticated tests."""
    user = User(
        id="user_primary",
        email="ananya@vit.ac.in",
        first_name="Ananya",
        last_name="Krishnan",
        phone="+91 98765 43210",
        location="Bengaluru, Karnataka",
        github_url="github.com/ananyak",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="other_user")
def other_user_fixture(session: Session) -> User:
    """A second student, used to prove rows are scoped by owner."""
    user = User(id="user_other", email="someone@else.edu", first_name="Someone")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="client")
def client_fixture(session: Session, user: User) -> Iterator[TestClient]:
    """A client authenticated as `user`.

    JWT verification is bypassed here on purpose: it is covered directly in
    `test_auth.py` against a real signed token, and re-doing it for every
    endpoint would only test the override.
    """
    main.app.dependency_overrides[get_session] = lambda: session
    main.app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()


@pytest.fixture(name="anon_client")
def anon_client_fixture(session: Session) -> Iterator[TestClient]:
    """A client with no credentials - only `get_session` is overridden, so the
    real auth dependency runs and must reject the request."""
    main.app.dependency_overrides[get_session] = lambda: session
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()
