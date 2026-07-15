from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import unittest

from cdp_backend.solution_store import SolutionStore


class SolutionStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-store-tests-")
        self.store = SolutionStore(str(Path(self.temporary_directory.name) / "test.db"))
        self.user_id = "user_store_test"

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_create_and_list_draft(self):
        created = self.store.create_draft(
            {
                "name": "测试方案",
                "source": "manual",
                "defaultCrowdName": "测试方案",
                "nodes": [{"id": "node_1", "displayName": "主链路", "packageType": "类目公域行为", "operator": None, "formData": {}, "modeData": {}}],
                "workbenchFieldIds": [],
            },
            self.user_id,
        )
        self.assertEqual(created["status"], "draft")
        self.assertEqual(created["nodes"][0]["displayName"], "主链路")

        listed = self.store.list_solutions(status="draft", scope="mine", user_id=self.user_id)
        self.assertIn(created["id"], [item["id"] for item in listed])

    def test_create_draft_concurrent_writes_both_persisted(self):
        """Two concurrent creates via separate connections — both survive (SQLite WAL serialises writes)."""
        start_barrier = threading.Barrier(2)

        def create_draft(name: str):
            start_barrier.wait(timeout=1)
            return self.store.create_draft(
                {
                    "name": name,
                    "source": "manual",
                    "defaultCrowdName": name,
                    "nodes": [],
                    "workbenchFieldIds": [],
                },
                self.user_id,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(create_draft, "方案A"),
                executor.submit(create_draft, "方案B"),
            ]
            created = [future.result(timeout=2) for future in futures]

        self.assertEqual(len(created), 2)
        self.assertTrue(all(item["status"] == "draft" for item in created))

        listed = self.store.list_solutions(status="draft", scope="mine", user_id=self.user_id)
        created_ids = {item["id"] for item in created}
        listed_ids = {item["id"] for item in listed}
        self.assertTrue(created_ids.issubset(listed_ids))


if __name__ == "__main__":
    unittest.main(verbosity=2)
