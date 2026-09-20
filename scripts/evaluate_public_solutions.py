"""Live regression suite for every published public audience solution.

The runner sends several natural-language phrasings per solution to the
currently configured model, compares the compiled plan against the published
solution, validates the final engine JSON, and writes a Chinese Markdown report
plus a machine-readable JSON record.

Credentials and raw provider payloads are intentionally never written.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from scripts.evaluate_ai_reasoning import find_service


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "AI对话导出"

CAT_A = "美容护肤/美体/精油>乳液/面霜"
CAT_B = "美容护肤/美体/精油>面部护理套装"
CAT_C = "美容护肤/美体/精油>化妆水/爽肤水"
OWN = "CPB/肌肤之钥"
COMPETITOR = "Shiseido/资生堂"
CORE = [CAT_A, CAT_B, CAT_C]


def date_value(start: str, end: str) -> dict[str, Any]:
    return {"dateRange": [start, end], "days": 30}


STANDARD = date_value("20260224", "20260308")
COMPARISON = date_value("20251001", "20251111")
LONG_STANDARD = date_value("20260227", "20260825")
FLOW_STANDARD = date_value("20260201", "20260731")
FLOW_COMPARISON = date_value("20250801", "20260131")


SPECS: dict[str, dict[str, Any]] = {
    "品类新客": {
        "fields": {
            "分析类目": [CAT_A],
            "品牌核心类目": CORE,
            "统计时间": STANDARD,
            "对比时间": COMPARISON,
            "品牌": [OWN],
        },
        "prompts": [
            (
                "精准字段版",
                f"用品类新客方案圈人：分析类目选{CAT_A}；品牌核心类目选{'、'.join(CORE)}；"
                f"品牌选{OWN}；统计时间2026年2月24日至3月8日，对比时间2025年10月1日至11月11日。",
            ),
            (
                "业务口语版",
                f"帮我找一批{CAT_A}的新客：2026/2/24到3/8买过{OWN}的这个类目，"
                f"但2025/10/1到11/11既没有买过{OWN}的核心类目（{'、'.join(CORE)}），也没买过这个分析类目。",
            ),
            (
                "倒序简写版",
                f"品牌{OWN}，老周期是2025-10-01~2025-11-11，新周期是2026-02-24~2026-03-08。"
                f"核心类目{'、'.join(CORE)}，目标分析类目{CAT_A}，圈品类拉新的人。",
            ),
        ],
    },
    "转牌新客": {
        "fields": {
            "统计时间": STANDARD,
            "对比时间": COMPARISON,
            "品牌核心类目": CORE,
            "分析类目": [CAT_A],
            "品牌": [OWN],
        },
        "prompts": [
            (
                "精准字段版",
                f"使用转牌新客方案。统计时间2026-02-24至2026-03-08，对比时间2025-10-01至2025-11-11；"
                f"品牌{OWN}，分析类目{CAT_A}，品牌核心类目{'、'.join(CORE)}。",
            ),
            (
                "业务口语版",
                f"找从别的牌子转来买{OWN}面霜的人：2月24日至3月8日买过{OWN}的{CAT_A}，"
                f"去年10月1日至11月11日买过这个类目但没买过{OWN}的核心类目{'、'.join(CORE)}。",
            ),
            (
                "倒序简写版",
                f"{CAT_A}转牌拉新，目标牌子{OWN}；对比期2025/10/01-11/11，统计期2026/02/24-03/08；"
                f"本牌核心范围={'、'.join(CORE)}。",
            ),
        ],
    },
    "同品类复购": {
        "fields": {
            "统计时间": STANDARD,
            "对比时间": COMPARISON,
            "品牌": [OWN],
            "分析类目": [CAT_A],
        },
        "prompts": [
            (
                "精准字段版",
                f"用同品类复购方案，品牌{OWN}，分析类目{CAT_A}；统计时间2026-02-24到2026-03-08，"
                "对比时间2025-10-01到2025-11-11。",
            ),
            (
                "业务口语版",
                f"圈出两个周期都买过{OWN}{CAT_A}的人，两个周期分别是2025年10月1日到11月11日、"
                "2026年2月24日到3月8日。",
            ),
            (
                "倒序简写版",
                f"{OWN}面霜复购人群：老周期2025/10/1-11/11，新周期2026/2/24-3/8，类目走正式路径{CAT_A}。",
            ),
        ],
    },
    "连带购买": {
        "fields": {
            "分析类目": [CAT_A],
            "品牌核心类目": CORE,
            "统计时间": STANDARD,
            "对比时间": COMPARISON,
            "品牌": [OWN],
        },
        "prompts": [
            (
                "精准字段版",
                f"使用连带购买方案：分析类目{CAT_A}，品牌核心类目{'、'.join(CORE)}，品牌{OWN}；"
                "统计时间2026-02-24至03-08，对比时间2025-10-01至11-11。",
            ),
            (
                "业务口语版",
                f"看{OWN}面霜的连带购买：今年2月24日到3月8日买过{CAT_A}，并且去年10月1日到11月11日"
                f"既买过{OWN}核心类目{'、'.join(CORE)}，又买过{CAT_A}的人。",
            ),
            (
                "倒序简写版",
                f"去年窗口2025/10/01-11/11，本牌{OWN}核心类目={'、'.join(CORE)}；"
                f"今年窗口2026/02/24-03/08，分析类目={CAT_A}。我要连带购买人群。",
            ),
        ],
    },
    "品牌老客": {
        "fields": {
            "分析类目": [CAT_A],
            "品牌核心类目": CORE,
            "统计时间": STANDARD,
            "对比时间": COMPARISON,
            "品牌": [OWN],
        },
        "prompts": [
            (
                "精准字段版",
                f"按品牌老客方案圈人，品牌{OWN}；分析类目{CAT_A}；品牌核心类目{'、'.join(CORE)}；"
                "统计时间2026-02-24到03-08，对比时间2025-10-01到11-11。",
            ),
            (
                "业务口语版",
                f"找{OWN}老客：2026年2月24日至3月8日买过{OWN}{CAT_A}，同时在2025年10月1日至11月11日"
                f"也买过{OWN}核心类目{'、'.join(CORE)}的人。",
            ),
            (
                "倒序简写版",
                f"老周期2025/10/01-11/11买过{OWN}的核心范围{'、'.join(CORE)}，"
                f"新周期2026/02/24-03/08又买{OWN}{CAT_A}，圈品牌存量老客。",
            ),
        ],
    },
    "共同浏览本品和竞品": {
        "fields": {"本品牌": [OWN], "竞品": [COMPETITOR], "统计时间": STANDARD, "类目": [CAT_A]},
        "prompts": [
            (
                "精准字段版",
                f"使用共同浏览本品和竞品方案：本品牌{OWN}，竞品{COMPETITOR}，类目{CAT_A}，"
                "统计时间2026-02-24至03-08。",
            ),
            (
                "业务口语版",
                f"帮我圈2月24日到3月8日在{CAT_A}里既浏览过{OWN}、又浏览过{COMPETITOR}的人。",
            ),
            (
                "倒序简写版",
                f"{CAT_A}，2026/02/24-03/08，竞牌{COMPETITOR}、本牌{OWN}，找同时看过两个牌子的人。",
            ),
        ],
    },
    "共同浏览后_购买本品": {
        "fields": {"类目": [CAT_A], "本品牌": [OWN], "竞品": [COMPETITOR], "统计时间": LONG_STANDARD},
        "prompts": [
            (
                "精准字段版",
                f"用共同浏览后_购买本品方案，类目{CAT_A}，本品牌{OWN}，竞品{COMPETITOR}，"
                "统计时间2026-02-27至2026-08-25。",
            ),
            (
                "业务口语版",
                f"圈2月27日到8月25日在{CAT_A}同时浏览过{OWN}和{COMPETITOR}，最后购买了{OWN}的人。",
            ),
            (
                "倒序简写版",
                f"2026/02/27-08/25，{CAT_A}，看过竞牌{COMPETITOR}也看过本牌{OWN}，并下单本牌。",
            ),
        ],
    },
    "共同浏览后_购买竞品": {
        "fields": {"类目": [CAT_A], "统计时间": LONG_STANDARD, "本品牌": [OWN], "竞品": [COMPETITOR]},
        "prompts": [
            (
                "精准字段版",
                f"按共同浏览后_购买竞品方案圈人，类目{CAT_A}，统计时间2026-02-27至08-25，"
                f"本品牌{OWN}，竞品{COMPETITOR}。",
            ),
            (
                "业务口语版",
                f"找2月27日到8月25日在{CAT_A}既看过{OWN}又看过{COMPETITOR}、最后买了{COMPETITOR}的人。",
            ),
            (
                "倒序简写版",
                f"{COMPETITOR}成交、{OWN}与它都浏览过；范围{CAT_A}，日期2026/02/27-08/25，圈这批竞品流失用户。",
            ),
        ],
    },
    "流出人群分析": {
        "fields": {"本品牌": [OWN], "统计时间": FLOW_STANDARD, "对比时间": FLOW_COMPARISON, "类目": [CAT_A]},
        "prompts": [
            (
                "精准字段版",
                f"使用流出人群分析方案：本品牌{OWN}，类目{CAT_A}；统计时间2026-02-01至07-31，"
                "对比时间2025-08-01至2026-01-31。",
            ),
            (
                "业务口语版",
                f"分析{OWN}{CAT_A}的流出人群：2025/8/1-2026/1/31买过本品牌，到了2026/2/1-7/31"
                "仍买这个类目但不再买{OWN}的人。",
            ),
            (
                "倒序简写版",
                f"新周期2026-02-01~07-31只买{CAT_A}没买{OWN}，老周期2025-08-01~2026-01-31买过{OWN}这个类目，圈流失。",
            ),
        ],
    },
    "流入人群分析": {
        "fields": {"本品牌": [OWN], "统计时间": FLOW_STANDARD, "对比时间": FLOW_COMPARISON, "类目": [CAT_A]},
        "prompts": [
            (
                "精准字段版",
                f"使用流入人群分析方案：本品牌{OWN}，类目{CAT_A}；统计时间2026-02-01至07-31，"
                "对比时间2025-08-01至2026-01-31。",
            ),
            (
                "业务口语版",
                f"分析{OWN}{CAT_A}的流入：2025/8/1-2026/1/31买过这个类目但没买{OWN}，"
                "2026/2/1-7/31转而购买{OWN}的人。",
            ),
            (
                "倒序简写版",
                f"新周期2026-02-01~07-31买了{OWN}{CAT_A}，老周期2025-08-01~2026-01-31买类目大盘但没买本牌，圈流入。",
            ),
        ],
    },
    "品类连带分析": {
        "fields": {"本类目": [CAT_A], "对比类目": [CAT_B], "时间": STANDARD, "品牌": []},
        "prompts": [
            (
                "精准字段版",
                f"用品类连带分析方案：本类目{CAT_A}，对比类目{CAT_B}，时间2026-02-24至03-08，不限品牌。",
            ),
            (
                "业务口语版",
                f"看2026年2月24日到3月8日买过{CAT_A}的人里，还有谁同时买了{CAT_B}，品牌不限。",
            ),
            (
                "倒序简写版",
                f"不限品牌，日期2026/02/24-03/08；B类目{CAT_B}与A类目{CAT_A}的交叉购买人群。",
            ),
        ],
    },
    "跨品类招新方向分析": {
        "fields": {"统计时间": STANDARD, "对比时间": COMPARISON, "品类": [CAT_A], "品牌": [OWN]},
        "prompts": [
            (
                "精准字段版",
                f"用跨品类招新方向分析方案，品牌{OWN}，品类{CAT_A}，统计时间2026-02-24至03-08，"
                "对比时间2025-10-01至11-11。",
            ),
            (
                "业务口语版",
                f"找{OWN}从其他品类招来的新客：2026/2/24-3/8买了{OWN}{CAT_A}，"
                "但2025/10/1-11/11没买过这个天猫类目的人。",
            ),
            (
                "倒序简写版",
                f"老周期2025-10-01~11-11排除{CAT_A}购买者，新周期2026-02-24~03-08保留{OWN}{CAT_A}购买者，分析跨品类拉新方向。",
            ),
        ],
    },
}


RELATION_TO_OPERATOR = {"start": None, "intersect": "n", "union": "u", "exclude": "d"}


def compact_date(value: Any) -> str:
    return re.sub(r"[^0-9]", "", str(value or ""))


def normalize_value(field_key: str, value: Any) -> Any:
    if field_key == "time" and isinstance(value, dict):
        result = copy.deepcopy(value)
        dates = result.get("dateRange") or []
        if len(dates) == 2:
            result["dateRange"] = [compact_date(dates[0]), compact_date(dates[1])]
        return result
    if isinstance(value, dict):
        return {key: normalize_value(field_key, item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return [normalize_value(field_key, item) for item in value]
    return value


def meaningful(value: Any) -> bool:
    if value in (None, "", [], {}):
        return False
    if isinstance(value, dict):
        return any(meaningful(item) for item in value.values())
    return True


def operators(nodes: list[dict[str, Any]]) -> list[Any]:
    return [node.get("operator") for node in nodes]


def shape(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "component": node.get("packageType"),
            "operator": node.get("operator"),
            "behaviors": (node.get("formData") or {}).get("bhv") or [],
        }
        for node in nodes
    ]


def expected_compute(nodes: list[dict[str, Any]]) -> str:
    if not nodes:
        return ""
    text = "(0)"
    for index, node in enumerate(nodes[1:], start=1):
        text += f"{node.get('operator') or 'n'}({index})"
    return text


def apply_custom_fields(solution: dict[str, Any], values: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = copy.deepcopy(solution.get("nodes") or [])
    by_id = {str(node.get("id") or ""): node for node in nodes}
    for field in solution.get("customFields") or []:
        name = str(field.get("name") or "")
        if name not in values:
            continue
        value = copy.deepcopy(values[name])
        for binding in field.get("bindings") or []:
            node = by_id.get(str(binding.get("nodeId") or ""))
            key = str(binding.get("fieldKey") or "")
            if node is not None and key:
                node.setdefault("formData", {})[key] = copy.deepcopy(value)
    return nodes


def engine_payload(service: Any, node: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {"_package": node.get("packageType")}
    meta = service.compiler.catalog.get_component(str(node.get("packageType") or ""))
    visibility = ((meta.get("runtime") or {}).get("visibilityMatrix") or {}) if isinstance(meta, dict) else {}
    behaviors = (node.get("formData") or {}).get("bhv") or []
    visible_keys = {"bhv"}
    for behavior in behaviors:
        visible_keys.update(visibility.get(behavior) or [])
    for key, value in (node.get("formData") or {}).items():
        # Match the workbench/compiler: fields hidden for the selected behavior
        # must not leak into JSON merely because an old saved node retained an
        # empty value for them (for example purchase frequency on browse nodes).
        if visibility and key not in visible_keys:
            continue
        if key == "time" and isinstance(value, dict):
            dates = value.get("dateRange") or []
            if len(dates) == 2:
                payload[key] = {
                    "min": "range",
                    "val": {"start": compact_date(dates[0]), "end": compact_date(dates[1])},
                }
            elif value.get("days"):
                payload[key] = {"min": "recent", "val": {"days": value.get("days")}}
            continue
        if key in {"frequency", "price", "itemprice", "dayFrequency"} and isinstance(value, dict):
            minimum, maximum = value.get("min"), value.get("max")
            payload[key] = {
                "min": "" if minimum is None else minimum,
                "max": "" if maximum is None else maximum,
            }
            continue
        if isinstance(value, list):
            if value:
                payload[key] = copy.deepcopy(value)
        elif value not in (None, ""):
            payload[key] = copy.deepcopy(value)
    return payload


def generate_expected(service: Any, nodes: list[dict[str, Any]], audience_name: str) -> dict[str, Any]:
    output: list[dict[str, Any]] = []
    for index, node in enumerate(nodes):
        generated = service.compiler.engine.generate_json(engine_payload(service, node))
        items = generated.get("list") or []
        if len(items) != 1:
            raise ValueError(f"节点 {index + 1} 未生成唯一 JSON 节点")
        item = copy.deepcopy(items[0])
        item["fromPoolId"] = index
        if index:
            item["op"] = "INIT"
        else:
            item.pop("op", None)
        output.append(item)
    return {"crowdName": audience_name, "list": output, "compute": expected_compute(nodes)}


def normalized_generated(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {
        "list": copy.deepcopy(value.get("list") or []),
        "compute": value.get("compute") or "",
    }


def json_usability(generated: Any, expected_node_count: int) -> tuple[bool, list[str]]:
    issues: list[str] = []
    if not isinstance(generated, dict):
        return False, ["generated 不是对象"]
    items = generated.get("list")
    if not isinstance(items, list) or len(items) != expected_node_count:
        issues.append(f"JSON 节点数应为 {expected_node_count}，实际为 {len(items) if isinstance(items, list) else '非数组'}")
        items = items if isinstance(items, list) else []
    if not generated.get("compute"):
        issues.append("缺少 compute")
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict) or not item.get("selectionLv1") or not item.get("selectionLv3"):
            issues.append(f"第 {index} 个 JSON 节点缺少 selectionLv1/selectionLv3")
            continue
        date_value_obj = (item.get("selectionLv3") or {}).get("dateValue") or {}
        for date_key in ("from", "to"):
            if date_key in date_value_obj and not re.fullmatch(r"\d{8}", str(date_value_obj[date_key])):
                issues.append(f"第 {index} 个节点日期 {date_key} 不是 YYYYMMDD")
    return not issues, issues


def fixed_fields_match(source_nodes: list[dict[str, Any]], actual_nodes: list[dict[str, Any]], solution: dict[str, Any]) -> tuple[bool, list[str]]:
    bound = {
        (str(binding.get("nodeId") or ""), str(binding.get("fieldKey") or ""))
        for field in solution.get("customFields") or []
        for binding in field.get("bindings") or []
    }
    issues: list[str] = []
    if len(source_nodes) != len(actual_nodes):
        return False, ["节点数量不同，无法逐项比较固定字段"]
    for index, (source, actual) in enumerate(zip(source_nodes, actual_nodes), start=1):
        source_id = str(source.get("id") or "")
        actual_form = actual.get("formData") or {}
        for key, expected in (source.get("formData") or {}).items():
            if (source_id, str(key)) in bound or key in {"title_type", "selectedGoodsType"} or not meaningful(expected):
                continue
            found = actual_form.get(key)
            if normalize_value(str(key), found) != normalize_value(str(key), expected):
                issues.append(f"节点{index}.{key} 固定值不一致：期望 {expected!r}，实际 {found!r}")
    return not issues, issues


def bindings_match(solution: dict[str, Any], expected_nodes: list[dict[str, Any]], actual_nodes: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    issues: list[str] = []
    if len(expected_nodes) != len(actual_nodes):
        return False, ["节点数量不同，无法逐项比较自定义字段"]
    expected_by_id = {str(node.get("id") or ""): (index, node) for index, node in enumerate(expected_nodes)}
    for field in solution.get("customFields") or []:
        name = str(field.get("name") or "")
        for binding in field.get("bindings") or []:
            source_id = str(binding.get("nodeId") or "")
            key = str(binding.get("fieldKey") or "")
            pair = expected_by_id.get(source_id)
            if pair is None:
                issues.append(f"自定义字段{name}绑定了不存在的节点 {source_id}")
                continue
            index, expected_node = pair
            expected = (expected_node.get("formData") or {}).get(key)
            actual = (actual_nodes[index].get("formData") or {}).get(key)
            if normalize_value(key, actual) != normalize_value(key, expected):
                issues.append(f"{name}→节点{index + 1}.{key} 不一致：期望 {expected!r}，实际 {actual!r}")
    return not issues, issues


def template_baseline_issues(solution: dict[str, Any]) -> list[str]:
    by_id = {str(node.get("id") or ""): node for node in solution.get("nodes") or []}
    issues: list[str] = []
    for field in solution.get("customFields") or []:
        default = field.get("defaultValue")
        name = str(field.get("name") or "")
        for binding in field.get("bindings") or []:
            node = by_id.get(str(binding.get("nodeId") or ""))
            key = str(binding.get("fieldKey") or "")
            if node is None:
                issues.append(f"{name} 绑定了不存在的节点")
                continue
            stored = (node.get("formData") or {}).get(key)
            if normalize_value(key, stored) != normalize_value(key, default):
                issues.append(f"{name} 默认值与节点 {key} 保存值不一致")
    return issues


def diff_summary(expected: Any, actual: Any, limit: int = 8) -> list[str]:
    differences: list[str] = []

    def walk(left: Any, right: Any, path: str) -> None:
        if len(differences) >= limit:
            return
        if type(left) is not type(right):
            differences.append(f"{path}: 类型 {type(left).__name__} != {type(right).__name__}")
            return
        if isinstance(left, dict):
            for key in sorted(set(left) | set(right)):
                if key not in left:
                    differences.append(f"{path}.{key}: 仅实际存在")
                elif key not in right:
                    differences.append(f"{path}.{key}: 实际缺失")
                else:
                    walk(left[key], right[key], f"{path}.{key}")
                if len(differences) >= limit:
                    return
        elif isinstance(left, list):
            if len(left) != len(right):
                differences.append(f"{path}: 长度 {len(left)} != {len(right)}")
            for index, (l_item, r_item) in enumerate(zip(left, right)):
                walk(l_item, r_item, f"{path}[{index}]")
                if len(differences) >= limit:
                    return
        elif left != right:
            differences.append(f"{path}: 期望 {left!r}，实际 {right!r}")

    walk(expected, actual, "generated")
    return differences


def evaluate_result(solution: dict[str, Any], expected_nodes: list[dict[str, Any]], expected_json: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    plan = result.get("plan") or {}
    actual_nodes = plan.get("nodes") or []
    matched = plan.get("matchedSolution") or {}
    generated = plan.get("generated") or {}

    hit = matched.get("id") == solution.get("id") or matched.get("name") == solution.get("name")
    ready = plan.get("status") == "ready"
    shape_ok = shape(actual_nodes) == shape(expected_nodes)
    fixed_ok, fixed_issues = fixed_fields_match(expected_nodes, actual_nodes, solution)
    binding_ok, binding_issues = bindings_match(solution, expected_nodes, actual_nodes)
    usable, usability_issues = json_usability(generated, len(expected_nodes))
    expected_normalized = normalized_generated(expected_json)
    actual_normalized = normalized_generated(generated)
    json_same = expected_normalized == actual_normalized
    exact_issues = [] if json_same else diff_summary(expected_normalized, actual_normalized)
    checks = {
        "solutionHit": hit,
        "planReady": ready,
        "nodeShapeSame": shape_ok,
        "fixedFieldsSame": fixed_ok,
        "customFieldsSame": binding_ok,
        "jsonUsable": usable,
        "jsonSameAsParameterizedSolution": json_same,
    }
    return {
        "checks": checks,
        "passed": all(checks.values()),
        "matchedSolution": matched or None,
        "status": plan.get("status"),
        "questions": plan.get("questions") or [],
        "reply": result.get("reply"),
        "actualShape": shape(actual_nodes),
        "expectedShape": shape(expected_nodes),
        "issues": fixed_issues + binding_issues + usability_issues + exact_issues,
        "generated": generated,
        "expectedGenerated": expected_json,
        "intent": result.get("intent"),
    }


def markdown_report(payload: dict[str, Any]) -> str:
    runs = payload["runs"]
    passed = sum(1 for row in runs if row.get("passed"))
    hit = sum(1 for row in runs if (row.get("checks") or {}).get("solutionHit"))
    usable = sum(1 for row in runs if (row.get("checks") or {}).get("jsonUsable"))
    exact = sum(1 for row in runs if (row.get("checks") or {}).get("jsonSameAsParameterizedSolution"))
    solution_names = {row["solution"] for row in runs}
    variant_stats = {}
    for variant in dict.fromkeys(row["variant"] for row in runs):
        rows = [row for row in runs if row["variant"] == variant]
        variant_stats[variant] = {
            "total": len(rows),
            "passed": sum(bool(row.get("passed")) for row in rows),
            "hit": sum(bool((row.get("checks") or {}).get("solutionHit")) for row in rows),
            "jsonSame": sum(bool((row.get("checks") or {}).get("jsonSameAsParameterizedSolution")) for row in rows),
        }

    lines = [
        "# 公共方案库 AI 自然语言回归调试记录",
        "",
        f"- 测试时间：{payload['createdAt']}",
        f"- 模型：{payload['modelStatus'].get('model') or payload['modelStatus'].get('configuredModel') or '未知'}",
        f"- 思考模式：{payload['modelStatus'].get('thinkingMode') or payload['modelStatus'].get('reasoningEffort') or '以系统配置为准'}",
        f"- 覆盖：{len(solution_names)} 个公共方案，{len(runs)} 种自然语言说法",
        f"- 全项通过：{passed}/{len(runs)}；命中正确方案：{hit}/{len(runs)}；JSON 可用：{usable}/{len(runs)}；与参数化方案 JSON 完全一致：{exact}/{len(runs)}",
        "",
        "## 判定口径",
        "",
        "每条用例同时检查：命中正确公共方案、计划进入可执行状态、组件/行为/交并差顺序一致、固定参数不丢失、自定义字段落入正确节点、最终 JSON 符合引擎导入格式，以及最终 JSON 与‘将本次自定义字段代入公共方案’后生成的基准 JSON 完全一致。只有七项全部通过才记为通过。",
        "",
        "## 关键结论",
        "",
    ]
    for variant, stats in variant_stats.items():
        lines.append(
            f"- {variant}：全项通过 {stats['passed']}/{stats['total']}，命中方案 {stats['hit']}/{stats['total']}，JSON 语义完全一致 {stats['jsonSame']}/{stats['total']}。"
        )
    lines.append(
        "- `JSON 可用`只表示格式能够交给引擎，不代表业务语义正确；应以`JSON 一致`与节点/参数检查作为上线门槛。"
    )
    if passed == len(runs):
        lines.append(
            "- 本轮未复现方案漏匹配、固定渠道漂移、统计期/对比期交换、品牌角色交换或A/B类目颠倒；三类表达均通过完整语义比对。"
        )
    else:
        lines.append(
            "- 请以逐条差异定位失败原因；可能是模型语义、业务规则变更或历史模板基线过期，不能把所有未通过都归因于方案漏匹配。"
        )
    lines.extend(
        [
            "",
        "## 总览",
        "",
        "| # | 公共方案 | 自然语言版本 | 耗时 | 命中 | 节点结构 | 自定义字段 | JSON可用 | JSON一致 | 结论 |",
        "|---:|---|---|---:|:---:|:---:|:---:|:---:|:---:|:---:|",
        ]
    )
    for index, row in enumerate(runs, start=1):
        checks = row.get("checks") or {}
        mark = lambda value: "✓" if value else "✗"
        lines.append(
            f"| {index} | {row['solution']} | {row['variant']} | {row.get('elapsedSeconds', 0):.2f}s | "
            f"{mark(checks.get('solutionHit'))} | {mark(checks.get('nodeShapeSame') and checks.get('fixedFieldsSame'))} | "
            f"{mark(checks.get('customFieldsSame'))} | {mark(checks.get('jsonUsable'))} | "
            f"{mark(checks.get('jsonSameAsParameterizedSolution'))} | {'通过' if row.get('passed') else '失败'} |"
        )

    baseline = payload.get("templateBaselineIssues") or {}
    if baseline:
        lines.extend(["", "## 公共方案基线问题", ""])
        for name, issues in baseline.items():
            lines.append(f"- {name}：{'；'.join(issues)}")

    lines.extend(["", "## 逐条调试记录", ""])
    for index, row in enumerate(runs, start=1):
        checks = row.get("checks") or {}
        lines.extend(
            [
                f"### {index}. {row['solution']} · {row['variant']} · {'通过' if row.get('passed') else '失败'}",
                "",
                f"- 我说的自然语言：{row['prompt']}",
                f"- 是否命中方案：{'是' if checks.get('solutionHit') else '否'}；实际命中：{(row.get('matchedSolution') or {}).get('name') or '无'}",
                f"- 最终状态：{row.get('status') or '异常'}；耗时：{row.get('elapsedSeconds', 0):.2f} 秒",
                f"- 节点/交并差是否一致：{'是' if checks.get('nodeShapeSame') and checks.get('fixedFieldsSame') else '否'}",
                f"- 自定义字段是否正确：{'是' if checks.get('customFieldsSame') else '否'}",
                f"- 最终 JSON 是否能用：{'是' if checks.get('jsonUsable') else '否'}",
                f"- 最终 JSON 是否与参数化后的公共方案一致：{'是' if checks.get('jsonSameAsParameterizedSolution') else '否'}",
                f"- 计算表达式：{(row.get('generated') or {}).get('compute') or '无'}",
            ]
        )
        if row.get("questions"):
            lines.append(f"- AI 追问：{json.dumps(row['questions'], ensure_ascii=False)}")
        if row.get("issues"):
            lines.append(f"- 差异/错误：{'；'.join(row['issues'])}")
        lines.append("")

    lines.extend(
        [
            "## 原始 JSON",
            "",
            f"每条用例的模型意图、实际最终 JSON、参数化方案基准 JSON 与逐字段差异，完整保存在 `{payload['rawFileName']}`。该文件不含 API Key。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--variants", type=int, default=3, choices=(1, 2, 3))
    parser.add_argument("--solution", action="append", default=[], help="Only run named solutions")
    args = parser.parse_args()

    service = find_service()
    model_status = service.model_client.status()
    solutions = service.solution_knowledge.solution_store.list_solutions(
        "published", "public", "ai-solution-regression"
    )
    by_name = {str(solution.get("name") or ""): solution for solution in solutions}
    selected_names = args.solution or list(SPECS)
    missing = [name for name in selected_names if name not in by_name]
    if missing:
        raise SystemExit(f"公共方案不存在：{', '.join(missing)}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = OUTPUT_DIR / f"公共方案AI自然语言回归_{timestamp}.json"
    report_path = OUTPUT_DIR / f"公共方案AI自然语言回归_{timestamp}.md"
    latest_raw_path = OUTPUT_DIR / "公共方案AI自然语言回归_最新.json"
    latest_report_path = OUTPUT_DIR / "公共方案AI自然语言回归_最新.md"

    template_issues = {
        name: issues
        for name in selected_names
        if (issues := template_baseline_issues(by_name[name]))
    }
    payload: dict[str, Any] = {
        "createdAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "modelStatus": model_status,
        "solutionCount": len(selected_names),
        "variantsPerSolution": args.variants,
        "templateBaselineIssues": template_issues,
        "rawFileName": raw_path.name,
        "runs": [],
    }
    print(json.dumps({"event": "start", "solutions": len(selected_names), "cases": len(selected_names) * args.variants, "model": model_status.get("model")}, ensure_ascii=False), flush=True)

    for solution_index, name in enumerate(selected_names, start=1):
        solution = by_name[name]
        spec = SPECS[name]
        expected_nodes = apply_custom_fields(solution, spec["fields"])
        if name == "流出人群分析":
            # The saved public example carried an unrequested ¥100 item-price
            # threshold. The confirmed business rule removes that restriction.
            for node in expected_nodes:
                (node.get("formData") or {})["itemprice"] = {"min": None, "max": None}
        try:
            expected_json = generate_expected(service, expected_nodes, str(solution.get("defaultCrowdName") or name))
            baseline_error = None
        except Exception as exc:  # noqa: BLE001 - baseline failure belongs in report
            expected_json = {}
            baseline_error = f"{type(exc).__name__}: {exc}"

        for variant_index, (variant, prompt) in enumerate(spec["prompts"][: args.variants], start=1):
            started = time.perf_counter()
            last_error = None
            result = None
            for attempt in range(1, 3):
                try:
                    result = service.chat({"message": prompt, "history": []})
                    break
                except Exception as exc:  # noqa: BLE001 - continue suite after one provider failure
                    last_error = f"{type(exc).__name__}: {exc}"
                    if attempt < 2:
                        time.sleep(1)
            elapsed = round(time.perf_counter() - started, 2)
            if result is None:
                row = {
                    "solution": name,
                    "solutionId": solution.get("id"),
                    "variant": variant,
                    "prompt": prompt,
                    "elapsedSeconds": elapsed,
                    "passed": False,
                    "checks": {},
                    "status": "provider_error",
                    "issues": [last_error or "未知调用错误"],
                    "generated": None,
                    "expectedGenerated": expected_json,
                }
            elif baseline_error:
                row = {
                    "solution": name,
                    "solutionId": solution.get("id"),
                    "variant": variant,
                    "prompt": prompt,
                    "elapsedSeconds": elapsed,
                    "passed": False,
                    "checks": {},
                    "status": "baseline_error",
                    "issues": [baseline_error],
                    "generated": (result.get("plan") or {}).get("generated"),
                    "expectedGenerated": None,
                    "intent": result.get("intent"),
                }
            else:
                row = {
                    "solution": name,
                    "solutionId": solution.get("id"),
                    "variant": variant,
                    "prompt": prompt,
                    "elapsedSeconds": elapsed,
                    **evaluate_result(solution, expected_nodes, expected_json, result),
                }
            payload["runs"].append(row)
            latest_raw_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            status_text = "PASS" if row.get("passed") else "FAIL"
            print(
                json.dumps(
                    {
                        "event": "case",
                        "index": len(payload["runs"]),
                        "total": len(selected_names) * args.variants,
                        "solution": name,
                        "variant": variant,
                        "result": status_text,
                        "elapsedSeconds": elapsed,
                        "checks": row.get("checks"),
                        "issues": (row.get("issues") or [])[:2],
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )

    raw_text = json.dumps(payload, ensure_ascii=False, indent=2)
    raw_path.write_text(raw_text, encoding="utf-8")
    latest_raw_path.write_text(raw_text, encoding="utf-8")
    report_text = markdown_report(payload)
    report_path.write_text(report_text, encoding="utf-8")
    latest_report_path.write_text(report_text, encoding="utf-8")
    passed = sum(1 for row in payload["runs"] if row.get("passed"))
    print(
        json.dumps(
            {
                "event": "done",
                "passed": passed,
                "total": len(payload["runs"]),
                "report": str(report_path),
                "raw": str(raw_path),
                "latestReport": str(latest_report_path),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
