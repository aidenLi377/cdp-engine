from __future__ import annotations

import unittest

from cdp_backend.ai_batch_naming import (
    AiBatchNamingRequestError,
    AiBatchNamingService,
)


class FakeModel:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def interpret(self, prompt, context):
        self.calls.append((prompt, context))
        return self.result


def make_entries():
    return [
        {
            "id": "one",
            "currentName": "原始名称1",
            "solutionName": "品类新客",
            "parameterField": "品牌",
            "parameterValues": ["兰蔻"],
            "nodes": [
                {
                    "component": "类目公域行为",
                    "name": "统计时间内购买分析类目",
                    "parameters": [
                        {"label": "时间", "value": "近180天"},
                        {"label": "行为", "value": "购买"},
                    ],
                }
            ],
        },
        {
            "id": "two",
            "currentName": "原始名称2",
            "solutionName": "品类新客",
            "parameterField": "品牌",
            "parameterValues": ["雅诗兰黛"],
            "nodes": [],
        },
    ]


class AiBatchNamingTests(unittest.TestCase):
    def test_ai_batch_names_strip_xt_and_deduplicate(self):
        model = FakeModel(
            {
                "assistantMessage": "已生成",
                "intent": {
                    "suggestions": [
                        {"id": "one", "name": "XT兰蔻/乳液面霜_近半年品类新客"},
                        {"id": "two", "name": "XT_兰蔻/乳液面霜_近半年品类新客"},
                    ]
                },
            }
        )
        result = AiBatchNamingService(model).suggest({"entries": make_entries()})
        self.assertEqual(
            [item["name"] for item in result["suggestions"]],
            ["兰蔻_乳液面霜_近半年品类新客", "兰蔻_乳液面霜_近半年品类新客_02"],
        )
        self.assertEqual(len(model.calls), 1)
        self.assertIn("禁止添加XT", model.calls[0][0])

    def test_missing_model_suggestion_uses_existing_name_without_xt_prefix(self):
        entries = make_entries()
        entries[1]["currentName"] = "XT_雅诗兰黛_品类新客"
        model = FakeModel(
            {
                "assistantMessage": "仅返回一条",
                "intent": {"suggestions": [{"id": "one", "name": "兰蔻_品类新客"}]},
            }
        )
        result = AiBatchNamingService(model).suggest({"entries": entries})
        self.assertEqual(result["suggestions"][1]["name"], "雅诗兰黛_品类新客")

    def test_batch_name_request_rejects_empty_duplicate_and_excessive_entries(self):
        service = AiBatchNamingService(FakeModel({}))
        with self.assertRaisesRegex(AiBatchNamingRequestError, "至少提供一个"):
            service.suggest({"entries": []})
        with self.assertRaisesRegex(AiBatchNamingRequestError, "唯一任务ID"):
            service.suggest({"entries": [{"id": "same"}, {"id": "same"}]})
        with self.assertRaisesRegex(AiBatchNamingRequestError, "最多为100个"):
            service.suggest({"entries": [{"id": str(index)} for index in range(101)]})


if __name__ == "__main__":
    unittest.main()
