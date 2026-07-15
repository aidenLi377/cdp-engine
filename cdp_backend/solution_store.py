"""Solution store backed by SQLite."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .database import get_db, init_db

# snake_case column → camelCase JSON key
_SOLUTION_KEY_MAP = {
    "id": "id",
    "name": "name",
    "status": "status",
    "source": "source",
    "folder_id": "folderId",
    "default_crowd_name": "defaultCrowdName",
    "nodes": "nodes",
    "custom_fields": "customFields",
    "workbench_field_ids": "workbenchFieldIds",
    "base_published_id": "basePublishedId",
    "derived_from_solution_id": "derivedFromSolutionId",
    "derived_from_solution_version": "derivedFromSolutionVersion",
    "_version": "_version",
    "owner_id": "ownerId",
    "visibility": "visibility",
    "created_by": "createdBy",
    "updated_by": "updatedBy",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
    "published_at": "publishedAt",
}
# reverse: camelCase key → snake_case column
_SOLUTION_COL_MAP = {v: k for k, v in _SOLUTION_KEY_MAP.items()}

_JSON_FIELDS = {"nodes", "customFields", "workbenchFieldIds"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class SolutionNotFoundError(Exception):
    pass


class InvalidSolutionStateError(Exception):
    pass


class SolutionAccessError(Exception):
    pass


class SolutionStore:
    CLIENT_EDITABLE_FIELDS = (
        "name",
        "defaultCrowdName",
        "nodes",
        "workbenchFieldIds",
        "customFields",
        "folderId",
        "derivedFromSolutionId",
        "derivedFromSolutionVersion",
    )

    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path
        init_db(self.db_path)

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _new_id() -> str:
        return f"solution_{uuid4().hex}"

    @staticmethod
    def _client_fields(payload: dict) -> dict:
        return {key: payload[key] for key in SolutionStore.CLIENT_EDITABLE_FIELDS if key in payload}

    @staticmethod
    def _row_to_dict(row: dict) -> dict[str, Any]:
        """Convert a DB row (snake_case) to API dict (camelCase).

        None/NULL columns are omitted so the output matches the old
        JSON-file behaviour (sparse dicts).
        """
        result: dict[str, Any] = {}
        for col, val in row.items():
            if val is None:
                continue
            key = _SOLUTION_KEY_MAP.get(col, col)
            result[key] = val
        # JSON fields — use camelCase keys (already in result after mapping)
        _JSON_KEYS = ("nodes", "customFields", "workbenchFieldIds")
        for key in _JSON_KEYS:
            raw = result.get(key)
            if isinstance(raw, str):
                result[key] = json.loads(raw)
        return result

    @staticmethod
    def _to_db(payload: dict) -> dict[str, Any]:
        """Convert API dict (camelCase) to a complete DB row (snake_case).

        Every column used in INSERT/UPDATE is present — missing keys get NULL.
        JSON fields are serialised to strings.
        """
        row: dict[str, Any] = {
            "id": payload.get("id"),
            "name": payload.get("name", ""),
            "status": payload.get("status", "draft"),
            "source": payload.get("source", "manual"),
            "folder_id": payload.get("folderId"),
            "default_crowd_name": payload.get("defaultCrowdName", ""),
            "nodes": payload.get("nodes"),
            "custom_fields": payload.get("customFields"),
            "workbench_field_ids": payload.get("workbenchFieldIds"),
            "base_published_id": payload.get("basePublishedId"),
            "derived_from_solution_id": payload.get("derivedFromSolutionId"),
            "derived_from_solution_version": payload.get("derivedFromSolutionVersion"),
            "_version": payload.get("_version", 0),
            "owner_id": payload.get("ownerId"),
            "visibility": payload.get("visibility", "private"),
            "created_by": payload.get("createdBy"),
            "updated_by": payload.get("updatedBy"),
            "created_at": payload.get("createdAt", ""),
            "updated_at": payload.get("updatedAt", ""),
            "published_at": payload.get("publishedAt"),
        }
        # JSON fields — use snake_case column names in the DB row
        _JSON_COLS = ("nodes", "custom_fields", "workbench_field_ids")
        for col in _JSON_COLS:
            if col in row and not isinstance(row[col], (str, type(None))):
                row[col] = json.dumps(row[col], ensure_ascii=False)
        return row

    @staticmethod
    def _row_factory(cursor, row) -> dict:
        """sqlite3 row factory — returns plain dict."""
        return {col[0]: row[i] for i, col in enumerate(cursor.description)}

    def _find_accessible(self, conn, solution_id: str, user_id: str) -> dict:
        conn.row_factory = self._row_factory
        row = conn.execute(
            """SELECT * FROM solutions
               WHERE id = ? AND (visibility = 'public' OR owner_id = ?)""",
            (solution_id, user_id),
        ).fetchone()
        if row is None:
            raise SolutionNotFoundError(solution_id)
        return self._row_to_dict(row)

    def _find_mutable(self, conn, solution_id: str, user_id: str) -> dict:
        conn.row_factory = self._row_factory
        row = conn.execute("SELECT * FROM solutions WHERE id = ?", (solution_id,)).fetchone()
        if row is None:
            raise SolutionNotFoundError(solution_id)
        item = self._row_to_dict(row)
        if item.get("visibility") != "private" or item.get("ownerId") != user_id:
            raise SolutionAccessError(solution_id)
        return item

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    def list_solutions(
        self, status: str | None, scope: str, user_id: str
    ) -> list[dict]:
        if scope not in {"mine", "public"}:
            raise ValueError("invalid solution scope")
        clauses = ["visibility = ?"]
        params: list[Any] = ["private" if scope == "mine" else "public"]
        if scope == "mine":
            clauses.append("owner_id = ?")
            params.append(user_id)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        sql = f"SELECT * FROM solutions WHERE {' AND '.join(clauses)} ORDER BY updated_at DESC"
        with get_db(self.db_path) as conn:
            conn.row_factory = self._row_factory
            rows = conn.execute(sql, tuple(params)).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_solution(self, solution_id: str, user_id: str) -> dict | None:
        with get_db(self.db_path) as conn:
            conn.row_factory = self._row_factory
            row = conn.execute(
                """SELECT * FROM solutions
                   WHERE id = ? AND (visibility = 'public' OR owner_id = ?)""",
                (solution_id, user_id),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def create_draft(self, payload: dict, user_id: str) -> dict:
        now = _utc_now()
        created = {
            **self._client_fields(payload),
            "id": self._new_id(),
            "source": "manual",
            "status": "draft",
            "_version": 1,
            "ownerId": user_id,
            "visibility": "private",
            "createdBy": user_id,
            "updatedBy": user_id,
            "createdAt": now,
            "updatedAt": now,
        }
        db_row = self._to_db(created)
        with get_db(self.db_path) as conn:
            conn.execute(
                """INSERT INTO solutions (
                    id, name, status, source, folder_id, default_crowd_name,
                    nodes, custom_fields, workbench_field_ids, base_published_id,
                    derived_from_solution_id, derived_from_solution_version,
                    _version, owner_id, visibility, created_by, updated_by,
                    created_at, updated_at, published_at
                ) VALUES (
                    :id, :name, :status, :source, :folder_id, :default_crowd_name,
                    :nodes, :custom_fields, :workbench_field_ids, :base_published_id,
                    :derived_from_solution_id, :derived_from_solution_version,
                    :_version, :owner_id, :visibility, :created_by, :updated_by,
                    :created_at, :updated_at, :published_at
                )""",
                db_row,
            )
        return created

    def _update_row(self, conn, solution: dict) -> None:
        """Execute UPDATE for a solution dict (camelCase)."""
        db_row = self._to_db(solution)
        conn.execute(
            """UPDATE solutions SET
                name = :name, status = :status, source = :source,
                folder_id = :folder_id, default_crowd_name = :default_crowd_name,
                nodes = :nodes, custom_fields = :custom_fields,
                workbench_field_ids = :workbench_field_ids,
                base_published_id = :base_published_id,
                derived_from_solution_id = :derived_from_solution_id,
                derived_from_solution_version = :derived_from_solution_version,
                _version = :_version, owner_id = :owner_id,
                visibility = :visibility, created_by = :created_by,
                updated_by = :updated_by, created_at = :created_at,
                updated_at = :updated_at, published_at = :published_at
            WHERE id = :id""",
            db_row,
        )

    def _insert_row(self, conn, solution: dict) -> None:
        """Execute INSERT for a solution dict (camelCase)."""
        db_row = self._to_db(solution)
        conn.execute(
            """INSERT INTO solutions (
                id, name, status, source, folder_id, default_crowd_name,
                nodes, custom_fields, workbench_field_ids, base_published_id,
                derived_from_solution_id, derived_from_solution_version,
                _version, owner_id, visibility, created_by, updated_by,
                created_at, updated_at, published_at
            ) VALUES (
                :id, :name, :status, :source, :folder_id, :default_crowd_name,
                :nodes, :custom_fields, :workbench_field_ids, :base_published_id,
                :derived_from_solution_id, :derived_from_solution_version,
                :_version, :owner_id, :visibility, :created_by, :updated_by,
                :created_at, :updated_at, :published_at
            )""",
            db_row,
        )

    def update_draft(self, solution_id: str, payload: dict, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            item = self._find_mutable(conn, solution_id, user_id)
            if item.get("status") != "draft":
                raise InvalidSolutionStateError(solution_id)

            updated = {
                **item,
                **self._client_fields(payload),
                "id": item["id"],
                "status": "draft",
                "source": item.get("source", "manual"),
                "_version": item.get("_version", 0) + 1,
                "updatedBy": user_id,
                "createdAt": item["createdAt"],
                "updatedAt": _utc_now(),
            }
            self._update_row(conn, updated)
        return updated

    def publish(self, solution_id: str, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            item = self._find_mutable(conn, solution_id, user_id)
            if item.get("status") != "draft":
                raise InvalidSolutionStateError(solution_id)

            now = _utc_now()
            base_published_id = item.get("basePublishedId")

            if base_published_id:
                published_item = self._find_mutable(conn, base_published_id, user_id)
                updated = {
                    **published_item,
                    **self._client_fields(item),
                    "id": published_item["id"],
                    "source": published_item.get("source", "manual"),
                    "status": "published",
                    "_version": published_item.get("_version", 0) + 1,
                    "updatedBy": user_id,
                    "createdAt": published_item["createdAt"],
                    "updatedAt": now,
                    "publishedAt": now,
                }
                self._update_row(conn, updated)
                conn.execute("DELETE FROM solutions WHERE id = ?", (solution_id,))
                return updated

            updated = {
                **item,
                "source": item.get("source", "manual"),
                "status": "published",
                "_version": item.get("_version", 0) + 1,
                "updatedBy": user_id,
                "updatedAt": now,
                "publishedAt": now,
            }
            self._update_row(conn, updated)
        return updated

    def create_edit_draft(self, solution_id: str, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            item = self._find_mutable(conn, solution_id, user_id)
            if item.get("status") != "published":
                raise InvalidSolutionStateError(solution_id)

            now = _utc_now()
            created = {
                **self._client_fields(item),
                "id": self._new_id(),
                "source": "published-edit",
                "status": "draft",
                "basePublishedId": solution_id,
                "_version": 1,
                "ownerId": user_id,
                "visibility": "private",
                "createdBy": user_id,
                "updatedBy": user_id,
                "createdAt": now,
                "updatedAt": now,
            }
            self._insert_row(conn, created)
        return created

    def duplicate(self, solution_id: str, user_id: str) -> dict | None:
        with get_db(self.db_path) as conn:
            item = self._find_accessible(conn, solution_id, user_id)
            now = _utc_now()
            duplicated = {
                **self._client_fields(item),
                "id": self._new_id(),
                "source": "manual",
                "status": "draft",
                "folderId": item.get("folderId") if item.get("visibility") == "private" else None,
                "_version": 1,
                "ownerId": user_id,
                "visibility": "private",
                "createdBy": user_id,
                "updatedBy": user_id,
                "createdAt": now,
                "updatedAt": now,
            }
            self._insert_row(conn, duplicated)
        return duplicated

    def update_custom_fields(
        self,
        solution_id: str,
        custom_fields: list[dict],
        nodes: list[dict] | None,
        user_id: str,
    ) -> dict:
        with get_db(self.db_path) as conn:
            item = self._find_mutable(conn, solution_id, user_id)
            updated = {
                **item,
                "customFields": custom_fields,
                "_version": item.get("_version", 0) + 1,
                "updatedBy": user_id,
                "updatedAt": _utc_now(),
            }
            if nodes is not None:
                updated["nodes"] = nodes
            self._update_row(conn, updated)
        return updated

    def move_solution(self, solution_id: str, folder_id: str | None, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            item = self._find_mutable(conn, solution_id, user_id)
            updated = {
                **item,
                "folderId": folder_id,
                "_version": item.get("_version", 0) + 1,
                "updatedBy": user_id,
                "updatedAt": _utc_now(),
            }
            self._update_row(conn, updated)
        return updated

    def delete_solution(self, solution_id: str, user_id: str) -> bool:
        with get_db(self.db_path) as conn:
            self._find_mutable(conn, solution_id, user_id)
            cur = conn.execute("DELETE FROM solutions WHERE id = ?", (solution_id,))
        return cur.rowcount > 0

    def clear_folder_ids(self, deleted_folder_ids: set[str], user_id: str) -> None:
        """Set folderId to NULL for solutions whose folder was deleted."""
        if not deleted_folder_ids:
            return
        with get_db(self.db_path) as conn:
            placeholders = ",".join("?" for _ in deleted_folder_ids)
            conn.execute(
                f"""UPDATE solutions SET folder_id = NULL, updated_by = ?
                    WHERE owner_id = ? AND visibility = 'private'
                    AND folder_id IN ({placeholders})""",
                (user_id, user_id, *deleted_folder_ids),
            )
