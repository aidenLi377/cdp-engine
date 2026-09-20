from __future__ import annotations

import json
import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch

import httpx

os.environ["FLASK_ENV"] = "development"

from cdp_backend.ai_model_client import AiModelClient  # noqa: E402
from cdp_backend.ai_chat_service import AiChatService, DMP_DEFAULT_TAG_NAMES  # noqa: E402
from cdp_backend.ai_solution_knowledge import AiSolutionKnowledge  # noqa: E402
from cdp_backend.business_date import (  # noqa: E402
    business_today,
    latest_selectable_date,
    resolve_business_period,
)
from cdp_backend.solution_store import SolutionStore  # noqa: E402
from test_support import create_authenticated_test_app  # noqa: E402


CATEGORY = "美容护肤/美体/精油>乳液/面霜"


def responses_payload(result: dict) -> dict:
    return {
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(result, ensure_ascii=False),
                    }
                ],
            }
        ]
    }


class AiModelClientTests(unittest.TestCase):
    def test_responses_request_uses_structured_output_and_parses_json(self):
        captured = {}

        def caller(request):
            captured.update(request)
            return responses_payload(
                {
                    "assistantMessage": "已经理解。",
                    "intent": {"schemaVersion": 1, "conditions": [{}]},
                }
            )

        client = AiModelClient(
            api_key="server-secret",
            model="test-model",
            caller=caller,
        )
        result = client.interpret("system", {"userMessage": "圈人"})

        self.assertEqual(result["assistantMessage"], "已经理解。")
        self.assertTrue(captured["url"].endswith("/responses"))
        self.assertFalse(captured["json"]["store"])
        self.assertEqual(
            captured["json"]["text"]["format"]["type"], "json_schema"
        )

    def test_chat_completions_compatible_mode(self):
        captured = {}

        def caller(request):
            captured.update(request)
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"assistantMessage": "好", "intent": None},
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }

        client = AiModelClient(
            api_key="server-secret",
            model="compatible-model",
            api_style="chat_completions",
            output_mode="json_object",
            max_input_tokens=1_000_000,
            max_output_tokens=8192,
            token_field="max_completion_tokens",
            reasoning_effort="max",
            thinking_mode="disabled",
            caller=caller,
        )
        self.assertIsNone(client.interpret("system", {"x": 1})["intent"])
        self.assertTrue(captured["url"].endswith("/chat/completions"))
        self.assertEqual(captured["json"]["response_format"], {"type": "json_object"})
        self.assertEqual(captured["json"]["max_completion_tokens"], 8192)
        self.assertEqual(captured["json"]["reasoning_effort"], "max")
        self.assertEqual(captured["json"]["thinking"], {"type": "disabled"})
        self.assertEqual(client.status()["maxInputTokens"], 1_000_000)
        self.assertEqual(client.status()["thinkingMode"], "disabled")

    def test_transient_transport_error_is_retried_without_affecting_normal_calls(self):
        client = AiModelClient(api_key="server-secret", model="test-model")
        successful_response = type(
            "SuccessfulResponse",
            (),
            {
                "status_code": 200,
                "json": staticmethod(
                    lambda: responses_payload(
                        {"assistantMessage": "已恢复。", "intent": None}
                    )
                ),
            },
        )()
        with patch(
            "cdp_backend.ai_model_client.httpx.post",
            side_effect=[httpx.ConnectError("temporary"), successful_response],
        ) as post_mock, patch("cdp_backend.ai_model_client.time.sleep") as sleep_mock:
            result = client.interpret("system", {"userMessage": "圈人"})

        self.assertEqual(result["assistantMessage"], "已恢复。")
        self.assertEqual(post_mock.call_count, 2)
        sleep_mock.assert_called_once_with(0.4)


