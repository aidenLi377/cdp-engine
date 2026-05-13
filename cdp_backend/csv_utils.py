from __future__ import annotations

import os
import re
from typing import Iterable

import pandas as pd

from .constants import BASE_DIR, LOGIC_FILE_SUFFIX


def project_path(*parts: str) -> str:
    return os.path.join(BASE_DIR, *parts)


def read_csv_flexible(path: str) -> tuple[pd.DataFrame, str]:
    last_error = None
    for encoding in ("utf-8", "gb18030"):
        try:
            df = pd.read_csv(path, encoding=encoding)
            df.columns = [str(col).strip() for col in df.columns]
            return df.where(pd.notnull(df), ""), encoding
        except Exception as exc:  # pragma: no cover - keeps original failure reason
            last_error = exc
    raise last_error  # type: ignore[misc]


def normalize_object_columns(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    for col in result.columns:
        if result[col].dtype == "object":
            result[col] = result[col].apply(lambda x: str(x).strip() if pd.notna(x) else x)
    return result


def list_logic_files(base_dir: str = BASE_DIR) -> list[str]:
    files = [
        os.path.join(base_dir, name)
        for name in os.listdir(base_dir)
        if name.endswith(LOGIC_FILE_SUFFIX)
    ]

    def sort_key(filename: str) -> int:
        match = re.match(r"^(\d+)", os.path.basename(filename))
        return int(match.group(1)) if match else 999

    return sorted(files, key=sort_key)


def split_packages(value: object) -> list[str]:
    if value is None or (hasattr(value, "__class__") and pd.isna(value)):
        return []
    return [part.strip() for part in str(value).split(",") if part.strip()]


def unique_preserve_order(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(values))


def infer_package_name_from_logic_filename(filename: str) -> str:
    base_name = filename
    if base_name.endswith(LOGIC_FILE_SUFFIX):
        base_name = base_name[: -len(LOGIC_FILE_SUFFIX)]
    base_name = re.sub(r"^\d+\.", "", base_name)
    if base_name.endswith("_逻辑表"):
        base_name = base_name[: -len("_逻辑表")]
    return base_name
