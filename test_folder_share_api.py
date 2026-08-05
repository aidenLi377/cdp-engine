from __future__ import annotations

import os
import re
import unittest

os.environ["FLASK_ENV"] = "development"

from cdp_backend.database import get_db  # noqa: E402
from cdp_backend.user_store import UserStore  # noqa: E402
from test_support import create_authenticated_test_app  # noqa: E402


class FolderShareApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_app = create_authenticated_test_app("folder-share-owner")
        cls.owner_client = cls.test_app.client
        cls.receiver = UserStore(cls.test_app.db_path).create_user(
            "folder-share-receiver",
            "receiver-password",
            "接收人",
        )
        cls.receiver_client = cls.test_app.app.test_client()
        login = cls.receiver_client.post(
            "/api/auth/login",
            json={"username": "folder-share-receiver", "password": "receiver-password"},
        )
        if login.status_code != 200:
            raise RuntimeError("Unable to establish receiver session")

    @classmethod
    def tearDownClass(cls):
        cls.test_app.close()

    def create_folder(self, name: str, parent_id: str | None = None) -> dict:
        response = self.owner_client.post(
            "/api/folders",
            json={"name": name, "parentId": parent_id, "scope": "mine"},
        )
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def create_solution(self, name: str, folder_id: str, marker: str) -> dict:
        response = self.owner_client.post(
            "/api/solutions/drafts",
            json={
                "name": name,
                "folderId": folder_id,
                "defaultCrowdName": f"{name}人群",
                "nodes": [{"id": marker, "packageType": "类目公域行为", "formData": {"marker": marker}}],
                "customFields": [{"id": f"cf_{marker}", "name": f"字段{marker}", "bindings": []}],
                "workbenchFieldIds": [f"{marker}:field"],
            },
        )
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def test_share_phrase_previews_and_imports_an_independent_folder_snapshot(self):
        root = self.create_folder("流入流出策略")
        child = self.create_folder("高价值人群", root["id"])
        root_solution = self.create_solution("流入人群", root["id"], "root_node")
        child_solution = self.create_solution("高价值复购", child["id"], "child_node")
        publish = self.owner_client.post(f"/api/solutions/{child_solution['id']}/publish")
        self.assertEqual(publish.status_code, 200)

        share_response = self.owner_client.post(f"/api/folders/{root['id']}/share")
        self.assertEqual(share_response.status_code, 201)
        share = share_response.get_json()
        self.assertRegex(share["phrase"], r"CDP-FOLDER-(?:[A-F0-9]{4}-){5}[A-F0-9]{4}")
        self.assertEqual(share["folderName"], "流入流出策略")
        self.assertEqual(share["folderCount"], 2)
        self.assertEqual(share["solutionCount"], 2)

        preview_response = self.receiver_client.post(
            "/api/folder-shares/preview",
            json={"text": f"复制这段方案口令即可导入：{share['phrase']}"},
        )
        self.assertEqual(preview_response.status_code, 200)
        preview = preview_response.get_json()
        self.assertEqual(preview["folderName"], "流入流出策略")
        self.assertEqual(preview["sharedBy"], "folder-share-owner")
        self.assertEqual(preview["solutionCount"], 2)
        self.assertNotIn("snapshot", preview)
        self.assertNotIn("nodes", preview)

        import_response = self.receiver_client.post(
            "/api/folder-shares/import",
            json={"text": share["phrase"]},
        )
        self.assertEqual(import_response.status_code, 201)
        imported = import_response.get_json()
        self.assertEqual(imported["folder"]["name"], "流入流出策略")
        self.assertEqual(imported["folderCount"], 2)
        self.assertEqual(imported["solutionCount"], 2)

        receiver_folders = self.receiver_client.get("/api/folders?scope=mine").get_json()
        imported_root = next(item for item in receiver_folders if item["id"] == imported["folder"]["id"])
        self.assertEqual(len(imported_root.get("children", [])), 1)
        self.assertNotEqual(imported_root["id"], root["id"])

        receiver_solutions = self.receiver_client.get("/api/solutions?status=all&scope=mine").get_json()
        copied = [item for item in receiver_solutions if item.get("folderId") in {
            imported_root["id"], imported_root["children"][0]["id"]
        }]
        self.assertEqual(len(copied), 2)
        self.assertTrue(all(item["status"] == "draft" for item in copied))
        self.assertTrue(all(item["ownerId"] == self.receiver["id"] for item in copied))
        self.assertTrue(all(item["source"] == "shared-import" for item in copied))

        copied_root = next(item for item in copied if item["name"] == root_solution["name"])
        update_response = self.receiver_client.put(
            f"/api/solutions/{copied_root['id']}",
            json={"name": "接收人独立修改"},
        )
        self.assertEqual(update_response.status_code, 200)
        original = self.owner_client.get(f"/api/solutions/{root_solution['id']}").get_json()
        self.assertEqual(original["name"], "流入人群")

        audit_actions = {
            item["action"] for item in UserStore(self.test_app.db_path).list_audit_logs(limit=20)
        }
        self.assertIn("folder_share_created", audit_actions)
        self.assertIn("folder_share_imported", audit_actions)

    def test_invalid_and_expired_share_phrases_are_rejected(self):
        invalid = self.receiver_client.post(
            "/api/folder-shares/preview",
            json={"text": "这不是方案口令"},
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.get_json()["code"], "INVALID_FOLDER_SHARE_PHRASE")

        folder = self.create_folder("即将过期")
        share = self.owner_client.post(f"/api/folders/{folder['id']}/share").get_json()
        token = re.search(r"CDP-FOLDER-(?:[A-F0-9]{4}-){5}[A-F0-9]{4}", share["phrase"]).group(0)
        with get_db(self.test_app.db_path) as conn:
            conn.execute(
                "UPDATE folder_share_tokens SET expires_at = ? WHERE token_hash IS NOT NULL",
                ("2000-01-01T00:00:00Z",),
            )

        expired = self.receiver_client.post(
            "/api/folder-shares/preview",
            json={"text": token},
        )
        self.assertEqual(expired.status_code, 410)
        self.assertEqual(expired.get_json()["code"], "FOLDER_SHARE_EXPIRED")


if __name__ == "__main__":
    unittest.main(verbosity=2)
