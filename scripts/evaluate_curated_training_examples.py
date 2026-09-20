"""Live regression for user-confirmed JSON-to-language AI training examples.

The source crowd package remains the semantic authority.  Each fixed and
dynamic utterance is sent to the configured model, compiled by the production
backend, and compared after removing non-semantic import metadata.
"""

from __future__ import annotations

import copy
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from cdp_backend.business_date import resolve_business_period
from scripts.evaluate_ai_reasoning import find_service


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES_PATH = ROOT / "ai_training_examples.json"
OUTPUT_DIR = ROOT / "AI对话导出"


def load_examples() -> list[dict[str, Any]]:
    payload = json.loads(EXAMPLES_PATH.read_text(encoding="utf-8"))
    examples = payload.get("examples") or []
    if not isinstance(examples, list):
        raise ValueError("ai_training_examples.json中的examples必须是数组")
    return [item for item in examples if isinstance(item, dict)]


def semantic_package(value: object) -> dict[str, Any]:
    """Keep fields that change the engine audience semantics."""

    def compact(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: compact(item)
                for key, item in value.items()
                if item is not None
            }
        if isinstance(value, list):
            return [compact(item) for item in value]
        return value

    payload = value if isinstance(value, dict) else {}
    items = []
    for raw in payload.get("list") or []:
        if not isinstance(raw, dict):
            continue
        item = {
            "selectionLv1": copy.deepcopy(raw.get("selectionLv1")),
            "selectionLv3": compact(copy.deepcopy(raw.get("selectionLv3"))),
            "fromPoolId": raw.get("fromPoolId", 0),
        }
        selection_lv2 = raw.get("selectionLv2")
        if selection_lv2 is not None:
            item["selectionLv2"] = compact(copy.deepcopy(selection_lv2))
        items.append(item)
    return {"list": items, "compute": payload.get("compute")}


def expected_intent(example: dict[str, Any], period: str | None) -> dict[str, Any]:
    intent = copy.deepcopy(example.get("canonicalIntent") or {})
    if period:
        start, end = resolve_business_period(period)
        for condition in intent.get("conditions") or []:
            if not isinstance(condition, dict):
                continue
            condition["dateRange"] = [start.isoformat(), end.isoformat()]
            condition.pop("recentDays", None)
    return intent


def case_specs(example: dict[str, Any]) -> list[dict[str, Any]]:
    cases = [
        {"variant": f"固定表达{index}", "utterance": utterance, "period": None}
        for index, utterance in enumerate(
            example.get("naturalLanguageVariants") or [], start=1
        )
        if str(utterance or "").strip()
    ]
    for index, item in enumerate(
        example.get("dynamicNaturalLanguageVariants") or [], start=1
    ):
        if not isinstance(item, dict) or not str(item.get("utterance") or "").strip():
            continue
        cases.append(
            {
                "variant": f"动态周期{index}",
                "utterance": str(item["utterance"]),
                "period": str(item.get("period") or "") or None,
                "followUp": str(item.get("clarificationFollowUp") or "").strip()
                or None,
            }
        )
    return cases


def compact_node(node: dict[str, Any]) -> dict[str, Any]:
    form = node.get("formData") or {}
    return {
        "component": node.get("packageType"),
        "behaviors": form.get("bhv"),
        "categories": form.get("leafCates"),
        "brands": form.get("stdBrand"),
        "channels": form.get("channel"),
        "titleKeywords": form.get("title"),
        "itemPrice": form.get("itemprice"),
        "dateRange": (form.get("time") or {}).get("dateRange"),
    }


def evaluate_case(
    service: Any,
    example: dict[str, Any],
    case: dict[str, Any],
) -> dict[str, Any]:
    intent = expected_intent(example, case.get("period"))
    expected = service.compiler.compile(intent)
    expected_generated = expected.get("generated") or {}
    started = time.perf_counter()
    initial_result = service.chat({"message": case["utterance"], "history": []})
    result = initial_result
    initial_plan = initial_result.get("plan") or {}
    follow_up = str(case.get("followUp") or "").strip()
    clarification_handled = True
    turn_count = 1
    if follow_up:
        questions = initial_plan.get("questions") or []
        clarification_handled = (
            initial_plan.get("status") == "needs_clarification"
            and any(
                str(question.get("field") or "") == "behaviors"
                or "行为" in str(question.get("prompt") or "")
                for question in questions
                if isinstance(question, dict)
            )
        )
        result = service.chat(
            {
                "message": follow_up,
                "history": [
                    {"role": "user", "content": case["utterance"]},
                    {
                        "role": "assistant",
                        "content": str(initial_result.get("reply") or ""),
                    },
                ],
                "currentIntent": initial_result.get("intent"),
                "currentWorkflow": initial_result.get("workflow"),
                "currentOperation": initial_result.get("operation"),
                "pendingQuestions": questions,
            }
        )
        turn_count = 2
    elapsed = round(time.perf_counter() - started, 2)
    plan = result.get("plan") or {}
    actual_generated = plan.get("generated") or {}
    actual_nodes = plan.get("nodes") or []
    expected_nodes = expected.get("nodes") or []
    source_package = example.get("sourcePackage")
    source_package_matches = True
    if isinstance(source_package, dict):
        source_package_matches = semantic_package(source_package) == semantic_package(
            service.compiler.compile(example.get("canonicalIntent") or {}).get(
                "generated"
            )
        )
    checks = {
        "ready": plan.get("status") == "ready",
        "nodeSemantics": [compact_node(item) for item in actual_nodes]
        == [compact_node(item) for item in expected_nodes],
        "generatedMatchesExpected": semantic_package(actual_generated)
        == semantic_package(expected_generated),
        "sourcePackageMatchesCompiler": source_package_matches,
        "notMisclassifiedAsPublicSolution": not bool(plan.get("matchedSolution")),
        "clarificationHandled": clarification_handled,
    }
    return {
        "exampleId": example.get("id"),
        "variant": case["variant"],
        "utterance": case["utterance"],
        "period": case.get("period"),
        "followUp": follow_up or None,
        "turnCount": turn_count,
        "elapsedSeconds": elapsed,
        "initialStatus": initial_plan.get("status"),
        "initialReply": initial_result.get("reply"),
        "status": plan.get("status"),
        "reply": result.get("reply"),
        "checks": checks,
        "passed": all(checks.values()),
        "questions": plan.get("questions") or [],
        "actualIntent": result.get("intent"),
        "actualGenerated": actual_generated,
        "expectedGenerated": expected_generated,
    }


