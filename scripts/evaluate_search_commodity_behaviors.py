"""Live Flash regression for keyword-search intersected with all commodity behaviors."""

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
OUTPUT_DIR = ROOT / "AI对话导出"
EXAMPLES_PATH = ROOT / "ai_training_examples.json"
SOURCE_EXAMPLE_ID = "private-search-dior-official-store-purchase-week1-202509"
DATE_RANGE = ["2025-09-01", "2025-09-07"]
BEHAVIORS = [
    ("浏览", "看过", "16625#|#VIEW_ITEM"),
    ("收藏", "收藏过", "16646#|#COLLECT_ITEM"),
    ("加购", "加过购物车", "16667#|#CART"),
    ("预售", "预购过", "16688#|#PREPAY"),
    ("购买", "买过", "16709#|#PAY"),
    ("退款", "退过款", "16723#|#REFUND"),
]


def source_purchase_package() -> dict[str, Any]:
    payload = json.loads(EXAMPLES_PATH.read_text(encoding="utf-8"))
    example = next(
        item
        for item in payload.get("examples") or []
        if item.get("id") == SOURCE_EXAMPLE_ID
    )
    return example["sourcePackage"]


def expected_intent(behavior: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "audienceName": f"2025年9月第1周搜索迪奥{behavior}_副本",
        "conditions": [
            {
                "component": "关键词搜索",
                "searchKeywords": ["迪奥"],
                "dateRange": DATE_RANGE,
            },
            {
                "relation": "intersect",
                "component": "商品行为",
                "scope": "own_store",
                "brand": "Dior",
                "canUseBrandAccount": True,
                "behaviors": [behavior],
                "channels": ["天猫"],
                "dateRange": DATE_RANGE,
            },
        ],
    }


def case_specs(behavior: str, colloquial: str) -> list[dict[str, Any]]:
    return [
        {
            "variant": "完整业务表达",
            "utterance": (
                f"圈2025年9月1日至7日在首页精准搜索过迪奥，并在Dior官旗{behavior}"
                "任意商品的人；我可以使用Dior官旗账号。"
            ),
            "permissionExpected": False,
        },
        {
            "variant": "自然口语",
            "utterance": (
                "我能登录迪奥官旗，找2025年9月第一周在首页搜过迪奥，"
                f"而且在店里{colloquial}任意商品的人。"
            ),
            "permissionExpected": False,
        },
        {
            "variant": "包名直输",
            "utterance": f"2025年9月第1周搜索迪奥{behavior}_副本",
            "permissionExpected": False,
        },
    ]


def prepared_generated(service: Any, intent: dict[str, Any]) -> dict[str, Any]:
    executable = copy.deepcopy(intent)
    conditions = executable.get("conditions") or []
    if len(conditions) > 1 and isinstance(conditions[1], dict):
        conditions[1]["canUseBrandAccount"] = True
    return service.compiler.compile(executable).get("generated") or {}


def intent_checks(intent: dict[str, Any], behavior: str) -> dict[str, bool]:
    conditions = [item for item in intent.get("conditions") or [] if isinstance(item, dict)]
    if len(conditions) != 2:
        return {
            "twoNodeIntersection": False,
            "searchKeyword": False,
            "behaviorPreserved": False,
            "officialStoreScope": False,
            "dateRange": False,
        }
    search, commodity = conditions
    return {
        "twoNodeIntersection": search.get("component") == "关键词搜索"
        and commodity.get("component") == "商品行为"
        and commodity.get("relation") == "intersect",
        "searchKeyword": search.get("searchKeywords") == ["迪奥"],
        "behaviorPreserved": commodity.get("behaviors") == [behavior],
        "officialStoreScope": commodity.get("scope") == "own_store"
        and str(commodity.get("brand") or "").lower() == "dior"
        and commodity.get("channels") == ["天猫"],
        "dateRange": search.get("dateRange") == DATE_RANGE
        and commodity.get("dateRange") == DATE_RANGE,
    }


