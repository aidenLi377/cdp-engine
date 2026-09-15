"""Business-aware component catalog used by AI assistants and future MCP tools.

The version-controlled JSON file owns business semantics. ``ConfigEngine`` remains
the source of truth for live fields, options, and visibility matrices.
"""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

from .csv_utils import project_path
from .engine import ConfigEngine


DEFAULT_CATALOG_PATH = Path(project_path("ai_component_catalog.json"))


class CatalogValidationError(ValueError):
    """Raised when the checked-in business catalog is malformed."""


class CatalogLookupError(KeyError):
    """Raised when a requested component or field does not exist."""


def _normalize_lookup_text(value: object) -> str:
    text = str(value or "").casefold().strip()
    return re.sub(r"[\s\-_/·|#（）()【】\[\]，,。.]+", "", text)


def _normalize_brand(value: object) -> str:
    text = _normalize_lookup_text(value)
    for suffix in (
        "官方旗舰店",
        "旗舰店",
        "专卖店",
        "专营店",
        "店铺",
        "账号",
        "品牌",
        "自店",
        "本店",
    ):
        text = text.replace(suffix, "")
    return text


def _brand_latin_tokens(value: object) -> set[str]:
    return set(re.findall(r"[a-z0-9]{2,}", str(value or "").casefold()))


def _option_parts(option: object) -> tuple[str, str]:
    if isinstance(option, dict):
        value = str(option.get("value", option.get("label", "")))
        label = str(option.get("label", value))
        return value, label
    value = str(option)
    return value, value


