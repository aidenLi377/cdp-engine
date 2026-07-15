"""One-shot migration: existing JSON runtime files → SQLite.

Run once after deploying the new code:
    python migrate_json_to_sqlite.py

Safe to run multiple times — existing DB rows are left untouched; only
missing rows from the JSON files are inserted.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# Ensure the cdp_backend package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cdp_backend.database import get_db, init_db
from cdp_backend.constants import (
    BASE_DIR,
    RUNTIME_DIRNAME,
    SOLUTIONS_FILENAME,
    FOLDERS_FILENAME,
    TASKS_FILENAME,
)

RUNTIME_DIR = os.path.join(BASE_DIR, RUNTIME_DIRNAME)


def _load_json(filename: str) -> dict:
    path = os.path.join(RUNTIME_DIR, filename)
    if not os.path.exists(path):
        print(f"  [WARN] {filename} not found, skipping")
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def migrate_solutions() -> int:
    data = _load_json(SOLUTIONS_FILENAME)
    items = data.get("solutions", [])
    if not items:
        print("  [INFO] No solutions to migrate")
        return 0

    key_map = {
        "id": "id", "name": "name", "status": "status", "source": "source",
        "folderId": "folder_id", "defaultCrowdName": "default_crowd_name",
        "nodes": "nodes", "customFields": "custom_fields",
        "workbenchFieldIds": "workbench_field_ids",
        "basePublishedId": "base_published_id",
        "derivedFromSolutionId": "derived_from_solution_id",
        "derivedFromSolutionVersion": "derived_from_solution_version",
        "_version": "_version", "createdAt": "created_at",
        "updatedAt": "updated_at", "publishedAt": "published_at",
    }
    json_fields = {"nodes", "customFields", "workbenchFieldIds"}

    count = 0
    with get_db() as conn:
        for item in items:
            row = {}
            for json_key, col in key_map.items():
                val = item.get(json_key)
                if col in {k.replace("Id", "_id").replace("At", "_at") for k in json_fields} or \
                   json_key in json_fields:
                    val = json.dumps(val, ensure_ascii=False) if val is not None and not isinstance(val, str) else val
                row[col] = val

            # Skip if already present
            existing = conn.execute("SELECT 1 FROM solutions WHERE id = ?", (row["id"],)).fetchone()
            if existing:
                continue

            conn.execute(
                """INSERT INTO solutions (
                    id, name, status, source, folder_id, default_crowd_name,
                    nodes, custom_fields, workbench_field_ids, base_published_id,
                    derived_from_solution_id, derived_from_solution_version,
                    _version, created_at, updated_at, published_at
                ) VALUES (
                    :id, :name, :status, :source, :folder_id, :default_crowd_name,
                    :nodes, :custom_fields, :workbench_field_ids, :base_published_id,
                    :derived_from_solution_id, :derived_from_solution_version,
                    :_version, :created_at, :updated_at, :published_at
                )""",
                row,
            )
            count += 1
    return count


def migrate_folders() -> int:
    data = _load_json(FOLDERS_FILENAME)
    items = data.get("folders", [])
    if not items:
        print("  [INFO] No folders to migrate")
        return 0

    count = 0
    with get_db() as conn:
        # Flatten tree; insert top-down
        def _walk(nodes, parent_id=None):
            nonlocal count
            for node in nodes:
                row = {
                    "id": node["id"],
                    "name": node["name"],
                    "parent_id": parent_id,
                    "created_at": node.get("createdAt", ""),
                    "updated_at": node.get("updatedAt", ""),
                }
                existing = conn.execute("SELECT 1 FROM folders WHERE id = ?", (row["id"],)).fetchone()
                if not existing:
                    conn.execute(
                        "INSERT INTO folders (id, name, parent_id, created_at, updated_at) "
                        "VALUES (:id, :name, :parent_id, :created_at, :updated_at)",
                        row,
                    )
                    count += 1
                children = node.get("children", [])
                if children:
                    _walk(children, node["id"])

        _walk(items)
    return count


def migrate_tasks(owner_username: str = "admin") -> int:
    data = _load_json(TASKS_FILENAME)
    items = data.get("tasks", [])

    count = 0
    with get_db() as conn:
        owner = conn.execute(
            "SELECT id FROM users WHERE username = ? COLLATE NOCASE",
            (owner_username.strip(),),
        ).fetchone()
        if owner is None:
            raise ValueError(f"Task owner user not found: {owner_username}")
        owner_id = owner["id"]
        conn.execute(
            "UPDATE tasks SET owner_id = ? WHERE owner_id IS NULL",
            (owner_id,),
        )

        if not items:
            print("  [INFO] No tasks to migrate")
            return 0

        for item in items:
            row = {
                "id": item.get("id", ""),
                "owner_id": owner_id,
                "name": item.get("name", ""),
                "type": item.get("type", ""),
                "crowd_name": item.get("crowdName", ""),
                "tag_ids": json.dumps(item.get("tagIds", []), ensure_ascii=False)
                if not isinstance(item.get("tagIds"), str) else item.get("tagIds"),
                "status": item.get("status", "pending"),
                "phase": item.get("phase", 0),
                "phase_label": item.get("phaseLabel", ""),
                "progress": item.get("progress", 0),
                "message": item.get("message", ""),
                "result": json.dumps(item.get("result"), ensure_ascii=False)
                if item.get("result") is not None and not isinstance(item.get("result"), str)
                else item.get("result"),
                "crowd_count": item.get("crowdCount"),
                "created_at": item.get("createdAt", ""),
                "updated_at": item.get("updatedAt", ""),
            }
            existing = conn.execute("SELECT 1 FROM tasks WHERE id = ?", (row["id"],)).fetchone()
            if existing:
                continue
            conn.execute(
                """INSERT INTO tasks (
                    id, owner_id, name, type, crowd_name, tag_ids,
                    status, phase, phase_label, progress, message,
                    result, crowd_count, created_at, updated_at
                ) VALUES (
                    :id, :owner_id, :name, :type, :crowd_name, :tag_ids,
                    :status, :phase, :phase_label, :progress, :message,
                    :result, :crowd_count, :created_at, :updated_at
                )""",
                row,
            )
            count += 1
    return count


def main(argv: list[str] | None = None):
    parser = argparse.ArgumentParser(description="Migrate legacy CDP JSON data to SQLite")
    parser.add_argument(
        "--task-owner",
        default="admin",
        help="Username that owns legacy tasks (default: admin)",
    )
    args = parser.parse_args(argv)

    print("Initializing SQLite database …")
    init_db()
    print()

    print("Migrating solutions …")
    n = migrate_solutions()
    print(f"  [OK] {n} solutions migrated")

    print("Migrating folders …")
    n = migrate_folders()
    print(f"  [OK] {n} folders migrated")

    print("Migrating tasks …")
    n = migrate_tasks(args.task_owner)
    print(f"  [OK] {n} tasks migrated")

    print()
    print("Migration complete.  You can now start the app.")


if __name__ == "__main__":
    main()
