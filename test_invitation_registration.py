from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class InvitationRegistrationApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-invite-tests-")
        self.db_path = str(Path(self.temporary_directory.name) / "invite.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "SECRET_KEY": "invite-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        users = UserStore(self.db_path)
        self.admin = users.create_user(
            "root", "root-password", "Root", role="super_admin"
        )
        self.admin_client = self.app.test_client()

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_super_admin_creates_single_use_invite_and_registers(self):
        self.admin_client.post(
            "/api/auth/login",
            json={"username": "root", "password": "root-password"},
        )
        response = self.admin_client.post(
            "/api/admin/invites",
            json={"role": "config_admin", "expiresDays": 7},
        )
        self.assertEqual(response.status_code, 201)
        invite = response.get_json()
        self.assertTrue(invite["token"])
        self.assertEqual(invite["role"], "config_admin")
        self.assertEqual(invite["status"], "active")

        guest = self.app.test_client()
        inspected = guest.get(f"/api/auth/invite?token={invite['token']}")
        self.assertEqual(inspected.status_code, 200)
        self.assertEqual(inspected.get_json()["role"], "config_admin")

        registered = guest.post(
            "/api/auth/register",
            json={
                "token": invite["token"],
                "username": "config-user",
                "displayName": "Config User",
                "password": "config-password",
            },
        )
        self.assertEqual(registered.status_code, 201)
        self.assertEqual(registered.get_json()["user"]["role"], "config_admin")
        self.assertEqual(guest.get("/api/auth/me").status_code, 200)

        reused = self.app.test_client().post(
            "/api/auth/register",
            json={
                "token": invite["token"],
                "username": "second-user",
                "password": "second-password",
            },
        )
        self.assertEqual(reused.status_code, 410)
        self.assertEqual(reused.get_json()["code"], "INVITE_INVALID")

    def test_non_admin_cannot_manage_invites(self):
        users = UserStore(self.db_path)
        users.create_user("normal", "normal-password", "Normal", role="user")
        client = self.app.test_client()
        client.post(
            "/api/auth/login",
            json={"username": "normal", "password": "normal-password"},
        )
        response = client.post("/api/admin/invites", json={"role": "user"})
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
