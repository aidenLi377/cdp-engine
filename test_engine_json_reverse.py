from __future__ import annotations

import copy
import json
import unittest

from cdp_backend.engine import ConfigEngine
from cdp_backend.engine_json_reverse import (
    EngineJsonReverseParser,
    MAX_ENGINE_JSON_TEXT_LENGTH,
)
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


def commodity_json_without_channel_name(engine: ConfigEngine) -> dict:
    item = engine.generate_json(
        {
            "_package": "商品行为",
            "channel": ["天猫"],
            "bhv": ["购买"],
            "cate": "全部",
            "selectedGoodsType": "指定商品ID",
            "item": ["980829757490"],
            "frequency": {"min": "", "max": ""},
            "money": {"min": "", "max": ""},
            "time": {
                "min": "range",
                "val": {"start": "20260513", "end": "20260621"},
            },
        }
    )["list"][0]
    item.pop("selectionLv2Name")
    item.update({"op": None, "extra": {"status": "NORMAL"}, "index": None})
    return {
        "crowdName": "26D618高洁丝纯棉大师用户_副本",
        "list": [item],
        "compute": "(0)",
    }


def effect_promotion_json_without_level_two_name(engine: ConfigEngine) -> dict:
    item = engine.generate_json(
        {
            "_package": "效果推广",
            "account": "dior迪奥官方旗舰店",
            "bhv": "曝光",
            "onebp_scene": ["关键词推广(原淘内广告/直通车)"],
            "dayFrequency": {"min": "", "max": ""},
            "time": {
                "min": "range",
                "val": {"start": "20260801", "end": "20260831"},
            },
        }
    )["list"][0]
    item.pop("selectionLv2Name")
    item.update({"op": None, "extra": {"status": "NORMAL"}, "index": None})
    return {"crowdName": "直通车8月新客人数_副本", "list": [item], "compute": "(0)"}


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

    def test_parses_pasted_json_code_fence(self):
        payload = sample_engine_json(self.engine)
        text = "```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```"

        result = self.parser.parse_text(text)

        self.assertTrue(result["success"])
        self.assertEqual(result["crowdName"], payload["crowdName"])
        self.assertEqual(len(result["nodes"]), 2)

    def test_rejects_oversized_paste_before_json_parsing(self):
        result = self.parser.parse_text("{" * (MAX_ENGINE_JSON_TEXT_LENGTH + 1))

        self.assertFalse(result["success"])
        self.assertEqual(result["nodes"], [])
        self.assertIn("不能超过", result["errors"][0])

    def test_ignores_non_business_node_metadata(self):
        payload = sample_engine_json(self.engine)
        for position, item in enumerate(payload["list"]):
            item["extra"] = {"status": "NORMAL"}
            item["index"] = position
            item["lv2MetadataIdMap"] = {"ignored": "metadata"}
            item["op"] = None

        result = self.parser.parse(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["unsupportedParameters"], [])
        self.assertEqual(len(result["nodes"]), 2)

    def test_null_object_fields_are_equivalent_to_omitted_fields(self):
        payload = sample_engine_json(self.engine)
        payload["officialMetadata"] = None
        for item in payload["list"]:
            item["selectionLv2"] = None
            item["selectionLv2Name"] = None
            item["selectionLv3"]["unusedOfficialField"] = None

        result = self.parser.parse(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["unsupportedParameters"], [])
        self.assertEqual(len(result["nodes"]), 2)

    def test_empty_official_brand_filter_is_unselected_not_unsupported(self):
        payload = sample_engine_json(self.engine)
        payload["list"][0]["selectionLv3"]["extraFilters"]["stdBrand"] = []
        payload["list"][0]["selectionLv3"]["extraFilters"]["itemprice"] = {
            "op": "OPEN_CLOSE",
            "min": 200,
        }

        result = self.parser.parse(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["nodes"][0]["formData"]["stdBrand"], [])
        self.assertEqual(result["nodes"][1]["formData"]["stdBrand"], [BRAND])
        self.assertEqual(result["unsupportedParameters"], [])

    def test_nonempty_official_brand_filter_still_requires_configured_value(self):
        payload = sample_engine_json(self.engine)
        payload["list"][0]["selectionLv3"]["extraFilters"]["stdBrand"] = ["unknown-brand-code"]

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertEqual(result["nodes"], [])
        self.assertTrue(any(
            entry["path"] == "selectionLv3.extraFilters.stdBrand"
            for entry in result["unsupportedParameters"]
        ))

    def test_commodity_channel_name_can_be_derived_when_official_json_omits_it(self):
        payload = commodity_json_without_channel_name(self.engine)

        result = self.parser.parse(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["nodes"][0]["formData"]["channel"], "天猫")
        self.assertEqual(result["unsupportedParameters"], [])

    def test_commodity_channel_name_is_checked_when_official_json_provides_it(self):
        payload = commodity_json_without_channel_name(self.engine)
        payload["list"][0]["selectionLv2Name"] = "不是天猫"

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertTrue(any(
            entry["path"] == "selectionLv2Name"
            for entry in result["unsupportedParameters"]
        ))

    def test_commodity_channel_code_still_requires_current_configuration(self):
        payload = commodity_json_without_channel_name(self.engine)
        payload["list"][0]["selectionLv2"] = ["unconfigured-channel-code"]

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertEqual(result["nodes"], [])
        self.assertTrue(any(
            entry["path"] == "selectionLv2"
            for entry in result["unsupportedParameters"]
        ))

    def test_effect_promotion_can_derive_omitted_level_two_name(self):
        payload = effect_promotion_json_without_level_two_name(self.engine)

        result = self.parser.parse(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["nodes"][0]["packageType"], "效果推广")
        self.assertEqual(result["unsupportedParameters"], [])

    def test_effect_promotion_still_checks_explicit_level_two_name(self):
        payload = effect_promotion_json_without_level_two_name(self.engine)
        payload["list"][0]["selectionLv2Name"] = "错误的名称"

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertTrue(any(
            entry["path"] == "selectionLv2Name"
            for entry in result["unsupportedParameters"]
        ))

    def test_unknown_ad_node_reports_its_discriminating_level_two_code(self):
        payload = effect_promotion_json_without_level_two_name(self.engine)
        payload["list"][0]["selectionLv2"] = ["15033#|#cate_8969"]

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertEqual(result["nodes"], [])
        self.assertEqual(result["unsupportedNodes"][0]["selectionLv2"], ["15033#|#cate_8969"])
        self.assertIn("15033#|#cate_8969", result["unsupportedNodes"][0]["reason"])

    def test_rejects_unknown_non_null_node_operation(self):
        payload = sample_engine_json(self.engine)
        payload["list"][1]["op"] = "UNKNOWN_OPERATION"

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertEqual(result["status"], "unsupported")
        self.assertTrue(
            any(item["path"] == "op" for item in result["unsupportedParameters"])
        )


