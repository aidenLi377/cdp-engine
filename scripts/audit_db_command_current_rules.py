"""Audit the DB-command live run against the user's current business rules.

Historical E-column JSON remains visible, but eight corrected cases use the
confirmed rolling-period, category-scope, and channel/date semantics instead.
"""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import timedelta
from pathlib import Path

from cdp_backend.business_date import latest_selectable_date
from scripts.evaluate_db_command_cases import _compute_equivalent, _selectors


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "AI对话导出"
PROFILE = ROOT / "store_sales_category_profiles.json"
LIVE = OUTPUT / "DB命令全量AI回归_最新.json"
CORRECTED_ROWS = {13, 14, 16, 17, 18, 25, 26, 27}


def _categories(node: dict) -> list[str]:
    return list((node.get("selectionLv3") or {}).get("leafCates") or [])


def _brand(node: dict) -> list[str]:
    return list(((node.get("selectionLv3") or {}).get("extraFilters") or {}).get("stdBrand") or [])


def _date(node: dict) -> object:
    return (node.get("selectionLv3") or {}).get("dateValue")


def _cat_tokens(items: list[dict]) -> list[str]:
    return [f"{item['cateId']}#|#{item['cateId']}" for item in items]


def _profile_categories() -> tuple[list[str], list[str]]:
    profiles = json.loads(PROFILE.read_text(encoding="utf-8"))["profiles"]
    dior = next(item for item in profiles if "dior迪奥官方旗舰店" == item.get("storeName", "").casefold())
    return (
        _cat_tokens(dior["coreCategories"][:10]),
        _cat_tokens(dior["categoryGroups"]["彩妆"][:10]),
    )


def _period(days: int, offset: int = 0) -> dict[str, str]:
    end = latest_selectable_date() - timedelta(days=offset)
    start = end - timedelta(days=days - 1)
    return {"from": start.strftime("%Y%m%d"), "to": end.strftime("%Y%m%d")}


def _is_period(node: dict, days: int, offset: int = 0) -> bool:
    value = _date(node)
    return value == (_period(days, offset) if offset else str(days))


def _basic_public(nodes: list[dict]) -> bool:
    return all(
        node.get("selectionLv1") == ["COMMON_TOUCH", "PUBLIC_CATE_BHV"]
        and (node.get("selectionLv3") or {}).get("bhv") == ["18919#|#CATE_PUBLIC_PAY"]
        and ((node.get("selectionLv3") or {}).get("extraFilters") or {}).get("channel") == ["16772#|#4"]
        for node in nodes
    )


