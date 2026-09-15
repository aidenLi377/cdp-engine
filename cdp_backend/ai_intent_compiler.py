"""Compile model-extracted audience intent into persisted workbench nodes.

The compiler is deliberately deterministic: an LLM may extract intent, but it
cannot invent live options, bypass account access, or directly author DMP JSON.
"""

from __future__ import annotations

import copy
import json
from datetime import date
from pathlib import Path
from typing import Any

from .ai_component_catalog import AiComponentCatalog, CatalogValidationError
from .business_date import latest_selectable_date
from .csv_utils import project_path
from .engine import ConfigEngine


DEFAULT_INTENT_SCHEMA_PATH = Path(project_path("ai_intent_schema.json"))
RELATION_OPERATORS = {
    "intersect": "n",
    "union": "u",
    "exclude": "d",
    "n": "n",
    "u": "u",
    "d": "d",
}
ATTRIBUTE_COMPONENTS = {
    "预测购买力",
    "预测年龄",
    "预测城市等级",
    "大快消策略人群",
    "快消策略人群3.0",
    "预测性别",
    "月均消费金额",
}
MULTI_VALUE_WIDGETS = {"搜索多选", "复选组", "下拉多选"}
DEFAULT_CATEGORY_RECENT_DAYS = {
    "购买": 366,
    "预售": 180,
    "浏览": 30,
    "收藏": 90,
    "加购": 90,
    "评论": 366,
}
TOP_LEVEL_KEYS = {"schemaVersion", "solutionId", "audienceName", "conditions"}
CONDITION_KEYS = {
    "id",
    "displayName",
    "relation",
    "component",
    "scope",
    "brand",
    "canUseBrandAccount",
    "needsFineGrainedCount",
    "behaviors",
    "behaviorMatch",
    "categories",
    "brands",
    "channels",
    "titleKeywords",
    "searchKeywords",
    "productIds",
    "purchaseCount",
    "purchaseAmount",
    "itemPrice",
    "browseDays",
    "recentDays",
    "dateRange",
    "aiplStatuses",
    "attributes",
}
OPTION_FIELD_TO_INTENT_FIELD = {
    "bhv": "behaviors",
    "leafCates": "categories",
    "cate": "categories",
    "stdBrand": "brands",
    "channel": "channels",
    "types": "aiplStatuses",
}


class IntentValidationError(ValueError):
    """Raised when the intermediate intent contract itself is malformed."""


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _clean_list(value: object, field_name: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise IntentValidationError(f"{field_name}必须是数组")
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, (str, int)) or isinstance(item, bool):
            raise IntentValidationError(f"{field_name}只能包含文字或数字")
        text = str(item).strip()
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def _option_parts(option: object) -> tuple[str, str]:
    if isinstance(option, dict):
        value = _clean_text(option.get("value", option.get("label", "")))
        return value, _clean_text(option.get("label", value))
    value = _clean_text(option)
    return value, value


def _normalized_option(value: object) -> str:
    return "".join(_clean_text(value).casefold().split())


