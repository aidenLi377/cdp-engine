"""RPA pipeline orchestrator — coordinates bots, API, and storage."""

import asyncio
import json
import logging
import os
import threading
from pathlib import Path

from playwright.async_api import async_playwright

from .dmp_api import DmpApiClient, filter_ready_tags, load_tags
from .excel_builder import ExcelBuilder
from .task_store import TaskStore

logger = logging.getLogger(__name__)

USER_DATA_DIR = os.environ.get(
    "RPA_USER_DATA_DIR",
    str(Path.home() / ".cdp-rpa-chrome-profile"),
)


class RpaError(Exception):
    pass


class RpaOrchestrator:
    """Runs the full databank -> DMP -> Excel pipeline in a background thread."""

    def __init__(self, store: TaskStore, results_dir: Path):
        self.store = store
        self.results_dir = Path(results_dir)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.tags = load_tags()
        self.ready_tags = filter_ready_tags(self.tags)

    def run(self, task_id: str, crowd_name: str, tag_ids: list[str]) -> None:
        task = self.store.get_task(task_id)
        if task is None:
            logger.error("Task %s not found", task_id)
            return

        try:
            asyncio.run(self._execute(task_id, crowd_name, tag_ids))
        except Exception as exc:
            logger.exception("RPA task %s failed", task_id)
            self.store.mark_failed(task_id, f"{type(exc).__name__}: {exc}")

    async def _execute(self, task_id: str, crowd_name: str, tag_ids: list[str]) -> None:
        from .databank_bot import DatabankBot
        from .dmp_bot import DmpBot

        self._progress(task_id, "running", "databank_search",
                       f"搜索人群: {crowd_name}", 5)

        async with async_playwright() as pw:
            browser = await pw.chromium.launch_persistent_context(
                USER_DATA_DIR,
                headless=False,
            )
            page = await browser.new_page()

            try:
                # Step 1: Databank search
                db_bot = DatabankBot(page)
                await db_bot.navigate_to_crowd_list()
                await db_bot.search_crowd(crowd_name)
                self._progress(task_id, "running", "databank_search",
                               f"已搜索到人群: {crowd_name}", 15)

                row = await db_bot.find_crowd_row(crowd_name)
                if row is None:
                    raise RpaError(f"未在人群列表中找到: {crowd_name}")

                # Step 2: Push to DMP
                self._progress(task_id, "running", "databank_push",
                               "正在推送至达摩盘...", 25)
                clicked = await db_bot.click_push_to_dmp(row)
                if not clicked:
                    raise RpaError("未找到推送按钮")
                self._progress(task_id, "running", "databank_push",
                               "等待推送完成...", 35)
                pushed = await db_bot.wait_for_push_complete()
                if not pushed:
                    raise RpaError("推送至达摩盘未完成（超时）")

                # Step 3: DMP portrait
                self._progress(task_id, "running", "dmp_locate",
                               f"打开达摩盘，搜索人群: {crowd_name}", 45)
                dmp = DmpBot(page)
                await dmp.navigate_to_dmp()
                await dmp.navigate_to_crowd_list()
                await dmp.search_crowd(crowd_name)
                self._progress(task_id, "running", "dmp_portrait",
                               "正在点击画像透视...", 55)
                clicked = await dmp.click_portrait_analysis()
                if not clicked:
                    raise RpaError("未找到画像透视按钮")
                ready = await dmp.wait_for_portrait_page_ready()
                if not ready:
                    raise RpaError("画像透视页面未加载完成")

                # Step 4: Intercept credentials + query
                dmp_api = DmpApiClient()
                page.on("request", lambda req: dmp_api.intercept_request(req))

                self._progress(task_id, "running", "dmp_query",
                               "等待画像API请求以获取凭证...", 60)
                for _ in range(20):
                    await asyncio.sleep(1)
                    if dmp_api._intercepted:
                        break
                if not dmp_api._intercepted:
                    raise RpaError("未能拦截到DMP画像API请求，请检查页面网络请求")

                # Step 5: Query all tags
                total_tags = len(tag_ids)
                portrait_data: list[dict] = []
                tag_dict = {t["tagId"]: t for t in self.tags}

                for i, tag_id in enumerate(tag_ids[:total_tags]):
                    tag_info = tag_dict.get(tag_id)
                    pct = 65 + int((i + 1) / total_tags * 25)
                    self._progress(task_id, "running", "dmp_query",
                                   f"查询画像标签 ({i + 1}/{total_tags}): {tag_info.get('tagName', tag_id)}",
                                   pct)
                    try:
                        rows = await dmp_api.query_all_tags([tag_id])
                        for row in rows:
                            if tag_info:
                                row["大类"] = tag_info.get("mainCategory", "")
                                row["标签类型"] = tag_info.get("category", "")
                            else:
                                row["大类"] = "未知"
                                row["标签类型"] = "未知"
                        portrait_data.extend(rows)
                    except Exception as exc:
                        logger.warning("Tag %s query failed: %s", tag_id, exc)
                        if tag_info:
                            portrait_data.append({
                                "大类": tag_info.get("mainCategory", ""),
                                "标签类型": tag_info.get("category", ""),
                                "标签名称": tag_info.get("tagName", tag_id),
                                "特征明细": "",
                                "人群占比": "-",
                                "Rebase": "-",
                                "点击TGI": "-",
                                "转化TGI": "-",
                            })

                # Step 6: Generate Excel
                self._progress(task_id, "running", "build_excel",
                               f"生成 Excel ({len(portrait_data)} 行)...", 92)
                if not portrait_data:
                    raise RpaError("未获取到任何画像数据")
                excel_name = f"{task_id}.xlsx"
                excel_path = self.results_dir / excel_name
                builder = ExcelBuilder()
                builder.build(portrait_data, str(excel_path))

                # Step 7: Store result
                self._progress(task_id, "running", "upload_result",
                               "保存结果...", 98)
                preview = portrait_data[:50]
                self.store.update_result(
                    task_id,
                    excel_filename=excel_name,
                    preview_rows=preview,
                    total_rows=len(portrait_data),
                )
                logger.info("RPA task %s completed: %d rows", task_id, len(portrait_data))

            finally:
                await browser.close()

    def _progress(self, task_id: str, status: str, step: str,
                  detail: str, percent: int) -> None:
        self.store.update_progress(
            task_id,
            status=status,
            step=step,
            detail=detail,
            percent=percent,
        )
        logger.info("[%s] %d%% %s: %s", task_id, percent, step, detail)
