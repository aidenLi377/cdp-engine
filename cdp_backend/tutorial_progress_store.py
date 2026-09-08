"""Per-account completion state for built-in interactive tutorials."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from .database import get_db, init_db


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class TutorialProgressValidationError(ValueError):
    pass


class TutorialProgressStore:
    _TUTORIAL_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,99}$")

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        init_db(self.db_path)

    @classmethod
    def _validate_tutorial_id(cls, tutorial_id: str) -> str:
        value = str(tutorial_id or "").strip()
        if not cls._TUTORIAL_ID_RE.fullmatch(value):
            raise TutorialProgressValidationError("教程编号不正确")
        return value

    def list_for_user(self, user_id: str) -> list[dict]:
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT tutorial_id, completed_at, updated_at
                   FROM tutorial_progress
                   WHERE user_id = ?
                   ORDER BY completed_at DESC""",
                (user_id,),
            ).fetchall()
        return [
            {
                "tutorialId": row["tutorial_id"],
                "completedAt": row["completed_at"],
                "updatedAt": row["updated_at"],
            }
            for row in rows
        ]

    def mark_complete(self, user_id: str, tutorial_id: str) -> dict:
        validated_id = self._validate_tutorial_id(tutorial_id)
        now = _utc_now()
        with get_db(self.db_path) as conn:
            conn.execute(
                """INSERT INTO tutorial_progress (
                       user_id, tutorial_id, completed_at, updated_at
                   ) VALUES (?, ?, ?, ?)
                   ON CONFLICT(user_id, tutorial_id) DO UPDATE SET
                       updated_at = excluded.updated_at""",
                (user_id, validated_id, now, now),
            )
            row = conn.execute(
                """SELECT tutorial_id, completed_at, updated_at
                   FROM tutorial_progress
                   WHERE user_id = ? AND tutorial_id = ?""",
                (user_id, validated_id),
            ).fetchone()
        return {
            "tutorialId": row["tutorial_id"],
            "completedAt": row["completed_at"],
            "updatedAt": row["updated_at"],
        }
