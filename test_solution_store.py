from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import time
import unittest

from cdp_backend.solution_store import SolutionStore


class SolutionStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.file_path = Path(self.temp_dir.name) / "solutions.json"
        self.store = SolutionStore(self.file_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_create_and_list_draft(self):
        created = self.store.create_draft(
            {
                "name": "测试方案",
                "source": "manual",
                "defaultCrowdName": "测试方案",
                "nodes": [{"id": "node_1", "displayName": "主链路", "packageType": "类目公域行为", "operator": None, "formData": {}, "modeData": {}}],
                "workbenchFieldIds": [],
            }
        )
        self.assertEqual(created["status"], "draft")
        self.assertEqual(created["nodes"][0]["displayName"], "主链路")
        self.assertTrue(self.file_path.exists())
        listed = self.store.list_solutions(status="draft")
        self.assertEqual([item["id"] for item in listed], [created["id"]])

    def test_create_draft_preserves_both_concurrent_writes(self):
        original_load = self.store._load
        original_write = self.store._write
        start_barrier = threading.Barrier(3)
        read_barrier = threading.Barrier(2)
        write_lock = threading.Lock()

        def delayed_load():
            data = original_load()
            try:
                read_barrier.wait(timeout=0.2)
            except threading.BrokenBarrierError:
                pass
            time.sleep(0.05)
            return data

        def serialized_write(data):
            with write_lock:
                original_write(data)

        self.store._load = delayed_load
        self.store._write = serialized_write

        def create_draft(name: str):
            start_barrier.wait(timeout=1)
            return self.store.create_draft(
                {
                    "name": name,
                    "source": "manual",
                    "defaultCrowdName": name,
                    "nodes": [],
                    "workbenchFieldIds": [],
                }
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(create_draft, "方案A"),
                executor.submit(create_draft, "方案B"),
            ]
            start_barrier.wait(timeout=1)
            created = [future.result(timeout=1) for future in futures]

        listed = self.store.list_solutions(status="draft")
        self.assertEqual(len(created), 2)
        self.assertEqual(len(listed), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
