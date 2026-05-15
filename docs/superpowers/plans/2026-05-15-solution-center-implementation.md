# Solution Center And Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-JSON-backed solution center, published/draft solution lifecycle, and workbench solution usage flow without introducing user accounts.

**Architecture:** Persist solutions in a backend `SolutionStore` under `.runtime/solutions.json`, expose CRUD/publish APIs from Flask, and layer a new `方案中心` frontend mode over the existing Vue app. Keep the current workbench for free-build, then add a separate “solution use” state that loads published solutions into a lightweight grouped form while reusing the current JSON-generation pipeline.

**Tech Stack:** Flask, Python `unittest`, Vue 3, Element Plus, Vite, Node built-in test runner

---

## File Structure

### Backend

- Create: `E:/CDP_Project_codex/cdp_backend/solution_store.py`
  - Owns solution JSON persistence, atomic writes, CRUD, publish, duplicate, edit-draft flows.
- Modify: `E:/CDP_Project_codex/cdp_backend/constants.py`
  - Add runtime data directory constants for solution storage.
- Modify: `E:/CDP_Project_codex/cdp_backend/app_factory.py`
  - Instantiate the solution store and register `/api/solutions/*` routes.
- Modify: `E:/CDP_Project_codex/.gitignore`
  - Ignore runtime solution JSON files.
- Create: `E:/CDP_Project_codex/test_solutions_api.py`
  - Covers draft create/update/publish, published listing, edit-draft overwrite, delete, duplicate.

### Frontend

- Create: `E:/CDP_Project_codex/cdp-web/src/composables/useSolutionsApi.js`
  - Thin fetch wrapper for all solution endpoints.
- Create: `E:/CDP_Project_codex/cdp-web/src/utils/solutionState.js`
  - Serializes workbench nodes, parses selected workbench field ids, builds grouped solution-use sections.
- Create: `E:/CDP_Project_codex/cdp-web/src/utils/solutionState.test.mjs`
  - Node tests for `solutionState.js`.
- Create: `E:/CDP_Project_codex/cdp-web/src/components/SolutionCenter.vue`
  - Three-column solution management UI.
- Create: `E:/CDP_Project_codex/cdp-web/src/components/SolutionPreviewDrawer.vue`
  - Preview drawer for workbench usage shape.
- Create: `E:/CDP_Project_codex/cdp-web/src/components/SolutionUseForm.vue`
  - Lightweight grouped form shown when a published solution is loaded in the workbench.
- Modify: `E:/CDP_Project_codex/cdp-web/src/App.vue`
  - Add the third top-level mode and mount `SolutionCenter`.
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/NormalMode.vue`
  - Add published solution list, “save as draft”, load/replace confirm flow, and solution-use state.
- Modify: `E:/CDP_Project_codex/cdp-web/src/styles/cdp-global.css`
  - Add layout and component styles for solution center and solution-use sections.

### Docs

- Modify: `E:/CDP_Project_codex/README_USER_GUIDE.md`
- Modify: `E:/CDP_Project_codex/README_使用说明.md`
  - Document the new top-level mode, draft/published lifecycle, and local JSON persistence.

## Shared Data Model

All backend/frontend tasks should converge on this persisted shape:

```json
{
  "id": "sol_20260515_ab12cd",
  "name": "资生堂乳液面霜竞品拉力",
  "status": "draft",
  "source": "manual",
  "basePublishedId": null,
  "defaultCrowdName": "资生堂乳液面霜竞品拉力",
  "nodes": [
    {
      "id": "node_1",
      "packageType": "类目公域行为",
      "operator": null,
      "formData": {
        "bhv": ["浏览"],
        "stdBrand": ["资生堂"]
      },
      "modeData": {
        "time": "recent"
      }
    }
  ],
  "workbenchFieldIds": ["node_1:stdBrand", "node_1:time"],
  "createdAt": "2026-05-15T11:00:00Z",
  "updatedAt": "2026-05-15T11:00:00Z",
  "publishedAt": null
}
```

Notes:

- `nodes` must exclude UI-only keys such as `schema`, `logicMatrix`, and `collapsed`.
- `workbenchFieldIds` stores selected display fields in `nodeId:fieldKey` form so the backend stays schema-agnostic.
- `basePublishedId` is only populated on edit-drafts created from a published solution.

## Task 1: Backend Solution Store Foundation

**Files:**
- Create: `E:/CDP_Project_codex/cdp_backend/solution_store.py`
- Modify: `E:/CDP_Project_codex/cdp_backend/constants.py`
- Modify: `E:/CDP_Project_codex/.gitignore`
- Test: `E:/CDP_Project_codex/test_solutions_api.py`

- [ ] **Step 1: Write the failing storage tests**

Add a store-focused test case first so the persistence contract exists before any Flask route is wired.

```python
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from cdp_backend.solution_store import SolutionStore


class SolutionStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.file_path = Path(self.temp_dir.name) / "solutions.json"
        self.store = SolutionStore(self.file_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_create_and_list_draft(self):
        created = self.store.create_draft(
            {
                "name": "测试方案",
                "source": "manual",
                "defaultCrowdName": "测试方案",
                "nodes": [{"id": "node_1", "packageType": "类目公域行为", "operator": None, "formData": {}, "modeData": {}}],
                "workbenchFieldIds": [],
            }
        )
        self.assertEqual(created["status"], "draft")
        self.assertTrue(self.file_path.exists())
        listed = self.store.list_solutions(status="draft")
        self.assertEqual([item["id"] for item in listed], [created["id"]])
```

- [ ] **Step 2: Run the storage test and confirm it fails**

Run:

```powershell
python -m unittest E:\CDP_Project_codex\test_solutions_api.py -v
```

Expected:

- FAIL with `ModuleNotFoundError: No module named 'cdp_backend.solution_store'`

- [ ] **Step 3: Implement runtime constants, `.gitignore`, and `SolutionStore`**

Add runtime constants in `constants.py`:

```python
RUNTIME_DIRNAME = ".runtime"
SOLUTIONS_FILENAME = "solutions.json"
```

Ignore the runtime directory in `.gitignore`:

```gitignore
.runtime/
```

Create `solution_store.py` with atomic read/write and draft CRUD:

```python
from __future__ import annotations

import copy
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class SolutionStore:
    def __init__(self, file_path: str | Path) -> None:
        self.file_path = Path(file_path)
        self.file_path.parent.mkdir(parents=True, exist_ok=True)

    def _empty(self) -> dict[str, Any]:
        return {"solutions": []}

    def _load(self) -> dict[str, Any]:
        if not self.file_path.exists():
            return self._empty()
        return json.loads(self.file_path.read_text(encoding="utf-8"))

    def _write(self, payload: dict[str, Any]) -> None:
        temp_path = self.file_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temp_path.replace(self.file_path)

    def _new_id(self) -> str:
        return f"sol_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(3)}"

    def list_solutions(self, status: str | None = None) -> list[dict[str, Any]]:
        items = self._load()["solutions"]
        if status and status != "all":
            items = [item for item in items if item["status"] == status]
        return sorted(items, key=lambda item: item["updatedAt"], reverse=True)

    def create_draft(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        solution = {
            "id": self._new_id(),
            "name": payload["name"],
            "status": "draft",
            "source": payload.get("source", "manual"),
            "basePublishedId": payload.get("basePublishedId"),
            "defaultCrowdName": payload.get("defaultCrowdName") or payload["name"],
            "nodes": copy.deepcopy(payload["nodes"]),
            "workbenchFieldIds": list(payload.get("workbenchFieldIds", [])),
            "createdAt": now,
            "updatedAt": now,
            "publishedAt": None,
        }
        data = self._load()
        data["solutions"].append(solution)
        self._write(data)
        return solution
```

- [ ] **Step 4: Re-run the storage test**

Run:

```powershell
python -m unittest E:\CDP_Project_codex\test_solutions_api.py -v
```

Expected:

- PASS for `test_create_and_list_draft`

- [ ] **Step 5: Commit the backend storage foundation**

```powershell
git add E:\CDP_Project_codex\cdp_backend\constants.py E:\CDP_Project_codex\cdp_backend\solution_store.py E:\CDP_Project_codex\.gitignore E:\CDP_Project_codex\test_solutions_api.py
git commit -m "feat: add local solution store foundation"
```

## Task 2: Backend Solution Lifecycle API

**Files:**
- Modify: `E:/CDP_Project_codex/cdp_backend/solution_store.py`
- Modify: `E:/CDP_Project_codex/cdp_backend/app_factory.py`
- Test: `E:/CDP_Project_codex/test_solutions_api.py`

- [ ] **Step 1: Write failing API lifecycle tests**

Add draft create/update/publish/edit-draft/delete coverage before registering routes.

```python
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

os.environ["FLASK_ENV"] = "development"


class SolutionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = TemporaryDirectory()
        os.environ["SOLUTIONS_FILE"] = str(Path(cls.temp_dir.name) / "solutions.json")
        from app import app  # import after env var is set
        cls.client = app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_solution_lifecycle(self):
        create_resp = self.client.post(
            "/api/solutions/drafts",
            json={
                "name": "测试方案",
                "source": "workbench",
                "defaultCrowdName": "测试方案",
                "nodes": [{"id": "node_1", "packageType": "类目公域行为", "operator": None, "formData": {}, "modeData": {}}],
                "workbenchFieldIds": ["node_1:stdBrand"],
            },
        )
        self.assertEqual(create_resp.status_code, 201)
        draft_id = create_resp.get_json()["id"]

        publish_resp = self.client.post(f"/api/solutions/{draft_id}/publish")
        self.assertEqual(publish_resp.status_code, 200)
        self.assertEqual(publish_resp.get_json()["status"], "published")

        listed = self.client.get("/api/solutions?status=published").get_json()
        self.assertEqual(len(listed), 1)
```

- [ ] **Step 2: Run the API test and confirm it fails**

Run:

```powershell
python -m unittest E:\CDP_Project_codex\test_solutions_api.py -v
```

Expected:

- FAIL with `404 != 201` on `/api/solutions/drafts`

- [ ] **Step 3: Implement store lifecycle methods and Flask routes**

Extend `SolutionStore` with:

```python
    def get_solution(self, solution_id: str) -> dict[str, Any]:
        for item in self._load()["solutions"]:
            if item["id"] == solution_id:
                return item
        raise KeyError(solution_id)

    def update_draft(self, solution_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._load()
        for item in data["solutions"]:
            if item["id"] == solution_id:
                if item["status"] != "draft":
                    raise ValueError("only drafts can be updated")
                item["name"] = payload["name"]
                item["defaultCrowdName"] = payload.get("defaultCrowdName") or payload["name"]
                item["nodes"] = copy.deepcopy(payload["nodes"])
                item["workbenchFieldIds"] = list(payload.get("workbenchFieldIds", []))
                item["updatedAt"] = utc_now()
                self._write(data)
                return item
        raise KeyError(solution_id)

    def publish(self, solution_id: str) -> dict[str, Any]:
        data = self._load()
        draft = next(item for item in data["solutions"] if item["id"] == solution_id)
        if draft["status"] != "draft":
            raise ValueError("only drafts can be published")
        now = utc_now()
        if draft.get("basePublishedId"):
            target = next(item for item in data["solutions"] if item["id"] == draft["basePublishedId"])
            target["name"] = draft["name"]
            target["defaultCrowdName"] = draft["defaultCrowdName"]
            target["nodes"] = copy.deepcopy(draft["nodes"])
            target["workbenchFieldIds"] = list(draft["workbenchFieldIds"])
            target["updatedAt"] = now
            target["publishedAt"] = now
            data["solutions"] = [item for item in data["solutions"] if item["id"] != draft["id"]]
            self._write(data)
            return target
        draft["status"] = "published"
        draft["publishedAt"] = now
        draft["updatedAt"] = now
        self._write(data)
        return draft
```

Wire the store in `app_factory.py`:

```python
from .constants import BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME
from .solution_store import SolutionStore

solutions_file = os.environ.get("SOLUTIONS_FILE", os.path.join(BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME))
solution_store = SolutionStore(solutions_file)
app.config["SOLUTION_STORE"] = solution_store
```

Register the routes:

```python
    @app.route("/api/solutions")
    def list_solutions():
        status = request.args.get("status", "all")
        return jsonify(solution_store.list_solutions(status=status))

    @app.route("/api/solutions/<solution_id>")
    def get_solution(solution_id: str):
        return jsonify(solution_store.get_solution(solution_id))

    @app.route("/api/solutions/drafts", methods=["POST"])
    def create_solution_draft():
        payload = request.get_json(silent=True) or {}
        return jsonify(solution_store.create_draft(payload)), 201

    @app.route("/api/solutions/<solution_id>", methods=["PUT"])
    def update_solution_draft(solution_id: str):
        payload = request.get_json(silent=True) or {}
        return jsonify(solution_store.update_draft(solution_id, payload))

    @app.route("/api/solutions/<solution_id>/publish", methods=["POST"])
    def publish_solution(solution_id: str):
        return jsonify(solution_store.publish(solution_id))
```

Also add:

- `POST /api/solutions/<solution_id>/edit-draft`
- `POST /api/solutions/<solution_id>/duplicate`
- `DELETE /api/solutions/<solution_id>`

Route semantics:

- `edit-draft` clones a published solution into a new draft with `source="published-edit"` and `basePublishedId=<published_id>`.
- `duplicate` always creates a draft copy.
- `delete` removes the targeted solution regardless of status.

- [ ] **Step 4: Run the backend API tests**

Run:

```powershell
python -m unittest E:\CDP_Project_codex\test_api.py E:\CDP_Project_codex\test_solutions_api.py -v
```

Expected:

- PASS for existing package/meta/generate tests
- PASS for new solution lifecycle tests

- [ ] **Step 5: Commit the API layer**

```powershell
git add E:\CDP_Project_codex\cdp_backend\app_factory.py E:\CDP_Project_codex\cdp_backend\solution_store.py E:\CDP_Project_codex\test_solutions_api.py
git commit -m "feat: add solution lifecycle api"
```

## Task 3: Frontend Solution State Helpers And API Client

**Files:**
- Create: `E:/CDP_Project_codex/cdp-web/src/utils/solutionState.js`
- Create: `E:/CDP_Project_codex/cdp-web/src/utils/solutionState.test.mjs`
- Create: `E:/CDP_Project_codex/cdp-web/src/composables/useSolutionsApi.js`

- [ ] **Step 1: Write the failing Node tests for solution serialization and grouped display**

Create `solutionState.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  serializeNodesForSolution,
  buildUsageSections,
  cleanWorkbenchFieldIds,
} from './solutionState.js'

test('serializeNodesForSolution strips runtime-only fields', () => {
  const nodes = [
    {
      id: 'node_1',
      packageType: '类目公域行为',
      operator: null,
      schema: [{ key: 'stdBrand', Label: '标准品牌' }],
      logicMatrix: {},
      collapsed: false,
      formData: { stdBrand: ['资生堂'] },
      modeData: { time: 'recent' },
    },
  ]
  assert.deepEqual(serializeNodesForSolution(nodes), [
    {
      id: 'node_1',
      packageType: '类目公域行为',
      operator: null,
      formData: { stdBrand: ['资生堂'] },
      modeData: { time: 'recent' },
    },
  ])
})

test('buildUsageSections keeps only selected fields and preserves node grouping', () => {
  const nodes = [
    {
      id: 'node_1',
      packageType: '类目公域行为',
      operator: null,
      schema: [
        { key: 'stdBrand', Label: '标准品牌' },
        { key: 'time', Label: '时间' },
      ],
      formData: { stdBrand: ['资生堂'], time: { days: 30 } },
      modeData: { time: 'recent' },
    },
  ]
  const sections = buildUsageSections(nodes, ['node_1:stdBrand'])
  assert.equal(sections.length, 1)
  assert.deepEqual(sections[0].fields.map((field) => field.key), ['stdBrand'])
})

test('cleanWorkbenchFieldIds removes selections for deleted nodes', () => {
  const cleaned = cleanWorkbenchFieldIds(
    ['node_1:stdBrand', 'node_2:time'],
    [{ id: 'node_1', schema: [{ key: 'stdBrand' }] }],
  )
  assert.deepEqual(cleaned, ['node_1:stdBrand'])
})
```

- [ ] **Step 2: Run the Node test and confirm it fails**

Run:

```powershell
node --test E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs
```

Expected:

- FAIL with `ERR_MODULE_NOT_FOUND` for `solutionState.js`

- [ ] **Step 3: Implement the pure helper module and API client**

Create `solutionState.js`:

```js
export function fieldToken(nodeId, fieldKey) {
  return `${nodeId}:${fieldKey}`
}

export function serializeNodesForSolution(nodeList) {
  return nodeList.map(({ id, packageType, operator = null, formData = {}, modeData = {} }) => ({
    id,
    packageType,
    operator,
    formData: structuredClone(formData),
    modeData: structuredClone(modeData),
  }))
}

export function cleanWorkbenchFieldIds(workbenchFieldIds, nodes) {
  const available = new Set()
  nodes.forEach((node) => {
    ;(node.schema || []).forEach((field) => {
      available.add(fieldToken(node.id, field.key))
    })
  })
  return workbenchFieldIds.filter((token) => available.has(token))
}

export function buildUsageSections(nodes, workbenchFieldIds) {
  const selected = new Set(workbenchFieldIds)
  return nodes
    .map((node, index) => {
      const fields = (node.schema || []).filter((field) => selected.has(fieldToken(node.id, field.key)))
      return { node, index, fields }
    })
    .filter((section) => section.fields.length > 0)
}
```

Create `useSolutionsApi.js`:

```js
async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`)
  }
  return payload
}

export function useSolutionsApi() {
  return {
    listSolutions: (status = 'all') => request(`/api/solutions?status=${encodeURIComponent(status)}`),
    getSolution: (id) => request(`/api/solutions/${id}`),
    createDraft: (body) => request('/api/solutions/drafts', { method: 'POST', body: JSON.stringify(body) }),
    updateDraft: (id, body) => request(`/api/solutions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    publishSolution: (id) => request(`/api/solutions/${id}/publish`, { method: 'POST' }),
    createEditDraft: (id) => request(`/api/solutions/${id}/edit-draft`, { method: 'POST' }),
    duplicateSolution: (id) => request(`/api/solutions/${id}/duplicate`, { method: 'POST' }),
    deleteSolution: (id) => request(`/api/solutions/${id}`, { method: 'DELETE' }),
  }
}
```

- [ ] **Step 4: Re-run the Node test**

Run:

```powershell
node --test E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs
```

Expected:

- PASS for all three helper tests

- [ ] **Step 5: Commit the shared frontend foundation**

```powershell
git add E:\CDP_Project_codex\cdp-web\src\utils\solutionState.js E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs E:\CDP_Project_codex\cdp-web\src\composables\useSolutionsApi.js
git commit -m "feat: add solution state helpers and api client"
```

## Task 4: Build The Solution Center UI

**Files:**
- Create: `E:/CDP_Project_codex/cdp-web/src/components/SolutionCenter.vue`
- Create: `E:/CDP_Project_codex/cdp-web/src/components/SolutionPreviewDrawer.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/App.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/styles/cdp-global.css`

- [ ] **Step 1: Add one more failing helper test for preview cleanup**

Extend `solutionState.test.mjs` with preview-oriented behavior the UI depends on:

```js
test('buildUsageSections returns no sections when no workbench fields are selected', () => {
  const sections = buildUsageSections(
    [
      {
        id: 'node_1',
        packageType: '类目公域行为',
        schema: [{ key: 'stdBrand', Label: '标准品牌' }],
        formData: { stdBrand: ['资生堂'] },
        modeData: {},
      },
    ],
    [],
  )
  assert.deepEqual(sections, [])
})
```

- [ ] **Step 2: Run the Node test and confirm the new case fails**

Run:

```powershell
node --test E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs
```

Expected:

- FAIL for the new empty-selection case if `buildUsageSections` still leaks empty sections

- [ ] **Step 3: Implement `SolutionCenter`, preview drawer, and top-level app mode**

Update `App.vue` to add the third mode:

```vue
<el-radio-button label="normal">可视化点选</el-radio-button>
<el-radio-button label="batch">矩阵装配</el-radio-button>
<el-radio-button label="solutions">方案中心</el-radio-button>

