from __future__ import annotations

import io
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any

import pandas as pd

from .constants import (
    ACCOUNT_DIM_FILE,
    ATTRIBUTE_DIM_FILE,
    BASE_DIR,
    BEHAVIOR_DIM_FILE,
    BRAND_DIM_FILE,
    CATEGORY_DIM_FILE,
    CHANNEL_DIM_FILE,
    DIMENSION_FILES,
    GOODS_TYPE_DIM_FILE,
    LOGIC_TRIGGER_CANDIDATES,
    PARAMS_FILE,
    SCENE_DIM_FILE,
    STATUS_DIM_FILE,
    TEMPLATE_DIRNAME,
)
from .csv_utils import (
    infer_package_name_from_logic_filename,
    list_logic_files,
    normalize_object_columns,
    project_path,
    read_csv_flexible,
    split_packages,
    unique_preserve_order,
)
from .database import get_db
from .validator import validate_project_config


@dataclass
class BatchGenerateResult:
    results: list[dict[str, Any]]
    detected_pkg: str
    errors: list[dict[str, Any]]


class ConfigEngine:
    CATEGORY_PUBLIC_PACKAGE = "类目公域行为"
    CATEGORY_ITEM_PACKAGE = "类目商品行为"
    COMMODITY_PACKAGE = "商品行为"
    BRAND_ZONE_PACKAGE = "品牌专区"
    EFFECT_PROMOTION_PACKAGE = "效果推广"
    BRAND_PROMOTION_PACKAGE = "品牌推广"
    OMNIMEDIA_PACKAGE = "全媒体智投"
    SINGLE_MEDIA_PACKAGE = "单媒体智投"
    OFFICIAL_ORDERED_PACKAGES = (
        CATEGORY_PUBLIC_PACKAGE,
        COMMODITY_PACKAGE,
        BRAND_ZONE_PACKAGE,
        EFFECT_PROMOTION_PACKAGE,
        BRAND_PROMOTION_PACKAGE,
        OMNIMEDIA_PACKAGE,
        SINGLE_MEDIA_PACKAGE,
    )
    CATEGORY_PUBLIC_TOP_LEVEL_ORDER = ("selectionLv1", "selectionLv3", "fromPoolId")
    CATEGORY_PUBLIC_SELECTION_LV3_ORDER = (
        "extraFilters",
        "leafCates",
        "bhv",
        "dateType",
        "dateValue",
    )
    CATEGORY_PUBLIC_EXTRA_FILTER_ORDER = (
        "channel",
        "stdBrand",
        "frequency",
        "price",
        "itemprice",
    )
    COMMODITY_TOP_LEVEL_ORDER = (
        "selectionLv1",
        "selectionLv3",
        "tipProperty",
        "fromPoolId",
        "selectionLv2",
        "selectionLv2Name",
    )
    COMMODITY_SELECTION_LV3_ORDER = (
        "shop",
        "keywords",
        "cate",
        "bhv",
        "frequency",
        "money",
        "dateType",
        "dateValue",
        "selectedGoodsType",
    )
    BRAND_ZONE_TOP_LEVEL_ORDER = (
        "selectionLv1",
        "selectionLv3",
        "fromPoolId",
        "selectionLv2Name",
        "selectionLv2",
    )
    BRAND_ZONE_SELECTION_LV3_ORDER = (
        "contType",
        "account",
        "dayFrequency",
        "bhv",
        "dateType",
        "dateValue",
    )
    EFFECT_PROMOTION_TOP_LEVEL_ORDER = BRAND_ZONE_TOP_LEVEL_ORDER
    EFFECT_PROMOTION_SELECTION_LV3_ORDER = (
        "account",
        "bhv",
        "onebp_scene",
        "dateType",
        "dateValue",
        "dayFrequency",
    )
    BRAND_PROMOTION_TOP_LEVEL_ORDER = BRAND_ZONE_TOP_LEVEL_ORDER
    BRAND_PROMOTION_SELECTION_LV3_ORDER = (
        "cate",
        "bhv",
        "ppob_scene",
        "dateType",
        "dateValue",
        "dayFrequency",
    )
    OMNIMEDIA_TOP_LEVEL_ORDER = (
        "selectionLv1",
        "selectionLv3",
        "tipProperty",
        "fromPoolId",
        "selectionLv2Name",
        "selectionLv2",
    )
    OMNIMEDIA_SELECTION_LV3_ORDER = (
        "dayFrequency",
        "bhv",
        "bhv_type",
        "dateType",
        "dateValue",
    )
    OMNIMEDIA_BEHAVIOR_TYPES = {
        "曝光": "exp_udzht",
        "点击": "click_udzht",
    }
    SINGLE_MEDIA_TOP_LEVEL_ORDER = OMNIMEDIA_TOP_LEVEL_ORDER
    SINGLE_MEDIA_SELECTION_LV3_ORDER = (
        "bhv",
        "dateType",
        "dateValue",
    )
    LIST_VALUE_KEYS = {
        "channel",
        "stdBrand",
        "leafCates",
        "bhv",
        "title",
        "types",
        "keywords",
        "onebp_scene",
        "ppob_scene",
    }

    def __init__(
        self,
        logger: logging.Logger | None = None,
        validate_on_load: bool = True,
        db_path: str | None = None,
    ):
        self.logger = logger or logging.getLogger(__name__)
        self.db_path = db_path
        self._meta_cache: dict[str, dict[str, Any]] = {}
        self._logic_cache: dict[str, dict[str, list[str]]] = {}
        self.params_df = pd.DataFrame()
        self.packages: dict[str, str] = {}
        self.label_map: dict[str, str] = {}
        self.id_translator: dict[str, str] = {}
        self.dim_translator: dict[tuple[str, str], str] = {}
        self.dimensions: dict[str, list[str]] = {}
        self.attr_options: dict[tuple[str, str], list[str]] = {}
        self.bhv_translator: dict[tuple[str, str, str], str] = {}
        self.bhv_options: dict[str, list[str]] = {}
        self.scene_translator: dict[tuple[str, str, str], str] = {}
        self.scene_options: dict[tuple[str, str], list[str]] = {}
        self.load_config(validate_on_load=validate_on_load)

    def load_config(self, validate_on_load: bool = True) -> None:
        self._meta_cache.clear()
        self._logic_cache.clear()
        if validate_on_load:
            validate_project_config()

        self.params_df, _ = read_csv_flexible(project_path(PARAMS_FILE))
        self.params_df = normalize_object_columns(self.params_df)

        self.packages = {}
        for path in list_logic_files():
            filename = os.path.basename(path)
            package_name = infer_package_name_from_logic_filename(filename)
            self.packages[package_name] = path

        self.label_map = {}
        for _, row in self.params_df.iterrows():
            label = str(row.get("Label", "")).strip()
            key = str(row.get("Param_Key", "")).strip()
            if not label or not key:
                continue
            self.label_map[label] = key
            if "关键词" in label:
                self.label_map[label.replace("关键词", "关键字")] = key

        self._load_dimension_tables()
        self.logger.info(
            "ConfigEngine initialized with %d packages and %d dimensions",
            len(self.packages),
            len(self.dimensions),
        )

    def _safe_read(self, filename: str) -> pd.DataFrame:
        if self.db_path and filename in DIMENSION_FILES:
            try:
                with get_db(self.db_path) as conn:
                    count = conn.execute(
                        "SELECT COUNT(*) FROM dimension_rows WHERE dimension_file = ?",
                        (filename,),
                    ).fetchone()[0]
                    if count:
                        rows = conn.execute(
                            """SELECT published_data AS data FROM dimension_rows
                               WHERE dimension_file = ? AND is_published = 1
                               AND published_enabled = 1 AND published_deleted = 0
                               ORDER BY package_name, display_name, id""",
                            (filename,),
                        ).fetchall()
                        return pd.DataFrame(
                            [json.loads(row["data"]) for row in rows]
                        )
            except Exception:
                self.logger.exception("failed to read SQLite dimension %s", filename)
        path = project_path(filename)
        if not os.path.exists(path):
            return pd.DataFrame()
        try:
            df, _ = read_csv_flexible(path)
            return df
        except Exception:
            return pd.DataFrame()

    def reload_config(self, validate_on_load: bool = True) -> None:
        self.load_config(validate_on_load=validate_on_load)

    def _apply_field_option_order(
        self,
        package_name: str,
        field_key: str,
        options: list[str],
    ) -> list[str]:
        """Apply the published admin order while preserving newly added options."""
        if not self.db_path or len(options) < 2:
            return options
        try:
            with get_db(self.db_path) as conn:
                row = conn.execute(
                    """SELECT published_order FROM field_option_orders
                       WHERE package_name = ? AND field_key = ?""",
                    (package_name, field_key),
                ).fetchone()
            if not row:
                return options
            preferred = json.loads(row["published_order"] or "[]")
            if not isinstance(preferred, list):
                return options
            option_set = set(options)
            ordered = [value for value in preferred if value in option_set]
            ordered.extend(value for value in options if value not in ordered)
            return ordered
        except Exception:
            self.logger.exception("failed to apply option order for %s/%s", package_name, field_key)
            return options

    def _load_dimension_tables(self) -> None:
        self.id_translator = {}
        self.dim_translator = {}
        self.dimensions = {}
        self.attr_options = {}
        self.bhv_translator = {}
        self.bhv_options = {}
        self.scene_translator = {}
        self.scene_options = {}

        behavior_df = self._safe_read(BEHAVIOR_DIM_FILE)
        for _, row in behavior_df.iterrows():
            package_name = str(row.get("适用的包", "")).strip()
            behavior_name = str(row.get("行为名称", "")).strip()
            channel_name = str(row.get("适用的渠道", "")).strip() or "ALL"
            translated = f"{row.get('ID', '')}#|#{row.get('Value', '')}"
            if not package_name or not behavior_name:
                continue
            self.bhv_translator[(package_name, channel_name, behavior_name)] = translated
            self.bhv_options.setdefault(package_name, [])
            if behavior_name not in self.bhv_options[package_name]:
                self.bhv_options[package_name].append(behavior_name)

        scene_df = self._safe_read(SCENE_DIM_FILE)
        if "排序" in scene_df.columns:
            scene_df = scene_df.copy()
            scene_df["排序"] = pd.to_numeric(scene_df["排序"], errors="coerce")
            scene_df = scene_df.sort_values(
                ["适用的包", "适用的行为", "排序"],
                kind="stable",
                na_position="last",
            )
        self.dimensions[SCENE_DIM_FILE] = []
        for _, row in scene_df.iterrows():
            package_name = str(row.get("适用的包", "")).strip()
            behavior_name = str(row.get("适用的行为", "")).strip()
            scene_name = str(row.get("场景名称", "")).strip()
            scene_id = str(row.get("ID", "")).strip()
            scene_value = str(row.get("Value", "")).strip()
            if not package_name or not behavior_name or not scene_name or not scene_id:
                continue
            translated = f"{scene_id}#|#{scene_value}"
            self.scene_translator[(package_name, behavior_name, scene_name)] = translated
            self.scene_options.setdefault((package_name, behavior_name), [])
            if scene_name not in self.scene_options[(package_name, behavior_name)]:
                self.scene_options[(package_name, behavior_name)].append(scene_name)
            if scene_name not in self.dimensions[SCENE_DIM_FILE]:
                self.dimensions[SCENE_DIM_FILE].append(scene_name)

        loaders = [
            (CHANNEL_DIM_FILE, "渠道名称", lambda r: f"{r.get('parentId', '')}#|#{r.get('BizID', '')}"),
            (CATEGORY_DIM_FILE, "类目名称", lambda r: f"{r.get('cateId', '')}#|#{r.get('cateId', '')}"),
            (BRAND_DIM_FILE, "品牌名称", lambda r: str(r.get("Value", "")).strip()),
            (STATUS_DIM_FILE, "状态名称", lambda r: f"{r.get('ID', '')}#|#{r.get('Value', '')}"),
            (GOODS_TYPE_DIM_FILE, "类型名称", lambda r: str(r.get("ID", "")).strip()),
            (ACCOUNT_DIM_FILE, "账号名称", lambda r: str(r.get("ID", "")).strip()),
            (ATTRIBUTE_DIM_FILE, "属性值名称", lambda r: str(r.get("ID", "")).strip()),
        ]

        for filename, name_col, id_func in loaders:
            dim_df = self._safe_read(filename)
            self.dimensions[filename] = []
            has_package = "适用的包" in dim_df.columns
            for _, row in dim_df.iterrows():
                try:
                    name = str(row.get(name_col, "")).strip()
                    if not name:
                        continue
                    translated = id_func(row)
                    package_name = str(row.get("适用的包", "")).strip() if has_package else ""
                    if translated and translated != "#|#":
                        self.id_translator[name] = translated
                        if package_name:
                            self.dim_translator[(package_name, name)] = translated
                            key = (package_name, filename)
                            self.attr_options.setdefault(key, [])
                            if name not in self.attr_options[key]:
                                self.attr_options[key].append(name)
                    self.dimensions[filename].append(name)
                except Exception:
                    continue
            self.dimensions[filename] = unique_preserve_order(self.dimensions[filename])

    def get_package_meta(self, package_name: str) -> dict[str, Any]:
        if package_name in self._meta_cache:
            return self._meta_cache[package_name]

        logic_filename = self.packages.get(package_name)
        if not logic_filename or not os.path.exists(logic_filename):
            return {}

        schema: list[dict[str, Any]] = []
        current_label_map: dict[str, str] = {}

        for _, config in self.params_df.iterrows():
            package_value = config.get("Crowd_Package", "")
            if package_name not in split_packages(package_value):
                continue

            label = str(config.get("Label", "")).strip()
            key = str(config.get("Param_Key", "")).strip()
            if label and key:
                current_label_map[label] = key
                if "关键词" in label:
                    current_label_map[label.replace("关键词", "关键字")] = key

            item = {
                field: ("" if pd.isna(value) else value)
                for field, value in config.to_dict().items()
            }
            item["key"] = key
            raw_ui_config = str(item.get("UI_Config", "")).strip()
            if raw_ui_config and raw_ui_config not in {"-", "nan"}:
                try:
                    parsed_ui_config = json.loads(raw_ui_config)
                except (TypeError, ValueError):
                    parsed_ui_config = {}
            else:
                parsed_ui_config = {}
            item["uiConfig"] = (
                parsed_ui_config if isinstance(parsed_ui_config, dict) else {}
            )
            data_source = item.get("Data_Source")

            if data_source == BEHAVIOR_DIM_FILE:
                item["options"] = list(self.bhv_options.get(package_name, []))
            elif data_source == SCENE_DIM_FILE:
                item["optionsByValue"] = {
                    behavior: list(options)
                    for (scene_package, behavior), options in self.scene_options.items()
                    if scene_package == package_name
                }
                item["options"] = unique_preserve_order(
                    option
                    for options in item["optionsByValue"].values()
                    for option in options
                )
            else:
                item["options"] = list(
                    self.attr_options.get((package_name, data_source), self.dimensions.get(data_source, []))
                )
            item["options"] = self._apply_field_option_order(
                package_name,
                key,
                item["options"],
            )
            preferred_options = item["uiConfig"].get("optionOrder")
            if isinstance(preferred_options, list):
                option_set = set(item["options"])
                ordered_options = [
                    value for value in preferred_options if value in option_set
                ]
                ordered_options.extend(
                    value for value in item["options"] if value not in ordered_options
                )
                item["options"] = ordered_options

            if package_name in ["AIPL状态", "商品行为", self.BRAND_PROMOTION_PACKAGE] and item["key"] in ["cate", "leafCates"]:
                if "全部" not in item["options"]:
                    item["options"].insert(0, "全部")

            is_default_raw = str(item.get("Is_Default", "0")).strip().lower().replace(".0", "")
            item["isDefault"] = is_default_raw in ["1", "true", "yes", "是"]
            schema.append(item)

        logic_matrix = self._load_logic_matrix(logic_filename, current_label_map)
        result = {"schema": schema, "matrix": logic_matrix}
        self._meta_cache[package_name] = result
        return result

    def _load_logic_matrix(self, logic_filename: str, current_label_map: dict[str, str]) -> dict[str, list[str]]:
        if logic_filename in self._logic_cache:
            return self._logic_cache[logic_filename]

        logic_df, _ = read_csv_flexible(logic_filename)
        trigger_cols: list[str] = []
        for expected in LOGIC_TRIGGER_CANDIDATES:
            for col in logic_df.columns:
                if str(col).strip() != expected:
                    continue
                non_empty = logic_df[col].dropna()
                first_value = str(non_empty.iloc[0]).strip() if not non_empty.empty else ""
                if first_value not in ["1", "1.0", "True", "TRUE"]:
                    trigger_cols.append(str(col).strip())

        if not trigger_cols and len(logic_df.columns) > 0:
            trigger_cols = [str(logic_df.columns[0]).strip()]

        matrix: dict[str, list[str]] = {}
        for _, row in logic_df.iterrows():
            key_parts = [str(row[col]).strip() for col in trigger_cols]
            composite_key = "|".join(key_parts)
            visible_fields: list[str] = []
            for col_name, value in row.items():
                col_name = str(col_name).strip()
                if col_name in trigger_cols:
                    continue
                if str(value).strip() in ["1", "1.0", "True", "TRUE", "true"]:
                    visible_fields.append(current_label_map.get(col_name, col_name))
            matrix[composite_key] = visible_fields

        self._logic_cache[logic_filename] = matrix
        return matrix

    def generate_json(self, user_data: dict[str, Any]) -> dict[str, Any]:
        payload = dict(user_data)
        current_pkg = payload.pop("_package", "类目公域行为")
        if current_pkg == self.BRAND_ZONE_PACKAGE:
            self._validate_brand_zone_payload(payload)
        elif current_pkg == self.EFFECT_PROMOTION_PACKAGE:
            self._validate_effect_promotion_payload(payload)
        elif current_pkg == self.BRAND_PROMOTION_PACKAGE:
            self._validate_brand_promotion_payload(payload)
        elif current_pkg == self.OMNIMEDIA_PACKAGE:
            self._validate_omnimedia_payload(payload)
        elif current_pkg == self.SINGLE_MEDIA_PACKAGE:
            self._validate_single_media_payload(payload)
        selection_lv3: dict[str, Any] = {}

        for key, raw_val in payload.items():
            if current_pkg in {"AIPL状态", self.BRAND_PROMOTION_PACKAGE} and key == "cate":
                if (isinstance(raw_val, list) and "全部" in raw_val) or raw_val == "全部":
                    self._merge_path(selection_lv3, "selectionLv3.cate", "ALL")
                    continue

            matched_rows = self.params_df[
                (self.params_df["Param_Key"] == key)
                & (
                    self.params_df["Crowd_Package"].apply(
                        lambda value: current_pkg in split_packages(value)
                    )
                )
            ]
            if matched_rows.empty:
                continue

            config = matched_rows.iloc[0]
            template_str = config.get("Backend_Template")
            json_path = str(config.get("JSON_Path", "")).strip()
            widget_type = str(config.get("Widget_Type", "")).strip()
            if not json_path or json_path == "-":
                continue

            cleaned_val = raw_val
            vars_dict: dict[str, Any] = {}
            state = "hasValue"

            if isinstance(raw_val, dict) and "val" in raw_val:
                cleaned_val = raw_val["val"]
                if isinstance(cleaned_val, dict):
                    vars_dict.update(cleaned_val)

            if isinstance(raw_val, dict) and raw_val.get("min") in ["recent", "range"]:
                state = str(raw_val.get("min"))
                if isinstance(raw_val.get("val"), dict):
                    temp_val = dict(raw_val["val"])
                    if "days" in temp_val:
                        temp_val["days"] = str(temp_val["days"])
                    vars_dict.update(temp_val)
            elif isinstance(raw_val, dict) and ("min" in raw_val or "max" in raw_val):
                min_v = self._safe_number(raw_val.get("min"))
                max_v = self._safe_number(raw_val.get("max"))
                if min_v != "":
                    vars_dict["min"] = min_v
                if max_v != "":
                    vars_dict["max"] = max_v

                if min_v == "" and max_v == "":
                    state = "isEmpty"
                elif min_v != "" and max_v == "":
                    state = "min_only"
                elif min_v == "" and max_v != "":
                    state = "max_only"
                else:
                    state = "range"
            elif cleaned_val in ["", None, []]:
                state = "isEmpty"

            # The workbench keeps fixed ranges in ISO form for display, while
            # the data-engine import contract requires compact YYYYMMDD dates.
            # Normalize at this final shared boundary so AI-applied nodes,
            # manual nodes, and API callers all produce the same JSON shape.
            for date_key in ("start", "end"):
                date_value = vars_dict.get(date_key)
                if isinstance(date_value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_value):
                    vars_dict[date_key] = date_value.replace("-", "")

            if state != "isEmpty":
                final_val = self._translate_value(current_pkg, key, cleaned_val, payload)
                # 类目商品行为的商品ID在前端按列表承载，以支持批量粘贴和自动拆分。
                # 每个拆分后的组件只有一个ID，生成官方结构时仍保持原有的字符串格式。
                if (
                    current_pkg == self.CATEGORY_ITEM_PACKAGE
                    and key == "item"
                    and isinstance(final_val, list)
                    and len(final_val) == 1
                ):
                    final_val = final_val[0]
                if isinstance(final_val, dict):
                    final_val = {
                        inner_key: inner_value.replace("-", "")
                        if isinstance(inner_value, str) and re.match(r"\d{4}-\d{2}-\d{2}", inner_value)
                        else inner_value
                        for inner_key, inner_value in final_val.items()
                    }
                if isinstance(final_val, (str, int, float, list)):
                    vars_dict["val"] = final_val
                if not vars_dict and final_val:
                    vars_dict["val"] = final_val

            if not template_str or str(template_str).strip() in ["", "-", "nan"]:
                if state == "isEmpty":
                    continue
                val_to_write = vars_dict.get("val", cleaned_val)
                if key in self.LIST_VALUE_KEYS and widget_type != "单选组":
                    if not isinstance(val_to_write, list):
                        val_to_write = [val_to_write]
                self._merge_path(selection_lv3, json_path, val_to_write)
                continue

            try:
                strategies = json.loads(template_str)
                if isinstance(strategies, dict):
                    strategies = [strategies]
                if not isinstance(strategies, list):
                    continue
            except Exception:
                continue

            matched_template = None
            for strategy in strategies:
                cond = strategy.get("trigger") or strategy.get("if")
                if cond == state:
                    matched_template = strategy.get("template")
                    break
                if cond in ["hasValue", "HAS_VALUE"] and state != "isEmpty":
                    matched_template = strategy.get("template")
                    break

            if matched_template is None:
                for strategy in strategies:
                    if strategy.get("trigger") in ["default", "DEFAULT"]:
                        matched_template = strategy.get("template")
                        break

            if matched_template is not None:
                rendered = json.dumps(matched_template, ensure_ascii=False)
                for var_key, var_value in vars_dict.items():
                    rendered_value = (
                        json.dumps(var_value, ensure_ascii=False)
                        if isinstance(var_value, (list, dict))
                        else str(var_value)
                    )
                    rendered = rendered.replace(f'"${{{var_key}}}"', rendered_value)
                    if var_key in ["start", "end", "days"]:
                        rendered = rendered.replace(f": {rendered_value}", f': "{rendered_value}"')
                    rendered = rendered.replace(f"${{{var_key}}}", rendered_value)
                self._merge_path(selection_lv3, json_path, json.loads(rendered))

        if current_pkg == self.OMNIMEDIA_PACKAGE:
            self._merge_path(
                selection_lv3,
                "selectionLv3.bhv_type",
                self.OMNIMEDIA_BEHAVIOR_TYPES[str(payload.get("bhv", "")).strip()],
            )

        base_template = self._load_base_template(current_pkg)
        for top_key, value in selection_lv3.items():
            if top_key in base_template and isinstance(base_template[top_key], dict) and isinstance(value, dict):
                self._deep_update(base_template[top_key], value)
            else:
                base_template[top_key] = value

        if "selectionLv3" not in base_template:
            base_template["selectionLv3"] = {}

        base_template["fromPoolId"] = (
            1
            if current_pkg in {
                self.BRAND_PROMOTION_PACKAGE,
                self.OMNIMEDIA_PACKAGE,
                self.SINGLE_MEDIA_PACKAGE,
            }
            else 0
        )
        if "channel" in payload and current_pkg != self.CATEGORY_PUBLIC_PACKAGE:
            channel_val = payload["channel"]
            base_template["selectionLv2Name"] = (
                channel_val[0] if isinstance(channel_val, list) and channel_val else str(channel_val)
            )

        if current_pkg == self.CATEGORY_PUBLIC_PACKAGE:
            base_template = self._canonicalize_category_public(base_template)
        elif current_pkg == self.COMMODITY_PACKAGE:
            base_template = self._canonicalize_commodity(base_template)
        elif current_pkg == self.BRAND_ZONE_PACKAGE:
            base_template = self._canonicalize_brand_zone(base_template)
        elif current_pkg == self.EFFECT_PROMOTION_PACKAGE:
            base_template = self._canonicalize_effect_promotion(base_template)
        elif current_pkg == self.BRAND_PROMOTION_PACKAGE:
            base_template = self._canonicalize_brand_promotion(base_template)
        elif current_pkg == self.OMNIMEDIA_PACKAGE:
            base_template = self._canonicalize_omnimedia(base_template)
        elif current_pkg == self.SINGLE_MEDIA_PACKAGE:
            base_template = self._canonicalize_single_media(base_template)

        return {"crowdName": "未命名", "list": [base_template], "compute": "(0)"}

    @classmethod
    def _canonicalize_category_public(cls, base_template: dict[str, Any]) -> dict[str, Any]:
        canonical = dict(base_template)
        canonical.pop("selectionLv2Name", None)

        selection_lv3 = canonical.get("selectionLv3")
        if isinstance(selection_lv3, dict):
            selection_lv3 = dict(selection_lv3)
            extra_filters = selection_lv3.get("extraFilters")
            if isinstance(extra_filters, dict):
                selection_lv3["extraFilters"] = cls._order_mapping(
                    extra_filters,
                    cls.CATEGORY_PUBLIC_EXTRA_FILTER_ORDER,
                )
            canonical["selectionLv3"] = cls._order_mapping(
                selection_lv3,
                cls.CATEGORY_PUBLIC_SELECTION_LV3_ORDER,
            )

        return cls._order_mapping(canonical, cls.CATEGORY_PUBLIC_TOP_LEVEL_ORDER)

    @classmethod
    def _canonicalize_commodity(cls, base_template: dict[str, Any]) -> dict[str, Any]:
        canonical = dict(base_template)
        selection_lv3 = canonical.get("selectionLv3")
        if not isinstance(selection_lv3, dict):
            selection_lv3 = {}
        else:
            selection_lv3 = dict(selection_lv3)

        selection_lv3.setdefault("keywords", None)
        if selection_lv3.get("cate") in [None, "", "全部"]:
            selection_lv3["cate"] = "ALL"
        canonical["selectionLv3"] = cls._order_mapping(
            selection_lv3,
            cls.COMMODITY_SELECTION_LV3_ORDER,
        )
        canonical.setdefault("tipProperty", None)

        return cls._order_mapping(canonical, cls.COMMODITY_TOP_LEVEL_ORDER)

    @classmethod
    def _canonicalize_brand_zone(cls, base_template: dict[str, Any]) -> dict[str, Any]:
        canonical = dict(base_template)
        selection_lv3 = canonical.get("selectionLv3")
        if isinstance(selection_lv3, dict):
            canonical["selectionLv3"] = cls._order_mapping(
                dict(selection_lv3),
                cls.BRAND_ZONE_SELECTION_LV3_ORDER,
            )
        return cls._order_mapping(canonical, cls.BRAND_ZONE_TOP_LEVEL_ORDER)

    @classmethod
    def _canonicalize_effect_promotion(
        cls,
        base_template: dict[str, Any],
    ) -> dict[str, Any]:
        canonical = dict(base_template)
        selection_lv3 = canonical.get("selectionLv3")
        if isinstance(selection_lv3, dict):
            selection_lv3 = dict(selection_lv3)
            # The official click payload omits dateValue for a relative date,
            # even though the same UI selection includes it for exposure/view.
            if (
                selection_lv3.get("bhv") == "15316#|#onebp_click"
                and selection_lv3.get("dateType") == "RELATIVE_RANGE"
            ):
                selection_lv3.pop("dateValue", None)
            canonical["selectionLv3"] = cls._order_mapping(
                selection_lv3,
                cls.EFFECT_PROMOTION_SELECTION_LV3_ORDER,
            )
        return cls._order_mapping(
            canonical,
            cls.EFFECT_PROMOTION_TOP_LEVEL_ORDER,
        )

    @classmethod
    def _canonicalize_brand_promotion(
        cls,
        base_template: dict[str, Any],
    ) -> dict[str, Any]:
        canonical = dict(base_template)
        selection_lv3 = canonical.get("selectionLv3")
        if isinstance(selection_lv3, dict):
            selection_lv3 = dict(selection_lv3)
            # The supplied official exposure payload keeps dateType but omits
            # dateValue for a relative range; click payloads retain dateValue.
            if (
                selection_lv3.get("bhv") == "15318#|#exp_pptg"
                and selection_lv3.get("dateType") == "RELATIVE_RANGE"
            ):
                selection_lv3.pop("dateValue", None)
            canonical["selectionLv3"] = cls._order_mapping(
                selection_lv3,
                cls.BRAND_PROMOTION_SELECTION_LV3_ORDER,
            )
        return cls._order_mapping(
            canonical,
            cls.BRAND_PROMOTION_TOP_LEVEL_ORDER,
        )

    @classmethod
    def _canonicalize_omnimedia(cls, base_template: dict[str, Any]) -> dict[str, Any]:
        canonical = dict(base_template)
        selection_lv3 = canonical.get("selectionLv3")
        if isinstance(selection_lv3, dict):
            canonical["selectionLv3"] = cls._order_mapping(
                dict(selection_lv3),
                cls.OMNIMEDIA_SELECTION_LV3_ORDER,
            )
        return cls._order_mapping(canonical, cls.OMNIMEDIA_TOP_LEVEL_ORDER)

    @classmethod
    def _canonicalize_single_media(
        cls,
        base_template: dict[str, Any],
    ) -> dict[str, Any]:
        canonical = dict(base_template)
        selection_lv3 = canonical.get("selectionLv3")
        if isinstance(selection_lv3, dict):
            canonical["selectionLv3"] = cls._order_mapping(
                dict(selection_lv3),
                cls.SINGLE_MEDIA_SELECTION_LV3_ORDER,
            )
        return cls._order_mapping(canonical, cls.SINGLE_MEDIA_TOP_LEVEL_ORDER)

    @classmethod
    def _validate_brand_zone_payload(cls, payload: dict[str, Any]) -> None:
        cls._validate_ad_behavior_payload(payload, cls.BRAND_ZONE_PACKAGE)

    def _validate_effect_promotion_payload(self, payload: dict[str, Any]) -> None:
        self._validate_ad_behavior_payload(payload, self.EFFECT_PROMOTION_PACKAGE)
        scenes = payload.get("onebp_scene")
        if not isinstance(scenes, list) or not scenes:
            raise ValueError("效果推广必须至少选择一个场景")
        behavior = str(payload.get("bhv", "")).strip()
        valid_scenes = set(
            self.scene_options.get((self.EFFECT_PROMOTION_PACKAGE, behavior), [])
        )
        invalid = [scene for scene in scenes if scene not in valid_scenes]
        if invalid:
            raise ValueError(
                f"效果推广场景与{behavior or '当前'}行为不匹配：{', '.join(map(str, invalid))}"
            )

    def _validate_brand_promotion_payload(self, payload: dict[str, Any]) -> None:
        behavior = str(payload.get("bhv", "")).strip()
        if behavior not in {"曝光", "点击"}:
            raise ValueError("品牌推广行为必须是曝光或点击")
        self._validate_ad_behavior_payload(
            payload,
            self.BRAND_PROMOTION_PACKAGE,
            required_fields=(("bhv", "行为"), ("cate", "二级类目"), ("time", "时间")),
        )
        scenes = payload.get("ppob_scene")
        if not isinstance(scenes, list) or not scenes:
            raise ValueError("品牌推广必须至少选择一个场景")
        valid_scenes = set(
            self.scene_options.get((self.BRAND_PROMOTION_PACKAGE, behavior), [])
        )
        invalid = [scene for scene in scenes if scene not in valid_scenes]
        if invalid:
            raise ValueError(
                f"品牌推广场景与{behavior}行为不匹配：{', '.join(map(str, invalid))}"
            )

    @classmethod
    def _validate_omnimedia_payload(cls, payload: dict[str, Any]) -> None:
        behavior = str(payload.get("bhv", "")).strip()
        if behavior not in cls.OMNIMEDIA_BEHAVIOR_TYPES:
            raise ValueError("全媒体智投行为必须是曝光或点击")
        cls._validate_ad_behavior_payload(
            payload,
            cls.OMNIMEDIA_PACKAGE,
            required_fields=(("bhv", "行为"), ("time", "时间")),
        )

    @classmethod
    def _validate_single_media_payload(cls, payload: dict[str, Any]) -> None:
        if str(payload.get("bhv", "")).strip() not in {"曝光", "点击"}:
            raise ValueError("单媒体智投行为必须是曝光或点击")
        cls._validate_ad_behavior_payload(
            payload,
            cls.SINGLE_MEDIA_PACKAGE,
            required_fields=(("bhv", "行为"), ("time", "时间")),
            require_frequency=False,
        )

    @classmethod
    def _validate_ad_behavior_payload(
        cls,
        payload: dict[str, Any],
        package_name: str,
        required_fields: tuple[tuple[str, str], ...] = (
            ("account", "账号"),
            ("bhv", "行为"),
            ("time", "时间"),
        ),
        require_frequency: bool = True,
    ) -> None:
        for key, label in required_fields:
            if payload.get(key) in (None, "", []):
                raise ValueError(f"{package_name}必须选择{label}")

        if require_frequency:
            frequency = payload.get("dayFrequency")
            if not isinstance(frequency, dict):
                raise ValueError(f"{package_name}天数格式不正确")
            minimum = cls._safe_number(frequency.get("min"))
            maximum = cls._safe_number(frequency.get("max"))
            if maximum != "" and minimum == "":
                raise ValueError(f"{package_name}天数不支持仅填写最大值")
            for value in (minimum, maximum):
                if value != "" and (not isinstance(value, int) or value < 1):
                    raise ValueError(f"{package_name}天数必须是大于0的整数")
            if minimum != "" and maximum != "" and minimum > maximum:
                raise ValueError(f"{package_name}天数最小值不能大于最大值")

        time_value = payload.get("time")
        if not isinstance(time_value, dict) or time_value.get("min") not in {
            "recent",
            "range",
        }:
            raise ValueError(f"{package_name}时间格式不正确")
        values = time_value.get("val")
        if not isinstance(values, dict):
            raise ValueError(f"{package_name}时间值不能为空")
        if time_value["min"] == "recent":
            days = cls._safe_number(values.get("days"))
            if not isinstance(days, int) or not 1 <= days <= 366:
                raise ValueError(f"{package_name}相对日期必须在1至366天之间")
            return

        start = str(values.get("start", "")).replace("-", "")
        end = str(values.get("end", "")).replace("-", "")
        if not re.fullmatch(r"\d{8}", start) or not re.fullmatch(r"\d{8}", end):
            raise ValueError(f"{package_name}固定日期必须使用YYYYMMDD格式")
        if start > end:
            raise ValueError(f"{package_name}固定日期开始时间不能晚于结束时间")

    @staticmethod
    def _order_mapping(source: dict[str, Any], preferred_order: tuple[str, ...]) -> dict[str, Any]:
        ordered: dict[str, Any] = {}
        for key in preferred_order:
            if key in source:
                ordered[key] = source[key]
        for key, value in source.items():
            if key not in ordered:
                ordered[key] = value
        return ordered

    def _load_base_template(self, package_name: str) -> dict[str, Any]:
        package_rows = self.params_df[
            self.params_df["Crowd_Package"].apply(lambda value: package_name in split_packages(value))
        ]
        if package_rows.empty:
            return {}
        raw = str(package_rows.iloc[0].get("Base_Template", "")).strip()
        if not raw:
            return {}
        return json.loads(raw)

    def _translate_value(
        self,
        package_name: str,
        key: str,
        value: Any,
        all_values: dict[str, Any],
    ) -> Any:
        if isinstance(value, list):
            return [self._translate_value(package_name, key, item, all_values) for item in value]
        if not isinstance(value, str):
            return value
        if key == "bhv":
            current_channel = all_values.get("channel", ["ALL"])
            channel_name = current_channel[0] if isinstance(current_channel, list) and current_channel else current_channel
            channel_name = channel_name or "ALL"
            if package_name == self.COMMODITY_PACKAGE:
                if isinstance(current_channel, list) and len(current_channel) != 1:
                    raise ValueError("商品行为请选择一个渠道后再生成 JSON；行为代码因渠道而异")
                if channel_name == "ALL":
                    raise ValueError("商品行为请选择一个渠道后再生成 JSON；行为代码因渠道而异")
                translated = self.bhv_translator.get(
                    (package_name, str(channel_name), value)
                )
                if translated is None:
                    raise ValueError(
                        f"商品行为“{value}”在“{channel_name}”渠道未配置行为代码，请检查已发布的行为维表"
                    )
                return translated
            return self.bhv_translator.get(
                (package_name, str(channel_name), value),
                self.bhv_translator.get((package_name, "ALL", value), value),
            )
        if key in {"onebp_scene", "ppob_scene"}:
            behavior_name = str(all_values.get("bhv", "")).strip()
            return self.scene_translator.get(
                (package_name, behavior_name, value),
                value,
            )
        return self.dim_translator.get((package_name, value), self.id_translator.get(value, value))

    def batch_generate(self, file_storage: Any) -> BatchGenerateResult:
        detected_pkg = "类目公域行为"
        filename = file_storage.filename or ""
        if "_" in filename:
            parts = filename.split("_")
            if len(parts) >= 2:
                detected_pkg = parts[1]

        try:
            content = file_storage.read().decode("utf-8-sig")
        except Exception:
            file_storage.seek(0)
            content = file_storage.read().decode("gbk")

        upload_df = pd.read_csv(io.StringIO(content))
        upload_df.columns = [str(col).strip() for col in upload_df.columns]

        package_params = self.params_df[self.params_df["Crowd_Package"].str.contains(detected_pkg, na=False)]
        label_to_key = {
            str(row["Label"]).strip(): str(row["Param_Key"]).strip()
            for _, row in package_params.iterrows()
        }
        key_to_widget = {
            str(row["Param_Key"]).strip(): str(row["Widget_Type"]).strip()
            for _, row in package_params.iterrows()
        }

        results: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        first_col = str(upload_df.columns[0])

        for idx, row in upload_df.iterrows():
            crowd_name = str(row[first_col]).strip() if pd.notna(row[first_col]) else f"未命名包_{idx}"
            payload: dict[str, Any] = {"_package": detected_pkg}

            for label, value in row.items():
                if label == first_col or pd.isna(value):
                    continue
                key = label_to_key.get(label)
                if not key:
                    continue
                value_str = str(value).strip()
                widget_type = key_to_widget.get(key, "")

                if widget_type in ["复选组", "搜索多选", "列表输入", "下拉多选"]:
                    payload[key] = [part.strip() for part in re.split(r"[,，]", value_str) if part.strip()]
                elif widget_type == "数值_切换" and value_str != "不限":
                    if "≥" in value_str or ">=" in value_str:
                        payload[key] = {"min": re.sub(r"[^0-9.]", "", value_str), "max": None}
                    elif "-" in value_str:
                        start, end = value_str.split("-", 1)
                        payload[key] = {"min": start.strip(), "max": end.strip()}
                elif widget_type == "日期_切换":
                    if "天" in value_str:
                        payload[key] = {"min": "recent", "val": {"days": int(re.sub(r"[^0-9]", "", value_str))}}
                    elif "-" in value_str:
                        start, end = value_str.split("-", 1)
                        payload[key] = {"min": "range", "val": {"start": start.replace("-", ""), "end": end.replace("-", "")}}
                else:
                    payload[key] = value_str

            try:
                node_json = self.generate_json(payload)
                if node_json.get("list"):
                    node_json["list"][0]["fromPoolId"] = 0
                    results.append(
                        {
                            "crowdName": crowd_name,
                            "pkgName": detected_pkg,
                            "localParams": payload,
                            "list": node_json["list"],
                            "compute": "(0)",
                        }
                    )
            except Exception as exc:
                errors.append({"row": int(idx), "crowdName": crowd_name, "error": str(exc)})

        return BatchGenerateResult(results=results, detected_pkg=detected_pkg, errors=errors)

    @staticmethod
    def _merge_path(doc: dict[str, Any], path: str, value: Any) -> None:
        keys = path.split(".")
        current = doc
        for key in keys[:-1]:
            current = current.setdefault(key, {})
        target = keys[-1]
        if target in current and isinstance(current[target], dict) and isinstance(value, dict):
            ConfigEngine._deep_update(current[target], value)
        else:
            current[target] = value

    @staticmethod
    def _deep_update(target: dict[str, Any], source: dict[str, Any]) -> None:
        for key, value in source.items():
            if key in target and isinstance(target[key], dict) and isinstance(value, dict):
                ConfigEngine._deep_update(target[key], value)
            else:
                target[key] = value

    @staticmethod
    def _safe_number(value: Any) -> Any:
        if value is None or str(value).strip() == "":
            return ""
        try:
            return int(value)
        except (ValueError, TypeError):
            try:
                return float(value)
            except (ValueError, TypeError):
                return ""

    @property
    def template_dir(self) -> str:
        return project_path(TEMPLATE_DIRNAME)
