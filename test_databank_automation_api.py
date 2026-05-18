from __future__ import annotations

import os
import unittest

os.environ["FLASK_ENV"] = "development"

from cdp_backend.app_factory import create_app  # noqa: E402
from cdp_backend.databank_automation import DatabankAutomationError  # noqa: E402


class FakeDatabankAutomator:
    def __init__(self):
        self.calls: list[str] = []

    def automate(self, json_text: str) -> dict:
        self.calls.append(json_text)
        return {"ok": True, "mode": "fake"}


class FailingDatabankAutomator:
    def automate(self, _json_text: str) -> dict:
        raise DatabankAutomationError("automation failed")


class DatabankAutomationApiTests(unittest.TestCase):
    def test_missing_json_text_returns_400(self):
        app, _engine = create_app(databank_automator=FakeDatabankAutomator())
        client = app.test_client()

        response = client.post("/api/databank/automate", json={})

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_automation_endpoint_calls_automator(self):
        automator = FakeDatabankAutomator()
        app, _engine = create_app(databank_automator=automator)
        client = app.test_client()
        json_text = '{\n  "crowdName": "测试"\n}'

        response = client.post("/api/databank/automate", json={"jsonText": json_text})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(automator.calls, [json_text])
        self.assertEqual(response.get_json()["ok"], True)

    def test_automation_failure_returns_502(self):
        app, _engine = create_app(databank_automator=FailingDatabankAutomator())
        client = app.test_client()

        response = client.post("/api/databank/automate", json={"jsonText": "{}"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["error"], "automation failed")


if __name__ == "__main__":
    unittest.main(verbosity=2)