def markdown_report(payload: dict[str, Any]) -> str:
    runs = payload["runs"]
    passed = sum(1 for row in runs if row["passed"])
    lines = [
        "# 用户确认人群包 · AI训练回归",
        "",
        f"- 测试时间：{payload['createdAt']}",
        f"- 当前模型：{payload['modelStatus'].get('model')}",
        f"- 训练样本：{payload['exampleCount']} 个；自然语言：{len(runs)} 条",
        f"- 全项通过：{passed}/{len(runs)}",
        "",
        "| # | 表达 | 轮次 | 耗时 | 追问正确 | 可执行 | 节点一致 | JSON一致 | 源包可复现 | 未误命中方案 | 结果 |",
        "|---:|---|---:|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|",
    ]
    mark = lambda value: "✓" if value else "✗"
    for index, row in enumerate(runs, start=1):
        checks = row["checks"]
        lines.append(
            f"| {index} | {row['variant']} | {row.get('turnCount', 1)} | {row['elapsedSeconds']:.2f}s | "
            f"{mark(checks['clarificationHandled'])} | {mark(checks['ready'])} | {mark(checks['nodeSemantics'])} | "
            f"{mark(checks['generatedMatchesExpected'])} | "
            f"{mark(checks['sourcePackageMatchesCompiler'])} | "
            f"{mark(checks['notMisclassifiedAsPublicSolution'])} | "
            f"{'通过' if row['passed'] else '失败'} |"
        )
    lines.extend(["", "## 逐条记录", ""])
    for index, row in enumerate(runs, start=1):
        lines.extend(
            [
                f"### {index}. {row['variant']} · {'通过' if row['passed'] else '失败'}",
                "",
                f"- 自然语言：{row['utterance']}",
                f"- 对话轮次：{row.get('turnCount', 1)}",
                f"- 第一轮状态：{row.get('initialStatus')}",
                f"- 第一轮回复：{row.get('initialReply') or ''}",
                f"- 用户补充：{row.get('followUp') or '无'}",
                f"- 解析状态：{row.get('status')}",
                f"- AI回复：{row.get('reply') or ''}",
                f"- 检查结果：{json.dumps(row['checks'], ensure_ascii=False)}",
            ]
        )
        if row.get("questions"):
            lines.append(
                f"- 仍需确认：{json.dumps(row['questions'], ensure_ascii=False)}"
            )
        lines.append("")
    lines.extend(
        [
            "## 说明",
            "",
            "`JSON一致`忽略人群名称和原始导入文件里的空值/状态元数据，只比较真正影响圈选结果的组件、参数、ID、日期及交并差表达式。完整模型意图和两份JSON保存在同名原始记录中。",
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
        "exampleCount": len(examples),
        "runs": [],
    }
    total = sum(len(case_specs(example)) for example in examples)
    print(
        json.dumps(
            {
                "event": "start",
                "examples": len(examples),
                "cases": total,
                "model": payload["modelStatus"].get("model"),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    for example in examples:
        for case in case_specs(example):
            try:
                row = evaluate_case(service, example, case)
            except Exception as exc:  # noqa: BLE001 - record provider/compiler failures
                row = {
                    "exampleId": example.get("id"),
                    "variant": case["variant"],
                    "utterance": case["utterance"],
                    "period": case.get("period"),
                    "elapsedSeconds": 0,
                    "status": "error",
                    "reply": "",
                    "checks": {},
                    "passed": False,
                    "questions": [],
                    "error": f"{type(exc).__name__}: {exc}",
                }
            payload["runs"].append(row)
            print(
                json.dumps(
                    {
                        "event": "case",
                        "index": len(payload["runs"]),
                        "total": total,
                        "variant": row["variant"],
                        "passed": row["passed"],
                        "elapsedSeconds": row["elapsedSeconds"],
                        "checks": row["checks"],
                        "error": row.get("error"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_text = json.dumps(payload, ensure_ascii=False, indent=2)
    report_text = markdown_report(payload)
    for path in (
        OUTPUT_DIR / f"AI训练样本回归_{timestamp}.json",
        OUTPUT_DIR / "AI训练样本回归_最新.json",
    ):
        path.write_text(raw_text, encoding="utf-8")
    for path in (
        OUTPUT_DIR / f"AI训练样本回归_{timestamp}.md",
        OUTPUT_DIR / "AI训练样本回归_最新.md",
    ):
        path.write_text(report_text, encoding="utf-8")
    passed = sum(1 for row in payload["runs"] if row["passed"])
    print(
        json.dumps(
            {
                "event": "complete",
                "passed": passed,
                "total": len(payload["runs"]),
                "report": str(OUTPUT_DIR / "AI训练样本回归_最新.md"),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
