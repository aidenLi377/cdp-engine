from __future__ import annotations

import unittest

from cdp_backend.folder_share_store import FolderShareStore
from test_support import create_authenticated_test_app


class PublicFolderCopyApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_app = create_authenticated_test_app("public-copy-user")
        cls.client = cls.test_app.client

    @classmethod
    def tearDownClass(cls):
        cls.test_app.close()

    def test_copies_nested_folders_and_solutions_without_changing_public_source(self):
        root = self.client.post("/api/folders", json={
            "name": "营销方案组", "scope": "mine", "executionMode": "calculate_only",
        }).get_json()
        child = self.client.post("/api/folders", json={
            "name": "搜索", "parentId": root["id"], "scope": "mine",
        }).get_json()
        source = self.client.post("/api/solutions/drafts", json={
            "name": "搜索词方案", "folderId": child["id"],
            "defaultCrowdName": "搜索词人群", "nodes": [{"id": "n1", "formData": {"word": "样例"}}],
            "customFields": [{"id": "f1", "name": "关键词", "defaultValue": "样例", "bindings": []}],
        }).get_json()
        self.client.post(f"/api/solutions/{source['id']}/publish")
        promoted = FolderShareStore(self.test_app.db_path).promote_private_folder(
            root["id"], self.test_app.user["id"], self.test_app.user["id"])
        public_id = promoted["folder"]["id"]

        first = self.client.post(f"/api/folders/{public_id}/copy-to-mine")
        second = self.client.post(f"/api/folders/{public_id}/copy-to-mine")
        self.assertEqual(first.status_code, 201, first.get_data(as_text=True))
        self.assertEqual(second.status_code, 201, second.get_data(as_text=True))
        self.assertEqual(first.get_json()["folderCount"], 2)
        self.assertEqual(first.get_json()["solutionCount"], 1)
        self.assertEqual(first.get_json()["folder"]["name"], "营销方案组 (1)")
        self.assertEqual(second.get_json()["folder"]["name"], "营销方案组 (2)")
        self.assertNotEqual(first.get_json()["folder"]["id"], public_id)

        private_tree = self.client.get("/api/folders?scope=mine").get_json()
        copy_root = next(item for item in private_tree if item["id"] == first.get_json()["folder"]["id"])
        self.assertEqual(copy_root["executionMode"], "calculate_only")
        self.assertEqual(copy_root["children"][0]["name"], "搜索")
        copied_solutions = [item for item in self.client.get("/api/solutions?scope=mine").get_json()
                            if item.get("folderId") == copy_root["children"][0]["id"]]
        self.assertEqual(len(copied_solutions), 1)
        self.assertEqual(copied_solutions[0]["status"], "published")
        self.assertEqual(copied_solutions[0]["nodes"][0]["formData"], {"word": "样例"})
        self.assertNotEqual(copied_solutions[0]["id"], source["id"])
        self.assertEqual(self.client.get(f"/api/folders/{root['id']}/copy-to-mine").status_code, 405)
        self.assertEqual(self.client.post(f"/api/folders/{root['id']}/copy-to-mine").status_code, 404)
        self.assertTrue(any(item["id"] == public_id for item in self.client.get("/api/folders?scope=public").get_json()))


if __name__ == "__main__":
    unittest.main()
