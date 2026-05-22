from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class SolutionNotFoundError(Exception):
    pass


class InvalidSolutionStateError(Exception):
    pass


class SolutionStore:
    CLIENT_EDITABLE_FIELDS = ("name", "defaultCrowdName", "nodes", "workbenchFieldIds", "customFields", "folderId")

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

    def _client_fields(self, payload: dict) -> dict:
        return {key: payload[key] for key in self.CLIENT_EDITABLE_FIELDS if key in payload}

    def _find_solution(self, solutions: list[dict], solution_id: str) -> tuple[int, dict]:
        for index, item in enumerate(solutions):
            if item.get("id") == solution_id:
                return index, item
        raise SolutionNotFoundError(solution_id)

    def list_solutions(self, status=None) -> list[dict]:
        solutions = sorted(
            self._load()["solutions"],
            key=lambda item: item.get("updatedAt", ""),
            reverse=True,
        )
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
                **self._client_fields(payload),
                "id": self._new_id(),
                "source": "manual",
                "status": "draft",
                "_version": 1,
                "createdAt": now,
                "updatedAt": now,
            }
            data = self._load()
            data["solutions"].append(created)
            self._write(data)
            return created

    def update_draft(self, solution_id: str, payload: dict) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_solution(data["solutions"], solution_id)
            if item.get("status") != "draft":
                raise InvalidSolutionStateError(solution_id)
            updated = {
                **item,
                **self._client_fields(payload),
                "id": item["id"],
                "status": "draft",
                "source": item.get("source", "manual"),
                "_version": item.get("_version", 0) + 1,
                "createdAt": item["createdAt"],
                "updatedAt": utc_now(),
            }
            data["solutions"][index] = updated
            self._write(data)
            return updated

    def publish(self, solution_id: str) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_solution(data["solutions"], solution_id)
            if item.get("status") != "draft":
                raise InvalidSolutionStateError(solution_id)

            now = utc_now()
            base_published_id = item.get("basePublishedId")
            if base_published_id:
                published_index, published_item = self._find_solution(data["solutions"], base_published_id)
                updated = {
                    **published_item,
                    **self._client_fields(item),
                    "id": published_item["id"],
                    "source": published_item.get("source", "manual"),
                    "status": "published",
                    "_version": published_item.get("_version", 0) + 1,
                    "createdAt": published_item["createdAt"],
                    "updatedAt": now,
                    "publishedAt": now,
                }
                data["solutions"][published_index] = updated
                del data["solutions"][index]
                self._write(data)
                return updated

            published = {
                **item,
                "source": item.get("source", "manual"),
                "status": "published",
                "_version": item.get("_version", 0) + 1,
                "updatedAt": now,
                "publishedAt": now,
            }
            data["solutions"][index] = published
            self._write(data)
            return published

    def create_edit_draft(self, solution_id: str) -> dict:
        with self._lock:
            data = self._load()
            _index, item = self._find_solution(data["solutions"], solution_id)
            if item.get("status") != "published":
                raise InvalidSolutionStateError(solution_id)
            now = utc_now()
            created = {
                **self._client_fields(item),
                "id": self._new_id(),
                "source": "published-edit",
                "status": "draft",
                "basePublishedId": solution_id,
                "_version": 1,
                "createdAt": now,
                "updatedAt": now,
            }
            data["solutions"].append(created)
            self._write(data)
            return created

    def duplicate(self, solution_id: str) -> dict | None:
        with self._lock:
            data = self._load()
            _index, item = self._find_solution(data["solutions"], solution_id)
            now = utc_now()
            duplicated = {
                **self._client_fields(item),
                "id": self._new_id(),
                "source": "manual",
                "status": "draft",
                "_version": 1,
                "createdAt": now,
                "updatedAt": now,
            }
            data["solutions"].append(duplicated)
            self._write(data)
            return duplicated

    def update_custom_fields(self, solution_id: str, custom_fields: list[dict], nodes: list[dict] | None = None) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_solution(data["solutions"], solution_id)
            updated = {
                **item,
                "customFields": custom_fields,
                "_version": item.get("_version", 0) + 1,
                "updatedAt": utc_now(),
            }
            if nodes is not None:
                updated["nodes"] = nodes
            data["solutions"][index] = updated
            self._write(data)
            return updated

    def move_solution(self, solution_id: str, folder_id: str | None) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_solution(data["solutions"], solution_id)
            updated = {
                **item,
                "folderId": folder_id,
                "_version": item.get("_version", 0) + 1,
                "updatedAt": utc_now(),
            }
            data["solutions"][index] = updated
            self._write(data)
            return updated

    def delete_solution(self, solution_id: str) -> bool:
        with self._lock:
            data = self._load()
            filtered = [item for item in data["solutions"] if item.get("id") != solution_id]
            if len(filtered) == len(data["solutions"]):
                return False
            data["solutions"] = filtered
            self._write(data)
            return True
