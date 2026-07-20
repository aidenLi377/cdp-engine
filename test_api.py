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
            "bhv": ["购买"],
            "leafCates": ["美容护肤/美体/精油>乳液/面霜"],
            "stdBrand": ["CPB/肌肤之钥"],
            "channel": ["天猫"],
            "frequency": {"min": "", "max": ""},
            "price": {"min": "", "max": ""},
            "itemprice": {"min": "", "max": ""},
            "time": {
                "val": {"start": "20260501", "end": "20260621"},
                "min": "range",
            },
        }
        response = self.client.post("/api/generate", json=payload)
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        expected = {
            "crowdName": "未命名",
            "list": [
                {
                    "selectionLv1": ["COMMON_TOUCH", "PUBLIC_CATE_BHV"],
                    "selectionLv3": {
                        "extraFilters": {
                            "channel": ["16772#|#4"],
                            "stdBrand": ["18641319"],
                            "frequency": {"op": "OPEN_OPEN"},
                            "price": {"op": "OPEN_OPEN"},
                            "itemprice": {"op": "OPEN_OPEN"},
                        },
                        "leafCates": ["50011980#|#50011980"],
                        "bhv": ["18919#|#CATE_PUBLIC_PAY"],
                        "dateType": "ABSOLUTE_DATE_RANGE",
                        "dateValue": {"from": "20260501", "to": "20260621"},
                    },
                    "fromPoolId": 0,
                }
            ],
            "compute": "(0)",
        }
        self.assertEqual(data, expected)
        self.assertEqual(list(data["list"][0]), ["selectionLv1", "selectionLv3", "fromPoolId"])
        self.assertEqual(
            list(data["list"][0]["selectionLv3"]),
            ["extraFilters", "leafCates", "bhv", "dateType", "dateValue"],
        )
        self.assertEqual(
            list(data["list"][0]["selectionLv3"]["extraFilters"]),
            ["channel", "stdBrand", "frequency", "price", "itemprice"],
        )
        response_text = response.get_data(as_text=True)
        self.assertLess(response_text.index('"selectionLv1"'), response_text.index('"selectionLv3"'))
        self.assertLess(response_text.index('"selectionLv3"'), response_text.index('"fromPoolId"'))

    def test_generate_commodity_json(self):
        payload = {
            "_package": "商品行为",
            "channel": "天猫",
            "shop": "SHISEIDO资生堂官方旗舰店",
            "bhv": ["购买"],
            "frequency": {"min": "", "max": ""},
            "money": {"min": "", "max": ""},
            "cate": "全部",
            "time": {
                "val": {"start": "20260501", "end": "20260621"},
                "min": "range",
            },
            "selectedGoodsType": "任意品牌商品",
        }
        response = self.client.post("/api/generate", json=payload)
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        expected = {
            "crowdName": "未命名",
            "list": [
                {
                    "selectionLv1": ["COMMODITY", "ITEM"],
                    "selectionLv3": {
                        "shop": "113498758#|#113498758",
                        "keywords": None,
                        "cate": "ALL",
                        "bhv": ["16709#|#PAY"],
                        "frequency": {"op": "OPEN_OPEN"},
                        "money": {"op": "OPEN_OPEN"},
                        "dateType": "ABSOLUTE_DATE_RANGE",
                        "dateValue": {"from": "20260501", "to": "20260621"},
                        "selectedGoodsType": "1",
                    },
                    "tipProperty": None,
                    "fromPoolId": 0,
                    "selectionLv2": ["16612#|#4"],
                    "selectionLv2Name": "天猫",
                }
            ],
            "compute": "(0)",
        }
        self.assertEqual(data, expected)
        self.assertEqual(
            list(data["list"][0]),
            [
                "selectionLv1",
                "selectionLv3",
                "tipProperty",
                "fromPoolId",
                "selectionLv2",
                "selectionLv2Name",
            ],
        )
        self.assertEqual(
            list(data["list"][0]["selectionLv3"]),
            [
                "shop",
                "keywords",
                "cate",
                "bhv",
                "frequency",
                "money",
                "dateType",
                "dateValue",
                "selectedGoodsType",
            ],
        )
        response_text = response.get_data(as_text=True)
        self.assertLess(response_text.index('"selectionLv1"'), response_text.index('"selectionLv3"'))
        self.assertLess(response_text.index('"selectionLv3"'), response_text.index('"tipProperty"'))
        self.assertLess(response_text.index('"tipProperty"'), response_text.index('"fromPoolId"'))

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
