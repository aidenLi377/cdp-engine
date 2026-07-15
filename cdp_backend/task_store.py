"""Task store backed by SQLite."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from .database import get_db, init_db

_TASK_KEY_MAP = {
    "id": "id",
    "name": "name",
    "type": "type",
    "crowd_name": "crowdName",
    "tag_ids": "tagIds",
    "status": "status",
    "phase": "phase",
    "phase_label": "phaseLabel",
    "progress": "progress",
    "message": "message",
    "result": "result",
    "crowd_count": "crowdCount",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
}
_TASK_COL_MAP = {v: k for k, v in _TASK_KEY_MAP.items()}

_JSON_FIELDS = {"tagIds", "result"}
_JSON_COLUMNS = {_TASK_COL_MAP[field] for field in _JSON_FIELDS}


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class TaskNotFoundError(Exception):
    pass


class TaskStore:
    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path
        init_db(self.db_path)

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _row_factory(cursor, row) -> dict:
        return {col[0]: row[i] for i, col in enumerate(cursor.description)}

    @staticmethod
    def _row_to_dict(row: dict) -> dict:
        result = {}
        for col, val in row.items():
            if col == "owner_id":
                continue
            key = _TASK_KEY_MAP.get(col, col)
            result[key] = val
        for field in _JSON_FIELDS:
            raw = result.get(field)
            result[field] = json.loads(raw) if isinstance(raw, str) else raw
        return result

    @staticmethod
    def _to_db(payload: dict) -> dict:
        result = {}
        for key, val in payload.items():
            col = _TASK_COL_MAP.get(key, key)
            result[col] = val
        for column in _JSON_COLUMNS:
            if column in result and not isinstance(result[column], str):
                result[column] = json.dumps(result[column], ensure_ascii=False)
        return result

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    def list_tasks(self, user_id: str) -> list[dict]:
        with get_db(self.db_path) as conn:
            conn.row_factory = self._row_factory
            rows = conn.execute(
                "SELECT * FROM tasks WHERE owner_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_task(self, task_id: str, user_id: str) -> dict | None:
        with get_db(self.db_path) as conn:
            conn.row_factory = self._row_factory
            row = conn.execute(
                "SELECT * FROM tasks WHERE id = ? AND owner_id = ?",
                (task_id, user_id),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def create_task(self, payload: dict, user_id: str) -> dict:
        now = _utc_now()
        task = {
            "id": f"task_{uuid4().hex}",
            "name": (payload.get("name") or "").strip(),
            "type": payload.get("type", ""),
            "crowdName": (payload.get("crowdName") or "").strip(),
            "tagIds": payload.get("tagIds", []),
            "status": "pending",
            "phase": 0,
            "phaseLabel": "已发起任务",
            "progress": 0,
            "message": "任务已创建，等待执行",
            "result": None,
            "crowdCount": None,
            "createdAt": now,
            "updatedAt": now,
        }
        db_row = self._to_db(task)
        db_row["owner_id"] = user_id
        with get_db(self.db_path) as conn:
            conn.execute(
                """INSERT INTO tasks (
                    id, owner_id, name, type, crowd_name, tag_ids,
                    status, phase, phase_label, progress, message,
                    result, crowd_count, created_at, updated_at
                ) VALUES (
                    :id, :owner_id, :name, :type, :crowd_name, :tag_ids,
                    :status, :phase, :phase_label, :progress, :message,
                    :result, :crowd_count, :created_at, :updated_at
                )""",
                db_row,
            )
        return task

    def update_progress(self, task_id: str, payload: dict, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            conn.row_factory = self._row_factory
            row = conn.execute(
                "SELECT * FROM tasks WHERE id = ? AND owner_id = ?",
                (task_id, user_id),
            ).fetchone()
            if row is None:
                raise TaskNotFoundError(task_id)
            item = self._row_to_dict(row)
            updated = {
                **item,
                "status": payload.get("status", item["status"]),
                "phase": payload.get("phase", item["phase"]),
                "phaseLabel": payload.get("phaseLabel", item["phaseLabel"]),
                "progress": payload.get("progress", item["progress"]),
                "message": payload.get("message", item["message"]),
                "result": payload["result"] if "result" in payload else item.get("result"),
                "crowdCount": payload["crowdCount"] if "crowdCount" in payload else item.get("crowdCount"),
                "updatedAt": _utc_now(),
            }
            db_row = self._to_db(updated)
            db_row["owner_id"] = user_id
            conn.execute(
                """UPDATE tasks SET
                    name = :name, type = :type, crowd_name = :crowd_name,
                    tag_ids = :tag_ids, status = :status, phase = :phase,
                    phase_label = :phase_label, progress = :progress,
                    message = :message, result = :result,
                    crowd_count = :crowd_count, created_at = :created_at,
                    updated_at = :updated_at
                WHERE id = :id AND owner_id = :owner_id""",
                db_row,
            )
        return updated

    def delete_task(self, task_id: str, user_id: str) -> bool:
        with get_db(self.db_path) as conn:
            cur = conn.execute(
                "DELETE FROM tasks WHERE id = ? AND owner_id = ?",
                (task_id, user_id),
            )
        return cur.rowcount > 0