def _corrected_match(row: dict, all_cates: list[str], makeup: list[str]) -> tuple[bool, str]:
    number = row["row"]
    generated = row.get("generated") or {}
    source = deepcopy(row.get("sourcePackage") or {})
    nodes = generated.get("list") or []
    if row.get("planStatus") != "ready":
        return False, "未生成可执行方案"

    if number in {16, 17}:
        source["list"][1]["selectionLv3"]["dateValue"] = {"from": "20260801", "to": "20260831"}
        okay = _selectors(generated) == _selectors(source) and _compute_equivalent(generated.get("compute", ""), source.get("compute", ""))
        return okay, "旧E列购买期为YTD；按用户确认改为8月整月"
    if number == 18:
        source["list"][2]["selectionLv3"]["leafCates"] = makeup
        okay = _selectors(generated) == _selectors(source) and _compute_equivalent(generated.get("compute", ""), source.get("compute", ""))
        return okay, f"竞品为不指定品牌的彩妆大盘；口语彩妆按当前Dior销售源使用{len(makeup)}项"

    if not _basic_public(nodes):
        return False, "公域组件、购买行为或天猫渠道与当前业务规则不符"
    brand = ["29478"]
    if number == 13:
        okay = (
            len(nodes) == 3 and generated.get("compute") == "(0)n(1)d(2)"
            and [_categories(node) for node in nodes] == [makeup] * 3
            and [_brand(node) for node in nodes] == [[], brand, brand]
            and [_is_period(nodes[0], 180, 180), _is_period(nodes[1], 180), _is_period(nodes[2], 180, 180)] == [True] * 3
        )
        return okay, "流入＝前180天买类目 ∩ 近180天买Dior类目 − 前180天买Dior类目"
    if number == 14:
        okay = (
            len(nodes) == 3 and generated.get("compute") == "(0)n(1)d(2)"
            and [_categories(node) for node in nodes] == [makeup] * 3
            and [_brand(node) for node in nodes] == [brand, [], brand]
            and [_is_period(nodes[0], 180, 180), _is_period(nodes[1], 180), _is_period(nodes[2], 180)] == [True] * 3
            and all(((node.get("selectionLv3") or {}).get("extraFilters") or {}).get("itemprice") == {"op": "OPEN_OPEN"} for node in nodes)
        )
        return okay, "流出＝前180天买Dior类目 ∩ 近180天买类目 − 近180天买Dior类目；不继承旧价门槛"
    if number == 25:
        okay = (
            len(nodes) == 2 and generated.get("compute") == "(0)n(1)"
            and [_categories(node) for node in nodes] == [all_cates, all_cates]
            and [_brand(node) for node in nodes] == [brand, brand]
            and _is_period(nodes[0], 365) and _is_period(nodes[1], 365, 365)
        )
        return okay, "品牌老客＝全店销售额前十类目，近365天和前365天均购买"
    if number in {26, 27}:
        okay = (
            len(nodes) == 3
            and generated.get("compute") == ("(0)d(1)n(2)" if number == 26 else "(0)d(1)d(2)")
            and [_categories(node) for node in nodes] == [makeup, all_cates, makeup]
            and [_brand(node) for node in nodes] == [brand, brand, []]
            and _is_period(nodes[0], 365)
            and _is_period(nodes[1], 365, 365)
            and _is_period(nodes[2], 365, 365)
        )
        return okay, (
            f"品类老客/新客使用口语彩妆范围的{len(makeup)}个二级类目，"
            "排除品牌历史购买用全店前十；旧客保留历史品类购买，新客排除"
        )
    return False, "未定义业务修订规则"


def main() -> None:
    payload = json.loads(LIVE.read_text(encoding="utf-8"))
    all_cates, makeup = _profile_categories()
    audit = []
    for row in payload["runs"]:
        number = row["row"]
        if number in CORRECTED_ROWS:
            passed, basis = _corrected_match(row, all_cates, makeup)
            standard = "用户确认的新业务规则"
        else:
            passed = (
                row.get("planStatus") == "ready"
                and row.get("selectorsEqual") is True
                and row.get("computeEquivalent") is True
            )
            basis = "与历史E列选择器及计算表达式一致"
            standard = "历史E列JSON"
        audit.append({"row": number, "utterance": row["utterance"], "passed": passed, "standard": standard, "basis": basis})
    passed = sum(item["passed"] for item in audit)
    result = {
        "source": LIVE.name,
        "latestSelectableDate": latest_selectable_date().isoformat(),
        "cases": len(audit),
        "passed": passed,
        "historicalExact": sum(item["standard"] == "历史E列JSON" and item["passed"] for item in audit),
        "correctedRulePassed": sum(item["standard"] == "用户确认的新业务规则" and item["passed"] for item in audit),
        "runs": audit,
    }
    path = OUTPUT / "DB命令全量AI回归_当前规则审计_最新.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# DB命令表 · 当前业务规则审计",
        "",
        f"- 可选日期截止：{result['latestSelectableDate']}",
        f"- 通过：{passed}/{len(audit)}；旧E列直接一致：{result['historicalExact']}；按用户修订规则通过：{result['correctedRulePassed']}",
        "- 旧JSON不同不等于业务错误；下面逐行列明使用的判定标准。",
        "",
        "| 行 | 自然语言 | 判定标准 | 结果 | 校验依据 |",
        "|---:|---|---|:---:|---|",
    ]
    for item in audit:
        lines.append(f"| {item['row']} | {item['utterance']} | {item['standard']} | {'通过' if item['passed'] else '失败'} | {item['basis']} |")
    (OUTPUT / "DB命令全量AI回归_当前规则审计_最新.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "runs"}, ensure_ascii=False))
    for item in audit:
        if not item["passed"]:
            print(json.dumps(item, ensure_ascii=False))


if __name__ == "__main__":
    main()
