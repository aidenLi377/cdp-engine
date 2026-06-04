"""Smoke test for RPA module imports and non-browser logic.

Full browser integration tests require a running Chrome and logged-in sessions
and are intended for manual QA, not CI.
"""

import tempfile
import unittest
from pathlib import Path


class TestRpaModuleImports(unittest.TestCase):
    def test_all_modules_importable(self):
        from cdp_backend.rpa_agent import task_store, excel_builder, dmp_api
        from cdp_backend.rpa_agent import databank_bot, dmp_bot, orchestrator
        self.assertIsNotNone(task_store)
        self.assertIsNotNone(excel_builder)
        self.assertIsNotNone(dmp_api)
        self.assertIsNotNone(databank_bot)
        self.assertIsNotNone(dmp_bot)
        self.assertIsNotNone(orchestrator)


class TestEndToEndNonBrowser(unittest.TestCase):
    """Test the non-browser parts of the pipeline end-to-end."""

    def test_full_pipeline_without_browser(self):
        from cdp_backend.rpa_agent.task_store import TaskStore
        from cdp_backend.rpa_agent.excel_builder import ExcelBuilder
        from cdp_backend.rpa_agent.dmp_api import load_tags, filter_ready_tags, normalize_rebase

        # 1. Load tags
        tags = load_tags()
        self.assertGreater(len(tags), 0)
        ready = filter_ready_tags(tags)
        self.assertLessEqual(len(ready), len(tags))

        # 2. Build sample portrait data
        sample = [
            {"大类": "用户特征", "标签类型": "基础特征", "标签名称": "居住城市",
             "特征明细": "杭州", "人群占比": "15.00%", "Rebase": "", "点击TGI": 1.2, "转化TGI": 1.0},
            {"大类": "用户特征", "标签类型": "基础特征", "标签名称": "居住城市",
             "特征明细": "上海", "人群占比": "12.00%", "Rebase": "", "点击TGI": 0.9, "转化TGI": 1.1},
        ]

        # 3. Normalize
        result = normalize_rebase(sample)
        self.assertEqual(len(result), 2)
        self.assertNotEqual(result[0]["Rebase"], "")
        self.assertNotEqual(result[1]["Rebase"], "")

        # 4. Build Excel
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test.xlsx"
            builder = ExcelBuilder()
            builder.build(result, str(path))
            self.assertTrue(path.exists())
            self.assertGreater(path.stat().st_size, 0)

        # 5. Task store CRUD
        with tempfile.TemporaryDirectory() as tmpdir:
            store = TaskStore(Path(tmpdir))
            task = store.create_task("测试人群", ["160571"])
            self.assertTrue(task["id"].startswith("rpa_"))
            self.assertEqual(store.get_task(task["id"])["crowdName"], "测试人群")
            store.update_result(task["id"],
                excel_filename="test.xlsx", preview_rows=result, total_rows=2)
            completed = store.get_task(task["id"])
            self.assertEqual(completed["status"], "completed")
            self.assertEqual(completed["result"]["totalRows"], 2)


if __name__ == "__main__":
    unittest.main()
