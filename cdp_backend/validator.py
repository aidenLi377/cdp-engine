from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

from .constants import (
    BASE_DIR,
    DIMENSION_FILES,
    LOGIC_FILE_SUFFIX,
    PARAMS_FILE,
    REQUIRED_DIMENSION_COLUMNS,
    REQUIRED_PARAM_COLUMNS,
)
from .csv_utils import (
    infer_package_name_from_logic_filename,
    list_logic_files,
    project_path,
    read_csv_flexible,
    split_packages,
)


@dataclass
class ValidationIssue:
    level: str
    message: str


class ConfigValidationError(RuntimeError):
    def __init__(self, issues: list[ValidationIssue]):
        self.issues = issues
        summary = "\n".join(f"[{issue.level}] {issue.message}" for issue in issues)
        super().__init__(f"Configuration validation failed:\n{summary}")


def validate_project_config(base_dir: str = BASE_DIR) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    params_path = project_path(PARAMS_FILE)
    if not os.path.exists(params_path):
        issues.append(ValidationIssue("ERROR", f"缺少参数表: {params_path}"))
        raise ConfigValidationError(issues)

    params_df, _ = read_csv_flexible(params_path)
    missing_param_cols = [col for col in REQUIRED_PARAM_COLUMNS if col not in params_df.columns]
    for col in missing_param_cols:
        issues.append(ValidationIssue("ERROR", f"参数表缺少必需列: {col}"))

    logic_files = list_logic_files(base_dir)
    if not logic_files:
        issues.append(ValidationIssue("ERROR", "未找到任何逻辑表文件"))

    logic_packages: dict[str, str] = {}
    for path in logic_files:
        filename = os.path.basename(path)
        package_name = infer_package_name_from_logic_filename(filename)
        logic_packages[package_name] = path

    if "Crowd_Package" in params_df.columns:
        declared_packages = set()
        for value in params_df["Crowd_Package"]:
            declared_packages.update(split_packages(value))
        for package_name in sorted(declared_packages):
            if package_name not in logic_packages:
                issues.append(ValidationIssue("ERROR", f"参数表中的包缺少逻辑表: {package_name}"))

    if "Data_Source" in params_df.columns:
        for idx, row in params_df.iterrows():
            source = str(row.get("Data_Source", "")).strip()
            if not source or source == "-":
                continue
            if source not in DIMENSION_FILES:
                issues.append(
                    ValidationIssue("ERROR", f"参数表第 {idx + 2} 行引用了未知维表: {source}")
                )

    if "Backend_Template" in params_df.columns:
        for idx, row in params_df.iterrows():
            template = str(row.get("Backend_Template", "")).strip()
            if not template or template in {"-", "nan"}:
                continue
            try:
                json.loads(template)
            except Exception as exc:
                issues.append(
                    ValidationIssue("ERROR", f"参数表第 {idx + 2} 行 Backend_Template 不是合法 JSON: {exc}")
                )

    if "JSON_Path" in params_df.columns:
        for idx, row in params_df.iterrows():
            json_path = str(row.get("JSON_Path", "")).strip()
            if not json_path or json_path == "-":
                continue
            if ".." in json_path or json_path.startswith(".") or json_path.endswith("."):
                issues.append(ValidationIssue("ERROR", f"参数表第 {idx + 2} 行 JSON_Path 非法: {json_path}"))

    for filename, required_cols in REQUIRED_DIMENSION_COLUMNS.items():
        dim_path = project_path(filename)
        if not os.path.exists(dim_path):
            issues.append(ValidationIssue("ERROR", f"缺少维表文件: {filename}"))
            continue
        dim_df, _ = read_csv_flexible(dim_path)
        missing_cols = [col for col in required_cols if col not in dim_df.columns]
        for col in missing_cols:
            issues.append(ValidationIssue("ERROR", f"维表 {filename} 缺少必需列: {col}"))

    for path in logic_files:
        logic_df, _ = read_csv_flexible(path)
        if logic_df.empty:
            issues.append(ValidationIssue("WARNING", f"逻辑表为空: {os.path.basename(path)}"))

    errors = [issue for issue in issues if issue.level == "ERROR"]
    if errors:
        raise ConfigValidationError(issues)
    return issues
