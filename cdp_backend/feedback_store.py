"""User feedback persistence and private image attachment storage."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .database import get_db, init_db


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class FeedbackNotFoundError(KeyError):
    pass


class FeedbackValidationError(ValueError):
    pass


class FeedbackStore:
    CATEGORIES = {"suggestion", "bug", "question", "other"}
    STATUSES = {"new", "reviewing", "resolved"}
    MAX_ATTACHMENTS = 3
    MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

    def __init__(self, db_path: str, upload_dir: str) -> None:
        self.db_path = db_path
        self.upload_dir = Path(upload_dir)
        init_db(self.db_path)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _detect_image(data: bytes) -> tuple[str, str] | None:
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png", ".png"
        if data.startswith(b"\xff\xd8\xff"):
            return "image/jpeg", ".jpg"
        if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp", ".webp"
        return None

    @staticmethod
    def _public_feedback(row, attachments: list[dict]) -> dict:
        return {
            "id": row["id"],
            "createdBy": row["created_by"],
            "creatorUsername": row["creator_username"],
            "creatorDisplayName": row["creator_display_name"] or row["creator_username"],
            "category": row["category"],
            "message": row["message"],
            "pagePath": row["page_path"],
            "appVersion": row["app_version"],
            "viewport": row["viewport"],
            "status": row["status"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "attachments": attachments,
        }

    def create(
        self,
        created_by: str,
        *,
        category: str,
        message: str,
        page_path: str = "",
        app_version: str = "",
        viewport: str = "",
        files=(),
    ) -> dict:
        category = str(category or "suggestion").strip()
        message = str(message or "").strip()
        if category not in self.CATEGORIES:
            raise FeedbackValidationError("请选择有效的反馈类型")
        if not message:
            raise FeedbackValidationError("请填写反馈内容")
        if len(message) > 2000:
            raise FeedbackValidationError("反馈内容不能超过 2000 个字符")

        files = [item for item in files if item and item.filename]
        if len(files) > self.MAX_ATTACHMENTS:
            raise FeedbackValidationError("最多上传 3 张图片")

        prepared: list[dict] = []
        for uploaded in files:
            data = uploaded.stream.read(self.MAX_ATTACHMENT_BYTES + 1)
            if len(data) > self.MAX_ATTACHMENT_BYTES:
                raise FeedbackValidationError("单张图片不能超过 5 MB")
            detected = self._detect_image(data)
            if detected is None:
                raise FeedbackValidationError("图片仅支持 PNG、JPG 或 WebP")
            mime_type, suffix = detected
            prepared.append(
                {
                    "id": f"feedback_file_{uuid4().hex}",
                    "storedName": f"{uuid4().hex}{suffix}",
                    "originalName": Path(uploaded.filename).name[:180] or f"image{suffix}",
                    "mimeType": mime_type,
                    "byteSize": len(data),
                    "data": data,
                }
            )

        now = _utc_now()
        feedback_id = f"feedback_{uuid4().hex}"
        stored_paths: list[Path] = []
        try:
            for item in prepared:
                stored_path = self.upload_dir / item["storedName"]
                with stored_path.open("xb") as handle:
                    handle.write(item["data"])
                stored_paths.append(stored_path)

            with get_db(self.db_path) as conn:
                conn.execute(
                    """INSERT INTO feedback (
                        id, created_by, category, message, page_path,
                        app_version, viewport, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)""",
                    (
                        feedback_id,
                        created_by,
                        category,
                        message,
                        str(page_path or "")[:500],
                        str(app_version or "")[:80],
                        str(viewport or "")[:80],
                        now,
                        now,
                    ),
                )
                for item in prepared:
                    conn.execute(
                        """INSERT INTO feedback_attachments (
                            id, feedback_id, stored_name, original_name,
                            mime_type, byte_size, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (
                            item["id"],
                            feedback_id,
                            item["storedName"],
                            item["originalName"],
                            item["mimeType"],
                            item["byteSize"],
                            now,
                        ),
                    )
        except Exception:
            for path in stored_paths:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            raise
        return {"id": feedback_id, "status": "new", "createdAt": now}

    def list(self, limit: int = 100) -> list[dict]:
        limit = max(1, min(int(limit), 300))
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT feedback.*, users.username AS creator_username,
                          users.display_name AS creator_display_name
                   FROM feedback
                   LEFT JOIN users ON users.id = feedback.created_by
                   ORDER BY feedback.created_at DESC
                   LIMIT ?""",
                (limit,),
            ).fetchall()
            ids = [row["id"] for row in rows]
            attachment_map: dict[str, list[dict]] = {item: [] for item in ids}
            if ids:
                placeholders = ",".join("?" for _ in ids)
                attachments = conn.execute(
                    f"""SELECT * FROM feedback_attachments
                         WHERE feedback_id IN ({placeholders})
                         ORDER BY created_at""",
                    ids,
                ).fetchall()
                for item in attachments:
                    attachment_map[item["feedback_id"]].append(
                        {
                            "id": item["id"],
                            "originalName": item["original_name"],
                            "mimeType": item["mime_type"],
                            "byteSize": item["byte_size"],
                        }
                    )
        return [self._public_feedback(row, attachment_map[row["id"]]) for row in rows]

    def update_status(self, feedback_id: str, status: str) -> dict:
        status = str(status or "").strip()
        if status not in self.STATUSES:
            raise FeedbackValidationError("反馈状态无效")
        now = _utc_now()
        with get_db(self.db_path) as conn:
            changed = conn.execute(
                "UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, feedback_id),
            )
            if changed.rowcount == 0:
                raise FeedbackNotFoundError(feedback_id)
        return {"id": feedback_id, "status": status, "updatedAt": now}

    def get_attachment(self, attachment_id: str) -> dict:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM feedback_attachments WHERE id = ?",
                (attachment_id,),
            ).fetchone()
        if row is None:
            raise FeedbackNotFoundError(attachment_id)
        return {
            "path": self.upload_dir / row["stored_name"],
            "originalName": row["original_name"],
            "mimeType": row["mime_type"],
        }
