from __future__ import annotations

import unittest

from cdp_backend.databank_automation import (
    DATABANK_CONFIRM_XPATH,
    DATABANK_PARAM_TRIGGER_XPATH,
    DATABANK_TEXTAREA_XPATH,
    DatabankAutomator,
)


class FakeClient:
    def __init__(self):
        self.actions: list[tuple] = []

    def enable_runtime(self) -> None:
        self.actions.append(("enable_runtime",))

    def enable_page(self) -> None:
        self.actions.append(("enable_page",))

    def navigate(self, url: str) -> None:
        self.actions.append(("navigate", url))

    def wait_for_load(self) -> None:
        self.actions.append(("wait_for_load",))

    def evaluate_xpath_exists(self, xpath: str) -> bool:
        self.actions.append(("exists", xpath))
        return True

    def evaluate_xpath_click(self, xpath: str) -> bool:
        self.actions.append(("click", xpath))
        return True

    def evaluate_xpath_input(self, xpath: str, value: str) -> bool:
        self.actions.append(("input", xpath, value))
        return True


class FakeConnection:
    def close(self) -> None:
        return None


class TestableDatabankAutomator(DatabankAutomator):
    def __init__(self):
        super().__init__(step_wait_seconds=0, xpath_timeout_seconds=1, poll_interval_seconds=0.01)
        self.launch_called = False
        self.fake_client = FakeClient()
        self.created_tab_urls: list[str] = []

    def _get_browser_websocket_endpoint(self):
        return "ws://browser"

    def _find_target(self):
        return None

    def _create_new_tab(self, url: str):
        self.created_tab_urls.append(url)
        return type("Target", (), {
            "target_id": "tab-1",
            "websocket_url": "ws://fake-tab",
            "current_url": url,
        })()

    def _launch_chrome_debug_with_existing_profile(self) -> None:
        self.launch_called = True


class DatabankAutomatorUnitTests(unittest.TestCase):
    def test_automate_executes_three_target_actions(self):
        automator = TestableDatabankAutomator()

        import cdp_backend.databank_automation as module

        original_websocket = module.websocket
        original_client = module._ChromeDevtoolsClient

        class FakeWebsocketModule:
            @staticmethod
            def create_connection(_url: str, timeout: float):
                return FakeConnection()

        module.websocket = FakeWebsocketModule()
        module._ChromeDevtoolsClient = lambda _conn: automator.fake_client
        try:
            result = automator.automate('{"crowdName":"测试"}')
        finally:
            module._ChromeDevtoolsClient = original_client
            module.websocket = original_websocket

        self.assertEqual(result["ok"], True)
        self.assertFalse(automator.launch_called)
        self.assertEqual(
            automator.created_tab_urls,
            ["https://databank.tmall.com/#/userDefinedAnalyses"],
        )
        self.assertEqual(
            automator.fake_client.actions,
            [
                ("enable_runtime",),
                ("enable_page",),
                ("exists", DATABANK_PARAM_TRIGGER_XPATH),
                ("click", DATABANK_PARAM_TRIGGER_XPATH),
                ("exists", DATABANK_TEXTAREA_XPATH),
                ("input", DATABANK_TEXTAREA_XPATH, '{"crowdName":"测试"}'),
                ("exists", DATABANK_CONFIRM_XPATH),
                ("click", DATABANK_CONFIRM_XPATH),
            ],
        )

    def test_automate_reuses_existing_databank_tab(self):
        class ExistingTargetAutomator(TestableDatabankAutomator):
            def _find_target(self):
                return type("Target", (), {
                    "target_id": "existing-tab",
                    "websocket_url": "ws://existing-tab",
                    "current_url": "https://databank.tmall.com/#/userDefinedAnalyses",
                })()

        automator = ExistingTargetAutomator()

        import cdp_backend.databank_automation as module

        original_websocket = module.websocket
        original_client = module._ChromeDevtoolsClient

        class FakeWebsocketModule:
            @staticmethod
            def create_connection(_url: str, timeout: float):
                return FakeConnection()

        module.websocket = FakeWebsocketModule()
        module._ChromeDevtoolsClient = lambda _conn: automator.fake_client
        try:
            result = automator.automate('{"crowdName":"复用"}')
        finally:
            module._ChromeDevtoolsClient = original_client
            module.websocket = original_websocket

        self.assertEqual(result["ok"], True)
        self.assertEqual(automator.created_tab_urls, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
