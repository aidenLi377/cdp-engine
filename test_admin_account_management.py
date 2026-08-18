import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class AdminAccountManagementApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-admin-account-tests-")
        self.db_path = str(Path(self.temporary_directory.name) / "admin.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "SECRET_KEY": "admin-account-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        store = UserStore(self.db_path)
        self.admin = store.create_user(
            "root-admin",
            "root-password",
            "Root Admin",
            role="super_admin",
        )
        self.target = store.create_user(
            "target-user",
            "target-password",
            "Target User",
            role="user",
        )
        self.admin_client = self.app.test_client()
        self.target_client = self.app.test_client()
        self._login(self.admin_client, "root-admin", "root-password")
        self._login(self.target_client, "target-user", "target-password")

    def tearDown(self):
        self.temporary_directory.cleanup()

    @staticmethod
    def _login(client, username, password):
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        assert response.status_code == 200, response.get_json()

    def test_admin_can_update_profile_and_duplicate_username_is_rejected(self):
        updated = self.admin_client.patch(
            f"/api/admin/users/{self.target['id']}",
            json={
                "username": "target-renamed",
                "displayName": "Renamed Target",
                "role": "config_admin",
                "enabled": True,
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["username"], "target-renamed")
        self.assertEqual(updated.get_json()["displayName"], "Renamed Target")
        self.assertEqual(updated.get_json()["role"], "config_admin")

        duplicate = self.admin_client.patch(
            f"/api/admin/users/{self.target['id']}",
            json={
                "username": "root-admin",
                "displayName": "Renamed Target",
                "role": "config_admin",
                "enabled": True,
            },
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.get_json()["code"], "USERNAME_EXISTS")

    def test_password_reset_and_force_logout_revoke_existing_sessions(self):
        reset = self.admin_client.post(
            f"/api/admin/users/{self.target['id']}/password",
            json={"password": "new-target-password"},
        )
        self.assertEqual(reset.status_code, 200)
        self.assertNotIn("password", reset.get_json())
        self.assertEqual(
            self.target_client.get("/api/auth/me").status_code,
            401,
        )

        self._login(self.target_client, "target-user", "new-target-password")
        revoked = self.admin_client.post(
            f"/api/admin/users/{self.target['id']}/sessions/revoke"
        )
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(self.target_client.get("/api/auth/me").status_code, 401)

    def test_generated_password_is_returned_once_and_audit_never_contains_it(self):
        reset = self.admin_client.post(
            f"/api/admin/users/{self.target['id']}/password",
            json={"generate": True},
        )
        self.assertEqual(reset.status_code, 200)
        temporary_password = reset.get_json().get("temporaryPassword")
        self.assertTrue(temporary_password)
        self.assertIn(temporary_password, reset.get_data(as_text=True))

        logs = self.admin_client.get("/api/admin/audit-logs").get_json()
        password_logs = [item for item in logs if item["action"] == "USER_PASSWORD_RESET"]
        self.assertTrue(password_logs)
        self.assertNotIn(temporary_password, str(password_logs))

    def test_only_super_admin_can_delete_audit_logs(self):
        self.admin_client.get(f"/api/admin/users/{self.target['id']}/data")
        logs = self.admin_client.get("/api/admin/audit-logs").get_json()
        self.assertTrue(logs)
        audit_id = logs[0]["id"]

        denied = self.target_client.delete(f"/api/admin/audit-logs/{audit_id}")
        self.assertEqual(denied.status_code, 403)

        deleted = self.admin_client.delete(f"/api/admin/audit-logs/{audit_id}")
        self.assertEqual(deleted.status_code, 200)
        remaining = self.admin_client.get("/api/admin/audit-logs").get_json()
        self.assertNotIn(audit_id, {item["id"] for item in remaining})
        self.assertTrue(any(item["action"] == "AUDIT_LOG_DELETED" for item in remaining))

    def test_super_admin_can_read_target_data_but_other_roles_cannot(self):
        created_solution = self.target_client.post(
            "/api/solutions/drafts",
            json={"name": "Target private", "nodes": []},
        )
        self.assertEqual(created_solution.status_code, 201)
        created_task = self.target_client.post(
            "/api/tasks",
            json={"name": "Target task"},
        )
        self.assertEqual(created_task.status_code, 201)

        data = self.admin_client.get(f"/api/admin/users/{self.target['id']}/data")
        self.assertEqual(data.status_code, 200)
        payload = data.get_json()
        self.assertEqual(payload["counts"]["solutions"], 1)
        self.assertEqual(payload["counts"]["tasks"], 1)
        self.assertEqual(payload["solutions"][0]["name"], "Target private")
        self.assertEqual(payload["tasks"][0]["name"], "Target task")

        self.assertEqual(
            self.target_client.get(f"/api/admin/users/{self.target['id']}/data").status_code,
            403,
        )

    def test_private_resource_mutations_hide_other_users_resources(self):
        created_solution = self.target_client.post(
            "/api/solutions/drafts",
            json={"name": "Private", "nodes": []},
        ).get_json()
        solution_id = created_solution["id"]
        self.assertEqual(
            self.admin_client.put(
                f"/api/solutions/{solution_id}",
                json={"name": "Nope", "nodes": []},
            ).status_code,
            404,
        )
        self.assertEqual(
            self.admin_client.delete(f"/api/solutions/{solution_id}").status_code,
            404,
        )

        created_folder = self.target_client.post(
            "/api/folders",
            json={"name": "Private folder"},
        ).get_json()
        folder_id = created_folder["id"]
        self.assertEqual(
            self.admin_client.put(
                f"/api/folders/{folder_id}",
                json={"name": "Nope"},
            ).status_code,
            404,
        )
        self.assertEqual(
            self.admin_client.delete(f"/api/folders/{folder_id}").status_code,
            404,
        )

    def test_admin_can_promote_exact_private_solution_version_to_public_library(self):
        created = self.target_client.post(
            "/api/solutions/drafts",
            json={
                "name": "值得沉淀的方案",
                "nodes": [{"id": "node-1", "name": "高价值人群"}],
            },
        ).get_json()
        public_folder = self.admin_client.post(
            "/api/folders",
            json={"name": "优秀方案", "scope": "public"},
        ).get_json()

        promoted_response = self.admin_client.post(
            f"/api/admin/users/{self.target['id']}/solutions/{created['id']}/promote",
            json={"folderId": public_folder["id"]},
        )
        self.assertEqual(promoted_response.status_code, 201)
        promoted = promoted_response.get_json()
        self.assertEqual(promoted["visibility"], "public")
        self.assertEqual(promoted["status"], "published")
        self.assertEqual(promoted["source"], "admin-promoted")
        self.assertEqual(promoted["folderId"], public_folder["id"])
        self.assertEqual(promoted["derivedFromSolutionId"], created["id"])
        self.assertEqual(promoted["nodes"][0]["name"], "高价值人群")

        mine = self.target_client.get("/api/solutions?scope=mine").get_json()
        public = self.target_client.get("/api/solutions?scope=public").get_json()
        self.assertIn(created["id"], {item["id"] for item in mine})
        self.assertIn(promoted["id"], {item["id"] for item in public})

        duplicate = self.admin_client.post(
            f"/api/admin/users/{self.target['id']}/solutions/{created['id']}/promote",
            json={},
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.get_json()["code"], "SOLUTION_ALREADY_PROMOTED")

    def test_admin_can_delete_account_and_private_data(self):
        self.target_client.post(
            "/api/solutions/drafts",
            json={"name": "Delete with account", "nodes": []},
        )
        self.target_client.post("/api/tasks", json={"name": "Delete task"})

        deleted = self.admin_client.delete(f"/api/admin/users/{self.target['id']}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.get_json()["deletedData"]["solutions"], 1)
        self.assertEqual(deleted.get_json()["deletedData"]["tasks"], 1)
        self.assertEqual(self.target_client.get("/api/auth/me").status_code, 401)
        listed_ids = {
            user["id"] for user in self.admin_client.get("/api/admin/users").get_json()
        }
        self.assertNotIn(self.target["id"], listed_ids)

        logs = self.admin_client.get("/api/admin/audit-logs").get_json()
        deletion = next(item for item in logs if item["action"] == "USER_DELETED")
        self.assertEqual(deletion["details"]["username"], "target-user")

    def test_admin_cannot_delete_own_account(self):
        response = self.admin_client.delete(f"/api/admin/users/{self.admin['id']}")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "SELF_DELETE")

    def test_user_can_update_profile_avatar_and_password(self):
        avatar = "data:image/png;base64,iVBORw0KGgo="
        updated = self.target_client.patch(
            "/api/auth/profile",
            json={
                "username": "self-renamed",
                "displayName": "Self Renamed",
                "avatarUrl": avatar,
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["user"]["username"], "self-renamed")
        self.assertEqual(updated.get_json()["user"]["avatarUrl"], avatar)

        second_session = self.app.test_client()
        self._login(second_session, "self-renamed", "target-password")
        wrong_password = self.target_client.patch(
            "/api/auth/profile",
            json={
                "username": "self-renamed",
                "displayName": "Self Renamed",
                "avatarUrl": avatar,
                "currentPassword": "wrong-password",
                "newPassword": "next-target-password",
            },
        )
        self.assertEqual(wrong_password.status_code, 400)
        self.assertEqual(wrong_password.get_json()["code"], "CURRENT_PASSWORD_INVALID")

        changed = self.target_client.patch(
            "/api/auth/profile",
            json={
                "username": "self-renamed",
                "displayName": "Self Renamed",
                "avatarUrl": avatar,
                "currentPassword": "target-password",
                "newPassword": "next-target-password",
            },
        )
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(self.target_client.get("/api/auth/me").status_code, 200)
        self.assertEqual(second_session.get("/api/auth/me").status_code, 401)
        self._login(self.app.test_client(), "self-renamed", "next-target-password")


if __name__ == "__main__":
    unittest.main(verbosity=2)
