from __future__ import annotations

import io
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class FeedbackApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-feedback-tests-")
        root = Path(self.temporary_directory.name)
        self.db_path = str(root / "feedback.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "BACKUP_DIR": str(root / "backups"),
                "FEEDBACK_UPLOAD_DIR": str(root / "feedback_uploads"),
                "SECRET_KEY": "feedback-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        users = UserStore(self.db_path)
        self.owner = users.create_user("admin", "owner-password", "System Owner")
        self.super_admin = users.create_user(
            "ops-admin", "ops-password", "Ops Admin", role="super_admin"
        )
        self.user = users.create_user("feedback-user", "user-password", "Feedback User")
        self.owner_client = self._client("admin", "owner-password")
        self.super_client = self._client("ops-admin", "ops-password")
        self.user_client = self._client("feedback-user", "user-password")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def _client(self, username: str, password: str):
        client = self.app.test_client()
        response = client.post("/api/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200)
        return client

    def test_feedback_submission_and_root_only_review(self):
        image = b"\x89PNG\r\n\x1a\n" + b"feedback-image"
        created = self.user_client.post(
            "/api/feedback",
            data={
                "category": "bug",
                "message": "组合方案后编辑区域太窄",
                "pagePath": "/workbench",
                "viewport": "1440x900",
                "images": (io.BytesIO(image), "screen.png"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.get_json()["status"], "new")

        self.assertEqual(self.user_client.get("/api/admin/feedback").status_code, 403)
        self.assertEqual(self.super_client.get("/api/admin/feedback").status_code, 403)

        listed = self.owner_client.get("/api/admin/feedback")
        self.assertEqual(listed.status_code, 200)
        feedback = listed.get_json()[0]
        self.assertEqual(feedback["creatorUsername"], "feedback-user")
        self.assertEqual(feedback["category"], "bug")
        self.assertEqual(len(feedback["attachments"]), 1)

        attachment_id = feedback["attachments"][0]["id"]
        attachment = self.owner_client.get(f"/api/admin/feedback/attachments/{attachment_id}")
        self.assertEqual(attachment.status_code, 200)
        self.assertEqual(attachment.data, image)
        attachment.close()

        updated = self.owner_client.patch(
            f"/api/admin/feedback/{feedback['id']}", json={"status": "resolved"}
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["status"], "resolved")

    def test_feedback_rejects_non_image_attachment(self):
        response = self.user_client.post(
            "/api/feedback",
            data={
                "category": "suggestion",
                "message": "测试非法附件",
                "images": (io.BytesIO(b"not-an-image"), "notes.txt"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "INVALID_FEEDBACK")


if __name__ == "__main__":
    unittest.main(verbosity=2)
