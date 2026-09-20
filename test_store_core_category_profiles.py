from __future__ import annotations

import unittest

import pandas as pd

from scripts.build_store_core_category_profiles import analyze_sales_frame


class StoreCoreCategoryProfileTests(unittest.TestCase):
    def test_broad_makeup_scope_includes_entire_combined_first_level_category(self):
        rows = [
            ("唇部彩妆", 90),
            ("香水/香水用品", 80),
            ("面部彩妆", 70),
            ("美容工具", 60),
            ("指甲油/美甲产品（新）", 50),
        ]
        frame = pd.DataFrame(
            [
                {
                    "掌柜名称": "DIOR迪奥官方旗舰店",
                    "时间段": "2026-07",
                    "一级类目": "彩妆/香水/美妆工具",
                    "二级类目": category,
                    "销售额": sales,
                }
                for category, sales in rows
            ]
        )
        profile = analyze_sales_frame(frame, "sample.xlsx")["storeProfiles"][0]
        makeup = profile["categoryGroups"]["彩妆"]
        self.assertEqual(
            [item["categoryPath"].split(">", 1)[1] for item in makeup],
            ["唇部彩妆", "香水/香水用品", "面部彩妆", "美容工具", "指甲油/美甲产品（新）"],
        )
        self.assertEqual(
            [item["categoryPath"].split(">", 1)[1] for item in profile["categoryGroups"]["香水"]],
            ["香水/香水用品"],
        )
        self.assertEqual(
            [item["categoryPath"].split(">", 1)[1] for item in profile["categoryGroups"]["美妆工具"]],
            ["美容工具"],
        )

    def test_skincare_scope_uses_complete_skincare_first_level_category(self):
        rows = [
            ("美容护肤/美体/精油", "洁面", 90),
            ("美容护肤/美体/精油", "乳液/面霜", 80),
            ("彩妆/香水/美妆工具", "面部彩妆", 100),
        ]
        frame = pd.DataFrame(
            [
                {
                    "掌柜名称": "DIOR迪奥官方旗舰店",
                    "时间段": "2026-08",
                    "一级类目": first_level,
                    "二级类目": second_level,
                    "销售额": sales,
                }
                for first_level, second_level, sales in rows
            ]
        )
        profile = analyze_sales_frame(frame, "sample.xlsx")["storeProfiles"][0]
        self.assertEqual(
            [item["categoryPath"].split(">", 1)[1] for item in profile["categoryGroups"]["护肤"]],
            ["洁面", "乳液/面霜"],
        )

    def test_keeps_top_ten_by_sales_not_ninety_five_percent(self):
        rows = []
        for index in range(12):
            for month in ("2026-06", "2026-07"):
                rows.append(
                    {
                        "掌柜名称": "DIOR迪奥官方旗舰店",
                        "时间段": month,
                        "一级类目": "彩妆/香水/美妆工具",
                        "二级类目": f"类目{index:02d}",
                        "销售额": 1000 - index * 70,
                    }
                )
        analysis = analyze_sales_frame(pd.DataFrame(rows), "sample.xlsx")
        profile = analysis["storeProfiles"][0]
        self.assertEqual(profile["categoryCount"], 12)
        self.assertEqual(len(profile["coreCategories"]), 10)
        self.assertEqual(profile["coreCategories"][0]["categoryPath"], "彩妆/香水/美妆工具>类目00")
        self.assertEqual(profile["coreCategories"][-1]["categoryPath"], "彩妆/香水/美妆工具>类目09")
        self.assertLess(profile["coveredShare"], 1)

    def test_makeup_top_ten_is_ranked_after_filtering_combined_first_level(self):
        rows = [
            {
                "掌柜名称": "DIOR迪奥官方旗舰店",
                "时间段": "2026-07",
                "一级类目": "彩妆/香水/美妆工具",
                "二级类目": "香水/香水用品",
                "销售额": 100000,
            }
        ]
        rows.extend(
            {
                "掌柜名称": "DIOR迪奥官方旗舰店",
                "时间段": "2026-07",
                "一级类目": "彩妆/香水/美妆工具",
                "二级类目": f"彩妆类目{index:02d}",
                "销售额": 1000 - index * 10,
            }
            for index in range(12)
        )
        profile = analyze_sales_frame(pd.DataFrame(rows), "sample.xlsx")["storeProfiles"][0]
        whole_store = [item["categoryPath"].split(">", 1)[1] for item in profile["coreCategories"]]
        makeup = [item["categoryPath"].split(">", 1)[1] for item in profile["categoryGroups"]["彩妆"]]
        self.assertEqual(len(whole_store), 10)
        self.assertEqual(whole_store[0], "香水/香水用品")
        self.assertEqual(
            makeup,
            ["香水/香水用品", *[f"彩妆类目{index:02d}" for index in range(9)]],
        )


if __name__ == "__main__":
    unittest.main()
