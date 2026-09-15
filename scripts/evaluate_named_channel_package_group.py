"""Blind-test the confirmed Dior fragrance channel package-name series.

Only the crowd name is sent to the configured model. The original source JSON
is used afterwards as the comparison oracle and is never included in the model
request. The official-store variant is expected to stop for account-permission
confirmation; the other channel aggregates must be immediately executable.
"""

from __future__ import annotations

import copy
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from scripts.evaluate_ai_reasoning import find_service
from scripts.evaluate_curated_training_examples import semantic_package


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_PATH = ROOT / "ai_training_examples.json"
OUTPUT_DIR = ROOT / "AI对话导出"

CASES = [
    ("XT_2508香水搜索浏览ttl_副本", "private-search-dior-fragrance-browse-202508", False),
    ("XT_2508香水搜索浏览全球购_副本", "private-search-dior-fragrance-browse-global-purchase-202508", False),
    ("XT_2508香水搜索浏览天猫国际自营_副本", "private-search-dior-fragrance-browse-tmall-global-direct-202508", False),
    ("XT_2508香水搜索浏览天猫国际_副本", "private-search-dior-fragrance-browse-tmall-global-202508", False),
    ("XT_2508香水搜索浏览官旗_副本", "private-search-dior-official-store-fragrance-browse-202508", True),
    ("XT_2508香水搜索浏览淘宝集市_副本", "private-search-dior-fragrance-browse-taobao-marketplace-202508", False),
]


def load_examples() -> dict[str, dict[str, Any]]:
    payload = json.loads(EXAMPLES_PATH.read_text(encoding="utf-8"))
    return {
        str(item.get("id")): item
        for item in payload.get("examples") or []
        if isinstance(item, dict)
    }


def semantic_intent(value: object) -> list[dict[str, Any]]:
    payload = value if isinstance(value, dict) else {}
    normalized: list[dict[str, Any]] = []
    for item in payload.get("conditions") or []:
        if not isinstance(item, dict):
            continue
        component = item.get("component")
        fields = ["relation", "component", "dateRange"]
        if component == "关键词搜索":
            fields.append("searchKeywords")
        elif component == "商品行为":
            fields.extend(["scope", "brand", "behaviors", "categories", "channels"])
        normalized.append(
            {
                key: copy.deepcopy(item.get(key))
                for key in fields
                if item.get(key) is not None
            }
        )
    return normalized


def evaluate_case(service: Any, name: str, example: dict[str, Any], official: bool) -> dict[str, Any]:
    started = time.perf_counter()
    result = service.chat({"message": name, "history": []})
    elapsed = round(time.perf_counter() - started, 2)
    plan = result.get("plan") or {}
    actual_intent = result.get("intent") or {}
    expected_intent = example.get("canonicalIntent") or {}
    questions = plan.get("questions") or []

    if official:
        permission_prompted = any(
            "canUseBrandAccount" in str(question.get("field") or "")
            for question in questions
            if isinstance(question, dict)
        )
        executable_intent = copy.deepcopy(actual_intent)
        conditions = executable_intent.get("conditions") or []
        if len(conditions) > 1 and isinstance(conditions[1], dict):
            conditions[1]["canUseBrandAccount"] = True
        generated = service.compiler.compile(executable_intent).get("generated") or {}
        checks = {
            "correctStatus": plan.get("status") == "needs_clarification",
            "intentMatches": semantic_intent(actual_intent) == semantic_intent(expected_intent),
            "asksOnlyNecessaryPermission": permission_prompted,
            "generatedAfterPermissionMatchesSource": semantic_package(generated)
            == semantic_package(example.get("sourcePackage") or {}),
        }
    else:
        generated = plan.get("generated") or {}
        checks = {
            "correctStatus": plan.get("status") == "ready",
            "intentMatches": semantic_intent(actual_intent) == semantic_intent(expected_intent),
            "noRedundantQuestion": not questions,
            "generatedMatchesSource": semantic_package(generated)
            == semantic_package(example.get("sourcePackage") or {}),
        }

    return {
        "crowdName": name,
        "exampleId": example.get("id"),
        "modelInput": name,
        "sourceJsonWasSentToModel": False,
        "elapsedSeconds": elapsed,
        "status": plan.get("status"),
        "reply": result.get("reply"),
        "questions": questions,
        "actualIntent": actual_intent,
        "generated": generated,
        "expectedSourcePackage": example.get("sourcePackage"),
        "checks": checks,
        "passed": all(checks.values()),
    }


