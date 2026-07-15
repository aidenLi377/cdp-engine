"""Folder store backed by SQLite."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from .database import get_db, init_db

_FOLDER_KEY_MAP = {
    "id": "id",
    "name": "name",
    "parent_id": "parentId",
    "owner_id": "ownerId",
    "visibility": "visibility",
    "created_by": "createdBy",
    "updated_by": "updatedBy",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
}
_FOLDER_COL_MAP = {v: k for k, v in _FOLDER_KEY_MAP.items()}


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class FolderNotFoundError(Exception):
    pass


class FolderAccessError(Exception):
    pass


class FolderStore:
    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path
        init_db(self.db_path)

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _new_id() -> str:
        return f"folder_{uuid4().hex}"

    @staticmethod
    def _row_factory(cursor, row) -> dict:
        return {col[0]: row[i] for i, col in enumerate(cursor.description)}

    @staticmethod
    def _row_to_dict(row: dict) -> dict:
        result = {}
        for col, val in row.items():
            key = _FOLDER_KEY_MAP.get(col, col)
            result[key] = val
        return result

    @staticmethod
    def _to_db(payload: dict) -> dict:
        result = {}
        for key, val in payload.items():
            col = _FOLDER_COL_MAP.get(key, key)
            result[col] = val
        return result

    def _find_folder(self, conn, folder_id: str) -> dict:
        conn.row_factory = self._row_factory
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
        if row is None:
            raise FolderNotFoundError(folder_id)
        return self._row_to_dict(row)

    def _find_mutable(self, conn, folder_id: str, user_id: str) -> dict:
        item = self._find_folder(conn, folder_id)
        if item.get("visibility") != "private" or item.get("ownerId") != user_id:
            raise FolderAccessError(folder_id)
        return item

    def _collect_subtree_ids(self, conn, folder_id: str) -> set[str]:
        """Collect folder_id and all descendant ids."""
        result = {folder_id}
        rows = conn.execute(
            "SELECT id FROM folders WHERE parent_id = ?", (folder_id,)
        ).fetchall()
        for row in rows:
            child_id = row["id"] if isinstance(row, dict) else row[0]
            result.update(self._collect_subtree_ids(conn, child_id))
        return result

    def _build_tree(
        self, conn, scope: str, user_id: str, parent_id: str | None = None
    ) -> list[dict]:
        result = []
        if scope == "public":
            rows = conn.execute(
                """SELECT * FROM folders
                   WHERE parent_id IS ? AND visibility = 'public' ORDER BY name""",
                (parent_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM folders
                   WHERE parent_id IS ? AND visibility = 'private' AND owner_id = ?
                   ORDER BY name""",
                (parent_id, user_id),
            ).fetchall()
        for row in rows:
            node = self._row_to_dict(row)
            children = self._build_tree(conn, scope, user_id, node["id"])
            if children:
                node["children"] = children
            result.append(node)
        return result

    # ------------------------------------------------------------------
    # public API
    # ------------------------------------------------------------------

    def list_folders(self, scope: str, user_id: str) -> list[dict]:
        if scope not in {"mine", "public"}:
            raise ValueError("invalid folder scope")
        with get_db(self.db_path) as conn:
            conn.row_factory = self._row_factory
            return self._build_tree(conn, scope, user_id, None)

    def get_folder(self, folder_id: str, user_id: str) -> dict | None:
        with get_db(self.db_path) as conn:
            conn.row_factory = self._row_factory
            row = conn.execute(
                """SELECT * FROM folders
                   WHERE id = ? AND (visibility = 'public' OR owner_id = ?)""",
                (folder_id, user_id),
            ).fetchone()
            if row is None:
                return None
            return self._row_to_dict(row)

    def create_folder(self, name: str, user_id: str, parent_id: str | None = None) -> dict:
        now = _utc_now()
        created = {
            "id": self._new_id(),
            "name": name,
            "parentId": parent_id,
            "ownerId": user_id,
            "visibility": "private",
            "createdBy": user_id,
            "updatedBy": user_id,
            "createdAt": now,
            "updatedAt": now,
        }
        db_row = self._to_db(created)
        with get_db(self.db_path) as conn:
            if parent_id is not None:
                self._find_mutable(conn, parent_id, user_id)
            conn.execute(
                """INSERT INTO folders (
                    id, name, parent_id, owner_id, visibility,
                    created_by, updated_by, created_at, updated_at
                ) VALUES (
                    :id, :name, :parent_id, :owner_id, :visibility,
                    :created_by, :updated_by, :created_at, :updated_at
                )""",
                db_row,
            )
        return created

    def update_folder(self, folder_id: str, name: str, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            item = self._find_mutable(conn, folder_id, user_id)
            updated = {**item, "name": name, "updatedBy": user_id, "updatedAt": _utc_now()}
            db_row = self._to_db(updated)
            conn.execute(
                """UPDATE folders SET name = :name, updated_by = :updated_by,
                   updated_at = :updated_at WHERE id = :id""",
                db_row,
            )
            return updated

    def delete_folder(self, folder_id: str, user_id: str) -> set[str]:
        with get_db(self.db_path) as conn:
            self._find_mutable(conn, folder_id, user_id)
            ids_to_delete = self._collect_subtree_ids(conn, folder_id)
            placeholders = ",".join("?" for _ in ids_to_delete)
            conn.execute(
                f"""UPDATE solutions SET folder_id = NULL, updated_by = ?
                    WHERE owner_id = ? AND visibility = 'private'
                    AND folder_id IN ({placeholders})""",
                (user_id, user_id, *ids_to_delete),
            )
            conn.execute(
                f"DELETE FROM folders WHERE id IN ({placeholders})",
                tuple(ids_to_delete),
            )
            return ids_to_delete

    def move_folder(self, folder_id: str, parent_id: str | None, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            item = self._find_mutable(conn, folder_id, user_id)
            if parent_id is not None:
                self._find_mutable(conn, parent_id, user_id)
                if parent_id in self._collect_subtree_ids(conn, folder_id):
                    raise ValueError("Cannot move a folder into itself or one of its descendants")
            updated = {
                **item,
                "parentId": parent_id,
                "updatedBy": user_id,
                "updatedAt": _utc_now(),
            }
            db_row = self._to_db(updated)
            conn.execute(
                """UPDATE folders SET parent_id = :parent_id, updated_by = :updated_by,
                   updated_at = :updated_at WHERE id = :id""",
                db_row,
            )
            return updated
