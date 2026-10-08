from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from cdp_backend.constants import CATEGORY_DIM_FILE
from cdp_backend.database import get_db
from cdp_backend.dimension_import import parse_official_dimension_json
from cdp_backend.dimension_store import DimensionStore


class DimensionCsvSeedTests(unittest.TestCase):
    def test_official_category_rename_does_not_restore_csv_name_on_restart(self):
        with TemporaryDirectory(prefix="cdp-dimension-seed-") as directory:
            csv_path = Path(directory) / CATEGORY_DIM_FILE
            csv_path.write_text(
                "适用的包,类目名称,cateId\n"
                "类目公域行为,卫生巾>私处护理,50016889\n",
                encoding="utf-8",
            )
            db_path = str(Path(directory) / "cdp.db")
            with (
                patch("cdp_backend.dimension_store.DIMENSION_FILES", [CATEGORY_DIM_FILE]),
                patch("cdp_backend.dimension_store.project_path", return_value=str(csv_path)),
            ):
                store = DimensionStore(db_path)
                self.assertEqual(
                    ["卫生巾>私处护理"],
                    [row["类目名称"] for row in store.read_dimension_rows(CATEGORY_DIM_FILE)],
                )

                parsed = parse_official_dimension_json(
                    json.dumps({"data": [{
                        "cateFullName": "卫生巾->经期用品",
                        "cateId": 50016889,
                        "children": None,
                    }]}),
                    CATEGORY_DIM_FILE,
                    "类目公域行为",
                )
                preview = store.preview_official_json_import(CATEGORY_DIM_FILE, parsed["rows"])
                self.assertTrue(preview["valid"])
                self.assertEqual(preview["updated"], 1)
                store.confirm_official_json_import(
                    CATEGORY_DIM_FILE, parsed["rows"], "seed-test",
                    preview["previewToken"], parsed["rowCount"],
                )
                store.publish_changes("seed-test", note="category rename")

                restarted = DimensionStore(db_path)
                self.assertEqual(
                    ["卫生巾>经期用品"],
                    [row["类目名称"] for row in restarted.read_dimension_rows(CATEGORY_DIM_FILE)],
                )
                category_check = next(
                    item for item in restarted.check_mapping_consistency()["checks"]
                    if item["dimensionFile"] == CATEGORY_DIM_FILE
                )
                self.assertEqual(category_check["conflictCount"], 0)

                with get_db(db_path) as conn:
                    conn.execute(
                        "DELETE FROM dimension_rows WHERE dimension_file = ?",
                        (CATEGORY_DIM_FILE,),
                    )
                self.assertEqual(
                    DimensionStore(db_path).read_dimension_rows(CATEGORY_DIM_FILE),
                    [],
                )


if __name__ == "__main__":
    unittest.main()
