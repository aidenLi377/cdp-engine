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

    def test_checkpoint_is_saved_per_account_and_removed_on_completion(self):
        tutorial_id = "category-item-behavior-split"
        payload = {
            "stepId": "select-behavior",
            "stepIndex": 3,
            "stepTitle": "选择行为",
            "appMode": "workbench",
            "context": {"nodeCount": 1},
            "sessionSnapshot": {"cdp.session.workbench.v1": "saved"},
        }
        saved = self.learner_a.put(
            f"/api/tutorial-checkpoints/{tutorial_id}", json=payload
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.get_json()["stepId"], "select-behavior")
        self.assertEqual(saved.get_json()["context"]["nodeCount"], 1)
        self.assertEqual(
            saved.get_json()["stepCheckpoints"]["select-behavior"]["stepIndex"], 3
        )
        self.assertEqual(len(self.learner_a.get("/api/tutorial-checkpoints").get_json()), 1)
        self.assertEqual(self.learner_b.get("/api/tutorial-checkpoints").get_json(), [])

        completed = self.learner_a.post(
            f"/api/tutorial-progress/{tutorial_id}/complete"
        )
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(self.learner_a.get("/api/tutorial-checkpoints").get_json(), [])

    def test_each_reached_step_keeps_its_own_recovery_snapshot(self):
        tutorial_id = "dmp-batch-profile-comparison"
        for index, step_id in enumerate(("open-task-center", "select-dmp-tags")):
            response = self.learner_a.put(
                f"/api/tutorial-checkpoints/{tutorial_id}",
                json={
                    "stepId": step_id,
                    "stepIndex": index,
                    "stepTitle": step_id,
                    "appMode": "task-center",
                    "context": {"selectedTagIds": [str(index)]},
                    "sessionSnapshot": {"checkpoint": step_id},
                },
            )
            self.assertEqual(response.status_code, 200)

        item = self.learner_a.get("/api/tutorial-checkpoints").get_json()[0]
        self.assertEqual(item["stepId"], "select-dmp-tags")
        self.assertEqual(set(item["stepCheckpoints"]), {
            "open-task-center",
            "select-dmp-tags",
        })
        self.assertEqual(
            item["stepCheckpoints"]["open-task-center"]["sessionSnapshot"],
            {"checkpoint": "open-task-center"},
        )

    def test_checkpoint_rejects_invalid_shapes(self):
        response = self.learner_a.put(
            "/api/tutorial-checkpoints/category-item-behavior-split",
            json={"stepId": "select-behavior", "stepIndex": -1, "context": []},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "INVALID_TUTORIAL_CHECKPOINT")


if __name__ == "__main__":
    unittest.main()
