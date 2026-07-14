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
    GOODS_TYPE_DIM_FILE,
    LOGIC_TRIGGER_CANDIDATES,
    PARAMS_FILE,
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
from .validator import validate_project_config


@dataclass
class BatchGenerateResult:
    results: list[dict[str, Any]]
    detected_pkg: str
    errors: list[dict[str, Any]]


class ConfigEngine:
    def __init__(self, logger: logging.Logger | None = None, validate_on_load: bool = True):
        self.logger = logger or logging.getLogger(__name__)
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
        self.load_config(validate_on_load=validate_on_load)

    def load_config(self, validate_on_load: bool = True) -> None:
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
        path = project_path(filename)
        if not os.path.exists(path):
            return pd.DataFrame()
        try:
            df, _ = read_csv_flexible(path)
            return df
        except Exception:
            return pd.DataFrame()

    def _load_dimension_tables(self) -> None:
        self.id_translator = {}
        self.dim_translator = {}
        self.dimensions = {}
        self.attr_options = {}
        self.bhv_translator = {}
        self.bhv_options = {}

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
            data_source = item.get("Data_Source")

            if data_source == BEHAVIOR_DIM_FILE:
                item["options"] = list(self.bhv_options.get(package_name, []))
            else:
                item["options"] = list(
                    self.attr_options.get((package_name, data_source), self.dimensions.get(data_source, []))
                )

            if package_name in ["AIPL状态", "商品行为"] and item["key"] in ["cate", "leafCates"]:
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
        selection_lv3: dict[str, Any] = {}

        for key, raw_val in payload.items():
            if current_pkg == "AIPL状态" and key == "cate":
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

            if state != "isEmpty":
                final_val = self._translate_value(current_pkg, key, cleaned_val, payload)
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
                if key in ["channel", "stdBrand", "leafCates", "bhv", "title", "types", "keywords"]:
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

        base_template = self._load_base_template(current_pkg)
        for top_key, value in selection_lv3.items():
            if top_key in base_template and isinstance(base_template[top_key], dict) and isinstance(value, dict):
                self._deep_update(base_template[top_key], value)
            else:
                base_template[top_key] = value

        if "selectionLv3" not in base_template:
            base_template["selectionLv3"] = {}

        base_template["fromPoolId"] = 0
        if "channel" in payload:
            channel_val = payload["channel"]
            base_template["selectionLv2Name"] = (
                channel_val[0] if isinstance(channel_val, list) and channel_val else str(channel_val)
            )

        return {"crowdName": "未命名", "list": [base_template], "compute": "(0)"}

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
            return self.bhv_translator.get(
                (package_name, str(channel_name), value),
                self.bhv_translator.get((package_name, "ALL", value), value),
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
