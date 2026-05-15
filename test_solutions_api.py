from pathlib import Path
from tempfile import TemporaryDirectory
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
                "nodes": [{"id": "node_1", "packageType": "类目公域行为", "operator": None, "formData": {}, "modeData": {}}],
                "workbenchFieldIds": [],
            }
        )
        self.assertEqual(created["status"], "draft")
        self.assertTrue(self.file_path.exists())
        listed = self.store.list_solutions(status="draft")
        self.assertEqual([item["id"] for item in listed], [created["id"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
