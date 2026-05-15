from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class SolutionStore:
    def __init__(self, file_path):
        self.file_path = Path(file_path)

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

    def create_draft(self, payload: dict) -> dict:
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
