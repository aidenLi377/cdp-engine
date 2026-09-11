"""Per-account completion state for built-in interactive tutorials."""

from __future__ import annotations

import json
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
            conn.execute(
                "DELETE FROM tutorial_checkpoints WHERE user_id = ? AND tutorial_id = ?",
                (user_id, validated_id),
            )
            conn.execute(
                "DELETE FROM tutorial_step_checkpoints WHERE user_id = ? AND tutorial_id = ?",
                (user_id, validated_id),
            )
        return {
            "tutorialId": row["tutorial_id"],
            "completedAt": row["completed_at"],
            "updatedAt": row["updated_at"],
        }

    def list_checkpoints(self, user_id: str) -> list[dict]:
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT tutorial_id, step_id, step_index, step_title,
                          app_mode, context_json, session_json, updated_at
                   FROM tutorial_checkpoints
                   WHERE user_id = ?
                   ORDER BY updated_at DESC""",
                (user_id,),
            ).fetchall()
            step_rows = conn.execute(
                """SELECT tutorial_id, step_id, step_index, step_title,
                          app_mode, context_json, session_json, updated_at
                   FROM tutorial_step_checkpoints
                   WHERE user_id = ?
                   ORDER BY tutorial_id, step_index""",
                (user_id,),
            ).fetchall()
        steps_by_tutorial: dict[str, dict[str, dict]] = {}
        for row in step_rows:
            item = self._checkpoint_row_to_dict(row)
            steps_by_tutorial.setdefault(item["tutorialId"], {})[item["stepId"]] = item
        items = [self._checkpoint_row_to_dict(row) for row in rows]
        for item in items:
            item["stepCheckpoints"] = steps_by_tutorial.get(item["tutorialId"], {})
        return items

    @staticmethod
    def _safe_json_object(value, field_name: str) -> dict:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise TutorialProgressValidationError(f"{field_name}格式不正确")
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > 1_500_000:
            raise TutorialProgressValidationError(f"{field_name}内容过大")
        return value

    @staticmethod
    def _checkpoint_row_to_dict(row) -> dict:
        def decode(raw):
            try:
                value = json.loads(raw or "{}")
                return value if isinstance(value, dict) else {}
            except (TypeError, ValueError):
                return {}

        return {
            "tutorialId": row["tutorial_id"],
            "stepId": row["step_id"],
            "stepIndex": row["step_index"],
            "stepTitle": row["step_title"],
            "appMode": row["app_mode"],
            "context": decode(row["context_json"]),
            "sessionSnapshot": decode(row["session_json"]),
            "updatedAt": row["updated_at"],
        }

    def save_checkpoint(self, user_id: str, tutorial_id: str, payload: dict) -> dict:
        validated_id = self._validate_tutorial_id(tutorial_id)
        step_id = self._validate_tutorial_id(payload.get("stepId", ""))
        try:
            step_index = int(payload.get("stepIndex", 0))
        except (TypeError, ValueError) as exc:
            raise TutorialProgressValidationError("教程步骤序号不正确") from exc
        if step_index < 0 or step_index > 1000:
            raise TutorialProgressValidationError("教程步骤序号不正确")
        step_title = str(payload.get("stepTitle") or "").strip()[:200]
        app_mode = str(payload.get("appMode") or "workbench").strip()
        if app_mode not in {"workbench", "solutions", "task-center"}:
            app_mode = "workbench"
        context = self._safe_json_object(payload.get("context"), "教程上下文")
        session_snapshot = self._safe_json_object(payload.get("sessionSnapshot"), "教程恢复数据")
        now = _utc_now()
        with get_db(self.db_path) as conn:
            conn.execute(
                """INSERT INTO tutorial_checkpoints (
                       user_id, tutorial_id, step_id, step_index, step_title,
                       app_mode, context_json, session_json, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id, tutorial_id) DO UPDATE SET
                       step_id = excluded.step_id,
                       step_index = excluded.step_index,
                       step_title = excluded.step_title,
                       app_mode = excluded.app_mode,
                       context_json = excluded.context_json,
                       session_json = excluded.session_json,
                       updated_at = excluded.updated_at""",
                (
                    user_id,
                    validated_id,
                    step_id,
                    step_index,
                    step_title,
                    app_mode,
                    json.dumps(context, ensure_ascii=False, separators=(",", ":")),
                    json.dumps(session_snapshot, ensure_ascii=False, separators=(",", ":")),
                    now,
                ),
            )
            conn.execute(
                """INSERT INTO tutorial_step_checkpoints (
                       user_id, tutorial_id, step_id, step_index, step_title,
                       app_mode, context_json, session_json, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id, tutorial_id, step_id) DO UPDATE SET
                       step_index = excluded.step_index,
                       step_title = excluded.step_title,
                       app_mode = excluded.app_mode,
                       context_json = excluded.context_json,
                       session_json = excluded.session_json,
                       updated_at = excluded.updated_at""",
                (
                    user_id,
                    validated_id,
                    step_id,
                    step_index,
                    step_title,
                    app_mode,
                    json.dumps(context, ensure_ascii=False, separators=(",", ":")),
                    json.dumps(session_snapshot, ensure_ascii=False, separators=(",", ":")),
                    now,
                ),
            )
            row = conn.execute(
                """SELECT tutorial_id, step_id, step_index, step_title,
                          app_mode, context_json, session_json, updated_at
                   FROM tutorial_checkpoints
                   WHERE user_id = ? AND tutorial_id = ?""",
                (user_id, validated_id),
            ).fetchone()
            step_rows = conn.execute(
                """SELECT tutorial_id, step_id, step_index, step_title,
                          app_mode, context_json, session_json, updated_at
                   FROM tutorial_step_checkpoints
                   WHERE user_id = ? AND tutorial_id = ?
                   ORDER BY step_index""",
                (user_id, validated_id),
            ).fetchall()
        item = self._checkpoint_row_to_dict(row)
        item["stepCheckpoints"] = {
            step["stepId"]: step
            for step in (self._checkpoint_row_to_dict(step_row) for step_row in step_rows)
        }
        return item

    def delete_checkpoint(self, user_id: str, tutorial_id: str) -> bool:
        validated_id = self._validate_tutorial_id(tutorial_id)
        with get_db(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM tutorial_checkpoints WHERE user_id = ? AND tutorial_id = ?",
                (user_id, validated_id),
            )
            conn.execute(
                "DELETE FROM tutorial_step_checkpoints WHERE user_id = ? AND tutorial_id = ?",
                (user_id, validated_id),
            )
        return cursor.rowcount > 0
