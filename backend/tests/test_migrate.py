"""
The schema migration.

This is the script that stands between a model change and a production outage,
and the specific outage it prevents has happened twice in this project:
`create_all` creates tables but never adds a column to a table that already
exists, so a clean-looking deploy leaves every authenticated endpoint throwing
`column users.<new thing> does not exist`.

The tests run against SQLite, which supports `ALTER TABLE ... ADD COLUMN`, so
the real DDL path is exercised rather than mocked.
"""

from __future__ import annotations

import pytest
from sqlalchemy import Column, Date, Integer, String, inspect, text
from sqlmodel import SQLModel, create_engine
from sqlalchemy.pool import StaticPool

import migrate


@pytest.fixture(name="fresh_engine")
def fresh_engine_fixture():
    """An empty in-memory database that survives across connections."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield engine
    engine.dispose()


# ---------------------------------------------------------------------------
# Rendering one column's DDL
# ---------------------------------------------------------------------------
def _ddl(column, engine) -> str:
    """Render one column's ADD COLUMN fragment for this dialect."""
    return migrate._column_ddl(column, engine.dialect)


def test_a_nullable_column_renders_without_a_default(fresh_engine):
    from sqlalchemy import MetaData, Table

    table = Table("t", MetaData(), Column("added", Date(), nullable=True))
    assert _ddl(table.c.added, fresh_engine) == "added DATE"


def test_a_not_null_column_carries_its_default_so_existing_rows_survive(
    fresh_engine,
):
    """`ADD COLUMN ... NOT NULL` with no default fails outright on a populated
    table. A Python-side default is promoted to a real SQL DEFAULT, which makes
    the statement legal and backfills the existing rows at the same time."""
    from sqlalchemy import MetaData, Table

    table = Table(
        "t", MetaData(), Column("count", Integer(), nullable=False, default=0)
    )
    ddl = _ddl(table.c.count, fresh_engine)

    assert "DEFAULT 0" in ddl
    assert "NOT NULL" in ddl


def test_a_string_default_is_quoted_and_escaped(fresh_engine):
    from sqlalchemy import MetaData, Table

    table = Table(
        "t",
        MetaData(),
        Column("label", String(20), nullable=False, default="it's"),
    )
    # Doubling the quote is what keeps a default with an apostrophe from
    # producing a syntax error - or worse, being interpretable as more SQL.
    assert "DEFAULT 'it''s'" in _ddl(table.c.label, fresh_engine)


def test_a_not_null_column_with_no_default_is_refused(fresh_engine):
    """Refusing beats emitting DDL that fails on a populated table, and beats
    silently relaxing the column to nullable so it no longer matches the model."""
    from sqlalchemy import MetaData, Table

    table = Table("t", MetaData(), Column("required", String(20), nullable=False))

    with pytest.raises(RuntimeError, match="no default"):
        _ddl(table.c.required, fresh_engine)


# ---------------------------------------------------------------------------
# Reconciling a real database
# ---------------------------------------------------------------------------
def test_missing_columns_are_added_to_an_existing_populated_table(fresh_engine):
    """The exact failure this script exists for, reproduced end to end.

    A `users` table is created WITHOUT the quota columns and given a row, which
    is the state a deployed database is in the moment the models gain a field.
    """
    with fresh_engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE users ("
                " id VARCHAR(255) PRIMARY KEY,"
                " email VARCHAR(320),"
                " first_name VARCHAR(100),"
                " last_name VARCHAR(100),"
                " phone VARCHAR(32),"
                " location VARCHAR(255),"
                " linkedin_url VARCHAR(512),"
                " github_url VARCHAR(512),"
                " portfolio_url VARCHAR(512),"
                " created_at DATETIME"
                ")"
            )
        )
        connection.execute(
            text("INSERT INTO users (id, email) VALUES ('u1', 'a@b.test')")
        )

    before = {c["name"] for c in inspect(fresh_engine).get_columns("users")}
    assert "free_runs_used" not in before

    added, problems = migrate._add_missing_columns(fresh_engine)

    assert "users.free_runs_used" in added
    assert "users.free_runs_week" in added
    assert not [p for p in problems if "free_runs" in p]

    # And the existing row got the default rather than a NULL in a NOT NULL
    # column, which is what would have made the ALTER fail.
    with fresh_engine.connect() as connection:
        row = connection.execute(
            text("SELECT free_runs_used, free_runs_week FROM users WHERE id = 'u1'")
        ).one()
    assert row[0] == 0
    assert row[1] is None


def test_running_twice_changes_nothing_the_second_time(fresh_engine):
    """Idempotent, so it is safe to run on every deploy - which is the only way
    it actually protects anything."""
    SQLModel.metadata.create_all(fresh_engine)

    first_added, _ = migrate._add_missing_columns(fresh_engine)
    second_added, _ = migrate._add_missing_columns(fresh_engine)

    # create_all already made every table complete, so there was nothing to add
    # even on the first pass.
    assert first_added == []
    assert second_added == []


def test_an_unknown_column_is_reported_but_never_dropped(fresh_engine):
    """A column in the database but not in the models most likely means an
    older deploy is still serving traffic. Dropping it would break that
    deploy, so it is reported and left alone."""
    SQLModel.metadata.create_all(fresh_engine)
    with fresh_engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN legacy_flag INTEGER"))

    added, problems = migrate._add_missing_columns(fresh_engine)

    assert added == []
    assert any("legacy_flag" in problem for problem in problems)
    # Still there.
    columns = {c["name"] for c in inspect(fresh_engine).get_columns("users")}
    assert "legacy_flag" in columns


def test_every_modelled_column_exists_after_a_full_run(fresh_engine, monkeypatch):
    """What `main()` asserts before reporting success: the schema is re-read and
    checked, rather than assumed from the fact that no statement errored."""
    monkeypatch.setattr(migrate, "get_engine", lambda: fresh_engine)
    monkeypatch.setenv("DATABASE_URL", "sqlite://")

    assert migrate.main() == 0

    inspector = inspect(fresh_engine)
    for table_name, table in SQLModel.metadata.tables.items():
        live = {c["name"] for c in inspector.get_columns(table_name)}
        for column in table.columns:
            assert column.name in live, f"{table_name}.{column.name} missing"


def test_the_quota_columns_are_actually_in_the_model():
    """A guard on the guard: if these were renamed without the rest of the
    quota code following, every test above would still pass while the feature
    was broken."""
    columns = {c.name for c in SQLModel.metadata.tables["users"].columns}
    assert {"free_runs_used", "free_runs_week"} <= columns
