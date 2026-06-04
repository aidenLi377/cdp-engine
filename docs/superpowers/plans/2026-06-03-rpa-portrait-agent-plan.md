# RPA Portrait Analysis Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an RPA agent that automates "databank push → DMP portrait → Excel" after the user manually creates a crowd on databank.

**Architecture:** Flask backend spawns Playwright-driven agent in background thread. Agent navigates databank + DMP pages, intercepts API credentials via CDP, queries portrait tags, generates Excel, stores result. Frontend polls task progress and downloads Excel.

**Tech Stack:** Python 3.12+, Playwright, openpyxl, httpx, Flask (existing), Vue 3 + Element Plus (existing)

---

## File Structure Map

```
cdp_backend/
  rpa_agent/
    __init__.py                   # Package init, exports
    task_store.py                 # Task CRUD (JSON file + threading lock)
    excel_builder.py              # openpyxl Excel generation with styling
    dmp_api.py                    # Playwright CDP interception + httpx API calls
    databank_bot.py               # Databank page: search crowd → push to DMP
    dmp_bot.py                    # DMP page: locate crowd → click portrait
    orchestrator.py               # Full pipeline, step-by-step progress reporting
    dmp_tags_dictionary.json      # 57 portrait tags (copied from DMP-Plugin)
  app_factory.py                  # +5 new routes for RPA
  constants.py                    # +RPA runtime dirs

cdp-web/src/
  components/
    PortraitAnalysisDialog.vue    # Analysis config dialog (crowd name + tag selection)
    TaskProgressPanel.vue         # Task progress bar + history list
  components/NormalMode.vue       # Add "智能画像分析" to dropdown + wire dialog/panel

requirements.txt                  # +playwright +openpyxl +httpx
```

---

### Task 1: Project setup — dependencies and tag dictionary

**Files:**
- Create: `cdp_backend/rpa_agent/__init__.py`
- Create: `cdp_backend/rpa_agent/dmp_tags_dictionary.json`
- Modify: `requirements.txt`
- Modify: `cdp_backend/constants.py`

- [ ] **Step 1: Add dependencies to requirements.txt**

```bash
cd E:/CDP_Project_codex
echo "playwright>=1.48.0" >> requirements.txt
echo "openpyxl>=3.1.0" >> requirements.txt
echo "httpx>=0.27.0" >> requirements.txt
```

- [ ] **Step 2: Install Python dependencies and Playwright browser**

```bash
pip install playwright openpyxl httpx
playwright install chromium
```

Expected: Chromium browser downloaded to Playwright cache.

- [ ] **Step 3: Add RPA runtime constants to cdp_backend/constants.py**

Read the current constants file, then add:

```python
# In cdp_backend/constants.py, append:

RPA_TASKS_DIRNAME = "rpa_tasks"
RPA_RESULTS_DIRNAME = "rpa_results"
RPA_TAGS_FILENAME = "dmp_tags_dictionary.json"

DATABANK_URL = "https://databank.tmall.com/#/userDefinedAnalyses"
DMP_URL = "https://dmp.taobao.com"
```

- [ ] **Step 4: Create cdp_backend/rpa_agent/__init__.py**

```python
"""RPA Portrait Analysis Agent — automate databank → DMP portrait pipeline."""
```

- [ ] **Step 5: Copy dmp_tags_dictionary.json from DMP-Plugin repo**

Fetch the file using curl via proxy:

```bash
curl -s --proxy http://127.0.0.1:7897 \
  "https://raw.githubusercontent.com/aidenLi377/DMP-Plugin/main/dmp_tags_dictionary.json" \
  -o E:/CDP_Project_codex/cdp_backend/rpa_agent/dmp_tags_dictionary.json
```

Verify: `python3 -c "import json; d=json.load(open('E:/CDP_Project_codex/cdp_backend/rpa_agent/dmp_tags_dictionary.json')); print(f'{len(d)} tags loaded')"`
Expected: `57 tags loaded`

- [ ] **Step 6: Commit**

```bash
git add requirements.txt cdp_backend/constants.py cdp_backend/rpa_agent/
git commit -m "feat: add RPA agent project setup and tag dictionary"
```

---

### Task 2: Task store — persistent task state management

**Files:**
- Create: `cdp_backend/rpa_agent/task_store.py`
- Create: `cdp_backend/rpa_agent/test_task_store.py`

- [ ] **Step 1: Write failing tests for task_store**

Create `cdp_backend/rpa_agent/test_task_store.py`:

```python
import json
import os
import tempfile
import unittest
from pathlib import Path
from .task_store import TaskStore, TaskStatus


class TestTaskStore(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.store = TaskStore(Path(self.tmpdir) / "tasks")

    def tearDown(self):
        for root, dirs, files in os.walk(self.tmpdir, topdown=False):
            for name in files:
                os.unlink(os.path.join(root, name))
            for name in dirs:
                os.rmdir(os.path.join(root, name))
        os.rmdir(self.tmpdir)

    def test_create_task_returns_valid_id(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["160571", "114555"],
        )
        self.assertTrue(task["id"].startswith("rpa_"))
        self.assertEqual(task["crowdName"], "测试人群")
        self.assertEqual(task["status"], TaskStatus.PENDING)

    def test_get_task_returns_created_task(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["id"], task["id"])
        self.assertEqual(fetched["crowdName"], "测试人群")

    def test_update_progress_updates_task(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        self.store.update_progress(
            task["id"],
            status=TaskStatus.RUNNING,
            step="databank_search",
            detail="搜索人群: 测试人群",
            percent=10,
        )
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["status"], TaskStatus.RUNNING)
        self.assertEqual(fetched["progress"]["step"], "databank_search")
        self.assertEqual(fetched["progress"]["percent"], 10)

    def test_update_result_sets_completed(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        self.store.update_result(
            task["id"],
            excel_filename="rpa_test.xlsx",
            preview_rows=[{"a": 1}],
            total_rows=100,
        )
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["status"], TaskStatus.COMPLETED)
        self.assertEqual(fetched["result"]["excelFilename"], "rpa_test.xlsx")
        self.assertEqual(fetched["result"]["totalRows"], 100)

    def test_mark_failed_sets_error(self):
        task = self.store.create_task(
            crowd_name="测试人群",
            tag_ids=["114555"],
        )
        self.store.mark_failed(task["id"], "网络超时")
        fetched = self.store.get_task(task["id"])
        self.assertEqual(fetched["status"], TaskStatus.FAILED)
        self.assertEqual(fetched["error"], "网络超时")

    def test_list_tasks_returns_sorted_by_time(self):
        t1 = self.store.create_task(crowd_name="A", tag_ids=["1"])
        t2 = self.store.create_task(crowd_name="B", tag_ids=["2"])
        tasks = self.store.list_tasks()
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["id"], t2["id"])  # newest first

    def test_get_nonexistent_task_returns_none(self):
        self.assertIsNone(self.store.get_task("nonexistent"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/test_task_store.py -v
```

