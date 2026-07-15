"""User accounts for the lightweight session-based login flow."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from werkzeug.security import check_password_hash, generate_password_hash

from .database import get_db, init_db


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class UserAlreadyExistsError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class UserStore:
    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path
        init_db(self.db_path)

    @staticmethod
    def _public_user(row) -> dict:
        return {
            "id": row["id"],
            "username": row["username"],
            "displayName": row["display_name"] or row["username"],
            "enabled": bool(row["enabled"]),
            "createdAt": row["created_at"],
            "lastLoginAt": row["last_login_at"],
        }

    def create_user(self, username: str, password: str, display_name: str = "") -> dict:
        username = username.strip()
        display_name = display_name.strip() or username
        if not username or not password:
            raise ValueError("用户名和密码不能为空")

        now = _utc_now()
        user_id = f"user_{uuid4().hex}"
        with get_db(self.db_path) as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
            ).fetchone()
            if existing is not None:
                raise UserAlreadyExistsError(username)
            conn.execute(
                """INSERT INTO users (
                    id, username, password_hash, display_name, enabled,
                    created_at, last_login_at
                ) VALUES (?, ?, ?, ?, 1, ?, NULL)""",
                (user_id, username, generate_password_hash(password), display_name, now),
            )
        return self.get_user(user_id)

    def get_user(self, user_id: str | None) -> dict | None:
        if not user_id:
            return None
        with get_db(self.db_path) as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return self._public_user(row) if row is not None else None

    def get_by_username(self, username: str) -> dict | None:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username.strip(),)
            ).fetchone()
        return self._public_user(row) if row is not None else None

    def authenticate(self, username: str, password: str) -> dict | None:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username.strip(),)
            ).fetchone()
            if row is None or not row["enabled"] or not check_password_hash(row["password_hash"], password):
                return None
            now = _utc_now()
            conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, row["id"]))
            updated = dict(row)
            updated["last_login_at"] = now
        return self._public_user(updated)

    def reset_password(self, username: str, password: str) -> None:
        if not password:
            raise ValueError("密码不能为空")
        with get_db(self.db_path) as conn:
            cursor = conn.execute(
                "UPDATE users SET password_hash = ? WHERE username = ? COLLATE NOCASE",
                (generate_password_hash(password), username.strip()),
            )
            if cursor.rowcount == 0:
                raise UserNotFoundError(username)

    def list_users(self) -> list[dict]:
        with get_db(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM users ORDER BY created_at").fetchall()
        return [self._public_user(row) for row in rows]
