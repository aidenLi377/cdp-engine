"""DMP portrait API: credential interception + tag querying + normalization."""

import json
from pathlib import Path

import httpx

TAGS_JSON_PATH = Path(__file__).parent / "dmp_tags_dictionary.json"


def load_tags() -> list[dict]:
    return json.loads(TAGS_JSON_PATH.read_text(encoding="utf-8"))


def filter_ready_tags(tags: list[dict]) -> list[dict]:
    """Return tags that can be queried without pre-configured conditions."""
    return [t for t in tags if not t.get("needCondition", False)]


def group_tags_by_category(tags: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for tag in tags:
        cat = tag.get("mainCategory", "其他")
        groups.setdefault(cat, []).append(tag)
    return groups


class DmpApiClient:
    """Intercepts DMP API credentials via Playwright CDP,
    then queries portrait tags via httpx."""

    def __init__(self):
        self.api_url: str | None = None
        self.headers: dict[str, str] = {}
        self._intercepted = False

    def intercept_request(self, request) -> None:
        """Callback for page.on('request'). Captures credential-bearing request."""
        if self._intercepted:
            return
        url = request.url
        if "/api_2/" in url and ("/tag/" in url or "tagId=" in url):
            try:
                body = request.post_data
                if body:
                    data = json.loads(body)
                    if data.get("crowdId"):
                        self.api_url = url
                        self.headers = dict(request.headers) if hasattr(request, 'headers') else {}
                        self._intercepted = True
            except (json.JSONDecodeError, TypeError):
                pass

    async def query_all_tags(self, tag_ids: list[str]) -> list[dict]:
        """Query each tag's portrait data using the intercepted credentials."""
        raw_results: list[dict] = []
        for tag_id in tag_ids:
            chunk = await self._query_single_tag(tag_id)
            raw_results.extend(chunk)
        return normalize_rebase(raw_results)

    async def _query_single_tag(self, tag_id: str) -> list[dict]:
        """Call DMP API for one tag, return normalized rows."""
        url = self.api_url
        if "/tag/" in url:
            parts = url.split("/tag/")
            tag_part = parts[-1].split("/")[0]
            url = url.replace(f"/tag/{tag_part}", f"/tag/{tag_id}")
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=self.headers)
            resp.raise_for_status()
            data = resp.json()
        rows = []
        chart_data = data.get("data", {}).get("chartDataFull", [])
        for it in chart_data:
            rows.append({
                "大类": "",
                "标签类型": "",
                "标签名称": it.get("tagName", "-"),
                "特征明细": it.get("optionName", "-"),
                "人群占比": f"{round(float(it.get('rate', 0)) * 100, 2)}%",
                "Rebase": "",
                "点击TGI": it.get("ctrIndex", "-"),
                "转化TGI": it.get("ppcIndex", "-"),
            })
        return rows


def normalize_rebase(rows: list[dict]) -> list[dict]:
    """Auto-Rebase: normalize percentages within each tag group,
    mirroring DMP-Plugin's normalization algorithm."""
    sums: dict[str, float] = {}
    for row in rows:
        tag = row.get("标签名称", "")
        val = row.get("人群占比", "-")
        if val != "-" and not row.get("特征明细", "").startswith("⚠️"):
            sums[tag] = sums.get(tag, 0) + float(val.replace("%", ""))

    for row in rows:
        tag = row.get("标签名称", "")
        val = row.get("人群占比", "-")
        total = sums.get(tag, 0)
        if val != "-" and not row.get("特征明细", "").startswith("⚠️") and total > 0:
            current = float(val.replace("%", ""))
            if total > 100.1:
                row["Rebase"] = f"{current:.2f}%"
            else:
                row["Rebase"] = f"{(current / total * 100):.2f}%"

    return rows
