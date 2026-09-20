"""Run first-turn live regression against the verified DB command workbook corpus.

The workbook's E-column package is the oracle. The C-column utterance is sent
verbatim; missing account permission may correctly cause clarification.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path

from scripts.evaluate_ai_reasoning import find_service


ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = ROOT / "ai_db_command_cases.json"
OUTPUT_DIR = ROOT / "AI对话导出"


def _selectors(package: dict) -> list[dict]:
    return [
        {
            "selectionLv1": item.get("selectionLv1"),
            "selectionLv2": item.get("selectionLv2"),
            "selectionLv3": item.get("selectionLv3"),
        }
        for item in package.get("list") or []
    ]


def _compute_equivalent(actual: str, expected: str) -> bool:
    if actual == expected:
        return True
    # A union-only chain is associative: (0u1u2) and (0)u(1)u(2)
    # select the same audience. Never erase grouping for difference/intersection.
    if "u" in actual and "u" in expected and not re.search(r"[nd]", actual + expected):
        return re.sub(r"[()]", "", actual) == re.sub(r"[()]", "", expected)
    return False


def run(rows: set[int]) -> None:
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]
    service = find_service()
    results: list[dict] = []
    for case in cases:
        row = case["sourceRow"]
        if rows and row not in rows:
            continue
        started = time.monotonic()
        result = {"row": row, "utterance": case["naturalLanguage"]}
        try:
            response = service.chat({"message": case["naturalLanguage"]})
            plan = response.get("plan") or {}
            generated = plan.get("generated") or {}
            source = case["sourcePackage"]
            result.update(
                status=response.get("status"),
                planStatus=plan.get("status"),
                reply=response.get("reply"),
                questions=[item.get("prompt") for item in plan.get("questions") or []],
                matchedSolution=(plan.get("matchedSolution") or {}).get("name"),
                generatedNodeCount=len(generated.get("list") or []),
                sourceNodeCount=len(source.get("list") or []),
                selectorsEqual=(
                    _selectors(generated) == _selectors(source)
                    if generated else None
                ),
                computeEquivalent=(
                    _compute_equivalent(
                        str(generated.get("compute") or ""),
                        str(source.get("compute") or ""),
                    )
                    if generated else None
                ),
                generatedCompute=generated.get("compute"),
                sourceCompute=source.get("compute"),
                generatedComponents=[
                    item.get("packageType") for item in plan.get("nodes") or []
                ],
                generatedNodeSummary=[
                    {
                        "component": item.get("selectionLv1"),
                        "channel": item.get("selectionLv2"),
                        "date": (item.get("selectionLv3") or {}).get("dateValue"),
                        "behaviors": (item.get("selectionLv3") or {}).get("bhv"),
                        "categoryCount": len((item.get("selectionLv3") or {}).get("leafCates") or []),
                        "brand": ((item.get("selectionLv3") or {}).get("extraFilters") or {}).get("stdBrand"),
                        "shop": (item.get("selectionLv3") or {}).get("shop"),
                    }
                    for item in generated.get("list") or []
                ],
                generated=generated,
                sourcePackage=source,
            )
        except Exception as exc:  # Keep the remaining independent cases running.
            result.update(status="error", error=f"{type(exc).__name__}: {exc}")
        result["seconds"] = round(time.monotonic() - started, 2)
        results.append(result)
        print(json.dumps({key: value for key, value in result.items() if key not in {"generated", "sourcePackage"}}, ensure_ascii=True), flush=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    prefix = "DB命令全量AI回归" if not rows else "DB命令指定行AI回归"
    payload = {
        "createdAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "modelStatus": service.model_client.status(),
        "source": str(CASES_PATH.name),
        "businessRuleNote": "历史E列并非绝对真值；13–14、16–18、25–27行须按当前确认的业务规则复核。",
        "runs": results,
    }
    exact = sum(
        result.get("planStatus") == "ready"
        and result.get("selectorsEqual") is True
        and result.get("computeEquivalent") is True
        for result in results
    )
    lines = [
        "# DB命令表自然语言真实模型回归",
        "",
        f"- 运行时间：{payload['createdAt']}",
        f"- 覆盖：{len(results)} 条；与历史E列选择器及运算表达式完全一致：{exact}/{len(results)}",
        "- 历史E列不是绝对标准：日期、Dior彩妆/核心类目及品类老客已由用户修订；不一致不得直接算成模型错误，也不得直接算成通过。",
        "",
        "| 行 | 原始自然语言 | 状态 | 历史JSON逐字段对齐 | 问题/差异 |",
        "|---:|---|---|:---:|---|",
    ]
    for result in results:
        clean = lambda value: str(value or "").replace("|", "\\|").replace("\n", " ")
        aligned = result.get("selectorsEqual") is True and result.get("computeEquivalent") is True
        reason = result.get("error") or "；".join(result.get("questions") or [])
        if not aligned and not reason:
            reason = "历史选择器/运算不同；检查JSON详情和业务修订规则"
        lines.append(
            f"| {result['row']} | {clean(result['utterance'])} | {clean(result.get('planStatus') or result.get('status'))} | "
            f"{'是' if aligned else '否'} | {clean(reason)} |"
        )
    lines += ["", "完整回复、节点摘要、实际JSON和旧E列JSON保存在同名机器可读文件中。", ""]
    for suffix, contents in (("json", json.dumps(payload, ensure_ascii=False, indent=2)), ("md", "\n".join(lines))):
        (OUTPUT_DIR / f"{prefix}_{stamp}.{suffix}").write_text(contents, encoding="utf-8")
        (OUTPUT_DIR / f"{prefix}_最新.{suffix}").write_text(contents, encoding="utf-8")
    print(json.dumps({"event": "complete", "cases": len(results), "historicalExact": exact, "report": f"{prefix}_最新.md"}, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", nargs="*", type=int, default=[])
    args = parser.parse_args()
    run(set(args.rows))
