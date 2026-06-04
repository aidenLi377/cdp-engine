import json
import os
import tempfile
import unittest
from pathlib import Path


class TestTaskStore(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        from cdp_backend.rpa_agent.task_store import TaskStore
        self.store = TaskStore(Path(self.tmpdir) / "tasks")

    def tearDown(self):
        for root, dirs, files in os.walk(self.tmpdir, topdown=False):
            for name in files:
                os.unlink(os.path.join(root, name))
            for name in dirs:
                os.rmdir(os.path.join(root, name))
        os.rmdir(self.tmpdir)

    def test_create_task_returns_valid_id(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["160571", "114555"],
        )
        self.assertTrue(task["id"].startswith("rpa_"))
        self.assertEqual(task["crowdName"], "测试人群")
        self.assertEqual(task["status"], "pending")

    def test_get_task_returns_created_task(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["id"], task["id"])
        self.assertEqual(fetched["crowdName"], "测试人群")

    def test_update_progress_updates_task(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        self.store.update_progress(
            task["id"],
            status="running",
            step="databank_search",
            detail="搜索人群: 测试人群",
            percent=10,
        )
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["status"], "running")
        self.assertEqual(fetched["progress"]["step"], "databank_search")
        self.assertEqual(fetched["progress"]["percent"], 10)

    def test_update_result_sets_completed(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        self.store.update_result(
            task["id"],
            excel_filename="rpa_test.xlsx",
            preview_rows=[{"a": 1}],
            total_rows=100,
        )
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["status"], "completed")
        self.assertEqual(fetched["result"]["excelFilename"], "rpa_test.xlsx")
        self.assertEqual(fetched["result"]["totalRows"], 100)

    def test_mark_failed_sets_error(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        self.store.mark_failed(task["id"], "网络超时")
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["status"], "failed")
        self.assertEqual(fetched["error"], "网络超时")

    def test_list_tasks_returns_sorted_by_time(self):
        t1 = self.store.create_task(crowd_name="A", tag_ids=["1"])
        t2 = self.store.create_task(crowd_name="B", tag_ids=["2"])
        tasks = self.store.list_tasks()
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["id"], t2["id"])  # newest first

    def test_get_nonexistent_task_returns_none(self):
        self.assertIsNone(self.store.get_task("nonexistent"))


if __name__ == "__main__":
    unittest.main()