class AiIntentCompiler:
    """Convert the versioned AI intent contract into workbench and DMP output."""

    MAX_CONDITIONS = 50

    def __init__(
        self,
        engine: ConfigEngine,
        catalog: AiComponentCatalog,
        schema_path: str | Path | None = None,
    ) -> None:
        self.engine = engine
        self.catalog = catalog
        self.schema_path = Path(schema_path or DEFAULT_INTENT_SCHEMA_PATH)
        self._intent_schema = self._load_schema()

    def _load_schema(self) -> dict[str, Any]:
        try:
            with self.schema_path.open("r", encoding="utf-8") as stream:
                payload = json.load(stream)
        except (OSError, json.JSONDecodeError) as exc:
            raise IntentValidationError(f"AI圈包意图规范加载失败: {exc}") from exc
        if not isinstance(payload, dict):
            raise IntentValidationError("AI圈包意图规范必须是JSON对象")
        return payload

    def get_schema(self) -> dict[str, Any]:
        return copy.deepcopy(self._intent_schema)

    def compile(self, intent: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(intent, dict):
            raise IntentValidationError("圈包意图必须是JSON对象")
        unknown_top_level = set(intent) - TOP_LEVEL_KEYS
        if unknown_top_level:
            raise IntentValidationError(
                f"圈包意图包含未知字段：{', '.join(sorted(unknown_top_level))}"
            )
        schema_version = intent.get("schemaVersion", 1)
        if schema_version != 1:
            raise IntentValidationError("当前只支持schemaVersion 1")
        conditions = intent.get("conditions")
        if not isinstance(conditions, list) or not conditions:
            raise IntentValidationError("至少需要一个圈选条件")
        if len(conditions) > self.MAX_CONDITIONS:
            raise IntentValidationError(f"圈选条件不能超过{self.MAX_CONDITIONS}个")
        self._validate_labeled_comparison_periods(conditions)

        audience_name = _clean_text(intent.get("audienceName")) or "未命名人群"
        if len(audience_name) > 100:
            raise IntentValidationError("人群名称不能超过100个字符")

        nodes: list[dict[str, Any]] = []
        generated_items: list[dict[str, Any]] = []
        questions: list[dict[str, Any]] = []
        warnings: list[str] = []
        decisions: list[dict[str, Any]] = []
        next_actions: list[dict[str, Any]] = []

        for index, raw_condition in enumerate(conditions):
            if not isinstance(raw_condition, dict):
                raise IntentValidationError(f"第{index + 1}个圈选条件必须是JSON对象")
            condition = copy.deepcopy(raw_condition)
            self._validate_condition_contract(condition, index)
            condition_id = _clean_text(condition.get("id")) or f"condition_{index + 1}"
            relation = self._resolve_relation(condition.get("relation"), index)

            selection = self._select_component(condition)
            decisions.append(
                {
                    "conditionId": condition_id,
                    "component": selection.get("component"),
                    "reason": selection.get("reason", ""),
                    "fallbackFrom": selection.get("fallbackFrom"),
                    "strategy": selection.get("strategy"),
                    "componentPlan": selection.get("componentPlan"),
                }
            )
            warnings.extend(selection.get("warnings") or [])
            if selection.get("nextAction"):
                next_actions.append(selection["nextAction"])

            if selection["status"] == "needs_clarification":
                for question_index, prompt in enumerate(selection.get("questions") or []):
                    account_resolution = selection.get("accountResolution") or {}
                    questions.append(
                        self._question(
                            condition_id,
                            account_resolution.get("answerField") or "component",
                            prompt,
                            selection.get("reason", "需要补充信息后才能选择组件。"),
                            question_index,
                            answer_type="boolean"
                            if account_resolution.get("answerField") == "canUseBrandAccount"
                            else "text",
                        )
                    )
                continue

            component = selection["component"]
            if component == ConfigEngine.CATEGORY_PUBLIC_PACKAGE:
                fallback_brand = _clean_text(condition.get("brand"))
                if fallback_brand and not condition.get("brands"):
                    condition["brands"] = [fallback_brand]
            if component == ConfigEngine.COMMODITY_PACKAGE:
                account = (selection.get("accountResolution") or {}).get("account") or {}
                condition["_resolvedShop"] = account.get("value") or account.get("label")

            compiled = self._compile_condition(
                component,
                condition,
                condition_id,
                relation,
                len(nodes),
            )
            questions.extend(compiled["questions"])
            warnings.extend(compiled["warnings"])
            if compiled["questions"]:
                continue
            nodes.extend(compiled["nodes"])
            generated_items.extend(compiled["generatedItems"])

        period_question = self._labeled_comparison_period_question(conditions)
        if period_question is not None:
            questions.append(period_question)

        warnings = list(dict.fromkeys(warnings))
        unique_questions: list[dict[str, Any]] = []
        seen_questions: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        for question in questions:
            key = (
                _clean_text(question.get("field")),
                _clean_text(question.get("prompt")),
                _clean_text(question.get("answerType")),
                json.dumps(question.get("options") or [], ensure_ascii=False, sort_keys=True),
            )
            target = {
                "conditionId": question.get("conditionId"),
                "field": question.get("field"),
                "intentField": OPTION_FIELD_TO_INTENT_FIELD.get(
                    _clean_text(question.get("field")),
                    question.get("field"),
                ),
            }
            existing = seen_questions.get(key)
            if existing is not None:
                if target not in existing["applyTargets"]:
                    existing["applyTargets"].append(target)
                continue
            question["applyTargets"] = [target]
            seen_questions[key] = question
            unique_questions.append(question)
        questions = unique_questions
        next_actions = [
            action
            for index, action in enumerate(next_actions)
            if action not in next_actions[:index]
        ]

        if questions:
            return {
                "schemaVersion": 1,
                "status": "needs_clarification",
                "audienceName": audience_name,
                "nodes": [],
                "generated": None,
                "questions": questions,
                "warnings": warnings,
                "decisions": decisions,
                "nextActions": next_actions,
            }

        for index, item in enumerate(generated_items):
            item["fromPoolId"] = index
            if index > 0:
                item["op"] = "INIT"
        compute = "(0)"
        for index, node in enumerate(nodes[1:], start=1):
            compute += f"{node['operator']}({index})"

        return {
            "schemaVersion": 1,
            "status": "ready",
            "audienceName": audience_name,
            "nodes": nodes,
            "generated": {
                "crowdName": audience_name,
                "list": generated_items,
                "compute": compute,
            },
            "questions": [],
            "warnings": warnings,
            "decisions": decisions,
            "nextActions": next_actions,
        }

    def _validate_condition_contract(
        self,
        condition: dict[str, Any],
        index: int,
    ) -> None:
        unknown = set(condition) - CONDITION_KEYS
        if unknown:
            raise IntentValidationError(
                f"第{index + 1}个条件包含未知字段：{', '.join(sorted(unknown))}"
            )
        for field in ("id", "displayName", "relation", "component", "scope", "brand"):
            if field in condition and condition[field] is not None and not isinstance(
                condition[field], str
            ):
                raise IntentValidationError(f"{field}必须是文字")
        if "canUseBrandAccount" in condition and condition["canUseBrandAccount"] is not None:
            if not isinstance(condition["canUseBrandAccount"], bool):
                raise IntentValidationError("canUseBrandAccount必须是布尔值或null")
        if "needsFineGrainedCount" in condition and not isinstance(
            condition["needsFineGrainedCount"], bool
        ):
            raise IntentValidationError("needsFineGrainedCount必须是布尔值")
        scope = _clean_text(condition.get("scope"))
        if scope and scope not in {"unspecified", "public", "own_brand", "own_store"}:
            raise IntentValidationError("scope值不受支持")
        for field in (
            "behaviors",
            "categories",
            "brands",
            "channels",
            "titleKeywords",
            "searchKeywords",
            "productIds",
            "aiplStatuses",
            "attributes",
        ):
            if field in condition:
                _clean_list(condition[field], field)

    @staticmethod
    def _resolve_relation(value: object, index: int) -> str | None:
        if index == 0:
            return None
        normalized = _clean_text(value) or "intersect"
        if normalized not in RELATION_OPERATORS:
            raise IntentValidationError("relation必须是intersect、union或exclude")
        return RELATION_OPERATORS[normalized]

    def _select_component(self, condition: dict[str, Any]) -> dict[str, Any]:
        explicit = _clean_text(condition.get("component"))
        if explicit:
            if explicit not in self.engine.packages:
                raise IntentValidationError(f"未知组件：{explicit}")
            if explicit != ConfigEngine.COMMODITY_PACKAGE:
                return {
                    "status": "ready",
                    "component": explicit,
                    "reason": "意图中明确指定了组件。",
                }
            channels = _clean_list(condition.get("channels"), "channels")
            if "所有销售渠道" in channels:
                return {
                    "status": "ready",
                    "component": explicit,
                    "reason": "商品行为明确使用所有销售渠道，不绑定店铺账号。",
                    "strategy": "all_channels_without_shop_account",
                }
            scope = _clean_text(condition.get("scope")) or "unspecified"
            if scope == "own_brand" and channels:
                return {
                    "status": "ready",
                    "component": explicit,
                    "reason": "商品行为明确使用品牌级渠道汇总，不绑定单一店铺账号。",
                    "strategy": "channel_aggregate_without_shop_account",
                }

        if not explicit and condition.get("attributes") and not condition.get("component"):
            return {
                "status": "needs_clarification",
                "component": None,
                "reason": "属性值必须与具体属性组件对应。",
                "questions": ["这些属性值属于购买力、年龄、城市等级、性别、月均消费还是策略人群？"],
            }

        scope = _clean_text(condition.get("scope")) or "unspecified"
        recommendation_intent = {
            "mentionsOwnStore": explicit == ConfigEngine.COMMODITY_PACKAGE
            or scope == "own_store",
            "mentionsOwnBrand": scope == "own_brand",
            "brand": condition.get("brand"),
            "canUseBrandAccount": condition.get("canUseBrandAccount"),
            "productIds": condition.get("productIds"),
            "aiplStatuses": condition.get("aiplStatuses"),
            "searchIntent": bool(condition.get("searchKeywords")),
            "needsFineGrainedCount": condition.get("needsFineGrainedCount") is True,
        }
        return self.catalog.recommend_component(recommendation_intent)

    def _compile_condition(
        self,
        component: str,
        condition: dict[str, Any],
        condition_id: str,
        relation: str | None,
        node_offset: int,
    ) -> dict[str, Any]:
        questions: list[dict[str, Any]] = []
        warnings: list[str] = []
        behaviors = _clean_list(condition.get("behaviors"), "behaviors")
        behavior_match = _clean_text(condition.get("behaviorMatch")) or "any"
        if behavior_match not in {"any", "all"}:
            raise IntentValidationError("behaviorMatch必须是any或all")

        behavior_components = {
            ConfigEngine.CATEGORY_PUBLIC_PACKAGE,
            ConfigEngine.CATEGORY_ITEM_PACKAGE,
            ConfigEngine.COMMODITY_PACKAGE,
        }
        if component in behavior_components:
            if not behaviors:
                behavior_field = next(
                    (
                        item
                        for item in self.engine.get_package_meta(component).get("schema", [])
                        if item.get("key") == "bhv"
                    ),
                    {},
                )
                behavior_options = [
                    {"value": _option_parts(option)[0], "label": _option_parts(option)[1]}
                    for option in behavior_field.get("options") or []
                ]
                questions.append(
                    self._question(
                        condition_id,
                        "behaviors",
                        "请选择需要圈选的用户行为，例如浏览、购买、收藏或加购。",
                        "“类目公域行为”是组件名称；这里需要选择组件内的具体用户行为。",
                        answer_type="multi_select",
                        options=behavior_options,
                    )
                )
            behaviors = self._resolve_options(
                component, "bhv", behaviors, condition_id, questions
            )
            self._validate_behavior_parameters(
                component,
                condition,
                condition_id,
                behaviors,
                behavior_match,
                questions,
            )

        product_ids = _clean_list(condition.get("productIds"), "productIds")
        if (
            component == ConfigEngine.CATEGORY_ITEM_PACKAGE
            and len(product_ids) > 1
            and behavior_match == "all"
            and len(behaviors) > 1
        ):
            questions.append(
                self._question(
                    condition_id,
                    "behaviorMatch",
                    "多个商品ID同时要求多个行为全部发生，当前工作台无法无歧义表达分组关系。请拆成更明确的条件。",
                    "商品ID之间是并集，而全部行为之间是交集，需要明确每组关系。",
                    answer_type="text",
                )
            )

        expansions: list[tuple[list[str], str | None]] = []
        behavior_groups = (
            [[behavior] for behavior in behaviors]
            if behavior_match == "all" and len(behaviors) > 1
            else [behaviors]
        )
        if component == ConfigEngine.CATEGORY_ITEM_PACKAGE:
            if not product_ids:
                questions.append(
                    self._question(
                        condition_id,
                        "productIds",
                        "请提供需要分析的商品ID。",
                        "类目商品行为必须指定商品ID。",
                        answer_type="list",
                    )
                )
            for behavior_index, behavior_group in enumerate(behavior_groups):
                for item_index, product_id in enumerate(product_ids):
                    internal_operator = None
                    if behavior_index > 0:
                        internal_operator = "n"
                    elif item_index > 0:
                        internal_operator = "u"
                    expansions.append((behavior_group, internal_operator))
        else:
            for behavior_index, behavior_group in enumerate(behavior_groups):
                expansions.append(
                    (behavior_group, "n" if behavior_index > 0 else None)
                )

        category_split_chunks: list[list[str]] = []
        display_name = _clean_text(condition.get("displayName")).replace("品类", "类目")
        categories = _clean_list(condition.get("categories"), "categories")
        is_brand_core_category = component == ConfigEngine.CATEGORY_PUBLIC_PACKAGE and (
            "品牌核心类目" in display_name or "买过我品牌" in display_name
        )
        if is_brand_core_category and len(categories) > 10:
            category_split_chunks = [
                categories[index : index + 10]
                for index in range(0, len(categories), 10)
            ]
            expanded: list[tuple[list[str], str | None, list[str]]] = []
            for behavior_group, behavior_operator in expansions:
                for chunk_index, chunk in enumerate(category_split_chunks):
                    if chunk_index == 0:
                        chunk_operator = behavior_operator
                    else:
                        # Excluding a union can be represented as sequential
                        # differences. Other brand-core chunks follow the
                        # workbench's established union split behavior.
                        chunk_operator = "d" if relation == "d" else "u"
                    expanded.append((behavior_group, chunk_operator, chunk))
            expansions = expanded
            warnings.append(
                f"品牌核心类目共有{len(categories)}项；已在其余参数齐全后按每节点最多10项拆成{len(category_split_chunks)}组。"
            )

        if questions:
            return {
                "nodes": [],
                "generatedItems": [],
                "questions": questions,
                "warnings": warnings,
            }

        nodes: list[dict[str, Any]] = []
        generated_items: list[dict[str, Any]] = []
        expansion_index = 0

        for group_index, expansion in enumerate(expansions):
            behavior_group, internal_operator = expansion[:2]
            category_chunk = expansion[2] if len(expansion) > 2 else None
            product_id = None
            if component == ConfigEngine.CATEGORY_ITEM_PACKAGE and product_ids:
                product_id = product_ids[group_index % len(product_ids)]
            node_operator = relation if expansion_index == 0 else internal_operator
            node_condition = copy.deepcopy(condition)
            if category_chunk is not None:
                node_condition["categories"] = category_chunk
            built = self._build_node(
                component,
                node_condition,
                condition_id,
                behavior_group,
                product_id,
                node_operator,
                node_offset + expansion_index,
            )
            questions.extend(built["questions"])
            warnings.extend(built["warnings"])
            if built["questions"]:
                continue
            nodes.append(built["node"])
            generated_items.append(built["generatedItem"])
            expansion_index += 1

        if questions:
            return {
                "nodes": [],
                "generatedItems": [],
                "questions": questions,
                "warnings": warnings,
            }
        return {
            "nodes": nodes,
            "generatedItems": generated_items,
            "questions": [],
            "warnings": warnings,
        }

    def _validate_behavior_parameters(
        self,
        component: str,
        condition: dict[str, Any],
        condition_id: str,
        behaviors: list[str],
        behavior_match: str,
        questions: list[dict[str, Any]],
    ) -> None:
        applicability = {
            ConfigEngine.CATEGORY_PUBLIC_PACKAGE: {
                "purchaseCount": {"购买"},
                "purchaseAmount": {"购买"},
                "itemPrice": {"购买", "浏览", "收藏", "加购", "评论"},
            },
            ConfigEngine.COMMODITY_PACKAGE: {
                "browseDays": {"浏览"},
                "purchaseCount": {"购买"},
                "purchaseAmount": {"购买"},
            },
            ConfigEngine.CATEGORY_ITEM_PACKAGE: {},
        }
        component_rules = applicability.get(component, {})
        for field in ("browseDays", "purchaseCount", "purchaseAmount", "itemPrice"):
            if condition.get(field) is None:
                continue
            valid_behaviors = component_rules.get(field, set())
            behavior_set = set(behaviors)
            if behavior_match == "all":
                representable = bool(behavior_set & valid_behaviors)
            else:
                representable = bool(behavior_set) and behavior_set <= valid_behaviors
            if representable:
                continue
            questions.append(
                self._question(
                    condition_id,
                    field,
                    f"{field}不能应用于当前行为组合，请确认要修改行为还是移除该限制。",
                    "工作台只会在支持该参数的行为下显示它，编译器不会静默丢弃条件。",
                    answer_type="text",
                )
            )

    def _build_node(
        self,
        component: str,
        condition: dict[str, Any],
        condition_id: str,
        behaviors: list[str],
        product_id: str | None,
        operator: str | None,
        node_index: int,
    ) -> dict[str, Any]:
        questions: list[dict[str, Any]] = []
        warnings: list[str] = []
        meta = self.engine.get_package_meta(component)
        form_data, mode_data = self._initial_state(component, meta.get("schema") or [])
        if behaviors:
            form_data["bhv"] = behaviors

        if component == ConfigEngine.CATEGORY_PUBLIC_PACKAGE:
            self._populate_category_public(
                condition, condition_id, form_data, mode_data, questions, warnings
            )
        elif component == ConfigEngine.CATEGORY_ITEM_PACKAGE:
            form_data["item"] = product_id or ""
            self._apply_time(component, condition, behaviors, form_data, mode_data, questions)
        elif component == ConfigEngine.COMMODITY_PACKAGE:
            self._populate_commodity(
                condition, condition_id, form_data, mode_data, questions, warnings
            )
        elif component == "AIPL状态":
            statuses = _clean_list(condition.get("aiplStatuses"), "aiplStatuses")
            if not statuses:
                questions.append(
                    self._question(
                        condition_id,
                        "aiplStatuses",
                        "请选择认知、兴趣、购买或忠诚阶段。",
                        "AIPL状态至少需要一个阶段。",
                        answer_type="multi_select",
                    )
                )
            form_data["types"] = self._resolve_options(
                component, "types", statuses, condition_id, questions
            )
            categories = _clean_list(condition.get("categories"), "categories")
            if len(categories) > 1:
                questions.append(
                    self._question(
                        condition_id,
                        "categories",
                        "AIPL状态每个节点只能选择一个类目，请选定一个。",
                        "当前组件是类目单选。",
                        answer_type="single_select",
                    )
                )
            if categories:
                resolved = self._resolve_options(
                    component, "cate", categories, condition_id, questions
                )
                if resolved:
                    form_data["cate"] = resolved[0]
            self._apply_time(component, condition, statuses, form_data, mode_data, questions)
        elif component in ATTRIBUTE_COMPONENTS:
            attributes = _clean_list(condition.get("attributes"), "attributes")
            if not attributes:
                questions.append(
                    self._question(
                        condition_id,
                        "attributes",
                        f"请明确选择{component}的具体档位。",
                        "AI不会自行推断档位高低。",
                        answer_type="multi_select",
                    )
                )
            form_data["attributes"] = self._resolve_options(
                component, "attributes", attributes, condition_id, questions
            )
        elif component == "关键词搜索":
            keywords = _clean_list(condition.get("searchKeywords"), "searchKeywords")
            if not keywords:
                questions.append(
                    self._question(
                        condition_id,
                        "searchKeywords",
                        "请提供用户实际搜索过的关键词。",
                        "关键词搜索组件至少需要一个搜索词。",
                        answer_type="list",
                    )
                )
            if len(keywords) > 20:
                raise IntentValidationError("关键词搜索每个节点最多20个关键词")
            form_data["searchs"] = keywords
            self._apply_time(component, condition, [], form_data, mode_data, questions)
        else:
            raise IntentValidationError(f"暂不支持编译组件：{component}")

        if questions:
            return {
                "node": None,
                "generatedItem": None,
                "questions": questions,
                "warnings": warnings,
            }

        visible_keys = self._visible_keys(component, meta, form_data)
        engine_payload = self._engine_payload(
            component,
            meta.get("schema") or [],
            visible_keys,
            form_data,
            mode_data,
        )
        try:
            generated = self.engine.generate_json(engine_payload)
            generated_item = generated["list"][0]
        except Exception as exc:
            raise IntentValidationError(f"{component}参数无法生成圈包结构: {exc}") from exc

        return {
            "node": {
                "id": f"ai_node_{node_index + 1}",
                "displayName": _clean_text(condition.get("displayName")),
                "packageType": component,
                "operator": operator,
                "formData": form_data,
                "modeData": mode_data,
            },
            "generatedItem": generated_item,
            "questions": [],
            "warnings": warnings,
        }

    def _populate_category_public(
        self,
        condition: dict[str, Any],
        condition_id: str,
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
        questions: list[dict[str, Any]],
        warnings: list[str],
    ) -> None:
        component = ConfigEngine.CATEGORY_PUBLIC_PACKAGE
        categories = _clean_list(condition.get("categories"), "categories")
        display_name = _clean_text(condition.get("displayName"))
        brands = _clean_list(condition.get("brands"), "brands")
        brand_label = brands[0] if brands else _clean_text(condition.get("brand"))
        normalized_display_name = display_name.replace("品类", "类目")
        is_brand_core_category = (
            "品牌核心类目" in normalized_display_name
            or any(
                marker in normalized_display_name
                for marker in (
                    "买过我品牌",
                    "买了我品牌",
                    "购买我品牌",
                    "买过我这个品牌",
                    "买了我这个品牌",
                    "购买我这个品牌",
                    "买过本品牌",
                    "买了本品牌",
                    "购买本品牌",
                )
            )
        )
        category_parameter_name = "品牌核心类目" if is_brand_core_category else "分析类目"
        category_prompt = (
            f"请选择{brand_label or '该品牌'}的品牌核心类目；总数不限，系统会按每个组件最多10项自动拆分。"
            if is_brand_core_category
            else "请选择需要分析的类目。"
        )
        category_reason = (
            "品牌核心类目是该品牌销售最高的核心二级类目，用于排除对比期内已经购买过该品牌的人；请一次选择完整范围，超过10项会在其余参数完成后自动拆成多个组件。"
            if is_brand_core_category
            else "品类新客需要先明确本次分析的正式类目路径。"
        )
        if not categories:
            question = self._question(
                condition_id,
                "categories",
                category_prompt,
                category_reason,
                answer_type="multi_select" if is_brand_core_category else "single_select",
                action={
                    "type": "search_options",
                    "component": component,
                    "field": "leafCates",
                    "query": "",
                },
            )
            question["parameterName"] = category_parameter_name
            if is_brand_core_category:
                question["maxSelectionsPerNode"] = 10
                question["autoSplitOverflow"] = True
            else:
                question["maxSelections"] = 1
            questions.append(question)
        if len(categories) > 10:
            raise IntentValidationError("类目公域行为每个节点最多选择10个类目")
        form_data["leafCates"] = self._resolve_options(
            component,
            "leafCates",
            categories,
            condition_id,
            questions,
            force_multi=is_brand_core_category,
            parameter_name=category_parameter_name,
            selection_prompt=category_prompt,
            selection_reason=category_reason,
        )

        if len(brands) > 10:
            raise IntentValidationError("类目公域行为每个节点最多选择10个品牌")
        form_data["stdBrand"] = self._resolve_options(
            component, "stdBrand", brands, condition_id, questions
        )

        channels = _clean_list(condition.get("channels"), "channels") or ["天猫"]
        if "所有销售渠道" in channels and len(channels) > 1:
            channels = ["所有销售渠道"]
            warnings.append("已按渠道互斥规则保留“所有销售渠道”。")
        form_data["channel"] = self._resolve_options(
            component, "channel", channels, condition_id, questions
        )
        self._populate_title_keywords(
            component, "title", "title_type", condition, condition_id, form_data, questions, 10
        )
        self._apply_numeric(condition, "purchaseCount", "frequency", form_data, mode_data)
        self._apply_numeric(condition, "purchaseAmount", "price", form_data, mode_data)
        self._apply_numeric(condition, "itemPrice", "itemprice", form_data, mode_data)
        self._apply_time(
            component,
            condition,
            list(form_data.get("bhv") or []),
            form_data,
            mode_data,
            questions,
        )

    @staticmethod
    def _condition_window(condition: dict[str, Any]) -> tuple[date, date] | None:
        date_range = condition.get("dateRange")
        if isinstance(date_range, list) and len(date_range) == 2:
            try:
                return date.fromisoformat(str(date_range[0])), date.fromisoformat(
                    str(date_range[1])
                )
            except ValueError:
                return None
        recent_days = condition.get("recentDays")
        if isinstance(recent_days, int) and recent_days > 0:
            end = latest_selectable_date()
            return end.fromordinal(end.toordinal() - recent_days + 1), end
        return None

    @classmethod
    def _validate_labeled_comparison_periods(
        cls, conditions: list[dict[str, Any]]
    ) -> None:
        statistic_windows = {
            window
            for condition in conditions
            if isinstance(condition, dict)
            and "统计时间" in _clean_text(condition.get("displayName"))
            and (window := cls._condition_window(condition)) is not None
        }
        comparison_windows = {
            window
            for condition in conditions
            if isinstance(condition, dict)
            and "对比时间" in _clean_text(condition.get("displayName"))
            and (window := cls._condition_window(condition)) is not None
        }
        if statistic_windows.intersection(comparison_windows):
            raise IntentValidationError(
                "统计时间与对比时间不能相同，请使用不同的两个周期"
            )

    def _labeled_comparison_period_question(
        self, conditions: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        statistic_conditions = [
            condition
            for condition in conditions
            if isinstance(condition, dict)
            and "统计时间" in _clean_text(condition.get("displayName"))
        ]
        comparison_conditions = [
            condition
            for condition in conditions
            if isinstance(condition, dict)
            and "对比时间" in _clean_text(condition.get("displayName"))
        ]
        if not statistic_conditions or not comparison_conditions:
            return None
        missing_statistic = [
            condition
            for condition in statistic_conditions
            if self._condition_window(condition) is None
        ]
        missing_comparison = [
            condition
            for condition in comparison_conditions
            if self._condition_window(condition) is None
        ]
        if not missing_statistic and not missing_comparison:
            return None

        if missing_statistic and missing_comparison:
            target_condition = missing_statistic[0]
            prompt = "请补充统计时间和对比时间，例如“近半年对比前半年”。"
            reason = (
                "品类新客必须比较两个不同、连续且等长的周期；"
                "数据最晚截止到昨天，未确认时间前不会生成节点。"
            )
            parameter_name = "统计时间与对比时间"
        elif missing_statistic:
            target_condition = missing_statistic[0]
            prompt = "请补充统计时间，例如“近半年”或“近30天”。"
            reason = "对比时间已明确；还需要统计时间，且数据最晚截止到昨天。"
            parameter_name = "统计时间"
        else:
            target_condition = missing_comparison[0]
            prompt = "请补充对比时间，例如“对比前半年”或“对比前30天”。"
            reason = "统计时间已明确；还需要一个不同、连续且等长的对比周期，数据最晚截止到昨天。"
            parameter_name = "对比时间"

        condition_id = _clean_text(target_condition.get("id")) or "condition_1"
        question = self._question(
            condition_id,
            "recentDays",
            prompt,
            reason,
            answer_type="text",
        )
        question["parameterName"] = parameter_name
        return question

    def _populate_commodity(
        self,
        condition: dict[str, Any],
        condition_id: str,
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
        questions: list[dict[str, Any]],
        warnings: list[str],
    ) -> None:
        component = ConfigEngine.COMMODITY_PACKAGE
        channels = _clean_list(condition.get("channels"), "channels") or ["天猫"]
        if len(channels) != 1:
            questions.append(
                self._question(
                    condition_id,
                    "channels",
                    "商品行为每个节点请选择一个销售渠道。",
                    "商品行为渠道是单选。",
                    answer_type="single_select",
                )
            )
        resolved_channels = self._resolve_options(
            component, "channel", channels[:1], condition_id, questions
        )
        channel = resolved_channels[0] if resolved_channels else ""
        form_data["channel"] = channel
        shop = _clean_text(condition.get("_resolvedShop"))
        is_channel_aggregate = (
            _clean_text(condition.get("scope")) == "own_brand" and bool(channel)
        )
        if (
            channel
            and channel not in {"天猫", "所有销售渠道"}
            and shop
            and not is_channel_aggregate
        ):
            questions.append(
                self._question(
                    condition_id,
                    "channels",
                    "当前品牌旗舰店账号需要使用天猫渠道。请确认改为天猫。",
                    "其他渠道在现有工作台不能选择该品牌账号。",
                    answer_type="confirmation",
                )
            )
        if channel == "所有销售渠道":
            form_data["shop"] = ""
        elif is_channel_aggregate:
            form_data["shop"] = "全淘宝天猫"
        else:
            form_data["shop"] = shop

        categories = _clean_list(condition.get("categories"), "categories")
        if len(categories) > 1:
            raise IntentValidationError("商品行为每个节点最多选择1个类目")
        if categories:
            resolved = self._resolve_options(
                component, "cate", categories, condition_id, questions
            )
            if resolved:
                form_data["cate"] = resolved[0]
        self._populate_title_keywords(
            component,
            "keywords",
            "keywords_type",
            condition,
            condition_id,
            form_data,
            questions,
            5,
        )

        product_ids = _clean_list(condition.get("productIds"), "productIds")
        if len(product_ids) > 50:
            raise IntentValidationError("商品行为每个节点最多输入50个商品ID")
        form_data["selectedGoodsType"] = "指定商品ID" if product_ids else "任意品牌商品"
        form_data["item"] = product_ids
        self._apply_numeric(condition, "browseDays", "dayFrequency", form_data, mode_data)
        self._apply_numeric(condition, "purchaseCount", "frequency", form_data, mode_data)
        self._apply_numeric(condition, "purchaseAmount", "money", form_data, mode_data)
        self._apply_time(
            component,
            condition,
            list(form_data.get("bhv") or []),
            form_data,
            mode_data,
            questions,
        )

    def _populate_title_keywords(
        self,
        component: str,
        value_key: str,
        switch_key: str,
        condition: dict[str, Any],
        condition_id: str,
        form_data: dict[str, Any],
        questions: list[dict[str, Any]],
        limit: int,
    ) -> None:
        keywords = _clean_list(condition.get("titleKeywords"), "titleKeywords")
        if len(keywords) > limit:
            raise IntentValidationError(f"{component}每个节点最多输入{limit}个商品标题关键词")
        form_data[switch_key] = "指定商品标题关键字" if keywords else "任意商品标题关键字"
        form_data[value_key] = keywords

    def _apply_numeric(
        self,
        condition: dict[str, Any],
        source_key: str,
        target_key: str,
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
    ) -> None:
        raw = condition.get(source_key)
        if raw is None:
            return
        if not isinstance(raw, dict):
            raise IntentValidationError(f"{source_key}必须是包含min和max的对象")
        minimum = raw.get("min")
        maximum = raw.get("max")
        for value in (minimum, maximum):
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
                raise IntentValidationError(f"{source_key}的上下限必须是数字")
            if value is not None and value < 0:
                raise IntentValidationError(f"{source_key}的上下限不能小于0")
        if minimum is not None and maximum is not None and minimum > maximum:
            raise IntentValidationError(f"{source_key}的最小值不能大于最大值")
        form_data[target_key] = {"min": minimum, "max": maximum}
        if minimum is None and maximum is None:
            mode_data[target_key] = "unlimited"
        elif maximum is None:
            mode_data[target_key] = "min"
        else:
            mode_data[target_key] = "range"

    def _apply_time(
        self,
        component: str,
        condition: dict[str, Any],
        behaviors: list[str],
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
        questions: list[dict[str, Any]],
    ) -> None:
        if "time" not in form_data:
            return
        recent_days = condition.get("recentDays")
        date_range = condition.get("dateRange")
        if recent_days is not None and date_range is not None:
            raise IntentValidationError("recentDays和dateRange不能同时填写")
        if date_range is not None:
            if not isinstance(date_range, list) or len(date_range) != 2:
                raise IntentValidationError("dateRange必须包含开始和结束日期")
            try:
                start = date.fromisoformat(str(date_range[0]))
                end = date.fromisoformat(str(date_range[1]))
            except ValueError as exc:
                raise IntentValidationError("dateRange必须使用YYYY-MM-DD格式") from exc
            if start > end:
                raise IntentValidationError("dateRange开始日期不能晚于结束日期")
            latest_date = latest_selectable_date()
            if start > latest_date or end > latest_date:
                raise IntentValidationError(
                    "dateRange不能包含今天或未来日期，"
                    f"最晚只能选择昨天（{latest_date.isoformat()}）"
                )
            if (end - start).days + 1 > 366:
                raise IntentValidationError("固定日期范围不能超过366天")
            mode_data["time"] = "range"
            form_data["time"] = {
                "days": 30,
                "dateRange": [start.isoformat(), end.isoformat()],
            }
            return
        if recent_days is None:
            if component == ConfigEngine.CATEGORY_PUBLIC_PACKAGE and behaviors:
                valid_defaults = [
                    DEFAULT_CATEGORY_RECENT_DAYS[item]
                    for item in behaviors
                    if item in DEFAULT_CATEGORY_RECENT_DAYS
                ]
                recent_days = min(valid_defaults) if valid_defaults else 30
            else:
                recent_days = 30
        if isinstance(recent_days, bool) or not isinstance(recent_days, int):
            raise IntentValidationError("recentDays必须是整数")
        if recent_days < 1 or recent_days > 366:
            raise IntentValidationError("recentDays必须在1至366之间")
        mode_data["time"] = "recent"
        form_data["time"] = {"days": recent_days, "dateRange": []}

    def _initial_state(
        self,
        component: str,
        schema: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        form_data: dict[str, Any] = {}
        mode_data: dict[str, Any] = {}
        for field in schema:
            key = _clean_text(field.get("key"))
            widget = _clean_text(field.get("Widget_Type"))
            if widget == "搜索单选":
                form_data[key] = ""
            elif widget in MULTI_VALUE_WIDGETS or key in {
                "bhv",
                "channel",
                "leafCates",
                "stdBrand",
            }:
                form_data[key] = []
            elif widget == "单选组":
                form_data[key] = "任意商品标题关键字"
            elif widget == "数值_切换":
                mode_data[key] = "unlimited"
                form_data[key] = {"min": None, "max": None}
            elif widget == "日期_切换":
                mode_data[key] = "recent"
                form_data[key] = {"days": 30, "dateRange": []}
            else:
                form_data[key] = ""
        if component in {"AIPL状态", ConfigEngine.COMMODITY_PACKAGE} and "cate" in form_data:
            form_data["cate"] = "全部"
        return form_data, mode_data

    def _visible_keys(
        self,
        component: str,
        meta: dict[str, Any],
        form_data: dict[str, Any],
    ) -> set[str]:
        schema = meta.get("schema") or []
        visible = {
            _clean_text(field.get("key"))
            for field in schema
            if field.get("isDefault") is True
        }
        matrix = meta.get("matrix") or {}
        matrix_keys = list(matrix)
        combinations: list[str] = []
        if any("|" in key for key in matrix_keys):
            channel_values = form_data.get("channel")
            channels = channel_values if isinstance(channel_values, list) else [channel_values]
            behaviors = form_data.get("bhv") or []
            combinations = [f"{channel}|{behavior}" for channel in channels for behavior in behaviors]
        elif "DEFAULT" in matrix:
            combinations = ["DEFAULT"]
        else:
            combinations = form_data.get("bhv") or form_data.get("types") or []
        if combinations:
            shared = None
            for combination in combinations:
                fields = set(matrix.get(combination) or [])
                shared = fields if shared is None else shared & fields
            visible |= shared or set()

        has_category = bool(form_data.get("leafCates")) or bool(form_data.get("cate"))
        for switch_key in ("title_type", "keywords_type"):
            if switch_key in visible and not has_category:
                visible.discard(switch_key)
        if form_data.get("title_type") != "指定商品标题关键字":
            visible.discard("title")
        if form_data.get("keywords_type") != "指定商品标题关键字":
            visible.discard("keywords")
        if component == ConfigEngine.COMMODITY_PACKAGE and form_data.get(
            "selectedGoodsType"
        ) != "指定商品ID":
            visible.discard("item")
        return visible

    def _engine_payload(
        self,
        component: str,
        schema: list[dict[str, Any]],
        visible_keys: set[str],
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"_package": component}
        for field in schema:
            key = _clean_text(field.get("key"))
            if key not in visible_keys:
                continue
            value = form_data.get(key)
            widget = _clean_text(field.get("Widget_Type"))
            mode = mode_data.get(key)
            if widget == "数值_切换":
                if mode == "unlimited":
                    payload[key] = {"min": "", "max": ""}
                elif mode == "min":
                    payload[key] = {"min": value.get("min"), "max": ""}
                elif mode == "range":
                    payload[key] = {"min": value.get("min"), "max": value.get("max")}
                continue
            if widget == "日期_切换":
                if mode == "recent":
                    payload[key] = {"val": {"days": value.get("days")}, "min": "recent"}
                elif mode == "range":
                    payload[key] = {
                        "val": {
                            # The intent and preview keep ISO dates for safe
                            # validation/readability, while the data engine's
                            # import contract requires compact YYYYMMDD values.
                            "start": str(value["dateRange"][0]).replace("-", ""),
                            "end": str(value["dateRange"][1]).replace("-", ""),
                        },
                        "min": "range",
                    }
                continue
            if isinstance(value, list):
                if value:
                    payload[key] = value
            elif value not in (None, ""):
                payload[key] = value
        return payload

    def _resolve_options(
        self,
        component: str,
        field_key: str,
        values: list[str],
        condition_id: str,
        questions: list[dict[str, Any]],
        *,
        force_multi: bool = False,
        parameter_name: str = "",
        selection_prompt: str = "",
        selection_reason: str = "",
    ) -> list[str]:
        if not values:
            return []
        meta = self.engine.get_package_meta(component)
        field = next(
            (item for item in meta.get("schema") or [] if item.get("key") == field_key),
            None,
        )
        if field is None:
            raise IntentValidationError(f"{component}不存在字段{field_key}")
        options = field.get("options") or []
        if not options:
            return values

        resolved: list[str] = []
        unresolved: list[dict[str, Any]] = []
        for requested_index, requested in enumerate(values):
            normalized = _normalized_option(requested)
            exact: list[tuple[str, str]] = []
            leaf: list[tuple[str, str]] = []
            for option in options:
                value, label = _option_parts(option)
                if normalized in {_normalized_option(value), _normalized_option(label)}:
                    exact.append((value, label))
                if field_key == "stdBrand" and any(
                    normalized == _normalized_option(alias)
                    for alias in label.replace("／", "/").split("/")
                ):
                    exact.append((value, label))
                if normalized == _normalized_option(label.split(">")[-1]):
                    leaf.append((value, label))
            matches = exact or leaf
            if not matches:
                search_result = self.catalog.search_options(
                    component,
                    field_key,
                    requested,
                    limit=self.catalog.MAX_SEARCH_LIMIT,
                )
                candidates = search_result.get("matches") or []
                if len(candidates) == 1:
                    resolved.append(candidates[0]["value"])
                    continue
                unresolved.append(
                    {
                        "query": requested,
                        "sequence": requested_index,
                        "prompt": f"没有唯一匹配到“{requested}”，请从实时选项中确认。",
                        "reason": "AI不能编造类目、品牌、渠道或属性选项。",
                        "options": candidates,
                    }
                )
                continue
            unique = list(dict.fromkeys(value for value, _ in matches))
            if len(unique) == 1:
                resolved.append(unique[0])
            else:
                unresolved.append(
                    {
                        "query": requested,
                        "sequence": requested_index,
                        "prompt": f"“{requested}”匹配到多个选项，请确认具体项。",
                        "reason": "实时维表中存在同名或同末级选项。",
                        "options": [
                            {"value": value, "label": label}
                            for value, label in matches[: self.catalog.MAX_SEARCH_LIMIT]
                        ],
                    }
                )

        should_group = field_key in {"leafCates", "cate"} and (
            force_multi or len(values) > 1
        )
        if unresolved and should_group:
            merged_options: list[dict[str, Any]] = []
            seen_option_values: set[str] = set()
            option_groups: list[dict[str, Any]] = []
            for item in unresolved:
                group_options: list[dict[str, Any]] = []
                for option in item.get("options") or []:
                    value, label = _option_parts(option)
                    if not value:
                        continue
                    normalized_option = {"value": value, "label": label}
                    group_options.append(normalized_option)
                    if value not in seen_option_values:
                        seen_option_values.add(value)
                        merged_options.append(normalized_option)
                option_groups.append(
                    {"query": item["query"], "options": group_options}
                )
            question = self._question(
                condition_id,
                field_key,
                selection_prompt
                or f"请在一个下拉框内确认这{len(values)}个类目。",
                selection_reason
                or "多个类目会作为同一个多选参数保存，不会拆成多个确认框。",
                answer_type="multi_select",
                options=merged_options,
                action={
                    "type": "search_options",
                    "component": component,
                    "field": field_key,
                    "query": "",
                    "queries": [item["query"] for item in unresolved],
                },
            )
            question["optionGroups"] = option_groups
            question["selectedValues"] = list(dict.fromkeys(resolved))
            if parameter_name and "品牌核心类目" in parameter_name.replace("品类", "类目"):
                question["maxSelectionsPerNode"] = 10
                question["autoSplitOverflow"] = True
            else:
                question["maxSelections"] = 10
            if parameter_name:
                question["parameterName"] = parameter_name
            questions.append(question)
        else:
            for item in unresolved:
                question = self._question(
                    condition_id,
                    field_key,
                    item["prompt"],
                    item["reason"],
                    item["sequence"],
                    answer_type="single_select",
                    options=item["options"],
                    action={
                        "type": "search_options",
                        "component": component,
                        "field": field_key,
                        "query": item["query"],
                    },
                )
                question["maxSelections"] = 1
                if parameter_name:
                    question["parameterName"] = parameter_name
                questions.append(question)
        return list(dict.fromkeys(resolved))

    @staticmethod
    def _question(
        condition_id: str,
        field: str,
        prompt: str,
        reason: str,
        sequence: int = 0,
        *,
        answer_type: str = "text",
        options: list[dict[str, Any]] | None = None,
        action: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        question = {
            "id": f"{condition_id}.{field}.{sequence + 1}",
            "conditionId": condition_id,
            "field": field,
            "prompt": prompt,
            "reason": reason,
            "answerType": answer_type,
        }
        if options:
            question["options"] = options
        if action:
            question["action"] = action
        return question
