from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from cdp_backend.task_store import TaskNotFoundError, TaskStore


class TaskStoreOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "tasks.db")
        self.store = TaskStore(self.db_path)
        self.alice_id = "user_alice"
        self.bob_id = "user_bob"

    def tearDown(self):
        self.temp_dir.cleanup()

    def create_task(self, name: str, user_id: str, **extra) -> dict:
        try:
            return self.store.create_task({"name": name, **extra}, user_id)
        except TypeError as exc:
            self.fail(f"TaskStore.create_task must require a user_id: {exc}")

    def test_create_uses_authenticated_owner_and_hides_internal_owner(self):
        task = self.create_task(
            "Alice task",
            self.alice_id,
            ownerId=self.bob_id,
            owner_id=self.bob_id,
        )

        self.assertNotIn("ownerId", task)
        self.assertNotIn("owner_id", task)
        with closing(sqlite3.connect(self.db_path)) as conn:
            stored_owner = conn.execute(
                "SELECT owner_id FROM tasks WHERE id = ?", (task["id"],)
            ).fetchone()[0]
        self.assertEqual(stored_owner, self.alice_id)

    def test_list_and_get_only_return_the_owners_tasks(self):
        alice_task = self.create_task("Alice task", self.alice_id)
        bob_task = self.create_task("Bob task", self.bob_id)

        self.assertEqual(
            [item["id"] for item in self.store.list_tasks(self.alice_id)],
            [alice_task["id"]],
        )
        self.assertEqual(
            [item["id"] for item in self.store.list_tasks(self.bob_id)],
            [bob_task["id"]],
        )
        self.assertIsNone(self.store.get_task(alice_task["id"], self.bob_id))
        self.assertEqual(
            self.store.get_task(alice_task["id"], self.alice_id)["id"],
            alice_task["id"],
        )

    def test_update_and_delete_reject_other_users(self):
        alice_task = self.create_task("Alice task", self.alice_id)

        with self.assertRaises(TaskNotFoundError):
            self.store.update_progress(
                alice_task["id"], {"status": "completed"}, self.bob_id
            )
        self.assertFalse(self.store.delete_task(alice_task["id"], self.bob_id))
        self.assertEqual(
            self.store.get_task(alice_task["id"], self.alice_id)["status"],
            "pending",
        )

        updated = self.store.update_progress(
            alice_task["id"], {"status": "completed"}, self.alice_id
        )
        self.assertEqual(updated["status"], "completed")
        self.assertTrue(self.store.delete_task(alice_task["id"], self.alice_id))
        self.assertIsNone(self.store.get_task(alice_task["id"], self.alice_id))


if __name__ == "__main__":
    unittest.main()