Expected: ImportError — `task_store` module not found.

- [ ] **Step 3: Implement TaskStore**

Create `cdp_backend/rpa_agent/task_store.py`:

```python
"""Persistent task state for RPA portrait analysis jobs."""

import json
import threading
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


class TaskStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


class TaskStore:
    """Thread-safe JSON file store for RPA task lifecycle."""

    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def _task_path(self, task_id: str) -> Path:
        return self.base_dir / f"{task_id}.json"

    def create_task(self, crowd_name: str, tag_ids: list[str]) -> dict:
        now = _utc_now()
        task = {
            "id": f"rpa_{uuid4().hex}",
            "crowdName": crowd_name,
            "tagIds": tag_ids,
            "status": TaskStatus.PENDING,
            "progress": None,
            "result": None,
            "error": None,
            "createdAt": now,
            "updatedAt": now,
        }
        with self._lock:
            self._task_path(task["id"]).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def get_task(self, task_id: str) -> dict | None:
        path = self._task_path(task_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def update_progress(self, task_id: str, *, status: str, step: str,
                        detail: str, percent: int) -> dict | None:
        task = self.get_task(task_id)
        if task is None:
            return None
        task["status"] = status
        task["progress"] = {"step": step, "detail": detail, "percent": percent}
        task["updatedAt"] = _utc_now()
        with self._lock:
            self._task_path(task_id).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def update_result(self, task_id: str, *, excel_filename: str,
                      preview_rows: list[dict], total_rows: int) -> dict | None:
        task = self.get_task(task_id)
        if task is None:
            return None
        now = _utc_now()
        task["status"] = TaskStatus.COMPLETED
        task["progress"] = {"step": "completed", "detail": "分析完成", "percent": 100}
        task["result"] = {
            "excelFilename": excel_filename,
            "previewRows": preview_rows,
            "totalRows": total_rows,
            "generatedAt": now,
        }
        task["updatedAt"] = now
        with self._lock:
            self._task_path(task_id).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def mark_failed(self, task_id: str, error: str) -> dict | None:
        task = self.get_task(task_id)
        if task is None:
            return None
        task["status"] = TaskStatus.FAILED
        task["error"] = error
        task["updatedAt"] = _utc_now()
        with self._lock:
            self._task_path(task_id).write_text(
                json.dumps(task, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return task

    def list_tasks(self, limit: int = 50) -> list[dict]:
        tasks = []
        for path in sorted(
            self.base_dir.glob("rpa_*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        ):
            try:
                tasks.append(json.loads(path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                continue
            if len(tasks) >= limit:
                break
        return tasks
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/test_task_store.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cdp_backend/rpa_agent/task_store.py cdp_backend/rpa_agent/test_task_store.py
git commit -m "feat: add RPA task store with CRUD and tests"
```

---

### Task 3: Excel builder — generate styled .xlsx from portrait data

**Files:**
- Create: `cdp_backend/rpa_agent/excel_builder.py`
- Create: `cdp_backend/rpa_agent/test_excel_builder.py`

- [ ] **Step 1: Write failing test for excel_builder**

Create `cdp_backend/rpa_agent/test_excel_builder.py`:

```python
import tempfile
import unittest
from pathlib import Path

from openpyxl import load_workbook


class TestExcelBuilder(unittest.TestCase):
    def setUp(self):
        from .excel_builder import ExcelBuilder
        self.builder = ExcelBuilder()
        self.sample_rows = [
            {
                "大类": "用户特征",
                "标签类型": "基础特征",
                "标签名称": "居住城市",
                "特征明细": "杭州",
                "人群占比": "12.50%",
                "Rebase": "12.50%",
                "点击TGI": 1.15,
                "转化TGI": 0.98,
            },
            {
                "大类": "用户特征",
                "标签类型": "基础特征",
                "标签名称": "用户年龄",
                "特征明细": "25-30",
                "人群占比": "18.20%",
                "Rebase": "18.20%",
                "点击TGI": 1.42,
                "转化TGI": 1.21,
            },
            {
                "大类": "品类特征",
                "标签类型": "策略人群",
                "标签名称": "大快消策略人群",
                "特征明细": "美妆达人",
                "人群占比": "25.00%",
                "Rebase": "25.00%",
                "点击TGI": 2.10,
                "转化TGI": 1.85,
            },
        ]

    def test_build_excel_creates_valid_xlsx(self):
        from .excel_builder import ExcelBuilder
        builder = ExcelBuilder()
        rows = self.sample_rows
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test.xlsx"
            builder.build(rows, str(path))
            self.assertTrue(path.exists())
            wb = load_workbook(str(path))
            ws = wb.active
            self.assertEqual(ws.title, "画像透视数据")
            # Header row
            self.assertEqual(ws.cell(1, 1).value, "所属大类")
            self.assertEqual(ws.cell(1, 5).value, "人群占比")
            # First data row
            self.assertEqual(ws.cell(2, 1).value, "用户特征")
            self.assertEqual(ws.cell(2, 3).value, "居住城市")
            self.assertEqual(ws.cell(2, 4).value, "杭州")

    def test_build_excel_header_frozen(self):
        from .excel_builder import ExcelBuilder
        builder = ExcelBuilder()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test_frozen.xlsx"
            builder.build(self.sample_rows, str(path))
            wb = load_workbook(str(path))
            ws = wb.active
            self.assertEqual(ws.freeze_panes, "A2")

    def test_build_empty_rows_raises_value_error(self):
        from .excel_builder import ExcelBuilder
        builder = ExcelBuilder()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "empty.xlsx"
            with self.assertRaises(ValueError):
                builder.build([], str(path))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/test_excel_builder.py -v
```

