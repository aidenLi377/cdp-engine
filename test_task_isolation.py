from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class TaskIsolationApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "tasks-api.db")
        with patch.dict(os.environ, {"FLASK_ENV": "development"}, clear=False):
            self.app, _ = create_app(
                {
                    "TESTING": True,
                    "DB_PATH": self.db_path,
                    "SECRET_KEY": "test-task-isolation-secret",
                }
            )

        users = UserStore(self.db_path)
        self.alice = users.create_user("alice", "alice-password", "Alice")
        self.bob = users.create_user("bob", "bob-password", "Bob")
        self.alice_client = self.app.test_client()
        self.bob_client = self.app.test_client()
        self.login(self.alice_client, "alice", "alice-password")
        self.login(self.bob_client, "bob", "bob-password")

    def tearDown(self):
        self.temp_dir.cleanup()

    def login(self, client, username: str, password: str):
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(response.status_code, 200)

    def create_task(self, client, name: str, **extra) -> dict:
        try:
            response = client.post("/api/tasks", json={"name": name, **extra})
        except TypeError as exc:
            self.fail(f"Task routes must pass the authenticated user to TaskStore: {exc}")
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def test_task_lists_only_include_the_authenticated_users_tasks(self):
        alice_task = self.create_task(
            self.alice_client,
            "Alice task",
            ownerId=self.bob["id"],
            owner_id=self.bob["id"],
        )
        bob_task = self.create_task(self.bob_client, "Bob task")

        alice_list = self.alice_client.get("/api/tasks").get_json()
        bob_list = self.bob_client.get("/api/tasks").get_json()
        self.assertEqual([item["id"] for item in alice_list], [alice_task["id"]])
        self.assertEqual([item["id"] for item in bob_list], [bob_task["id"]])
        self.assertNotIn("ownerId", alice_task)
        self.assertNotIn("owner_id", alice_task)

    def test_other_users_cannot_read_update_or_delete_a_task(self):
        alice_task = self.create_task(self.alice_client, "Alice task")
        task_url = f"/api/tasks/{alice_task['id']}"

        self.assertEqual(self.bob_client.get(task_url).status_code, 404)
        update = self.bob_client.put(
            f"{task_url}/progress", json={"status": "completed", "progress": 100}
        )
        self.assertEqual(update.status_code, 404)
        self.assertEqual(self.bob_client.delete(task_url).status_code, 404)

        remaining = self.alice_client.get(task_url)
        self.assertEqual(remaining.status_code, 200)
        self.assertEqual(remaining.get_json()["status"], "pending")


if __name__ == "__main__":
    unittest.main()
