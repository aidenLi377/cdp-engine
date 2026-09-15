"""System capability and tutorial knowledge for AI execution planning."""

from __future__ import annotations

import copy
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .announcement_store import AnnouncementStore
from .constants import BASE_DIR


DEFAULT_CAPABILITY_CATALOG = Path(BASE_DIR) / "ai_system_capability_catalog.json"


class AiSystemKnowledge:
    """Expose system workflows as executable knowledge, not help-page prose."""

    MAX_PUBLISHED_TUTORIALS = 100
    MAX_ARTICLE_TEXT_CHARS = 12_000

    def __init__(
        self,
        announcement_store: AnnouncementStore,
        catalog_path: str | Path | None = None,
    ) -> None:
        self.announcement_store = announcement_store
        self.catalog_path = Path(catalog_path or DEFAULT_CAPABILITY_CATALOG)

    def _load_catalog(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError("AI系统能力目录无法读取，请重新生成教程知识") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("capabilities"), list):
            raise RuntimeError("AI系统能力目录格式不正确")
        return payload

    @staticmethod
    def _block_text(block: object) -> str:
        if not isinstance(block, dict):
            return ""
        parts: list[str] = []
        for key in ("text", "title", "body", "alt", "caption"):
            value = block.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())
        items = block.get("items")
        if isinstance(items, list):
            parts.extend(str(item).strip() for item in items if str(item).strip())
        return "\n".join(parts)

    def list_published_tutorials(self) -> list[dict[str, Any]]:
        tutorials = self.announcement_store.list_published_content(
            "tutorial", self.MAX_PUBLISHED_TUTORIALS
        )
        result = []
        for tutorial in tutorials:
            content = "\n".join(
                text
                for text in (
                    self._block_text(block) for block in tutorial.get("content") or []
                )
                if text
            )[: self.MAX_ARTICLE_TEXT_CHARS]
            result.append(
                {
                    "id": tutorial.get("id"),
                    "title": tutorial.get("title"),
                    "summary": tutorial.get("summary"),
                    "highlights": tutorial.get("highlights") or [],
                    "content": content,
                    "updatedAt": tutorial.get("updatedAt"),
                    "publishedAt": tutorial.get("publishedAt"),
                }
            )
        return result

    @staticmethod
    def _capability_index_item(capability: dict[str, Any]) -> dict[str, Any]:
        execution = capability.get("execution") or {}
        return {
            "id": capability.get("id"),
            "title": capability.get("title"),
            "capability": capability.get("capability"),
            "businessProblem": capability.get("businessProblem"),
            "result": capability.get("result"),
            "entryMode": execution.get("entryMode"),
            "action": execution.get("action"),
            "applicationMode": execution.get("applicationMode"),
        }

    @staticmethod
    def _relevance_score(query: str, tutorial: dict[str, Any]) -> int:
        compact = re.sub(r"\s+", "", str(query or "").casefold())
        if len(compact) < 2:
            return 0
        grams = {compact[index : index + 2] for index in range(len(compact) - 1)}
        haystack = " ".join(
            [
                str(tutorial.get("title") or ""),
                str(tutorial.get("summary") or ""),
                " ".join(str(item) for item in tutorial.get("highlights") or []),
                str(tutorial.get("content") or ""),
            ]
        ).casefold()
        return sum(1 for gram in grams if gram in haystack)

    def get_prompt_catalog(
        self,
        message: str = "",
        current_workflow: object = None,
    ) -> dict[str, Any]:
        catalog = self._load_catalog()
        capabilities = [
            item for item in catalog.get("capabilities") or [] if isinstance(item, dict)
        ]
        selected_workflow = self.normalize_workflow(current_workflow)
        if selected_workflow is None:
            selected_workflow = self.recommend_workflow(message)
        selected_capability = next(
            (item for item in capabilities if item.get("id") == selected_workflow["id"]),
            None,
        )
        tutorials = self.list_published_tutorials()
        ranked_tutorials = sorted(
            (
                (self._relevance_score(message, tutorial), tutorial)
                for tutorial in tutorials
            ),
            key=lambda item: item[0],
            reverse=True,
        )
        return {
            "schemaVersion": catalog.get("schemaVersion", 1),
            "source": catalog.get("source"),
            "routingRules": catalog.get("routingRules") or [],
            "globalExecutionPolicies": catalog.get("globalExecutionPolicies") or [],
            "systemFeatureIndex": copy.deepcopy(catalog.get("systemFeatures") or []),
            "capabilityIndex": [
                self._capability_index_item(item) for item in capabilities
            ],
            "selectedCapability": copy.deepcopy(selected_capability),
            "publishedTutorialIndex": [
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "summary": item.get("summary"),
                    "highlights": item.get("highlights") or [],
                }
                for item in tutorials
            ],
            "relevantPublishedTutorials": [
                tutorial for score, tutorial in ranked_tutorials[:3] if score > 0
            ],
        }

    def status(self) -> dict[str, Any]:
        catalog = self._load_catalog()
        capabilities = catalog.get("capabilities") or []
        tutorials = self.list_published_tutorials()
        guided_steps = sum(
            len(item.get("steps") or [])
            for item in capabilities
            if isinstance(item, dict)
        )
        timestamps = [
            str(item.get("updatedAt") or item.get("publishedAt") or "")
            for item in tutorials
        ]
        try:
            timestamps.append(
                datetime.fromtimestamp(
                    self.catalog_path.stat().st_mtime, timezone.utc
                ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            )
        except OSError:
            pass
        return {
            "systemCapabilityCount": len(capabilities),
            "systemFeatureCount": len(catalog.get("systemFeatures") or []),
            "guidedStepKnowledgeCount": guided_steps,
            "publishedTutorialKnowledgeCount": len(tutorials),
            "systemKnowledgeUpdatedAt": max(timestamps, default="") or None,
        }

    def normalize_workflow(self, value: object, *, reason: str = "") -> dict[str, Any] | None:
        if isinstance(value, dict):
            capability_id = str(value.get("id") or "").strip()
            reason = str(value.get("reason") or reason).strip()
        else:
            capability_id = str(value or "").strip()
        if not capability_id:
            return None
        capability = next(
            (
                item
                for item in self._load_catalog().get("capabilities") or []
                if isinstance(item, dict) and item.get("id") == capability_id
            ),
            None,
        )
        if capability is None:
            return None
        execution = capability.get("execution") or {}
        return {
            "id": capability["id"],
            "title": capability.get("title") or capability["id"],
            "shortTitle": capability.get("shortTitle") or capability.get("title"),
            "capability": capability.get("capability") or "",
            "businessProblem": capability.get("businessProblem") or "",
            "result": capability.get("result") or "",
            "entryMode": execution.get("entryMode") or "workbench",
            "action": execution.get("action") or "",
            "applicationMode": execution.get("applicationMode") or "staged",
            "requiredInputs": copy.deepcopy(execution.get("requiredInputs") or []),
            "prerequisites": copy.deepcopy(execution.get("prerequisites") or []),
            "invariants": copy.deepcopy(execution.get("invariants") or []),
            "reason": reason or "根据本轮业务目标选择了最匹配的系统执行路径。",
        }

    @staticmethod
    def _product_id_count(intent: object, message: str) -> int:
        values = set(re.findall(r"(?<!\d)\d{5,}(?!\d)", message))
        if isinstance(intent, dict):
            for condition in intent.get("conditions") or []:
                if not isinstance(condition, dict):
                    continue
                for value in condition.get("productIds") or []:
                    text = str(value).strip()
                    if text:
                        values.add(text)
        return len(values)

    def recommend_workflow(
        self,
        message: str,
        intent: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        text = str(message or "").strip()
        compact = re.sub(r"\s+", "", text)
        capability_id = "direct-workbench-audience-build"
        reason = "这是单个人群需求，使用自由搭建即可直接生成并应用工作台节点。"

        if re.search(r"达摩盘|画像|横向对比|人群结构|人群占比|rebase", compact, re.I):
            capability_id = "dmp-batch-profile-comparison"
            reason = "需求目标是批量取得或比较人群画像，应进入达摩盘批量取画像与横向对比。"
        elif (
            re.search(r"多个竞品|多组竞品|一列竞品|三行竞品|竞品名单", compact)
            and re.search(r"拉力|方案组|共同浏览|三类人群|三个人群", compact)
        ):
            capability_id = "combination-competitor-batch"
            reason = "需求要把多个竞品分别展开成整套拉力人群，应使用组合参数批量而不是把竞品合并进一个人群。"
        elif (
            re.search(r"分别|每个|一行一个|批量|多个", compact)
            and re.search(r"竞品|竞争品牌|品牌名单", compact)
        ):
            capability_id = "competitor-brand-parameter-batch"
            reason = "多个品牌需要分别形成独立人群包，最适合使用单方案参数批量。"
        elif re.search(r"拉力|方案组", compact) or (
            "共同浏览" in compact and re.search(r"购买本品|购买竞品|三类|三个人群", compact)
        ):
            capability_id = "pull-analysis-solution-group"
            reason = "需求包含共同浏览、购买本品和购买竞品的关联分析，应使用拉力方案组统一参数并批量圈人。"
        elif re.search(r"共同浏览|复用方案|反复替换|一对多字段", compact):
            capability_id = "competitor-overlap-solution-reuse"
            reason = "需求结构需要反复替换类目或竞品，适合制作或复用带自定义字段的正式方案。"
        elif self._product_id_count(intent, text) > 1:
            capability_id = "category-item-behavior-split"
            reason = "多个商品ID属于同一个人群，应使用类目商品行为自动拆成并集节点，并统一复用行为和时间。"

        workflow = self.normalize_workflow(capability_id, reason=reason)
        if workflow is None:
            raise RuntimeError("AI系统能力目录缺少自由搭建能力")
        return workflow
