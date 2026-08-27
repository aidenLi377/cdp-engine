"""SQLite health, inventory and verified online-backup helpers."""

from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


COUNT_TABLES = {
    "users": "用户",
    "solutions": "方案",
    "folders": "文件夹",
    "tasks": "任务",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _connect_readonly(db_path: str) -> sqlite3.Connection:
    path = Path(db_path).resolve()
    return sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True, timeout=10)


def collect_data_safety(db_path: str, backup_dir: str) -> dict:
    db_file = Path(db_path).resolve()
    backup_root = Path(backup_dir).resolve()
    counts = {key: 0 for key in COUNT_TABLES}
    quick_check = "missing"
    if db_file.is_file():
        with closing(_connect_readonly(str(db_file))) as conn:
            quick_check = str(conn.execute("PRAGMA quick_check").fetchone()[0])
            for table in COUNT_TABLES:
                counts[table] = int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

    backups = sorted(
        (item for item in backup_root.glob("*.db") if item.is_file()),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    ) if backup_root.exists() else []
    latest = backups[0] if backups else None
    return {
        "database": {
            "path": str(db_file),
            "exists": db_file.is_file(),
            "quickCheck": quick_check,
            "healthy": quick_check == "ok",
            "byteSize": db_file.stat().st_size if db_file.is_file() else 0,
            "modifiedAt": datetime.fromtimestamp(
                db_file.stat().st_mtime, timezone.utc
            ).replace(microsecond=0).isoformat().replace("+00:00", "Z") if db_file.is_file() else None,
        },
        "counts": counts,
        "backup": {
            "directory": str(backup_root),
            "count": len(backups),
            "latestName": latest.name if latest else None,
            "latestAt": datetime.fromtimestamp(
                latest.stat().st_mtime, timezone.utc
            ).replace(microsecond=0).isoformat().replace("+00:00", "Z") if latest else None,
            "latestByteSize": latest.stat().st_size if latest else 0,
        },
        "checkedAt": _utc_now(),
    }


def create_backup(db_path: str, backup_dir: str) -> dict:
    source_path = Path(db_path).resolve()
    if not source_path.is_file():
        raise FileNotFoundError("数据库文件不存在")
    backup_root = Path(backup_dir).resolve()
    backup_root.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = backup_root / f"cdp-manual-{timestamp}.db"
    suffix = 1
    while destination.exists():
        destination = backup_root / f"cdp-manual-{timestamp}-{suffix}.db"
        suffix += 1

    source = sqlite3.connect(str(source_path), timeout=30)
    target = sqlite3.connect(str(destination), timeout=30)
    try:
        source.backup(target)
        check = str(target.execute("PRAGMA quick_check").fetchone()[0])
        if check != "ok":
            raise RuntimeError(f"备份完整性检查失败：{check}")
    except Exception:
        target.close()
        source.close()
        destination.unlink(missing_ok=True)
        raise
    else:
        target.close()
        source.close()
    try:
        os.chmod(destination, 0o600)
    except OSError:
        pass
    return {
        "name": destination.name,
        "path": str(destination),
        "byteSize": destination.stat().st_size,
        "createdAt": _utc_now(),
        "verified": True,
    }
