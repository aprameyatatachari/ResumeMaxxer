"""
Connection-string normalisation.

Small surface, but both branches have bitten: the legacy scheme breaks
SQLAlchemy 2.0 outright, and forcing TLS at a local database fails the
connection with "server does not support SSL connections" - which is what
broke the first CI run against a plain PostgreSQL container.
"""

from __future__ import annotations

import pytest

from database import _normalise_database_url


@pytest.mark.parametrize(
    "raw, expected",
    [
        pytest.param(
            "postgres://u:p@ep-x.aws.neon.tech/neondb",
            "postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require",
            id="legacy-scheme-rewritten-and-tls-added-for-remote",
        ),
        pytest.param(
            "postgresql://u:p@localhost:5432/db",
            "postgresql://u:p@localhost:5432/db",
            id="local-host-left-alone",
        ),
        pytest.param(
            "postgresql://u:p@127.0.0.1:5432/db",
            "postgresql://u:p@127.0.0.1:5432/db",
            id="local-ip-left-alone",
        ),
        pytest.param(
            "postgresql://u:p@localhost/db?sslmode=require",
            "postgresql://u:p@localhost/db?sslmode=require",
            id="explicit-sslmode-wins-locally",
        ),
        pytest.param(
            "postgresql://u:p@ep-x.aws.neon.tech/db?sslmode=disable",
            "postgresql://u:p@ep-x.aws.neon.tech/db?sslmode=disable",
            id="explicit-sslmode-wins-remotely",
        ),
    ],
)
def test_connection_strings_are_normalised(raw, expected):
    assert _normalise_database_url(raw) == expected
