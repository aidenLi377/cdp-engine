"""One-time, guarded publication of the official effect-promotion scene IDs.

Run with --apply only after deploying the matching scene CSV. The script uses
DimensionStore's audited edit/publish methods instead of modifying published
rows directly. Dry-run is the default.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from cdp_backend.dimension_store import DimensionStore


FILENAME = "场景维表.csv"
PACKAGE = "效果推广"
BEHAVIOR = "点击"
EXPECTED_IDS = {
    "精准人群推广(整合原消费者运营)": ("15406", "15404"),
    "获客易": ("15387", "15385"),
    "其他场景推广-全店智投(原全店推)": ("15395", "15393"),
    "其他场景推广-活动加速": ("15393", "15391"),
    "其他场景推广-其他(对应原服务商场景)": ("15400", "15395"),
    "货品运营-测款快": ("15349", "15347"),
    "消费者运营-拉新快": ("15375", "15373"),
    "货品运营-货品加速": ("15370", "15368"),
    "货品运营-上新快": ("15364", "15362"),
    "消费者运营-会员快": ("15379", "15377"),
    "消费者运营-粉丝快": ("15391", "15389"),
    "消费者运营-追投快": ("15389", "15387"),
    "消费者运营-人群击穿": ("15383", "15381"),
    "原万相台-电商场景": ("15402", "15400"),
}


def _key(row: dict) -> tuple[str, str, str]:
    return row["适用的包"], row["适用的行为"], row["场景名称"]


def _read_csv(path: Path) -> dict[tuple[str, str, str], dict]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    result = {_key(row): row for row in rows}
    if len(result) != 67 or len(result) != len(rows):
        raise RuntimeError("Expected exactly 67 unique scene CSV rows")
    for name, (_, new_id) in EXPECTED_IDS.items():
        if result[(PACKAGE, BEHAVIOR, name)]["ID"] != new_id:
            raise RuntimeError(f"CSV does not contain the approved ID for {name}")
    return result


def _read_db(db_path: Path) -> tuple[dict[tuple[str, str, str], tuple[str, dict]], int]:
    with closing(sqlite3.connect(f"{db_path.resolve().as_uri()}?mode=ro", uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        pending = sum(
            conn.execute(f"SELECT COUNT(*) FROM {table} WHERE has_changes = 1").fetchone()[0]
            for table in ("dimension_rows", "field_option_orders")
        )
        rows = conn.execute(
            """SELECT id, published_data FROM dimension_rows
               WHERE dimension_file = ? AND is_published = 1
                 AND published_enabled = 1 AND published_deleted = 0""",
            (FILENAME,),
        ).fetchall()
    result = {}
    for row in rows:
        data = json.loads(row["published_data"])
        key = _key(data)
        if key in result:
            raise RuntimeError(f"Duplicate published scene row: {key}")
        result[key] = row["id"], data
    return result, pending


def _preflight(db_path: Path, csv_path: Path, expected_count: int) -> list[tuple[str, dict]]:
    target = _read_csv(csv_path)
    current, pending = _read_db(db_path)
    if pending:
        raise RuntimeError(f"There are {pending} unrelated unpublished configuration edits")
    if set(current) != set(target):
        raise RuntimeError("Published scene names differ from the approved CSV")

    updates = []
    for key, desired in target.items():
        row_id, existing = current[key]
        for column, value in desired.items():
            if column != "ID" and str(existing.get(column, "")) != str(value):
                raise RuntimeError(f"Unexpected change to {column} for {key}")
        old_id, new_id = EXPECTED_IDS.get(key[2], (None, None)) if key[:2] == (PACKAGE, BEHAVIOR) else (None, None)
        if existing["ID"] == desired["ID"]:
            continue
        if existing["ID"] != old_id or desired["ID"] != new_id:
            raise RuntimeError(f"Unexpected published ID for {key}: {existing['ID']}")
        updates.append((row_id, desired))
    if len(updates) != expected_count:
        raise RuntimeError(f"Expected {expected_count} ID updates; found {len(updates)}")
    return updates


def _backup(db_path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = backup_dir / f"cdp-scene-ids-{timestamp}-{uuid4().hex[:8]}.db"
    old_umask = os.umask(0o077)
    try:
        with closing(sqlite3.connect(str(db_path))) as source, closing(sqlite3.connect(str(backup_path))) as target:
            source.backup(target)
            if target.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed")
    finally:
        os.umask(old_umask)
    backup_path.chmod(0o600)
    return backup_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", type=Path, required=True)
    parser.add_argument("--csv-path", type=Path, required=True)
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--expected-count", type=int, default=13)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    updates = _preflight(args.db_path, args.csv_path, args.expected_count)
    print(f"Preflight OK: {len(updates)} approved ID updates; no unrelated drafts")
    if not args.apply:
        print("Dry run only; database unchanged")
        return
    if args.backup_dir is None:
        parser.error("--backup-dir is required with --apply")

    backup_path = _backup(args.db_path, args.backup_dir)
    print(f"Verified backup: {backup_path}")
    store = DimensionStore(str(args.db_path))
    for row_id, data in updates:
        store.update_row(FILENAME, row_id, data, "cdpdeploy")
    current, pending = _read_db(args.db_path)
    if pending != len(updates):
        raise RuntimeError(f"Draft count changed unexpectedly: {pending}")
    store.publish_changes("cdpdeploy", note="同步效果推广点击场景官方 ID")
    remaining = _preflight(args.db_path, args.csv_path, 0)
    if remaining:
        raise RuntimeError("Published scene IDs still differ from the approved CSV")
    print("Published scene table now matches all 67 CSV rows")


if __name__ == "__main__":
    main()
