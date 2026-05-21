from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class FolderNotFoundError(Exception):
    pass


class FolderStore:
    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self._lock = threading.RLock()

    def _empty(self) -> dict:
        return {"folders": []}

    def _load(self) -> dict:
        if not self.file_path.exists():
            return self._empty()
        with self.file_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write(self, data: dict) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(
            "w", encoding="utf-8", dir=self.file_path.parent, delete=False, suffix=".tmp"
        ) as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            temp_path = Path(handle.name)
        temp_path.replace(self.file_path)

    def _new_id(self) -> str:
        return f"folder_{uuid4().hex}"

    def _find_folder(self, folders: list[dict], folder_id: str) -> tuple[int, dict]:
        for index, item in enumerate(folders):
            if item.get("id") == folder_id:
                return index, item
        raise FolderNotFoundError(folder_id)

    def _build_tree(self, folders: list[dict], parent_id: str | None = None) -> list[dict]:
        result = []
        for item in folders:
            if item.get("parentId") != parent_id:
                continue
            node = dict(item)
            children = self._build_tree(folders, node["id"])
            if children:
                node["children"] = children
            result.append(node)
        return result

    def list_folders(self) -> list[dict]:
        folders = list(self._load()["folders"])
        return self._build_tree(folders, None)

    def get_folder(self, folder_id: str) -> dict | None:
        folders = self._load()["folders"]
        for item in folders:
            if item.get("id") == folder_id:
                return item
        return None

    def create_folder(self, name: str, parent_id: str | None = None) -> dict:
        with self._lock:
            now = _utc_now()
            created = {
                "id": self._new_id(),
                "name": name,
                "parentId": parent_id,
                "createdAt": now,
                "updatedAt": now,
            }
            data = self._load()
            data["folders"].append(created)
            self._write(data)
            return created

    def update_folder(self, folder_id: str, name: str) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_folder(data["folders"], folder_id)
            updated = {**item, "name": name, "updatedAt": _utc_now()}
            data["folders"][index] = updated
            self._write(data)
            return updated

    def delete_folder(self, folder_id: str) -> None:
        with self._lock:
            data = self._load()
            self._find_folder(data["folders"], folder_id)
            ids_to_delete = self._collect_subtree_ids(data["folders"], folder_id)
            data["folders"] = [f for f in data["folders"] if f["id"] not in ids_to_delete]
            self._write(data)

    def _collect_subtree_ids(self, folders: list[dict], folder_id: str) -> set[str]:
        result = {folder_id}
        for item in folders:
            if item.get("parentId") == folder_id:
                result.update(self._collect_subtree_ids(folders, item["id"]))
        return result

    def move_folder(self, folder_id: str, parent_id: str | None) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_folder(data["folders"], folder_id)
            if parent_id is not None:
                self._find_folder(data["folders"], parent_id)
            updated = {**item, "parentId": parent_id, "updatedAt": _utc_now()}
            data["folders"][index] = updated
            self._write(data)
            return updated
