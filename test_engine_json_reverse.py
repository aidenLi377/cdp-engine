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


def brand_promotion_exposure_all_scenes_30_days_json() -> dict:
    """Official export for exposure, all scenes, unlimited days, and recent 30 days."""
    return {
        "crowdName": "未命名",
        "list": [{
            "selectionLv1": ["FIELD", "AD"],
            "selectionLv3": {
                "cate": "ALL",
                "bhv": "15318#|#exp_pptg",
                "ppob_scene": [
                    "20216#|#395", "20215#|#389", "20084#|#76", "20083#|#78",
                    "19283#|#66", "19488#|#353", "19281#|#72", "19285#|#77",
                    "15371#|#50", "15350#|#60", "15365#|#49", "15376#|#74",
                    "15380#|#73", "15384#|#70", "20091#|#77",
                ],
                "dateType": "RELATIVE_RANGE",
                "dateValue": "30",
                "dayFrequency": {"op": "OPEN_OPEN"},
            },
            "fromPoolId": 1,
            "selectionLv2Name": "品牌推广",
            "selectionLv2": ["15272#|#cate_8969"],
        }],
        "compute": "(0)",
    }


def official_eight_node_relative_dates_json() -> dict:
    """Official mixed-pool JSON supplied for the import regression."""
    def node(lv1, lv2, lv3, pool, **extra):
        result = {
            "selectionLv1": lv1,
            "selectionLv3": lv3,
            "fromPoolId": pool,
            **extra,
        }
        if lv2 is not None:
            result["selectionLv2"] = lv2
        return result

    def recent(days):
        return {"dateType": "RELATIVE_RANGE", "dateValue": str(days)}

    unlimited = {"op": "OPEN_OPEN"}
    return {
        "crowdName": "未命名",
        "list": [
            node(
                ["COMMON_TOUCH", "PUBLIC_CATE_BHV"], None,
                {
                    "extraFilters": {
                        "channel": ["16772#|#4"],
                        "stdBrand": ["20096", "18641319"],
                        "frequency": unlimited, "price": unlimited,
                        "itemprice": unlimited,
                    },
                    "leafCates": ["50011980#|#50011980"],
                    "bhv": ["18919#|#CATE_PUBLIC_PAY"],
                    **recent(20),
                }, 0,
            ),
            node(
                ["FIELD", "AD"], ["15272#|#cate_8969"],
                {
                    "cate": "ALL", "bhv": "15298#|#click_pptg",
                    "ppob_scene": ["20212#|#395", "15349#|#60", "15364#|#49"],
                    **recent(180), "dayFrequency": unlimited,
                }, 0, selectionLv2Name="品牌推广", op="INIT",
            ),
            node(
                ["FIELD", "AD"], ["15270#|#cate_8954"],
                {
                    "account": "ALL", "bhv": "15296#|#onebp_expose",
                    "onebp_scene": ["15405#|#372", "15403#|#371"],
                    **recent(180), "dayFrequency": unlimited,
                }, 0, selectionLv2Name="效果推广", op="INIT",
            ),
            node(
                ["FIELD", "AD"], ["15250#|#EB"],
                {
                    "contType": "bhv", "account": "ALL",
                    "dayFrequency": unlimited, "bhv": "15274#|#EXPOSE_AD",
                    **recent(12),
                }, 0, selectionLv2Name="品牌专区", op="INIT",
            ),
            node(
                ["FIELD", "AD"], ["19872#|#EXP_UD_ZHT_EXP_BHV"],
                {
                    "dayFrequency": unlimited,
                    "bhv": "19873#|#EXP_UD_ZHT_EXP_BHV",
                    "bhv_type": "exp_udzht", **recent(180),
                }, 1, selectionLv2Name="全媒体智投", op="INIT",
                tipProperty={
                    "dateTo": "20240717", "type": 3,
                    "dateFrom": "20240615", "content": "原UD智汇投更名为全媒体智投",
                },
            ),
            node(
                ["FIELD", "AD"], ["19936#|#cate_9195"],
                {"bhv": "19937#|#is_pv_uddmt", **recent(180)},
                1, selectionLv2Name="单媒体智投", op="INIT",
                tipProperty={
                    "dateTo": "20990129", "type": 3, "dateFrom": "20250814",
                },
            ),
            node(
                ["FIELD", "SEARCH"], None,
                {
                    "contType": "bhv",
                    "searchs": ["你没事吧", "meishi", "没事就好"],
                    **recent(180),
                }, 2, op="INIT",
            ),
            node(
                ["COMMODITY", "ITEM"], ["16596#|#ALL"],
                {
                    "keywords": None, "cate": "201166702#|#201166702",
                    "bhv": ["16628#|#VIEW_ITEM"],
                    "dayFrequency": unlimited,
                    "selectedGoodsType": "1", **recent(180),
                }, 3, op="INIT",
            ),
        ],
        "compute": "(0n1n2n3)u(4u5)n(6)u(7)",
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

    def test_brand_promotion_exposure_all_scenes_with_30_days_round_trips(self):
        payload = brand_promotion_exposure_all_scenes_30_days_json()
        item = payload["list"][0]

        result = self.parser.parse(payload)

        self.assertTrue(result["success"], result)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["unsupportedParameters"], [])
        node = result["nodes"][0]
        self.assertEqual(node["formData"]["time"]["days"], 30)
        self.assertEqual(len(node["formData"]["ppob_scene"]), 15)
        self.assertEqual(node["formData"]["ppob_scene"][2], "淘内展示营销 - 品牌闪购")
        self.assertEqual(
            self.parser._regenerate_item(
                "品牌推广",
                self.engine.get_package_meta("品牌推广"),
                node["formData"],
                node["modeData"],
            ),
            item,
        )

    def test_import_preserves_official_pool_ids_and_single_media_relative_days(self):
        brand = brand_promotion_exposure_all_scenes_30_days_json()["list"][0]
        brand["fromPoolId"] = 0  # Unlike the component's generated default of 1.
        category = category_node(self.engine, "20250929", "20251005")
        category["fromPoolId"] = 1
        single_media = self.engine.generate_json({
            "_package": "单媒体智投",
            "bhv": "曝光",
            "time": {"val": {"days": 180}, "min": "recent"},
        })["list"][0]
        single_media["fromPoolId"] = 1  # Not the compute pool index (2).
        single_media["selectionLv3"]["dateValue"] = "180"
        payload = {
            "crowdName": "官方混合池样本",
            "list": [brand, category, single_media],
            "compute": "(0)u(1)n(2)",
        }

        result = self.parser.parse(payload)

        self.assertTrue(result["success"], result)
        self.assertEqual([node["engineJsonImport"]["fromPoolId"] for node in result["nodes"]], [0, 1, 1])
        self.assertEqual(result["nodes"][2]["formData"]["time"]["days"], 180)
        self.assertEqual(
            result["nodes"][2]["engineJsonImport"]["relativeDateValue"],
            {"present": True, "initialDays": 180},
        )

    def test_official_eight_node_relative_dates_imports_without_loss(self):
        payload = official_eight_node_relative_dates_json()

        result = self.parser.parse(payload)

        self.assertTrue(result["success"], result)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["unsupportedParameters"], [])
        self.assertEqual(len(result["nodes"]), 8)
        self.assertEqual(
            [node["engineJsonImport"]["fromPoolId"] for node in result["nodes"]],
            [0, 0, 0, 0, 1, 1, 2, 3],
        )
        self.assertEqual(result["nodes"][5]["formData"]["time"]["days"], 180)

    def test_import_keeps_missing_single_media_date_value_variant(self):
        item = self.engine.generate_json({
            "_package": "单媒体智投",
            "bhv": "曝光",
            "time": {"val": {"days": 180}, "min": "recent"},
        })["list"][0]
        result = self.parser.parse({"crowdName": "未命名", "list": [item], "compute": "(0)"})

        self.assertTrue(result["success"], result)
        self.assertEqual(
            result["nodes"][0]["engineJsonImport"]["relativeDateValue"],
            {"present": False, "initialDays": 180},
        )

    def test_import_rejects_non_numeric_from_pool_id(self):
        payload = brand_promotion_exposure_all_scenes_30_days_json()
        payload["list"][0]["fromPoolId"] = "0"

        result = self.parser.parse(payload)

        self.assertFalse(result["success"])
        self.assertTrue(any(entry["path"] == "fromPoolId" for entry in result["unsupportedParameters"]))

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
    def test_official_eight_node_import_preview_is_ready(self):
        test_app = create_authenticated_test_app("eight-node-import-user")
        try:
            response = test_app.client.post(
                "/api/workbench/import-engine-json/preview",
                json={"text": json.dumps(official_eight_node_relative_dates_json(), ensure_ascii=False)},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertTrue(data["success"], data)
            self.assertEqual(len(data["nodes"]), 8)
            self.assertEqual(data["nodes"][5]["engineJsonImport"]["fromPoolId"], 1)
            self.assertEqual(data["nodes"][5]["engineJsonImport"]["relativeDateValue"]["initialDays"], 180)
        finally:
            test_app.close()

    def test_official_brand_promotion_exposure_preview_is_ready(self):
        test_app = create_authenticated_test_app("brand-promotion-exposure-import-user")
        try:
            response = test_app.client.post(
                "/api/workbench/import-engine-json/preview",
                json={"text": json.dumps(
                    brand_promotion_exposure_all_scenes_30_days_json(),
                    ensure_ascii=False,
                )},
            )
            data = response.get_json()

            self.assertEqual(response.status_code, 200)
            self.assertEqual(data["status"], "ready")
            self.assertEqual(data["unsupportedParameters"], [])
            self.assertEqual(data["nodes"][0]["formData"]["time"]["days"], 30)
        finally:
            test_app.close()

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
