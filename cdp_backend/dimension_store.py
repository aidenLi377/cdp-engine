"""SQLite-backed business dimension dictionaries.

CSV files remain the import/export seed format. The running application reads
the published rows from this store so admin edits do not need to overwrite
source files in place.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from .constants import (
    BEHAVIOR_DIM_FILE,
    DIMENSION_FILES,
    DIMENSION_NAME_COLUMNS,
    REQUIRED_DIMENSION_COLUMNS,
    BASE_DIR,
)
from .csv_utils import project_path, read_csv_flexible
from .database import get_db, init_db


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class DimensionNotFoundError(Exception):
    pass


class DimensionValidationError(ValueError):
    pass


class DimensionConflictError(Exception):
    pass


class DimensionStore:
    NAME_COLUMNS = {
        **DIMENSION_NAME_COLUMNS,
        BEHAVIOR_DIM_FILE: "行为名称",
    }

    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path
        init_db(self.db_path)
        self.seed_from_csv()

    @classmethod
    def _name_column(cls, filename: str) -> str:
        if filename not in REQUIRED_DIMENSION_COLUMNS:
            raise DimensionValidationError("不支持的维表类型")
        return cls.NAME_COLUMNS.get(filename, "")

    @classmethod
    def _normalize_data(cls, filename: str, data: dict) -> dict[str, str]:
        if not isinstance(data, dict):
            raise DimensionValidationError("维表数据必须是对象")
        required = REQUIRED_DIMENSION_COLUMNS.get(filename)
        if required is None:
            raise DimensionValidationError("不支持的维表类型")
        normalized = {
            str(key).strip(): "" if value is None else str(value).strip()
            for key, value in data.items()
            if str(key).strip()
        }
        missing = [column for column in required if column not in normalized]
        if missing:
            raise DimensionValidationError(f"缺少必填字段：{', '.join(missing)}")
        name_column = cls._name_column(filename)
        if not name_column or not normalized.get(name_column):
            raise DimensionValidationError("维表名称不能为空")
        if not normalized.get("适用的包"):
            raise DimensionValidationError("适用的包不能为空")
        return normalized

    @classmethod
    def _natural_key(cls, filename: str, data: dict[str, str]) -> str:
        package_name = data.get("适用的包", "")
        name = data.get(cls._name_column(filename), "")
        parts = [package_name, name]
        if filename == BEHAVIOR_DIM_FILE:
            parts.append(data.get("适用的渠道", "") or "ALL")
        return "\x1f".join(parts)

    @classmethod
    def _row_to_public(cls, row) -> dict:
        data = json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]
        return {
            "id": row["id"],
            "dimensionFile": row["dimension_file"],
            "packageName": row["package_name"],
            "displayName": row["display_name"],
            "data": data,
            "enabled": bool(row["enabled"]),
            "published": bool(row["is_published"]),
            "hasChanges": bool(row["has_changes"]),
            "createdBy": row["created_by"],
            "updatedBy": row["updated_by"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    @classmethod
    def _row_to_data(cls, row) -> dict:
        return json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]

    def seed_from_csv(self) -> None:
        """Import existing CSV rows once, without overwriting admin changes."""
        with get_db(self.db_path) as conn:
            for filename in DIMENSION_FILES:
                path = project_path(filename)
                try:
                    frame, _ = read_csv_flexible(path)
                except Exception:
                    continue
                existing_count = conn.execute(
                    "SELECT COUNT(*) FROM dimension_rows WHERE dimension_file = ?",
                    (filename,),
                ).fetchone()[0]
                if existing_count >= len(frame.index):
                    continue
                now = _utc_now()
                for _, raw_row in frame.iterrows():
                    data = {
                        str(key).strip(): "" if value is None else str(value).strip()
                        for key, value in raw_row.to_dict().items()
                    }
                    try:
                        data = self._normalize_data(filename, data)
                    except DimensionValidationError:
                        continue
                    package_name = data.get("适用的包", "")
                    display_name = data[self._name_column(filename)]
                    natural_key = self._natural_key(filename, data)
                    conn.execute(
                        """INSERT OR IGNORE INTO dimension_rows (
                            id, dimension_file, natural_key, package_name, display_name,
                            data, enabled, published_data, published_enabled,
                            is_published, has_changes, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, 1, 0, ?, ?)""",
                        (
                            f"dim_{uuid4().hex}",
                            filename,
                            natural_key,
                            package_name,
                            display_name,
                            json.dumps(data, ensure_ascii=False),
                            json.dumps(data, ensure_ascii=False),
                            now,
                            now,
                        ),
                    )

    def list_dimensions(self) -> list[dict]:
        with get_db(self.db_path) as conn:
            result = []
            for filename in DIMENSION_FILES:
                total = conn.execute(
                    "SELECT COUNT(*) FROM dimension_rows WHERE dimension_file = ?",
                    (filename,),
                ).fetchone()[0]
                active = conn.execute(
                    """SELECT COUNT(*) FROM dimension_rows
                       WHERE dimension_file = ? AND is_published = 1
                       AND published_enabled = 1""",
                    (filename,),
                ).fetchone()[0]
                pending = conn.execute(
                    """SELECT COUNT(*) FROM dimension_rows
                       WHERE dimension_file = ? AND has_changes = 1""",
                    (filename,),
                ).fetchone()[0]
                result.append(
                    {
                        "file": filename,
                        "nameColumn": self._name_column(filename),
                        "requiredColumns": REQUIRED_DIMENSION_COLUMNS[filename],
                        "total": total,
                        "active": active,
                        "pending": pending,
                    }
                )
        return result

    def list_rows(
        self,
        filename: str,
        page: int = 1,
        page_size: int = 50,
        query: str = "",
        package_name: str = "",
        include_disabled: bool = True,
    ) -> dict:
        self._name_column(filename)
        page = max(1, int(page))
        page_size = min(200, max(1, int(page_size)))
        clauses = ["dimension_file = ?"]
        params: list[str | int] = [filename]
        if not include_disabled:
            clauses.append("enabled = 1")
        if package_name:
            clauses.append("package_name = ?")
            params.append(package_name)
        if query:
            clauses.append("(display_name LIKE ? OR package_name LIKE ? OR data LIKE ?)")
            pattern = f"%{query}%"
            params.extend([pattern, pattern, pattern])
        where = " AND ".join(clauses)
        with get_db(self.db_path) as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM dimension_rows WHERE {where}",
                tuple(params),
            ).fetchone()[0]
            rows = conn.execute(
                f"""SELECT * FROM dimension_rows
                    WHERE {where}
                    ORDER BY enabled DESC, package_name, display_name, id
                    LIMIT ? OFFSET ?""",
                tuple(params + [page_size, (page - 1) * page_size]),
            ).fetchall()
            packages = conn.execute(
                """SELECT DISTINCT package_name FROM dimension_rows
                   WHERE dimension_file = ? ORDER BY package_name""",
                (filename,),
            ).fetchall()
        return {
            "rows": [self._row_to_public(row) for row in rows],
            "page": page,
            "pageSize": page_size,
            "total": total,
            "packages": [row["package_name"] for row in packages if row["package_name"]],
            "columns": REQUIRED_DIMENSION_COLUMNS[filename],
            "nameColumn": self._name_column(filename),
        }

    def get_row(self, filename: str, row_id: str) -> dict:
        self._name_column(filename)
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM dimension_rows WHERE dimension_file = ? AND id = ?",
                (filename, row_id),
            ).fetchone()
        if row is None:
            raise DimensionNotFoundError(row_id)
        return self._row_to_public(row)

    def create_row(self, filename: str, data: dict, user_id: str) -> dict:
        data = self._normalize_data(filename, data)
        natural_key = self._natural_key(filename, data)
        now = _utc_now()
        row_id = f"dim_{uuid4().hex}"
        with get_db(self.db_path) as conn:
            existing = conn.execute(
                """SELECT id FROM dimension_rows
                   WHERE dimension_file = ? AND natural_key = ?""",
                (filename, natural_key),
            ).fetchone()
            if existing is not None:
                raise DimensionConflictError("同一维表中已存在相同的包和名称")
            conn.execute(
                """INSERT INTO dimension_rows (
                    id, dimension_file, natural_key, package_name, display_name,
                    data, enabled, published_data, published_enabled,
                    is_published, has_changes, created_by, updated_by,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 0, 0, 1, ?, ?, ?, ?)""",
                (
                    row_id,
                    filename,
                    natural_key,
                    data.get("适用的包", ""),
                    data[self._name_column(filename)],
                    json.dumps(data, ensure_ascii=False),
                    user_id,
                    user_id,
                    now,
                    now,
                ),
            )
        return self.get_row(filename, row_id)

    def update_row(self, filename: str, row_id: str, data: dict, user_id: str) -> dict:
        data = self._normalize_data(filename, data)
        natural_key = self._natural_key(filename, data)
        now = _utc_now()
        with get_db(self.db_path) as conn:
            current = conn.execute(
                "SELECT * FROM dimension_rows WHERE dimension_file = ? AND id = ?",
                (filename, row_id),
            ).fetchone()
            if current is None:
                raise DimensionNotFoundError(row_id)
            existing = conn.execute(
                """SELECT id FROM dimension_rows
                   WHERE dimension_file = ? AND natural_key = ? AND id != ?""",
                (filename, natural_key, row_id),
            ).fetchone()
            if existing is not None:
                raise DimensionConflictError("修改后会与已有维表记录重复")
            conn.execute(
                """UPDATE dimension_rows
                   SET natural_key = ?, package_name = ?, display_name = ?,
                       data = ?, has_changes = 1, updated_by = ?, updated_at = ?
                   WHERE dimension_file = ? AND id = ?""",
                (
                    natural_key,
                    data.get("适用的包", ""),
                    data[self._name_column(filename)],
                    json.dumps(data, ensure_ascii=False),
                    user_id,
                    now,
                    filename,
                    row_id,
                ),
            )
        return self.get_row(filename, row_id)

    def set_enabled(self, filename: str, row_id: str, enabled: bool, user_id: str) -> dict:
        self._name_column(filename)
        with get_db(self.db_path) as conn:
            cursor = conn.execute(
                """UPDATE dimension_rows
                   SET enabled = ?, has_changes = 1, updated_by = ?, updated_at = ?
                   WHERE dimension_file = ? AND id = ?""",
                (1 if enabled else 0, user_id, _utc_now(), filename, row_id),
            )
            if cursor.rowcount == 0:
                raise DimensionNotFoundError(row_id)
        return self.get_row(filename, row_id)

    def read_dimension_rows(self, filename: str) -> list[dict]:
        """Return active source-shaped rows for ConfigEngine."""
        self._name_column(filename)
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT published_data AS data FROM dimension_rows
                   WHERE dimension_file = ? AND is_published = 1
                   AND published_enabled = 1
                   ORDER BY package_name, display_name, id""",
                (filename,),
            ).fetchall()
        return [self._row_to_data(row) for row in rows]

    def import_rows(
        self,
        filename: str,
        rows: list[dict],
        user_id: str,
        replace: bool = False,
    ) -> dict:
        if not isinstance(rows, list) or not rows:
            raise DimensionValidationError("导入数据不能为空")
        normalized_rows = [self._normalize_data(filename, row) for row in rows]
        seen: set[str] = set()
        for data in normalized_rows:
            key = self._natural_key(filename, data)
            if key in seen:
                raise DimensionConflictError("导入数据中存在重复记录")
            seen.add(key)
        if replace:
            with get_db(self.db_path) as conn:
                conn.execute(
                    """UPDATE dimension_rows
                       SET enabled = 0, has_changes = 1,
                           updated_by = ?, updated_at = ?
                       WHERE dimension_file = ?""",
                    (user_id, _utc_now(), filename),
                )
        created = 0
        updated = 0
        for data in normalized_rows:
            natural_key = self._natural_key(filename, data)
            with get_db(self.db_path) as conn:
                existing = conn.execute(
                    """SELECT id FROM dimension_rows
                       WHERE dimension_file = ? AND natural_key = ?""",
                    (filename, natural_key),
                ).fetchone()
            if existing:
                self.update_row(filename, existing["id"], data, user_id)
                self.set_enabled(filename, existing["id"], True, user_id)
                updated += 1
            else:
                self.create_row(filename, data, user_id)
                created += 1
        return {"created": created, "updated": updated, "total": len(normalized_rows)}

    def get_config_status(self) -> dict:
        with get_db(self.db_path) as conn:
            pending = conn.execute(
                "SELECT COUNT(*) FROM dimension_rows WHERE has_changes = 1"
            ).fetchone()[0]
            latest = conn.execute(
                """SELECT version_number, note, published_by, published_at, change_count
                   FROM config_versions ORDER BY version_number DESC LIMIT 1"""
            ).fetchone()
        return {
            "pendingChanges": pending,
            "currentVersion": latest["version_number"] if latest else 0,
            "latestVersion": (
                {
                    "version": latest["version_number"],
                    "note": latest["note"],
                    "publishedBy": latest["published_by"],
                    "publishedAt": latest["published_at"],
                    "changeCount": latest["change_count"],
                }
                if latest
                else None
            ),
        }

    def publish_changes(self, user_id: str, note: str = "") -> dict:
        note = str(note or "").strip()
        if len(note) > 300:
            raise DimensionValidationError("发布说明不能超过 300 个字符")
        now = _utc_now()
        with get_db(self.db_path) as conn:
            pending = conn.execute(
                "SELECT COUNT(*) FROM dimension_rows WHERE has_changes = 1"
            ).fetchone()[0]
            if pending == 0:
                raise DimensionValidationError("没有待发布的配置修改")
            conn.execute(
                """UPDATE dimension_rows
                   SET published_data = data,
                       published_enabled = enabled,
                       is_published = 1,
                       has_changes = 0
                   WHERE has_changes = 1"""
            )
            rows = conn.execute(
                """SELECT id, dimension_file, natural_key, package_name,
                          display_name, published_data, published_enabled
                   FROM dimension_rows WHERE is_published = 1
                   ORDER BY dimension_file, natural_key, id"""
            ).fetchall()
            snapshot = [
                {
                    "id": row["id"],
                    "dimensionFile": row["dimension_file"],
                    "naturalKey": row["natural_key"],
                    "packageName": row["package_name"],
                    "displayName": row["display_name"],
                    "data": json.loads(row["published_data"]),
                    "enabled": bool(row["published_enabled"]),
                }
                for row in rows
            ]
            latest = conn.execute(
                "SELECT COALESCE(MAX(version_number), 0) FROM config_versions"
            ).fetchone()[0]
            version_number = int(latest) + 1
            version_id = f"config_{uuid4().hex}"
            conn.execute(
                """INSERT INTO config_versions (
                    id, version_number, snapshot, change_count, note,
                    published_by, published_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    version_id,
                    version_number,
                    json.dumps(snapshot, ensure_ascii=False),
                    pending,
                    note,
                    user_id,
                    now,
                ),
            )
        return {
            "id": version_id,
            "version": version_number,
            "changeCount": pending,
            "note": note,
            "publishedBy": user_id,
            "publishedAt": now,
        }

    def discard_changes(self) -> dict:
        with get_db(self.db_path) as conn:
            pending_rows = conn.execute(
                "SELECT * FROM dimension_rows WHERE has_changes = 1"
            ).fetchall()
            for row in pending_rows:
                if not row["is_published"]:
                    conn.execute("DELETE FROM dimension_rows WHERE id = ?", (row["id"],))
                    continue
                published_data = json.loads(row["published_data"])
                filename = row["dimension_file"]
                conn.execute(
                    """UPDATE dimension_rows
                       SET natural_key = ?, package_name = ?, display_name = ?,
                           data = published_data, enabled = published_enabled,
                           has_changes = 0
                       WHERE id = ?""",
                    (
                        self._natural_key(filename, published_data),
                        published_data.get("适用的包", ""),
                        published_data[self._name_column(filename)],
                        row["id"],
                    ),
                )
        return {"discarded": len(pending_rows)}

    def list_versions(self, limit: int = 20) -> list[dict]:
        limit = min(100, max(1, int(limit)))
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT id, version_number, change_count, note,
                          published_by, published_at
                   FROM config_versions
                   ORDER BY version_number DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "version": row["version_number"],
                "changeCount": row["change_count"],
                "note": row["note"],
                "publishedBy": row["published_by"],
                "publishedAt": row["published_at"],
            }
            for row in rows
        ]
