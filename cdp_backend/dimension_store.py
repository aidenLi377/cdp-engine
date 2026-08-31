"""SQLite-backed business dimension dictionaries.

CSV files remain the import/export seed format. The running application reads
the published rows from this store so admin edits do not need to overwrite
source files in place.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
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


class DimensionImportNotFoundError(Exception):
    pass


class DimensionImportStateError(Exception):
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
            "deleted": bool(row["deleted"]),
            "createdBy": row["created_by"],
            "updatedBy": row["updated_by"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    @classmethod
    def _row_to_data(cls, row) -> dict:
        return json.loads(row["data"]) if isinstance(row["data"], str) else row["data"]

    @staticmethod
    def _decode_json_object(value) -> dict:
        if not value:
            return {}
        if isinstance(value, str):
            return json.loads(value)
        return dict(value)

    @classmethod
    def _diff_data(cls, before: dict | None, after: dict | None) -> list[dict]:
        before = before or {}
        after = after or {}
        changes = []
        for field in sorted(set(before) | set(after)):
            before_exists = field in before
            after_exists = field in after
            before_value = before.get(field)
            after_value = after.get(field)
            if before_exists and after_exists and before_value == after_value:
                continue
            if not before_exists:
                kind = "added"
            elif not after_exists:
                kind = "removed"
            else:
                kind = "changed"
            changes.append(
                {
                    "field": field,
                    "kind": kind,
                    "before": before_value if before_exists else None,
                    "after": after_value if after_exists else None,
                }
            )
        return changes

    @staticmethod
    def _record_config_audit(
        conn,
        *,
        actor_user_id: str,
        action: str,
        details: dict,
        dimension_file: str | None = None,
        row_id: str | None = None,
        row_name: str = "",
        created_at: str | None = None,
    ) -> str:
        audit_id = f"config_audit_{uuid4().hex}"
        conn.execute(
            """INSERT INTO config_audit_logs (
                id, actor_user_id, action, dimension_file,
                row_id, row_name, details, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                audit_id,
                actor_user_id,
                action,
                dimension_file,
                row_id,
                str(row_name or ""),
                json.dumps(details or {}, ensure_ascii=False),
                created_at or _utc_now(),
            ),
        )
        return audit_id

    @classmethod
    def _pending_change_groups(cls, rows) -> list[dict]:
        grouped: dict[str, list[dict]] = {}
        for row in rows:
            filename = row["dimension_file"]
            before = (
                cls._decode_json_object(row["published_data"])
                if row["is_published"]
                else {}
            )
            after = cls._decode_json_object(row["data"])
            changes = cls._diff_data(before, after)
            if bool(row["published_enabled"]) != bool(row["enabled"]):
                changes.append(
                    {
                        "field": "启用状态",
                        "kind": "changed",
                        "before": "启用" if row["published_enabled"] else "停用",
                        "after": "启用" if row["enabled"] else "停用",
                    }
                )
            if bool(row["published_deleted"]) != bool(row["deleted"]):
                changes.append(
                    {
                        "field": "记录状态",
                        "kind": "removed" if row["deleted"] else "added",
                        "before": "已删除" if row["published_deleted"] else "存在",
                        "after": "待删除" if row["deleted"] else "恢复",
                    }
                )
            if not row["is_published"]:
                operation = "created"
            elif row["deleted"] and not row["published_deleted"]:
                operation = "deleted"
            elif bool(row["published_enabled"]) != bool(row["enabled"]):
                operation = "status_changed"
            else:
                operation = "updated"
            grouped.setdefault(filename, []).append(
                {
                    "rowId": row["id"],
                    "rowName": row["display_name"],
                    "operation": operation,
                    "changes": changes,
                }
            )
        return [
            {"dimensionFile": filename, "rows": grouped[filename]}
            for filename in sorted(grouped)
        ]

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
                       AND published_enabled = 1 AND published_deleted = 0""",
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
                    ORDER BY
                        CASE WHEN is_published = 1 THEN published_deleted ELSE deleted END ASC,
                        CASE WHEN is_published = 1 THEN published_enabled ELSE enabled END DESC,
                        package_name, display_name, id
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
            self._record_config_audit(
                conn,
                actor_user_id=user_id,
                action="DIMENSION_ROW_CREATED",
                dimension_file=filename,
                row_id=row_id,
                row_name=data[self._name_column(filename)],
                created_at=now,
                details={
                    "summary": "新增维表记录",
                    "changes": self._diff_data({}, data),
                    "before": None,
                    "after": data,
                },
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
            current_data = self._row_to_data(current)
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
                       data = ?, deleted = 0, has_changes = 1,
                       updated_by = ?, updated_at = ?
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
            self._record_config_audit(
                conn,
                actor_user_id=user_id,
                action="DIMENSION_ROW_UPDATED",
                dimension_file=filename,
                row_id=row_id,
                row_name=data[self._name_column(filename)],
                created_at=now,
                details={
                    "summary": "修改维表字段",
                    "changes": self._diff_data(current_data, data),
                    "before": current_data,
                    "after": data,
                },
            )
        return self.get_row(filename, row_id)

    def set_enabled(self, filename: str, row_id: str, enabled: bool, user_id: str) -> dict:
        self._name_column(filename)
        now = _utc_now()
        with get_db(self.db_path) as conn:
            current = conn.execute(
                "SELECT * FROM dimension_rows WHERE dimension_file = ? AND id = ?",
                (filename, row_id),
            ).fetchone()
            if current is None:
                raise DimensionNotFoundError(row_id)
            cursor = conn.execute(
                """UPDATE dimension_rows
                   SET enabled = ?, has_changes = 1, updated_by = ?, updated_at = ?
                   WHERE dimension_file = ? AND id = ?""",
                (1 if enabled else 0, user_id, now, filename, row_id),
            )
            if cursor.rowcount == 0:
                raise DimensionNotFoundError(row_id)
            self._record_config_audit(
                conn,
                actor_user_id=user_id,
                action="DIMENSION_ROW_STATUS_CHANGED",
                dimension_file=filename,
                row_id=row_id,
                row_name=current["display_name"],
                created_at=now,
                details={
                    "summary": "修改维表记录状态",
                    "changes": [
                        {
                            "field": "启用状态",
                            "kind": "changed",
                            "before": "启用" if current["enabled"] else "停用",
                            "after": "启用" if enabled else "停用",
                        }
                    ],
                    "before": {"enabled": bool(current["enabled"])},
                    "after": {"enabled": bool(enabled)},
                },
            )
        return self.get_row(filename, row_id)

    def delete_row(self, filename: str, row_id: str, user_id: str) -> dict:
        """Stage a published row for deletion, preserving discard/release semantics."""
        self._name_column(filename)
        now = _utc_now()
        with get_db(self.db_path) as conn:
            current = conn.execute(
                "SELECT * FROM dimension_rows WHERE dimension_file = ? AND id = ?",
                (filename, row_id),
            ).fetchone()
            if current is None:
                raise DimensionNotFoundError(row_id)
            if not current["is_published"]:
                conn.execute("DELETE FROM dimension_rows WHERE id = ?", (row_id,))
            else:
                conn.execute(
                    """UPDATE dimension_rows
                       SET deleted = 1, enabled = 0, has_changes = 1,
                           updated_by = ?, updated_at = ?
                       WHERE dimension_file = ? AND id = ?""",
                    (user_id, now, filename, row_id),
                )
            current_data = self._row_to_data(current)
            self._record_config_audit(
                conn,
                actor_user_id=user_id,
                action="DIMENSION_ROW_DELETED",
                dimension_file=filename,
                row_id=row_id,
                row_name=current["display_name"],
                created_at=now,
                details={
                    "summary": "删除维表记录",
                    "changes": [
                        {
                            "field": field,
                            "kind": "removed",
                            "before": value,
                            "after": None,
                        }
                        for field, value in current_data.items()
                    ],
                    "before": current_data,
                    "after": None,
                    "staged": bool(current["is_published"]),
                },
            )
        if not current["is_published"]:
            return {
                "id": row_id,
                "dimensionFile": filename,
                "deleted": True,
                "hasChanges": False,
                "removed": True,
            }
        return self.get_row(filename, row_id)

    def read_dimension_rows(self, filename: str) -> list[dict]:
        """Return active source-shaped rows for ConfigEngine."""
        self._name_column(filename)
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT published_data AS data FROM dimension_rows
                   WHERE dimension_file = ? AND is_published = 1
                   AND published_enabled = 1 AND published_deleted = 0
                   ORDER BY package_name, display_name, id""",
                (filename,),
            ).fetchall()
        return [self._row_to_data(row) for row in rows]

    @classmethod
    def _normalize_import_rows(cls, filename: str, rows: list[dict]) -> list[dict]:
        if not isinstance(rows, list) or not rows:
            raise DimensionValidationError("导入数据不能为空")
        normalized_rows = []
        seen: dict[str, int] = {}
        duplicate_issues = []
        for index, item in enumerate(rows, start=2):
            if isinstance(item, dict) and "data" in item:
                row_number = int(item.get("rowNumber") or index)
                raw_data = item.get("data")
            else:
                row_number = index
                raw_data = item
            data = cls._normalize_data(filename, raw_data)
            key = cls._natural_key(filename, data)
            if key in seen:
                duplicate_issues.append(
                    {
                        "row": row_number,
                        "column": cls._name_column(filename),
                        "code": "DUPLICATE_NATURAL_KEY",
                        "message": f"与第 {seen[key]} 行的唯一记录重复",
                    }
                )
            else:
                seen[key] = row_number
            normalized_rows.append({"rowNumber": row_number, "data": data})
        if duplicate_issues:
            error = DimensionConflictError("导入数据中存在重复记录")
            error.issues = duplicate_issues
            raise error
        return normalized_rows

    @classmethod
    def _import_row_reference(
        cls,
        filename: str,
        item: dict,
        *,
        existing_row_id: str = "",
        duplicate_of_row: int | None = None,
    ) -> dict:
        data = item["data"]
        name_column = cls._name_column(filename)
        identity_columns = [
            column
            for column in REQUIRED_DIMENSION_COLUMNS[filename]
            if column not in {"适用的包", name_column, "适用的渠道"}
            and data.get(column)
        ]
        return {
            "row": item["rowNumber"],
            "packageName": data.get("适用的包", ""),
            "displayName": data.get(name_column, ""),
            "channel": data.get("适用的渠道", ""),
            "identity": " · ".join(
                f"{column}: {data[column]}" for column in identity_columns
            ),
            "existingRowId": existing_row_id,
            "duplicateOfRow": duplicate_of_row,
        }

    @classmethod
    def _plan_import(cls, conn, filename: str, normalized_rows: list[dict]) -> dict:
        existing_rows = conn.execute(
            "SELECT * FROM dimension_rows WHERE dimension_file = ?",
            (filename,),
        ).fetchall()
        existing_by_key = {row["natural_key"]: row for row in existing_rows}
        created = 0
        updated = 0
        unchanged = 0
        for item in normalized_rows:
            data = item["data"]
            current = existing_by_key.get(cls._natural_key(filename, data))
            if current is None:
                created += 1
            elif (
                cls._row_to_data(current) == data
                and bool(current["enabled"])
                and not bool(current["deleted"])
            ):
                unchanged += 1
            else:
                updated += 1
        return {
            "created": created,
            "updated": updated,
            "unchanged": unchanged,
            "total": len(normalized_rows),
        }

    def create_import_preview(
        self,
        filename: str,
        rows: list[dict],
        user_id: str,
        *,
        source_name: str,
        sheet_name: str,
        row_count: int,
        column_count: int,
    ) -> dict:
        if not isinstance(rows, list) or not rows:
            raise DimensionValidationError("导入数据不能为空")
        normalized_rows = []
        duplicate_rows = []
        seen: dict[str, int] = {}
        for index, item in enumerate(rows, start=2):
            if isinstance(item, dict) and "data" in item:
                row_number = int(item.get("rowNumber") or index)
                raw_data = item.get("data")
            else:
                row_number = index
                raw_data = item
            normalized = {
                "rowNumber": row_number,
                "data": self._normalize_data(filename, raw_data),
            }
            natural_key = self._natural_key(filename, normalized["data"])
            if natural_key in seen:
                duplicate_rows.append(
                    self._import_row_reference(
                        filename,
                        normalized,
                        duplicate_of_row=seen[natural_key],
                    )
                )
                continue
            seen[natural_key] = row_number
            normalized_rows.append(normalized)

        now = _utc_now()
        expires_at = (
            datetime.now(timezone.utc) + timedelta(minutes=30)
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        import_id = ""
        with get_db(self.db_path) as conn:
            conn.execute(
                "UPDATE dimension_import_jobs SET status = 'expired' "
                "WHERE status = 'pending' AND expires_at <= ?",
                (now,),
            )
            existing = {
                row["natural_key"]: row
                for row in conn.execute(
                    "SELECT id, natural_key FROM dimension_rows WHERE dimension_file = ?",
                    (filename,),
                ).fetchall()
            }
            new_rows = []
            existing_rows = []
            for item in normalized_rows:
                natural_key = self._natural_key(filename, item["data"])
                current = existing.get(natural_key)
                if current is None:
                    new_rows.append(item)
                else:
                    existing_rows.append(
                        self._import_row_reference(
                            filename,
                            item,
                            existing_row_id=current["id"],
                        )
                    )

            skipped = len(existing_rows) + len(duplicate_rows)
            if new_rows:
                import_id = f"dim_import_{uuid4().hex}"
                conn.execute(
                    """INSERT INTO dimension_import_jobs (
                        id, dimension_file, created_by, source_name, sheet_name,
                        row_count, column_count, created_count, updated_count,
                        unchanged_count, rows_json, status, created_at, expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', ?, ?)""",
                    (
                        import_id,
                        filename,
                        user_id,
                        str(source_name or ""),
                        str(sheet_name or ""),
                        int(row_count),
                        int(column_count),
                        len(new_rows),
                        skipped,
                        json.dumps(new_rows, ensure_ascii=False),
                        now,
                        expires_at,
                    ),
                )
        return {
            "importId": import_id,
            "expiresAt": expires_at if import_id else None,
            "created": len(new_rows),
            "updated": 0,
            "unchanged": skipped,
            "existing": len(existing_rows),
            "duplicateInFile": len(duplicate_rows),
            "skipped": skipped,
            "total": int(row_count),
            "existingRows": existing_rows,
            "duplicateRows": duplicate_rows,
        }

    def _apply_import_rows(
        self,
        conn,
        filename: str,
        normalized_rows: list[dict],
        user_id: str,
        *,
        source_name: str = "",
        sheet_name: str = "",
        column_count: int = 0,
        source_row_count: int = 0,
        skipped_count: int = 0,
        replace: bool = False,
    ) -> dict:
        now = _utc_now()
        if replace:
            conn.execute(
                """UPDATE dimension_rows
                   SET enabled = 0, deleted = 0, has_changes = 1,
                       updated_by = ?, updated_at = ?
                   WHERE dimension_file = ?""",
                (user_id, now, filename),
            )

        plan = self._plan_import(conn, filename, normalized_rows)
        existing_rows = conn.execute(
            "SELECT * FROM dimension_rows WHERE dimension_file = ?",
            (filename,),
        ).fetchall()
        existing_by_key = {row["natural_key"]: row for row in existing_rows}

        for item in normalized_rows:
            data = item["data"]
            natural_key = self._natural_key(filename, data)
            current = existing_by_key.get(natural_key)
            if current is not None:
                if (
                    self._row_to_data(current) == data
                    and bool(current["enabled"])
                    and not bool(current["deleted"])
                ):
                    continue
                published_data = (
                    self._decode_json_object(current["published_data"])
                    if current["is_published"]
                    else None
                )
                has_changes = not (
                    bool(current["is_published"])
                    and published_data == data
                    and bool(current["published_enabled"])
                    and not bool(current["published_deleted"])
                )
                conn.execute(
                    """UPDATE dimension_rows
                       SET package_name = ?, display_name = ?, data = ?,
                           enabled = 1, deleted = 0, has_changes = ?,
                           updated_by = ?, updated_at = ?
                       WHERE dimension_file = ? AND id = ?""",
                    (
                        data.get("适用的包", ""),
                        data[self._name_column(filename)],
                        json.dumps(data, ensure_ascii=False),
                        1 if has_changes else 0,
                        user_id,
                        now,
                        filename,
                        current["id"],
                    ),
                )
                continue

            row_id = f"dim_{uuid4().hex}"
            conn.execute(
                """INSERT INTO dimension_rows (
                    id, dimension_file, natural_key, package_name, display_name,
                    data, enabled, published_data, published_enabled,
                    is_published, has_changes, deleted, created_by, updated_by,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, 0, 0, 1, 0, ?, ?, ?, ?)""",
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

        result = {
            **plan,
            "rowCount": len(normalized_rows),
            "columnCount": int(column_count or len(REQUIRED_DIMENSION_COLUMNS[filename])),
            "sourceRowCount": int(source_row_count or len(normalized_rows)),
            "skipped": int(skipped_count),
        }
        self._record_config_audit(
            conn,
            actor_user_id=user_id,
            action="DIMENSION_ROWS_IMPORTED",
            dimension_file=filename,
            created_at=now,
            details={
                "summary": "通过 Excel 批量导入维表记录" if source_name else "批量导入维表记录",
                **result,
                "sourceName": source_name,
                "sheetName": sheet_name,
                "replace": bool(replace),
            },
        )
        return result

    def confirm_import(self, filename: str, import_id: str, user_id: str) -> dict:
        now = _utc_now()
        result = None
        state_error = None
        with get_db(self.db_path) as conn:
            job = conn.execute(
                """SELECT * FROM dimension_import_jobs
                   WHERE id = ? AND dimension_file = ? AND created_by = ?""",
                (import_id, filename, user_id),
            ).fetchone()
            if job is None:
                raise DimensionImportNotFoundError(import_id)
            if job["status"] != "pending":
                state_error = "这次导入已处理，请重新选择文件"
            elif job["expires_at"] <= now:
                conn.execute(
                    "UPDATE dimension_import_jobs SET status = 'expired' WHERE id = ?",
                    (import_id,),
                )
                state_error = "导入预检已超过 30 分钟，请重新核对"
            else:
                normalized_rows = self._normalize_import_rows(
                    filename,
                    json.loads(job["rows_json"]),
                )
                current_plan = self._plan_import(conn, filename, normalized_rows)
                expected_plan = {
                    "created": job["created_count"],
                    "updated": 0,
                    "unchanged": 0,
                    "total": job["created_count"],
                }
                if current_plan != expected_plan:
                    conn.execute(
                        "UPDATE dimension_import_jobs SET status = 'expired' WHERE id = ?",
                        (import_id,),
                    )
                    state_error = "维表在预检后发生了变化，请重新核对导入数量"
                else:
                    result = self._apply_import_rows(
                        conn,
                        filename,
                        normalized_rows,
                        user_id,
                        source_name=job["source_name"],
                        sheet_name=job["sheet_name"],
                        column_count=job["column_count"],
                        source_row_count=job["row_count"],
                        skipped_count=job["unchanged_count"],
                    )
                    conn.execute(
                        """UPDATE dimension_import_jobs
                           SET status = 'confirmed', confirmed_at = ? WHERE id = ?""",
                        (now, import_id),
                    )
        if state_error:
            raise DimensionImportStateError(state_error)
        return result

    def import_rows(
        self,
        filename: str,
        rows: list[dict],
        user_id: str,
        replace: bool = False,
    ) -> dict:
        normalized_rows = self._normalize_import_rows(filename, rows)
        with get_db(self.db_path) as conn:
            result = self._apply_import_rows(
                conn,
                filename,
                normalized_rows,
                user_id,
                replace=replace,
            )
        return result

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

    def get_published_version(self) -> dict:
        """Return the lightweight version marker shared by all app workers."""
        with get_db(self.db_path) as conn:
            latest = conn.execute(
                """SELECT version_number, published_at
                   FROM config_versions ORDER BY version_number DESC LIMIT 1"""
            ).fetchone()
        return {
            "version": latest["version_number"] if latest else 0,
            "publishedAt": latest["published_at"] if latest else None,
        }

    def publish_changes(self, user_id: str, note: str = "") -> dict:
        note = str(note or "").strip()
        if len(note) > 300:
            raise DimensionValidationError("发布说明不能超过 300 个字符")
        now = _utc_now()
        with get_db(self.db_path) as conn:
            pending_rows = conn.execute(
                "SELECT * FROM dimension_rows WHERE has_changes = 1"
            ).fetchall()
            pending = len(pending_rows)
            if pending == 0:
                raise DimensionValidationError("没有待发布的配置修改")
            conn.execute(
                """UPDATE dimension_rows
                   SET published_data = data,
                       published_enabled = enabled,
                       published_deleted = deleted,
                       is_published = 1,
                       has_changes = 0
                   WHERE has_changes = 1"""
            )
            rows = conn.execute(
                """SELECT id, dimension_file, natural_key, package_name,
                          display_name, published_data, published_enabled,
                          published_deleted
                   FROM dimension_rows
                   WHERE is_published = 1 AND published_deleted = 0
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
            self._record_config_audit(
                conn,
                actor_user_id=user_id,
                action="CONFIG_PUBLISHED",
                created_at=now,
                details={
                    "summary": f"发布配置 V{version_number}",
                    "version": version_number,
                    "note": note,
                    "changeCount": pending,
                    "tables": self._pending_change_groups(pending_rows),
                },
            )
        return {
            "id": version_id,
            "version": version_number,
            "changeCount": pending,
            "note": note,
            "publishedBy": user_id,
            "publishedAt": now,
        }

    def discard_changes(self, user_id: str) -> dict:
        now = _utc_now()
        with get_db(self.db_path) as conn:
            pending_rows = conn.execute(
                "SELECT * FROM dimension_rows WHERE has_changes = 1"
            ).fetchall()
            change_groups = self._pending_change_groups(pending_rows)
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
                           deleted = published_deleted,
                           has_changes = 0
                       WHERE id = ?""",
                    (
                        self._natural_key(filename, published_data),
                        published_data.get("适用的包", ""),
                        published_data[self._name_column(filename)],
                        row["id"],
                    ),
                )
            if pending_rows:
                self._record_config_audit(
                    conn,
                    actor_user_id=user_id,
                    action="CONFIG_DRAFT_DISCARDED",
                    created_at=now,
                    details={
                        "summary": "放弃全部待发布修改",
                        "changeCount": len(pending_rows),
                        "tables": change_groups,
                    },
                )
        return {"discarded": len(pending_rows)}

    def list_config_audit_logs(
        self,
        *,
        limit: int = 60,
        dimension_file: str | None = None,
    ) -> dict:
        limit = min(200, max(1, int(limit)))
        clauses = []
        params: list = []
        if dimension_file:
            self._name_column(dimension_file)
            clauses.append("(logs.dimension_file = ? OR logs.details LIKE ?)")
            params.extend(
                [dimension_file, f'%"dimensionFile": "{dimension_file}"%']
            )
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with get_db(self.db_path) as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM config_audit_logs AS logs {where}",
                tuple(params),
            ).fetchone()[0]
            rows = conn.execute(
                f"""SELECT logs.*,
                           actor.username AS actor_username,
                           actor.display_name AS actor_display_name
                    FROM config_audit_logs AS logs
                    LEFT JOIN users AS actor ON actor.id = logs.actor_user_id
                    {where}
                    ORDER BY logs.created_at DESC, logs.id DESC
                    LIMIT ?""",
                tuple(params + [limit]),
            ).fetchall()
        return {
            "items": [
                {
                    "id": row["id"],
                    "actorUserId": row["actor_user_id"],
                    "actorUsername": row["actor_username"],
                    "actorDisplayName": row["actor_display_name"],
                    "action": row["action"],
                    "dimensionFile": row["dimension_file"],
                    "rowId": row["row_id"],
                    "rowName": row["row_name"],
                    "details": json.loads(row["details"] or "{}"),
                    "createdAt": row["created_at"],
                }
                for row in rows
            ],
            "total": total,
        }

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
