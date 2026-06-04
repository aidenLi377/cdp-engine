import json
import unittest
from pathlib import Path


class TestDmpApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tags_path = Path(__file__).parent / "dmp_tags_dictionary.json"
        cls.tags = json.loads(tags_path.read_text(encoding="utf-8"))

    def test_load_tags_returns_57_tags(self):
        from cdp_backend.rpa_agent.dmp_api import load_tags
        tags = load_tags()
        self.assertEqual(len(tags), 57)

    def test_tags_have_required_fields(self):
        from cdp_backend.rpa_agent.dmp_api import load_tags
        tags = load_tags()
        for tag in tags:
            self.assertIn("tagId", tag)
            self.assertIn("tagName", tag)
            self.assertIn("mainCategory", tag)
            self.assertIn("needCondition", tag)

    def test_filter_ready_tags_excludes_need_condition(self):
        from cdp_backend.rpa_agent.dmp_api import filter_ready_tags
        ready = filter_ready_tags(self.tags)
        for tag in ready:
            self.assertFalse(tag["needCondition"])

    def test_group_tags_by_category(self):
        from cdp_backend.rpa_agent.dmp_api import group_tags_by_category
        groups = group_tags_by_category(self.tags)
        self.assertIn("用户特征", groups)
        self.assertIn("品类特征", groups)
        self.assertIn("渠道特征", groups)
        self.assertIn("私域特征", groups)

    def test_normalize_rebase_single_choice_sums_below_100(self):
        from cdp_backend.rpa_agent.dmp_api import normalize_rebase
        rows = [
            {"标签名称": "性别", "特征明细": "男", "人群占比": "35.00%"},
            {"标签名称": "性别", "特征明细": "女", "人群占比": "25.00%"},
            {"标签名称": "性别", "特征明细": "未知", "人群占比": "10.00%"},
        ]
        result = normalize_rebase(rows)
        self.assertEqual(result[0]["Rebase"], "50.00%")
        self.assertEqual(result[1]["Rebase"], "35.71%")
        self.assertEqual(result[2]["Rebase"], "14.29%")

    def test_normalize_rebase_sums_above_100_keeps_original(self):
        from cdp_backend.rpa_agent.dmp_api import normalize_rebase
        rows = [
            {"标签名称": "城市", "特征明细": "北京", "人群占比": "60.00%"},
            {"标签名称": "城市", "特征明细": "上海", "人群占比": "55.00%"},
        ]
        result = normalize_rebase(rows)
        self.assertEqual(result[0]["Rebase"], "60.00%")
        self.assertEqual(result[1]["Rebase"], "55.00%")


if __name__ == "__main__":
    unittest.main()
