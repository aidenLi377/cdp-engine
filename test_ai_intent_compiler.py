from __future__ import annotations

import os
import unittest
from datetime import timedelta

os.environ["FLASK_ENV"] = "development"

from test_support import create_authenticated_test_app  # noqa: E402
from cdp_backend.business_date import business_today, latest_selectable_date  # noqa: E402


CATEGORY = "美容护肤/美体/精油>乳液/面霜"
DIOR_LIP_CATEGORY = "彩妆/香水/美妆工具>唇部彩妆>唇彩/唇蜜/唇釉/唇泥/唇霜"
LIPSTICK_CATEGORY = "彩妆/香水/美妆工具>唇部彩妆>唇膏/口红"


class AiIntentCompilerApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_app = create_authenticated_test_app("ai-compiler-test-user")
        cls.client = cls.test_app.client

    @classmethod
    def tearDownClass(cls):
        cls.test_app.close()

    def compile(self, condition, audience_name="测试人群"):
        return self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "audienceName": audience_name,
                "conditions": [condition],
            },
        )

    def test_intent_schema_is_available_and_versioned(self):
        response = self.client.get("/api/ai/intent-schema")
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["properties"]["schemaVersion"]["const"], 1)
        self.assertIn("condition", data["$defs"])
        self.assertIn("solutionId", data["properties"])
        self.assertIn("no-cache", response.headers["Cache-Control"])

    def test_solution_id_is_accepted_as_verified_template_metadata(self):
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "solutionId": "solution_public_example",
                "audienceName": "用户自定义名称",
                "conditions": [
                    {
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                        "recentDays": 30,
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["audienceName"], "用户自定义名称")

    def test_category_public_intent_compiles_to_workbench_and_dmp_output(self):
        response = self.compile(
            {
                "behaviors": ["购买"],
                "categories": [CATEGORY],
                "brands": ["CPB/肌肤之钥"],
                "channels": ["天猫"],
                "recentDays": 30,
            },
            "CPB近30天购买人群",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["audienceName"], "CPB近30天购买人群")
        self.assertEqual(len(data["nodes"]), 1)
        self.assertEqual(data["nodes"][0]["packageType"], "类目公域行为")
        self.assertIsNone(data["nodes"][0]["operator"])
        self.assertEqual(data["nodes"][0]["formData"]["bhv"], ["购买"])
        self.assertEqual(data["nodes"][0]["modeData"]["time"], "recent")
        self.assertEqual(data["generated"]["compute"], "(0)")
        self.assertEqual(data["generated"]["crowdName"], "CPB近30天购买人群")
        self.assertEqual(data["generated"]["list"][0]["fromPoolId"], 0)

    def test_category_public_defaults_to_tmall_when_channel_is_omitted(self):
        response = self.compile(
            {
                "behaviors": ["购买"],
                "categories": [CATEGORY],
                "recentDays": 30,
            },
            "默认天猫渠道人群",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["nodes"][0]["formData"]["channel"], ["天猫"])
        self.assertEqual(
            data["generated"]["list"][0]["selectionLv3"]["extraFilters"]["channel"],
            ["16772#|#4"],
        )

    def test_keyword_search_intersects_all_channel_commodity_without_account(self):
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "audienceName": "XT_2508香水搜索浏览ttl_副本",
                "conditions": [
                    {
                        "component": "关键词搜索",
                        "searchKeywords": ["迪奥香水"],
                        "dateRange": ["2025-08-01", "2025-08-31"],
                    },
                    {
                        "relation": "intersect",
                        "component": "商品行为",
                        "behaviors": ["浏览"],
                        "categories": ["彩妆/香水/美妆工具>香水/香水用品"],
                        "channels": ["所有销售渠道"],
                        "dateRange": ["2025-08-01", "2025-08-31"],
                    },
                ],
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(
            [node["packageType"] for node in data["nodes"]],
            ["关键词搜索", "商品行为"],
        )
        self.assertEqual(data["nodes"][1]["formData"]["channel"], "所有销售渠道")
        self.assertEqual(data["nodes"][1]["formData"]["shop"], "")
        generated = data["generated"]
        self.assertEqual(generated["compute"], "(0)n(1)")
        self.assertEqual(generated["list"][0]["selectionLv3"]["searchs"], ["迪奥香水"])
        self.assertEqual(generated["list"][1]["selectionLv2"], ["16596#|#ALL"])
        self.assertEqual(
            generated["list"][1]["selectionLv3"]["bhv"],
            ["16628#|#VIEW_ITEM"],
        )
        self.assertEqual(
            generated["list"][1]["selectionLv3"]["cate"],
            "201834201#|#201834201",
        )
        self.assertEqual(generated["list"][1]["selectionLv3"]["selectedGoodsType"], "1")

    def test_keyword_search_intersects_tmall_dior_official_store_browse(self):
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "audienceName": "XT_2508香水搜索浏览官旗",
                "conditions": [
                    {
                        "component": "关键词搜索",
                        "searchKeywords": ["迪奥香水"],
                        "dateRange": ["2025-08-01", "2025-08-31"],
                    },
                    {
                        "relation": "intersect",
                        "component": "商品行为",
                        "scope": "own_store",
                        "brand": "Dior",
                        "canUseBrandAccount": True,
                        "behaviors": ["浏览"],
                        "categories": ["彩妆/香水/美妆工具>香水/香水用品"],
                        "channels": ["天猫"],
                        "dateRange": ["2025-08-01", "2025-08-31"],
                    },
                ],
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(
            data["nodes"][1]["formData"]["shop"],
            "DIOR迪奥官方旗舰店 香水与美容品",
        )
        generated = data["generated"]
        self.assertEqual(generated["compute"], "(0)n(1)")
        self.assertEqual(generated["list"][1]["selectionLv2"], ["16612#|#4"])
        self.assertEqual(
            generated["list"][1]["selectionLv3"]["bhv"],
            ["16625#|#VIEW_ITEM"],
        )
        self.assertEqual(
            generated["list"][1]["selectionLv3"]["cate"],
            "201834201#|#201834201",
        )
        self.assertEqual(
            generated["list"][1]["selectionLv3"]["shop"],
            "376414317#|#376414317",
        )

    def test_keyword_search_intersects_every_tmall_commodity_behavior(self):
        behavior_ids = {
            "浏览": "16625#|#VIEW_ITEM",
            "收藏": "16646#|#COLLECT_ITEM",
            "加购": "16667#|#CART",
            "预售": "16688#|#PREPAY",
            "购买": "16709#|#PAY",
            "退款": "16723#|#REFUND",
        }
        for behavior, behavior_id in behavior_ids.items():
            with self.subTest(behavior=behavior):
                response = self.client.post(
                    "/api/ai/compile",
                    json={
                        "schemaVersion": 1,
                        "audienceName": f"2025年9月第1周搜索迪奥{behavior}",
                        "conditions": [
                            {
                                "component": "关键词搜索",
                                "searchKeywords": ["迪奥"],
                                "dateRange": ["2025-09-01", "2025-09-07"],
                            },
                            {
                                "relation": "intersect",
                                "component": "商品行为",
                                "scope": "own_store",
                                "brand": "Dior",
                                "canUseBrandAccount": True,
                                "behaviors": [behavior],
                                "channels": ["天猫"],
                                "dateRange": ["2025-09-01", "2025-09-07"],
                            },
                        ],
                    },
                )
                data = response.get_json()

                self.assertEqual(response.status_code, 200)
                self.assertEqual(data["status"], "ready")
                generated = data["generated"]
                self.assertEqual(generated["compute"], "(0)n(1)")
                self.assertEqual(generated["list"][1]["selectionLv2"], ["16612#|#4"])
                self.assertEqual(
                    generated["list"][1]["selectionLv3"]["bhv"],
                    [behavior_id],
                )
                self.assertEqual(generated["list"][1]["selectionLv3"]["cate"], "ALL")
                self.assertEqual(
                    generated["list"][1]["selectionLv3"]["shop"],
                    "376414317#|#376414317",
                )

    def test_dior_official_store_requires_current_user_access_confirmation(self):
        response = self.compile(
            {
                "component": "商品行为",
                "scope": "own_store",
                "brand": "Dior",
                "canUseBrandAccount": None,
                "behaviors": ["浏览"],
                "categories": ["彩妆/香水/美妆工具>香水/香水用品"],
                "channels": ["天猫"],
                "dateRange": ["2025-08-01", "2025-08-31"],
            },
            "Dior官旗浏览香水",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(data["questions"][0]["field"], "canUseBrandAccount")
        self.assertIn("DIOR迪奥官方旗舰店", data["questions"][0]["prompt"])
        self.assertEqual(data["nodes"], [])

    def test_named_channel_aggregates_compile_with_shop_all(self):
        expected = {
            "全球购": (["16616#|#5"], ["16626#|#VIEW_ITEM"]),
            "天猫国际直营": (["16604#|#13"], ["16629#|#VIEW_ITEM"]),
            "天猫国际": (["16600#|#1"], ["16623#|#VIEW_ITEM"]),
            "淘宝集市": (["16620#|#3"], ["16627#|#VIEW_ITEM"]),
        }
        for channel, (channel_id, behavior_id) in expected.items():
            with self.subTest(channel=channel):
                response = self.client.post(
                    "/api/ai/compile",
                    json={
                        "schemaVersion": 1,
                        "audienceName": f"迪奥香水搜索浏览{channel}",
                        "conditions": [
                            {
                                "component": "关键词搜索",
                                "searchKeywords": ["迪奥香水"],
                                "dateRange": ["2025-08-01", "2025-08-31"],
                            },
                            {
                                "relation": "intersect",
                                "component": "商品行为",
                                "scope": "own_brand",
                                "behaviors": ["浏览"],
                                "categories": ["彩妆/香水/美妆工具>香水/香水用品"],
                                "channels": [channel],
                                "dateRange": ["2025-08-01", "2025-08-31"],
                            },
                        ],
                    },
                )
                data = response.get_json()

                self.assertEqual(data["status"], "ready")
                self.assertEqual(data["questions"], [])
                generated = data["generated"]
                self.assertEqual(generated["compute"], "(0)n(1)")
                self.assertEqual(generated["list"][1]["selectionLv2"], channel_id)
                self.assertEqual(
                    generated["list"][1]["selectionLv3"]["bhv"],
                    behavior_id,
                )
                self.assertEqual(
                    generated["list"][1]["selectionLv3"]["shop"],
                    "ALL",
                )

    def test_confirmed_dior_ytd_training_sample_compiles_to_source_semantics(self):
        response = self.compile(
            {
                "component": "类目公域行为",
                "behaviors": ["购买"],
                "categories": [DIOR_LIP_CATEGORY],
                "brands": ["Dior/迪奥"],
                "channels": ["天猫"],
                "titleKeywords": ["惊艳唇釉"],
                "itemPrice": {"min": 200, "max": None},
                "dateRange": ["2025-01-01", "2025-08-31"],
            },
            "XT_迪奥惊艳唇釉ytd去年",
        )
        data = response.get_json()
        generated = data["generated"]
        selection = generated["list"][0]["selectionLv3"]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["nodes"][0]["packageType"], "类目公域行为")
        self.assertEqual(selection["bhv"], ["18919#|#CATE_PUBLIC_PAY"])
        self.assertEqual(selection["leafCates"], ["50010807#|#50010807"])
        self.assertEqual(selection["extraFilters"]["stdBrand"], ["29478"])
        self.assertEqual(selection["extraFilters"]["channel"], ["16772#|#4"])
        self.assertEqual(selection["extraFilters"]["title"], ["惊艳唇釉"])
        self.assertEqual(
            selection["extraFilters"]["itemprice"],
            {"op": "OPEN_CLOSE", "min": 200},
        )
        self.assertEqual(selection["dateType"], "ABSOLUTE_DATE_RANGE")
        self.assertEqual(
            selection["dateValue"],
            {"from": "20250101", "to": "20250831"},
        )
        self.assertEqual(generated["compute"], "(0)")

    def test_fixed_date_range_may_end_at_yesterday(self):
        yesterday = latest_selectable_date().isoformat()
        response = self.compile(
            {
                "behaviors": ["购买"],
                "categories": [CATEGORY],
                "dateRange": [yesterday, yesterday],
            }
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(
            data["nodes"][0]["formData"]["time"]["dateRange"],
            [yesterday, yesterday],
        )
        generated_date = data["generated"]["list"][0]["selectionLv3"]["dateValue"]
        self.assertEqual(generated_date["from"], yesterday.replace("-", ""))
        self.assertEqual(generated_date["to"], yesterday.replace("-", ""))

    def test_fixed_date_range_cannot_include_today(self):
        today = business_today().isoformat()
        response = self.compile(
            {
                "behaviors": ["购买"],
                "categories": [CATEGORY],
                "dateRange": [today, today],
            }
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("不能包含今天", response.get_json()["message"])

    def test_labeled_statistic_and_comparison_periods_cannot_be_identical(self):
        yesterday = latest_selectable_date()
        start = yesterday - timedelta(days=29)
        shared_range = [start.isoformat(), yesterday.isoformat()]
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "audienceName": "错误对比周期",
                "conditions": [
                    {
                        "displayName": "统计时间内购买这个品类",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                        "dateRange": shared_range,
                    },
                    {
                        "displayName": "对比时间内购买这个品类",
                        "relation": "exclude",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                        "dateRange": shared_range,
                    },
                ],
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("统计时间与对比时间不能相同", response.get_json()["message"])

    def test_labeled_solution_requires_one_combined_period_confirmation(self):
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "audienceName": "品类新客",
                "conditions": [
                    {
                        "id": "current",
                        "displayName": "统计时间内购买这个品类",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                    },
                    {
                        "id": "prior-brand",
                        "displayName": "对比时间内买过我品牌的人",
                        "relation": "exclude",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                    },
                    {
                        "id": "prior-category",
                        "displayName": "对比时间内买了这个类目",
                        "relation": "exclude",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                    },
                ],
            },
        )
        data = response.get_json()
        period_questions = [
            item for item in data["questions"] if item.get("parameterName") == "统计时间与对比时间"
        ]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(len(period_questions), 1)
        self.assertIn("近半年对比前半年", period_questions[0]["prompt"])
        self.assertEqual(data["nodes"], [])

    def test_labeled_solution_only_asks_for_the_missing_comparison_period(self):
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "audienceName": "品类新客",
                "conditions": [
                    {
                        "id": "current",
                        "displayName": "统计时间内购买这个品类",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                        "recentDays": 30,
                    },
                    {
                        "id": "prior",
                        "displayName": "对比时间内购买这个品类",
                        "relation": "exclude",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                    },
                ],
            },
        )
        data = response.get_json()
        period_questions = [
            item for item in data["questions"] if item.get("parameterName") == "对比时间"
        ]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(period_questions), 1)
        self.assertIn("对比前30天", period_questions[0]["prompt"])
        self.assertEqual(period_questions[0]["conditionId"], "prior")

    def test_labeled_solution_only_asks_for_the_missing_statistic_period(self):
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "audienceName": "品类新客",
                "conditions": [
                    {
                        "id": "current",
                        "displayName": "统计时间内购买这个品类",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                    },
                    {
                        "id": "prior",
                        "displayName": "对比时间内购买这个品类",
                        "relation": "exclude",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": [CATEGORY],
                        "recentDays": 30,
                    },
                ],
            },
        )
        data = response.get_json()
        period_questions = [
            item for item in data["questions"] if item.get("parameterName") == "统计时间"
        ]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(period_questions), 1)
        self.assertIn("近30天", period_questions[0]["prompt"])
        self.assertEqual(period_questions[0]["conditionId"], "current")

    def test_standard_brand_alias_prefers_formal_slash_option(self):
        response = self.compile(
            {
                "behaviors": ["购买"],
                "categories": [CATEGORY],
                "brands": ["迪奥"],
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["questions"], [])
        self.assertEqual(data["nodes"][0]["formData"]["stdBrand"], ["Dior/迪奥"])

    def test_multiple_behaviors_default_to_union_in_one_node(self):
        response = self.compile(
            {
                "behaviors": ["浏览", "购买"],
                "categories": [CATEGORY],
                "behaviorMatch": "any",
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 1)
        self.assertEqual(data["nodes"][0]["formData"]["bhv"], ["浏览", "购买"])
        self.assertEqual(data["nodes"][0]["formData"]["time"]["days"], 30)

    def test_all_behaviors_split_to_intersection_nodes(self):
        response = self.compile(
            {
                "behaviors": ["浏览", "购买"],
                "categories": [CATEGORY],
                "behaviorMatch": "all",
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 2)
        self.assertEqual(data["nodes"][0]["formData"]["bhv"], ["浏览"])
        self.assertEqual(data["nodes"][1]["formData"]["bhv"], ["购买"])
        self.assertEqual(data["nodes"][1]["operator"], "n")
        self.assertEqual(data["nodes"][0]["formData"]["time"]["days"], 30)
        self.assertEqual(data["nodes"][1]["formData"]["time"]["days"], 366)
        self.assertEqual(data["generated"]["compute"], "(0)n(1)")

    def test_behavior_specific_parameter_is_not_silently_dropped_from_union_node(self):
        response = self.compile(
            {
                "behaviors": ["浏览", "购买"],
                "categories": [CATEGORY],
                "behaviorMatch": "any",
                "purchaseAmount": {"min": 500, "max": None},
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "needs_clarification")
        self.assertIn("purchaseAmount", [item["field"] for item in data["questions"]])
        self.assertEqual(data["nodes"], [])

    def test_commodity_requires_confirmation_of_current_users_engine_access(self):
        response = self.compile(
            {
                "scope": "own_store",
                "brand": "IPSA",
                "behaviors": ["购买"],
                "productIds": ["123456"],
            }
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(data["questions"][0]["field"], "canUseBrandAccount")
        self.assertEqual(data["questions"][0]["answerType"], "boolean")
        self.assertEqual(data["nodes"], [])

    def test_confirmed_engine_access_compiles_commodity_product_id(self):
        response = self.compile(
            {
                "scope": "own_store",
                "brand": "IPSA",
                "canUseBrandAccount": True,
                "behaviors": ["购买"],
                "productIds": ["123456"],
                "recentDays": 30,
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 1)
        node = data["nodes"][0]
        self.assertEqual(node["packageType"], "商品行为")
        self.assertEqual(node["formData"]["shop"], "IPSA茵芙纱官方旗舰店")
        self.assertEqual(node["formData"]["selectedGoodsType"], "指定商品ID")
        self.assertEqual(node["formData"]["item"], ["123456"])

    def test_denied_account_with_id_uses_category_item_fallback(self):
        response = self.compile(
            {
                "scope": "own_store",
                "brand": "IPSA",
                "canUseBrandAccount": False,
                "behaviors": ["购买"],
                "categories": [CATEGORY],
                "channels": ["天猫"],
                "productIds": ["620081427636"],
                "recentDays": 366,
            },
            "IPSA无账号ID替代人群",
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual([node["packageType"] for node in data["nodes"]], ["类目商品行为"])
        self.assertEqual(data["nodes"][0]["formData"]["item"], "620081427636")
        self.assertEqual(data["generated"]["compute"], "(0)")
        self.assertEqual(
            data["generated"]["list"][0]["selectionLv3"]["extraFilters"]["item"],
            "620081427636",
        )
        self.assertEqual(data["nextActions"], [])

    def test_unconfigured_brand_with_id_uses_category_item_and_offers_feedback(self):
        response = self.compile(
            {
                "scope": "own_store",
                "brand": "未配置测试品牌",
                "canUseBrandAccount": False,
                "behaviors": ["购买"],
                "categories": [CATEGORY],
                "channels": ["天猫"],
                "productIds": ["620081427636"],
                "recentDays": 366,
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 1)
        self.assertEqual(data["nodes"][0]["packageType"], "类目商品行为")
        self.assertEqual(data["nextActions"][0]["type"], "open_feedback")

    def test_fallback_with_id_does_not_require_category(self):
        response = self.compile(
            {
                "scope": "own_store",
                "brand": "IPSA",
                "canUseBrandAccount": False,
                "behaviors": ["购买"],
                "productIds": ["620081427636"],
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["nodes"][0]["packageType"], "类目商品行为")
        self.assertEqual(data["nodes"][0]["formData"]["item"], "620081427636")

    def test_category_item_multiple_ids_split_with_union(self):
        response = self.compile(
            {
                "component": "类目商品行为",
                "behaviors": ["购买"],
                "productIds": ["111", "222"],
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "ready")
        self.assertEqual([node["formData"]["item"] for node in data["nodes"]], ["111", "222"])
        self.assertEqual(data["nodes"][1]["operator"], "u")
        self.assertEqual(data["generated"]["compute"], "(0)u(1)")

    def test_missing_behavior_question_explains_component_and_offers_choices(self):
        response = self.compile(
            {
                "component": "类目公域行为",
                "categories": [CATEGORY],
                "recentDays": 30,
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "needs_clarification")
        question = next(item for item in data["questions"] if item["field"] == "behaviors")
        self.assertIn("浏览", question["prompt"])
        self.assertIn("组件名称", question["reason"])
        self.assertIn("购买", [item["value"] for item in question["options"]])

    def test_identical_questions_across_template_nodes_are_asked_once(self):
        response = self.client.post(
            "/api/ai/compile",
            json={
                "schemaVersion": 1,
                "conditions": [
                    {
                        "id": "first",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": ["乳液面霜"],
                    },
                    {
                        "id": "second",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": ["乳液面霜"],
                    },
                ],
            },
        )
        data = response.get_json()

        self.assertEqual(data["status"], "needs_clarification")
        category_questions = [
            item for item in data["questions"] if item["field"] == "leafCates"
        ]
        self.assertEqual(len(category_questions), 1)
        self.assertEqual(
            category_questions[0]["applyTargets"],
            [
                {
                    "conditionId": "first",
                    "field": "leafCates",
                    "intentField": "categories",
                },
                {
                    "conditionId": "second",
                    "field": "leafCates",
                    "intentField": "categories",
                },
            ],
        )

    def test_brand_core_categories_are_collected_in_one_multi_select_question(self):
        response = self.compile(
            {
                "id": "brand-core",
                "displayName": "对比时间内买过我品牌的人",
                "component": "类目公域行为",
                "behaviors": ["购买"],
                "brands": ["海蓝之谜"],
                "categories": ["面部护理套装", "乳液面霜", "化妆水/爽肤水"],
            }
        )
        data = response.get_json()
        category_questions = [
            item for item in data["questions"] if item["field"] == "leafCates"
        ]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(category_questions), 1)
        self.assertEqual(category_questions[0]["answerType"], "multi_select")
        self.assertEqual(category_questions[0]["parameterName"], "品牌核心类目")
        self.assertNotIn("maxSelections", category_questions[0])
        self.assertEqual(category_questions[0]["maxSelectionsPerNode"], 10)
        self.assertTrue(category_questions[0]["autoSplitOverflow"])
        self.assertEqual(len(category_questions[0]["optionGroups"]), 3)
        self.assertIn("全店二级类目销售额降序取前10项", category_questions[0]["reason"])
        self.assertIn("自行指定超过10项", category_questions[0]["reason"])
        self.assertNotIn("总数不限", category_questions[0]["prompt"])

    def test_brand_core_category_recognizes_this_brand_node_wording(self):
        response = self.compile(
            {
                "id": "brand-core-wording",
                "displayName": "去年买了我这个品牌",
                "component": "类目公域行为",
                "behaviors": ["购买"],
                "brands": ["CPB/肌肤之钥"],
            }
        )
        data = response.get_json()
        category_question = next(
            item for item in data["questions"] if item["field"] == "categories"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(category_question["parameterName"], "品牌核心类目")
        self.assertEqual(category_question["answerType"], "multi_select")
        self.assertTrue(category_question["autoSplitOverflow"])

    def test_brand_core_categories_split_only_after_all_other_parameters_are_present(self):
        categories = [
            "美容护肤/美体/精油>面部精华（新）",
            "美容护肤/美体/精油>面部护理套装",
            "美容护肤/美体/精油>乳液/面霜",
            "美容护肤/美体/精油>眼部护理（新）",
            "美容护肤/美体/精油>唇部护理（新）",
            "美容护肤/美体/精油>洁面",
            "美容护肤/美体/精油>化妆水/爽肤水",
            "美容护肤/美体/精油>面膜（新）",
            "美容护肤/美体/精油>防晒（新）",
            "美容护肤/美体/精油>T区护理（新）",
            "美容护肤/美体/精油>颈部护理",
        ]
        response = self.compile(
            {
                "id": "brand-core",
                "displayName": "对比时间内买过我品牌的人",
                "component": "类目公域行为",
                "behaviors": ["购买"],
                "brands": ["Dior/迪奥"],
                "categories": categories,
                "channels": ["天猫"],
                "recentDays": 180,
            }
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 2)
        self.assertEqual(data["nodes"][0]["formData"]["leafCates"], categories[:10])
        self.assertEqual(data["nodes"][1]["formData"]["leafCates"], categories[10:])
        self.assertIsNone(data["nodes"][0]["operator"])
        self.assertEqual(data["nodes"][1]["operator"], "u")
        for node in data["nodes"]:
            self.assertEqual(node["formData"]["bhv"], ["购买"])
            self.assertEqual(node["formData"]["stdBrand"], ["Dior/迪奥"])
            self.assertEqual(node["formData"]["channel"], ["天猫"])
            self.assertEqual(node["modeData"]["time"], "recent")
            self.assertEqual(node["formData"]["time"]["days"], 180)
        self.assertTrue(any("其余参数齐全后" in item for item in data["warnings"]))

    def test_attribute_values_require_an_explicit_attribute_component(self):
        response = self.compile({"attributes": ["L4", "L5"]})
        data = response.get_json()

        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(data["questions"][0]["field"], "component")

    def test_attribute_component_does_not_infer_missing_level(self):
        response = self.compile({"component": "预测购买力"})
        data = response.get_json()

        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(data["questions"][0]["field"], "attributes")

    def test_unknown_live_option_returns_search_action_instead_of_inventing_value(self):
        response = self.compile(
            {
                "behaviors": ["购买"],
                "categories": ["绝对不存在的测试类目"],
            }
        )
        data = response.get_json()

        self.assertEqual(data["status"], "needs_clarification")
        question = next(item for item in data["questions"] if item["field"] == "leafCates")
        self.assertEqual(question["action"]["type"], "search_options")
        self.assertEqual(data["nodes"], [])

    def test_brand_zone_intent_compiles_scalar_account_and_behavior(self):
        response = self.compile(
            {
                "component": "品牌专区",
                "adAccount": "dior迪奥官方旗舰店",
                "behaviors": ["点击过广告"],
                "behaviorDays": {"min": 180, "max": None},
                "recentDays": 180,
            },
            "迪奥广告点击人群",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 1)
        node = data["nodes"][0]
        self.assertEqual(node["packageType"], "品牌专区")
        self.assertEqual(node["formData"]["account"], "dior迪奥官方旗舰店")
        self.assertEqual(node["formData"]["bhv"], "点击过广告")
        self.assertEqual(node["modeData"]["dayFrequency"], "min")
        self.assertEqual(node["modeData"]["time"], "recent")
        self.assertEqual(
            data["generated"]["list"][0],
            {
                "selectionLv1": ["FIELD", "AD"],
                "selectionLv3": {
                    "contType": "bhv",
                    "account": "2207959261164#|#2207959261164",
                    "dayFrequency": {"op": "OPEN_CLOSE", "min": 180},
                    "bhv": "15300#|#CLICK_AD",
                    "dateType": "RELATIVE_RANGE",
                    "dateValue": "180",
                },
                "fromPoolId": 0,
                "selectionLv2Name": "品牌专区",
                "selectionLv2": ["15250#|#EB"],
            },
        )

    def test_brand_zone_multiple_behaviors_split_into_single_choice_nodes(self):
        response = self.compile(
            {
                "component": "品牌专区",
                "behaviors": ["被广告曝光过", "点击过广告"],
                "behaviorMatch": "any",
                "recentDays": 30,
            }
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 2)
        self.assertEqual(
            [node["formData"]["bhv"] for node in data["nodes"]],
            ["被广告曝光过", "点击过广告"],
        )
        self.assertEqual(data["nodes"][1]["operator"], "u")
        self.assertEqual(data["generated"]["compute"], "(0)u(1)")

    def test_effect_promotion_intent_compiles_dynamic_view_scenes(self):
        response = self.compile(
            {
                "component": "效果推广",
                "adAccount": "dior迪奥官方旗舰店",
                "behaviors": ["观看"],
                "adScenes": ["超级直播", "超级短视频", "短直联动"],
                "recentDays": 180,
            },
            "迪奥效果推广观看人群",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        node = data["nodes"][0]
        self.assertEqual(node["packageType"], "效果推广")
        self.assertEqual(node["formData"]["bhv"], "观看")
        self.assertEqual(
            node["formData"]["onebp_scene"],
            ["超级直播", "超级短视频", "短直联动"],
        )
        self.assertEqual(
            data["generated"]["list"][0]["selectionLv3"],
            {
                "account": "2207959261164#|#2207959261164",
                "bhv": "15323#|#onebp_view",
                "onebp_scene": ["15397#|#108", "15398#|#183", "15399#|#341"],
                "dateType": "RELATIVE_RANGE",
                "dateValue": "180",
                "dayFrequency": {"op": "OPEN_OPEN"},
            },
        )

    def test_effect_promotion_click_keyword_ad_uses_confirmed_scene_id(self):
        response = self.compile(
            {
                "component": "效果推广",
                "adAccount": "dior迪奥官方旗舰店",
                "behaviors": ["点击"],
                "adScenes": ["关键词推广(原淘内广告/直通车)"],
                "dateRange": ["2026-08-01", "2026-08-31"],
            },
            "DIOR官旗8月直通车点击",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(
            data["generated"]["list"][0]["selectionLv3"]["onebp_scene"],
            ["15402#|#371"],
        )

    def test_effect_promotion_requires_explicit_ad_account(self):
        response = self.compile(
            {
                "component": "效果推广",
                "behaviors": ["观看"],
                "adScenes": ["超级直播"],
                "recentDays": 180,
            }
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "needs_clarification")
        question = next(item for item in data["questions"] if item["field"] == "adAccount")
        self.assertEqual(question["answerType"], "single_select")
        self.assertEqual(
            [item["label"] for item in question["options"]],
            ["全部", "dior迪奥官方旗舰店"],
        )

    def test_omnimedia_intent_compiles_click_with_official_payload(self):
        response = self.compile(
            {
                "component": "全媒体智投",
                "behaviors": ["点击"],
                "recentDays": 180,
            },
            "全媒体智投点击人群",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        node = data["nodes"][0]
        self.assertEqual(node["packageType"], "全媒体智投")
        self.assertEqual(node["formData"]["bhv"], "点击")
        self.assertEqual(node["modeData"]["dayFrequency"], "unlimited")
        self.assertEqual(node["modeData"]["time"], "recent")
        self.assertEqual(
            data["generated"]["list"][0],
            {
                "selectionLv1": ["FIELD", "AD"],
                "selectionLv3": {
                    "dayFrequency": {"op": "OPEN_OPEN"},
                    "bhv": "19874#|#EXP_UD_ZHT_EXP_BHV",
                    "bhv_type": "click_udzht",
                    "dateType": "RELATIVE_RANGE",
                    "dateValue": "180",
                },
                "tipProperty": {
                    "dateTo": "20240717",
                    "type": 3,
                    "dateFrom": "20240615",
                    "content": "原UD智汇投更名为全媒体智投",
                },
                "fromPoolId": 1,
                "selectionLv2Name": "全媒体智投",
                "selectionLv2": ["19872#|#EXP_UD_ZHT_EXP_BHV"],
            },
        )

    def test_single_media_intent_compiles_click_with_official_payload(self):
        response = self.compile(
            {
                "component": "单媒体智投",
                "behaviors": ["点击"],
                "recentDays": 180,
            },
            "单媒体智投点击人群",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        node = data["nodes"][0]
        self.assertEqual(node["packageType"], "单媒体智投")
        self.assertEqual(node["formData"]["bhv"], "点击")
        self.assertEqual(node["modeData"]["time"], "recent")
        self.assertEqual(
            data["generated"]["list"][0],
            {
                "selectionLv1": ["FIELD", "AD"],
                "selectionLv3": {
                    "bhv": "19938#|#is_click_uddmt",
                    "dateType": "RELATIVE_RANGE",
                },
                "tipProperty": {
                    "dateTo": "20990129",
                    "type": 3,
                    "dateFrom": "20250814",
                },
                "fromPoolId": 0,
                "selectionLv2Name": "单媒体智投",
                "selectionLv2": ["19936#|#cate_9195"],
            },
        )

    def test_t2_title_keywords_split_into_four_union_nodes(self):
        keywords = [
            "所有女生", "曹米娅", "k姐", "心愿", "吉杰", "李好", "king", "曹颖", "达人专属", "主播甄选",
            "蜜蜂", "香菇", "陈洁", "交个朋友", "禧物社", "胡可", "莉贝琳", "晁然", "林依轮", "代王",
            "蜂狂", "烈儿", "香菇618", "呼呼美呼", "胡兵", "明道", "小小玉米", "国际名模-丹妮", "丹妮", "魔妆倩",
            "sisy莉贝琳", "大物是也",
        ]
        response = self.compile(
            {
                "component": "类目公域行为",
                "behaviors": ["购买"],
                "categories": [LIPSTICK_CATEGORY],
                "channels": ["天猫"],
                "titleKeywords": keywords,
                "dateRange": ["2026-08-01", "2026-08-31"],
            },
            "T2直播间口红购买",
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(len(data["nodes"]), 4)
        self.assertEqual(data["generated"]["compute"], "(0)u(1)u(2)u(3)")
        self.assertEqual([node["operator"] for node in data["nodes"]], [None, "u", "u", "u"])
        self.assertEqual(
            [node["formData"]["title"] for node in data["nodes"]],
            [keywords[:10], keywords[10:20], keywords[20:30], keywords[30:]],
        )
        for node in data["generated"]["list"]:
            self.assertEqual(node["selectionLv3"]["leafCates"], ["50010808#|#50010808"])
            self.assertEqual(node["selectionLv3"]["dateValue"], {"from": "20260801", "to": "20260831"})
            self.assertEqual(node["selectionLv3"]["extraFilters"]["channel"], ["16772#|#4"])

    def test_overflow_titles_and_all_behaviors_refuse_ambiguous_grouping(self):
        response = self.compile(
            {
                "component": "类目公域行为",
                "behaviors": ["浏览", "购买"],
                "behaviorMatch": "all",
                "categories": [LIPSTICK_CATEGORY],
                "titleKeywords": [str(index) for index in range(11)],
                "recentDays": 30,
            }
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("无法无歧义表达分组关系", response.get_json()["message"])

    def test_brand_promotion_special_show_matches_workbook_source(self):
        response = self.compile(
            {
                "component": "品牌推广",
                "behaviors": ["曝光"],
                "adScenes": ["淘内展示营销-品牌特秀（原品牌特秀）"],
                "dateRange": ["2026-08-01", "2026-08-31"],
            },
            "DIOR特秀曝光",
        )
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["nodes"][0]["packageType"], "品牌推广")
        self.assertEqual(
            data["generated"]["list"][0]["selectionLv3"],
            {
                "cate": "ALL",
                "bhv": "15318#|#exp_pptg",
                "ppob_scene": ["15365#|#49"],
                "dateType": "ABSOLUTE_DATE_RANGE",
                "dateValue": {"from": "20260801", "to": "20260831"},
                "dayFrequency": {"op": "OPEN_OPEN"},
            },
        )

    def test_invalid_intermediate_contract_returns_400(self):
        response = self.client.post(
            "/api/ai/compile",
            json={"schemaVersion": 1, "conditions": []},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "INVALID_INTENT")


if __name__ == "__main__":
    unittest.main(verbosity=2)
