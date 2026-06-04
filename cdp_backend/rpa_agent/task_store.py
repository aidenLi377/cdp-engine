"""Persistent task state for RPA portrait analysis jobs."""

import json
import threading
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


class TaskStore:
    """Thread-safe JSON file store for RPA task lifecycle."""

    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def _task_path(self, task_id: str) -> Path:
        return self.base_dir / f"{task_id}.json"

    def create_task(self, crowd_name: str, tag_ids: list[str]) -> dict:
        now = _utc_now()
        task = {
            "id": f"rpa_{uuid4().hex}",
            "crowdName": crowd_name,
            "tagIds": tag_ids,
            "status": "pending",
            "progress": None,
            "result": None,
            "error": None,
            "createdAt": now,
            "updatedAt": now,
        }
        with self._lock:
            self._task_path(task["id"]).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def get_task(self, task_id: str) -> dict | None:
        path = self._task_path(task_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def update_progress(self, task_id: str, *, status: str, step: str,
                        detail: str, percent: int) -> dict | None:
        task = self.get_task(task_id)
        if task is None:
            return None
        task["status"] = status
        task["progress"] = {"step": step, "detail": detail, "percent": percent}
        task["updatedAt"] = _utc_now()
        with self._lock:
            self._task_path(task_id).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def update_result(self, task_id: str, *, excel_filename: str,
                      preview_rows: list[dict], total_rows: int) -> dict | None:
        task = self.get_task(task_id)
        if task is None:
            return None
        now = _utc_now()
        task["status"] = "completed"
        task["progress"] = {"step": "completed", "detail": "分析完成", "percent": 100}
        task["result"] = {
            "excelFilename": excel_filename,
            "previewRows": preview_rows,
            "totalRows": total_rows,
            "generatedAt": now,
        }
        task["updatedAt"] = now
        with self._lock:
            self._task_path(task_id).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def mark_failed(self, task_id: str, error: str) -> dict | None:
        task = self.get_task(task_id)
        if task is None:
            return None
        task["status"] = "failed"
        task["error"] = error
        task["updatedAt"] = _utc_now()
        with self._lock:
            self._task_path(task_id).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def list_tasks(self, limit: int = 50) -> list[dict]:
        tasks = []
        for path in sorted(
            self.base_dir.glob("rpa_*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        ):
            try:
                tasks.append(json.loads(path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                continue
            if len(tasks) >= limit:
                break
        return tasks