<NormalMode v-if="appMode === 'normal'" />
<BatchMode v-else-if="appMode === 'batch'" />
<SolutionCenter v-else />
```

Create `SolutionPreviewDrawer.vue`:

```vue
<template>
  <el-drawer :model-value="modelValue" title="预览工作台使用态" size="420px" @close="$emit('update:modelValue', false)">
    <div v-if="sections.length === 0" class="empty-state">
      <div class="display-body-light">当前方案未设置工作台展示参数，工作台将以只读方式载入。</div>
    </div>
    <div v-for="section in sections" :key="section.node.id" class="solution-preview-section">
      <div class="display-body strong">节点 {{ section.index + 1 }} · {{ section.node.packageType }}</div>
      <div class="solution-preview-tags">
        <span v-for="field in section.fields" :key="field.key" class="badge-mono">{{ field.Label }}</span>
      </div>
    </div>
  </el-drawer>
</template>
```

Create `SolutionCenter.vue` with the three-column shell:

```vue
<template>
  <div class="solution-center-page">
    <aside class="solution-sidebar">...</aside>
    <section class="solution-editor">...</section>
    <aside class="solution-settings">...</aside>
    <SolutionPreviewDrawer v-model="previewVisible" :sections="previewSections" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DynamicForm from './DynamicForm.vue'
