"""AI-assisted names for finalized batch audience packages."""

from __future__ import annotations

import re
from typing import Any

from .ai_model_client import AiModelClient, AiResponseError


MAX_BATCH_NAME_ENTRIES = 100
MAX_BATCH_NAME_LENGTH = 80


class AiBatchNamingRequestError(ValueError):
    """Raised when the browser sends an invalid batch naming request."""


def _compact_text(value: Any, *, limit: int = 160) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _sanitize_name(value: Any, fallback: str) -> str:
    name = _compact_text(value, limit=MAX_BATCH_NAME_LENGTH * 2)
    name = re.sub(r"(?i)^XT[_\-—|｜\s]*", "", name).strip()
    name = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", name)
    name = re.sub(r"[\s_]+", "_", name).strip("_.-—｜|")
    if not name:
        name = _compact_text(fallback, limit=MAX_BATCH_NAME_LENGTH)
        name = re.sub(r"(?i)^XT[_\-—|｜\s]*", "", name).strip()
        name = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", name)
        name = re.sub(r"[\s_]+", "_", name).strip("_.-—｜|")
    return (name or "人群包")[:MAX_BATCH_NAME_LENGTH]


def _deduplicate_name(name: str, used: set[str]) -> str:
    fingerprint = name.casefold()
    if fingerprint not in used:
        used.add(fingerprint)
        return name
    counter = 2
    while True:
        suffix = f"_{counter:02d}"
        candidate = f"{name[: MAX_BATCH_NAME_LENGTH - len(suffix)]}{suffix}"
        fingerprint = candidate.casefold()
        if fingerprint not in used:
            used.add(fingerprint)
            return candidate
        counter += 1


def _fallback_name(entry: dict[str, Any], index: int) -> str:
    current = _compact_text(entry.get("currentName"), limit=MAX_BATCH_NAME_LENGTH)
    if current and current not in {"未命名", "未命名人群包", "人群包"}:
        return current
    parts = [
        _compact_text(entry.get("solutionName"), limit=32),
        *[
            _compact_text(value, limit=24)
            for value in entry.get("parameterValues", [])[:3]
        ],
    ]
    compact = "_".join(part for part in parts if part)
    return compact or f"人群包_{index + 1:02d}"


class AiBatchNamingService:
    SYSTEM_PROMPT = """
你是X-Data数据引擎的批量人群包命名助手。用户已经完成全部圈包参数与最终拆分，
你只负责为每一个最终任务生成简短、明确、可追溯的人群包名称，绝不修改圈包条件。

硬规则：
1. 禁止添加XT、XT_或任何无业务含义的统一前缀。
2. 只使用输入中真实存在的品牌、类目、商品、时间、行为、人群口径、渠道或账号，不得编造。
3. 推荐顺序是：品牌/商品/类目_时间_行为或人群口径_渠道/账号_拆分序号。
4. 删除重复信息；名称必须让人一眼看出每个包之间的差异。
5. 每个名称不超过80个字符，不使用文件名非法字符 <>:"/\\|?*。
6. 所有名称必须唯一；同条件拆分包用_01、_02等序号区分。
7. 中文为主，行业常用缩写如YTD、MTD、Dior可以保留。

返回JSON：assistantMessage为一句简短中文说明；intent必须包含suggestions数组，
每项严格为 {"id":"输入任务id","name":"建议名称"}。必须覆盖全部输入任务。
""".strip()

    def __init__(self, model_client: AiModelClient) -> None:
        self.model_client = model_client

    def suggest(self, payload: dict[str, Any]) -> dict[str, Any]:
        raw_entries = payload.get("entries")
        if not isinstance(raw_entries, list) or not raw_entries:
            raise AiBatchNamingRequestError("请至少提供一个待命名的人群包")
        if len(raw_entries) > MAX_BATCH_NAME_ENTRIES:
            raise AiBatchNamingRequestError("单次最多为100个人群包生成名称")

        entries: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for index, raw_entry in enumerate(raw_entries):
            if not isinstance(raw_entry, dict):
                raise AiBatchNamingRequestError("人群包命名参数格式不正确")
            entry_id = _compact_text(raw_entry.get("id"), limit=120)
            if not entry_id or entry_id in seen_ids:
                raise AiBatchNamingRequestError("每个人群包必须有唯一任务ID")
            seen_ids.add(entry_id)
            raw_nodes = raw_entry.get("nodes") if isinstance(raw_entry.get("nodes"), list) else []
            nodes = []
            for node in raw_nodes[:20]:
                if not isinstance(node, dict):
                    continue
                raw_parameters = node.get("parameters") if isinstance(node.get("parameters"), list) else []
                nodes.append(
                    {
                        "component": _compact_text(node.get("component"), limit=40),
                        "name": _compact_text(node.get("name"), limit=60),
                        "relation": _compact_text(node.get("relation"), limit=12),
                        "parameters": [
                            {
                                "label": _compact_text(item.get("label"), limit=32),
                                "value": _compact_text(item.get("value"), limit=120),
                            }
                            for item in raw_parameters[:16]
                            if isinstance(item, dict)
                        ],
                    }
                )
            entries.append(
                {
                    "id": entry_id,
                    "index": index + 1,
                    "currentName": _compact_text(raw_entry.get("currentName"), limit=MAX_BATCH_NAME_LENGTH),
                    "solutionName": _compact_text(raw_entry.get("solutionName"), limit=80),
                    "parameterField": _compact_text(raw_entry.get("parameterField"), limit=60),
                    "parameterValues": [
                        _compact_text(value, limit=80)
                        for value in (
                            raw_entry.get("parameterValues")
                            if isinstance(raw_entry.get("parameterValues"), list)
                            else []
                        )[:20]
                    ],
                    "nodes": nodes,
                }
            )

        model_result = self.model_client.interpret(
            self.SYSTEM_PROMPT,
            {
                "task": "为已完成全部参数和最终拆分的批量圈包任务生成名称",
                "entries": entries,
            },
        )
        intent = model_result.get("intent")
        raw_suggestions = intent.get("suggestions") if isinstance(intent, dict) else None
        if not isinstance(raw_suggestions, list):
            raise AiResponseError("AI没有返回可用的批量名称建议")

        suggested_by_id: dict[str, str] = {}
        for item in raw_suggestions:
            if not isinstance(item, dict):
                continue
            item_id = _compact_text(item.get("id"), limit=120)
            if item_id in seen_ids and item_id not in suggested_by_id:
                suggested_by_id[item_id] = _compact_text(
                    item.get("name"), limit=MAX_BATCH_NAME_LENGTH * 2
                )

        used_names: set[str] = set()
        suggestions = []
        for index, entry in enumerate(entries):
            fallback = _fallback_name(entry, index)
            name = _sanitize_name(suggested_by_id.get(entry["id"]), fallback)
            name = _deduplicate_name(name, used_names)
            suggestions.append({"id": entry["id"], "name": name})

        return {
            "assistantMessage": model_result.get("assistantMessage")
            or f"已为{len(suggestions)}个人群包生成名称，可在执行前逐个修改。",
            "suggestions": suggestions,
            "source": "ai",
        }
