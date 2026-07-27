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


if __name__ == "__main__":
    unittest.main(verbosity=2)
