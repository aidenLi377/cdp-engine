"""Deterministically restore Xdata workbench nodes from data-engine JSON."""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass
from typing import Any

from .engine import ConfigEngine


MAX_ENGINE_JSON_NODES = 50
MAX_ENGINE_JSON_MESSAGE_LENGTH = 200_000
MULTI_VALUE_WIDGETS = {"搜索多选", "复选组", "下拉多选", "动态多选"}
VALID_RELATION_OPERATORS = {"n", "u", "d"}
VALID_POOL_OPERATORS = {"n", "u"}
PRESERVE_FROM_POOL_ID_PACKAGES = {
    ConfigEngine.BRAND_PROMOTION_PACKAGE,
    ConfigEngine.OMNIMEDIA_PACKAGE,
    ConfigEngine.SINGLE_MEDIA_PACKAGE,
}
MISSING = object()


@dataclass(frozen=True)
class EngineJsonExtraction:
    detected: bool
    payload: dict[str, Any] | None = None
    error: str | None = None


class EngineJsonReverseParser:
    """Reverse the exact JSON emitted by :class:`ConfigEngine`."""

    def __init__(self, engine: ConfigEngine) -> None:
        self.engine = engine

    def extract(self, message: str) -> EngineJsonExtraction:
        """Extract an engine payload from plain JSON, prose, or a JSON fence."""

        text = str(message or "").strip().lstrip("\ufeff")
        if not text:
            return EngineJsonExtraction(False)

        fenced = re.findall(
            r"```(?:json)?\s*([\s\S]*?)```",
            text,
            flags=re.IGNORECASE,
        )
        candidates = [candidate.strip() for candidate in fenced if candidate.strip()]
        if text.startswith("{"):
            candidates.append(text)

        decoder = json.JSONDecoder()
        for start in (match.start() for match in re.finditer(r"\{", text)):
            try:
                value, _ = decoder.raw_decode(text[start:])
            except json.JSONDecodeError:
                continue
            if self._looks_like_engine_json(value):
                return EngineJsonExtraction(True, value)

        parse_errors: list[str] = []
        for candidate in candidates:
            try:
                value = json.loads(candidate)
            except json.JSONDecodeError as exc:
                parse_errors.append(
                    f"第{exc.lineno}行第{exc.colno}列附近不是有效JSON"
                )
                continue
            if self._looks_like_engine_json(value):
                return EngineJsonExtraction(True, value)

        mentions_engine_shape = bool(
            re.search(r'"(?:crowdName|list|compute)"\s*:', text)
        )
        if fenced or mentions_engine_shape:
            return EngineJsonExtraction(
                True,
                error=parse_errors[0] if parse_errors else "没有找到完整的数据引擎JSON对象",
            )
        return EngineJsonExtraction(False)

    @staticmethod
    def _looks_like_engine_json(value: Any) -> bool:
        return (
            isinstance(value, dict)
            and isinstance(value.get("list"), list)
            and "compute" in value
        )

    def parse(self, payload: dict[str, Any]) -> dict[str, Any]:
        crowd_name = str(payload.get("crowdName") or "未命名").strip() or "未命名"
        result: dict[str, Any] = {
            "success": False,
            "status": "invalid",
            "crowdName": crowd_name,
            "nodes": [],
            "generated": copy.deepcopy(payload),
            "unsupportedNodes": [],
            "unsupportedParameters": [],
            "errors": [],
        }

        if not isinstance(payload, dict):
            result["errors"].append("数据引擎JSON必须是对象")
            return result

        unknown_top = sorted(set(payload) - {"crowdName", "list", "compute"})
        for key in unknown_top:
            result["unsupportedParameters"].append(
                self._unsupported_parameter(-1, "", key, payload.get(key), "顶层字段未配置")
            )

        items = payload.get("list")
        if not isinstance(items, list) or not items:
            result["errors"].append("数据引擎JSON的list必须是非空数组")
            return result
        if len(items) > MAX_ENGINE_JSON_NODES:
            result["errors"].append(
                f"单次最多反向解析{MAX_ENGINE_JSON_NODES}个节点"
            )
            return result

        pool_context, compute_error = self._parse_compute(
            payload.get("compute"), len(items)
        )
        if compute_error:
            result["errors"].append(compute_error)

        parsed_nodes: list[dict[str, Any]] = []
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                result["unsupportedNodes"].append(
                    {
                        "nodeIndex": index + 1,
                        "selectionLv1": None,
                        "selectionLv2Name": "",
                        "reason": "节点不是JSON对象",
                    }
                )
                continue
            package_name = self._match_package(item)
            if not package_name:
                result["unsupportedNodes"].append(
                    {
                        "nodeIndex": index + 1,
                        "selectionLv1": copy.deepcopy(item.get("selectionLv1")),
                        "selectionLv2Name": str(item.get("selectionLv2Name") or ""),
                        "reason": "当前组件配置中没有匹配的节点类型",
                    }
                )
                continue

            node, unsupported, errors = self._parse_node(
                index,
                package_name,
                item,
                (pool_context or {}).get(index),
            )
            result["unsupportedParameters"].extend(unsupported)
            result["errors"].extend(errors)
            if node is not None:
                parsed_nodes.append(node)

        result["unsupportedParameters"] = self._dedupe_unsupported_parameters(
            result["unsupportedParameters"]
        )
        if result["unsupportedNodes"] or result["unsupportedParameters"]:
            result["status"] = "unsupported"
            return result
        if result["errors"]:
            return result
        if len(parsed_nodes) != len(items):
            result["errors"].append("部分节点未能完整恢复")
            return result

        result.update({"success": True, "status": "ready", "nodes": parsed_nodes})
        return result

    def _match_package(self, item: dict[str, Any]) -> str | None:
        selection_lv1 = item.get("selectionLv1")
        candidates: list[tuple[str, dict[str, Any]]] = []
        for package_name in self.engine.packages:
            base = self.engine._load_base_template(package_name)  # noqa: SLF001
            if base.get("selectionLv1") == selection_lv1:
                candidates.append((package_name, base))
        if len(candidates) == 1:
            return candidates[0][0]
        if not candidates:
            return None

        selection_lv2_name = item.get("selectionLv2Name")
        if selection_lv2_name:
            named = [
                package
                for package, base in candidates
                if base.get("selectionLv2Name") == selection_lv2_name
            ]
            if len(named) == 1:
                return named[0]

        selection_lv2 = item.get("selectionLv2")
        exact = [
            package
            for package, base in candidates
            if base.get("selectionLv2") == selection_lv2
        ]
        return exact[0] if len(exact) == 1 else None

    def _parse_node(
        self,
        index: int,
        package_name: str,
        item: dict[str, Any],
        pool_context: dict[str, Any] | None,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]], list[str]]:
        meta = self.engine.get_package_meta(package_name)
        schema = meta.get("schema") or []
        form_data, mode_data = self._initial_state(package_name, schema)
        unsupported = self._unknown_parameter_entries(index, package_name, item, schema)
        errors: list[str] = []

        fields_by_key = {
            str(field.get("key") or ""): field
            for field in schema
            if str(field.get("key") or "")
        }
        ordered_fields = sorted(
            schema,
            key=lambda field: {
                "channel": 0,
                "bhv": 2,
                "onebp_scene": 3,
                "ppob_scene": 3,
            }.get(str(field.get("key") or ""), 1),
        )
        for field in ordered_fields:
            key = str(field.get("key") or "").strip()
            path = str(field.get("JSON_Path") or "").strip()
            widget = str(field.get("Widget_Type") or "").strip()
            if not key or not path or path == "-":
                continue
            if widget == "日期_切换":
                self._reverse_date(index, package_name, item, key, form_data, mode_data, unsupported)
                continue
            if widget == "数值_切换":
                raw_value = self._path_value(item, path)
                if raw_value is not MISSING:
                    self._reverse_numeric(
                        index,
                        package_name,
                        path,
                        key,
                        raw_value,
                        form_data,
                        mode_data,
                        unsupported,
                    )
                continue

            raw_value = self._path_value(item, path)
            if raw_value is MISSING:
                continue
            if raw_value is None:
                continue
            if key == "attributes":
                raw_value = self._attribute_values(
                    index, package_name, path, raw_value, unsupported
                )
                if raw_value is MISSING:
                    continue
            decoded, reason = self._reverse_field_value(
                package_name,
                field,
                raw_value,
                form_data,
            )
            if reason:
                unsupported.append(
                    self._unsupported_parameter(
                        index,
                        package_name,
                        path,
                        raw_value,
                        reason,
                    )
                )
                continue
            form_data[key] = decoded

        self._restore_switch_fields(form_data, fields_by_key)
        context = pool_context or {
            "poolId": f"imported-pool-{index + 1}",
            "poolIndex": index,
            "poolOperator": "n",
            "operator": None if index == 0 else "n",
        }
        node = {
            "id": f"imported-node-{index + 1}",
            "displayName": f"JSON导入节点 {index + 1}",
            "packageType": package_name,
            "operator": context.get("operator"),
            "poolId": context.get("poolId"),
            "poolOperator": context.get("poolOperator"),
            "formData": form_data,
            "modeData": mode_data,
        }

        if not unsupported:
            try:
                regenerated = self._regenerate_item(package_name, meta, form_data, mode_data)
            except (TypeError, ValueError, KeyError) as exc:
                errors.append(f"第{index + 1}个节点无法重新生成：{exc}")
            else:
                if package_name not in PRESERVE_FROM_POOL_ID_PACKAGES:
                    regenerated["fromPoolId"] = context.get("poolIndex", index)
                if index:
                    regenerated["op"] = "INIT"
                else:
                    regenerated.pop("op", None)
                expected = item
                actual = regenerated
                if expected != actual:
                    for path in self._diff_paths(expected, actual):
                        unsupported.append(
                            self._unsupported_parameter(
                                index,
                                package_name,
                                path,
                                self._path_value(item, path),
                                "当前系统无法无损反向还原该字段",
                            )
                        )

        return node, unsupported, errors

    def _unknown_parameter_entries(
        self,
        index: int,
        package_name: str,
        item: dict[str, Any],
        schema: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        base = self.engine._load_base_template(package_name)  # noqa: SLF001
        allowed_top = {
            "selectionLv1",
            "selectionLv2",
            "selectionLv2Name",
            "selectionLv3",
            "tipProperty",
            "fromPoolId",
            "op",
        } | set(base)
        unsupported = [
            self._unsupported_parameter(
                index,
                package_name,
                key,
                item.get(key),
                "节点顶层字段未配置",
            )
            for key in sorted(set(item) - allowed_top)
        ]

        selection_lv3 = item.get("selectionLv3")
        if not isinstance(selection_lv3, dict):
            unsupported.append(
                self._unsupported_parameter(
                    index,
                    package_name,
                    "selectionLv3",
                    selection_lv3,
                    "selectionLv3必须是对象",
                )
            )
            return unsupported

        allowed_lv3 = set((base.get("selectionLv3") or {}).keys())
        allowed_extra: set[str] = set()
        for field in schema:
            path = str(field.get("JSON_Path") or "").strip()
            widget = str(field.get("Widget_Type") or "").strip()
            if path == "selectionLv3" and widget == "日期_切换":
                allowed_lv3.update({"dateType", "dateValue"})
            elif path.startswith("selectionLv3.extraFilters."):
                allowed_lv3.add("extraFilters")
                allowed_extra.add(path.split(".", 2)[2])
            elif path.startswith("selectionLv3."):
                allowed_lv3.add(path.split(".", 2)[1])
        if package_name == ConfigEngine.OMNIMEDIA_PACKAGE:
            allowed_lv3.add("bhv_type")

        for key in sorted(set(selection_lv3) - allowed_lv3):
            unsupported.append(
                self._unsupported_parameter(
                    index,
                    package_name,
                    f"selectionLv3.{key}",
                    selection_lv3.get(key),
                    "当前节点没有这个参数",
                )
            )
        extra_filters = selection_lv3.get("extraFilters")
        if extra_filters is not None and not isinstance(extra_filters, dict):
            unsupported.append(
                self._unsupported_parameter(
                    index,
                    package_name,
                    "selectionLv3.extraFilters",
                    extra_filters,
                    "extraFilters必须是对象",
                )
            )
        elif isinstance(extra_filters, dict):
            for key in sorted(set(extra_filters) - allowed_extra):
                unsupported.append(
                    self._unsupported_parameter(
                        index,
                        package_name,
                        f"selectionLv3.extraFilters.{key}",
                        extra_filters.get(key),
                        "当前节点没有这个参数",
                    )
                )
        return unsupported

    def _reverse_field_value(
        self,
        package_name: str,
        field: dict[str, Any],
        raw_value: Any,
        form_data: dict[str, Any],
    ) -> tuple[Any, str | None]:
        key = str(field.get("key") or "")
        widget = str(field.get("Widget_Type") or "")
        data_source = str(field.get("Data_Source") or "").strip()
        force_list = widget in MULTI_VALUE_WIDGETS or widget == "列表输入"

        if raw_value == "ALL" and key == "cate":
            return ("全部", None)

        values = raw_value if isinstance(raw_value, list) else [raw_value]
        decoded_values: list[Any] = []
        for value in values:
            if not data_source or data_source in {"-", "nan"}:
                decoded_values.append(value)
                continue
            decoded = self._reverse_option(package_name, key, value, form_data, field)
            if decoded is None:
                return raw_value, f"选项值“{value}”未在当前配置中找到"
            decoded_values.append(decoded)

        if force_list:
            return decoded_values, None
        if widget == "普通输入框":
            return (decoded_values[0] if len(decoded_values) == 1 else decoded_values), None
        if len(decoded_values) != 1:
            return raw_value, "单选参数包含多个值"
        return decoded_values[0], None

    def _reverse_option(
        self,
        package_name: str,
        key: str,
        raw_value: Any,
        form_data: dict[str, Any],
        field: dict[str, Any],
    ) -> str | None:
        raw_text = str(raw_value)
        candidates: list[str] = []
        if key == "bhv":
            for (package, _channel, name), translated in self.engine.bhv_translator.items():
                if package == package_name and str(translated) == raw_text:
                    candidates.append(name)
        elif key in {"onebp_scene", "ppob_scene"}:
            behavior = str(form_data.get("bhv") or "")
            for (package, configured_behavior, name), translated in self.engine.scene_translator.items():
                if (
                    package == package_name
                    and str(translated) == raw_text
                    and (not behavior or configured_behavior == behavior)
                ):
                    candidates.append(name)
        else:
            for (package, name), translated in self.engine.dim_translator.items():
                if package == package_name and str(translated) == raw_text:
                    candidates.append(name)
            if not candidates:
                candidates.extend(
                    name
                    for name, translated in self.engine.id_translator.items()
                    if str(translated) == raw_text
                )

        allowed_options = {
            str(option.get("value") if isinstance(option, dict) else option)
            for option in (field.get("options") or [])
        }
        if raw_text in allowed_options:
            candidates.append(raw_text)
        unique = list(dict.fromkeys(candidate for candidate in candidates if candidate))
        if allowed_options:
            scoped = [candidate for candidate in unique if candidate in allowed_options]
            if scoped:
                unique = scoped
        return unique[0] if len(unique) == 1 else None

    def _reverse_numeric(
        self,
        index: int,
        package_name: str,
        path: str,
        key: str,
        raw_value: Any,
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
        unsupported: list[dict[str, Any]],
    ) -> None:
        if not isinstance(raw_value, dict):
            unsupported.append(
                self._unsupported_parameter(index, package_name, path, raw_value, "数值参数必须是对象")
            )
            return
        unknown = set(raw_value) - {"op", "min", "max"}
        if unknown:
            unsupported.append(
                self._unsupported_parameter(
                    index,
                    package_name,
                    path,
                    raw_value,
                    f"数值参数包含未知字段：{', '.join(sorted(unknown))}",
                )
            )
            return
        op = str(raw_value.get("op") or "")
        if op == "OPEN_OPEN":
            form_data[key] = {"min": None, "max": None}
            mode_data[key] = "unlimited"
        elif op == "OPEN_CLOSE" and "min" in raw_value:
            form_data[key] = {"min": raw_value.get("min"), "max": None}
            mode_data[key] = "min"
        elif op == "CLOSE_CLOSE" and "min" in raw_value and "max" in raw_value:
            form_data[key] = {"min": raw_value.get("min"), "max": raw_value.get("max")}
            mode_data[key] = "range"
        elif op == "CLOSE_OPEN":
            unsupported.append(
                self._unsupported_parameter(
                    index,
                    package_name,
                    path,
                    raw_value,
                    "当前工作台不支持仅填写最大值",
                )
            )
        else:
            unsupported.append(
                self._unsupported_parameter(index, package_name, path, raw_value, "数值区间格式不受支持")
            )

    def _reverse_date(
        self,
        index: int,
        package_name: str,
        item: dict[str, Any],
        key: str,
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
        unsupported: list[dict[str, Any]],
    ) -> None:
        selection_lv3 = item.get("selectionLv3") or {}
        date_type = selection_lv3.get("dateType")
        date_value = selection_lv3.get("dateValue", MISSING)
        if date_type == "ABSOLUTE_DATE_RANGE":
            if not isinstance(date_value, dict) or set(date_value) - {"from", "to"}:
                unsupported.append(
                    self._unsupported_parameter(
                        index,
                        package_name,
                        "selectionLv3.dateValue",
                        None if date_value is MISSING else date_value,
                        "固定日期格式不正确",
                    )
                )
                return
            start = str(date_value.get("from") or "")
            end = str(date_value.get("to") or "")
            if not re.fullmatch(r"\d{8}", start) or not re.fullmatch(r"\d{8}", end):
                unsupported.append(
                    self._unsupported_parameter(
                        index,
                        package_name,
                        "selectionLv3.dateValue",
                        date_value,
                        "固定日期必须使用YYYYMMDD格式",
                    )
                )
                return
            form_data[key] = {"days": 30, "dateRange": [start, end]}
            mode_data[key] = "range"
            return
        if date_type == "RELATIVE_RANGE":
            raw_days = 30 if date_value is MISSING else date_value
            try:
                days = int(raw_days)
            except (TypeError, ValueError):
                days = 0
            if not 1 <= days <= 366:
                unsupported.append(
                    self._unsupported_parameter(
                        index,
                        package_name,
                        "selectionLv3.dateValue",
                        None if date_value is MISSING else date_value,
                        "相对日期天数必须在1至366之间",
                    )
                )
                return
            form_data[key] = {"days": days, "dateRange": []}
            mode_data[key] = "recent"
            return
        unsupported.append(
            self._unsupported_parameter(
                index,
                package_name,
                "selectionLv3.dateType",
                date_type,
                "日期类型不受支持",
            )
        )

    def _attribute_values(
        self,
        index: int,
        package_name: str,
        path: str,
        raw_value: Any,
        unsupported: list[dict[str, Any]],
    ) -> Any:
        if not isinstance(raw_value, list) or not raw_value:
            unsupported.append(
                self._unsupported_parameter(index, package_name, path, raw_value, "属性值格式不正确")
            )
            return MISSING
        values: list[Any] = []
        for entry in raw_value:
            if not isinstance(entry, dict) or set(entry) - {"key", "selectValues"}:
                unsupported.append(
                    self._unsupported_parameter(index, package_name, path, raw_value, "属性值结构不受支持")
                )
                return MISSING
            selected = entry.get("selectValues")
            values.extend(selected if isinstance(selected, list) else [selected])
        return values

    @staticmethod
    def _restore_switch_fields(
        form_data: dict[str, Any],
        fields_by_key: dict[str, dict[str, Any]],
    ) -> None:
        for value_key, switch_key in (("title", "title_type"), ("keywords", "keywords_type")):
            if not form_data.get(value_key) or switch_key not in form_data:
                continue
            options = fields_by_key.get(switch_key, {}).get("options") or []
            configured = [
                str(option.get("value") if isinstance(option, dict) else option)
                for option in options
            ]
            form_data[switch_key] = next(
                (value for value in configured if value.startswith("指定商品标题")),
                "指定商品标题关键字",
            )
        if form_data.get("item") and "selectedGoodsType" in form_data:
            form_data["selectedGoodsType"] = "指定商品ID"

    @staticmethod
    def _initial_state(
        package_name: str,
        schema: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        form_data: dict[str, Any] = {}
        mode_data: dict[str, Any] = {}
        for field in schema:
            key = str(field.get("key") or "")
            widget = str(field.get("Widget_Type") or "")
            ui_config = field.get("uiConfig") or {}
            options = [
                option.get("value", option.get("label", ""))
                if isinstance(option, dict)
                else option
                for option in (field.get("options") or [])
            ]
            if key in {"title_type", "keywords_type"} and not options:
                options = ["任意商品标题关键字", "指定商品标题关键字"]
            if widget == "搜索单选":
                configured = ui_config.get("defaultValue", "")
                form_data[key] = "" if configured is None else configured
            elif widget in MULTI_VALUE_WIDGETS:
                form_data[key] = []
            elif widget == "单选组":
                configured = ui_config.get("defaultValue", MISSING)
                if configured is not MISSING and configured in options:
                    form_data[key] = configured
                elif configured in (None, ""):
                    form_data[key] = ""
                else:
                    form_data[key] = options[0] if options else ""
            elif widget == "数值_切换":
                form_data[key] = {"min": None, "max": None}
                mode_data[key] = "unlimited"
            elif widget == "日期_切换":
                days = ui_config.get("defaultDays", 30)
                days = days if isinstance(days, int) and 1 <= days <= 366 else 30
                form_data[key] = {"days": days, "dateRange": []}
                mode_data[key] = "recent"
            else:
                form_data[key] = ""
        if package_name in {"AIPL状态", ConfigEngine.COMMODITY_PACKAGE} and "cate" in form_data:
            form_data["cate"] = "全部"
        return form_data, mode_data

    def _regenerate_item(
        self,
        package_name: str,
        meta: dict[str, Any],
        form_data: dict[str, Any],
        mode_data: dict[str, Any],
    ) -> dict[str, Any]:
        visible = self._visible_keys(package_name, meta, form_data)
        payload: dict[str, Any] = {"_package": package_name}
        for field in meta.get("schema") or []:
            key = str(field.get("key") or "")
            if key not in visible:
                continue
            widget = str(field.get("Widget_Type") or "")
            value = form_data.get(key)
            mode = mode_data.get(key)
            if widget == "数值_切换":
                if mode == "unlimited":
                    payload[key] = {"min": "", "max": ""}
                elif mode == "min":
                    payload[key] = {"min": (value or {}).get("min"), "max": ""}
                elif mode == "range":
                    payload[key] = {
                        "min": (value or {}).get("min"),
                        "max": (value or {}).get("max"),
                    }
                continue
            if widget == "日期_切换":
                if mode == "recent":
                    payload[key] = {"val": {"days": (value or {}).get("days")}, "min": "recent"}
                elif mode == "range":
                    date_range = (value or {}).get("dateRange") or []
                    if len(date_range) == 2:
                        payload[key] = {
                            "val": {"start": date_range[0], "end": date_range[1]},
                            "min": "range",
                        }
                continue
            if isinstance(value, list):
                if value:
                    payload[key] = value
            elif value not in (None, ""):
                payload[key] = value
        generated = self.engine.generate_json(payload)
        items = generated.get("list") or []
        if len(items) != 1:
            raise ValueError("正向生成器没有返回唯一节点")
        return items[0]

    @staticmethod
    def _visible_keys(
        package_name: str,
        meta: dict[str, Any],
        form_data: dict[str, Any],
    ) -> set[str]:
        schema = meta.get("schema") or []
        visible = {
            str(field.get("key") or "")
            for field in schema
            if field.get("isDefault") is True
        }
        matrix = meta.get("matrix") or {}
        matrix_keys = list(matrix)
        if any("|" in key for key in matrix_keys):
            channels = form_data.get("channel")
            channels = channels if isinstance(channels, list) else [channels]
            behaviors = form_data.get("bhv") or []
            behaviors = behaviors if isinstance(behaviors, list) else [behaviors]
            combinations = [f"{channel}|{behavior}" for channel in channels for behavior in behaviors]
        elif "DEFAULT" in matrix:
            combinations = ["DEFAULT"]
        else:
            selected = form_data.get("bhv") or form_data.get("types") or []
            combinations = selected if isinstance(selected, list) else [selected]
        if combinations:
            shared: set[str] | None = None
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
        if (
            package_name == ConfigEngine.COMMODITY_PACKAGE
            and form_data.get("selectedGoodsType") != "指定商品ID"
        ):
            visible.discard("item")
        return visible

    @staticmethod
    def _parse_compute(
        raw_compute: Any,
        node_count: int,
    ) -> tuple[dict[int, dict[str, Any]] | None, str | None]:
        compute = re.sub(r"\s+", "", str(raw_compute or ""))
        if not compute:
            return None, "compute不能为空"
        position = 0
        pool_index = 0
        seen: list[int] = []
        context: dict[int, dict[str, Any]] = {}
        while position < len(compute):
            relation = None
            if pool_index:
                relation = compute[position : position + 1]
                if relation not in VALID_RELATION_OPERATORS:
                    return None, f"compute第{position + 1}位缺少有效的池间关系"
                position += 1
            if position >= len(compute) or compute[position] != "(":
                return None, f"compute第{position + 1}位应为左括号"
            end = compute.find(")", position + 1)
            if end < 0:
                return None, "compute缺少右括号"
            expression = compute[position + 1 : end]
            if not re.fullmatch(r"\d+(?:[nu]\d+)*", expression):
                return None, f"第{pool_index + 1}个操作池表达式不正确"
            indexes = [int(value) for value in re.split(r"[nu]", expression)]
            separators = re.findall(r"[nu]", expression)
            if len(set(separators)) > 1:
                return None, f"第{pool_index + 1}个操作池混用了交集和并集"
            pool_operator = separators[0] if separators else "n"
            for member_index, node_index in enumerate(indexes):
                if node_index < 0 or node_index >= node_count:
                    return None, f"compute引用了不存在的节点{node_index}"
                if node_index in seen:
                    return None, f"compute重复引用了节点{node_index}"
                seen.append(node_index)
                context[node_index] = {
                    "poolId": f"imported-pool-{pool_index + 1}",
                    "poolIndex": pool_index,
                    "poolOperator": pool_operator,
                    "operator": relation if member_index == 0 else None,
                }
            pool_index += 1
            position = end + 1
        if sorted(seen) != list(range(node_count)):
            missing = sorted(set(range(node_count)) - set(seen))
            return None, f"compute没有引用节点：{', '.join(map(str, missing))}"
        if seen != list(range(node_count)):
            return None, "compute中的节点顺序与list不一致"
        return context, None

    @staticmethod
    def _path_value(source: Any, path: str) -> Any:
        current = source
        for segment in str(path or "").split("."):
            if not segment:
                continue
            if not isinstance(current, dict) or segment not in current:
                return MISSING
            current = current[segment]
        return current

    @classmethod
    def _diff_paths(cls, expected: Any, actual: Any, path: str = "") -> list[str]:
        if type(expected) is not type(actual):
            return [path or "节点"]
        if isinstance(expected, dict):
            paths: list[str] = []
            for key in sorted(set(expected) | set(actual)):
                child = f"{path}.{key}" if path else key
                if key not in expected or key not in actual:
                    paths.append(child)
                else:
                    paths.extend(cls._diff_paths(expected[key], actual[key], child))
            return paths
        if isinstance(expected, list):
            if len(expected) != len(actual):
                return [path or "节点"]
            paths: list[str] = []
            for index, (left, right) in enumerate(zip(expected, actual)):
                paths.extend(cls._diff_paths(left, right, f"{path}[{index}]"))
            return paths
        return [] if expected == actual else [path or "节点"]

    @staticmethod
    def _unsupported_parameter(
        index: int,
        package_name: str,
        path: str,
        value: Any,
        reason: str,
    ) -> dict[str, Any]:
        return {
            "nodeIndex": index + 1 if index >= 0 else 0,
            "packageType": package_name,
            "path": path,
            "value": None if value is MISSING else copy.deepcopy(value),
            "reason": reason,
        }

    @staticmethod
    def _dedupe_unsupported_parameters(
        values: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        unique: list[dict[str, Any]] = []
        seen: set[tuple[Any, ...]] = set()
        for value in values:
            key = (
                value.get("nodeIndex"),
                value.get("packageType"),
                value.get("path"),
                value.get("reason"),
            )
            if key not in seen:
                seen.add(key)
                unique.append(value)
        return unique
