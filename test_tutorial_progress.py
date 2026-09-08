from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class TutorialProgressApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-tutorial-progress-tests-")
        root = Path(self.temporary_directory.name)
        self.db_path = str(root / "tutorial-progress.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "BACKUP_DIR": str(root / "backups"),
                "FEEDBACK_UPLOAD_DIR": str(root / "feedback_uploads"),
                "ANNOUNCEMENT_UPLOAD_DIR": str(root / "announcement_uploads"),
                "SECRET_KEY": "tutorial-progress-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        users = UserStore(self.db_path)
        users.create_user("learner-a", "learner-password", "Learner A")
        users.create_user("learner-b", "learner-password", "Learner B")
        self.learner_a = self._client("learner-a")
        self.learner_b = self._client("learner-b")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def _client(self, username: str):
        client = self.app.test_client()
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": "learner-password"},
        )
        self.assertEqual(response.status_code, 200)
        return client

    def test_completion_is_idempotent_and_scoped_to_the_signed_in_account(self):
        tutorial_id = "category-item-behavior-split"
        self.assertEqual(self.learner_a.get("/api/tutorial-progress").get_json(), [])

        first = self.learner_a.post(f"/api/tutorial-progress/{tutorial_id}/complete")
        self.assertEqual(first.status_code, 200)
        first_item = first.get_json()
        self.assertEqual(first_item["tutorialId"], tutorial_id)

        second = self.learner_a.post(f"/api/tutorial-progress/{tutorial_id}/complete")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.get_json()["completedAt"], first_item["completedAt"])
        self.assertEqual(len(self.learner_a.get("/api/tutorial-progress").get_json()), 1)
        self.assertEqual(self.learner_b.get("/api/tutorial-progress").get_json(), [])

    def test_invalid_tutorial_id_is_rejected(self):
        response = self.learner_a.post("/api/tutorial-progress/NOT_VALID!/complete")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "INVALID_TUTORIAL_ID")


if __name__ == "__main__":
    unittest.main()
