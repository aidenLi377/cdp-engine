from __future__ import annotations

import json
import unittest

from cdp_backend.ai_solution_knowledge import AiSolutionKnowledge


class StubSolutionStore:
    def __init__(self, solutions):
        self.solutions = solutions

    def list_solutions(self, status, scope, user_id):
        assert status == "published"
        assert scope == "public"
        return self.solutions


class AiSolutionKnowledgeTests(unittest.TestCase):
    def test_public_solution_becomes_parameterized_semantic_template(self):
        knowledge = AiSolutionKnowledge(
            StubSolutionStore(
                [
                    {
                        "id": "solution_category_new",
                        "name": "品类新客",
                        "defaultCrowdName": "品类新客",
                        "_version": 17,
                        "updatedAt": "2026-08-20T08:07:32Z",
                        "customFields": [
                            {
                                "name": "分析类目",
                                "type": "搜索多选",
                                "bindings": [
                                    {"nodeId": "node_1", "fieldKey": "leafCates"}
                                ],
                            },
                            {
                                "name": "品牌",
                                "type": "搜索多选",
                                "bindings": [
                                    {"nodeId": "node_1", "fieldKey": "stdBrand"}
                                ],
                            },
                            {
                                "name": "品牌核心类目",
                                "type": "搜索多选",
                                "bindings": [],
                            },
                        ],
                        "nodes": [
                            {
                                "id": "node_1",
                                "displayName": "统计时间内购买这个品类",
                                "packageType": "类目公域行为",
                                "operator": None,
                                "formData": {
                                    "bhv": ["购买"],
                                    "leafCates": ["美容护肤/美体/精油>乳液/面霜"],
                                    "stdBrand": ["CPB/肌肤之钥"],
                                    "channel": ["天猫"],
                                },
                            }
                        ],
                    }
                ]
            )
        )

        catalog = knowledge.get_prompt_catalog()
        solution = catalog["solutions"][0]
        node = solution["nodes"][0]
        self.assertEqual(solution["name"], "品类新客")
        self.assertIn("统计期购买本品牌", solution["businessDefinition"])
        self.assertEqual(len(solution["canonicalOrder"]), 3)
        self.assertTrue(solution["recognitionExamples"])
        self.assertEqual(node["fixedIntent"]["behaviors"], ["购买"])
        self.assertEqual(node["fixedIntent"]["channels"], ["天猫"])
        self.assertEqual(
            {item["targetField"] for item in node["parameterBindings"]},
            {"categories", "brands"},
        )
        parameter_by_name = {item["name"]: item for item in solution["parameters"]}
        self.assertEqual(parameter_by_name["分析类目"]["selectionMode"], "single")
        self.assertEqual(parameter_by_name["品牌核心类目"]["selectionMode"], "multiple")
        self.assertEqual(parameter_by_name["品牌核心类目"]["maxSelectionsPerNode"], 10)
        self.assertIn("前10", parameter_by_name["品牌核心类目"]["description"])
        serialized = json.dumps(catalog, ensure_ascii=False)
        self.assertNotIn("CPB/肌肤之钥", serialized)
        self.assertNotIn("乳液/面霜", serialized)
        self.assertIn("intent.solutionId", serialized)
        self.assertIn("去年YTD", serialized)
        self.assertIn("惊艳唇釉", serialized)
        self.assertEqual(len(catalog["curatedExamples"]), 9)

    def test_status_reports_loaded_solution_count_and_latest_update(self):
        knowledge = AiSolutionKnowledge(
            StubSolutionStore(
                [
                    {"name": "A", "updatedAt": "2026-01-01T00:00:00Z"},
                    {"name": "B", "updatedAt": "2026-02-01T00:00:00Z"},
                ]
            )
        )
        status = knowledge.status()
        self.assertEqual(status["solutionKnowledgeCount"], 2)
        self.assertEqual(
            status["solutionKnowledgeUpdatedAt"], "2026-02-01T00:00:00Z"
        )
        self.assertEqual(status["trainingExampleCount"], 9)
        self.assertEqual(status["storeCategoryProfileCount"], 205)
        self.assertEqual(status["fullyMappedStoreCategoryProfileCount"], 115)
        self.assertEqual(status["availableTopTenCategoryProfileCount"], 115)
        self.assertEqual(
            status["storeCategoryProfileMonths"],
            [
                "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
                "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
                "2026-07", "2026-08",
            ],
        )

    def test_store_sales_profile_resolves_brand_alias_and_keeps_top_ten(self):
        knowledge = AiSolutionKnowledge(StubSolutionStore([]))

        profile = knowledge.find_brand_core_profile("Dior/迪奥")

        self.assertIsNotNone(profile)
        self.assertEqual(profile["storeName"], "dior迪奥官方旗舰店")
        self.assertEqual(profile["coreCategoryCount"], 10)
        self.assertGreaterEqual(profile["coveredShare"], 0.95)
        self.assertEqual(
            knowledge.brand_core_categories("迪奥")[0],
            "彩妆/香水/美妆工具>唇部彩妆",
        )
        self.assertTrue(
            all(item["cateId"] for item in profile["coreCategories"])
        )

        prompt_catalog = knowledge.get_prompt_catalog("帮我圈Dior的品类新客")
        self.assertEqual(
            prompt_catalog["matchedStoreCategoryProfiles"][0]["storeName"],
            "dior迪奥官方旗舰店",
        )
        chinese_prompt_catalog = knowledge.get_prompt_catalog(
            "帮我圈海蓝之谜的品类新客"
        )
        self.assertEqual(
            chinese_prompt_catalog["matchedStoreCategoryProfiles"][0]["storeName"],
            "lamer海蓝之谜官方旗舰店",
        )
        lancome_prompt_catalog = knowledge.get_prompt_catalog(
            "我想看兰蔻的乳液面霜品类新客，近半年"
        )
        self.assertEqual(
            lancome_prompt_catalog["matchedStoreCategoryProfiles"][0]["storeName"],
            "lancome兰蔻官方旗舰店",
        )
        self.assertEqual(len(knowledge.brand_core_categories("兰蔻")), 10)

    def test_exact_curated_example_is_available_as_non_fuzzy_recovery(self):
        knowledge = AiSolutionKnowledge(StubSolutionStore([]))

        matched = knowledge.find_exact_curated_example(
            "XT_2508香水搜索浏览全球购_副本"
        )

        self.assertEqual(
            matched["example"]["id"],
            "private-search-dior-fragrance-browse-global-purchase-202508",
        )
        self.assertIsNone(matched["period"])
        self.assertIsNone(
            knowledge.find_exact_curated_example(
                "差不多找一下香水相关的人"
            )
        )

    def test_store_profile_text_lookup_refuses_multiple_named_brands(self):
        knowledge = AiSolutionKnowledge(StubSolutionStore([]))

        self.assertIsNone(
            knowledge.find_unique_brand_core_profile_in_text(
                "对比兰蔻和海蓝之谜的品类新客"
            )
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
