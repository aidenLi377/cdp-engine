from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

import migrate_json_to_sqlite as migration
from cdp_backend.database import init_db
from cdp_backend.user_store import UserStore


LEGACY_TASKS_DDL = """
CREATE TABLE tasks (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT '',
    crowd_name  TEXT DEFAULT '',
    tag_ids     TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    phase       INTEGER DEFAULT 0,
    phase_label TEXT DEFAULT '',
    progress    INTEGER DEFAULT 0,
    message     TEXT DEFAULT '',
    result      TEXT,
    crowd_count INTEGER,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""


class TaskMigrationOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.db_path = str(self.root / "legacy.db")
        self.runtime_dir = self.root / "runtime"
        self.runtime_dir.mkdir()
        self.env_patch = patch.dict(os.environ, {"CDP_DB_PATH": self.db_path})
        self.runtime_patch = patch.object(
            migration, "RUNTIME_DIR", str(self.runtime_dir)
        )
        self.env_patch.start()
        self.runtime_patch.start()

    def tearDown(self):
        self.runtime_patch.stop()
        self.env_patch.stop()
        self.temp_dir.cleanup()

    def create_legacy_database(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.executescript(LEGACY_TASKS_DDL)
            conn.commit()

    def initialize_legacy_database(self):
        try:
            init_db(self.db_path)
        except sqlite3.OperationalError as exc:
            self.fail(f"init_db must migrate owner_id before creating its index: {exc}")

    def run_migration(self, owner_username: str = "admin") -> int:
        try:
            return migration.migrate_tasks(owner_username)
        except TypeError as exc:
            self.fail(f"migrate_tasks must accept an owner username: {exc}")

    def write_json_task(self):
        payload = {
            "tasks": [
                {
                    "id": "json-task",
                    "name": "JSON task",
                    "status": "pending",
                    "tagIds": ["tag-1"],
                    "createdAt": "2026-07-15T00:00:00Z",
                    "updatedAt": "2026-07-15T00:00:00Z",
                }
            ]
        }
        (self.runtime_dir / "tasks.json").write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8"
        )

    def test_init_db_adds_owner_before_creating_owner_index(self):
        self.create_legacy_database()

        self.initialize_legacy_database()

        with closing(sqlite3.connect(self.db_path)) as conn:
            columns = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
            indexes = {row[1] for row in conn.execute("PRAGMA index_list(tasks)")}
        self.assertIn("owner_id", columns)
        self.assertIn("idx_tasks_owner_created", indexes)

    def test_migration_assigns_unowned_and_json_tasks_to_admin_idempotently(self):
        self.create_legacy_database()
        self.initialize_legacy_database()
        admin = UserStore(self.db_path).create_user("admin", "admin-password")
        bob = UserStore(self.db_path).create_user("bob", "bob-password")
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                """INSERT INTO tasks (
                    id, name, created_at, updated_at
                ) VALUES (?, ?, ?, ?)""",
                (
                    "database-task",
                    "Database task",
                    "2026-07-14T00:00:00Z",
                    "2026-07-14T00:00:00Z",
                ),
            )
            conn.execute(
                """INSERT INTO tasks (
                    id, owner_id, name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)""",
                (
                    "owned-task",
                    bob["id"],
                    "Bob task",
                    "2026-07-13T00:00:00Z",
                    "2026-07-13T00:00:00Z",
                ),
            )
            conn.commit()
        self.write_json_task()

        self.assertEqual(self.run_migration("admin"), 1)
        self.assertEqual(self.run_migration("admin"), 0)

        with closing(sqlite3.connect(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT id, owner_id FROM tasks ORDER BY id"
            ).fetchall()
        self.assertEqual(
            rows,
            [
                ("database-task", admin["id"]),
                ("json-task", admin["id"]),
                ("owned-task", bob["id"]),
            ],
        )

    def test_migration_rejects_a_missing_owner_before_writing(self):
        init_db(self.db_path)
        self.write_json_task()

        with self.assertRaisesRegex(ValueError, "missing-user"):
            self.run_migration("missing-user")
        with closing(sqlite3.connect(self.db_path)) as conn:
            count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
