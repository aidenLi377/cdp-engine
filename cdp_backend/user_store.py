"""User accounts for the lightweight session-based login flow."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
from uuid import uuid4

from werkzeug.security import check_password_hash, generate_password_hash

from .database import get_db, init_db


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class UserAlreadyExistsError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class InviteInvalidError(Exception):
    pass


class UserStore:
    ROLES = ("super_admin", "config_admin", "user")

    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path
        init_db(self.db_path)
        self._ensure_bootstrap_admin()

    @classmethod
    def _validate_role(cls, role: str) -> str:
        normalized = str(role or "").strip()
        if normalized not in cls.ROLES:
            raise ValueError("无效的用户角色")
        return normalized

    def _ensure_bootstrap_admin(self) -> None:
        """Give a legacy database a usable first administrator."""
        with get_db(self.db_path) as conn:
            has_admin = conn.execute(
                "SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1"
            ).fetchone()
            if has_admin is not None:
                return
            first_user = conn.execute(
                "SELECT id FROM users ORDER BY created_at, id LIMIT 1"
            ).fetchone()
            if first_user is not None:
                conn.execute(
                    "UPDATE users SET role = 'super_admin' WHERE id = ?",
                    (first_user["id"],),
                )

    @staticmethod
    def _public_user(row) -> dict:
        return {
            "id": row["id"],
            "username": row["username"],
            "displayName": row["display_name"] or row["username"],
            "enabled": bool(row["enabled"]),
            "role": row["role"] or "user",
            "createdAt": row["created_at"],
            "lastLoginAt": row["last_login_at"],
            "passwordChangedAt": row["password_changed_at"],
            "updatedAt": row["updated_at"] or row["created_at"],
            "sessionVersion": int(row["session_version"] or 1),
        }

    @staticmethod
    def _hash_invite(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _invite_status(row, now: str | None = None) -> str:
        if row["revoked_at"]:
            return "revoked"
        if row["used_at"]:
            return "used"
        current = now or _utc_now()
        if row["expires_at"] and row["expires_at"] <= current:
            return "expired"
        return "active"

    @classmethod
    def _public_invite(cls, row, token: str | None = None) -> dict:
        result = {
            "id": row["id"],
            "role": row["role"],
            "createdBy": row["created_by"],
            "createdAt": row["created_at"],
            "expiresAt": row["expires_at"],
            "usedAt": row["used_at"],
            "usedBy": row["used_by"],
            "revokedAt": row["revoked_at"],
            "status": cls._invite_status(row),
        }
        if token:
            result["token"] = token
            result["registerPath"] = f"/?invite={token}"
        return result

    def create_user(
        self,
        username: str,
        password: str,
        display_name: str = "",
        role: str | None = None,
    ) -> dict:
        username = username.strip()
        display_name = display_name.strip() or username
        if not username or not password:
            raise ValueError("用户名和密码不能为空")
        if len(username) > 80:
            raise ValueError("用户名不能超过 80 个字符")
        if len(password) < 8:
            raise ValueError("密码至少需要 8 位")

        now = _utc_now()
        user_id = f"user_{uuid4().hex}"
        with get_db(self.db_path) as conn:
            existing_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            assigned_role = (
                self._validate_role(role)
                if role is not None
                else ("super_admin" if existing_count == 0 else "user")
            )
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
            ).fetchone()
            if existing is not None:
                raise UserAlreadyExistsError(username)
            conn.execute(
                """INSERT INTO users (
                    id, username, password_hash, display_name, enabled,
                    role, created_at, last_login_at, password_changed_at,
                    updated_at, session_version
                ) VALUES (?, ?, ?, ?, 1, ?, ?, NULL, ?, ?, 1)""",
                (
                    user_id,
                    username,
                    generate_password_hash(password),
                    display_name,
                    assigned_role,
                    now,
                    now,
                    now,
                ),
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
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
                (username.strip(),),
            ).fetchone()
        if row is None:
            raise UserNotFoundError(username)
        self.reset_password_by_id(row["id"], password)

    def update_user(
        self,
        user_id: str,
        *,
        username: str,
        display_name: str,
        enabled: bool,
        role: str,
    ) -> dict:
        username = str(username or "").strip()
        display_name = str(display_name or "").strip() or username
        if not username:
            raise ValueError("登录账号不能为空")
        if len(username) > 80:
            raise ValueError("登录账号不能超过 80 个字符")
        if len(display_name) > 80:
            raise ValueError("显示名称不能超过 80 个字符")
        if not isinstance(enabled, bool):
            raise ValueError("enabled 必须是布尔值")
        role = self._validate_role(role)
        now = _utc_now()
        with get_db(self.db_path) as conn:
            current = conn.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
            if current is None:
                raise UserNotFoundError(user_id)
            duplicate = conn.execute(
                """SELECT id FROM users
                   WHERE username = ? COLLATE NOCASE AND id != ?""",
                (username, user_id),
            ).fetchone()
            if duplicate is not None:
                raise UserAlreadyExistsError(username)
            revoke_sessions = bool(current["enabled"]) and not enabled
            conn.execute(
                """UPDATE users
                   SET username = ?, display_name = ?, enabled = ?, role = ?,
                       updated_at = ?,
                       session_version = session_version + ?
                   WHERE id = ?""",
                (
                    username,
                    display_name,
                    1 if enabled else 0,
                    role,
                    now,
                    1 if revoke_sessions else 0,
                    user_id,
                ),
            )
        return self.get_user(user_id)

    def set_enabled(self, user_id: str, enabled: bool) -> dict:
        current = self.get_user(user_id)
        if current is None:
            raise UserNotFoundError(user_id)
        return self.update_user(
            user_id,
            username=current["username"],
            display_name=current["displayName"],
            enabled=enabled,
            role=current["role"],
        )

    def set_role(self, user_id: str, role: str) -> dict:
        current = self.get_user(user_id)
        if current is None:
            raise UserNotFoundError(user_id)
        return self.update_user(
            user_id,
            username=current["username"],
            display_name=current["displayName"],
            enabled=current["enabled"],
            role=role,
        )

    def reset_password_by_id(
        self,
        user_id: str,
        password: str | None = None,
        *,
        generate: bool = False,
    ) -> tuple[dict, str | None]:
        generated_password = secrets.token_urlsafe(12) if generate else None
        next_password = generated_password if generated_password is not None else password
        if not isinstance(next_password, str) or len(next_password) < 8:
            raise ValueError("密码至少需要 8 位")
        now = _utc_now()
        with get_db(self.db_path) as conn:
            cursor = conn.execute(
                """UPDATE users
                   SET password_hash = ?, password_changed_at = ?,
                       updated_at = ?, session_version = session_version + 1
                   WHERE id = ?""",
                (generate_password_hash(next_password), now, now, user_id),
            )
            if cursor.rowcount == 0:
                raise UserNotFoundError(user_id)
        return self.get_user(user_id), generated_password

    def revoke_sessions(self, user_id: str) -> dict:
        now = _utc_now()
        with get_db(self.db_path) as conn:
            cursor = conn.execute(
                """UPDATE users
                   SET session_version = session_version + 1, updated_at = ?
                   WHERE id = ?""",
                (now, user_id),
            )
            if cursor.rowcount == 0:
                raise UserNotFoundError(user_id)
        return self.get_user(user_id)

    def list_users(self) -> list[dict]:
        with get_db(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM users ORDER BY created_at").fetchall()
        return [self._public_user(row) for row in rows]

    def get_user_data_counts(self, user_id: str) -> dict[str, int]:
        with get_db(self.db_path) as conn:
            return {
                "solutions": conn.execute(
                    """SELECT COUNT(*) FROM solutions
                       WHERE owner_id = ? AND visibility = 'private'""",
                    (user_id,),
                ).fetchone()[0],
                "folders": conn.execute(
                    """SELECT COUNT(*) FROM folders
                       WHERE owner_id = ? AND visibility = 'private'""",
                    (user_id,),
                ).fetchone()[0],
                "tasks": conn.execute(
                    "SELECT COUNT(*) FROM tasks WHERE owner_id = ?",
                    (user_id,),
                ).fetchone()[0],
            }

    def record_audit(
        self,
        actor_user_id: str,
        action: str,
        *,
        target_user_id: str | None = None,
        details: dict | None = None,
    ) -> dict:
        audit_id = f"audit_{uuid4().hex}"
        now = _utc_now()
        with get_db(self.db_path) as conn:
            conn.execute(
                """INSERT INTO admin_audit_logs (
                    id, actor_user_id, target_user_id, action, details, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    audit_id,
                    actor_user_id,
                    target_user_id,
                    str(action or "").strip(),
                    json.dumps(details or {}, ensure_ascii=False),
                    now,
                ),
            )
        return {
            "id": audit_id,
            "actorUserId": actor_user_id,
            "targetUserId": target_user_id,
            "action": action,
            "details": details or {},
            "createdAt": now,
        }

    def list_audit_logs(
        self,
        *,
        limit: int = 100,
        target_user_id: str | None = None,
    ) -> list[dict]:
        limit = max(1, min(int(limit), 500))
        where = ""
        params: list = []
        if target_user_id:
            where = "WHERE logs.target_user_id = ?"
            params.append(target_user_id)
        params.append(limit)
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                f"""SELECT logs.*,
                           actor.username AS actor_username,
                           actor.display_name AS actor_display_name,
                           target.username AS target_username,
                           target.display_name AS target_display_name
                    FROM admin_audit_logs AS logs
                    LEFT JOIN users AS actor ON actor.id = logs.actor_user_id
                    LEFT JOIN users AS target ON target.id = logs.target_user_id
                    {where}
                    ORDER BY logs.created_at DESC
                    LIMIT ?""",
                tuple(params),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "actorUserId": row["actor_user_id"],
                "actorUsername": row["actor_username"],
                "actorDisplayName": row["actor_display_name"],
                "targetUserId": row["target_user_id"],
                "targetUsername": row["target_username"],
                "targetDisplayName": row["target_display_name"],
                "action": row["action"],
                "details": json.loads(row["details"] or "{}"),
                "createdAt": row["created_at"],
            }
            for row in rows
        ]

    def delete_audit_log(self, audit_id: str) -> bool:
        with get_db(self.db_path) as conn:
            deleted = conn.execute(
                "DELETE FROM admin_audit_logs WHERE id = ?",
                (audit_id,),
            )
            return deleted.rowcount > 0

    def create_invite(
        self,
        created_by: str,
        role: str = "user",
        expires_days: int = 7,
    ) -> dict:
        role = self._validate_role(role)
        if not isinstance(expires_days, int) or not 1 <= expires_days <= 30:
            raise ValueError("邀请码有效期需要在 1 到 30 天之间")
        token = secrets.token_urlsafe(32)
        now = _utc_now()
        expires_at = (
            datetime.now(timezone.utc).replace(microsecond=0)
            + timedelta(days=expires_days)
        ).isoformat().replace("+00:00", "Z")
        invite_id = f"invite_{uuid4().hex}"
        with get_db(self.db_path) as conn:
            conn.execute(
                """INSERT INTO registration_invites (
                    id, token_hash, role, created_by, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    invite_id,
                    self._hash_invite(token),
                    role,
                    created_by,
                    now,
                    expires_at,
                ),
            )
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM registration_invites WHERE id = ?", (invite_id,)
            ).fetchone()
        return self._public_invite(row, token)

    def list_invites(self) -> list[dict]:
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                "SELECT * FROM registration_invites ORDER BY created_at DESC"
            ).fetchall()
        return [self._public_invite(row) for row in rows]

    def revoke_invite(self, invite_id: str) -> dict:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM registration_invites WHERE id = ?", (invite_id,)
            ).fetchone()
            if row is None:
                raise InviteInvalidError("邀请码不存在")
            if self._invite_status(row) != "active":
                raise InviteInvalidError("该邀请码已经失效")
            conn.execute(
                "UPDATE registration_invites SET revoked_at = ? WHERE id = ?",
                (_utc_now(), invite_id),
            )
            updated = conn.execute(
                "SELECT * FROM registration_invites WHERE id = ?", (invite_id,)
            ).fetchone()
        return self._public_invite(updated)

    def get_invite(self, token: str) -> dict:
        token = str(token or "").strip()
        if not token:
            raise InviteInvalidError("邀请链接无效")
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM registration_invites WHERE token_hash = ?",
                (self._hash_invite(token),),
            ).fetchone()
        if row is None or self._invite_status(row) != "active":
            raise InviteInvalidError("邀请链接已失效或不存在")
        return self._public_invite(row)

    def register_with_invite(
        self,
        token: str,
        username: str,
        password: str,
        display_name: str = "",
    ) -> dict:
        token = str(token or "").strip()
        username = str(username or "").strip()
        display_name = str(display_name or "").strip() or username
        if not token:
            raise InviteInvalidError("邀请链接无效")
        if not username or not password:
            raise ValueError("用户名和密码不能为空")
        if len(username) > 80:
            raise ValueError("用户名不能超过 80 个字符")
        if len(password) < 8:
            raise ValueError("密码至少需要 8 位")

        now = _utc_now()
        user_id = f"user_{uuid4().hex}"
        with get_db(self.db_path) as conn:
            invite = conn.execute(
                "SELECT * FROM registration_invites WHERE token_hash = ?",
                (self._hash_invite(token),),
            ).fetchone()
            if invite is None or self._invite_status(invite, now) != "active":
                raise InviteInvalidError("邀请链接已失效或不存在")
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
            if existing is not None:
                raise UserAlreadyExistsError(username)
            conn.execute(
                """INSERT INTO users (
                    id, username, password_hash, display_name, enabled,
                    role, created_at, last_login_at, password_changed_at,
                    updated_at, session_version
                ) VALUES (?, ?, ?, ?, 1, ?, ?, NULL, ?, ?, 1)""",
                (
                    user_id,
                    username,
                    generate_password_hash(password),
                    display_name,
                    invite["role"],
                    now,
                    now,
                    now,
                ),
            )
            conn.execute(
                """UPDATE registration_invites
                   SET used_at = ?, used_by = ?
                   WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL""",
                (now, user_id, invite["id"]),
            )
        return self.get_user(user_id)