def markdown_report(payload: dict[str, Any]) -> str:
    rows = payload["runs"]
    passed = sum(1 for row in rows if row["passed"])
    lines = [
        "# 迪奥香水搜索浏览渠道系列 · 包名盲测",
        "",
        f"- 测试时间：{payload['createdAt']}",
        f"- 模型：{payload['modelStatus'].get('model')}",
        "- 测试方法：只把人群包名称发给模型，源JSON不进入模型上下文；返回后再逐字段比较。",
        f"- 通过：{passed}/{len(rows)}",
        "",
        "| 人群包名 | 状态 | 意图一致 | 最终JSON可用 | 耗时 | 结果 |",
        "|---|---|:---:|:---:|---:|:---:|",
    ]
    for row in rows:
        checks = row["checks"]
        json_check = checks.get("generatedMatchesSource", checks.get("generatedAfterPermissionMatchesSource"))
        lines.append(
            f"| {row['crowdName']} | {row['status']} | "
            f"{'✓' if checks.get('intentMatches') else '✗'} | "
            f"{'✓' if json_check else '✗'} | {row['elapsedSeconds']:.2f}s | "
            f"{'通过' if row['passed'] else '失败'} |"
        )
    lines.extend(
        [
            "",
            "## 判定说明",
            "",
            "- ttl、全球购、天猫国际直营、天猫国际、淘宝集市应直接生成可执行JSON。",
            "- 官旗必须先确认当前用户是否能使用DIOR官旗账号；确认后生成的JSON必须与源包一致。",
            "- 包名里的“天猫国际自营”按历史叫法解析，落到系统正式渠道“天猫国际直营”（16604#|#13）。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    service = find_service()
    examples = load_examples()
    payload: dict[str, Any] = {
        "createdAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "modelStatus": service.model_client.status(),
        "runs": [],
    }
    for index, (name, example_id, official) in enumerate(CASES, start=1):
        try:
            row = evaluate_case(service, name, examples[example_id], official)
        except Exception as exc:  # noqa: BLE001 - preserve provider failures in report
            row = {
                "crowdName": name,
                "exampleId": example_id,
                "sourceJsonWasSentToModel": False,
                "status": "error",
                "checks": {},
                "passed": False,
                "error": f"{type(exc).__name__}: {exc}",
            }
        payload["runs"].append(row)
        print(
            json.dumps(
                {
                    "index": index,
                    "total": len(CASES),
                    "crowdName": name,
                    "status": row.get("status"),
                    "passed": row.get("passed"),
                    "checks": row.get("checks"),
                    "error": row.get("error"),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    latest_json = OUTPUT_DIR / "渠道系列人群包名称盲测_最新.json"
    latest_md = OUTPUT_DIR / "渠道系列人群包名称盲测_最新.md"
    encoded = json.dumps(payload, ensure_ascii=False, indent=2)
    latest_json.write_text(encoded, encoding="utf-8")
    latest_md.write_text(markdown_report(payload), encoding="utf-8")
    (OUTPUT_DIR / f"渠道系列人群包名称盲测_{stamp}.json").write_text(encoded, encoding="utf-8")
    (OUTPUT_DIR / f"渠道系列人群包名称盲测_{stamp}.md").write_text(
        markdown_report(payload), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "passed": sum(1 for row in payload["runs"] if row["passed"]),
                "total": len(payload["runs"]),
                "report": str(latest_md),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
