from __future__ import annotations

import unittest

from cdp_backend.folder_share_store import FolderShareStore
from test_support import create_authenticated_test_app


class ParameterWriteBackApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_app = create_authenticated_test_app("parameter-write-back-user")
        cls.client = cls.test_app.client

    @classmethod
    def tearDownClass(cls):
        cls.test_app.close()

    def create_solution(self, name, folder_id=None):
        response = self.client.post("/api/solutions/drafts", json={
            "name": name, "folderId": folder_id, "defaultCrowdName": f"{name}人群",
            "nodes": [{"id": "node_1", "packageType": "商品行为", "operator": None,
                       "formData": {"bhv": ["浏览"]}, "modeData": {}}],
            "customFields": [{"id": "field_1", "name": "行为", "defaultValue": ["浏览"],
                              "bindings": [{"nodeId": "node_1", "fieldKey": "bhv"}]}],
        })
        self.assertEqual(response.status_code, 201, response.get_data(as_text=True))
        return response.get_json()

    def change(self, solution, value="购买"):
        return {"id": solution["id"], "expectedVersion": solution["_version"],
                "nodes": [{"id": "node_1", "formData": {"bhv": [value]}, "modeData": {}}],
                "customFields": [{"id": "field_1", "defaultValue": [value]}]}

    def test_values_write_back_preserves_structure_and_is_atomic_on_stale_version(self):
        first = self.create_solution("方案甲")
        second = self.create_solution("方案乙")
        published = self.client.post(f"/api/solutions/{first['id']}/publish").get_json()
        saved = self.client.post("/api/solutions/parameters/write-back", json={
            "changes": [self.change(published), self.change(second)]})
        self.assertEqual(saved.status_code, 200, saved.get_data(as_text=True))
        self.assertEqual(saved.get_json()["count"], 2)
        updated = self.client.get(f"/api/solutions/{first['id']}").get_json()
        self.assertEqual(updated["nodes"][0]["formData"]["bhv"], ["购买"])
        self.assertEqual(updated["nodes"][0]["packageType"], "商品行为")
        self.assertEqual(updated["customFields"][0]["bindings"], first["customFields"][0]["bindings"])
        self.assertEqual(updated["name"], "方案甲")

        stale = self.client.post("/api/solutions/parameters/write-back", json={
            "changes": [self.change(updated, "加购"), self.change(second, "加购")]})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.client.get(f"/api/solutions/{first['id']}").get_json()["nodes"][0]["formData"]["bhv"], ["购买"])

    def test_public_solution_cannot_be_written_back(self):
        folder = self.client.post("/api/folders", json={"name": "公开源", "scope": "mine"}).get_json()
        solution = self.create_solution("公共模板", folder["id"])
        promoted = FolderShareStore(self.test_app.db_path).promote_private_folder(
            folder["id"], self.test_app.user["id"], self.test_app.user["id"])
        public_id = promoted["solutionPromotions"][0]["publicSolutionId"]
        public = self.client.get(f"/api/solutions/{public_id}").get_json()
        response = self.client.post("/api/solutions/parameters/write-back", json={
            "changes": [self.change(public)]})
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