def evaluate_case(
    service: Any,
    behavior: str,
    behavior_id: str,
    case: dict[str, Any],
    purchase_source: dict[str, Any],
) -> dict[str, Any]:
    started = time.perf_counter()
    result = service.chat({"message": case["utterance"], "history": []})
    elapsed = round(time.perf_counter() - started, 2)
    plan = result.get("plan") or {}
    intent = result.get("intent") or {}
    questions = plan.get("questions") or []
    permission_prompted = any(
        "canUseBrandAccount" in str(item.get("field") or "")
        for item in questions
        if isinstance(item, dict)
    )
    if case["permissionExpected"]:
        generated = prepared_generated(service, intent)
        status_ok = plan.get("status") == "needs_clarification" and permission_prompted
    else:
        generated = plan.get("generated") or {}
        status_ok = plan.get("status") == "ready" and not questions

    expected_generated = service.compiler.compile(expected_intent(behavior)).get("generated") or {}
    behavior_node = (generated.get("list") or [{}, {}])[1]
    form = behavior_node.get("selectionLv3") or {}
    checks = {
        "statusAndPermission": status_ok,
        **intent_checks(intent, behavior),
        "behaviorId": form.get("bhv") == [behavior_id],
        "channelId": behavior_node.get("selectionLv2") == ["16612#|#4"],
        "shopId": form.get("shop") == "376414317#|#376414317",
        "allProducts": form.get("cate") == "ALL",
        "generatedMatchesExpected": semantic_package(generated)
        == semantic_package(expected_generated),
        "purchaseMatchesUserSource": behavior != "购买"
        or semantic_package(generated) == semantic_package(purchase_source),
        "notMisclassifiedAsPublicSolution": not bool(result.get("matchedSolution")),
    }
    return {
        "behavior": behavior,
        "variant": case["variant"],
        "utterance": case["utterance"],
        "sourceJsonWasSentToModel": False,
        "elapsedSeconds": elapsed,
        "status": plan.get("status"),
        "reply": result.get("reply"),
        "questions": questions,
        "intent": intent,
        "generated": generated,
        "expectedGenerated": expected_generated,
        "checks": checks,
        "passed": all(checks.values()),
    }


def markdown_report(payload: dict[str, Any]) -> str:
    rows = payload["runs"]
    passed = sum(1 for row in rows if row["passed"])
    lines = [
        "# 搜索与商品行为 · 六行为 Flash 回归",
        "",
        f"- 测试时间：{payload['createdAt']}",
        f"- 模型：{payload['modelStatus'].get('model')}",
        "- 测试范围：浏览、收藏、加购、预售、购买、退款；每种包含完整表达、自然口语和包名直输。",
        "- 测试方法：源JSON不发送给模型；模型返回后再与编译器标准结果比较。",
        f"- 通过：{passed}/{len(rows)}",
        "",
        "| 行为 | 表达 | 状态 | 行为ID | JSON一致 | 耗时 | 结果 |",
        "|---|---|---|:---:|:---:|---:|:---:|",
    ]
    for row in rows:
        checks = row["checks"]
        lines.append(
            f"| {row['behavior']} | {row['variant']} | {row['status']} | "
            f"{'✓' if checks.get('behaviorId') else '✗'} | "
            f"{'✓' if checks.get('generatedMatchesExpected') else '✗'} | "
            f"{row['elapsedSeconds']:.2f}s | {'通过' if row['passed'] else '失败'} |"
        )
    lines.extend(
        [
            "",
            "## 权限口径",
            "",
            "Dior官旗账号已经登记为当前用户可用；完整表达、自然口语和包名直输都应直接生成，不得重复询问账号权限。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    service = find_service()
    purchase_source = source_purchase_package()
    payload: dict[str, Any] = {
        "createdAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "modelStatus": service.model_client.status(),
        "runs": [],
    }
    total = len(BEHAVIORS) * 3
    for behavior, colloquial, behavior_id in BEHAVIORS:
        for case in case_specs(behavior, colloquial):
            try:
                row = evaluate_case(
                    service, behavior, behavior_id, case, purchase_source
                )
            except Exception as exc:  # noqa: BLE001 - record provider failures
                row = {
                    "behavior": behavior,
                    "variant": case["variant"],
                    "utterance": case["utterance"],
                    "status": "error",
                    "checks": {},
                    "passed": False,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            payload["runs"].append(row)
            print(
                json.dumps(
                    {
                        "index": len(payload["runs"]),
                        "total": total,
                        "behavior": behavior,
                        "variant": case["variant"],
                        "status": row.get("status"),
                        "passed": row.get("passed"),
                        "failedChecks": [
                            key
                            for key, value in (row.get("checks") or {}).items()
                            if not value
                        ],
                        "error": row.get("error"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    latest_json = OUTPUT_DIR / "搜索商品行为全行为回归_最新.json"
    latest_md = OUTPUT_DIR / "搜索商品行为全行为回归_最新.md"
    encoded = json.dumps(payload, ensure_ascii=False, indent=2)
    report = markdown_report(payload)
    latest_json.write_text(encoded, encoding="utf-8")
    latest_md.write_text(report, encoding="utf-8")
    (OUTPUT_DIR / f"搜索商品行为全行为回归_{stamp}.json").write_text(
        encoded, encoding="utf-8"
    )
    (OUTPUT_DIR / f"搜索商品行为全行为回归_{stamp}.md").write_text(
        report, encoding="utf-8"
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
