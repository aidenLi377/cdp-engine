"""Build compact store core-category knowledge from the inspected sales report.

The source workbook is deliberately inspected separately with Artifact Tool. This
script consumes that normalized analysis and joins it to the live category
dimension so runtime AI prompts never need the raw spreadsheet.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_PATH = ROOT / ".tmp" / "store-trend-analysis" / "analysis.json"
CATEGORY_PATH = ROOT / "类目维表.csv"
OUTPUT_PATH = ROOT / "store_sales_category_profiles.json"


def normalize_store_name(value: str) -> str:
    value = str(value or "").strip().lower()
    value = re.sub(r"[\s/／\\_\-—·•（）()【】\[\]{}]+", "", value)
    for suffix in (
        "天猫国际官方直营",
        "海外旗舰店",
        "官方旗舰店",
        "旗舰店",
        "官方店",
        "专卖店",
        "专营店",
        "企业店",
        "淘宝店",
        "店铺",
    ):
        if value.endswith(suffix):
            value = value[: -len(suffix)]
            break
    return value


def load_category_ids() -> dict[str, str]:
    result: dict[str, str] = {}
    with CATEGORY_PATH.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            if str(row.get("适用的包") or "").strip() != "类目公域行为":
                continue
            category_path = str(row.get("类目名称") or "").strip()
            cate_id = str(row.get("cateId") or "").strip()
            if category_path and cate_id:
                result[category_path] = cate_id
    return result


def main() -> None:
    analysis = json.loads(ANALYSIS_PATH.read_text(encoding="utf-8"))
    category_ids = load_category_ids()
    profiles = []
    fully_mapped_count = 0

    for source_profile in analysis.get("storeProfiles") or []:
        core_categories = []
        for position, category in enumerate(
            source_profile.get("coreCategories")
            or source_profile.get("top90Categories")
            or [],
            start=1,
        ):
            category_path = str(category.get("categoryPath") or "").strip()
            cate_id = category_ids.get(category_path)
            core_categories.append(
                {
                    "rank": position,
                    "categoryPath": category_path,
                    "cateId": cate_id,
                    "salesAmount": round(float(category.get("salesAmount") or 0), 2),
                    "share": round(float(category.get("share") or 0), 8),
                    "cumulativeShare": round(
                        float(category.get("cumulativeShare") or 0), 8
                    ),
                }
            )

        fully_mapped = bool(core_categories) and all(
            item.get("cateId") for item in core_categories
        )
        if fully_mapped:
            fully_mapped_count += 1
        store_name = str(source_profile.get("storeName") or "").strip()
        profiles.append(
            {
                "storeName": store_name,
                "normalizedStoreName": normalize_store_name(store_name),
                "totalSalesAmount": round(
                    float(source_profile.get("totalSalesAmount") or 0), 2
                ),
                "allCategoryCount": int(source_profile.get("categoryCount") or 0),
                "coreCategoryCount": len(core_categories),
                "coveredShare": round(
                    float(source_profile.get("coveredShare") or 0), 8
                ),
                "fullyMapped": fully_mapped,
                "coreCategories": core_categories,
            }
        )

    payload = {
        "schemaVersion": 1,
        "source": {
            "fileName": analysis.get("source", {}).get("fileName"),
            "sheet": analysis.get("source", {}).get("sheet"),
            "months": analysis.get("source", {}).get("months") or [],
            "rowCount": analysis.get("source", {}).get("rowCount"),
        },
        "method": {
            "metric": "销售额",
            "grain": "掌柜名称 + 一级类目 + 二级类目",
            "threshold": 0.95,
            "thresholdRule": "销售额降序累计，并包含首次达到或超过95%的临界二级类目",
            "comparisonColumnsExcluded": ["环比销售额", "同比销售额"],
        },
        "quality": {
            **(analysis.get("quality") or {}),
            "profileCount": len(profiles),
            "fullyMappedProfileCount": fully_mapped_count,
            "partiallyMappedProfileCount": len(profiles) - fully_mapped_count,
        },
        "profiles": profiles,
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT_PATH),
                "profiles": len(profiles),
                "fullyMapped": fully_mapped_count,
                "partial": len(profiles) - fully_mapped_count,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