Expected: ImportError — module not found.

- [ ] **Step 3: Implement ExcelBuilder**

Create `cdp_backend/rpa_agent/excel_builder.py`:

```python
"""Generate styled .xlsx from DMP portrait data."""

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# DMP-Plugin color scheme mapped to main categories
CATEGORY_FILLS = {
    "用户特征": PatternFill(start_color="E6F4FF", end_color="E6F4FF", fill_type="solid"),
    "品类特征": PatternFill(start_color="FFF2E8", end_color="FFF2E8", fill_type="solid"),
    "渠道特征": PatternFill(start_color="F6FFED", end_color="F6FFED", fill_type="solid"),
    "私域特征": PatternFill(start_color="F9F0FF", end_color="F9F0FF", fill_type="solid"),
}

HEADER_FILL = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")
HEADER_FONT = Font(name="Microsoft YaHei", bold=True, size=11, color="333333")
DATA_FONT = Font(name="Microsoft YaHei", size=10, color="555555")
THIN_BORDER = Border(
    left=Side(style="thin", color="EAEAEA"),
    right=Side(style="thin", color="EAEAEA"),
    top=Side(style="thin", color="EAEAEA"),
    bottom=Side(style="thin", color="EAEAEA"),
)
HEADER_BORDER = Border(
    left=Side(style="thin", color="D9D9D9"),
    right=Side(style="thin", color="D9D9D9"),
    top=Side(style="thin", color="D9D9D9"),
    bottom=Side(style="thin", color="D9D9D9"),
)

COLUMNS = ["所属大类", "标签类型", "标签名称", "特征明细", "人群占比", "Rebase", "点击TGI", "转化TGI"]
COLUMN_WIDTHS = [14, 14, 20, 22, 12, 12, 10, 10]


class ExcelBuilder:
    def build(self, rows: list[dict], output_path: str) -> None:
        if not rows:
            raise ValueError("No data rows to export")

        wb = Workbook()
        ws = wb.active
        ws.title = "画像透视数据"

        # Header row
        for col_idx, (header, width) in enumerate(zip(COLUMNS, COLUMN_WIDTHS), 1):
            cell = ws.cell(1, col_idx, header)
            cell.font = HEADER_FONT
            cell.fill = HEADER_FILL
            cell.border = HEADER_BORDER
            cell.alignment = Alignment(horizontal="center", vertical="center")
            ws.column_dimensions[get_column_letter(col_idx)].width = width

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}1"

        # Data rows
        for row_idx, row_data in enumerate(rows, 2):
            cat_fill = CATEGORY_FILLS.get(row_data.get("大类", ""))
            for col_idx, key in enumerate(COLUMNS, 1):
                value = row_data.get(key, "")
                cell = ws.cell(row_idx, col_idx, value)
                cell.font = DATA_FONT
                cell.border = THIN_BORDER
                cell.alignment = Alignment(vertical="center")
                if col_idx == 1 and cat_fill:
                    cell.fill = cat_fill

        ws.row_dimensions[1].height = 28
        for row_idx in range(2, len(rows) + 2):
            ws.row_dimensions[row_idx].height = 22

        wb.save(output_path)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/test_excel_builder.py -v
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cdp_backend/rpa_agent/excel_builder.py cdp_backend/rpa_agent/test_excel_builder.py
git commit -m "feat: add Excel builder with DMP-Plugin color scheme"
```

---

### Task 4: DMP API client — intercept credentials + query portrait tags

**Files:**
- Create: `cdp_backend/rpa_agent/dmp_api.py`
- Create: `cdp_backend/rpa_agent/test_dmp_api.py`

- [ ] **Step 1: Write failing tests for dmp_api**

Create `cdp_backend/rpa_agent/test_dmp_api.py`:

```python
import json
import unittest
from pathlib import Path


class TestDmpApiClient(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tags_path = Path(__file__).parent / "dmp_tags_dictionary.json"
        cls.tags = json.loads(tags_path.read_text(encoding="utf-8"))

    def test_load_tags_returns_57_tags(self):
        self.assertEqual(len(self.tags), 57)

    def test_tags_have_required_fields(self):
        for tag in self.tags:
            self.assertIn("tagId", tag)
            self.assertIn("tagName", tag)
            self.assertIn("mainCategory", tag)
            self.assertIn("needCondition", tag)

    def test_filter_ready_tags_excludes_need_condition(self):
        from .dmp_api import filter_ready_tags
        ready = filter_ready_tags(self.tags)
        for tag in ready:
            self.assertFalse(tag["needCondition"])

    def test_group_tags_by_category(self):
        from .dmp_api import group_tags_by_category
        groups = group_tags_by_category(self.tags)
        self.assertIn("用户特征", groups)
        self.assertIn("品类特征", groups)
        self.assertIn("渠道特征", groups)
        self.assertIn("私域特征", groups)

    def test_normalize_rebase_single_choice_sums_below_100(self):
        from .dmp_api import normalize_rebase
        rows = [
            {"标签名称": "性别", "特征明细": "男", "人群占比": "35.00%"},
            {"标签名称": "性别", "特征明细": "女", "人群占比": "25.00%"},
            {"标签名称": "性别", "特征明细": "未知", "人群占比": "10.00%"},
        ]
        result = normalize_rebase(rows)
        # Sum of original = 70% < 100%, so rebase = (item/sum) * 100
        # 男: 35/70*100 = 50.00%
        self.assertEqual(result[0]["Rebase"], "50.00%")
        self.assertEqual(result[1]["Rebase"], "35.71%")
        self.assertEqual(result[2]["Rebase"], "14.29%")

    def test_normalize_rebase_sums_above_100_keeps_original(self):
        from .dmp_api import normalize_rebase
        rows = [
            {"标签名称": "城市", "特征明细": "北京", "人群占比": "60.00%"},
            {"标签名称": "城市", "特征明细": "上海", "人群占比": "55.00%"},
        ]
        result = normalize_rebase(rows)
        # Sum > 100%, keep original
        self.assertEqual(result[0]["Rebase"], "60.00%")
        self.assertEqual(result[1]["Rebase"], "55.00%")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/test_dmp_api.py -v
```

