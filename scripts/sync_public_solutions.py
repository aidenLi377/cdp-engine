"""Safely copy published public solutions from production into a local database."""

from __future__ import annotations

import argparse
import json
import shlex
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOCAL_DB = PROJECT_ROOT / ".runtime" / "cdp.db"
DEFAULT_IDENTITY = Path.home() / ".ssh" / "cdp_github_actions_ed25519"
DEFAULT_REMOTE_HOST = "cdpdeploy@43.129.69.144"
DEFAULT_REMOTE_DB = "/srv/cdp/shared/cdp.db"

FOLDER_COLUMNS = (
    "id",
    "name",
    "parent_id",
    "visibility",
    "created_at",
    "updated_at",
)
SOLUTION_COLUMNS = (
    "id",
    "name",
    "status",
    "source",
    "folder_id",
    "sort_order",
    "default_crowd_name",
    "nodes",
    "custom_fields",
    "workbench_field_ids",
    "base_published_id",
    "derived_from_solution_id",
    "derived_from_solution_version",
    "_version",
    "visibility",
    "created_at",
    "updated_at",
    "published_at",
)


def _remote_rows(
    identity: Path,
    remote_host: str,
    remote_db: str,
    table: str,
    columns: tuple[str, ...],
    where_clause: str,
) -> list[dict[str, Any]]:
    query = f"SELECT {','.join(columns)} FROM {table} WHERE {where_clause};"
    remote_command = (
        f"sqlite3 -json {shlex.quote(remote_db)} {shlex.quote(query)}"
    )
    completed = subprocess.run(
        [
            "ssh",
            "-i",
            str(identity),
            "-o",
            "IdentitiesOnly=yes",
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=yes",
            remote_host,
            remote_command,
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    raw = completed.stdout.strip()
    rows = json.loads(raw) if raw else []
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise RuntimeError(f"Unexpected {table} export format")
    return rows


def _validate_rows(
    folders: list[dict[str, Any]], solutions: list[dict[str, Any]]
) -> None:
    folder_ids = [str(row.get("id") or "") for row in folders]
    solution_ids = [str(row.get("id") or "") for row in solutions]
    if not all(folder_ids) or len(folder_ids) != len(set(folder_ids)):
        raise RuntimeError("Public folder export contains invalid or duplicate IDs")
    if not all(solution_ids) or len(solution_ids) != len(set(solution_ids)):
        raise RuntimeError("Public solution export contains invalid or duplicate IDs")
    if any(row.get("visibility") != "public" for row in folders):
        raise RuntimeError("Folder export unexpectedly contains non-public data")
    if any(
        row.get("visibility") != "public" or row.get("status") != "published"
        for row in solutions
    ):
        raise RuntimeError("Solution export unexpectedly contains non-public data")
    for row in solutions:
        for field in ("nodes", "custom_fields", "workbench_field_ids"):
            raw = row.get(field)
            if raw not in (None, ""):
                json.loads(raw)


def _row_changes(
    conn: sqlite3.Connection,
    table: str,
    columns: tuple[str, ...],
    rows: list[dict[str, Any]],
) -> tuple[int, int, int]:
    inserted = updated = unchanged = 0
    for row in rows:
        existing = conn.execute(
            f"SELECT {','.join(columns)}, visibility FROM {table} WHERE id = ?",
            (row["id"],),
        ).fetchone()
        if existing is None:
            inserted += 1
            continue
        if existing["visibility"] != "public":
            raise RuntimeError(
                f"Refusing to overwrite non-public {table} row {row['id']}"
            )
        current = tuple(existing[column] for column in columns)
        incoming = tuple(row.get(column) for column in columns)
        if current == incoming:
            unchanged += 1
        else:
            updated += 1
    return inserted, updated, unchanged


def _upsert_rows(
    conn: sqlite3.Connection,
    table: str,
    columns: tuple[str, ...],
    rows: list[dict[str, Any]],
) -> None:
    placeholders = ",".join("?" for _ in columns)
    updates = ",".join(
        f"{column}=excluded.{column}" for column in columns if column != "id"
    )
    sql = (
        f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {updates}"
    )
    conn.executemany(sql, [tuple(row.get(column) for column in columns) for row in rows])


def _backup_database(conn: sqlite3.Connection, local_db: Path) -> Path:
    backup_dir = local_db.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_path = backup_dir / f"cdp-before-public-solution-sync-{stamp}.db"
    with sqlite3.connect(backup_path) as backup_conn:
        conn.backup(backup_conn)
    return backup_path


def sync(args: argparse.Namespace) -> dict[str, Any]:
    identity = Path(args.identity).expanduser().resolve()
    local_db = Path(args.local_db).expanduser().resolve()
    if not identity.is_file():
        raise FileNotFoundError(f"SSH identity not found: {identity}")
    if not local_db.is_file():
        raise FileNotFoundError(f"Local database not found: {local_db}")

    folders = _remote_rows(
        identity,
        args.remote_host,
        args.remote_db,
        "folders",
        FOLDER_COLUMNS,
        "visibility='public'",
    )
    solutions = _remote_rows(
        identity,
        args.remote_host,
        args.remote_db,
        "solutions",
        SOLUTION_COLUMNS,
        "visibility='public' AND status='published'",
    )
    _validate_rows(folders, solutions)

    backup_path: Path | None = None
    with sqlite3.connect(local_db, timeout=30) as conn:
        conn.row_factory = sqlite3.Row
        folder_changes = _row_changes(conn, "folders", FOLDER_COLUMNS, folders)
        solution_changes = _row_changes(conn, "solutions", SOLUTION_COLUMNS, solutions)
        if not args.dry_run:
            backup_path = _backup_database(conn, local_db)
            conn.execute("BEGIN IMMEDIATE")
            _upsert_rows(conn, "folders", FOLDER_COLUMNS, folders)
            _upsert_rows(conn, "solutions", SOLUTION_COLUMNS, solutions)
            conn.commit()

    return {
        "dryRun": bool(args.dry_run),
        "remotePublicFolders": len(folders),
        "remotePublishedPublicSolutions": len(solutions),
        "folderChanges": dict(zip(("inserted", "updated", "unchanged"), folder_changes)),
        "solutionChanges": dict(
            zip(("inserted", "updated", "unchanged"), solution_changes)
        ),
        "solutionNames": [row["name"] for row in solutions],
        "backupPath": str(backup_path) if backup_path else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--local-db", default=str(DEFAULT_LOCAL_DB))
    parser.add_argument("--identity", default=str(DEFAULT_IDENTITY))
    parser.add_argument("--remote-host", default=DEFAULT_REMOTE_HOST)
    parser.add_argument("--remote-db", default=DEFAULT_REMOTE_DB)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(json.dumps(sync(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
