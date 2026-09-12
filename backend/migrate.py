"""
migrate.py
==========
Creates the API's tables. Run once against a new database, by hand.

    cd backend
    DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" python migrate.py

Why this is not automatic
-------------------------
`main.py` calls `init_db()` on startup in development only - production skips
it deliberately. A serverless deployment runs many instances that start
concurrently, and having each of them race to issue DDL is a good way to
deadlock a fresh database. It also means a bad model change cannot reshape
production just because someone deployed.

So schema changes are a deliberate, separate step. This script is that step.

What it does and does not do
----------------------------
Two passes, both additive and both idempotent:

1. `create_all` creates any table that does not exist.
2. New COLUMNS on tables that already exist are added with `ALTER TABLE`.

The second pass is here because `create_all` does not do it, and the gap has
bitten this project twice. First as `column users.phone does not exist`, after
`phone` was added to the model; then again while adding the free-tailoring
quota, when `column users.free_runs_used does not exist` took down every
authenticated endpoint on a database whose `users` table already existed. Both
times the code was right, the deploy was clean, and the app was broken - which
is the worst shape a failure can take.

What this still will NOT do, on purpose:

    * drop a column, or a table
    * change a column's type, constraint or index
    * rename anything
    * backfill data beyond the DEFAULT applied when a column is added

Every one of those is destructive or ambiguous, and guessing is worse than
refusing. When one is needed, this script reports it and stops rather than
improvising - that is the point at which the project needs Alembic. See the
"Known gaps" section of ARCHITECTURE.md.

Better Auth's own tables (`user`, `session`, `account`, `verification`, `jwks`)
are NOT created here - they belong to the auth service and are created by
`npm run migrate` in `auth-server/`. Both steps are needed on a new database.
"""

from __future__ import annotations

import logging
import os
import sys

from sqlalchemy import inspect, text

from database import get_engine

# Importing `models` is what registers every table on `SQLModel.metadata`.
# Without it `create_all` would run happily and create nothing at all.
import models  # noqa: F401
from sqlmodel import SQLModel

logging.basicConfig(level="INFO", format="%(levelname)-8s %(message)s")
logger = logging.getLogger("resumemaxxer.migrate")


def _column_ddl(column, dialect) -> str:
    """The `<name> <type> [NOT NULL] [DEFAULT x]` fragment for one new column.

    The type is rendered by the dialect rather than hard-coded, so a
    `JSONB`-with-SQLite-variant column or an enum-as-VARCHAR comes out exactly
    as `create_all` would have written it.

    NOT NULL needs care. A model default like `Field(default=0)` is applied in
    Python, so the database column has no server default - and
    `ADD COLUMN ... NOT NULL` with no default fails outright on a table that
    already has rows. So a scalar Python default is promoted to a real SQL
    DEFAULT here, which both makes the ALTER legal and backfills the existing
    rows in the same statement.
    """
    rendered_type = column.type.compile(dialect=dialect)
    parts = [f"{column.name} {rendered_type}"]

    default = None
    if column.server_default is not None:
        default = column.server_default.arg
    elif column.default is not None and not getattr(
        column.default, "is_callable", False
    ):
        # `default.arg` holds the scalar for a plain `default=0`; a callable
        # (like `default_factory=utcnow`) cannot be expressed in SQL and is
        # skipped, which is why the nullability check below can still fail.
        default = getattr(column.default, "arg", None)

    if default is not None:
        literal = default
        if isinstance(literal, bool):
            rendered_default = "true" if literal else "false"
        elif isinstance(literal, (int, float)):
            rendered_default = str(literal)
        else:
            escaped = str(literal).replace("'", "''")
            rendered_default = f"'{escaped}'"
        parts.append(f"DEFAULT {rendered_default}")

    if not column.nullable:
        if default is None:
            # Refuse rather than emit DDL that fails on a populated table, or
            # silently relax the column to nullable and diverge from the model.
            raise RuntimeError(
                f"Cannot add NOT NULL column {column.table.name}.{column.name} "
                "with no default: existing rows would have nothing to put in "
                "it. Give the field a default, or write a migration by hand."
            )
        parts.append("NOT NULL")

    return " ".join(parts)


def _add_missing_columns(engine) -> tuple[list[str], list[str]]:
    """Add columns the models declare but the database lacks.

    Returns (added, problems). Nothing is dropped, retyped or renamed - a
    column present in the database but absent from the models is reported and
    left exactly where it is, because the safe reading of that is "an older
    deploy is still serving traffic", not "delete it".
    """
    inspector = inspect(engine)
    live_tables = set(inspector.get_table_names())

    added: list[str] = []
    problems: list[str] = []

    with engine.begin() as connection:
        for table_name, table in SQLModel.metadata.tables.items():
            if table_name not in live_tables:
                continue  # create_all just made it; nothing to reconcile

            existing = {c["name"] for c in inspector.get_columns(table_name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                try:
                    ddl = _column_ddl(column, engine.dialect)
                except RuntimeError as exc:
                    problems.append(str(exc))
                    continue

                logger.info("ALTER TABLE %s ADD COLUMN %s", table_name, ddl)
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {ddl}"))
                added.append(f"{table_name}.{column.name}")

            # Reported, never acted on.
            orphans = existing - {c.name for c in table.columns}
            for orphan in sorted(orphans):
                problems.append(
                    f"{table_name}.{orphan} exists in the database but not in "
                    "the models. Left alone - drop it by hand once you are "
                    "sure nothing is still reading it."
                )

    return added, problems


def main() -> int:
    if not os.getenv("DATABASE_URL"):
        logger.error(
            "DATABASE_URL is not set. Pass the target database explicitly - "
            "this script writes schema, so it should never be ambiguous which "
            "database it is pointed at."
        )
        return 1

    engine = get_engine()

    # Report before and after rather than just "done". When this is run against
    # production the operator wants to see exactly what changed, and an empty
    # diff is the expected result of a re-run.
    before = set(inspect(engine).get_table_names())
    expected = set(SQLModel.metadata.tables)

    logger.info("Database: %s", engine.url.render_as_string(hide_password=True))
    logger.info("Tables already present: %s", ", ".join(sorted(before)) or "(none)")

    SQLModel.metadata.create_all(engine)

    after = set(inspect(engine).get_table_names())
    created = sorted(after - before)

    if created:
        logger.info("Created tables: %s", ", ".join(created))
    else:
        logger.info("No new tables.")

    missing = sorted(expected - after)
    if missing:
        logger.error("Still missing after create_all: %s", ", ".join(missing))
        return 1

    # --- Pass 2: columns on tables that already existed -------------------
    added, problems = _add_missing_columns(engine)

    if added:
        logger.info("Added columns: %s", ", ".join(added))
    else:
        logger.info("No new columns.")

    for problem in problems:
        logger.warning("%s", problem)

    # Prove it rather than assume it. The whole reason this script exists is
    # that a clean-looking run used to leave the schema broken, so the last
    # thing it does is re-read the database and check every modelled column is
    # really there.
    final = inspect(engine)
    unresolved: list[str] = []
    for table_name, table in SQLModel.metadata.tables.items():
        live = {c["name"] for c in final.get_columns(table_name)}
        for column in table.columns:
            if column.name not in live:
                unresolved.append(f"{table_name}.{column.name}")

    if unresolved:
        logger.error(
            "These columns are still missing, so the app WILL fail at runtime: "
            "%s",
            ", ".join(sorted(unresolved)),
        )
        return 1

    logger.info("Schema matches the models.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