Expected: ImportError for `dmp_api` module.

- [ ] **Step 3: Implement dmp_api**

Create `cdp_backend/rpa_agent/dmp_api.py`:

```python
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
        url = url.replace(f"/tag/{url.split('/tag/')[-1].split('/')[0]}", f"/tag/{tag_id}") if "/tag/" in url else url
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/test_dmp_api.py -v
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cdp_backend/rpa_agent/dmp_api.py cdp_backend/rpa_agent/test_dmp_api.py
git commit -m "feat: add DMP API client with credential interception and normalization"
```

---

### Task 5: Databank bot — automates crowd push to DMP

**Files:**
- Create: `cdp_backend/rpa_agent/databank_bot.py`

- [ ] **Step 1: Implement DatabankBot**

Create `cdp_backend/rpa_agent/databank_bot.py`:

```python
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
        await asyncio.sleep(2)  # let Vue SPA render

    async def search_crowd(self, crowd_name: str) -> bool:
        """Search for a crowd by name in the list. Returns True if found."""
        # Locate search input — try common selectors
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
        """Find the table row containing the crowd by name."""
        # Try locating a row that contains the crowd name text
        try:
            row = await self.page.wait_for_selector(
                f'tr:has-text("{crowd_name}")',
                timeout=10000,
            )
            return row
        except PlaywrightTimeout:
            return None

    async def click_push_to_dmp(self, crowd_row) -> bool:
        """Click the '推送至达摩盘' action on a crowd row. Returns True if clicked."""
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
        # Fallback: click text anywhere in the row
        try:
            push_btn = await crowd_row.wait_for_selector(
                'text=推送', timeout=3000
            )
            if push_btn:
                await push_btn.click()
                return True
        except PlaywrightTimeout:
            pass
        return False

    async def wait_for_push_complete(self, timeout_sec: int = 120) -> bool:
        """Wait for the push status to show completion. Polls the page."""
        deadline = asyncio.get_event_loop().time() + timeout_sec
        while asyncio.get_event_loop().time() < deadline:
            # Check for success indicators
            success_texts = ["推送成功", "已完成", "同步完成"]
            for text in success_texts:
                try:
                    el = await self.page.wait_for_selector(
                        f'text="{text}"', timeout=1000
                    )
                    if el:
                        return True
                except PlaywrightTimeout:
                    pass

            # Check for the push status cell
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
```

- [ ] **Step 2: Commit**

```bash
git add cdp_backend/rpa_agent/databank_bot.py
git commit -m "feat: add DatabankBot for crowd search and push-to-DMP"
```

---

### Task 6: DMP bot — automates portrait analysis trigger on DMP

**Files:**
- Create: `cdp_backend/rpa_agent/dmp_bot.py`

- [ ] **Step 1: Implement DmpBot**

Create `cdp_backend/rpa_agent/dmp_bot.py`:

```python
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
        """Navigate to the crowd/audience list page on DMP."""
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
        """Search for the crowd by name."""
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
        """Click '画像透视' button on the current page (presumably on the crowd row)."""
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
        """Wait for the portrait analysis page to fully load."""
        deadline = asyncio.get_event_loop().time() + timeout_sec
        while asyncio.get_event_loop().time() < deadline:
            # The portrait page typically has tag selection checkboxes or a chart
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
```

- [ ] **Step 2: Commit**

```bash
git add cdp_backend/rpa_agent/dmp_bot.py
git commit -m "feat: add DmpBot for portrait analysis trigger"
```

---

### Task 7: Orchestrator — full pipeline with progress tracking

**Files:**
- Create: `cdp_backend/rpa_agent/orchestrator.py`

- [ ] **Step 1: Implement Orchestrator**

Create `cdp_backend/rpa_agent/orchestrator.py`:

```python
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
from .task_store import TaskStatus, TaskStore

logger = logging.getLogger(__name__)

USER_DATA_DIR = os.environ.get(
    "RPA_USER_DATA_DIR",
    str(Path.home() / ".cdp-rpa-chrome-profile"),
)


class RpaError(Exception):
    pass


class RpaOrchestrator:
    """Runs the full databank → DMP → Excel pipeline in a background thread."""

    def __init__(self, store: TaskStore, results_dir: Path):
        self.store = store
        self.results_dir = Path(results_dir)
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.tags = load_tags()
        self.ready_tags = filter_ready_tags(self.tags)

    def run(self, task_id: str, crowd_name: str, tag_ids: list[str]) -> None:
        """Entry point: launch the pipeline in the current thread (meant to be called
        from a dedicated daemon thread)."""
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

        self._progress(task_id, TaskStatus.RUNNING, "databank_search",
                       f"搜索人群: {crowd_name}", 5)

        async with async_playwright() as pw:
            browser = await pw.chromium.launch_persistent_context(
                USER_DATA_DIR,
                headless=False,
            )
            page = await browser.new_page()

            try:
                # --- Step 1: Databank search ---
                db_bot = DatabankBot(page)
                await db_bot.navigate_to_crowd_list()
                await db_bot.search_crowd(crowd_name)
                self._progress(task_id, TaskStatus.RUNNING, "databank_search",
                               f"已搜索到人群: {crowd_name}", 15)

                row = await db_bot.find_crowd_row(crowd_name)
                if row is None:
                    raise RpaError(f"未在人群列表中找到: {crowd_name}")

                # --- Step 2: Push to DMP ---
                self._progress(task_id, TaskStatus.RUNNING, "databank_push",
                               "正在推送至达摩盘...", 25)
                clicked = await db_bot.click_push_to_dmp(row)
                if not clicked:
                    raise RpaError("未找到推送按钮")
                self._progress(task_id, TaskStatus.RUNNING, "databank_push",
                               "等待推送完成...", 35)
                pushed = await db_bot.wait_for_push_complete()
                if not pushed:
                    raise RpaError("推送至达摩盘未完成（超时）")

                # --- Step 3: DMP portrait ---
                self._progress(task_id, TaskStatus.RUNNING, "dmp_locate",
                               f"打开达摩盘，搜索人群: {crowd_name}", 45)
                dmp = DmpBot(page)
                await dmp.navigate_to_dmp()
                await dmp.navigate_to_crowd_list()
                await dmp.search_crowd(crowd_name)
                self._progress(task_id, TaskStatus.RUNNING, "dmp_portrait",
                               "正在点击画像透视...", 55)
                clicked = await dmp.click_portrait_analysis()
                if not clicked:
                    raise RpaError("未找到画像透视按钮")
                ready = await dmp.wait_for_portrait_page_ready()
                if not ready:
                    raise RpaError("画像透视页面未加载完成")

                # --- Step 4: Intercept credentials + query ---
                dmp_api = DmpApiClient()
                # Register CDP network listener
                page.on("request", lambda req: dmp_api.intercept_request(req))

                # Trigger a tag query manually to capture the API request
                self._progress(task_id, TaskStatus.RUNNING, "dmp_query",
                               "等待画像API请求以获取凭证...", 60)
                # Click any tag checkbox to trigger an API call (page may already
                # have tags selected from DMP's default view)
                for _ in range(20):
                    await asyncio.sleep(1)
                    if dmp_api._intercepted:
                        break
                if not dmp_api._intercepted:
                    raise RpaError("未能拦截到DMP画像API请求，请检查页面网络请求")

                # --- Step 5: Query all tags ---
                total_tags = len(tag_ids)
                portrait_data: list[dict] = []
                tag_dict = {t["tagId"]: t for t in self.tags}

                for i, tag_id in enumerate(tag_ids[:total_tags]):
                    tag_info = tag_dict.get(tag_id)
                    pct = 65 + int((i + 1) / total_tags * 25)
                    self._progress(task_id, TaskStatus.RUNNING, "dmp_query",
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

                # --- Step 6: Generate Excel ---
                self._progress(task_id, TaskStatus.RUNNING, "build_excel",
                               f"生成 Excel ({len(portrait_data)} 行)...", 92)
                if not portrait_data:
                    raise RpaError("未获取到任何画像数据")
                excel_name = f"{task_id}.xlsx"
                excel_path = self.results_dir / excel_name
                builder = ExcelBuilder()
                builder.build(portrait_data, str(excel_path))

                # --- Step 7: Store result ---
                self._progress(task_id, TaskStatus.RUNNING, "upload_result",
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
```

- [ ] **Step 2: Commit**

```bash
git add cdp_backend/rpa_agent/orchestrator.py
git commit -m "feat: add RPA orchestrator — full pipeline"
```

---

### Task 8: Backend API routes — wire RPA into Flask

**Files:**
- Modify: `cdp_backend/app_factory.py`

- [ ] **Step 1: Add RPA routes to app_factory.py**

Read the current `cdp_backend/app_factory.py`, then insert the RPA imports into the existing import block and add 5 routes inside `register_routes`, before the error handlers.

New imports to add at top of the file:

```python
import threading
from pathlib import Path

from .rpa_agent.task_store import TaskStore
from .rpa_agent.orchestrator import RpaOrchestrator
from .rpa_agent.dmp_api import filter_ready_tags, group_tags_by_category, load_tags
```

New code to add inside `register_routes`, after the `move_folder` route and before the error handlers:

```python
    # ── RPA routes ────────────────────────────────────────────

    rpa_tasks_dir = os.path.join(BASE_DIR, RUNTIME_DIRNAME, RPA_TASKS_DIRNAME)
    rpa_results_dir = os.path.join(BASE_DIR, RUNTIME_DIRNAME, RPA_RESULTS_DIRNAME)
    rpa_store = TaskStore(Path(rpa_tasks_dir))
    rpa_orchestrator = RpaOrchestrator(rpa_store, Path(rpa_results_dir))

    @app.route("/api/rpa/tags")
    def list_rpa_tags():
        """Return all portrait tags, grouped by category, usable for the frontend."""
        all_tags = rpa_orchestrator.tags
        ready_tags = [t for t in all_tags if not t.get("needCondition", False)]
        return jsonify({
            "allTags": all_tags,
            "readyTags": ready_tags,
            "groups": group_tags_by_category(ready_tags),
        })

    @app.route("/api/rpa/execute", methods=["POST"])
    def execute_rpa_task():
        data = request.get_json(silent=True) or {}
        crowd_name = (data.get("crowdName") or "").strip()
        tag_ids = data.get("tagIds") or []

        if not crowd_name:
            return jsonify({"error": "crowdName is required"}), 400
        if not tag_ids or not isinstance(tag_ids, list):
            return jsonify({"error": "tagIds must be a non-empty array"}), 400

        task = rpa_store.create_task(crowd_name=crowd_name, tag_ids=tag_ids)
        thread = threading.Thread(
            target=rpa_orchestrator.run,
            args=(task["id"], crowd_name, tag_ids),
            daemon=True,
        )
        thread.start()

        return jsonify({"taskId": task["id"]}), 201

    @app.route("/api/rpa/tasks")
    def list_rpa_tasks():
        limit = request.args.get("limit", 50, type=int)
        tasks = rpa_store.list_tasks(limit=limit)
        # Return summary — no preview rows in list
        summaries = []
        for t in tasks:
            summary = {
                "taskId": t["id"],
                "crowdName": t["crowdName"],
                "status": t["status"],
                "progress": t.get("progress"),
                "error": t.get("error"),
                "createdAt": t["createdAt"],
                "updatedAt": t["updatedAt"],
            }
            if t.get("result"):
                summary["totalRows"] = t["result"].get("totalRows")
                summary["excelFilename"] = t["result"].get("excelFilename")
            summaries.append(summary)
        return jsonify({"tasks": summaries})

    @app.route("/api/rpa/tasks/<task_id>")
    def get_rpa_task(task_id: str):
        task = rpa_store.get_task(task_id)
        if task is None:
            return jsonify({"error": "task not found"}), 404
        return jsonify(task)

    @app.route("/api/rpa/tasks/<task_id>/result")
    def get_rpa_task_result(task_id: str):
        task = rpa_store.get_task(task_id)
        if task is None:
            return jsonify({"error": "task not found"}), 404
        if task["status"] != TaskStatus.COMPLETED or task.get("result") is None:
            return jsonify({"error": "task not yet completed"}), 404
        return jsonify({
            "taskId": task["id"],
            "excelUrl": f"/api/rpa/download/{task['result']['excelFilename']}",
            "previewRows": task["result"]["previewRows"],
            "totalRows": task["result"]["totalRows"],
            "generatedAt": task["result"]["generatedAt"],
        })

    @app.route("/api/rpa/download/<filename>")
    def download_rpa_result(filename: str):
        if "/" in filename or "\\" in filename:
            abort(404)
        file_path = os.path.join(rpa_results_dir, filename)
        if not os.path.isfile(file_path):
            return jsonify({"error": "file not found"}), 404
        return send_from_directory(rpa_results_dir, filename, as_attachment=True)
```

The `TaskStatus` import must also be added at the top:

```python
from .rpa_agent.task_store import TaskStatus, TaskStore
```

And the `RUNTIME_DIRNAME`, `RPA_TASKS_DIRNAME`, `RPA_RESULTS_DIRNAME` imports from constants:

In the existing import from `.constants`, add the new names:

```python
from .constants import BASE_DIR, RUNTIME_DIRNAME, RPA_TASKS_DIRNAME, RPA_RESULTS_DIRNAME, SOLUTIONS_FILENAME, FOLDERS_FILENAME
```

- [ ] **Step 2: Verify the app starts without import errors**

```bash
cd E:/CDP_Project_codex && python3 -c "from cdp_backend.app_factory import create_app; print('OK')"
```

Expected: `OK` (Flask app created without errors).

- [ ] **Step 3: Commit**

```bash
git add cdp_backend/app_factory.py cdp_backend/constants.py
git commit -m "feat: add 5 RPA API routes to Flask app"
```

---

### Task 9: Frontend — PortraitAnalysisDialog.vue

**Files:**
- Create: `cdp-web/src/components/PortraitAnalysisDialog.vue`

- [ ] **Step 1: Create the dialog component**

Create `cdp-web/src/components/PortraitAnalysisDialog.vue`:

```vue
<template>
  <el-dialog
    v-model="visible"
    title="智能画像分析"
    width="560px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-form label-position="top">
      <el-form-item label="人群名称">
        <el-input
          v-model="crowdName"
          placeholder="输入在数据引擎上已创建的人群名称"
        />
        <div class="form-hint">请先在数据引擎上创建好人群，再回到这里输入名称并开始分析。</div>
      </el-form-item>

      <el-form-item label="画像标签">
        <div class="tag-selector">
          <el-checkbox v-model="selectAll" @change="toggleSelectAll">全选</el-checkbox>
          <div v-for="(tags, category) in tagGroups" :key="category" class="tag-category">
            <el-checkbox
              v-model="categoryChecked[category]"
              @change="(val) => toggleCategory(category, val)"
            >
              {{ category }} ({{ tags.length }}个)
            </el-checkbox>
            <div class="tag-ids">
              <el-checkbox
                v-for="tag in tags"
                :key="tag.tagId"
                v-model="selectedTagIds"
                :label="tag.tagId"
                :value="tag.tagId"
                size="small"
              >
                {{ tag.tagName }}
              </el-checkbox>
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        开始分析
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const crowdName = ref('')
const selectedTagIds = ref([])
const selectAll = ref(false)
const tagGroups = reactive({})
const categoryChecked = reactive({})
const submitting = ref(false)

async function onOpen() {
  if (Object.keys(tagGroups).length > 0) return
  try {
    const resp = await fetch('/api/rpa/tags')
    const data = await resp.json()
    Object.assign(tagGroups, data.groups || {})
    // Default: select all tags
    selectedTagIds.value = (data.readyTags || []).map(t => t.tagId)
    selectAll.value = true
    for (const cat of Object.keys(tagGroups)) {
      categoryChecked[cat] = true
    }
  } catch {
    ElMessage.error('加载标签列表失败')
  }
}

function toggleSelectAll(val) {
  if (val) {
    const allIds = []
    for (const tags of Object.values(tagGroups)) {
      for (const t of tags) {
        allIds.push(t.tagId)
      }
    }
    selectedTagIds.value = allIds
    for (const cat of Object.keys(tagGroups)) {
      categoryChecked[cat] = true
    }
  } else {
    selectedTagIds.value = []
    for (const cat of Object.keys(tagGroups)) {
      categoryChecked[cat] = false
    }
  }
}

function toggleCategory(category, val) {
  const catTags = tagGroups[category] || []
  if (val) {
    for (const t of catTags) {
      if (!selectedTagIds.value.includes(t.tagId)) {
        selectedTagIds.value.push(t.tagId)
      }
    }
  } else {
    selectedTagIds.value = selectedTagIds.value.filter(
      id => !catTags.some(t => t.tagId === id),
    )
  }
}

async function submit() {
  if (!crowdName.value.trim()) {
    ElMessage.warning('请输入人群名称')
    return
  }
  if (selectedTagIds.value.length === 0) {
    ElMessage.warning('请至少选择一个画像标签')
    return
  }
  submitting.value = true
  try {
    const resp = await fetch('/api/rpa/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crowdName: crowdName.value.trim(),
        tagIds: [...selectedTagIds.value],
      }),
    })
    if (!resp.ok) {
      const err = await resp.json()
      throw new Error(err.error || '创建任务失败')
    }
    const result = await resp.json()
    emit('submit', result.taskId)
    visible.value = false
  } catch (err) {
    ElMessage.error(err.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

watch(visible, (val) => {
  if (!val) {
    crowdName.value = ''
  }
})
</script>

<style scoped>
.form-hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.tag-selector {
  max-height: 300px;
  overflow-y: auto;
  width: 100%;
}
.tag-category {
  margin: 6px 0;
  padding: 4px 0;
  border-bottom: 1px solid #f0f0f0;
}
.tag-ids {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 0 4px 20px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/PortraitAnalysisDialog.vue
git commit -m "feat: add PortraitAnalysisDialog component"
```