import SolutionPreviewDrawer from './SolutionPreviewDrawer.vue'
import { useCdpShared } from '../composables/useCdpShared'
import { useSolutionsApi } from '../composables/useSolutionsApi'
import { buildUsageSections, cleanWorkbenchFieldIds, fieldToken, serializeNodesForSolution } from '../utils/solutionState.js'

const previewVisible = ref(false)
const selectedFieldIds = ref([])
const activeSolution = ref(null)
const nodeList = ref([])

watch(nodeList, () => {
  selectedFieldIds.value = cleanWorkbenchFieldIds(selectedFieldIds.value, nodeList.value)
}, { deep: true })

const previewSections = computed(() => buildUsageSections(nodeList.value, selectedFieldIds.value))
</script>
```

Add styles in `cdp-global.css`:

```css
.solution-center-page { display: grid; grid-template-columns: 280px 1fr 360px; height: 100vh; }
.solution-sidebar, .solution-settings { background: rgba(255,255,255,0.82); border-right: 1px solid rgba(0,0,0,0.06); }
.solution-editor { padding: 28px 36px; overflow: hidden; }
.solution-preview-section { padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
```

In this task, keep the center editor focused on drafts:

- open draft directly for editing
- open published as read-only summary until user clicks `生成编辑草稿`
- expose `保存草稿`, `发布正式方案`, `预览工作台使用态`

- [ ] **Step 4: Run type-check/build verification**

Run:

```powershell
npm --prefix E:\CDP_Project_codex\cdp-web run build
```

Expected:

- PASS with `vue-tsc` success and Vite build output

- [ ] **Step 5: Commit the solution center shell**

```powershell
git add E:\CDP_Project_codex\cdp-web\src\App.vue E:\CDP_Project_codex\cdp-web\src\components\SolutionCenter.vue E:\CDP_Project_codex\cdp-web\src\components\SolutionPreviewDrawer.vue E:\CDP_Project_codex\cdp-web\src\styles\cdp-global.css E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs
git commit -m "feat: add solution center frontend shell"
```

## Task 5: Integrate Published Solutions Into The Workbench

**Files:**
- Create: `E:/CDP_Project_codex/cdp-web/src/components/SolutionUseForm.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/NormalMode.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/styles/cdp-global.css`

- [ ] **Step 1: Add a failing helper test for workbench grouped usage**

Add a case for workbench rendering logic:

```js
test('cleanWorkbenchFieldIds removes invalid field keys after schema changes', () => {
  const cleaned = cleanWorkbenchFieldIds(
    ['node_1:stdBrand', 'node_1:time'],
    [{ id: 'node_1', schema: [{ key: 'stdBrand' }] }],
  )
  assert.deepEqual(cleaned, ['node_1:stdBrand'])
})
```

- [ ] **Step 2: Run the Node test and confirm the new case fails**

Run:

```powershell
node --test E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs
```

Expected:

- FAIL if `cleanWorkbenchFieldIds` does not filter by both node id and field key

- [ ] **Step 3: Implement workbench solution usage mode**

Create `SolutionUseForm.vue`:

```vue
<template>
  <div class="solution-use-shell">
    <div class="solution-use-header">
      <div>
        <div class="display-feature-title">{{ solutionName }}</div>
        <div class="display-body-light">工作台方案使用态</div>
      </div>
      <div class="solution-use-actions">
        <el-button class="intercom-btn-outlined btn-small" @click="$emit('reset-defaults')">恢复方案默认值</el-button>
        <el-button class="intercom-btn-outlined btn-small" @click="$emit('exit')">退出方案使用</el-button>
      </div>
    </div>

    <div class="mb-16">
      <div class="display-mono mb-8">本次人群包名称</div>
      <el-input :model-value="crowdName" @update:model-value="$emit('update:crowdName', $event)" class="intercom-input" />
    </div>

    <div v-if="sections.length === 0" class="empty-state">
      <div class="display-body-light">当前方案未设置工作台展示参数，可直接在右侧查看 JSON 结果。</div>
    </div>

    <div v-for="section in sections" :key="section.node.id" class="intercom-card solution-use-card">
      <div class="card-header-inner">
        <span class="display-body strong">节点 {{ section.index + 1 }} · {{ section.node.packageType }}</span>
      </div>
      <DynamicForm :node="{ ...section.node, schema: section.fields }" />
    </div>
  </div>
</template>
```

In `NormalMode.vue`, add:

```js
import SolutionUseForm from './SolutionUseForm.vue'
import { useSolutionsApi } from '../composables/useSolutionsApi'
import { buildUsageSections, serializeNodesForSolution } from '../utils/solutionState.js'

const solutionMode = ref('free')
const publishedSolutions = ref([])
const activeSolution = ref(null)
const solutionDefaultSnapshot = ref(null)

async function loadPublishedSolutions() {
  publishedSolutions.value = await listSolutions('published')
}

async function handleLoadSolution(solution) {
  if (nodeList.value.length > 0) {
    await ElMessageBox.confirm('当前工作台已有内容，载入方案会替换当前配置，是否继续？', '载入方案')
  }
  await hydrateSolutionIntoWorkbench(solution)
  solutionMode.value = 'solution'
  activeSolution.value = solution
  solutionDefaultSnapshot.value = JSON.parse(JSON.stringify({
    nodeList: nodeList.value,
    crowdNameInput: crowdNameInput.value,
  }))
}

async function saveAsSolutionDraft() {
  await createDraft({
    name: crowdNameInput.value || '未命名方案',
    source: 'workbench',
    defaultCrowdName: crowdNameInput.value || '未命名方案',
    nodes: serializeNodesForSolution(nodeList.value),
    workbenchFieldIds: [],
  })
  ElMessage.success('已保存到方案中心草稿')
}
```

Template changes:

- left panel gets a `正式方案` section above the component list
- center panel conditionally renders `SolutionUseForm` when `solutionMode === 'solution'`
- right panel keeps the existing summary/JSON area
- free-build keeps the current canvas flow unchanged

- [ ] **Step 4: Run full frontend build**

Run:

```powershell
npm --prefix E:\CDP_Project_codex\cdp-web run build
```

Expected:

- PASS with no Vue compile or type-check errors

- [ ] **Step 5: Commit the workbench integration**

```powershell
git add E:\CDP_Project_codex\cdp-web\src\components\SolutionUseForm.vue E:\CDP_Project_codex\cdp-web\src\components\NormalMode.vue E:\CDP_Project_codex\cdp-web\src\styles\cdp-global.css E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs
git commit -m "feat: add workbench solution usage flow"
```

## Task 6: Docs And End-To-End Verification

**Files:**
- Modify: `E:/CDP_Project_codex/README_USER_GUIDE.md`
- Modify: `E:/CDP_Project_codex/README_使用说明.md`

- [ ] **Step 1: Update the docs with the new product shape**

Add sections that explain:

- the third top-level mode `方案中心`
- draft vs published lifecycle
- local storage path `.runtime/solutions.json`
- how `存为方案草稿` works
- how `恢复方案默认值` works

Example addition:

```markdown
### 5.3 方案中心

- 草稿方案只在方案中心可见
- 正式方案发布后会出现在可视化点选工作台左侧
- 工作台中的“存为方案草稿”只负责沉淀结构，不会自动发布
```

- [ ] **Step 2: Run backend, helper, and frontend verification commands**

Run:

```powershell
python -m unittest E:\CDP_Project_codex\test_api.py E:\CDP_Project_codex\test_solutions_api.py -v
node --test E:\CDP_Project_codex\cdp-web\src\utils\solutionState.test.mjs
npm --prefix E:\CDP_Project_codex\cdp-web run build
```

Expected:

- all Python tests PASS
- all Node helper tests PASS
- frontend build PASS

- [ ] **Step 3: Perform a manual smoke test**

Run the app and verify these flows:

1. In workbench free-build mode, create nodes and click `存为方案草稿`
2. Open `方案中心`, confirm the draft appears
3. Select workbench display parameters and publish the draft
4. Return to workbench, confirm the published solution appears in the left list
5. Load the solution, edit grouped fields, confirm JSON updates
6. Click `恢复方案默认值`, confirm values and crowd name revert
7. Generate an edit draft from a published solution, change structure, publish again, confirm the workbench list still shows one published record with updated contents

- [ ] **Step 4: Commit docs and verification updates**

```powershell
git add E:\CDP_Project_codex\README_USER_GUIDE.md E:\CDP_Project_codex\README_使用说明.md
git commit -m "docs: document solution center workflow"
```

## Self-Review

### Spec Coverage

- `方案中心` 入口: covered by Task 4
- 草稿/正式方案生命周期: covered by Tasks 1 and 2
- 工作台 `存为方案草稿`: covered by Task 5
- 工作台只消费正式方案: covered by Tasks 2 and 5
- 工作台轻量方案使用态: covered by Task 5
- `恢复方案默认值`: covered by Task 5
- `工作台展示参数设置` 与节点结构联动: covered by Tasks 3 and 4
- `预览工作台使用态`: covered by Task 4
- README/使用说明更新: covered by Task 6

### Placeholder Scan

- No `TODO` / `TBD`
- All new files and modified files are named explicitly
- Verification commands are concrete
- Data model and route semantics are explicit

### Type Consistency

- Persisted field name is always `workbenchFieldIds`
- Published-overwrite reference is always `basePublishedId`
- Workbench serializer is always `serializeNodesForSolution`
- Grouped workbench display helper is always `buildUsageSections`

