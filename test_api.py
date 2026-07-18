"""
本地自测脚本。

运行方式:
    .venv\Scripts\python test_api.py
"""

from __future__ import annotations

import io
import os
import unittest

os.environ["FLASK_ENV"] = "development"

from cdp_backend.app_factory import is_production  # noqa: E402
from cdp_backend.validator import validate_project_config  # noqa: E402
from test_support import create_authenticated_test_app  # noqa: E402


class CdpApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_app = create_authenticated_test_app("api-test-user")
        cls.client = cls.test_app.client
        cls.engine = cls.test_app.engine

    @classmethod
    def tearDownClass(cls):
        cls.test_app.close()

    def test_environment(self):
        self.assertFalse(is_production())

    def test_config_validation(self):
        issues = validate_project_config()
        self.assertIsInstance(issues, list)

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")

    def test_packages(self):
        response = self.client.get("/api/packages")
        packages = response.get_json()
        self.assertIsInstance(packages, list)
        self.assertIn("类目公域行为", packages)
        self.assertIn("商品行为", packages)

    def test_meta_and_cache(self):
        response = self.client.get("/api/meta/类目公域行为?v=test-release")
        meta = response.get_json()
        self.assertIn("schema", meta)
        self.assertIn("matrix", meta)
        self.assertTrue(meta["schema"])
        self.assertIn("类目公域行为", self.engine._meta_cache)
        self.assertIn("max-age=31536000", response.headers["Cache-Control"])
        self.assertIn("immutable", response.headers["Cache-Control"])
        self.assertEqual(response.headers["Vary"], "Cookie")
        self.assertTrue(response.headers.get("ETag"))

        conditional = self.client.get(
            "/api/meta/类目公域行为?v=test-release",
            headers={"If-None-Match": response.headers["ETag"]},
        )
        self.assertEqual(conditional.status_code, 304)

        bundle_response = self.client.get("/api/meta?v=test-release")
        bundle = bundle_response.get_json()
        self.assertEqual(set(bundle), set(self.engine.packages))
        self.assertIn("schema", bundle["类目公域行为"])

        response_alias = self.client.get("/api/package_meta?name=类目公域行为")
        self.assertEqual(response_alias.status_code, 200)
        alias_meta = response_alias.get_json()
        self.assertEqual(len(meta["schema"]), len(alias_meta["schema"]))

    def test_generate_category_json(self):
        payload = {
            "_package": "类目公域行为",
            "bhv": ["浏览", "购买"],
            "channel": ["天猫"],
            "time": {"val": {"days": 30}, "min": "recent"},
        }
        response = self.client.post("/api/generate", json=payload)
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertIn("list", data)
        self.assertEqual(data["compute"], "(0)")
        self.assertTrue(data["list"])
        self.assertIn("selectionLv3", data["list"][0])

    def test_generate_alias_json(self):
        payload = {
            "pkgName": "预测购买力",
            "params": {"attributes": ["高购买力"]},
        }
        response = self.client.post("/api/generate_json", json=payload)
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["list"])

    def test_batch_generate(self):
        csv_content = "人群名称,属性值\n测试包1,高购买力\n测试包2,L2\n"
        data = {
            "file": (io.BytesIO(csv_content.encode("utf-8-sig")), "批量圈人_预测购买力_模版.csv")
        }
        response = self.client.post("/api/batch_generate", data=data, content_type="multipart/form-data")
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["detected_pkg"], "预测购买力")
        self.assertEqual(len(payload["results"]), 2)
        self.assertEqual(payload["errors"], [])

    def test_list_templates(self):
        response = self.client.get("/api/list_templates")
        templates = response.get_json()
        self.assertIsInstance(templates, list)
        self.assertTrue(any(name.endswith(".csv") for name in templates))

    def test_errors(self):
        response = self.client.get("/api/non-existent-endpoint")
        self.assertEqual(response.status_code, 404)
        response = self.client.get("/api/package_meta")
        self.assertEqual(response.status_code, 400)

    def test_route_interface_demo_page(self):
        response = self.client.get("/route-interface-demo")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.content_type)
        body = response.get_data(as_text=True)
        self.assertIn("Route vs API", body)
        self.assertIn("/api/solutions", body)


if __name__ == "__main__":
    unittest.main(verbosity=2)
