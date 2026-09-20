from __future__ import annotations

import json
import unittest

from test_support import create_authenticated_test_app


class AiBatchNamingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requests: list[dict] = []

        def caller(request_payload: dict) -> dict:
            self.requests.append(request_payload)
            content = {
                "assistantMessage": "已按最终参数生成名称",
                "intent": {
                    "suggestions": [
                        {
                            "id": "one",
                            "name": "XT_Dior香水_近30天购买_天猫",
                        }
                    ]
                },
                "operation": None,
            }
            return {
                "choices": [
                    {"message": {"content": json.dumps(content, ensure_ascii=False)}}
                ]
            }

        self.test_app = create_authenticated_test_app(
            test_config={
                "AI_MODEL": "test-model",
                "AI_BASE_URL": "https://example.test/v1",
                "AI_ALLOW_NO_API_KEY": True,
                "AI_API_STYLE": "chat_completions",
                "AI_OUTPUT_MODE": "json_object",
                "AI_MODEL_CALLER": caller,
            }
        )

    def tearDown(self) -> None:
        self.test_app.close()

    def test_batch_names_route_uses_model_once_and_strips_xt(self):
        response = self.test_app.client.post(
            "/api/ai/batch-names",
            json={
                "entries": [
                    {
                        "id": "one",
                        "currentName": "Dior香水购买",
                        "solutionName": "自由搭建圈包",
                        "parameterField": "品牌",
                        "parameterValues": ["Dior/迪奥"],
                        "nodes": [
                            {
                                "component": "商品行为",
                                "name": "官旗购买",
                                "parameters": [
                                    {"label": "时间", "value": "近30天"},
                                    {"label": "渠道", "value": "天猫"},
                                ],
                            }
                        ],
                    }
                ]
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["suggestions"],
            [{"id": "one", "name": "Dior香水_近30天购买_天猫"}],
        )
        self.assertEqual(len(self.requests), 1)
        sent_body = self.requests[0]["json"]
        self.assertEqual(sent_body["model"], "test-model")
        self.assertIn("Dior/迪奥", sent_body["messages"][1]["content"])

    def test_batch_names_route_rejects_empty_entries(self):
        response = self.test_app.client.post(
            "/api/ai/batch-names",
            json={"entries": []},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "INVALID_REQUEST")
        self.assertEqual(self.requests, [])


if __name__ == "__main__":
    unittest.main()
