"""Announcement/tutorial documents, media assets, and per-user read state."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .database import get_db, init_db


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class AnnouncementNotFoundError(KeyError):
    pass


class AnnouncementValidationError(ValueError):
    pass


class AnnouncementStore:
    STATUSES = {"draft", "published"}
    KINDS = {"announcement", "tutorial"}
    BLOCK_TYPES = {"heading", "paragraph", "image", "video", "list"}
    MAX_IMAGE_BYTES = 8 * 1024 * 1024
    MAX_VIDEO_BYTES = 100 * 1024 * 1024
    MAX_BLOCKS = 120

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
    def _detect_video(data: bytes) -> tuple[str, str] | None:
        if len(data) >= 12 and data[4:8] == b"ftyp":
            return "video/mp4", ".mp4"
        if data.startswith(b"\x1a\x45\xdf\xa3"):
            return "video/webm", ".webm"
        return None

    @staticmethod
    def _decode_json(value: str | None, fallback):
        try:
            parsed = json.loads(value or "")
        except (TypeError, ValueError):
            return fallback
        return parsed

    @staticmethod
    def _clean_text(value, *, label: str, limit: int, required: bool = False) -> str:
        text = str(value or "").strip()
        if required and not text:
            raise AnnouncementValidationError(f"请填写{label}")
        if len(text) > limit:
            raise AnnouncementValidationError(f"{label}不能超过 {limit} 个字符")
        return text

    def _normalize_highlights(self, value) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise AnnouncementValidationError("本次亮点格式不正确")
        highlights = [self._clean_text(item, label="亮点", limit=120) for item in value]
        highlights = [item for item in highlights if item]
        if len(highlights) > 5:
            raise AnnouncementValidationError("本次亮点最多填写 5 项")
        return highlights

    def _asset_mime_type(self, asset_id: str) -> str | None:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT mime_type FROM announcement_assets WHERE id = ?", (asset_id,)
            ).fetchone()
        return row["mime_type"] if row is not None else None

    def _normalize_content(self, value) -> list[dict]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise AnnouncementValidationError("公告正文格式不正确")
        if len(value) > self.MAX_BLOCKS:
            raise AnnouncementValidationError(f"公告正文最多包含 {self.MAX_BLOCKS} 个内容区块")

        blocks: list[dict] = []
        for raw in value:
            if not isinstance(raw, dict) or raw.get("type") not in self.BLOCK_TYPES:
                raise AnnouncementValidationError("公告正文包含不支持的内容区块")
            block_type = raw["type"]
            if block_type == "heading":
                text = self._clean_text(raw.get("text"), label="小标题", limit=120, required=True)
                blocks.append({"type": "heading", "text": text})
            elif block_type == "paragraph":
                text = self._clean_text(raw.get("text"), label="正文", limit=4000, required=True)
                blocks.append({"type": "paragraph", "text": text})
            elif block_type == "list":
                items = raw.get("items")
                if not isinstance(items, list):
                    raise AnnouncementValidationError("列表内容格式不正确")
                normalized = [self._clean_text(item, label="列表内容", limit=300) for item in items]
                normalized = [item for item in normalized if item]
                if not normalized or len(normalized) > 12:
                    raise AnnouncementValidationError("列表需包含 1 至 12 项内容")
                blocks.append({"type": "list", "items": normalized})
            else:
                media_label = "图片" if block_type == "image" else "视频"
                asset_id = self._clean_text(
                    raw.get("assetId"), label=f"内容{media_label}", limit=100, required=True
                )
                mime_type = self._asset_mime_type(asset_id)
                if mime_type is None or not mime_type.startswith(f"{block_type}/"):
                    raise AnnouncementValidationError(f"内容{media_label}不存在或格式不匹配，请重新上传")
                blocks.append(
                    {
                        "type": block_type,
                        "assetId": asset_id,
                        "alt": self._clean_text(raw.get("alt"), label=f"{media_label}说明", limit=180),
                        "caption": self._clean_text(raw.get("caption"), label=f"{media_label}注释", limit=240),
                    }
                )
        return blocks

    @staticmethod
    def _public_item(row, *, include_content: bool = True) -> dict:
        item = {
            "id": row["id"],
            "kind": row["kind"] if "kind" in row.keys() else "announcement",
            "version": row["version"],
            "title": row["title"],
            "summary": row["summary"],
            "highlights": AnnouncementStore._decode_json(row["highlights"], []),
            "status": row["status"],
            "popupEnabled": bool(row["popup_enabled"]),
            "createdBy": row["created_by"],
            "updatedBy": row["updated_by"],
            "publishedBy": row["published_by"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "publishedAt": row["published_at"],
            "readAt": row["read_at"] if "read_at" in row.keys() else None,
            "dismissedAt": row["dismissed_at"] if "dismissed_at" in row.keys() else None,
        }
        if include_content:
            item["content"] = AnnouncementStore._decode_json(row["content"], [])
        if "read_count" in row.keys():
            item["readCount"] = int(row["read_count"] or 0)
        return item

    def create(self, actor_user_id: str, payload: dict) -> dict:
        kind = self._clean_text(payload.get("kind", "announcement"), label="内容类型", limit=20)
        if kind not in self.KINDS:
            raise AnnouncementValidationError("内容类型不正确")
        version = self._clean_text(
            payload.get("version"), label="版本号", limit=40, required=kind == "announcement"
        )
        title = self._clean_text(payload.get("title"), label="标题", limit=160, required=True)
        summary = self._clean_text(payload.get("summary"), label="摘要", limit=800)
        highlights = self._normalize_highlights(payload.get("highlights"))
        content = self._normalize_content(payload.get("content"))
        popup_enabled = 0
        now = _utc_now()
        announcement_id = f"announcement_{uuid4().hex}"
        with get_db(self.db_path) as conn:
            conn.execute(
                """INSERT INTO announcements (
                    id, kind, version, title, summary, highlights, content, status,
                    popup_enabled, created_by, updated_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)""",
                (
                    announcement_id,
                    kind,
                    version,
                    title,
                    summary,
                    json.dumps(highlights, ensure_ascii=False),
                    json.dumps(content, ensure_ascii=False),
                    popup_enabled,
                    actor_user_id,
                    actor_user_id,
                    now,
                    now,
                ),
            )
        return self.get_admin(announcement_id)

    def update(self, announcement_id: str, actor_user_id: str, payload: dict) -> dict:
        current = self.get_admin(announcement_id)
        if current["status"] != "draft":
            raise AnnouncementValidationError("已发布公告需先撤回后才能编辑")
        kind = self._clean_text(payload.get("kind", current["kind"]), label="内容类型", limit=20)
        if kind not in self.KINDS:
            raise AnnouncementValidationError("内容类型不正确")
        version = self._clean_text(
            payload.get("version", current["version"]),
            label="版本号",
            limit=40,
            required=kind == "announcement",
        )
        title = self._clean_text(
            payload.get("title", current["title"]), label="公告标题", limit=160, required=True
        )
        summary = self._clean_text(
            payload.get("summary", current["summary"]), label="公告摘要", limit=800
        )
        highlights = self._normalize_highlights(payload.get("highlights", current["highlights"]))
        content = self._normalize_content(payload.get("content", current["content"]))
        popup_enabled = 0
        now = _utc_now()
        with get_db(self.db_path) as conn:
            changed = conn.execute(
                """UPDATE announcements
                   SET kind = ?, version = ?, title = ?, summary = ?, highlights = ?, content = ?,
                       popup_enabled = ?, updated_by = ?, updated_at = ?
                   WHERE id = ?""",
                (
                    kind,
                    version,
                    title,
                    summary,
                    json.dumps(highlights, ensure_ascii=False),
                    json.dumps(content, ensure_ascii=False),
                    popup_enabled,
                    actor_user_id,
                    now,
                    announcement_id,
                ),
            )
            if changed.rowcount == 0:
                raise AnnouncementNotFoundError(announcement_id)
        return self.get_admin(announcement_id)

    def list_admin(self, limit: int = 100) -> list[dict]:
        limit = max(1, min(int(limit), 300))
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT announcements.*,
                          (SELECT COUNT(*) FROM announcement_reads
                           WHERE announcement_id = announcements.id AND read_at IS NOT NULL) AS read_count
                   FROM announcements
                   ORDER BY COALESCE(published_at, updated_at) DESC
                   LIMIT ?""",
                (limit,),
            ).fetchall()
        return [self._public_item(row) for row in rows]

    def get_admin(self, announcement_id: str) -> dict:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                """SELECT announcements.*,
                          (SELECT COUNT(*) FROM announcement_reads
                           WHERE announcement_id = announcements.id AND read_at IS NOT NULL) AS read_count
                   FROM announcements WHERE id = ?""",
                (announcement_id,),
            ).fetchone()
        if row is None:
            raise AnnouncementNotFoundError(announcement_id)
        return self._public_item(row)

    def list_published(self, user_id: str, limit: int = 50) -> list[dict]:
        limit = max(1, min(int(limit), 100))
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT announcements.*, reads.read_at, reads.dismissed_at
                   FROM announcements
                   LEFT JOIN announcement_reads AS reads
                     ON reads.announcement_id = announcements.id AND reads.user_id = ?
                   WHERE announcements.status = 'published'
                   ORDER BY announcements.published_at DESC
                   LIMIT ?""",
                (user_id, limit),
            ).fetchall()
        return [self._public_item(row, include_content=False) for row in rows]

    def get_published(self, announcement_id: str, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                """SELECT announcements.*, reads.read_at, reads.dismissed_at
                   FROM announcements
                   LEFT JOIN announcement_reads AS reads
                     ON reads.announcement_id = announcements.id AND reads.user_id = ?
                   WHERE announcements.id = ? AND announcements.status = 'published'""",
                (user_id, announcement_id),
            ).fetchone()
        if row is None:
            raise AnnouncementNotFoundError(announcement_id)
        return self._public_item(row)

    def _upsert_read_state(self, announcement_id: str, user_id: str) -> dict:
        with get_db(self.db_path) as conn:
            exists = conn.execute(
                "SELECT 1 FROM announcements WHERE id = ? AND status = 'published'",
                (announcement_id,),
            ).fetchone()
            if exists is None:
                raise AnnouncementNotFoundError(announcement_id)
            now = _utc_now()
            conn.execute(
                """INSERT INTO announcement_reads (
                       announcement_id, user_id, read_at, dismissed_at
                   ) VALUES (?, ?, ?, ?)
                   ON CONFLICT(announcement_id, user_id) DO UPDATE SET
                       read_at = COALESCE(announcement_reads.read_at, excluded.read_at),
                       dismissed_at = CASE
                           WHEN excluded.dismissed_at IS NOT NULL THEN excluded.dismissed_at
                           ELSE announcement_reads.dismissed_at
                       END""",
                (announcement_id, user_id, now, None),
            )
        return {"id": announcement_id, "readAt": now}

    def mark_read(self, announcement_id: str, user_id: str) -> dict:
        return self._upsert_read_state(announcement_id, user_id)

    def mark_all_read(self, user_id: str) -> dict:
        now = _utc_now()
        with get_db(self.db_path) as conn:
            rows = conn.execute(
                """SELECT announcements.id
                   FROM announcements
                   LEFT JOIN announcement_reads AS reads
                     ON reads.announcement_id = announcements.id AND reads.user_id = ?
                   WHERE announcements.status = 'published' AND reads.read_at IS NULL""",
                (user_id,),
            ).fetchall()
            conn.executemany(
                """INSERT INTO announcement_reads (
                       announcement_id, user_id, read_at, dismissed_at
                   ) VALUES (?, ?, ?, NULL)
                   ON CONFLICT(announcement_id, user_id) DO UPDATE SET
                       read_at = COALESCE(announcement_reads.read_at, excluded.read_at)""",
                [(row["id"], user_id, now) for row in rows],
            )
        return {"readAt": now, "count": len(rows), "unreadCount": 0}

    def publish(self, announcement_id: str, actor_user_id: str) -> dict:
        current = self.get_admin(announcement_id)
        if not current["content"]:
            raise AnnouncementValidationError("请至少添加一段公告正文后再发布")
        now = _utc_now()
        with get_db(self.db_path) as conn:
            conn.execute(
                """UPDATE announcements
                   SET status = 'published', published_by = ?, published_at = ?,
                       updated_by = ?, updated_at = ?
                   WHERE id = ?""",
                (actor_user_id, now, actor_user_id, now, announcement_id),
            )
        return self.get_admin(announcement_id)

    def unpublish(self, announcement_id: str, actor_user_id: str) -> dict:
        self.get_admin(announcement_id)
        now = _utc_now()
        with get_db(self.db_path) as conn:
            conn.execute(
                """UPDATE announcements
                   SET status = 'draft', updated_by = ?, updated_at = ?
                   WHERE id = ?""",
                (actor_user_id, now, announcement_id),
            )
        return self.get_admin(announcement_id)

    def delete(self, announcement_id: str) -> dict:
        current = self.get_admin(announcement_id)
        if current["status"] == "published":
            raise AnnouncementValidationError("已发布公告需先撤回后才能删除")
        with get_db(self.db_path) as conn:
            conn.execute("DELETE FROM announcement_reads WHERE announcement_id = ?", (announcement_id,))
            conn.execute("DELETE FROM announcements WHERE id = ?", (announcement_id,))
        return {"id": announcement_id, "deleted": True}

    def upload_asset(self, actor_user_id: str, uploaded) -> dict:
        if uploaded is None or not uploaded.filename:
            raise AnnouncementValidationError("请选择要上传的图片或视频")
        data = uploaded.stream.read(self.MAX_VIDEO_BYTES + 1)
        detected = self._detect_image(data)
        media_kind = "image"
        max_bytes = self.MAX_IMAGE_BYTES
        if detected is None:
            detected = self._detect_video(data)
            media_kind = "video"
            max_bytes = self.MAX_VIDEO_BYTES
        if detected is None:
            raise AnnouncementValidationError("仅支持 PNG、JPG、WebP 图片或 MP4、WebM 视频")
        if len(data) > max_bytes:
            limit_mb = max_bytes // (1024 * 1024)
            raise AnnouncementValidationError(f"单个{ '图片' if media_kind == 'image' else '视频' }不能超过 {limit_mb} MB")
        mime_type, suffix = detected
        asset_id = f"announcement_asset_{uuid4().hex}"
        stored_name = f"{uuid4().hex}{suffix}"
        original_name = Path(uploaded.filename).name[:180] or f"{media_kind}{suffix}"
        now = _utc_now()
        stored_path = self.upload_dir / stored_name
        try:
            with stored_path.open("xb") as handle:
                handle.write(data)
            with get_db(self.db_path) as conn:
                conn.execute(
                    """INSERT INTO announcement_assets (
                        id, stored_name, original_name, mime_type, byte_size,
                        uploaded_by, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (asset_id, stored_name, original_name, mime_type, len(data), actor_user_id, now),
                )
        except Exception:
            stored_path.unlink(missing_ok=True)
            raise
        return {
            "id": asset_id,
            "originalName": original_name,
            "mimeType": mime_type,
            "kind": media_kind,
            "byteSize": len(data),
            "url": f"/api/announcement-assets/{asset_id}",
            "createdAt": now,
        }

    def get_asset(self, asset_id: str, *, allow_unpublished: bool = False) -> dict:
        with get_db(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM announcement_assets WHERE id = ?", (asset_id,)
            ).fetchone()
            if row is not None and not allow_unpublished:
                referenced = conn.execute(
                    """SELECT 1 FROM announcements
                       WHERE status = 'published' AND content LIKE ? LIMIT 1""",
                    (f"%{asset_id}%",),
                ).fetchone()
                if referenced is None:
                    row = None
        if row is None:
            raise AnnouncementNotFoundError(asset_id)
        return {
            "path": self.upload_dir / row["stored_name"],
            "originalName": row["original_name"],
            "mimeType": row["mime_type"],
        }
