"""Shared helpers for API tests that must never touch the runtime database."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


@dataclass
class IsolatedTestApp:
    temporary_directory: TemporaryDirectory
    app: object
    engine: object
    client: object
    db_path: str
    user: dict

    def close(self) -> None:
        self.temporary_directory.cleanup()


def create_authenticated_test_app(
    username: str = "test-user",
    password: str = "test-password",
) -> IsolatedTestApp:
    temporary_directory = TemporaryDirectory(prefix="cdp-tests-")
    db_path = str(Path(temporary_directory.name) / "test.db")
    app, engine = create_app(
        {
            "TESTING": True,
            "DB_PATH": db_path,
            "SECRET_KEY": "test-only-secret",
            "SESSION_COOKIE_SECURE": False,
        }
    )
    user = UserStore(db_path).create_user(username, password, username)
    client = app.test_client()
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )
    if response.status_code != 200:
        temporary_directory.cleanup()
        raise RuntimeError("Unable to establish an authenticated test session")
    return IsolatedTestApp(
        temporary_directory=temporary_directory,
        app=app,
        engine=engine,
        client=client,
        db_path=db_path,
        user=user,
    )
