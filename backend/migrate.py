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
`SQLModel.metadata.create_all` only ever CREATEs. It will:

    * create tables that do not exist

It will NOT:

    * add, drop or alter a column on a table that already exists
    * change a type, a constraint or an index
    * delete anything

That makes it safe to re-run - it is idempotent - but it also means it CANNOT
carry out a schema change to an existing table. This project has already been
bitten by exactly that: `column users.phone does not exist`, after `phone` was
added to the model and `create_all` silently did nothing. The fix that time was
to drop the table, which is only acceptable before launch.

Once real students have data, this script stops being enough and the project
needs Alembic. See the "Known gaps" section of ARCHITECTURE.md.

Better Auth's own tables (`user`, `session`, `account`, `verification`, `jwks`)
are NOT created here - they belong to the auth service and are created by
`npm run migrate` in `auth-server/`. Both steps are needed on a new database.
"""

from __future__ import annotations

import logging
import os
import sys

from sqlalchemy import inspect

from database import get_engine

# Importing `models` is what registers every table on `SQLModel.metadata`.
# Without it `create_all` would run happily and create nothing at all.
import models  # noqa: F401
from sqlmodel import SQLModel

logging.basicConfig(level="INFO", format="%(levelname)-8s %(message)s")
logger = logging.getLogger("resumemaxxer.migrate")


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
        logger.info("Created: %s", ", ".join(created))
    else:
        logger.info("Nothing to create - schema already matches.")

    # A table that exists but whose columns drifted is the failure mode this
    # script cannot fix, so name the risk rather than implying all is well.
    unchanged = sorted(expected & before)
    if unchanged:
        logger.info(
            "Left untouched (create_all never ALTERs): %s", ", ".join(unchanged)
        )
        logger.info(
            "If a model gained or changed a column, this script did NOT apply "
            "it. Verify against the model before trusting the deployment."
        )

    missing = sorted(expected - after)
    if missing:
        logger.error("Still missing after create_all: %s", ", ".join(missing))
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
