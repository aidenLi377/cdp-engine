from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class DimensionAdminApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-dimension-tests-")
        self.db_path = str(Path(self.temporary_directory.name) / "dimensions.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "SECRET_KEY": "dimension-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        users = UserStore(self.db_path)
        users.create_user("root", "root-password", "Root", role="super_admin")
        users.create_user(
            "config", "config-password", "Config", role="config_admin"
        )
        users.create_user("normal", "normal-password", "Normal", role="user")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def login(self, username: str, password: str):
        client = self.app.test_client()
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(response.status_code, 200)
        return client

    def test_config_admin_can_create_and_disable_dimension_row(self):
        client = self.login("config", "config-password")
        second_app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "SECRET_KEY": "dimension-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        second_client = second_app.test_client()
        second_login = second_client.post(
            "/api/auth/login",
            json={"username": "config", "password": "config-password"},
        )
        self.assertEqual(second_login.status_code, 200)
        filename = "类目维表.csv"
        initial = client.get(f"/api/admin/dimensions/{filename}?pageSize=1")
        self.assertEqual(initial.status_code, 200)
        self.assertIn("rows", initial.get_json())

        created = client.post(
            f"/api/admin/dimensions/{filename}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": "测试类目>邀请注册",
                    "cateId": "990000001",
                }
            },
        )
        self.assertEqual(created.status_code, 201)
        row = created.get_json()
        self.assertTrue(row["enabled"])
        self.assertTrue(row["hasChanges"])

        meta = client.get("/api/meta/类目公域行为").get_json()
        leaf_cates = next(
            item for item in meta["schema"] if item["key"] == "leafCates"
        )
        self.assertNotIn("测试类目>邀请注册", leaf_cates["options"])

        published = client.post(
            "/api/admin/config/publish",
            json={"note": "add test category"},
        )
        self.assertEqual(published.status_code, 201)
        self.assertEqual(published.get_json()["version"], 1)
        version_marker = second_client.get("/api/config/version")
        self.assertEqual(version_marker.get_json()["version"], 1)

        second_meta_response = second_client.get(
            "/api/meta/类目公域行为?v=test-release.1"
        )
        self.assertEqual(second_meta_response.headers["X-CDP-Config-Version"], "1")
        self.assertIn("immutable", second_meta_response.headers["Cache-Control"])
        meta = second_meta_response.get_json()
        leaf_cates = next(
            item for item in meta["schema"] if item["key"] == "leafCates"
        )
        self.assertIn("测试类目>邀请注册", leaf_cates["options"])

        disabled = client.patch(
            f"/api/admin/dimensions/{filename}/{row['id']}/status",
            json={"enabled": False},
        )
        self.assertEqual(disabled.status_code, 200)
        self.assertFalse(disabled.get_json()["enabled"])

        refreshed = client.get("/api/meta/类目公域行为").get_json()
        refreshed_leaf_cates = next(
            item for item in refreshed["schema"] if item["key"] == "leafCates"
        )
        self.assertIn("测试类目>邀请注册", refreshed_leaf_cates["options"])

        republished = client.post(
            "/api/admin/config/publish",
            json={"note": "disable test category"},
        )
        self.assertEqual(republished.status_code, 201)

        refreshed = client.get("/api/meta/类目公域行为").get_json()
        refreshed_leaf_cates = next(
            item for item in refreshed["schema"] if item["key"] == "leafCates"
        )
        self.assertNotIn("测试类目>邀请注册", refreshed_leaf_cates["options"])

    def test_regular_user_cannot_manage_dimensions(self):
        client = self.login("normal", "normal-password")
        response = client.get("/api/admin/dimensions")
        self.assertEqual(response.status_code, 403)

    def test_only_super_admin_can_delete_a_dimension_row(self):
        config_client = self.login("config", "config-password")
        root_client = self.login("root", "root-password")
        filename = "类目维表.csv"
        created = config_client.post(
            f"/api/admin/dimensions/{filename}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": "测试类目>待删除",
                    "cateId": "990000002",
                }
            },
        )
        self.assertEqual(created.status_code, 201)
        row_id = created.get_json()["id"]
        self.assertEqual(
            config_client.post(
                "/api/admin/config/publish",
                json={"note": "publish before delete"},
            ).status_code,
            201,
        )

        denied = config_client.delete(
            f"/api/admin/dimensions/{filename}/{row_id}"
        )
        self.assertEqual(denied.status_code, 403)

        staged = root_client.delete(
            f"/api/admin/dimensions/{filename}/{row_id}"
        )
        self.assertEqual(staged.status_code, 200)
        self.assertTrue(staged.get_json()["deleted"])
        self.assertTrue(staged.get_json()["hasChanges"])

        pending = root_client.get(
            f"/api/admin/dimensions/{filename}?q=待删除"
        ).get_json()["rows"]
        self.assertTrue(any(row["id"] == row_id and row["deleted"] for row in pending))

        discarded = root_client.post("/api/admin/config/discard")
        self.assertEqual(discarded.status_code, 200)
        restored = root_client.get(
            f"/api/admin/dimensions/{filename}?q=待删除"
        ).get_json()["rows"]
        self.assertTrue(any(row["id"] == row_id and not row["deleted"] for row in restored))

        root_client.delete(f"/api/admin/dimensions/{filename}/{row_id}")
        published = root_client.post(
            "/api/admin/config/publish",
            json={"note": "remove test category"},
        )
        self.assertEqual(published.status_code, 201)
        meta = root_client.get("/api/meta/类目公域行为").get_json()
        leaf_cates = next(item for item in meta["schema"] if item["key"] == "leafCates")
        self.assertNotIn("测试类目>待删除", leaf_cates["options"])

    def test_staged_delete_keeps_its_page_position_until_publish(self):
        client = self.login("root", "root-password")
        filename = "行为维表.csv"
        first_page = client.get(
            f"/api/admin/dimensions/{filename}?page=1&pageSize=5"
        ).get_json()
        self.assertGreater(first_page["total"], 5)
        deleted_row = first_page["rows"][0]

        staged = client.delete(
            f"/api/admin/dimensions/{filename}/{deleted_row['id']}"
        )
        self.assertEqual(staged.status_code, 200)
        self.assertTrue(staged.get_json()["deleted"])

        second_page = client.get(
            f"/api/admin/dimensions/{filename}?page=2&pageSize=5"
        )
        self.assertEqual(second_page.status_code, 200)
        refreshed_first_page = client.get(
            f"/api/admin/dimensions/{filename}?page=1&pageSize=5"
        ).get_json()
        refreshed_row = next(
            row for row in refreshed_first_page["rows"]
            if row["id"] == deleted_row["id"]
        )
        self.assertTrue(refreshed_row["deleted"])
        self.assertTrue(refreshed_row["hasChanges"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
