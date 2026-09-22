from __future__ import annotations

import copy
import json
import unittest

from cdp_backend.engine import ConfigEngine
from cdp_backend.engine_json_reverse import EngineJsonReverseParser
from test_support import create_authenticated_test_app


CATEGORY = "美容护肤/美体/精油>乳液/面霜"
BRAND = "CPB/肌肤之钥"


def category_node(engine: ConfigEngine, start: str, end: str) -> dict:
    generated = engine.generate_json(
        {
            "_package": "类目公域行为",
            "bhv": ["购买"],
            "leafCates": [CATEGORY],
            "stdBrand": [BRAND],
            "channel": ["天猫"],
            "frequency": {"min": "", "max": ""},
            "price": {"min": "", "max": ""},
            "itemprice": {"min": "", "max": ""},
            "time": {
                "min": "range",
                "val": {"start": start, "end": end},
            },
        }
    )["list"][0]
    return generated


def sample_engine_json(engine: ConfigEngine) -> dict:
    first = category_node(engine, "20260224", "20260308")
    second = category_node(engine, "20251001", "20251111")
    first["fromPoolId"] = 0
    second["fromPoolId"] = 1
    second["op"] = "INIT"
    return {
        "crowdName": "同品类复购",
        "list": [first, second],
        "compute": "(0)n(1)",
    }


class EngineJsonReverseParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = ConfigEngine(validate_on_load=False)
        cls.parser = EngineJsonReverseParser(cls.engine)

    def test_restores_workbench_nodes_and_relationships_without_model(self):
        result = self.parser.parse(sample_engine_json(self.engine))

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(result["nodes"]), 2)
        first, second = result["nodes"]
        self.assertEqual(first["packageType"], "类目公域行为")
        self.assertEqual(first["formData"]["bhv"], ["购买"])
        self.assertEqual(first["formData"]["leafCates"], [CATEGORY])
        self.assertEqual(first["formData"]["stdBrand"], [BRAND])
        self.assertEqual(first["formData"]["time"]["dateRange"], ["20260224", "20260308"])
        self.assertIsNone(first["operator"])
        self.assertEqual(second["operator"], "n")
        self.assertNotEqual(first["poolId"], second["poolId"])

    def test_unknown_node_and_parameter_block_the_entire_import(self):
        payload = sample_engine_json(self.engine)
        payload["list"][0]["selectionLv1"] = ["CODEX_TEST", "UNSUPPORTED_NODE"]
        payload["list"][1]["selectionLv3"]["codexUnsupportedParam"] = "codex-test"

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "unsupported")
        self.assertEqual(result["nodes"], [])
        self.assertEqual(result["unsupportedNodes"][0]["nodeIndex"], 1)
        self.assertTrue(
            any(
                item["path"] == "selectionLv3.codexUnsupportedParam"
                for item in result["unsupportedParameters"]
            )
        )

    def test_invalid_compute_is_rejected_without_partial_nodes(self):
        payload = sample_engine_json(self.engine)
        payload["compute"] = "(0)n(9)"

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "invalid")
        self.assertEqual(result["nodes"], [])
        self.assertIn("不存在的节点9", result["errors"][0])

    def test_extracts_json_from_a_conversational_code_fence(self):
        payload = sample_engine_json(self.engine)
        message = "请覆盖当前工作台：\n```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```"

        extracted = self.parser.extract(message)

        self.assertTrue(extracted.detected)
        self.assertEqual(extracted.payload, payload)
        self.assertIsNone(extracted.error)


class EngineJsonReverseChatApiTests(unittest.TestCase):
    def test_chat_uses_reverse_parser_and_never_calls_the_model(self):
        model_calls = 0

        def caller(_request):
            nonlocal model_calls
            model_calls += 1
            raise AssertionError("engine JSON import must bypass the model")

        test_app = create_authenticated_test_app(
            "engine-json-reverse-user",
            test_config={
                "AI_API_KEY": "server-secret",
                "AI_MODEL": "test-model",
                "AI_MODEL_CALLER": caller,
            },
        )
        try:
            payload = sample_engine_json(test_app.engine)
            response = test_app.client.post(
                "/api/ai/chat",
                json={
                    "message": "请导入并覆盖当前工作台\n"
                    + json.dumps(payload, ensure_ascii=False)
                },
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(data["plan"]["source"], "engine-json")
            self.assertEqual(data["plan"]["importMode"], "replace")
            self.assertTrue(data["plan"]["skipReplaceConfirmation"])
            self.assertEqual(len(data["plan"]["nodes"]), 2)
            self.assertEqual(model_calls, 0)
        finally:
            test_app.close()

    def test_chat_lists_missing_configuration_and_does_not_apply(self):
        test_app = create_authenticated_test_app(
            "engine-json-unsupported-user",
            test_config={"AI_API_KEY": "server-secret", "AI_MODEL": "test-model"},
        )
        try:
            payload = sample_engine_json(test_app.engine)
            broken = copy.deepcopy(payload)
            broken["list"][0]["selectionLv3"]["missingParameter"] = "x"
            response = test_app.client.post(
                "/api/ai/chat",
                json={"message": json.dumps(broken, ensure_ascii=False)},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "unsupported")
            self.assertEqual(data["plan"]["nodes"], [])
            self.assertIn("missingParameter", data["reply"])
            self.assertIn("请联系管理员补充参数", data["reply"])
        finally:
            test_app.close()


if __name__ == "__main__":
    unittest.main()
