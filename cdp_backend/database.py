"""SQLite database module — shared connection management and schema.

Uses WAL mode for concurrent read safety across gunicorn workers.
Each store creates a short-lived connection per operation — SQLite
connections are cheap (file-based, no network handshake).
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager

from .constants import DB_PATH

DDL = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL DEFAULT '',
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS solutions (
    id                          TEXT PRIMARY KEY,
    name                        TEXT NOT NULL DEFAULT '',
    status                      TEXT NOT NULL DEFAULT 'draft'
                                CHECK(status IN ('draft', 'published')),
    source                      TEXT NOT NULL DEFAULT 'manual',
    folder_id                   TEXT,
    default_crowd_name          TEXT DEFAULT '',
    nodes                       TEXT,  -- JSON
    custom_fields               TEXT,  -- JSON
    workbench_field_ids         TEXT,  -- JSON
    base_published_id           TEXT,
    derived_from_solution_id    TEXT,
    derived_from_solution_version TEXT,
    _version                    INTEGER NOT NULL DEFAULT 1,
    owner_id                    TEXT,
    visibility                  TEXT NOT NULL DEFAULT 'public'
                                CHECK(visibility IN ('public', 'private')),
    created_by                  TEXT,
    updated_by                  TEXT,
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL,
    published_at                TEXT
);

CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    parent_id   TEXT,
    owner_id    TEXT,
    visibility  TEXT NOT NULL DEFAULT 'public'
                CHECK(visibility IN ('public', 'private')),
    created_by  TEXT,
    updated_by  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT '',
    crowd_name  TEXT DEFAULT '',
    tag_ids     TEXT,  -- JSON
    status      TEXT NOT NULL DEFAULT 'pending',
    phase       INTEGER DEFAULT 0,
    phase_label TEXT DEFAULT '',
    progress    INTEGER DEFAULT 0,
    message     TEXT DEFAULT '',
    result      TEXT,  -- JSON
    crowd_count INTEGER,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_solutions_status ON solutions(status);
CREATE INDEX IF NOT EXISTS idx_solutions_folder ON solutions(folder_id);
CREATE INDEX IF NOT EXISTS idx_solutions_updated ON solutions(updated_at);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
"""

POST_MIGRATION_DDL = """
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_solutions_scope ON solutions(visibility, owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_folders_scope ON folders(visibility, owner_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_created ON tasks(owner_id, created_at);
"""

MIGRATION_COLUMNS = {
    "solutions": {
        "owner_id": "TEXT",
        "visibility": "TEXT NOT NULL DEFAULT 'public'",
        "created_by": "TEXT",
        "updated_by": "TEXT",
    },
    "folders": {
        "owner_id": "TEXT",
        "visibility": "TEXT NOT NULL DEFAULT 'public'",
        "created_by": "TEXT",
        "updated_by": "TEXT",
    },
    "tasks": {
        "owner_id": "TEXT",
    },
}


def _resolve_path(db_path: str | None = None) -> str:
    return db_path or os.environ.get("CDP_DB_PATH") or DB_PATH


def _ensure_dir(db_path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)


@contextmanager
def get_db(db_path: str | None = None) -> sqlite3.Connection:
    """Yield a transactional SQLite connection for one store operation."""
    resolved_path = _resolve_path(db_path)
    _ensure_dir(resolved_path)
    conn = sqlite3.connect(resolved_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def init_db(db_path: str | None = None) -> None:
    """Create and minimally migrate the SQLite schema. Idempotent."""
    with get_db(db_path) as conn:
        conn.executescript(DDL)
        for table, columns in MIGRATION_COLUMNS.items():
            _ensure_columns(conn, table, columns)
        conn.executescript(POST_MIGRATION_DDL)
        conn.execute("PRAGMA user_version = 1")
