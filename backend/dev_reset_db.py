"""
dev_reset_db.py
===============
DESTRUCTIVE development utility: drops every table this app owns and recreates
them from the current models.

Why this exists
---------------
`init_db()` calls `SQLModel.metadata.create_all`, which only ever CREATEs. It
will not ALTER a table whose columns changed, so after a schema change the app
starts fine and then fails on the first query against the stale table.

The Indian-education rework changed three tables:
  * `educations`  - replaced entirely (level/board/stream/year columns)
  * `experiences` - added `location`
  * `users`       - added phone, location, linkedin_url, github_url, portfolio_url

Run this ONCE against a development database to pick those up.

    python dev_reset_db.py

It refuses to run when ENVIRONMENT=production, and asks you to type the word
DELETE before touching anything. Once real users exist, delete this file and
use Alembic migrations instead - this script would destroy their vaults.
"""

from __future__ import annotations

import os
import sys

from sqlmodel import SQLModel

import models  # noqa: F401  - registers the tables on SQLModel.metadata
from database import get_engine

TABLES = [
    "bullets",
    "generated_resumes",
    "educations",
    "experiences",
    "projects",
    "users",
]


def main() -> int:
    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        print("Refusing to run: ENVIRONMENT=production.")
        return 1

    engine = get_engine()
    target = engine.url.render_as_string(hide_password=True)

    print("This will PERMANENTLY DELETE every row in these tables:")
    for table in TABLES:
        print(f"  - {table}")
    print(f"\nDatabase: {target}\n")

    if input('Type DELETE to confirm: ').strip() != "DELETE":
        print("Aborted. Nothing was changed.")
        return 1

    # drop_all resolves foreign-key order itself, so bullets/resumes go before
    # the users row they reference.
    SQLModel.metadata.drop_all(engine)
    print("Dropped.")

    SQLModel.metadata.create_all(engine)
    print("Recreated from the current models. Restart the backend.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
