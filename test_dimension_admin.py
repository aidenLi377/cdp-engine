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


if __name__ == "__main__":
    unittest.main(verbosity=2)
