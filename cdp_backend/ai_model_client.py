"""Small server-side adapter for OpenAI and OpenAI-compatible model APIs.

The browser never receives the API key.  The adapter deliberately returns a
provider-neutral JSON object so the rest of the CDP application does not know
which model endpoint is being used.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Callable
from urllib.parse import urlparse

import httpx


class AiNotConfiguredError(RuntimeError):
    """Raised when AI chat is used before a model has been configured."""


class AiProviderError(RuntimeError):
    """Raised when the configured provider cannot complete the request."""


class AiResponseError(RuntimeError):
    """Raised when the provider response is not usable JSON."""


INTERPRETATION_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["assistantMessage", "intent"],
    "properties": {
        "assistantMessage": {
            "type": "string",
            "description": "给用户的简短中文回复，不重复长篇方案详情。",
        },
        "intent": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "description": "完整的 CDP AI 圈包意图对象。",
                    "additionalProperties": True,
                },
            ]
        },
        "operation": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "description": "需要由系统真实功能执行的受控操作，例如达摩盘批量画像。",
                    "additionalProperties": True,
                },
            ]
        },
    },
}


def _clean_json_text(text: str) -> str:
    value = str(text or "").strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", value, flags=re.DOTALL | re.I)
    return fenced.group(1).strip() if fenced else value


class AiModelClient:
    """Call a configured model without leaking provider details to the UI."""

    SUPPORTED_API_STYLES = {"responses", "chat_completions"}
    SUPPORTED_OUTPUT_MODES = {"json_schema", "json_object"}

    def __init__(
        self,
        *,
        api_key: str = "",
        model: str = "",
        base_url: str = "https://api.openai.com/v1",
        api_style: str = "responses",
        output_mode: str = "json_schema",
        timeout_seconds: float = 60.0,
        max_input_tokens: int = 128_000,
        max_output_tokens: int = 4000,
        token_field: str = "max_tokens",
        reasoning_effort: str = "",
        thinking_mode: str = "",
        allow_no_api_key: bool = False,
        caller: Callable[[dict[str, Any]], Any] | None = None,
    ) -> None:
        self.api_key = str(api_key or "").strip()
        self.model = str(model or "").strip()
        self.base_url = str(base_url or "").strip().rstrip("/")
        self.api_style = str(api_style or "responses").strip().lower()
        self.output_mode = str(output_mode or "json_schema").strip().lower()
        self.timeout_seconds = max(1.0, min(float(timeout_seconds), 300.0))
        self.max_input_tokens = max(1024, min(int(max_input_tokens), 2_000_000))
        self.max_output_tokens = max(256, min(int(max_output_tokens), 16_000))
        self.token_field = str(token_field or "max_tokens").strip()
        if self.token_field not in {"max_tokens", "max_completion_tokens"}:
            self.token_field = "max_tokens"
        self.reasoning_effort = str(reasoning_effort or "").strip().lower()
        normalized_thinking_mode = str(thinking_mode or "").strip().lower()
        self.thinking_mode = (
            normalized_thinking_mode
            if normalized_thinking_mode in {"enabled", "disabled"}
            else ""
        )
        self.allow_no_api_key = bool(allow_no_api_key)
        self.caller = caller

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> "AiModelClient":
        return cls(
            api_key=config.get("AI_API_KEY", ""),
            model=config.get("AI_MODEL", ""),
            base_url=config.get("AI_BASE_URL", "https://api.openai.com/v1"),
            api_style=config.get("AI_API_STYLE", "responses"),
            output_mode=config.get("AI_OUTPUT_MODE", "json_schema"),
            timeout_seconds=config.get("AI_TIMEOUT_SECONDS", 60),
            max_input_tokens=config.get("AI_MAX_INPUT_TOKENS", 128_000),
            max_output_tokens=config.get("AI_MAX_OUTPUT_TOKENS", 4000),
            token_field=config.get("AI_TOKEN_FIELD", "max_tokens"),
            reasoning_effort=config.get("AI_REASONING_EFFORT", ""),
            thinking_mode=config.get("AI_THINKING_MODE", ""),
            allow_no_api_key=config.get("AI_ALLOW_NO_API_KEY", False),
            caller=config.get("AI_MODEL_CALLER"),
        )

    @property
    def configured(self) -> bool:
        has_credentials = bool(self.api_key) or self.allow_no_api_key
        return bool(self.model and self.base_url and has_credentials)

    def status(self) -> dict[str, Any]:
        parsed = urlparse(self.base_url)
        valid_style = self.api_style in self.SUPPORTED_API_STYLES
        valid_output_mode = self.output_mode in self.SUPPORTED_OUTPUT_MODES
        valid_endpoint = parsed.scheme in {"http", "https"} and bool(parsed.netloc)
        configured = self.configured and valid_style and valid_output_mode and valid_endpoint
        missing = []
        if not self.model:
            missing.append("CDP_AI_MODEL")
        if not self.api_key and not self.allow_no_api_key:
            missing.append("CDP_AI_API_KEY")
        if not self.base_url or not valid_endpoint:
            missing.append("CDP_AI_BASE_URL")
        if not valid_style:
            missing.append("CDP_AI_API_STYLE")
        if not valid_output_mode:
            missing.append("CDP_AI_OUTPUT_MODE")
        return {
            "configured": configured,
            "model": self.model or None,
            "provider": parsed.hostname if valid_endpoint else None,
            "apiStyle": self.api_style,
            "outputMode": self.output_mode,
            "maxInputTokens": self.max_input_tokens,
            "maxOutputTokens": self.max_output_tokens,
            "reasoningEffort": self.reasoning_effort or None,
            "thinkingMode": self.thinking_mode or None,
            "missing": missing,
        }

    def interpret(self, system_prompt: str, user_context: dict[str, Any]) -> dict[str, Any]:
        status = self.status()
        if not status["configured"]:
            raise AiNotConfiguredError("AI模型尚未完成配置")

        endpoint, body = self._build_request(system_prompt, user_context)
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request_payload = {
            "url": endpoint,
            "headers": headers,
            "json": body,
            "timeout": self.timeout_seconds,
        }

        try:
            if self.caller is not None:
                provider_payload = self.caller(request_payload)
            else:
                provider_payload = None
                last_transport_error: Exception | None = None
                for attempt in range(3):
                    try:
                        response = httpx.post(
                            endpoint,
                            headers=headers,
                            json=body,
                            timeout=self.timeout_seconds,
                        )
                        if response.status_code >= 400:
                            if (
                                response.status_code in {429, 500, 502, 503, 504}
                                and attempt < 2
                            ):
                                time.sleep(0.4 if attempt == 0 else 1.0)
                                continue
                            raise AiProviderError(
                                f"AI服务请求失败（HTTP {response.status_code}）"
                            )
                        provider_payload = response.json()
                        break
                    except (httpx.HTTPError, ValueError, TypeError) as exc:
                        last_transport_error = exc
                        if attempt >= 2:
                            raise AiProviderError(
                                "AI服务暂时不可用，请稍后重试"
                            ) from exc
                        time.sleep(0.4 if attempt == 0 else 1.0)
                if provider_payload is None:
                    raise AiProviderError(
                        "AI服务暂时不可用，请稍后重试"
                    ) from last_transport_error
        except AiProviderError:
            raise
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise AiProviderError("AI服务暂时不可用，请稍后重试") from exc

        text = self._extract_output_text(provider_payload)
        try:
            result = json.loads(_clean_json_text(text))
        except (json.JSONDecodeError, TypeError) as exc:
            raise AiResponseError("AI返回的圈包意图不是有效JSON") from exc
        if not isinstance(result, dict):
            raise AiResponseError("AI返回的圈包意图格式不正确")
        assistant_message = result.get("assistantMessage", "")
        intent = result.get("intent")
        operation = result.get("operation")
        if not isinstance(assistant_message, str):
            raise AiResponseError("AI回复文字格式不正确")
        if intent is not None and not isinstance(intent, dict):
            raise AiResponseError("AI圈包意图格式不正确")
        if operation is not None and not isinstance(operation, dict):
            raise AiResponseError("AI系统操作格式不正确")
        return {
            "assistantMessage": assistant_message.strip(),
            "intent": intent,
            "operation": operation,
        }

    def _build_request(
        self,
        system_prompt: str,
        user_context: dict[str, Any],
    ) -> tuple[str, dict[str, Any]]:
        context_text = json.dumps(user_context, ensure_ascii=False, separators=(",", ":"))
        if self.api_style == "responses":
            body: dict[str, Any] = {
                "model": self.model,
                "instructions": system_prompt,
                "input": context_text,
                "store": False,
                "max_output_tokens": self.max_output_tokens,
            }
            if self.output_mode == "json_schema":
                body["text"] = {
                    "format": {
                        "type": "json_schema",
                        "name": "cdp_audience_interpretation",
                        "strict": False,
                        "schema": INTERPRETATION_RESPONSE_SCHEMA,
                    }
                }
            else:
                body["text"] = {"format": {"type": "json_object"}}
            return f"{self.base_url}/responses", body

        response_format: dict[str, Any]
        if self.output_mode == "json_schema":
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": "cdp_audience_interpretation",
                    "strict": False,
                    "schema": INTERPRETATION_RESPONSE_SCHEMA,
                },
            }
        else:
            response_format = {"type": "json_object"}
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": context_text},
            ],
            "response_format": response_format,
        }
        body[self.token_field] = self.max_output_tokens
        if self.thinking_mode:
            body["thinking"] = {"type": self.thinking_mode}
        if self.reasoning_effort:
            body["reasoning_effort"] = self.reasoning_effort
        return f"{self.base_url}/chat/completions", body

    def _extract_output_text(self, payload: Any) -> str:
        if not isinstance(payload, dict):
            raise AiResponseError("AI服务返回格式不正确")
        if self.api_style == "chat_completions":
            try:
                content = payload["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError) as exc:
                raise AiResponseError("AI服务没有返回可用内容") from exc
            if isinstance(content, list):
                content = "".join(
                    str(item.get("text", ""))
                    for item in content
                    if isinstance(item, dict)
                )
            return str(content or "")

        if isinstance(payload.get("output_text"), str):
            return payload["output_text"]
        chunks: list[str] = []
        for item in payload.get("output") or []:
            if not isinstance(item, dict):
                continue
            for content in item.get("content") or []:
                if not isinstance(content, dict):
                    continue
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    chunks.append(content["text"])
                if content.get("type") == "refusal":
                    raise AiResponseError("AI无法完成这次圈包意图解析")
        if not chunks:
            raise AiResponseError("AI服务没有返回可用内容")
        return "".join(chunks)
