"""本模块仅保留用于本地调试与过渡验证，不作为最终用户正式自动化方案。"""

from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

try:
    import websocket  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency
    websocket = None


DATABANK_URL = "https://databank.tmall.com/#/userDefinedAnalyses"
DATABANK_PARAM_TRIGGER_XPATH = "/html/body/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div[2]/div/div/div/div/div[2]/div[1]/div[1]/div[3]/span[2]"
DATABANK_TEXTAREA_XPATH = "/html/body/div[6]/div[2]/div[1]/div/div[2]/div/span/textarea"
DATABANK_CONFIRM_XPATH = "/html/body/div[6]/div[2]/div[2]/button[1]"
DEFAULT_DEBUG_PORT = 9222
DEFAULT_STARTUP_WAIT_SECONDS = 8.0
DEFAULT_STEP_WAIT_SECONDS = 0.6
DEFAULT_XPATH_TIMEOUT_SECONDS = 20.0
DEFAULT_POLL_INTERVAL_SECONDS = 0.25


class DatabankAutomationError(RuntimeError):
    pass


@dataclass(slots=True)
class _ChromeDebugTarget:
    target_id: str
    websocket_url: str
    current_url: str


class DatabankAutomator:
    def __init__(
        self,
        *,
        chrome_debug_port: int = DEFAULT_DEBUG_PORT,
        startup_wait_seconds: float = DEFAULT_STARTUP_WAIT_SECONDS,
        xpath_timeout_seconds: float = DEFAULT_XPATH_TIMEOUT_SECONDS,
        poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
        step_wait_seconds: float = DEFAULT_STEP_WAIT_SECONDS,
    ) -> None:
        self.chrome_debug_port = chrome_debug_port
        self.startup_wait_seconds = startup_wait_seconds
        self.xpath_timeout_seconds = xpath_timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self.step_wait_seconds = step_wait_seconds

    def automate(self, json_text: str) -> dict[str, Any]:
        payload = str(json_text or "").strip()
        if not payload:
            raise DatabankAutomationError("jsonText 不能为空")

        browser_endpoint = self._ensure_browser_ready()
        target = self._ensure_databank_target(browser_endpoint)
        connection = None
        if websocket is None:
            raise DatabankAutomationError("缺少 websocket-client 依赖，无法执行自动化")

        try:
            connection = websocket.create_connection(target.websocket_url, timeout=self.xpath_timeout_seconds)
            client = _ChromeDevtoolsClient(connection)
            client.enable_runtime()
            client.enable_page()
            if not self._is_expected_page(target.current_url):
                client.navigate(DATABANK_URL)
                client.wait_for_load()

            self._click_xpath(client, DATABANK_PARAM_TRIGGER_XPATH)
            time.sleep(self.step_wait_seconds)
            self._paste_textarea(client, DATABANK_TEXTAREA_XPATH, payload)
            time.sleep(self.step_wait_seconds)
            self._click_xpath(client, DATABANK_CONFIRM_XPATH)
            return {
                "ok": True,
                "url": DATABANK_URL,
                "mode": "chrome-devtools-rpa-tab",
            }
        except DatabankAutomationError:
            raise
        except Exception as exc:  # pragma: no cover - defensive runtime wrapper
            raise DatabankAutomationError(f"自动化执行失败: {exc}") from exc
        finally:
            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass

    def _click_xpath(self, client: "_ChromeDevtoolsClient", xpath: str) -> None:
        self._wait_for_xpath(client, xpath)
        clicked = client.evaluate_xpath_click(xpath)
        if not clicked:
            raise DatabankAutomationError(f"未能点击目标节点: {xpath}")

    def _paste_textarea(self, client: "_ChromeDevtoolsClient", xpath: str, value: str) -> None:
        self._wait_for_xpath(client, xpath)
        pasted = client.evaluate_xpath_input(xpath, value)
        if not pasted:
            raise DatabankAutomationError(f"未能写入目标输入框: {xpath}")

    def _wait_for_xpath(self, client: "_ChromeDevtoolsClient", xpath: str) -> None:
        deadline = time.time() + self.xpath_timeout_seconds
        while time.time() < deadline:
            if client.evaluate_xpath_exists(xpath):
                return
            time.sleep(self.poll_interval_seconds)
        raise DatabankAutomationError(f"等待页面元素超时: {xpath}")

    def _ensure_browser_ready(self) -> str:
        endpoint = self._get_browser_websocket_endpoint()
        if endpoint is not None:
            return endpoint

        self._launch_chrome_debug_with_existing_profile()
        deadline = time.time() + self.startup_wait_seconds
        while time.time() < deadline:
            endpoint = self._get_browser_websocket_endpoint()
            if endpoint is not None:
                return endpoint
            time.sleep(self.poll_interval_seconds)
        raise DatabankAutomationError(
            "未发现可用的 Chrome 调试浏览器。请先用带 --remote-debugging-port=9222 的 Chrome 启动当前工作浏览器后再重试",
        )

    def _ensure_databank_target(self, browser_endpoint: str) -> _ChromeDebugTarget:
        target = self._find_target()
        if target is not None and self._is_expected_page(target.current_url):
            return target

        created = self._create_new_tab(DATABANK_URL)
        if created is not None:
            return created

        target = self._find_target()
        if target is not None:
            return target
        raise DatabankAutomationError("未能在当前 Chrome 中打开达摩盘标签页")

    def _launch_chrome_debug_with_existing_profile(self) -> None:
        chrome_path = self._resolve_chrome_path()
        if chrome_path is None:
            raise DatabankAutomationError("未找到 Chrome 可执行文件，请先安装或手动启动带调试端口的 Chrome")

        subprocess.Popen(
            [
                chrome_path,
                f"--remote-debugging-port={self.chrome_debug_port}",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    def _resolve_chrome_path(self) -> str | None:
        candidates = [
            os.environ.get("CDP_CHROME_PATH"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
        for candidate in candidates:
            if candidate and os.path.exists(candidate):
                return candidate
        return None

    def _get_browser_websocket_endpoint(self) -> str | None:
        version_url = f"http://127.0.0.1:{self.chrome_debug_port}/json/version"
        try:
            with urllib.request.urlopen(version_url, timeout=1.5) as response:
                data = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return None
        endpoint = str((data or {}).get("webSocketDebuggerUrl") or "")
        return endpoint or None

    def _find_target(self) -> _ChromeDebugTarget | None:
        version_url = f"http://127.0.0.1:{self.chrome_debug_port}/json"
        try:
            with urllib.request.urlopen(version_url, timeout=1.5) as response:
                targets = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return None

        if not isinstance(targets, list):
            return None

        fallback_target: _ChromeDebugTarget | None = None
        for item in targets:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "page":
                continue
            target_id = str(item.get("id") or "")
            current_url = str(item.get("url") or "")
            websocket_url = str(item.get("webSocketDebuggerUrl") or "")
            if not websocket_url or not target_id:
                continue
            target = _ChromeDebugTarget(target_id=target_id, websocket_url=websocket_url, current_url=current_url)
            if self._is_expected_page(current_url):
                return target
            if fallback_target is None:
                fallback_target = target
        return fallback_target

    def _create_new_tab(self, url: str) -> _ChromeDebugTarget | None:
        endpoint = f"http://127.0.0.1:{self.chrome_debug_port}/json/new?{urllib.parse.urlencode({'': url})[1:]}"
        request = urllib.request.Request(endpoint, method="PUT")
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                item = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return None
        target_id = str(item.get("id") or "")
        websocket_url = str(item.get("webSocketDebuggerUrl") or "")
        current_url = str(item.get("url") or url)
        if not target_id or not websocket_url:
            return None
        return _ChromeDebugTarget(
            target_id=target_id,
            websocket_url=websocket_url,
            current_url=current_url,
        )

    def _is_expected_page(self, url: str) -> bool:
        return "databank.tmall.com" in str(url or "") and "userDefinedAnalyses" in str(url or "")


class _ChromeDevtoolsClient:
    def __init__(self, connection: Any) -> None:
        self.connection = connection
        self.message_id = 0

    def enable_runtime(self) -> None:
        self._send("Runtime.enable")

    def enable_page(self) -> None:
        self._send("Page.enable")

    def navigate(self, url: str) -> None:
        self._send("Page.navigate", {"url": url})

    def wait_for_load(self) -> None:
        deadline = time.time() + DEFAULT_XPATH_TIMEOUT_SECONDS
        while time.time() < deadline:
            self.connection.settimeout(1.0)
            raw = self.connection.recv()
            data = json.loads(raw)
            if data.get("method") == "Page.loadEventFired":
                return
        raise DatabankAutomationError("等待页面加载超时")

    def evaluate_xpath_exists(self, xpath: str) -> bool:
        expression = """
          (() => {
            const result = document.evaluate(%s, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            return Boolean(result.singleNodeValue)
          })()
        """ % json.dumps(xpath)
        return bool(self._evaluate(expression))

    def evaluate_xpath_click(self, xpath: str) -> bool:
        expression = """
          (() => {
            const result = document.evaluate(%s, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            const node = result.singleNodeValue
            if (!node) return false
            if (typeof node.scrollIntoView === 'function') {
              node.scrollIntoView({ block: 'center', inline: 'center' })
            }
            const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
            const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
            const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
            node.dispatchEvent(mouseDown)
            node.dispatchEvent(mouseUp)
            node.dispatchEvent(clickEvt)
            if (typeof node.click === 'function') node.click()
            return true
          })()
        """ % json.dumps(xpath)
        return bool(self._evaluate(expression))

    def evaluate_xpath_input(self, xpath: str, value: str) -> bool:
        expression = """
          (() => {
            const result = document.evaluate(%s, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            const node = result.singleNodeValue
            if (!node) return false
            if (typeof node.focus === 'function') node.focus()
            node.value = %s
            node.dispatchEvent(new Event('input', { bubbles: true }))
            node.dispatchEvent(new Event('change', { bubbles: true }))
            return true
          })()
        """ % (json.dumps(xpath), json.dumps(value))
        return bool(self._evaluate(expression))

    def _evaluate(self, expression: str) -> Any:
        result = self._send(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            },
        )
        payload = result.get("result", {}).get("result", {})
        if "value" in payload:
            return payload["value"]
        if payload.get("type") == "undefined":
            return None
        return payload

    def _send(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.message_id += 1
        message = {"id": self.message_id, "method": method, "params": params or {}}
        self.connection.send(json.dumps(message))
        while True:
            raw = self.connection.recv()
            response = json.loads(raw)
            if response.get("id") != self.message_id:
                continue
            if "error" in response:
                raise DatabankAutomationError(str(response["error"]))
            return response
