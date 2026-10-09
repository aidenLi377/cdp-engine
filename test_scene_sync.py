from __future__ import annotations

import csv
import json
import sqlite3
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from deploy.sync_scene_ids import (
    BEHAVIOR,
    EXPECTED_IDS,
    PACKAGE,
    _assert_only_approved_drafts,
    _preflight,
)


CSV_PATH = Path(__file__).with_name("场景维表.csv")


class SceneSyncPreflightTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="cdp-scene-sync-")
        self.addCleanup(self.directory.cleanup)
        self.db_path = Path(self.directory.name) / "cdp.db"
        with CSV_PATH.open(encoding="utf-8-sig", newline="") as source:
            rows = list(csv.DictReader(source))
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute(
                """CREATE TABLE dimension_rows (
                     id TEXT, dimension_file TEXT, published_data TEXT,
                     is_published INTEGER, published_enabled INTEGER,
                     published_deleted INTEGER, has_changes INTEGER)"""
            )
            conn.execute("CREATE TABLE field_option_orders (has_changes INTEGER)")
            for index, row in enumerate(rows):
                if row["适用的包"] == PACKAGE and row["适用的行为"] == BEHAVIOR:
                    pair = EXPECTED_IDS.get(row["场景名称"])
                    if pair and row["场景名称"] != "精准人群推广(整合原消费者运营)":
                        row["ID"] = pair[0]
                    if row["场景名称"] == "精准人群推广(整合原消费者运营)":
                        row.pop("排序")
                conn.execute(
                    "INSERT INTO dimension_rows VALUES (?, ?, ?, 1, 1, 0, 0)",
                    (f"scene_{index}", "场景维表.csv", json.dumps(row, ensure_ascii=False)),
                )
            conn.commit()

    def test_only_thirteen_approved_ids_need_publishing(self):
        updates = _preflight(self.db_path, CSV_PATH, 13)
        self.assertEqual(len(updates), 13)

    def test_unexpected_published_id_stops_migration(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            row = conn.execute(
                "SELECT id, published_data FROM dimension_rows WHERE id = 'scene_0'"
            ).fetchone()
            data = json.loads(row[1])
            data["ID"] = "999999"
            conn.execute(
                "UPDATE dimension_rows SET published_data = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=False), row[0]),
            )
            conn.commit()
        with self.assertRaisesRegex(RuntimeError, "Unexpected published ID"):
            _preflight(self.db_path, CSV_PATH, 13)

    def test_unrelated_draft_stops_migration(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute("INSERT INTO field_option_orders VALUES (1)")
            conn.commit()
        with self.assertRaisesRegex(RuntimeError, "unrelated unpublished"):
            _preflight(self.db_path, CSV_PATH, 13)

    def test_other_metadata_change_stops_migration(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            row = conn.execute(
                "SELECT id, published_data FROM dimension_rows WHERE id = 'scene_0'"
            ).fetchone()
            data = json.loads(row[1])
            data["场景名称"] = "unexpected"
            conn.execute(
                "UPDATE dimension_rows SET published_data = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=False), row[0]),
            )
            conn.commit()
        with self.assertRaisesRegex(RuntimeError, "Published scene names differ"):
            _preflight(self.db_path, CSV_PATH, 13)

    def test_only_expected_drafts_can_be_published(self):
        with closing(sqlite3.connect(self.db_path)) as conn:
            conn.execute("UPDATE dimension_rows SET has_changes = 1 WHERE id = 'scene_0'")
            conn.commit()
        _assert_only_approved_drafts(self.db_path, {"scene_0"})
        with self.assertRaisesRegex(RuntimeError, "Draft rows changed"):
            _assert_only_approved_drafts(self.db_path, {"scene_1"})


if __name__ == "__main__":
    unittest.main()
