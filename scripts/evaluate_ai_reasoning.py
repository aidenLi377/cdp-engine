"""Run a small live quality probe against the configured AI model.

This script deliberately avoids printing credentials or full provider payloads.
It is intended for manual regression checks while tuning the audience assistant.
"""

from __future__ import annotations

import json
import time
from typing import Any

from app import app
from cdp_backend.ai_chat_service import AiChatService


def find_service() -> AiChatService:
    for view in app.view_functions.values():
        for cell in view.__closure__ or ():
            value = cell.cell_contents
            if isinstance(value, AiChatService):
                return value
    raise RuntimeError("AiChatService was not found")


def node_summary(node: dict[str, Any]) -> dict[str, Any]:
    form = node.get("formData") or {}
    return {
        "component": node.get("packageType"),
        "operator": node.get("operator"),
        "behaviors": form.get("bhv"),
        "categories": form.get("leafCates"),
        "brands": form.get("stdBrand"),
        "productIds": form.get("item"),
        "timeMode": (node.get("modeData") or {}).get("time"),
        "time": form.get("time"),
    }


def result_summary(result: dict[str, Any], elapsed: float) -> dict[str, Any]:
    plan = result.get("plan") or {}
    operation = result.get("operation") or {}
    return {
        "elapsedSeconds": round(elapsed, 2),
        "reply": result.get("reply"),
        "status": plan.get("status"),
        "workflow": (result.get("workflow") or {}).get("title"),
        "questions": [item.get("prompt") for item in plan.get("questions") or []],
        "nodes": [node_summary(node) for node in plan.get("nodes") or []],
        "compute": (plan.get("generated") or {}).get("compute"),
        "operation": {
            "action": operation.get("action"),
            "crowdNames": operation.get("crowdNames"),
            "tagNames": operation.get("tagNames"),
            "tagSelectionConfirmed": operation.get("tagSelectionConfirmed"),
        }
        if operation
        else None,
    }


def run_case(
    service: AiChatService,
    name: str,
    message: str,
    *,
    history: list[dict[str, str]] | None = None,
) -> None:
    started = time.perf_counter()
    try:
        result = service.chat({"message": message, "history": history or []})
        summary = result_summary(result, time.perf_counter() - started)
        print(json.dumps({"case": name, "ok": True, **summary}, ensure_ascii=False), flush=True)
    except Exception as exc:  # noqa: BLE001 - diagnostic runner must continue
        print(
            json.dumps(
                {
                    "case": name,
                    "ok": False,
                    "elapsedSeconds": round(time.perf_counter() - started, 2),
                    "error": f"{type(exc).__name__}: {exc}",
                },
                ensure_ascii=False,
            ),
            flush=True,
        )


def main() -> None:
    service = find_service()
    print(json.dumps({"modelStatus": service.model_client.status()}, ensure_ascii=False), flush=True)

    complex_prompt = (
        "用品类新客方案看海蓝之谜。分析类目选"
        "美容护肤/美体/精油>乳液/面霜；品牌核心类目选"
        "美容护肤/美体/精油>乳液/面霜、美容护肤/美体/精油>面部护理套装、"
        "美容护肤/美体/精油>化妆水/爽肤水；时间为近半年对比前半年。"
    )
    for run in range(1, 4):
        run_case(service, f"category_new_customer_repeat_{run}", complex_prompt)

    run_case(
        service,
        "product_id_without_account",
        "圈最近30天购买过商品ID 620081427636的人，我没有对应品牌账号。",
    )
    run_case(
        service,
        "own_store_unknown_permission",
        "圈Dior本店最近30天购买香水的人，但我还没有说明能否使用Dior账号。",
    )
    run_case(
        service,
        "both_browse_and_purchase",
        "圈最近30天既浏览过又购买过美容护肤/美体/精油>乳液/面霜的人。",
    )
    run_case(
        service,
        "dmp_inherits_names_and_defaults",
        "去达摩盘取画像，使用默认六项标签。",
        history=[
            {
                "role": "user",
                "content": "香水香氛风格调性_圈层意图扩量人群\n深层清洁与角质管理_全域种草拉新人群策略人群",
            },
            {"role": "assistant", "content": "这两行看起来是两个人群包名称。"},
        ],
    )


if __name__ == "__main__":
    main()
