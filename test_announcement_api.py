from __future__ import annotations

import io
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class AnnouncementApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-announcement-tests-")
        root = Path(self.temporary_directory.name)
        self.db_path = str(root / "announcement.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "BACKUP_DIR": str(root / "backups"),
                "FEEDBACK_UPLOAD_DIR": str(root / "feedback_uploads"),
                "ANNOUNCEMENT_UPLOAD_DIR": str(root / "announcement_uploads"),
                "SECRET_KEY": "announcement-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        users = UserStore(self.db_path)
        self.owner = users.create_user("admin", "owner-password", "System Owner")
        self.super_admin = users.create_user(
            "notice-editor", "editor-password", "Notice Editor", role="super_admin"
        )
        self.user = users.create_user("notice-user", "reader-password", "Notice User")
        self.other_user = users.create_user(
            "notice-user-2", "reader-password", "Notice User 2"
        )
        self.owner_client = self._client("admin", "owner-password")
        self.super_client = self._client("notice-editor", "editor-password")
        self.user_client = self._client("notice-user", "reader-password")
        self.other_client = self._client("notice-user-2", "reader-password")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def _client(self, username: str, password: str):
        client = self.app.test_client()
        response = client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(response.status_code, 200)
        return client

    def _create_draft(self):
        image = b"\x89PNG\r\n\x1a\n" + b"announcement-image"
        uploaded = self.super_client.post(
            "/api/admin/announcements/assets",
            data={"file": (io.BytesIO(image), "feature.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(uploaded.status_code, 201)
        asset = uploaded.get_json()
        video = b"\x00\x00\x00\x18ftypisom" + b"announcement-video"
        video_uploaded = self.super_client.post(
            "/api/admin/announcements/assets",
            data={"file": (io.BytesIO(video), "walkthrough.mp4")},
            content_type="multipart/form-data",
        )
        self.assertEqual(video_uploaded.status_code, 201)
        video_asset = video_uploaded.get_json()
        created = self.super_client.post(
            "/api/admin/announcements",
            json={
                "kind": "announcement",
                "version": "2.3.0",
                "title": "方案体验与系统管理优化",
                "summary": "本次更新让方案配置更清晰。",
                "highlights": ["工作区域支持拖拽调整宽度", "新增图文更新公告"],
                "content": [
                    {"type": "heading", "text": "可拖拽的工作区域"},
                    {"type": "paragraph", "text": "拖动边界即可调整工作区域。"},
                    {
                        "type": "image",
                        "assetId": asset["id"],
                        "alt": "工作区域拖拽示意",
                        "caption": "拖动边界即可调整工作区域",
                    },
                    {
                        "type": "video",
                        "assetId": video_asset["id"],
                        "alt": "方案配置操作演示",
                        "caption": "完整操作演示",
                    },
                ],
            },
        )
        self.assertEqual(created.status_code, 201)
        return created.get_json(), asset, image, video_asset, video

    def test_full_publish_media_and_individual_read_flow(self):
        draft, asset, image, video_asset, video = self._create_draft()

        self.assertEqual(self.user_client.get("/api/admin/announcements").status_code, 403)
        self.assertEqual(
            self.super_client.post(
                f"/api/admin/announcements/{draft['id']}/publish"
            ).status_code,
            403,
        )

        published = self.owner_client.post(
            f"/api/admin/announcements/{draft['id']}/publish"
        )
        self.assertEqual(published.status_code, 200)
        self.assertEqual(published.get_json()["status"], "published")

        listed = self.user_client.get("/api/announcements")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.get_json()[0]["id"], draft["id"])
        self.assertEqual(listed.get_json()[0]["kind"], "announcement")
        self.assertIsNone(listed.get_json()[0]["readAt"])
        self.assertEqual(self.user_client.get("/api/announcements/latest-popup").status_code, 404)

        detail = self.user_client.get(f"/api/announcements/{draft['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.get_json()["content"][2]["assetId"], asset["id"])
        self.assertEqual(detail.get_json()["content"][3]["assetId"], video_asset["id"])

        fetched_asset = self.user_client.get(asset["url"])
        self.assertEqual(fetched_asset.status_code, 200)
        self.assertEqual(fetched_asset.data, image)
        fetched_asset.close()

        fetched_video = self.user_client.get(video_asset["url"])
        self.assertEqual(fetched_video.status_code, 200)
        self.assertEqual(fetched_video.data, video)
        fetched_video.close()

        marked = self.user_client.post(f"/api/announcements/{draft['id']}/read")
        self.assertEqual(marked.status_code, 200)
        self.assertEqual(marked.get_json()["id"], draft["id"])
        self.assertIsNotNone(marked.get_json()["readAt"])
        self.assertIsNotNone(self.user_client.get("/api/announcements").get_json()[0]["readAt"])
        self.assertIsNone(self.other_client.get("/api/announcements").get_json()[0]["readAt"])

    def test_draft_asset_is_private_and_published_notice_must_be_recalled_to_edit(self):
        draft, asset, _, _, _ = self._create_draft()
        self.assertEqual(self.user_client.get(asset["url"]).status_code, 404)

        self.owner_client.post(f"/api/admin/announcements/{draft['id']}/publish")
        blocked = self.super_client.patch(
            f"/api/admin/announcements/{draft['id']}",
            json={"title": "不应直接修改"},
        )
        self.assertEqual(blocked.status_code, 400)

        recalled = self.owner_client.post(
            f"/api/admin/announcements/{draft['id']}/unpublish"
        )
        self.assertEqual(recalled.status_code, 200)
        updated = self.super_client.patch(
            f"/api/admin/announcements/{draft['id']}",
            json={"title": "撤回后可以修改"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["title"], "撤回后可以修改")

    def test_tutorial_can_publish_without_version_and_keeps_ordered_content(self):
        created = self.super_client.post(
            "/api/admin/announcements",
            json={
                "kind": "tutorial",
                "version": "",
                "title": "三分钟创建第一个方案",
                "summary": "从新建方案到保存发布的完整引导。",
                "content": [
                    {"type": "heading", "text": "开始之前"},
                    {"type": "paragraph", "text": "请先准备好人群名称。"},
                    {"type": "list", "items": ["打开方案中心", "点击新建"]},
                ],
            },
        )
        self.assertEqual(created.status_code, 201)
        tutorial = created.get_json()
        self.assertEqual(tutorial["kind"], "tutorial")
        self.assertEqual(tutorial["version"], "")

        published = self.owner_client.post(
            f"/api/admin/announcements/{tutorial['id']}/publish"
        )
        self.assertEqual(published.status_code, 200)
        detail = self.user_client.get(f"/api/announcements/{tutorial['id']}").get_json()
        self.assertEqual(detail["kind"], "tutorial")
        self.assertEqual([block["type"] for block in detail["content"]], ["heading", "paragraph", "list"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
