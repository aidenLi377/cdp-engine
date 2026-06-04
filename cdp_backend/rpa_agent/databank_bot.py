"""Databank (databank.tmall.com) page automation via Playwright."""

import asyncio
from playwright.async_api import Page, TimeoutError as PlaywrightTimeout

DATABANK_CROWD_LIST_URL = "https://databank.tmall.com/#/userDefinedAnalyses"


class DatabankBot:
    """Operates on databank.tmall.com — crowd list search and push-to-DMP."""

    def __init__(self, page: Page):
        self.page = page

    async def navigate_to_crowd_list(self) -> None:
        await self.page.goto(DATABANK_CROWD_LIST_URL, wait_until="networkidle")
        await asyncio.sleep(2)

    async def search_crowd(self, crowd_name: str) -> bool:
        search_selectors = [
            'input[placeholder*="搜索"]',
            'input[placeholder*="人群"]',
            'input[placeholder*="名称"]',
            '.el-input__inner[placeholder*="搜索"]',
        ]
        for sel in search_selectors:
            try:
                search_input = await self.page.wait_for_selector(sel, timeout=3000)
                if search_input:
                    await search_input.click()
                    await search_input.fill("")
                    await search_input.fill(crowd_name)
                    await self.page.keyboard.press("Enter")
                    await asyncio.sleep(2)
                    return True
            except PlaywrightTimeout:
                continue
        return False

    async def find_crowd_row(self, crowd_name: str):
        try:
            row = await self.page.wait_for_selector(
                f'tr:has-text("{crowd_name}")',
                timeout=10000,
            )
            return row
        except PlaywrightTimeout:
            return None

    async def click_push_to_dmp(self, crowd_row) -> bool:
        push_selectors = [
            'button:has-text("推送至达摩盘")',
            'span:has-text("推送至达摩盘")',
            'a:has-text("推送")',
            'button:has-text("推送")',
        ]
        for sel in push_selectors:
            try:
                btn = await crowd_row.wait_for_selector(sel, timeout=3000)
                if btn:
                    await btn.click()
                    return True
            except PlaywrightTimeout:
                continue
        try:
            push_btn = await crowd_row.wait_for_selector('text=推送', timeout=3000)
            if push_btn:
                await push_btn.click()
                return True
        except PlaywrightTimeout:
            pass
        return False

    async def wait_for_push_complete(self, timeout_sec: int = 120) -> bool:
        deadline = asyncio.get_event_loop().time() + timeout_sec
        while asyncio.get_event_loop().time() < deadline:
            for text in ["推送成功", "已完成", "同步完成"]:
                try:
                    el = await self.page.wait_for_selector(f'text="{text}"', timeout=1000)
                    if el:
                        return True
                except PlaywrightTimeout:
                    pass

            status_selectors = [
                'td:has-text("已完成")',
                'span:has-text("已完成")',
            ]
            for sel in status_selectors:
                try:
                    el = await self.page.wait_for_selector(sel, timeout=500)
                    if el:
                        return True
                except PlaywrightTimeout:
                    pass

            await asyncio.sleep(2)
        return False