---

### Task 10: Frontend — TaskProgressPanel.vue

**Files:**
- Create: `cdp-web/src/components/TaskProgressPanel.vue`

- [ ] **Step 1: Create the task panel component**

Create `cdp-web/src/components/TaskProgressPanel.vue`:

```vue
<template>
  <div class="task-panel">
    <div class="task-panel-header">
      <span class="display-feature-title">RPA 任务</span>
      <el-button size="small" text @click="refresh">刷新</el-button>
    </div>

    <!-- Active task progress -->
    <div v-if="activeTask" class="task-card task-active">
      <div class="task-card-head">
        <span class="task-status" :class="activeTask.status">{{ statusText(activeTask.status) }}</span>
        <span class="display-body strong">{{ activeTask.crowdName }}</span>
      </div>
      <div v-if="activeTask.progress" class="task-progress">
        <el-progress
          :percentage="activeTask.progress.percent || 0"
          :stroke-width="6"
          :show-text="true"
        />
        <div class="task-detail">{{ activeTask.progress.detail }}</div>
      </div>
      <div v-if="activeTask.error" class="task-error">{{ activeTask.error }}</div>
      <div v-if="activeTask.status === 'completed'" class="task-actions">
        <el-button size="small" type="primary" @click="downloadResult(activeTask)">
          下载 Excel
        </el-button>
      </div>
    </div>

    <div v-else-if="tasks.length === 0" class="empty-state-sm display-body-light">
      暂无任务记录
    </div>

    <!-- History list -->
    <div v-if="tasks.length > 0" class="task-history">
      <div
        v-for="task in historyTasks"
        :key="task.taskId"
        class="task-card"
      >
        <div class="task-card-head">
          <span class="task-status" :class="task.status">{{ statusText(task.status) }}</span>
          <span class="display-body">{{ task.crowdName }}</span>
        </div>
        <div class="task-meta">
          <span>{{ formatTime(task.createdAt) }}</span>
          <span v-if="task.totalRows">{{ task.totalRows }} 行</span>
        </div>
        <div v-if="task.status === 'completed'" class="task-actions">
          <el-button size="small" text type="primary" @click="downloadResult(task)">
            下载
          </el-button>
        </div>
        <div v-if="task.error" class="task-error">{{ task.error }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const tasks = ref([])
let pollTimer = null

const activeTask = computed(() =>
  tasks.value.find(t => t.status === 'running' || t.status === 'pending') || null,
)

const historyTasks = computed(() =>
  tasks.value.filter(t => t.status !== 'running' && t.status !== 'pending'),
)

function statusText(status) {
  return { pending: '等待中', running: '执行中', completed: '已完成', failed: '失败' }[status] || status
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function refresh() {
  try {
    const resp = await fetch('/api/rpa/tasks')
    const data = await resp.json()
    tasks.value = data.tasks || []
  } catch {
    // silent
  }
}

function downloadResult(task) {
  const filename = task.excelFilename || `${task.taskId}.xlsx`
  const a = document.createElement('a')
  a.href = `/api/rpa/download/${filename}`
  a.download = filename
  a.click()
}

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, 5000)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
})
</script>

<style scoped>
.task-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}
.task-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}
.task-card {
  border: 1px solid #eaeaea;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}
.task-active {
  border-color: #ff8d6d;
  background: #fff6f4;
}
.task-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.task-status {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.task-status.pending { background: #f0f0f0; color: #666; }
.task-status.running { background: #fff2e8; color: #ff6b4a; }
.task-status.completed { background: #f6ffed; color: #52c41a; }
.task-status.failed { background: #fff1f0; color: #ff4d4f; }

.task-progress { margin-top: 8px; }
.task-detail { font-size: 12px; color: #666; margin-top: 4px; }
.task-error { color: #ff4d4f; font-size: 12px; margin-top: 4px; }
.task-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.task-actions { margin-top: 6px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/TaskProgressPanel.vue
git commit -m "feat: add TaskProgressPanel component"
```

---