class EngineJsonReverseImportApiTests(unittest.TestCase):
    def test_import_preview_works_without_ai_configuration(self):
        model_calls = 0

        def caller(_request):
            nonlocal model_calls
            model_calls += 1
            raise AssertionError("engine JSON import must bypass the model")

        test_app = create_authenticated_test_app(
            "engine-json-reverse-user",
            test_config={"AI_API_KEY": "", "AI_MODEL_CALLER": caller},
        )
        try:
            payload = sample_engine_json(test_app.engine)
            response = test_app.client.post(
                "/api/workbench/import-engine-json/preview",
                json={"text": json.dumps(payload, ensure_ascii=False)},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertTrue(data["success"])
            self.assertEqual(len(data["nodes"]), 2)
            self.assertEqual(data["crowdName"], "同品类复购")
            self.assertEqual(model_calls, 0)
        finally:
            test_app.close()

    def test_import_preview_lists_missing_configuration_and_returns_no_nodes(self):
        test_app = create_authenticated_test_app(
            "engine-json-unsupported-user",
            test_config={"AI_API_KEY": ""},
        )
        try:
            payload = sample_engine_json(test_app.engine)
            broken = copy.deepcopy(payload)
            broken["list"][0]["selectionLv3"]["missingParameter"] = "x"
            response = test_app.client.post(
                "/api/workbench/import-engine-json/preview",
                json={"text": json.dumps(broken, ensure_ascii=False)},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "unsupported")
            self.assertFalse(data["success"])
            self.assertEqual(data["nodes"], [])
            self.assertTrue(any(
                item["path"] == "selectionLv3.missingParameter"
                for item in data["unsupportedParameters"]
            ))
        finally:
            test_app.close()

    def test_invalid_json_returns_preview_error_without_nodes(self):
        test_app = create_authenticated_test_app("engine-json-invalid-user")
        try:
            response = test_app.client.post(
                "/api/workbench/import-engine-json/preview",
                json={"text": '{"crowdName":"bad","list":['},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "invalid")
            self.assertFalse(data["success"])
            self.assertEqual(data["nodes"], [])
            self.assertTrue(data["errors"])
        finally:
            test_app.close()


if __name__ == "__main__":
    unittest.main()
