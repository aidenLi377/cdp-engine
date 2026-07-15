from __future__ import annotations

import sqlite3
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.database import get_db, init_db
from cdp_backend.user_store import UserStore


class AuthAndIsolationApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-auth-tests-")
        self.db_path = str(Path(self.temporary_directory.name) / "test.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "SECRET_KEY": "test-only-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        users = UserStore(self.db_path)
        self.alice = users.create_user("alice", "alice-password", "Alice")
        self.bob = users.create_user("bob", "bob-password", "Bob")
        self.alice_client = self.app.test_client()
        self.bob_client = self.app.test_client()

    def tearDown(self):
        self.temporary_directory.cleanup()

    @staticmethod
    def login(client, username: str, password: str):
        return client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )

    def test_login_gate_and_logout(self):
        anonymous = self.app.test_client()
        self.assertEqual(anonymous.get("/api/health").status_code, 200)
        denied = anonymous.get("/api/packages")
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(denied.get_json()["code"], "AUTH_REQUIRED")

        invalid = self.login(anonymous, "alice", "wrong-password")
        self.assertEqual(invalid.status_code, 401)
        self.assertEqual(invalid.get_json()["code"], "INVALID_CREDENTIALS")

        logged_in = self.login(anonymous, "alice", "alice-password")
        self.assertEqual(logged_in.status_code, 200)
        self.assertEqual(logged_in.get_json()["user"]["id"], self.alice["id"])
        self.assertEqual(anonymous.get("/api/auth/me").status_code, 200)
        self.assertEqual(anonymous.post("/api/auth/logout").status_code, 204)
        self.assertEqual(anonymous.get("/api/auth/me").status_code, 401)

    def test_private_solutions_are_isolated_and_publishing_stays_private(self):
        self.login(self.alice_client, "alice", "alice-password")
        self.login(self.bob_client, "bob", "bob-password")

        created = self.alice_client.post(
            "/api/solutions/drafts", json={"name": "Alice only", "nodes": []}
        ).get_json()
        alice_ids = {
            item["id"]
            for item in self.alice_client.get("/api/solutions?scope=mine&status=all").get_json()
        }
        bob_ids = {
            item["id"]
            for item in self.bob_client.get("/api/solutions?scope=mine&status=all").get_json()
        }
        self.assertIn(created["id"], alice_ids)
        self.assertNotIn(created["id"], bob_ids)
        self.assertEqual(
            self.bob_client.get(f"/api/solutions/{created['id']}").status_code, 404
        )

        published = self.alice_client.post(
            f"/api/solutions/{created['id']}/publish"
        ).get_json()
        self.assertEqual(published["status"], "published")
        self.assertEqual(published["visibility"], "private")
        public_ids = {
            item["id"]
            for item in self.bob_client.get("/api/solutions?scope=public&status=all").get_json()
        }
        self.assertNotIn(created["id"], public_ids)

    def test_public_solution_is_read_only_and_can_be_copied_to_mine(self):
        self.login(self.alice_client, "alice", "alice-password")
        self.login(self.bob_client, "bob", "bob-password")
        source = self.alice_client.post(
            "/api/solutions/drafts", json={"name": "Shared template", "nodes": []}
        ).get_json()
        with get_db(self.db_path) as conn:
            conn.execute(
                "UPDATE solutions SET visibility = 'public', owner_id = NULL WHERE id = ?",
                (source["id"],),
            )

        public_items = self.bob_client.get(
            "/api/solutions?scope=public&status=all"
        ).get_json()
        self.assertIn(source["id"], {item["id"] for item in public_items})
        forbidden = self.bob_client.put(
            f"/api/solutions/{source['id']}", json={"name": "Changed"}
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(forbidden.get_json()["code"], "PUBLIC_SOLUTION_READ_ONLY")

        copied_response = self.bob_client.post(
            f"/api/solutions/{source['id']}/duplicate"
        )
        self.assertEqual(copied_response.status_code, 201)
        copied = copied_response.get_json()
        self.assertEqual(copied["ownerId"], self.bob["id"])
        self.assertEqual(copied["visibility"], "private")
        self.assertEqual(copied["status"], "draft")
        self.assertIsNone(copied.get("folderId"))

    def test_private_folder_tree_is_isolated(self):
        self.login(self.alice_client, "alice", "alice-password")
        self.login(self.bob_client, "bob", "bob-password")
        parent = self.alice_client.post("/api/folders", json={"name": "Alice root"}).get_json()
        child = self.alice_client.post(
            "/api/folders", json={"name": "Alice child", "parentId": parent["id"]}
        ).get_json()

        alice_tree = self.alice_client.get("/api/folders?scope=mine").get_json()
        bob_tree = self.bob_client.get("/api/folders?scope=mine").get_json()
        self.assertEqual(alice_tree[0]["id"], parent["id"])
        self.assertEqual(alice_tree[0]["children"][0]["id"], child["id"])
        self.assertEqual(bob_tree, [])

        deleted = self.alice_client.delete(f"/api/folders/{parent['id']}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.alice_client.get("/api/folders?scope=mine").get_json(), [])

    def test_solution_cannot_be_attached_to_another_users_folder(self):
        self.login(self.alice_client, "alice", "alice-password")
        self.login(self.bob_client, "bob", "bob-password")
        bob_folder = self.bob_client.post("/api/folders", json={"name": "Bob only"}).get_json()

        create_response = self.alice_client.post(
            "/api/solutions/drafts",
            json={"name": "Forged folder", "nodes": [], "folderId": bob_folder["id"]},
        )
        self.assertEqual(create_response.status_code, 400)
        self.assertEqual(create_response.get_json()["code"], "INVALID_FOLDER")

        alice_solution = self.alice_client.post(
            "/api/solutions/drafts", json={"name": "Alice draft", "nodes": []}
        ).get_json()
        update_response = self.alice_client.put(
            f"/api/solutions/{alice_solution['id']}",
            json={"folderId": bob_folder["id"]},
        )
        self.assertEqual(update_response.status_code, 400)
        self.assertEqual(update_response.get_json()["code"], "INVALID_FOLDER")


class ExistingDatabaseMigrationTests(unittest.TestCase):
    def test_existing_rows_become_public_without_modifying_the_source_file(self):
        with TemporaryDirectory(prefix="cdp-migration-tests-") as directory:
            db_path = str(Path(directory) / "legacy.db")
            with closing(sqlite3.connect(db_path)) as conn:
                conn.executescript(
                    """
                    CREATE TABLE solutions (
                        id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'draft', source TEXT NOT NULL DEFAULT 'manual',
                        folder_id TEXT, default_crowd_name TEXT DEFAULT '', nodes TEXT,
                        custom_fields TEXT, workbench_field_ids TEXT, base_published_id TEXT,
                        derived_from_solution_id TEXT, derived_from_solution_version TEXT,
                        _version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL, published_at TEXT
                    );
                    CREATE TABLE folders (
                        id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
                        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                    );
                    INSERT INTO solutions (id, name, created_at, updated_at)
                    VALUES ('legacy-solution', 'Legacy', '2025-01-01', '2025-01-01');
                    INSERT INTO folders (id, name, created_at, updated_at)
                    VALUES ('legacy-folder', 'Legacy folder', '2025-01-01', '2025-01-01');
                    """
                )
                conn.commit()

            init_db(db_path)
            with closing(sqlite3.connect(db_path)) as conn:
                solution = conn.execute(
                    "SELECT visibility, owner_id FROM solutions WHERE id = 'legacy-solution'"
                ).fetchone()
                folder = conn.execute(
                    "SELECT visibility, owner_id FROM folders WHERE id = 'legacy-folder'"
                ).fetchone()
                user_version = conn.execute("PRAGMA user_version").fetchone()[0]
            self.assertEqual(solution, ("public", None))
            self.assertEqual(folder, ("public", None))
            self.assertEqual(user_version, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