class AiChatApiTests(unittest.TestCase):
    def test_chat_retries_once_when_model_returns_invalid_json(self):
        calls = 0

        def caller(_request):
            nonlocal calls
            calls += 1
            if calls == 1:
                return {
                    "output": [
                        {
                            "type": "message",
                            "content": [{"type": "output_text", "text": ""}],
                        }
                    ]
                }
            return responses_payload(
                {
                    "assistantMessage": "已恢复结构化意图。",
                    "intent": {
                        "schemaVersion": 1,
                        "audienceName": "近30天面霜购买人群",
                        "conditions": [
                            {
                                "component": "类目公域行为",
                                "behaviors": ["购买"],
                                "categories": [CATEGORY],
                                "recentDays": 30,
                            }
                        ],
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-invalid-json-retry-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "圈最近30天购买过面霜的人"},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(calls, 2)
        finally:
            test_app.close()

    def test_old_ninety_five_percent_cache_is_not_misrepresented_as_top_ten(self):
        knowledge = AiSolutionKnowledge.__new__(AiSolutionKnowledge)
        profile = {
            "storeName": "DIOR迪奥官方旗舰店",
            "normalizedStoreName": "dior迪奥",
            "allCategoryCount": 22,
            "fullyMapped": True,
            "coreCategories": [
                {"rank": index, "categoryPath": f"分类>{index}", "cateId": str(index)}
                for index in range(1, 10)
            ],
        }
        knowledge._load_store_category_knowledge = lambda: {"profiles": [profile]}
        self.assertEqual(knowledge.brand_core_categories("DIOR"), [])
        profile["coreCategories"].append(
            {"rank": 10, "categoryPath": "分类>10", "cateId": "10"}
        )
        self.assertEqual(len(knowledge.brand_core_categories("DIOR")), 10)

    def test_dior_whole_store_top_ten_is_distinct_from_makeup_top_ten(self):
        knowledge = AiSolutionKnowledge(object())
        whole_store = knowledge.brand_core_categories("Dior/迪奥")
        makeup = knowledge.brand_category_group_top_categories("Dior/迪奥", "彩妆")
        skincare = knowledge.brand_category_group_top_categories("Dior/迪奥", "护肤")
        self.assertEqual(len(whole_store), 10)
        self.assertEqual(len(makeup), 7)
        self.assertTrue(all("彩妆/香水/美妆工具>" in item for item in makeup))
        self.assertTrue(any("香水/香水用品" in item for item in makeup))
        self.assertTrue(any("美容工具" in item for item in makeup))
        self.assertEqual(len(skincare), 10)
        self.assertTrue(all("美容护肤/美体/精油>" in item for item in skincare))

    def test_short_makeup_scope_explains_that_all_ranked_rows_are_used(self):
        class StubEngine:
            dimensions = {"品牌维表.csv": ["Dior/迪奥"]}

        class StubCompiler:
            engine = StubEngine()

        service = object.__new__(AiChatService)
        service.compiler = StubCompiler()
        service.solution_knowledge = AiSolutionKnowledge(object())
        makeup = service.solution_knowledge.brand_category_group_top_categories(
            "Dior/迪奥", "彩妆"
        )

        note = service._brand_category_scope_note(
            {
                "conditions": [
                    {
                        "brands": ["Dior/迪奥"],
                        "categories": makeup,
                    }
                ]
            },
            "Dior彩妆品类老客",
        )

        self.assertIn("口径对应一级类目“彩妆/香水/美妆工具”", note)
        self.assertIn("只有7个有销售额的二级类目", note)
        self.assertIn("先限定一级类目再按销售额排序", note)
        self.assertIn("并非从全店TOP10中筛选", note)

    def test_exact_confirmed_example_recovers_when_model_returns_no_intent(self):
        test_app = create_authenticated_test_app(
            "ai-curated-recovery-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "请继续告诉我需要圈选的人群条件。",
                        "intent": None,
                    }
                ),
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "XT_2508香水搜索浏览全球购_副本"},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(
                [node["packageType"] for node in data["plan"]["nodes"]],
                ["关键词搜索", "商品行为"],
            )
            self.assertEqual(data["plan"]["generated"]["compute"], "(0)n(1)")
        finally:
            test_app.close()

    def test_half_year_vs_previous_half_year_defaults_to_rolling_180_days(self):
        service = AiChatService.__new__(AiChatService)
        with patch(
            "cdp_backend.ai_chat_service.latest_selectable_date",
            return_value=date(2026, 9, 16),
        ):
            self.assertEqual(
                service._message_solution_time_value(
                    "半年vs前半年", "统计时间", time_parameter_count=2,
                    pending_parameter=False,
                ),
                {"recentDays": 180},
            )
            self.assertEqual(
                service._message_solution_time_value(
                    "完整半年vs前半年", "统计时间", time_parameter_count=2,
                    pending_parameter=False,
                ),
                {"dateRange": ["2026-01-01", "2026-06-30"]},
            )
            self.assertEqual(
                service._message_solution_time_value(
                    "这半年跟前面半年比", "统计时间", time_parameter_count=2,
                    pending_parameter=False,
                ),
                {"recentDays": 180},
            )
            self.assertEqual(service._comparison_period_days("过去一年"), 365)

    def test_historical_category_buyer_phrases_match_category_old_and_new_customer(self):
        service = AiChatService.__new__(AiChatService)

        class Knowledge:
            @staticmethod
            def list_summaries():
                return [
                    {"id": "transfer", "name": "转牌新客"},
                    {"id": "new", "name": "品类新客"},
                    {"id": "competitor", "name": "共同浏览后_购买竞品"},
                ]

        service.solution_knowledge = Knowledge()
        self.assertEqual(
            service._match_public_solution(
                {}, "圈出前一年买过彩妆但没有买过DIOR产品，近一年买DIOR彩妆的人群"
            )["name"],
            "品类老客",
        )
        self.assertEqual(
            service._match_public_solution(
                {}, "圈出前一年没有买过彩妆品类和DIOR产品，但近一年买DIOR彩妆的人群"
            )["name"],
            "品类新客",
        )
        self.assertEqual(
            service._match_public_solution({}, "找从别的牌子转来的转牌新客")["name"],
            "转牌新客",
        )
        self.assertIsNone(
            service._match_public_solution(
                {}, "圈出DIOR官旗8月份浏览未购品牌任意渠道，购买竞品彩妆的人群"
            )
        )

    def test_store_browse_purchase_paths_keep_scopes_and_one_month(self):
        service = AiChatService.__new__(AiChatService)
        service._infer_official_store_brand = lambda _message: "Dior/迪奥"
        service.solution_knowledge = AiSolutionKnowledge(object())
        examples = (
            (
                "圈出DIOR官旗8月份浏览且购买官旗任意商品的人群",
                ["intersect"], ["own_store", "own_store"],
                [["天猫"], ["天猫"]],
            ),
            (
                "圈出DIOR官旗8月份浏览未购官旗，购买天猫国际的人群",
                ["exclude", "intersect"],
                ["own_store", "own_store", "own_brand"],
                [["天猫"], ["天猫"], ["天猫国际"]],
            ),
            (
                "圈出DIOR官旗8月份浏览未购品牌任意渠道，购买竞品彩妆的人群",
                ["exclude", "intersect"],
                ["own_store", "own_brand", None],
                [["天猫"], ["所有销售渠道"], ["天猫"]],
            ),
        )
        with patch(
            "cdp_backend.ai_chat_service.latest_selectable_date",
            return_value=date(2026, 9, 16),
        ):
            for message, relations, scopes, channels in examples:
                with self.subTest(message=message):
                    grounded = service._ground_store_browse_purchase_intent(
                        {"conditions": [{"recentDays": 366}]}, message
                    )
                    conditions = grounded["conditions"]
                    self.assertEqual(
                        [item.get("relation") for item in conditions[1:]], relations
                    )
                    self.assertEqual(
                        [item.get("scope") for item in conditions], scopes
                    )
                    self.assertEqual(
                        [item.get("channels") for item in conditions], channels
                    )
                    self.assertTrue(
                        all(item["dateRange"] == ["2026-08-01", "2026-08-31"]
                            for item in conditions)
                    )

    def test_store_browse_purchase_paths_compile_without_model_scope_drift(self):
        test_app = create_authenticated_test_app(
            "ai-store-purchase-path-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "已理解。",
                        "intent": {
                            "schemaVersion": 1,
                            "audienceName": "测试人群",
                            "conditions": [
                                {
                                    "component": "商品行为",
                                    "scope": "own_store",
                                    "brand": "DIOR",
                                    "channels": ["天猫"],
                                    "behaviors": ["浏览"],
                                    "dateRange": ["2026-01-01", "2026-08-31"],
                                }
                            ],
                        },
                        "operation": None,
                    }
                ),
            },
        )
        try:
            for message, expected_count, expected_compute in (
                ("圈出DIOR官旗8月份浏览且购买官旗任意商品的人群", 2, "(0)n(1)"),
                ("圈出DIOR官旗8月份浏览未购官旗，购买天猫国际的人群", 3, "(0)d(1)n(2)"),
                ("圈出DIOR官旗8月份浏览未购品牌任意渠道，购买竞品彩妆的人群", 3, "(0)d(1)n(2)"),
            ):
                with self.subTest(message=message):
                    response = test_app.client.post("/api/ai/chat", json={"message": message})
                    self.assertEqual(response.status_code, 200, response.get_json())
                    data = response.get_json()
                    self.assertEqual(len(data["intent"]["conditions"]), expected_count)
                    self.assertEqual(
                        [item["dateRange"] for item in data["intent"]["conditions"]],
                        [["2026-08-01", "2026-08-31"]] * expected_count,
                    )
                    if data["plan"].get("generated"):
                        self.assertEqual(data["plan"]["generated"]["compute"], expected_compute)
                    else:
                        self.assertEqual(data["plan"]["status"], "needs_clarification")
        finally:
            test_app.close()

    def test_broad_dior_brand_old_customer_matches_solution_and_year(self):
        service = AiChatService.__new__(AiChatService)

        class Knowledge:
            @staticmethod
            def list_summaries():
                return [{"id": "brand-old", "name": "品牌老客"}]

        service.solution_knowledge = Knowledge()
        matched = service._match_public_solution(
            {}, "圈出DIOR品牌近一年的老客"
        )
        self.assertEqual(matched["name"], "品牌老客")
        self.assertEqual(service._comparison_period_days("近一年"), 365)

    def test_d11_campaign_shorthand_compiles_verified_aipl_segments(self):
        test_app = create_authenticated_test_app(
            "ai-d11-campaign-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "正在整理。",
                        "intent": {
                            "schemaVersion": 1,
                            "audienceName": "D11人群",
                            "conditions": [
                                {
                                    "component": "AIPL状态",
                                    "aiplStatuses": ["认知"],
                                    "recentDays": 30,
                                }
                            ],
                        },
                        "operation": None,
                    }
                ),
            },
        )
        expected = {
            "蓄水期A": ("(0)d(1)", [["15184#|#D_AWARENESS"], ["15185#|#D_INTEREST", "15186#|#D_BUY", "15187#|#D_ROYALTY"]], [["20250915", "20251014"], ["20250915", "20251014"]]),
            "蓄水期I": ("(0)d(1)", [["15185#|#D_INTEREST"], ["15186#|#D_BUY", "15187#|#D_ROYALTY"]], [["20250915", "20251014"], ["20250915", "20251014"]]),
            "蓄水期PL": ("(0)", [["15186#|#D_BUY", "15187#|#D_ROYALTY"]], [["20250915", "20251014"]]),
            "活动期A": ("(0)d(1)d(2)", [["15184#|#D_AWARENESS"], ["15185#|#D_INTEREST"], ["15184#|#D_AWARENESS", "15185#|#D_INTEREST", "15186#|#D_BUY", "15187#|#D_ROYALTY"]], [["20251015", "20251114"], ["20251015", "20251114"], ["20250915", "20251014"]]),
            "活动期I": ("(0)d(1)", [["15185#|#D_INTEREST"], ["15184#|#D_AWARENESS", "15185#|#D_INTEREST", "15186#|#D_BUY", "15187#|#D_ROYALTY"]], [["20251015", "20251114"], ["20250915", "20251014"]]),
            "活动期PL": ("(0)d(1)d(2)", [["15186#|#D_BUY", "15187#|#D_ROYALTY"], ["15184#|#D_AWARENESS", "15185#|#D_INTEREST"], ["15184#|#D_AWARENESS", "15185#|#D_INTEREST", "15186#|#D_BUY", "15187#|#D_ROYALTY"]], [["20251015", "20251114"], ["20251015", "20251114"], ["20250915", "20251014"]]),
        }
        try:
            for label, (compute, statuses, ranges) in expected.items():
                with self.subTest(label=label):
                    response = test_app.client.post(
                        "/api/ai/chat",
                        json={"message": f"圈出DIOR品牌D11{label}人群"},
                    )
                    data = response.get_json()
                    self.assertEqual(data["plan"]["status"], "ready")
                    generated = data["plan"]["generated"]
                    self.assertEqual(generated["compute"], compute)
                    actual_statuses = [
                        item["selectionLv3"]["types"] for item in generated["list"]
                    ]
                    actual_ranges = [
                        [
                            item["selectionLv3"]["dateValue"]["from"],
                            item["selectionLv3"]["dateValue"]["to"],
                        ]
                        for item in generated["list"]
                    ]
                    self.assertEqual(actual_statuses, statuses)
                    self.assertEqual(actual_ranges, ranges)
        finally:
            test_app.close()

    def test_future_d11_year_requires_dates_instead_of_reusing_2025(self):
        test_app = create_authenticated_test_app(
            "ai-d11-future-year-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: self.fail("不能调用模型猜2026年的活动日期"),
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "圈出DIOR品牌2026年D11蓄水期A人群"},
            )
            data = response.get_json()
            self.assertEqual(data["status"], "collecting")
            self.assertIsNone(data["plan"])
            self.assertIn("2026", data["reply"])
        finally:
            test_app.close()

    def test_vague_first_turn_guides_user_without_calling_model(self):
        def caller(_request):
            raise AssertionError("过短且含义不明的首轮输入不应调用模型")

        test_app = create_authenticated_test_app(
            "ai-vague-first-turn-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post("/api/ai/chat", json={"message": "圈人"})
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "collecting")
            self.assertIsNone(data["plan"])
            self.assertIn("品牌、类目或商品ID", data["reply"])
            self.assertIn("行为和时间", data["reply"])
        finally:
            test_app.close()

    def test_ambiguous_new_customer_phrase_explains_the_missing_meaning(self):
        def caller(_request):
            raise AssertionError("含义不明的新客短句不应调用模型")

        test_app = create_authenticated_test_app(
            "ai-vague-new-customer-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post("/api/ai/chat", json={"message": "新客"})
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "collecting")
            self.assertIn("品类新客", data["reply"])
            self.assertIn("转牌新客", data["reply"])
        finally:
            test_app.close()

    def test_ambiguous_makeup_new_customer_keeps_known_category_scope(self):
        reply = AiChatService._intent_elaboration_reply("Dior彩妆新客")
        self.assertIn("先限定该品牌的彩妆二级类目", reply)
        self.assertIn("不用你逐个选类目", reply)
        self.assertIn("品类新客", reply)
        self.assertIn("转牌新客", reply)
        self.assertIn("统计时间和对比时间", reply)
        self.assertNotIn("补充分析类目", reply)

    def test_brand_plus_ambiguous_old_customer_guides_without_calling_model(self):
        def caller(_request):
            raise AssertionError("品牌加泛称老客仍应先确认口径，不应调用模型")

        test_app = create_authenticated_test_app(
            "ai-vague-brand-old-customer-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat", json={"message": "看下海蓝之谜老客"}
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "collecting")
            self.assertIn("品类老客", data["reply"])
            self.assertIn("品牌老客", data["reply"])
            self.assertIn("时间", data["reply"])
        finally:
            test_app.close()

    def test_free_form_recent_time_is_clarified_before_plan_becomes_applicable(self):
        test_app = create_authenticated_test_app(
            "ai-vague-recent-time-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "请补充统计时间。",
                        "intent": {
                            "schemaVersion": 1,
                            "conditions": [
                                {
                                    "component": "类目公域行为",
                                    "behaviors": ["购买"],
                                    "categories": [CATEGORY],
                                }
                            ],
                        },
                    }
                ),
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat", json={"message": "帮我圈最近买过面霜的人"}
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "needs_clarification")
            self.assertIn("最近", data["reply"])
            self.assertEqual(data["plan"]["nodes"], [])
            self.assertEqual(
                data["plan"]["questions"][0]["parameterName"], "统计时间"
            )
        finally:
            test_app.close()

    def test_free_form_model_cannot_invent_behavior_or_time(self):
        test_app = create_authenticated_test_app(
            "ai-vague-model-grounding-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "已默认按购买和近30天处理。",
                        "intent": {
                            "schemaVersion": 1,
                            "conditions": [
                                {
                                    "component": "类目公域行为",
                                    "behaviors": ["购买"],
                                    "brands": ["Dior/迪奥"],
                                    "categories": [
                                        "彩妆/香水/美妆工具>香水/香水用品"
                                    ],
                                    "recentDays": 30,
                                }
                            ],
                        },
                    }
                ),
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat", json={"message": "圈一批Dior香水的人"}
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "needs_clarification")
            self.assertIn("用户行为", data["reply"])
            condition = data["intent"]["conditions"][0]
            self.assertNotIn("behaviors", condition)
            self.assertNotIn("recentDays", condition)
            self.assertNotIn("dateRange", condition)
            self.assertEqual(data["plan"]["nodes"], [])
        finally:
            test_app.close()

    def test_bare_dmp_phrase_guides_before_creating_an_operation(self):
        def caller(_request):
            raise AssertionError("只有‘达摩盘’三个字时不应调用模型")

        test_app = create_authenticated_test_app(
            "ai-vague-dmp-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post("/api/ai/chat", json={"message": "达摩盘"})
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "collecting")
            self.assertIsNone(data["operation"])
            self.assertIn("人群包名称", data["reply"])
            self.assertIn("画像", data["reply"])
        finally:
            test_app.close()

    def test_official_store_in_multi_condition_does_not_overwrite_other_channels(self):
        test_app = create_authenticated_test_app("ai-multi-channel-store-user")
        try:
            service = AiChatService.__new__(AiChatService)

            class Compiler:
                engine = test_app.engine

            class Knowledge:
                @staticmethod
                def find_verified_brand_account_access(_brand):
                    return {"canUseBrandAccount": True}

            service.compiler = Compiler()
            service.solution_knowledge = Knowledge()
            intent = {
                "conditions": [
                    {"component": "商品行为", "scope": "own_store", "brand": "Dior", "behaviors": ["浏览"], "channels": ["天猫"]},
                    {"component": "商品行为", "scope": "own_brand", "brand": "Dior", "behaviors": ["购买"], "channels": ["所有销售渠道"]},
                    {"component": "商品行为", "scope": "own_brand", "brand": "Dior", "behaviors": ["购买"], "channels": ["天猫国际"]},
                    {"component": "类目公域行为", "behaviors": ["购买"], "categories": ["彩妆/香水/美妆工具>唇部彩妆"]},
                ]
            }
            grounded = service._ground_official_store_intent(
                intent, "Dior官旗浏览，排除品牌所有销售渠道购买，再交集天猫国际购买和唇部彩妆大盘"
            )
            self.assertEqual(grounded["conditions"][0]["channels"], ["天猫"])
            self.assertTrue(grounded["conditions"][0]["canUseBrandAccount"])
            self.assertEqual(grounded["conditions"][1]["channels"], ["所有销售渠道"])
            self.assertEqual(grounded["conditions"][1]["scope"], "own_brand")
            self.assertEqual(grounded["conditions"][2]["channels"], ["天猫国际"])
            self.assertEqual(grounded["conditions"][3]["component"], "类目公域行为")
        finally:
            test_app.close()

    def test_official_store_grounding_forces_tmall_account_and_explicit_access(self):
        from cdp_backend.ai_chat_service import AiChatService

        test_app = create_authenticated_test_app(
            "ai-official-store-grounding-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "已经理解。",
                        "intent": {
                            "schemaVersion": 1,
                            "audienceName": "Dior官旗香水浏览",
                            "conditions": [
                                {
                                    "component": "类目公域行为",
                                    "behaviors": ["浏览"],
                                    "categories": ["彩妆/香水/美妆工具>香水/香水用品"],
                                    "channels": ["所有销售渠道"],
                                    "dateRange": ["2025-08-01", "2025-08-31"],
                                }
                            ],
                        },
                        "operation": None,
                    }
                ),
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "看2025年8月Dior官旗浏览香水的人，我可以使用官旗账号。"
                },
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["plan"]["status"], "ready")
            condition = data["intent"]["conditions"][0]
            self.assertEqual(condition["component"], "商品行为")
            self.assertEqual(condition["channels"], ["天猫"])
            self.assertEqual(condition["brand"], "DIOR迪奥")
            self.assertTrue(condition["canUseBrandAccount"])
            generated = data["plan"]["generated"]["list"][0]
            self.assertEqual(generated["selectionLv2"], ["16612#|#4"])
            self.assertEqual(
                generated["selectionLv3"]["shop"],
                "376414317#|#376414317",
            )
        finally:
            test_app.close()

    def test_dior_official_store_uses_configured_default_account_access(self):
        test_app = create_authenticated_test_app(
            "ai-official-store-permission-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "已经理解。",
                        "intent": {
                            "schemaVersion": 1,
                            "audienceName": "Dior官旗香水浏览",
                            "conditions": [
                                {
                                    "component": "商品行为",
                                    "behaviors": ["浏览"],
                                    "brand": "Dior",
                                    "categories": ["彩妆/香水/美妆工具>香水/香水用品"],
                                    "dateRange": ["2025-08-01", "2025-08-31"],
                                }
                            ],
                        },
                        "operation": None,
                    }
                ),
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "看2025年8月Dior官旗浏览香水的人。"},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["plan"]["status"], "ready")
            condition = data["intent"]["conditions"][0]
            self.assertTrue(condition["canUseBrandAccount"])
            self.assertEqual(condition["component"], "商品行为")
            self.assertEqual(condition["channels"], ["天猫"])
        finally:
            test_app.close()

    def test_platform_channel_without_store_signal_is_brand_aggregate(self):
        test_app = create_authenticated_test_app(
            "ai-channel-aggregate-grounding-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": lambda _request: responses_payload(
                    {
                        "assistantMessage": "已经理解。",
                        "intent": {
                            "schemaVersion": 1,
                            "audienceName": "香水搜索浏览全球购",
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
                                    "canUseBrandAccount": None,
                                    "behaviors": ["浏览"],
                                    "categories": ["彩妆/香水/美妆工具>香水/香水用品"],
                                    "channels": ["全球购"],
                                    "dateRange": ["2025-08-01", "2025-08-31"],
                                },
                            ],
                        },
                        "operation": None,
                    }
                ),
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "XT_2508香水搜索浏览全球购_副本"},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["plan"]["status"], "ready")
            self.assertEqual(data["intent"]["conditions"][1]["scope"], "own_brand")
            self.assertNotIn(
                "canUseBrandAccount",
                data["intent"]["conditions"][1],
            )
            generated = data["plan"]["generated"]["list"][1]
            self.assertEqual(generated["selectionLv2"], ["16616#|#5"])
            self.assertEqual(generated["selectionLv3"]["shop"], "ALL")
        finally:
            test_app.close()

    def test_tmall_global_self_service_name_maps_to_live_direct_channel(self):
        from cdp_backend.ai_chat_service import AiChatService

        service = object.__new__(AiChatService)
        grounded = service._ground_channel_aggregate_intent(
            {
                "schemaVersion": 1,
                "conditions": [
                    {
                        "component": "商品行为",
                        "scope": "own_store",
                        "canUseBrandAccount": None,
                        "channels": ["天猫国际自营"],
                    }
                ],
            },
            "XT_2508香水搜索浏览天猫国际自营_副本",
        )

        condition = grounded["conditions"][0]
        self.assertEqual(condition["scope"], "own_brand")
        self.assertEqual(condition["channels"], ["天猫国际直营"])
        self.assertNotIn("canUseBrandAccount", condition)

    def test_public_solution_match_uses_verified_id_and_keeps_custom_audience_name(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubKnowledge:
            @staticmethod
            def list_summaries():
                return [
                    {
                        "id": "solution_association_purchase",
                        "name": "连带购买",
                        "nodes": [{"component": "类目公域行为"}],
                    },
                    {
                        "id": "solution_repeat",
                        "name": "同品类复购",
                        "nodes": [{"component": "类目公域行为"}],
                    }
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = StubKnowledge()
        matched = service._match_public_solution(
            {
                "solutionId": "solution_repeat",
                "audienceName": "CPB面霜连带购买复购人群",
                "conditions": [{}],
            },
            "两个周期都买过CPB面霜的人",
        )

        self.assertIsNotNone(matched)
        self.assertEqual(matched["name"], "同品类复购")

    def test_flow_out_message_matches_even_when_model_returns_no_intent(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubKnowledge:
            @staticmethod
            def list_summaries():
                return [
                    {"id": "flow-out", "name": "流出人群分析", "nodes": []},
                    {"id": "flow-in", "name": "流入人群分析", "nodes": []},
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = StubKnowledge()
        matched = service._match_public_solution(
            None,
            "新周期只买类目没买本牌，老周期买过本牌这个类目，圈流失。",
        )

        self.assertIsNotNone(matched)
        self.assertEqual(matched["name"], "流出人群分析")

    def test_complete_business_phrases_match_without_a_model_intent(self):
        from cdp_backend.ai_chat_service import AiChatService

        expected_by_message = {
            "帮我圈乳液面霜的品类拉新人群": "品类新客",
            "找从别的牌子转来的转牌拉新人群": "转牌新客",
            "两个周期都买过这个类目的复购人群": "同品类复购",
            "找本牌的品牌存量老客": "品牌老客",
            "看乳液面霜和套装的连带购买": "连带购买",
            "分析从其他品类招来的跨品类拉新方向": "跨品类招新方向分析",
        }

        class StubKnowledge:
            @staticmethod
            def list_summaries():
                return [
                    {"id": name, "name": name, "nodes": []}
                    for name in expected_by_message.values()
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = StubKnowledge()
        for message, expected in expected_by_message.items():
            with self.subTest(message=message):
                matched = service._match_public_solution(None, message)
                self.assertIsNotNone(matched)
                self.assertEqual(matched["name"], expected)

    def test_cross_purchase_phrase_overrides_wrong_association_solution(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubKnowledge:
            @staticmethod
            def list_summaries():
                return [
                    {"id": "association", "name": "连带购买", "nodes": []},
                    {"id": "category-cross", "name": "品类连带分析", "nodes": []},
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = StubKnowledge()
        matched = service._match_public_solution(
            {
                "solutionId": "association",
                "audienceName": "乳液面霜与面部套装连带购买人群",
            },
            "看买过乳液面霜的人里，还有谁同时买了面部护理套装。",
        )

        self.assertIsNotNone(matched)
        self.assertEqual(matched["name"], "品类连带分析")

    def test_public_solution_grounding_respects_explicit_ab_category_labels(self):
        from cdp_backend.ai_chat_service import AiChatService

        service = object.__new__(AiChatService)
        service.compiler = type(
            "StubCompiler",
            (),
            {"engine": type("StubEngine", (), {"dimensions": {}})()},
        )()
        service.solution_knowledge = type(
            "StubKnowledge",
            (),
            {
                "brand_core_categories": staticmethod(lambda _brand: []),
                "find_unique_brand_core_profile_in_text": staticmethod(
                    lambda _message: None
                ),
            },
        )()
        category_a = "美容护肤/美体/精油>乳液/面霜"
        category_b = "美容护肤/美体/精油>面部护理套装"
        solution = {
            "name": "品类连带分析",
            "nodes": [
                {
                    "displayName": "本类目购买",
                    "component": "类目公域行为",
                    "relation": "start",
                    "parameterBindings": [
                        {"parameter": "本类目", "targetField": "categories"}
                    ],
                },
                {
                    "displayName": "对比类目购买",
                    "component": "类目公域行为",
                    "relation": "intersect",
                    "parameterBindings": [
                        {"parameter": "对比类目", "targetField": "categories"}
                    ],
                },
            ],
        }
        grounded = service._ground_public_solution_intent(
            {
                "conditions": [
                    {"categories": [category_b]},
                    {"categories": [category_a]},
                ]
            },
            solution,
            previous_intent=None,
            message=f"B类目{category_b}与A类目{category_a}的交叉购买人群",
            pending_questions=[],
        )

        self.assertEqual(grounded["conditions"][0]["categories"], [category_a])
        self.assertEqual(grounded["conditions"][1]["categories"], [category_b])

    def test_public_solution_grounding_prefers_user_date_range_over_recent_days(self):
        from cdp_backend.ai_chat_service import AiChatService

        service = object.__new__(AiChatService)
        service.compiler = type(
            "StubCompiler",
            (),
            {"engine": type("StubEngine", (), {"dimensions": {}})()},
        )()
        service.solution_knowledge = type(
            "StubKnowledge",
            (),
            {
                "brand_core_categories": staticmethod(lambda _brand: []),
                "find_unique_brand_core_profile_in_text": staticmethod(
                    lambda _message: None
                ),
            },
        )()
        solution = {
            "name": "共同浏览后_购买竞品",
            "nodes": [
                {
                    "displayName": "统计时间_浏览本品",
                    "component": "类目公域行为",
                    "relation": "start",
                    "parameterBindings": [
                        {"parameter": "统计时间", "targetField": "timeWindow"}
                    ],
                }
            ],
        }
        grounded = service._ground_public_solution_intent(
            {"conditions": [{"recentDays": 30}]},
            solution,
            previous_intent=None,
            message="2月27日到8月25日在面霜类目浏览后购买竞品",
            pending_questions=[],
        )

        self.assertEqual(
            grounded["conditions"][0]["dateRange"],
            ["2026-02-27", "2026-08-25"],
        )
        self.assertNotIn("recentDays", grounded["conditions"][0])

    def test_yearless_ranges_respect_last_year_wording(self):
        from cdp_backend.ai_chat_service import AiChatService

        current_year = business_today().year
        ranges = AiChatService._message_explicit_date_ranges(
            "2月24日至3月8日买过本牌，去年10月1日至11月11日买过类目"
        )

        self.assertEqual(
            [item["dateRange"] for item in ranges],
            [
                [f"{current_year}-02-24", f"{current_year}-03-08"],
                [f"{current_year - 1}-10-01", f"{current_year - 1}-11-11"],
            ],
        )

    def test_explicit_range_inherits_omitted_end_month(self):
        from cdp_backend.ai_chat_service import AiChatService

        ranges = AiChatService._message_explicit_date_ranges(
            "2025年9月1日至7日在首页搜索并浏览官旗商品"
        )

        self.assertEqual(
            [item["dateRange"] for item in ranges],
            [["2025-09-01", "2025-09-07"]],
        )

    def test_single_month_respects_separate_explicit_year_and_first_week(self):
        from cdp_backend.ai_chat_service import AiChatService

        self.assertEqual(
            AiChatService._ground_shared_month_intent(
                {"conditions": [{"recentDays": 30}, {}]},
                "圈8月首页搜迪奥香水又在天猫国际看过香水商品的人，按2025年。",
            )["conditions"],
            [
                {"dateRange": ["2025-08-01", "2025-08-31"]},
                {"dateRange": ["2025-08-01", "2025-08-31"]},
            ],
        )
        for wording in ("2025年9月第1周", "2025年9月第一周"):
            self.assertEqual(
                AiChatService._ground_shared_month_intent(
                    {"conditions": [{}]}, f"{wording}搜索迪奥并在官旗购买"
                )["conditions"][0]["dateRange"],
                ["2025-09-01", "2025-09-07"],
            )

    def test_consumer_is_purchase_behavior_signal(self):
        from cdp_backend.ai_chat_service import AiChatService

        self.assertTrue(AiChatService._message_mentions_behavior("看香奈儿唇釉的消费者"))
        self.assertFalse(AiChatService._message_mentions_behavior("看看香奈儿唇釉"))
        self.assertTrue(AiChatService._message_mentions_behavior("在店里预购过商品"))
        self.assertTrue(AiChatService._message_mentions_behavior("在店里退过款"))

    def test_public_solution_match_accepts_solution_name_inside_custom_audience_name(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubKnowledge:
            @staticmethod
            def list_summaries():
                return [
                    {
                        "id": "solution_inflow",
                        "name": "流入人群分析",
                        "nodes": [{"component": "类目公域行为"}],
                    }
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = StubKnowledge()
        matched = service._match_public_solution(
            {"audienceName": "CPB乳液面霜流入人群分析", "conditions": [{}]},
            "分析最近转来买CPB的消费者",
        )

        self.assertIsNotNone(matched)
        self.assertEqual(matched["id"], "solution_inflow")

    def test_competitor_loss_semantics_override_inconsistent_model_solution_id(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubKnowledge:
            @staticmethod
            def list_summaries():
                return [
                    {"id": "buy-own", "name": "共同浏览后_购买本品", "nodes": [{}]},
                    {"id": "buy-competitor", "name": "共同浏览后_购买竞品", "nodes": [{}]},
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = StubKnowledge()
        matched = service._match_public_solution(
            {"solutionId": "buy-own", "audienceName": "竞品流失用户", "conditions": [{}]},
            "资生堂成交、CPB与它都浏览过，圈竞品流失用户",
        )

        self.assertEqual(matched["id"], "buy-competitor")

    def test_brand_core_range_uses_formal_categories_explicitly_present_in_message(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubEngine:
            dimensions = {
                "类目维表.csv": [
                    CATEGORY,
                    "美容护肤/美体/精油>面部护理套装",
                    "美容护肤/美体/精油>化妆水/爽肤水",
                ]
            }

        class StubCompiler:
            engine = StubEngine()

        service = object.__new__(AiChatService)
        service.compiler = StubCompiler()
        values = service._message_brand_core_categories(
            "本牌核心范围="
            f"{CATEGORY}、美容护肤/美体/精油>面部护理套装、"
            "美容护肤/美体/精油>化妆水/爽肤水，新周期再买乳液面霜"
        )

        self.assertEqual(
            values,
            [
                CATEGORY,
                "美容护肤/美体/精油>面部护理套装",
                "美容护肤/美体/精油>化妆水/爽肤水",
            ],
        )

    def test_single_character_brand_fragment_does_not_block_store_profile_lookup(self):
        from cdp_backend.ai_chat_service import AiChatService
        from cdp_backend.ai_solution_knowledge import AiSolutionKnowledge

        class StubEngine:
            dimensions = {
                "品牌维表.csv": ["兰", "LANCOME/兰蔻"],
            }

        class StubCompiler:
            engine = StubEngine()

        service = object.__new__(AiChatService)
        service.compiler = StubCompiler()
        service.solution_knowledge = AiSolutionKnowledge(object())

        brand = service._solution_primary_brand(
            [{"brands": ["兰蔻"]}],
            "我想看兰蔻的乳液面霜品类新客，近半年",
        )

        self.assertEqual(brand, "lancome兰蔻")
        self.assertEqual(len(service.solution_knowledge.brand_core_categories(brand)), 10)

    def test_system_prompt_defines_yesterday_cutoff_and_adjacent_comparison_periods(self):
        from cdp_backend.ai_chat_service import AiChatService

        source = AiChatService._build_system_prompt
        constants = " ".join(
            str(item)
            for item in source.__code__.co_consts
            if isinstance(item, str)
        )
        self.assertIn("数据统计永远截止到昨天", constants)
        self.assertIn("两个连续且等长的周期", constants)
        self.assertIn("去年YTD表示上一年1月1日", constants)
        self.assertIn("只有“关键词搜索”和“商品行为”属于私域圈包行为", constants)
        self.assertIn("所有销售渠道”时，表示当前品牌", constants)
        self.assertIn("品牌在天猫、淘宝、国际等全部可用销售渠道的私域汇总数据", constants)
        self.assertIn("用户说“官旗”或“官方旗舰店”时", constants)
        self.assertIn("若品牌在verifiedBrandAccountAccess中已确认可用", constants)

    def test_business_period_resolution_uses_cutoff_and_handles_leap_day(self):
        self.assertEqual(
            resolve_business_period("ytd", cutoff=date(2026, 8, 31)),
            (date(2026, 1, 1), date(2026, 8, 31)),
        )
        self.assertEqual(
            resolve_business_period("previous_ytd", cutoff=date(2026, 8, 31)),
            (date(2025, 1, 1), date(2025, 8, 31)),
        )
        self.assertEqual(
            resolve_business_period("mtd", cutoff=date(2026, 8, 31)),
            (date(2026, 8, 1), date(2026, 8, 31)),
        )
        self.assertEqual(
            resolve_business_period("previous_mtd", cutoff=date(2024, 2, 29)),
            (date(2023, 2, 1), date(2023, 2, 28)),
        )

    def test_named_business_period_recognizes_both_word_orders(self):
        from cdp_backend.ai_chat_service import AiChatService

        self.assertEqual(AiChatService._named_business_period("去年YTD"), "previous_ytd")
        self.assertEqual(AiChatService._named_business_period("YTD去年"), "previous_ytd")
        self.assertEqual(AiChatService._named_business_period("本月MTD"), "mtd")
        self.assertEqual(AiChatService._named_business_period("去年MTD"), "previous_mtd")

    def test_named_business_period_overrides_model_date_and_excludes_today(self):
        from cdp_backend.ai_chat_service import AiChatService

        intent = {
            "schemaVersion": 1,
            "conditions": [
                {
                    "behaviors": ["购买"],
                    "categories": [CATEGORY],
                    "dateRange": ["2020-01-01", "2020-12-31"],
                }
            ],
        }
        normalized = AiChatService._normalize_model_intent(intent, "圈去年YTD买过面霜的人")
        expected_start, expected_end = resolve_business_period("previous_ytd")

        self.assertEqual(
            normalized["conditions"][0]["dateRange"],
            [expected_start.isoformat(), expected_end.isoformat()],
        )
        self.assertLess(expected_end, business_today())

    def test_explicit_dates_win_over_named_business_period(self):
        from cdp_backend.ai_chat_service import AiChatService

        intent = {
            "schemaVersion": 1,
            "conditions": [
                {
                    "behaviors": ["购买"],
                    "categories": [CATEGORY],
                    "dateRange": ["2025-01-01", "2025-08-31"],
                }
            ],
        }
        normalized = AiChatService._normalize_model_intent(
            intent,
            "去年YTD，固定按2025年1月1日至2025年8月31日",
        )

        self.assertEqual(
            normalized["conditions"][0]["dateRange"],
            ["2025-01-01", "2025-08-31"],
        )

    def test_explicit_ytd_year_and_month_end_are_resolved_deterministically(self):
        from cdp_backend.ai_chat_service import AiChatService

        intent = {
            "schemaVersion": 1,
            "conditions": [
                {
                    "behaviors": ["购买"],
                    "categories": [CATEGORY],
                    "dateRange": ["2026-01-01", "2026-09-13"],
                }
            ],
        }
        normalized = AiChatService._normalize_model_intent(
            intent,
            "找一下2025年YTD截至8月底的购买人群",
        )

        self.assertEqual(
            normalized["conditions"][0]["dateRange"],
            ["2025-01-01", "2025-08-31"],
        )

    def test_short_answer_belongs_to_the_first_pending_solution_parameter(self):
        from cdp_backend.ai_chat_service import AiChatService

        pending_questions = [
            {"prompt": "请补充需要分析的类目。"},
            {"prompt": "请补充海蓝之谜的品牌核心类目。"},
        ]
        self.assertFalse(
            AiChatService._pending_question_names_parameter(
                pending_questions, "品牌核心类目"
            )
        )
        self.assertTrue(
            AiChatService._pending_question_names_parameter(
                pending_questions[1:], "品牌核心类目"
            )
        )

    def test_short_brand_alias_resolves_store_core_category_profile(self):
        from cdp_backend.ai_chat_service import AiChatService
        from cdp_backend.ai_solution_knowledge import AiSolutionKnowledge

        service = object.__new__(AiChatService)
        service.compiler = type(
            "CompilerStub",
            (),
            {
                "engine": type(
                    "EngineStub",
                    (),
                    {"dimensions": {"品牌维表.csv": ["CPB/肌肤之钥"]}},
                )()
            },
        )()
        service.solution_knowledge = AiSolutionKnowledge(None)

        brand = service._solution_primary_brand(
            [{"brands": ["CPB"]}], "我想看CPB的品牌老客"
        )

        self.assertEqual(brand, "CPB/肌肤之钥")
        self.assertGreater(
            len(service.solution_knowledge.brand_core_categories(brand)), 1
        )

    def test_public_solution_time_parameters_cannot_fall_back_to_component_defaults(self):
        from cdp_backend.ai_chat_service import AiChatService

        service = object.__new__(AiChatService)
        intent = {
            "schemaVersion": 1,
            "conditions": [
                {"id": "current", "behaviors": ["购买"]},
                {"id": "previous", "behaviors": ["购买"]},
            ],
        }
        solution = {
            "nodes": [
                {
                    "parameterBindings": [
                        {"parameter": "统计时间", "targetField": "timeWindow"}
                    ]
                },
                {
                    "parameterBindings": [
                        {"parameter": "对比时间", "targetField": "timeWindow"}
                    ]
                },
            ]
        }

        question = service._missing_solution_time_question(intent, solution)

        self.assertIsNotNone(question)
        self.assertEqual(question["parameterName"], "统计时间与对比时间")
        self.assertIn("截止到昨天", question["reason"])
        self.assertEqual(len(question["applyTargets"]), 2)

        single_question = service._missing_solution_time_question(
            {"schemaVersion": 1, "conditions": [{"id": "single"}]},
            {
                "nodes": [
                    {
                        "parameterBindings": [
                            {"parameter": "时间", "targetField": "timeWindow"}
                        ]
                    }
                ]
            },
        )
        self.assertIsNotNone(single_question)
        self.assertEqual(single_question["parameterName"], "时间")
        self.assertIn("请补充时间", single_question["prompt"])

    def test_solution_relative_comparison_periods_are_adjacent_not_duplicated(self):
        from cdp_backend.ai_chat_service import AiChatService

        statistic = AiChatService._message_solution_time_value(
            "近半年对比前半年",
            "统计时间",
            time_parameter_count=2,
            pending_parameter=True,
        )
        comparison = AiChatService._message_solution_time_value(
            "近半年对比前半年",
            "对比时间",
            time_parameter_count=2,
            pending_parameter=True,
        )
        expected_statistic_start = latest_selectable_date() - timedelta(days=179)
        expected_comparison_end = expected_statistic_start - timedelta(days=1)
        expected_comparison_start = expected_comparison_end - timedelta(days=179)

        self.assertEqual(statistic, {"recentDays": 180})
        self.assertEqual(
            comparison,
            {
                "dateRange": [
                    expected_comparison_start.isoformat(),
                    expected_comparison_end.isoformat(),
                ]
            },
        )

    def test_time_expression_detection_does_not_treat_solution_name_as_a_period(self):
        from cdp_backend.ai_chat_service import AiChatService

        self.assertFalse(AiChatService._message_mentions_time("帮我圈海蓝之谜的品类新客"))
        self.assertFalse(AiChatService._message_mentions_time("筛选美妆年轻人群"))
        self.assertTrue(AiChatService._message_mentions_time("近半年对比前半年"))
        self.assertTrue(AiChatService._message_mentions_time("2026-01-01到2026-06-30"))

    def test_comparison_time_requires_an_explicit_comparison_expression(self):
        from cdp_backend.ai_chat_service import AiChatService

        self.assertFalse(AiChatService._message_mentions_comparison_time("近半年"))
        self.assertFalse(AiChatService._message_mentions_comparison_time("近30天"))
        self.assertTrue(
            AiChatService._message_mentions_comparison_time("近半年对比前半年")
        )
        self.assertTrue(
            AiChatService._message_mentions_comparison_time("今年YTD比较去年YTD")
        )
        self.assertTrue(
            AiChatService._message_mentions_comparison_time(
                "2026/2/24到3/8买过，但2025/10/1到11/11没有买过"
            )
        )
        self.assertTrue(
            AiChatService._message_mentions_comparison_time(
                "两个周期分别是2025年10月1日至11月11日、2026年2月24日至3月8日"
            )
        )
        self.assertFalse(
            AiChatService._message_mentions_comparison_time(
                "统计时间2026年2月24日至3月8日"
            )
        )
        self.assertTrue(
            AiChatService._message_mentions_comparison_time(
                "2025/8/1-2026/1/31买过，2026/2/1-7/31没有买过"
            )
        )

    def test_common_browse_business_language_matches_public_solution(self):
        from cdp_backend.ai_chat_service import AiChatService

        class SolutionKnowledgeStub:
            @staticmethod
            def list_summaries():
                return [
                    {
                        "id": "common-browse",
                        "name": "共同浏览本品和竞品",
                    }
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = SolutionKnowledgeStub()
        matched = service._match_public_solution(
            {
                "schemaVersion": 1,
                "audienceName": "CPB与资生堂共同兴趣人群",
                "conditions": [],
            },
            "帮我圈在乳液面霜里既浏览过CPB、又浏览过资生堂的人",
        )
        self.assertIsNotNone(matched)
        self.assertEqual(matched["name"], "共同浏览本品和竞品")

    def test_common_browse_synonym_simultaneously_viewed_matches_solution(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubKnowledge:
            @staticmethod
            def list_summaries():
                return [
                    {
                        "id": "common-browse",
                        "name": "共同浏览本品和竞品",
                        "nodes": [],
                    }
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = StubKnowledge()
        matched = service._match_public_solution(
            {}, "竞牌和本牌，找同时看过两个牌子的人"
        )

        self.assertIsNotNone(matched)
        self.assertEqual(matched["name"], "共同浏览本品和竞品")

    def test_final_purchase_brand_corrects_wrong_common_browse_solution_id(self):
        from cdp_backend.ai_chat_service import AiChatService

        class SolutionKnowledgeStub:
            @staticmethod
            def list_summaries():
                return [
                    {"id": "common-browse", "name": "共同浏览本品和竞品"},
                    {"id": "buy-own", "name": "共同浏览后_购买本品"},
                    {"id": "buy-competitor", "name": "共同浏览后_购买竞品"},
                ]

        service = object.__new__(AiChatService)
        service.solution_knowledge = SolutionKnowledgeStub()
        service._message_dimension_values = lambda _message, _dimension: [
            "CPB/肌肤之钥",
            "Shiseido/资生堂",
        ]
        matched = service._match_public_solution(
            {
                "schemaVersion": 1,
                "solutionId": "common-browse",
                "audienceName": "双品牌浏览后购买",
                "conditions": [],
            },
            "先看CPB/肌肤之钥又看Shiseido/资生堂，最后买了Shiseido/资生堂",
        )
        self.assertIsNotNone(matched)
        self.assertEqual(matched["name"], "共同浏览后_购买竞品")

    def test_category_value_must_appear_in_the_user_message_to_be_trusted(self):
        from cdp_backend.ai_chat_service import AiChatService

        self.assertFalse(
            AiChatService._message_mentions_parameter_value(
                "帮我圈海蓝之谜的品类新客", [CATEGORY]
            )
        )
        self.assertTrue(
            AiChatService._message_mentions_parameter_value(
                "帮我圈面霜品类新客", [CATEGORY]
            )
        )

    def test_clear_product_word_is_grounded_to_unique_live_category(self):
        from cdp_backend.ai_chat_service import AiChatService

        lip_category = "彩妆/香水/美妆工具>唇部彩妆>唇彩/唇蜜/唇釉/唇泥/唇霜"

        class StubEngine:
            dimensions = {
                "类目维表.csv": [
                    lip_category,
                    "旅行购物>彩妆/香水/美妆工具>唇彩/唇蜜",
                ]
            }

        class StubCompiler:
            engine = StubEngine()

        service = object.__new__(AiChatService)
        service.compiler = StubCompiler()
        grounded = service._ground_live_category_intent(
            {
                "schemaVersion": 1,
                "conditions": [{"behaviors": ["购买"], "categories": []}],
            },
            "我想想看香奈儿双效持色唇釉去年YTD的人",
        )

        self.assertEqual(grounded["conditions"][0]["categories"], [lip_category])

    def test_live_host_shortcuts_expand_to_verified_product_title_keywords(self):
        from cdp_backend.ai_chat_service import AiChatService
        from cdp_backend.ai_solution_knowledge import AiSolutionKnowledge

        lipstick = "彩妆/香水/美妆工具>唇部彩妆>唇膏/口红"

        class StubEngine:
            dimensions = {"类目维表.csv": [lipstick]}

        class StubCompiler:
            engine = StubEngine()

        class StubStore:
            def list_solutions(self, *_args):
                return []

        service = object.__new__(AiChatService)
        service.compiler = StubCompiler()
        service.solution_knowledge = AiSolutionKnowledge(StubStore())
        intent = {
            "schemaVersion": 1,
            "conditions": [{
                "component": "类目公域行为",
                "behaviors": ["购买"],
                "categories": ["彩妆/香水/美妆工具>唇部彩妆>唇彩/唇蜜/唇釉/唇泥/唇霜"],
                "titleKeywords": ["李佳琦直播间"],
            }],
        }

        lee, lee_mapping = service._ground_business_term_intent(
            intent, "圈8月买过李佳琦直播间口红的人"
        )
        self.assertIsNotNone(lee_mapping)
        self.assertEqual(lee["conditions"][0]["titleKeywords"], ["佳琦", "李佳琦"])
        self.assertEqual(lee["conditions"][0]["categories"], [lipstick])
        self.assertEqual(intent["conditions"][0]["titleKeywords"], ["李佳琦直播间"])

        t2, t2_mapping = service._ground_business_term_intent(
            intent, "圈8月买过T2直播间口红的人"
        )
        self.assertIsNotNone(t2_mapping)
        self.assertEqual(len(t2["conditions"][0]["titleKeywords"]), 32)
        self.assertEqual(t2["conditions"][0]["titleKeywords"][:2], ["所有女生", "曹米娅"])
        self.assertEqual(t2["conditions"][0]["titleKeywords"][-2:], ["sisy莉贝琳", "大物是也"])
        self.assertEqual(t2["conditions"][0]["categories"], [lipstick])

        search, search_mapping = service._ground_business_term_intent(
            intent, "首页搜索李佳琦的用户"
        )
        self.assertIsNone(search_mapping)
        self.assertEqual(search, intent)
        viewing, viewing_mapping = service._ground_business_term_intent(
            intent, "看过李佳琦直播间的人"
        )
        self.assertIsNone(viewing_mapping)
        self.assertEqual(viewing, intent)

    def test_ad_touchpoint_shortcuts_keep_explicit_behavior(self):
        from cdp_backend.ai_chat_service import AiChatService
        from cdp_backend.ai_solution_knowledge import AiSolutionKnowledge

        class StubStore:
            def list_solutions(self, *_args):
                return []

        service = object.__new__(AiChatService)
        service.solution_knowledge = AiSolutionKnowledge(StubStore())
        intent = {"schemaVersion": 1, "conditions": [{"behaviors": []}]}
        brand_promo, mapping = service._ground_ad_touchpoint_intent(
            intent, "圈出8月特秀曝光过的人"
        )
        self.assertIsNotNone(mapping)
        condition = brand_promo["conditions"][0]
        self.assertEqual(condition["component"], "品牌推广")
        self.assertEqual(condition["behaviors"], ["曝光"])
        self.assertEqual(condition["adScenes"], ["淘内展示营销-品牌特秀（原品牌特秀）"])

        brand_zone, _ = service._ground_ad_touchpoint_intent(
            intent, "圈出8月品专点击过的人"
        )
        self.assertEqual(brand_zone["conditions"][0]["component"], "品牌专区")
        self.assertEqual(brand_zone["conditions"][0]["behaviors"], ["点击过广告"])
        self.assertNotIn("adScenes", brand_zone["conditions"][0])

    def test_ambiguous_product_word_still_requires_category_confirmation(self):
        from cdp_backend.ai_chat_service import AiChatService

        class StubEngine:
            dimensions = {
                "类目维表.csv": [
                    "美容护肤>面霜",
                    "旅行购物>面霜",
                ]
            }

        class StubCompiler:
            engine = StubEngine()

        service = object.__new__(AiChatService)
        service.compiler = StubCompiler()
        grounded = service._ground_live_category_intent(
            {
                "schemaVersion": 1,
                "conditions": [{"behaviors": ["购买"], "categories": []}],
            },
            "帮我圈买过面霜的人",
        )

        self.assertEqual(grounded["conditions"][0]["categories"], [])

    def test_status_is_safe_and_reports_missing_configuration(self):
        test_app = create_authenticated_test_app(
            "ai-status-user",
            test_config={"AI_API_KEY": "", "AI_MODEL": ""},
        )
        try:
            response = test_app.client.get("/api/ai/status")
            data = response.get_json()
            self.assertEqual(response.status_code, 200)
            self.assertFalse(data["configured"])
            self.assertIn("CDP_AI_MODEL", data["missing"])
            self.assertEqual(data["systemCapabilityCount"], 7)
            self.assertGreaterEqual(data["systemFeatureCount"], 30)
            self.assertGreater(data["guidedStepKnowledgeCount"], 50)
            self.assertNotIn("apiKey", data)
            self.assertNotIn("server-secret", response.get_data(as_text=True))
        finally:
            test_app.close()

    def test_chat_requires_model_configuration(self):
        test_app = create_authenticated_test_app(
            "ai-unconfigured-user",
            test_config={"AI_API_KEY": "", "AI_MODEL": ""},
        )
        try:
            response = test_app.client.post("/api/ai/chat", json={"message": "圈人"})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.get_json()["code"], "AI_NOT_CONFIGURED")
        finally:
            test_app.close()

    def test_chat_compiles_model_intent_to_preview_plan(self):
        def caller(_request):
            return responses_payload(
                {
                    "assistantMessage": "已整理最近30天购买过面霜的人群。",
                    "intent": {
                        "schemaVersion": 1,
                        "audienceName": "近30天面霜购买人群",
                        "conditions": [
                            {
                                "behaviors": ["购买"],
                                "categories": [CATEGORY],
                                "recentDays": 30,
                            }
                        ],
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-ready-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "圈最近30天购买过面霜的人"},
            )
            data = response.get_json()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(data["plan"]["nodes"][0]["packageType"], "类目公域行为")
            self.assertEqual(data["plan"]["audienceName"], "近30天面霜购买人群")
            self.assertEqual(data["workflow"]["id"], "direct-workbench-audience-build")
            self.assertEqual(data["plan"]["workflow"], data["workflow"])
        finally:
            test_app.close()

    def test_category_new_solution_repairs_periods_and_auto_fills_store_core_categories(self):
        wrong_current_range = [
            (latest_selectable_date() - timedelta(days=179)).isoformat(),
            latest_selectable_date().isoformat(),
        ]

        def caller(_request):
            return responses_payload(
                {
                    "assistantMessage": "已按近半年对比前半年更新。",
                    "intent": {
                        "schemaVersion": 1,
                        "audienceName": "品类新客",
                        "conditions": [
                            {
                                "id": "c1",
                                "displayName": "模型自拟节点一",
                                "component": "类目商品行为",
                                "behaviors": ["浏览"],
                                "categories": [CATEGORY],
                                "brands": ["海蓝之谜"],
                                "dateRange": wrong_current_range,
                            },
                            {
                                "id": "c2",
                                "displayName": "模型自拟节点二",
                                "relation": "union",
                                "component": "类目商品行为",
                                "behaviors": ["浏览"],
                                "categories": [CATEGORY],
                                "brands": ["海蓝之谜"],
                                "dateRange": wrong_current_range,
                            },
                            {
                                "id": "c3",
                                "displayName": "模型自拟节点三",
                                "relation": "intersect",
                                "component": "类目商品行为",
                                "behaviors": ["浏览"],
                                "categories": [CATEGORY],
                                "dateRange": wrong_current_range,
                            },
                        ],
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-category-new-regression-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            store = SolutionStore(test_app.db_path)
            draft = store.create_draft(
                {
                    "name": "品类新客",
                    "defaultCrowdName": "品类新客",
                    "nodes": [
                        {
                            "id": "node_1",
                            "displayName": "统计时间内购买这个品类",
                            "packageType": "类目公域行为",
                            "operator": None,
                            "formData": {
                                "bhv": ["购买"],
                                "leafCates": [CATEGORY],
                                "stdBrand": ["CPB/肌肤之钥"],
                                "channel": ["天猫"],
                                "time": {"days": 30},
                            },
                        },
                        {
                            "id": "node_2",
                            "displayName": "对比时间内买过我品牌的人",
                            "packageType": "类目公域行为",
                            "operator": "d",
                            "formData": {
                                "bhv": ["购买"],
                                "leafCates": [CATEGORY, "美容护肤/美体/精油>面部精华"],
                                "stdBrand": ["CPB/肌肤之钥"],
                                "channel": ["天猫"],
                                "time": {"days": 30},
                            },
                        },
                        {
                            "id": "node_3",
                            "displayName": "对比时间内买了这个类目",
                            "packageType": "类目公域行为",
                            "operator": "d",
                            "formData": {
                                "bhv": ["购买"],
                                "leafCates": [CATEGORY],
                                "stdBrand": [],
                                "channel": ["天猫"],
                                "time": {"days": 30},
                            },
                        },
                    ],
                    "customFields": [
                        {
                            "name": "分析类目",
                            "type": "搜索多选",
                            "bindings": [
                                {"nodeId": "node_1", "fieldKey": "leafCates"},
                                {"nodeId": "node_3", "fieldKey": "leafCates"},
                            ],
                        },
                        {
                            "name": "品牌核心类目",
                            "type": "搜索多选",
                            "bindings": [
                                {"nodeId": "node_2", "fieldKey": "leafCates"}
                            ],
                        },
                        {
                            "name": "品牌",
                            "type": "搜索多选",
                            "bindings": [
                                {"nodeId": "node_1", "fieldKey": "stdBrand"},
                                {"nodeId": "node_2", "fieldKey": "stdBrand"},
                            ],
                        },
                        {
                            "name": "统计时间",
                            "type": "日期_切换",
                            "bindings": [
                                {"nodeId": "node_1", "fieldKey": "time"}
                            ],
                        },
                        {
                            "name": "对比时间",
                            "type": "日期_切换",
                            "bindings": [
                                {"nodeId": "node_2", "fieldKey": "time"},
                                {"nodeId": "node_3", "fieldKey": "time"},
                            ],
                        },
                    ],
                },
                test_app.user["id"],
            )
            store.promote_private_solution(
                draft["id"], test_app.user["id"], "test-admin"
            )

            response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": (
                        "我想看海蓝之谜的品类新客，分析类目是"
                        f"{CATEGORY}，近半年对比前半年"
                    )
                },
            )
            data = response.get_json()
            conditions = data["intent"]["conditions"]
            comparison_end = latest_selectable_date() - timedelta(days=180)
            comparison_start = comparison_end - timedelta(days=179)

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(data["plan"]["matchedSolution"]["name"], "品类新客")
            self.assertIn("已按《品类新客》", data["reply"])
            self.assertNotIn("请补充", data["reply"])
            self.assertEqual(
                [item["component"] for item in conditions],
                ["类目公域行为", "类目公域行为", "类目公域行为"],
            )
            self.assertEqual(
                [item.get("relation") for item in conditions],
                [None, "exclude", "exclude"],
            )
            self.assertEqual(conditions[0]["recentDays"], 180)
            self.assertNotIn("dateRange", conditions[0])
            self.assertEqual(
                conditions[1]["dateRange"],
                [comparison_start.isoformat(), comparison_end.isoformat()],
            )
            self.assertEqual(conditions[2]["dateRange"], conditions[1]["dateRange"])
            expected_core_categories = AiSolutionKnowledge(
                object()
            ).brand_core_categories("海蓝之谜")
            self.assertEqual(len(expected_core_categories), 10)
            self.assertEqual(conditions[1]["categories"], expected_core_categories)
            self.assertEqual(conditions[0]["categories"], [CATEGORY])
            self.assertEqual(conditions[2]["categories"], [CATEGORY])
            self.assertEqual(data["plan"]["questions"], [])
            self.assertEqual(
                data["plan"]["nodes"][1]["formData"]["leafCates"],
                expected_core_categories,
            )

            single_time_response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": (
                        "我想看海蓝之谜的品类新客，分析类目是"
                        f"{CATEGORY}，近半年"
                    )
                },
            )
            single_time = single_time_response.get_json()
            self.assertEqual(single_time_response.status_code, 200)
            self.assertEqual(single_time["status"], "needs_clarification")
            self.assertEqual(
                single_time["plan"]["questions"][0]["parameterName"],
                "对比时间",
            )
            self.assertNotIn("请选择海蓝之谜的品牌核心类目", single_time["reply"])

            no_time_response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "帮我圈海蓝之谜的品类新客"},
            )
            no_time = no_time_response.get_json()
            self.assertEqual(no_time_response.status_code, 200)
            self.assertEqual(no_time["status"], "needs_clarification")
            self.assertEqual(len(no_time["plan"]["questions"]), 1)
            self.assertEqual(
                no_time["plan"]["questions"][0]["parameterName"], "分析类目"
            )
            self.assertTrue(
                all(
                    "recentDays" not in condition and "dateRange" not in condition
                    for condition in no_time["intent"]["conditions"]
                )
            )

            analysis_question = no_time["plan"]["questions"][0]
            analysis_response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "已选择分析类目：乳液/面霜",
                    "currentIntent": no_time["intent"],
                    "pendingQuestions": [analysis_question],
                    "questionAnswer": {
                        "questionId": analysis_question["id"],
                        "values": [CATEGORY],
                    },
                },
            )
            analysis = analysis_response.get_json()
            self.assertEqual(len(analysis["plan"]["questions"]), 1)
            self.assertEqual(
                analysis["plan"]["questions"][0]["parameterName"],
                "统计时间与对比时间",
            )

            time_response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "近半年对比前半年",
                    "currentIntent": analysis["intent"],
                    "pendingQuestions": analysis["plan"]["questions"],
                },
            )
            timed = time_response.get_json()
            self.assertEqual(time_response.status_code, 200)
            self.assertEqual(timed["status"], "ready")
            self.assertEqual(timed["intent"]["conditions"][0]["recentDays"], 180)
            self.assertEqual(
                timed["intent"]["conditions"][1]["dateRange"],
                [comparison_start.isoformat(), comparison_end.isoformat()],
            )
            self.assertEqual(
                timed["intent"]["conditions"][2]["dateRange"],
                timed["intent"]["conditions"][1]["dateRange"],
            )
            for generated_item in timed["plan"]["generated"]["list"][1:]:
                generated_range = generated_item["selectionLv3"]["dateValue"]
                self.assertNotIn("-", generated_range["from"])
                self.assertNotIn("-", generated_range["to"])
                self.assertEqual(len(generated_range["from"]), 8)
                self.assertEqual(len(generated_range["to"]), 8)
            self.assertEqual(
                timed["intent"]["conditions"][1]["categories"],
                expected_core_categories,
            )
        finally:
            test_app.close()

    def test_dmp_operation_waits_for_confirmation_then_becomes_executable(self):
        call_count = 0

        def caller(_request):
            nonlocal call_count
            call_count += 1
            instructions = _request["json"]["instructions"]
            self.assertIn("达摩盘画像标签实时目录", instructions)
            self.assertIn('"tagId":"114555","tagName":"用户年龄"', instructions)
            return responses_payload(
                {
                    "assistantMessage": "取数方案已整理。",
                    "intent": None,
                    "operation": {
                        "action": "prepare_dmp_batch_profile",
                        "crowdNames": ["人群A", "人群B"],
                        "tagIds": ["114554", "213510", "266238"],
                        "tagNames": ["性别", "城市等级", "大快消策略人群（新）"],
                        "comparisonMetrics": ["人群占比", "Rebase"],
                        "tagSelectionConfirmed": True,
                        "loginConfirmed": False,
                        "userConfirmed": False,
                        "autoOpenComparison": True,
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-dmp-operation-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            first = test_app.client.post(
                "/api/ai/chat",
                json={"message": "给人群A和人群B取达摩盘画像并横向对比，标签只要性别、城市等级和大快消策略人群"},
            ).get_json()
            self.assertEqual(first["status"], "needs_confirmation")
            self.assertEqual(first["operation"]["action"], "prepare_dmp_batch_profile")
            self.assertEqual(
                first["operation"]["tagNames"],
                ["用户性别", "城市等级", "大快消策略人群（新）"],
            )
            self.assertIn("达摩盘登录与任务执行器状态", first["operation"]["missingInputs"])

            second = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "两个都确定",
                    "currentOperation": first["operation"],
                    "currentWorkflow": first["workflow"],
                },
            ).get_json()
            self.assertEqual(second["status"], "ready")
            self.assertTrue(second["operation"]["loginConfirmed"])
            self.assertTrue(second["operation"]["userConfirmed"])
            self.assertIn("自动展示横向对比", second["reply"])
            self.assertEqual(call_count, 1)
        finally:
            test_app.close()

    def test_dmp_request_inherits_prior_multiline_names_and_offers_ordered_defaults(self):
        captured_input = {}

        def caller(request):
            captured_input.update(json.loads(request["json"]["input"]))
            return responses_payload(
                {
                    "assistantMessage": "我找到了另一组标签。",
                    "intent": None,
                    "operation": {
                        "action": "prepare_dmp_batch_profile",
                        "crowdNames": [
                            "香水香氛风格调性_美妆年轻悦己人群策略A人群",
                            "深层清洁与角质管理_全域种草拉新人群策略A人群",
                        ],
                        "tagIds": ["114543", "114555", "114554", "114565", "114566", "114567"],
                        "tagNames": ["居住城市", "用户年龄", "用户性别", "用户星座", "预测子女性别", "宠物年龄"],
                        "tagSelectionConfirmed": False,
                        "loginConfirmed": False,
                        "userConfirmed": False,
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-dmp-history-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            crowd_names = [
                "香水香氛风格调性_美妆年轻悦己人群策略A人群",
                "深层清洁与角质管理_全域种草拉新人群策略A人群",
            ]
            response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "帮我去达摩盘获取画像透视的数据",
                    "history": [
                        {"role": "user", "content": "\n".join(crowd_names)},
                        {"role": "assistant", "content": "请继续说明需要执行的操作。"},
                    ],
                    "currentWorkflow": {"id": "direct-workbench-audience-build"},
                },
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["workflow"]["id"], "dmp-batch-profile-comparison")
            self.assertEqual(data["operation"]["crowdNames"], crowd_names)
            self.assertEqual(
                data["operation"]["tagNames"],
                [
                    "用户性别",
                    "用户年龄",
                    "城市等级",
                    "消费能力等级",
                    "月均消费金额",
                    "大快消策略人群（新）",
                ],
            )
            self.assertEqual(
                data["operation"]["tagIds"],
                ["114554", "114555", "213510", "163535", "150374", "266238"],
            )
            self.assertFalse(data["operation"]["tagSelectionConfirmed"])
            self.assertIn("默认画像标签确认", data["operation"]["missingInputs"])
            self.assertIn("① 用户性别", data["reply"])
            self.assertIn("⑥ 大快消策略人群（新）", data["reply"])
            self.assertIn("删除月均消费金额", data["reply"])
            self.assertIn("新增人生阶段", data["reply"])
            self.assertIn("把用户年龄移到第1个", data["reply"])
            self.assertEqual(captured_input["currentOperation"]["crowdNames"], crowd_names)

            confirmed = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "默认就行",
                    "currentOperation": data["operation"],
                    "currentWorkflow": data["workflow"],
                },
            ).get_json()
            self.assertTrue(confirmed["operation"]["tagSelectionConfirmed"])
            self.assertFalse(confirmed["operation"]["loginConfirmed"])
            self.assertIn(
                "达摩盘登录与任务执行器状态",
                confirmed["operation"]["missingInputs"],
            )
            self.assertNotIn(
                "默认画像标签确认",
                confirmed["operation"]["missingInputs"],
            )
        finally:
            test_app.close()

    def test_affirmative_reply_to_recent_dmp_prompt_opens_default_tag_confirmation(self):
        def caller(_request):
            return responses_payload(
                {"assistantMessage": "好的。", "intent": None, "operation": None}
            )

        test_app = create_authenticated_test_app(
            "ai-dmp-affirmative-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            crowd_names = ["人群包甲", "人群包乙"]
            response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "是的",
                    "history": [
                        {"role": "user", "content": "\n".join(crowd_names)},
                        {
                            "role": "assistant",
                            "content": "这两行是人群包名称。要用它们去达摩盘批量取画像吗？",
                        },
                    ],
                    "currentWorkflow": {"id": "direct-workbench-audience-build"},
                },
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["workflow"]["id"], "dmp-batch-profile-comparison")
            self.assertEqual(data["operation"]["crowdNames"], crowd_names)
            self.assertEqual(data["operation"]["tagNames"], list(DMP_DEFAULT_TAG_NAMES))
            self.assertIn("① 用户性别", data["reply"])
            self.assertIn("默认就行", data["reply"])
        finally:
            test_app.close()

    def test_non_dmp_message_cannot_create_a_dmp_operation(self):
        def caller(_request):
            return responses_payload(
                {
                    "assistantMessage": "请说明要如何使用这两个人群。",
                    "intent": None,
                    "operation": {
                        "action": "prepare_dmp_batch_profile",
                        "crowdNames": ["人群A", "人群B"],
                        "tagIds": ["114543", "114565"],
                        "tagNames": ["居住城市", "用户星座"],
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-non-dmp-operation-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "人群A\n人群B"},
            )
            data = response.get_json()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "collecting")
            self.assertIsNone(data["operation"])
            self.assertEqual(data["workflow"]["id"], "direct-workbench-audience-build")
        finally:
            test_app.close()

    def test_chat_uses_compiler_question_for_account_permission(self):
        def caller(_request):
            return responses_payload(
                {
                    "assistantMessage": "我还需要确认账号权限。",
                    "intent": {
                        "schemaVersion": 1,
                        "conditions": [
                            {
                                "scope": "own_store",
                                "brand": "IPSA",
                                "canUseBrandAccount": None,
                                "behaviors": ["购买"],
                                "productIds": ["123456"],
                            }
                        ],
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-question-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "圈IPSA自店商品123456的购买人群"},
            )
            data = response.get_json()
            self.assertEqual(data["status"], "needs_clarification")
            self.assertIn("登录数据引擎", data["reply"])
            self.assertEqual(
                data["plan"]["questions"][0]["field"], "canUseBrandAccount"
            )
        finally:
            test_app.close()

    def test_exact_pending_option_is_applied_to_every_target_without_model_call(self):
        def caller(_request):
            raise AssertionError("点击实时选项不应再调用模型")

        test_app = create_authenticated_test_app(
            "ai-option-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            current_intent = {
                "schemaVersion": 1,
                "conditions": [
                    {
                        "id": "first",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": ["乳液面霜"],
                        "recentDays": 30,
                    },
                    {
                        "id": "second",
                        "relation": "exclude",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "categories": ["乳液面霜"],
                        "recentDays": 30,
                    },
                ],
            }
            question = {
                "id": "first.leafCates.1",
                "conditionId": "first",
                "field": "leafCates",
                "answerType": "single_select",
                "options": [{"value": CATEGORY, "label": CATEGORY}],
                "applyTargets": [
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
            }
            response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": CATEGORY,
                    "currentIntent": current_intent,
                    "pendingQuestions": [question],
                },
            )
            data = response.get_json()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(len(data["plan"]["nodes"]), 2)
            self.assertTrue(
                all(item["categories"] == [CATEGORY] for item in data["intent"]["conditions"])
            )
        finally:
            test_app.close()

    def test_structured_multi_select_keeps_all_brand_core_categories_without_model_call(self):
        def caller(_request):
            raise AssertionError("确认类目多选不应再调用模型")

        test_app = create_authenticated_test_app(
            "ai-category-multi-select-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        selected = [
            "美容护肤/美体/精油>面部护理套装",
            CATEGORY,
            "美容护肤/美体/精油>化妆水/爽肤水",
        ]
        try:
            current_intent = {
                "schemaVersion": 1,
                "audienceName": "海蓝之谜品牌核心类目",
                "conditions": [
                    {
                        "id": "brand-core",
                        "displayName": "对比时间内买过我品牌的人",
                        "component": "类目公域行为",
                        "behaviors": ["购买"],
                        "brands": ["海蓝之谜"],
                        "categories": ["面部护理套装", "乳液面霜", "化妆水/爽肤水"],
                        "recentDays": 30,
                    }
                ],
            }
            question = {
                "id": "brand-core.leafCates.1",
                "conditionId": "brand-core",
                "field": "leafCates",
                "answerType": "multi_select",
                "parameterName": "品牌核心类目",
                "maxSelections": 10,
                "options": [{"value": value, "label": value} for value in selected],
                "applyTargets": [
                    {
                        "conditionId": "brand-core",
                        "field": "leafCates",
                        "intentField": "categories",
                    }
                ],
            }
            response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "已选择品牌核心类目：面部护理套装、乳液面霜、化妆水/爽肤水",
                    "currentIntent": current_intent,
                    "pendingQuestions": [question],
                    "questionAnswer": {
                        "questionId": question["id"],
                        "values": selected,
                    },
                },
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(data["intent"]["conditions"][0]["categories"], selected)
            self.assertEqual(data["plan"]["nodes"][0]["formData"]["leafCates"], selected)
        finally:
            test_app.close()

    def test_model_absolute_date_range_wins_over_duplicated_recent_days(self):
        def caller(_request):
            return responses_payload(
                {
                    "assistantMessage": "已整理固定日期人群。",
                    "intent": {
                        "schemaVersion": 1,
                        "conditions": [
                            {
                                "behaviors": ["购买"],
                                "categories": [CATEGORY],
                                "recentDays": 30,
                                "dateRange": ["2026-01-01", "2026-01-31"],
                            }
                        ],
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-time-normalize-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "圈2026年1月购买过面霜的人"},
            )
            data = response.get_json()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertNotIn("recentDays", data["intent"]["conditions"][0])
            self.assertEqual(
                data["intent"]["conditions"][0]["dateRange"],
                ["2026-01-01", "2026-01-31"],
            )
        finally:
            test_app.close()

    def test_model_today_boundary_is_shifted_to_yesterday(self):
        today = business_today()
        start = today - timedelta(days=29)

        def caller(_request):
            return responses_payload(
                {
                    "assistantMessage": "已整理近30天人群。",
                    "intent": {
                        "schemaVersion": 1,
                        "conditions": [
                            {
                                "behaviors": ["购买"],
                                "categories": [CATEGORY],
                                "dateRange": [start.isoformat(), today.isoformat()],
                            }
                        ],
                    },
                }
            )

        test_app = create_authenticated_test_app(
            "ai-yesterday-cutoff-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_API_STYLE": "responses",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": "圈近30天购买过面霜的人"},
            )
            data = response.get_json()
            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(
                data["intent"]["conditions"][0]["dateRange"][1],
                latest_selectable_date().isoformat(),
            )
        finally:
            test_app.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
