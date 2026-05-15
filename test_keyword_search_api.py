from __future__ import annotations

import os
import unittest

os.environ["FLASK_ENV"] = "development"

from app import app  # noqa: E402


class KeywordSearchApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_keyword_search_package_present(self):
        response = self.client.get("/api/packages")
        packages = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertIn("关键词搜索", packages)

    def test_generate_keyword_search_json(self):
        payload = {
            "_package": "关键词搜索",
            "searchs": ["alpha", "beta"],
            "time": {"val": {"days": 30}, "min": "recent"},
        }
        response = self.client.post("/api/generate", json=payload)
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["list"])
        selection = data["list"][0]
        self.assertEqual(selection["selectionLv1"], ["FIELD", "SEARCH"])
        self.assertEqual(selection["selectionLv3"]["contType"], "bhv")
        self.assertEqual(selection["selectionLv3"]["searchs"], ["alpha", "beta"])
        self.assertEqual(selection["selectionLv3"]["dateType"], "RELATIVE_RANGE")
        self.assertEqual(selection["selectionLv3"]["dateValue"], "30")


if __name__ == "__main__":
    unittest.main(verbosity=2)
