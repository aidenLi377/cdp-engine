from __future__ import annotations

import json
import queue
import threading
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class TaskNotFoundError(Exception):
    pass


class TaskStore:
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        self._lock = threading.RLock()
        self._subscribers: dict[str, list[queue.Queue]] = {}

    def _empty(self) -> dict:
        return {"tasks": []}

    def _load(self) -> dict:
        if not self.file_path.exists():
            return self._empty()
        with self.file_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write(self, data: dict) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile("w", encoding="utf-8", dir=self.file_path.parent, delete=False, suffix=".tmp") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            temp_path = Path(handle.name)
        temp_path.replace(self.file_path)

    def _notify(self, task: dict) -> None:
        subs = self._subscribers.get(task["id"], [])
        for q in subs:
            try:
                q.put_nowait(task)
            except queue.Full:
                pass

    def subscribe(self, task_id: str) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        self._subscribers.setdefault(task_id, []).append(q)
        return q

    def unsubscribe(self, task_id: str, q: queue.Queue) -> None:
        subs = self._subscribers.get(task_id, [])
        if q in subs:
            subs.remove(q)
        if not subs:
            self._subscribers.pop(task_id, None)

    def list_tasks(self) -> list[dict]:
        tasks = self._load()["tasks"]
        tasks.sort(key=lambda t: t.get("createdAt", ""), reverse=True)
        return tasks

    def get_task(self, task_id: str) -> dict | None:
        for t in self._load()["tasks"]:
            if t["id"] == task_id:
                return t
        return None

    def create_task(self, payload: dict) -> dict:
        with self._lock:
            now = utc_now()
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
                "createdAt": now,
                "updatedAt": now,
            }
            data = self._load()
            data["tasks"].append(task)
            self._write(data)
            self._notify(task)
            return task

    def update_progress(self, task_id: str, payload: dict) -> dict:
        with self._lock:
            data = self._load()
            for i, t in enumerate(data["tasks"]):
                if t["id"] == task_id:
                    updated = {
                        **t,
                        "status": payload.get("status", t["status"]),
                        "phase": payload.get("phase", t["phase"]),
                        "phaseLabel": payload.get("phaseLabel", t["phaseLabel"]),
                        "progress": payload.get("progress", t["progress"]),
                        "message": payload.get("message", t["message"]),
                        "result": payload.get("result") if "result" in payload else t.get("result"),
                        "crowdCount": payload.get("crowdCount") if "crowdCount" in payload else t.get("crowdCount"),
                        "updatedAt": utc_now(),
                    }
                    data["tasks"][i] = updated
                    self._write(data)
                    self._notify(updated)
                    return updated
            raise TaskNotFoundError(task_id)

    def delete_task(self, task_id: str) -> bool:
        with self._lock:
            data = self._load()
            filtered = [t for t in data["tasks"] if t["id"] != task_id]
            if len(filtered) == len(data["tasks"]):
                return False
            data["tasks"] = filtered
            self._write(data)
            self._subscribers.pop(task_id, None)
            return True