### Task 11: Frontend — NormalMode.vue changes

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`

Changes:

- [ ] **Step 1: Add import statements**

In the `<script setup>` imports section, add:

```javascript
import PortraitAnalysisDialog from './PortraitAnalysisDialog.vue'
import TaskProgressPanel from './TaskProgressPanel.vue'
```

- [ ] **Step 2: Add reactive state**

Near the other `ref` declarations, add:

```javascript
const portraitDialogVisible = ref(false)
const activePortraitTaskId = ref(null)
const showTaskPanel = ref(false)
```

- [ ] **Step 3: Add "智能画像分析" to the dropdown menu**

In the template, inside `<el-dropdown-menu>`, after the existing `<el-dropdown-item command="auto">`:
Find:
```html
                <el-dropdown-item command="auto" :disabled="databankAutomating">
                  {{ databankAutomating ? '自动化执行中...' : '自动化圈人' }}
                </el-dropdown-item>
```
Insert after it:
```html
                <el-dropdown-item command="portrait" :disabled="false">
                  智能画像分析
                </el-dropdown-item>
```

- [ ] **Step 4: Handle the new command**

In `handleDataBankCommand`, add:

```javascript
  if (command === 'portrait') {
    portraitDialogVisible.value = true
    showTaskPanel.value = true
  }
```

- [ ] **Step 5: Handle the dialog submit**

Add a function:

```javascript
function onPortraitSubmit(taskId) {
  activePortraitTaskId.value = taskId
  showTaskPanel.value = true
  ElMessage.success('智能画像分析任务已启动')
}
```

- [ ] **Step 6: Add the dialog and panel components to the template**

In the template, add after the closing `</div>` of `json-area`:

```html
    <PortraitAnalysisDialog
      v-model="portraitDialogVisible"
      @submit="onPortraitSubmit"
    />

    <div v-if="showTaskPanel" class="task-panel-wrapper">
      <TaskProgressPanel />
    </div>
```

- [ ] **Step 7: Commit**

```bash
git add cdp-web/src/components/NormalMode.vue
git commit -m "feat: wire Smart Portrait Analysis into NormalMode"
```

---

### Task 12: Integration test — end-to-end smoke test

**Files:**
- Create: `cdp_backend/rpa_agent/test_integration.py`

- [ ] **Step 1: Write integration smoke test**

Create `cdp_backend/rpa_agent/test_integration.py`:

```python
"""Smoke test for RPA module imports and non-browser logic.

Full browser integration tests require a running Chrome and logged-in sessions
and are intended for manual QA, not CI.
"""

import json
import os
import tempfile
import unittest
from pathlib import Path


class TestRpaModuleImports(unittest.TestCase):
    def test_all_modules_importable(self):
        from cdp_backend.rpa_agent import task_store, excel_builder, dmp_api
        from cdp_backend.rpa_agent import databank_bot, dmp_bot, orchestrator
        self.assertIsNotNone(task_store)
        self.assertIsNotNone(excel_builder)
        self.assertIsNotNone(dmp_api)
        self.assertIsNotNone(databank_bot)
        self.assertIsNotNone(dmp_bot)
        self.assertIsNotNone(orchestrator)


class TestEndToEndNonBrowser(unittest.TestCase):
    """Test the non-browser parts of the pipeline end-to-end."""

    def test_full_pipeline_without_browser(self):
        from cdp_backend.rpa_agent.task_store import TaskStore
        from cdp_backend.rpa_agent.excel_builder import ExcelBuilder
        from cdp_backend.rpa_agent.dmp_api import load_tags, filter_ready_tags, normalize_rebase

        # 1. Load tags
        tags = load_tags()
        self.assertGreater(len(tags), 0)
        ready = filter_ready_tags(tags)
        self.assertLessEqual(len(ready), len(tags))

        # 2. Build sample portrait data
        sample = [
            {"大类": "用户特征", "标签类型": "基础特征", "标签名称": "居住城市",
             "特征明细": "杭州", "人群占比": "15.00%", "Rebase": "", "点击TGI": 1.2, "转化TGI": 1.0},
            {"大类": "用户特征", "标签类型": "基础特征", "标签名称": "居住城市",
             "特征明细": "上海", "人群占比": "12.00%", "Rebase": "", "点击TGI": 0.9, "转化TGI": 1.1},
        ]

        # 3. Normalize
        result = normalize_rebase(sample)
        self.assertEqual(len(result), 2)
        self.assertNotEqual(result[0]["Rebase"], "")
        self.assertNotEqual(result[1]["Rebase"], "")

        # 4. Build Excel
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test.xlsx"
            builder = ExcelBuilder()
            builder.build(result, str(path))
            self.assertTrue(path.exists())
            self.assertGreater(path.stat().st_size, 0)

        # 5. Task store CRUD
        with tempfile.TemporaryDirectory() as tmpdir:
            store = TaskStore(Path(tmpdir))
            task = store.create_task("测试人群", ["160571"])
            self.assertTrue(task["id"].startswith("rpa_"))
            self.assertEqual(store.get_task(task["id"])["crowdName"], "测试人群")
            store.update_result(task["id"],
                excel_filename="test.xlsx", preview_rows=result, total_rows=2)
            completed = store.get_task(task["id"])
            self.assertEqual(completed["status"], "completed")
            self.assertEqual(completed["result"]["totalRows"], 2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the integration test**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/test_integration.py -v
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add cdp_backend/rpa_agent/test_integration.py
git commit -m "test: add RPA module integration smoke test"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
cd E:/CDP_Project_codex && python3 -m pytest cdp_backend/rpa_agent/ -v
```

Expected: All unit and integration tests PASS.

- [ ] **Step 2: Verify backend starts**

```bash
cd E:/CDP_Project_codex && timeout 5 python3 app.py 2>&1 || true
```

Expected: Flask starts without import errors, API routes registered.

- [ ] **Step 3: Verify frontend builds**

```bash
cd E:/CDP_Project_codex/cdp-web && npx vite build 2>&1
```

Expected: Build succeeds without errors.

- [ ] **Step 4: Final commit (if any fixes from verification)**

```bash
git add -A
git diff --staged --stat
git commit -m "chore: final adjustments after verification" || echo "no changes"
```
