"""DMP (dmp.taobao.com) page automation via Playwright."""

import asyncio
from playwright.async_api import Page, TimeoutError as PlaywrightTimeout

DMP_URL = "https://dmp.taobao.com"


class DmpBot:
    """Operates on dmp.taobao.com — locate crowd and trigger portrait analysis."""

    def __init__(self, page: Page):
        self.page = page

    async def navigate_to_dmp(self) -> None:
        await self.page.goto(DMP_URL, wait_until="networkidle")
        await asyncio.sleep(3)

    async def navigate_to_crowd_list(self) -> bool:
        nav_selectors = [
            'a:has-text("人群")',
            'span:has-text("人群列表")',
            'a:has-text("人群列表")',
            'span:has-text("我的人群")',
        ]
        for sel in nav_selectors:
            try:
                link = await self.page.wait_for_selector(sel, timeout=5000)
                if link:
                    await link.click()
                    await asyncio.sleep(2)
                    return True
            except PlaywrightTimeout:
                continue
        return False

    async def search_crowd(self, crowd_name: str) -> bool:
        search_selectors = [
            'input[placeholder*="搜索"]',
            'input[placeholder*="人群名"]',
            'input[placeholder*="名称"]',
        ]
        for sel in search_selectors:
            try:
                inp = await self.page.wait_for_selector(sel, timeout=5000)
                if inp:
                    await inp.click()
                    await inp.fill("")
                    await inp.fill(crowd_name)
                    await self.page.keyboard.press("Enter")
                    await asyncio.sleep(2)
                    return True
            except PlaywrightTimeout:
                continue
        return False

    async def click_portrait_analysis(self) -> bool:
        portrait_selectors = [
            'button:has-text("画像透视")',
            'span:has-text("画像透视")',
            'a:has-text("画像透视")',
            'text=画像透视',
        ]
        for sel in portrait_selectors:
            try:
                btn = await self.page.wait_for_selector(sel, timeout=10000)
                if btn:
                    await btn.click()
                    await asyncio.sleep(3)
                    return True
            except PlaywrightTimeout:
                continue
        return False

    async def wait_for_portrait_page_ready(self, timeout_sec: int = 30) -> bool:
        deadline = asyncio.get_event_loop().time() + timeout_sec
        while asyncio.get_event_loop().time() < deadline:
            readiness_indicators = [
                'span:has-text("标签")',
                'text=特征',
                '.tag-checkbox',
                'text=画像透视',
            ]
            for sel in readiness_indicators:
                try:
                    el = await self.page.wait_for_selector(sel, timeout=500)
                    if el and await el.is_visible():
                        return True
                except PlaywrightTimeout:
                    pass
            await asyncio.sleep(1)
        return False
