"""Snapshot-based personal folder sharing through short-lived paste phrases."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from .database import get_db, init_db


SHARE_PHRASE_PATTERN = re.compile(
    r"CDP-FOLDER-(?:[A-F0-9]{4}-){5}[A-F0-9]{4}",
    re.IGNORECASE,
)


def _utc_now_dt() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


class InvalidFolderSharePhraseError(Exception):
    pass


class FolderShareNotFoundError(Exception):
    pass


class FolderShareExpiredError(Exception):
    pass


class FolderShareAccessError(Exception):
    pass


class FolderShareStore:
    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path
        init_db(self.db_path)

    @staticmethod
    def _new_id(prefix: str) -> str:
        return f"{prefix}_{uuid4().hex}"

    @staticmethod
    def _token_hash(phrase: str) -> str:
        return hashlib.sha256(phrase.encode("utf-8")).hexdigest()

    @staticmethod
    def extract_phrase(text: str) -> str:
        if not isinstance(text, str) or len(text) > 2000:
            raise InvalidFolderSharePhraseError()
        match = SHARE_PHRASE_PATTERN.search(text)
        if match is None:
            raise InvalidFolderSharePhraseError()
        return match.group(0).upper()

    @staticmethod
    def _generate_phrase() -> str:
        raw = secrets.token_hex(12).upper()
        return "CDP-FOLDER-" + "-".join(raw[index:index + 4] for index in range(0, 24, 4))

    @staticmethod
    def _decode_json(value: Any, fallback: Any) -> Any:
        if value is None:
            return fallback
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (TypeError, ValueError):
                return fallback
        return value

    @staticmethod
    def _row_dict(row: Any) -> dict:
        return dict(row) if row is not None else {}

    def _lookup(self, conn, text: str) -> tuple[str, dict]:
        phrase = self.extract_phrase(text)
        row = conn.execute(
            "SELECT * FROM folder_share_tokens WHERE token_hash = ?",
            (self._token_hash(phrase),),
        ).fetchone()
        if row is None or row["revoked_at"] is not None:
            raise FolderShareNotFoundError()
        item = self._row_dict(row)
        if item["expires_at"] <= _iso(_utc_now_dt()):
            raise FolderShareExpiredError()
        return phrase, item

    @staticmethod
    def _preview_payload(phrase: str, item: dict) -> dict:
        return {
            "phrase": phrase,
            "folderName": item["folder_name"],
            "folderCount": item["folder_count"],
            "solutionCount": item["solution_count"],
            "sharedBy": item["shared_by"],
            "createdAt": item["created_at"],
            "expiresAt": item["expires_at"],
        }

    def create_share(self, folder_id: str, owner_id: str, shared_by: str) -> dict:
        now = _utc_now_dt()
        expires_at = now + timedelta(days=7)
        with get_db(self.db_path) as conn:
            root = conn.execute(
                """SELECT * FROM folders
                   WHERE id = ? AND owner_id = ? AND visibility = 'private'""",
                (folder_id, owner_id),
            ).fetchone()
            if root is None:
                raise FolderShareAccessError()

            folders = conn.execute(
                """WITH RECURSIVE subtree(id, name, parent_id, execution_mode, depth) AS (
                       SELECT id, name, parent_id, execution_mode, 0 FROM folders
                       WHERE id = ? AND owner_id = ? AND visibility = 'private'
                       UNION ALL
                       SELECT child.id, child.name, child.parent_id, child.execution_mode, subtree.depth + 1
                       FROM folders child
                       JOIN subtree ON child.parent_id = subtree.id
                       WHERE child.owner_id = ? AND child.visibility = 'private'
                   )
                   SELECT id, name, parent_id, execution_mode, depth FROM subtree
                   ORDER BY depth ASC, name COLLATE NOCASE ASC, id ASC""",
                (folder_id, owner_id, owner_id),
            ).fetchall()
            folder_ids = [row["id"] for row in folders]
            placeholders = ",".join("?" for _ in folder_ids)
            solutions = conn.execute(
                f"""SELECT id, name, folder_id, sort_order, default_crowd_name,
                            nodes, custom_fields, workbench_field_ids
                     FROM solutions
                     WHERE owner_id = ? AND visibility = 'private'
                       AND folder_id IN ({placeholders})
                     ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
                              sort_order ASC, updated_at DESC, id ASC""",
                (owner_id, *folder_ids),
            ).fetchall()

            snapshot = {
                "rootFolderId": folder_id,
                "folders": [
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "parentId": row["parent_id"] if row["id"] != folder_id else None,
                        "executionMode": row["execution_mode"] or "create_and_count",
                        "depth": row["depth"],
                    }
                    for row in folders
                ],
                "solutions": [
                    {
                        "name": row["name"],
                        "folderId": row["folder_id"],
                        "sortOrder": row["sort_order"],
                        "defaultCrowdName": row["default_crowd_name"] or "",
                        "nodes": self._decode_json(row["nodes"], []),
                        "customFields": self._decode_json(row["custom_fields"], []),
                        "workbenchFieldIds": self._decode_json(row["workbench_field_ids"], []),
                    }
                    for row in solutions
                ],
            }

            phrase = self._generate_phrase()
            share_id = self._new_id("folder_share")
            conn.execute(
                """INSERT INTO folder_share_tokens (
                       id, token_hash, source_folder_id, owner_id, shared_by,
                       folder_name, folder_count, solution_count, snapshot,
                       created_at, expires_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    share_id,
                    self._token_hash(phrase),
                    folder_id,
                    owner_id,
                    shared_by,
                    root["name"],
                    len(folders),
                    len(solutions),
                    json.dumps(snapshot, ensure_ascii=False),
                    _iso(now),
                    _iso(expires_at),
                ),
            )

        return {
            "id": share_id,
            **self._preview_payload(
                phrase,
                {
                    "folder_name": root["name"],
                    "folder_count": len(folders),
                    "solution_count": len(solutions),
                    "shared_by": shared_by,
                    "created_at": _iso(now),
                    "expires_at": _iso(expires_at),
                },
            ),
        }

    def preview(self, text: str) -> dict:
        with get_db(self.db_path) as conn:
            phrase, item = self._lookup(conn, text)
            return self._preview_payload(phrase, item)

    @staticmethod
    def _unique_root_name(conn, desired: str, owner_id: str) -> str:
        base = desired.strip() or "导入的方案文件夹"
        candidate = base
        suffix = 1
        while conn.execute(
            """SELECT 1 FROM folders
               WHERE owner_id = ? AND visibility = 'private' AND parent_id IS NULL
                 AND name = ? COLLATE NOCASE""",
            (owner_id, candidate),
        ).fetchone() is not None:
            candidate = f"{base} ({suffix})"
            suffix += 1
        return candidate

    @staticmethod
    def _unique_public_root_name(conn, desired: str, parent_id: str | None) -> str:
        base = desired.strip() or "导入的方案文件夹"
        candidate = base
        suffix = 1
        while conn.execute(
            """SELECT 1 FROM folders
               WHERE visibility = 'public' AND parent_id IS ?
                 AND name = ? COLLATE NOCASE""",
            (parent_id, candidate),
        ).fetchone() is not None:
            candidate = f"{base} ({suffix})"
            suffix += 1
        return candidate

    def promote_private_folder(
        self,
        folder_id: str,
        owner_id: str,
        admin_id: str,
        *,
        parent_folder_id: str | None = None,
    ) -> dict:
        """Mirror a private folder subtree into the public library atomically."""
        now_iso = _iso(_utc_now_dt())
        with get_db(self.db_path) as conn:
            root = conn.execute(
                """SELECT * FROM folders
                   WHERE id = ? AND owner_id = ? AND visibility = 'private'""",
                (folder_id, owner_id),
            ).fetchone()
            if root is None:
                raise FolderShareAccessError()

            folders = conn.execute(
                """WITH RECURSIVE subtree(id, name, parent_id, execution_mode, depth) AS (
                       SELECT id, name, parent_id, execution_mode, 0 FROM folders
                       WHERE id = ? AND owner_id = ? AND visibility = 'private'
                       UNION ALL
                       SELECT child.id, child.name, child.parent_id, child.execution_mode, subtree.depth + 1
                       FROM folders child
                       JOIN subtree ON child.parent_id = subtree.id
                       WHERE child.owner_id = ? AND child.visibility = 'private'
                   )
                   SELECT id, name, parent_id, execution_mode, depth FROM subtree
                   ORDER BY depth ASC, name COLLATE NOCASE ASC, id ASC""",
                (folder_id, owner_id, owner_id),
            ).fetchall()
            source_folder_ids = [row["id"] for row in folders]
            folder_id_map: dict[str, str] = {}
            created_folder_count = 0
            synced_folder_count = 0
            public_root = None

            for folder in folders:
                source_id = folder["id"]
                is_root = source_id == folder_id
                target_parent_id = (
                    parent_folder_id
                    if is_root
                    else folder_id_map.get(folder["parent_id"])
                )
                existing = conn.execute(
                    """SELECT * FROM folders
                       WHERE visibility = 'public'
                         AND source_folder_id = ? AND source_owner_id = ?
                       LIMIT 1""",
                    (source_id, owner_id),
                ).fetchone()
                if existing is not None:
                    public_id = existing["id"]
                    public_name = folder["name"] or "未命名文件夹"
                    conn.execute(
                        """UPDATE folders
                           SET name = ?, parent_id = ?, execution_mode = ?,
                               updated_by = ?, updated_at = ?
                           WHERE id = ?""",
                        (
                            public_name,
                            target_parent_id,
                            folder["execution_mode"] or "create_and_count",
                            admin_id,
                            now_iso,
                            public_id,
                        ),
                    )
                    synced_folder_count += 1
                else:
                    public_id = self._new_id("folder")
                    public_name = (
                        self._unique_public_root_name(
                            conn,
                            folder["name"] or "未命名文件夹",
                            target_parent_id,
                        )
                        if is_root
                        else (folder["name"] or "未命名文件夹")
                    )
                    conn.execute(
                        """INSERT INTO folders (
                               id, name, parent_id, execution_mode,
                               source_folder_id, source_owner_id,
                               owner_id, visibility, created_by, updated_by,
                               created_at, updated_at
                           ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'public', ?, ?, ?, ?)""",
                        (
                            public_id,
                            public_name,
                            target_parent_id,
                            folder["execution_mode"] or "create_and_count",
                            source_id,
                            owner_id,
                            admin_id,
                            admin_id,
                            now_iso,
                            now_iso,
                        ),
                    )
                    created_folder_count += 1

                folder_id_map[source_id] = public_id
                if is_root:
                    public_root = {
                        "id": public_id,
                        "name": public_name,
                        "parentId": target_parent_id,
                        "visibility": "public",
                        "sourceFolderId": source_id,
                        "sourceOwnerId": owner_id,
                    }

            placeholders = ",".join("?" for _ in source_folder_ids)
            private_solutions = conn.execute(
                f"""SELECT * FROM solutions
                     WHERE owner_id = ? AND visibility = 'private'
                       AND folder_id IN ({placeholders})
                     ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
                              sort_order ASC, updated_at DESC, id ASC""",
                (owner_id, *source_folder_ids),
            ).fetchall()
            promoted_count = 0
            synchronized_count = 0
            solution_promotions = []

            for solution in private_solutions:
                target_folder_id = folder_id_map[solution["folder_id"]]
                source_version = str(solution["_version"] or 1)
                existing = conn.execute(
                    """SELECT id FROM solutions
                       WHERE visibility = 'public'
                         AND derived_from_solution_id = ?
                         AND derived_from_solution_version = ?
                       LIMIT 1""",
                    (solution["id"], source_version),
                ).fetchone()
                if existing is not None:
                    public_solution_id = existing["id"]
                    conn.execute(
                        """UPDATE solutions
                           SET folder_id = ?, sort_order = ?, updated_by = ?, updated_at = ?
                           WHERE id = ?""",
                        (
                            target_folder_id,
                            solution["sort_order"],
                            admin_id,
                            now_iso,
                            public_solution_id,
                        ),
                    )
                    synchronized_count += 1
                else:
                    public_solution_id = self._new_id("solution")
                    conn.execute(
                        """INSERT INTO solutions (
                               id, name, status, source, folder_id, sort_order,
                               default_crowd_name, nodes, custom_fields,
                               workbench_field_ids, base_published_id,
                               derived_from_solution_id, derived_from_solution_version,
                               _version, owner_id, visibility, created_by, updated_by,
                               created_at, updated_at, published_at
                           ) VALUES (?, ?, 'published', 'admin-promoted', ?, ?, ?, ?, ?, ?,
                                     NULL, ?, ?, 1, NULL, 'public', ?, ?, ?, ?, ?)""",
                        (
                            public_solution_id,
                            solution["name"] or "未命名方案",
                            target_folder_id,
                            solution["sort_order"],
                            solution["default_crowd_name"] or "",
                            solution["nodes"],
                            solution["custom_fields"],
                            solution["workbench_field_ids"],
                            solution["id"],
                            source_version,
                            admin_id,
                            admin_id,
                            now_iso,
                            now_iso,
                            now_iso,
                        ),
                    )
                    promoted_count += 1
                solution_promotions.append(
                    {
                        "sourceSolutionId": solution["id"],
                        "publicSolutionId": public_solution_id,
                        "folderId": target_folder_id,
                        "sourceVersion": source_version,
                    }
                )

        return {
            "folder": public_root,
            "folderCount": len(folder_id_map),
            "createdFolderCount": created_folder_count,
            "syncedFolderCount": synced_folder_count,
            "solutionCount": len(private_solutions),
            "promotedCount": promoted_count,
            "synchronizedCount": synchronized_count,
            "solutionPromotions": solution_promotions,
        }

    def import_share(self, text: str, user_id: str) -> dict:
        now = _utc_now_dt()
        now_iso = _iso(now)
        with get_db(self.db_path) as conn:
            phrase, item = self._lookup(conn, text)
            snapshot = json.loads(item["snapshot"])
            source_root_id = snapshot["rootFolderId"]
            folder_id_map: dict[str, str] = {}
            imported_root = None

            for folder in sorted(snapshot.get("folders", []), key=lambda value: value.get("depth", 0)):
                source_id = folder["id"]
                new_id = self._new_id("folder")
                folder_id_map[source_id] = new_id
                is_root = source_id == source_root_id
                parent_id = None if is_root else folder_id_map.get(folder.get("parentId"))
                name = self._unique_root_name(conn, folder.get("name", ""), user_id) if is_root else (folder.get("name") or "未命名文件夹")
                conn.execute(
                    """INSERT INTO folders (
                           id, name, parent_id, execution_mode, owner_id, visibility,
                           created_by, updated_by, created_at, updated_at
                       ) VALUES (?, ?, ?, ?, ?, 'private', ?, ?, ?, ?)""",
                    (
                        new_id,
                        name,
                        parent_id,
                        folder.get("executionMode", "create_and_count"),
                        user_id,
                        user_id,
                        user_id,
                        now_iso,
                        now_iso,
                    ),
                )
                if is_root:
                    imported_root = {
                        "id": new_id,
                        "name": name,
                        "parentId": None,
                        "executionMode": folder.get("executionMode", "create_and_count"),
                        "ownerId": user_id,
                        "visibility": "private",
                        "createdBy": user_id,
                        "updatedBy": user_id,
                        "createdAt": now_iso,
                        "updatedAt": now_iso,
                    }

            for solution in snapshot.get("solutions", []):
                conn.execute(
                    """INSERT INTO solutions (
                           id, name, status, source, folder_id, sort_order,
                           default_crowd_name, nodes, custom_fields,
                           workbench_field_ids, base_published_id,
                           derived_from_solution_id, derived_from_solution_version,
                           _version, owner_id, visibility, created_by, updated_by,
                           created_at, updated_at, published_at
                       ) VALUES (?, ?, 'published', 'shared-import', ?, ?, ?, ?, ?, ?,
                                 NULL, NULL, NULL, 1, ?, 'private', ?, ?, ?, ?, ?)""",
                    (
                        self._new_id("solution"),
                        solution.get("name") or "未命名方案",
                        folder_id_map.get(solution.get("folderId")),
                        solution.get("sortOrder"),
                        solution.get("defaultCrowdName") or "",
                        json.dumps(solution.get("nodes") or [], ensure_ascii=False),
                        json.dumps(solution.get("customFields") or [], ensure_ascii=False),
                        json.dumps(solution.get("workbenchFieldIds") or [], ensure_ascii=False),
                        user_id,
                        user_id,
                        user_id,
                        now_iso,
                        now_iso,
                        now_iso,
                    ),
                )

            conn.execute(
                """UPDATE folder_share_tokens
                   SET import_count = import_count + 1, last_imported_at = ?
                   WHERE id = ?""",
                (now_iso, item["id"]),
            )

        if imported_root is None:
            raise FolderShareNotFoundError()
        return {
            "folder": imported_root,
            "folderCount": len(folder_id_map),
            "solutionCount": len(snapshot.get("solutions", [])),
            "sharedBy": item["shared_by"],
            "phrase": phrase,
            "sourceOwnerId": item["owner_id"],
            "shareId": item["id"],
        }
