from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class SolutionStore:
    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self._lock = threading.RLock()

    def _empty(self) -> dict:
        return {"solutions": []}

    def _load(self) -> dict:
        if not self.file_path.exists():
            return self._empty()

        with self.file_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write(self, data: dict) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)

        with NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=self.file_path.parent,
            delete=False,
            suffix=".tmp",
        ) as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            temp_path = Path(handle.name)

        temp_path.replace(self.file_path)

    def _new_id(self) -> str:
        return f"solution_{uuid4().hex}"

    def list_solutions(self, status=None) -> list[dict]:
        solutions = self._load()["solutions"]
        if status is None:
            return list(solutions)
        return [item for item in solutions if item.get("status") == status]

    def get_solution(self, solution_id: str) -> dict | None:
        solutions = self._load()["solutions"]
        for item in solutions:
            if item.get("id") == solution_id:
                return item
        return None

    def create_draft(self, payload: dict) -> dict:
        with self._lock:
            now = utc_now()
            created = {
                **payload,
                "id": self._new_id(),
                "status": "draft",
                "createdAt": now,
                "updatedAt": now,
            }
            data = self._load()
            data["solutions"].append(created)
            self._write(data)
            return created

    def update_draft(self, solution_id: str, payload: dict) -> dict | None:
        with self._lock:
            data = self._load()
            for index, item in enumerate(data["solutions"]):
                if item.get("id") != solution_id:
                    continue
                if item.get("status") != "draft":
                    return None
                updated = {
                    **item,
                    **payload,
                    "id": item["id"],
                    "status": "draft",
                    "createdAt": item["createdAt"],
                    "updatedAt": utc_now(),
                }
                data["solutions"][index] = updated
                self._write(data)
                return updated
        return None

    def publish(self, solution_id: str) -> dict | None:
        with self._lock:
            data = self._load()
            for index, item in enumerate(data["solutions"]):
                if item.get("id") != solution_id:
                    continue
                if item.get("status") != "draft":
                    return None

                now = utc_now()
                base_published_id = item.get("basePublishedId")
                if base_published_id:
                    for published_index, published_item in enumerate(data["solutions"]):
                        if published_item.get("id") != base_published_id:
                            continue
                        updated = {
                            **published_item,
                            **item,
                            "id": published_item["id"],
                            "status": "published",
                            "source": published_item.get("source", item.get("source")),
                            "createdAt": published_item["createdAt"],
                            "updatedAt": now,
                            "publishedAt": now,
                        }
                        updated.pop("basePublishedId", None)
                        data["solutions"][published_index] = updated
                        del data["solutions"][index]
                        self._write(data)
                        return updated
                    return None

                published = {
                    **item,
                    "status": "published",
                    "updatedAt": now,
                    "publishedAt": now,
                }
                data["solutions"][index] = published
                self._write(data)
                return published
        return None

    def create_edit_draft(self, solution_id: str) -> dict | None:
        with self._lock:
            data = self._load()
            for item in data["solutions"]:
                if item.get("id") != solution_id:
                    continue
                if item.get("status") != "published":
                    return None
                now = utc_now()
                created = {
                    **item,
                    "id": self._new_id(),
                    "status": "draft",
                    "source": "published-edit",
                    "basePublishedId": solution_id,
                    "createdAt": now,
                    "updatedAt": now,
                }
                created.pop("publishedAt", None)
                data["solutions"].append(created)
                self._write(data)
                return created
        return None

    def duplicate(self, solution_id: str) -> dict | None:
        with self._lock:
            data = self._load()
            for item in data["solutions"]:
                if item.get("id") != solution_id:
                    continue
                now = utc_now()
                duplicated = {
                    **item,
                    "id": self._new_id(),
                    "status": "draft",
                    "createdAt": now,
                    "updatedAt": now,
                }
                duplicated.pop("publishedAt", None)
                duplicated.pop("basePublishedId", None)
                data["solutions"].append(duplicated)
                self._write(data)
                return duplicated
        return None

    def delete_solution(self, solution_id: str) -> bool:
        with self._lock:
            data = self._load()
            filtered = [item for item in data["solutions"] if item.get("id") != solution_id]
            if len(filtered) == len(data["solutions"]):
                return False
            data["solutions"] = filtered
            self._write(data)
            return True
