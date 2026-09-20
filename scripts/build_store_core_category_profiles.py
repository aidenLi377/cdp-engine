"""Build the ten highest-selling second-level categories per store."""

from __future__ import annotations

import csv
import argparse
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


def category_groups(category_path: str) -> tuple[str, ...]:
    """Return every conversational business scope containing a category.

    The platform combines makeup, perfume and beauty tools under one first-level
    category.  In business conversation, the broad word ``彩妆`` refers to that
    entire first-level category, while ``香水`` and ``美妆工具`` remain useful
    narrower scopes.  ``护肤`` similarly refers to the complete
    ``美容护肤/美体/精油`` first-level category.
    """

    first_level, _, second_level = category_path.partition(">")
    if first_level == "彩妆/香水/美妆工具":
        groups = ["彩妆"]
        if "香水" in second_level:
            groups.append("香水")
        if "美妆工具" in second_level or "美容工具" in second_level:
            groups.append("美妆工具")
        return tuple(groups)
    if first_level == "美容护肤/美体/精油":
        return ("护肤",)
    return ()


def load_workbook_analysis(workbook_path: Path) -> dict:
    """Aggregate all source rows, not the old 95% subset."""

    import pandas as pd

    return analyze_sales_frame(pd.read_excel(workbook_path, sheet_name="qbt"), workbook_path.name)


def analyze_sales_frame(frame, file_name: str) -> dict:
    """Return a compact, auditable top-ten source summary from table values."""

    import pandas as pd

    required = {"掌柜名称", "时间段", "一级类目", "二级类目", "销售额"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"销售报表缺少列: {', '.join(sorted(missing))}")
    source_rows = len(frame)
    frame = frame.dropna(subset=["掌柜名称", "一级类目", "二级类目"]).copy()
    frame["销售额"] = pd.to_numeric(frame["销售额"], errors="raise")
    if (frame["销售额"] < 0).any():
        raise ValueError("销售报表含负销售额，请先确认退款口径")
    frame["categoryPath"] = (
        frame["一级类目"].astype(str).str.strip()
        + ">"
        + frame["二级类目"].astype(str).str.strip()
    )
    totals = frame.groupby(["掌柜名称", "categoryPath"], as_index=False)["销售额"].sum()
    profiles = []
    for store_name, rows in totals.groupby("掌柜名称", sort=True):
        ranked = rows.sort_values(
            ["销售额", "categoryPath"], ascending=[False, True]
        )
        total = float(ranked["销售额"].sum())
        cumulative = 0.0
        top_categories = []
        for category_path, amount in ranked[["categoryPath", "销售额"]].head(10).itertuples(index=False, name=None):
            amount = float(amount)
            cumulative += amount
            top_categories.append(
                {
                    "categoryPath": category_path,
                    "salesAmount": amount,
                    "share": amount / total if total else 0.0,
                    "cumulativeShare": cumulative / total if total else 0.0,
                }
            )
        profiles.append(
            {
                "storeName": str(store_name),
                "totalSalesAmount": total,
                "categoryCount": len(ranked),
                "coreCategories": top_categories,
                "coveredShare": cumulative / total if total else 0.0,
                "categoryGroups": {
                    group: [
                        {
                            "categoryPath": path,
                            "salesAmount": float(amount),
                        }
                        for path, amount in ranked[["categoryPath", "销售额"]].itertuples(index=False, name=None)
                        if group in category_groups(path)
                    ][:10]
                    for group in ("彩妆", "护肤", "香水", "美妆工具")
                },
            }
        )
    return {
        "source": {
            "fileName": file_name,
            "sheet": "qbt",
            "rowCount": source_rows,
            "months": sorted(frame["时间段"].dropna().astype(str).unique().tolist()),
        },
        "quality": {"storeCount": len(profiles)},
        "storeProfiles": profiles,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, help="原始店铺趋势报表路径")
    args = parser.parse_args()
    if args.workbook:
        analysis = load_workbook_analysis(args.workbook)
    else:
        analysis = json.loads(ANALYSIS_PATH.read_text(encoding="utf-8"))
        incomplete = [
            item.get("storeName")
            for item in analysis.get("storeProfiles") or []
            if int(item.get("categoryCount") or 0) > len(item.get("coreCategories") or [])
            and len(item.get("coreCategories") or []) < 10
        ]
        if incomplete:
            raise ValueError(
                f"旧缓存只保留95%类目，{len(incomplete)}个店铺无法求出销售前10；请提供原始报表并使用 --workbook"
            )
    category_ids = load_category_ids()
    profiles = []
    fully_mapped_count = 0

    for source_profile in analysis.get("storeProfiles") or []:
        core_categories = []
        for position, category in enumerate((source_profile.get("coreCategories") or [])[:10], start=1):
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

        category_groups = {}
        for group_name, raw_categories in (source_profile.get("categoryGroups") or {}).items():
            category_groups[group_name] = [
                {
                    "rank": position,
                    "categoryPath": str(item.get("categoryPath") or "").strip(),
                    "cateId": category_ids.get(str(item.get("categoryPath") or "").strip()),
                    "salesAmount": round(float(item.get("salesAmount") or 0), 2),
                }
                for position, item in enumerate(raw_categories[:10], start=1)
            ]

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
                "categoryGroups": category_groups,
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
            "selectionRule": "sales_top_10",
            "maxCategoriesPerStore": 10,
            "thresholdRule": "每个店铺按二级类目销售额降序，取前10项；不足10项则全部保留",
            "conversationalCategoryScopes": {
                "彩妆": {
                    "firstLevelCategory": "彩妆/香水/美妆工具",
                    "selectionRule": "先限定一级类目，再按二级类目销售额降序取前10",
                },
                "护肤": {
                    "firstLevelCategory": "美容护肤/美体/精油",
                    "selectionRule": "先限定一级类目，再按二级类目销售额降序取前10",
                },
            },
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