class AiComponentCatalog:
    """Merge stable business guidance with the current runtime configuration."""

    INLINE_OPTION_LIMIT = 20
    MAX_SEARCH_LIMIT = 50

    def __init__(
        self,
        engine: ConfigEngine,
        catalog_path: str | Path | None = None,
    ) -> None:
        self.engine = engine
        self.catalog_path = Path(catalog_path or DEFAULT_CATALOG_PATH)
        self._business_catalog = self._load_business_catalog()

    def _load_business_catalog(self) -> dict[str, Any]:
        try:
            with self.catalog_path.open("r", encoding="utf-8") as stream:
                payload = json.load(stream)
        except (OSError, json.JSONDecodeError) as exc:
            raise CatalogValidationError(f"AI组件能力目录加载失败: {exc}") from exc

        if not isinstance(payload, dict):
            raise CatalogValidationError("AI组件能力目录必须是JSON对象")
        if not isinstance(payload.get("schemaVersion"), int):
            raise CatalogValidationError("AI组件能力目录缺少整数schemaVersion")
        if not isinstance(payload.get("components"), dict):
            raise CatalogValidationError("AI组件能力目录缺少components对象")
        return payload

    @property
    def schema_version(self) -> int:
        return int(self._business_catalog["schemaVersion"])

    def _runtime_fields(self, component_name: str) -> tuple[list[dict], dict]:
        meta = self.engine.get_package_meta(component_name)
        if not meta or not isinstance(meta.get("schema"), list):
            raise CatalogLookupError(component_name)

        fields = []
        for field in meta["schema"]:
            options = field.get("options") if isinstance(field.get("options"), list) else []
            summary = {
                "key": str(field.get("key", "")),
                "label": str(field.get("Label") or field.get("label") or field.get("key", "")),
                "widgetType": str(field.get("Widget_Type", "")),
                "dataSource": str(field.get("Data_Source", "")),
                "defaultVisible": field.get("isDefault") is True,
                "description": str(field.get("Description", "")),
                "jsonPath": str(field.get("JSON_Path", "")),
                "optionCount": len(options),
                "optionSearchRequired": len(options) > self.INLINE_OPTION_LIMIT,
            }
            if len(options) <= self.INLINE_OPTION_LIMIT:
                summary["options"] = copy.deepcopy(options)
            fields.append(summary)

        matrix = meta.get("matrix") if isinstance(meta.get("matrix"), dict) else {}
        return fields, copy.deepcopy(matrix)

    def get_component(self, component_name: str) -> dict[str, Any]:
        policies = self._business_catalog["components"]
        if component_name not in policies or component_name not in self.engine.packages:
            raise CatalogLookupError(component_name)
        fields, matrix = self._runtime_fields(component_name)
        return {
            "name": component_name,
            "business": copy.deepcopy(policies[component_name]),
            "runtime": {
                "fields": fields,
                "visibilityMatrix": matrix,
            },
        }

    def get_catalog(self) -> dict[str, Any]:
        configured_names = list(self.engine.packages)
        policy_names = set(self._business_catalog["components"])
        components = [
            self.get_component(name)
            for name in configured_names
            if name in policy_names
        ]
        return {
            "schemaVersion": self.schema_version,
            "description": self._business_catalog.get("description", ""),
            "operatorSemantics": copy.deepcopy(
                self._business_catalog.get("operatorSemantics", {})
            ),
            "globalPolicies": copy.deepcopy(
                self._business_catalog.get("globalPolicies", {})
            ),
            "components": components,
            "coverage": {
                "configuredComponentCount": len(configured_names),
                "documentedComponentCount": len(components),
                "missingBusinessPolicies": [
                    name for name in configured_names if name not in policy_names
                ],
                "staleBusinessPolicies": [
                    name for name in policy_names if name not in self.engine.packages
                ],
            },
        }

    def search_options(
        self,
        component_name: str,
        field_key: str,
        query: str,
        limit: int = 20,
    ) -> dict[str, Any]:
        if component_name not in self.engine.packages:
            raise CatalogLookupError(component_name)
        meta = self.engine.get_package_meta(component_name)
        field = next(
            (
                item
                for item in meta.get("schema", [])
                if str(item.get("key", "")) == str(field_key)
            ),
            None,
        )
        if field is None:
            raise CatalogLookupError(f"{component_name}.{field_key}")

        limit = max(1, min(int(limit), self.MAX_SEARCH_LIMIT))
        normalized_query = _normalize_lookup_text(query)
        ranked = []
        for index, option in enumerate(field.get("options") or []):
            value, label = _option_parts(option)
            normalized_label = _normalize_lookup_text(label)
            normalized_value = _normalize_lookup_text(value)
            leaf_label = _normalize_lookup_text(label.split(">")[-1])
            formal_brand_aliases = {
                _normalize_lookup_text(part)
                for part in re.split(r"[/／]", label)
                if str(part).strip()
            } if field_key == "stdBrand" and re.search(r"[/／]", label) else set()

            if not normalized_query:
                score = 10
            elif normalized_query in formal_brand_aliases:
                # Slash-separated bilingual names are the canonical standard-brand
                # entries. Rank an exact alias such as “迪奥” -> “Dior/迪奥” first.
                score = -1
            elif normalized_query in {normalized_label, normalized_value}:
                score = 0
            elif normalized_query == leaf_label:
                score = 1
            elif leaf_label.startswith(normalized_query):
                score = 2
            elif normalized_query in leaf_label:
                score = 3
            elif normalized_label.startswith(normalized_query):
                score = 4
            elif normalized_query in normalized_label or normalized_query in normalized_value:
                score = 5
            else:
                continue
            ranked.append((score, index, value, label))

        ranked.sort(key=lambda item: (item[0], item[1]))
        matches = [
            {"value": value, "label": label}
            for _, _, value, label in ranked[:limit]
        ]
        return {
            "component": component_name,
            "field": str(field_key),
            "query": str(query or ""),
            "matches": matches,
            "totalOptions": len(field.get("options") or []),
            "truncated": len(ranked) > limit,
        }

    def resolve_brand_account(
        self,
        brand: str,
        can_use_account: bool | None = None,
    ) -> dict[str, Any]:
        brand = str(brand or "").strip()
        if not brand:
            return {
                "status": "needs_brand",
                "question": "请问需要分析哪个品牌或店铺账号？",
            }

        meta = self.engine.get_package_meta(ConfigEngine.COMMODITY_PACKAGE)
        shop_field = next(
            (field for field in meta.get("schema", []) if field.get("key") == "shop"),
            {},
        )
        accounts = []
        for option in shop_field.get("options") or []:
            value, label = _option_parts(option)
            if label == "全淘宝天猫":
                continue
            accounts.append({"value": value, "label": label})

        normalized_brand = _normalize_brand(brand)
        brand_latin_tokens = _brand_latin_tokens(brand)
        matches = []
        for index, account in enumerate(accounts):
            normalized_account = _normalize_brand(account["label"])
            if not normalized_brand:
                continue
            if normalized_brand == normalized_account:
                score = 0
            elif normalized_brand in normalized_account:
                score = 1
            elif normalized_account in normalized_brand:
                score = 2
            elif brand_latin_tokens & _brand_latin_tokens(account["label"]):
                score = 3
            else:
                continue
            matches.append((score, index, account))
        matches.sort(key=lambda item: (item[0], item[1]))
        candidates = [copy.deepcopy(item[2]) for item in matches]

        if len(candidates) == 1:
            account = candidates[0]
            if can_use_account is True:
                return {
                    "status": "resolved",
                    "brand": brand,
                    "account": account,
                    "currentUserAccess": "confirmed",
                }
            if can_use_account is False:
                return {
                    "status": "access_denied",
                    "brand": brand,
                    "account": account,
                    "currentUserAccess": "denied",
                    "message": "当前用户不能使用该品牌账号登录数据引擎。",
                    "fallbackComponent": ConfigEngine.CATEGORY_PUBLIC_PACKAGE,
                }
            return {
                "status": "needs_access_confirmation",
                "brand": brand,
                "account": account,
                "currentUserAccess": "unknown",
                "question": f"你能使用{account['label']}登录数据引擎并圈包吗？",
                "answerField": "canUseBrandAccount",
            }
        if len(candidates) > 1:
            return {
                "status": "ambiguous",
                "brand": brand,
                "question": "找到多个可能的店铺账号，请选择需要分析的账号。",
                "accounts": candidates,
            }

        feedback_message = f"申请新增商品行为账号：{brand}"
        return {
            "status": "not_configured",
            "brand": brand,
            "message": "暂未找到该品牌对应的商品行为账号，无法准确执行自店分析。",
            "fallbackComponent": ConfigEngine.CATEGORY_PUBLIC_PACKAGE,
            "nextAction": {
                "type": "open_feedback",
                "label": "点击反馈",
                "category": self._business_catalog["globalPolicies"]["accountPolicy"][
                    "feedbackCategory"
                ],
                "prefillMessage": feedback_message,
            },
        }

    def recommend_component(self, intent: dict[str, Any]) -> dict[str, Any]:
        """Recommend one component for one atomic audience condition."""

        if not isinstance(intent, dict):
            raise CatalogValidationError("圈选意图必须是JSON对象")

        component_hint = str(intent.get("attributeComponent") or "").strip()
        business_components = self._business_catalog["components"]
        if component_hint:
            policy = business_components.get(component_hint)
            if not policy or policy.get("group") != "attribute":
                raise CatalogLookupError(component_hint)
            return self._ready_recommendation(
                component_hint,
                "用户明确指定了属性组件。",
            )

        if intent.get("mentionsAipl") or intent.get("aiplStatuses"):
            return self._ready_recommendation(
                "AIPL状态",
                "用户明确表达了AIPL或认知、兴趣、购买、忠诚阶段。",
            )

        if intent.get("searchIntent"):
            return self._ready_recommendation(
                "关键词搜索",
                "用户明确描述了搜索行为，而不是商品标题条件。",
            )

        product_ids = intent.get("productIds")
        has_product_ids = bool(product_ids) or intent.get("hasProductIds") is True
        mentions_own_store = (
            intent.get("mentionsOwnStore") is True
            or str(intent.get("scope") or "") == "own_store"
        )
        mentions_own_brand = intent.get("mentionsOwnBrand") is True
        needs_commodity = mentions_own_store or (mentions_own_brand and has_product_ids)

        if needs_commodity:
            brand = str(intent.get("brand") or "").strip()
            can_use_account = intent.get("canUseBrandAccount")
            if can_use_account is not None and not isinstance(can_use_account, bool):
                raise CatalogValidationError("canUseBrandAccount必须是布尔值或null")
            account_resolution = self.resolve_brand_account(brand, can_use_account)
            if account_resolution["status"] == "needs_brand":
                return {
                    "status": "needs_clarification",
                    "component": ConfigEngine.COMMODITY_PACKAGE,
                    "reason": "自店或本品牌商品ID分析需要先确定品牌账号。",
                    "questions": [account_resolution["question"]],
                }
            if account_resolution["status"] == "not_configured":
                result = self._public_fallback_recommendation(
                    "未配置对应的商品行为账号，已回退类目公域行为。",
                    has_product_ids,
                )
                result["accountResolution"] = account_resolution
                result["nextAction"] = account_resolution["nextAction"]
                return result
            if account_resolution["status"] == "access_denied":
                result = self._public_fallback_recommendation(
                    "当前用户不能使用该品牌账号登录数据引擎，已回退类目公域行为。",
                    has_product_ids,
                )
                result["accountResolution"] = account_resolution
                return result
            if account_resolution["status"] == "needs_access_confirmation":
                return {
                    "status": "needs_clarification",
                    "component": ConfigEngine.COMMODITY_PACKAGE,
                    "reason": "商品行为只能使用当前用户有权登录的数据引擎品牌账号。",
                    "questions": [account_resolution["question"]],
                    "accountResolution": account_resolution,
                }
            if account_resolution["status"] == "ambiguous":
                return {
                    "status": "needs_clarification",
                    "component": ConfigEngine.COMMODITY_PACKAGE,
                    "reason": "品牌匹配到多个商品行为账号。",
                    "questions": [account_resolution["question"]],
                    "accountResolution": account_resolution,
                }
            result = self._ready_recommendation(
                ConfigEngine.COMMODITY_PACKAGE,
                "自店场景或本品牌指定商品ID场景优先使用商品行为。",
            )
            result["accountResolution"] = account_resolution
            if has_product_ids:
                result["defaults"] = {"selectedGoodsType": "指定商品ID"}
            return result

        if has_product_ids:
            return self._ready_recommendation(
                ConfigEngine.CATEGORY_ITEM_PACKAGE,
                "存在明确商品ID但没有自店账号要求，使用公域指定商品行为。",
            )

        result = self._ready_recommendation(
            ConfigEngine.CATEGORY_PUBLIC_PACKAGE,
            "没有自店账号或指定商品ID要求，默认使用类目公域行为。",
        )
        if mentions_own_brand:
            result["reason"] = "用户只表达本品牌且没有自店或商品ID要求，按标准品牌使用类目公域行为。"
        if intent.get("needsFineGrainedCount") is True:
            result["warnings"] = [
                "类目公域行为最终人数小于2000时平台不展示具体人数；如需查看几百人级别结果，请确认是否改用自店账号的商品行为。"
            ]
        return result

    def _public_fallback_recommendation(
        self,
        reason: str,
        has_product_ids: bool,
    ) -> dict[str, Any]:
        if has_product_ids:
            result = self._ready_recommendation(
                ConfigEngine.CATEGORY_ITEM_PACKAGE,
                f"{reason.rstrip('。')}；已提供商品ID，改用类目商品行为直接筛选。",
            )
            result["fallbackFrom"] = ConfigEngine.COMMODITY_PACKAGE
            result["preservesProductIds"] = True
            return result

        result = self._ready_recommendation(
            ConfigEngine.CATEGORY_PUBLIC_PACKAGE,
            reason,
        )
        result["fallbackFrom"] = ConfigEngine.COMMODITY_PACKAGE
        result["warnings"] = [
            "类目公域行为最终人数小于2000时平台不展示具体人数，但不代表人数为0。"
        ]
        return result

    def _ready_recommendation(self, component_name: str, reason: str) -> dict[str, Any]:
        policy = self._business_catalog["components"][component_name]
        return {
            "status": "ready",
            "component": component_name,
            "reason": reason,
            "countVisibility": copy.deepcopy(policy.get("countVisibility", {})),
        }
