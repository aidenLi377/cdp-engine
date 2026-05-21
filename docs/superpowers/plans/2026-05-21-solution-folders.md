# 方案文件夹 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在方案中心和工作台添加可嵌套的树形文件夹，用户可将方案按层级分类管理。

**Architecture:** 新增 FolderStore 后端类管理文件夹数据的 CRUD 和树形组装，新增 6 个文件夹 API + 2 个方案 API 修改。前端新增 FolderTree.vue 递归树组件，改造 SolutionCenter 和 NormalMode 的左侧栏。

**Tech Stack:** Python Flask (后端), Vue 3 + Element Plus (前端)，JSON 文件持久化，无新增依赖。

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `cdp_backend/constants.py` | 修改 | 添加 FOLDERS_FILENAME 常量 |
| `cdp_backend/folder_store.py` | 新建 | FolderStore 类：CRUD + 树构建 + 移动 |
| `cdp_backend/app_factory.py` | 修改 | 注册文件夹 API 路由，修改方案路由支持 folderId |
| `cdp-web/src/composables/useFoldersApi.js` | 新建 | 文件夹 API 调用封装 |
| `cdp-web/src/components/FolderTree.vue` | 新建 | 递归文件夹树组件（展开/折叠/新建/重命名/删除/拖拽/右键） |
| `cdp-web/src/components/SolutionCenter.vue` | 修改 | 左侧栏加入 FolderTree、方案列表联动、拖拽/右键菜单 |
| `cdp-web/src/components/NormalMode.vue` | 修改 | "已发布方案"面板加入 FolderTree、筛选联动 |

---

### Task 1: 添加 FOLDERS_FILENAME 常量

**Files:**
- Modify: `cdp_backend/constants.py`

- [ ] **Step 1: 在 constants.py 中添加常量**

在 `SOLUTIONS_FILENAME` 定义下方添加：

```python
FOLDERS_FILENAME = "folders.json"
```

修改后的 constants.py 第 7 行附近：

```python
SOLUTIONS_FILENAME = "solutions.json"
FOLDERS_FILENAME = "folders.json"
```

- [ ] **Step 2: 验证**

```bash
cd /e/CDP_Project_codex && python -c "from cdp_backend.constants import FOLDERS_FILENAME; print(FOLDERS_FILENAME)"
```

Expected: 输出 `folders.json`

- [ ] **Step 3: Commit**

```bash
git add cdp_backend/constants.py
git commit -m "feat: add FOLDERS_FILENAME constant

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: FolderStore 后端类

**Files:**
- Create: `cdp_backend/folder_store.py`

- [ ] **Step 1: 创建 folder_store.py**

```python
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class FolderNotFoundError(Exception):
    pass


class FolderStore:
    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self._lock = threading.RLock()

    def _empty(self) -> dict:
        return {"folders": []}

    def _load(self) -> dict:
        if not self.file_path.exists():
            return self._empty()
        with self.file_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write(self, data: dict) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(
            "w", encoding="utf-8", dir=self.file_path.parent, delete=False, suffix=".tmp"
        ) as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            temp_path = Path(handle.name)
        temp_path.replace(self.file_path)

    def _new_id(self) -> str:
        return f"folder_{uuid4().hex}"

    def _find_folder(self, folders: list[dict], folder_id: str) -> tuple[int, dict]:
        for index, item in enumerate(folders):
            if item.get("id") == folder_id:
                return index, item
        raise FolderNotFoundError(folder_id)

    def _build_tree(self, folders: list[dict], parent_id: str | None = None) -> list[dict]:
        result = []
        for item in folders:
            if item.get("parentId") != parent_id:
                continue
            node = dict(item)
            children = self._build_tree(folders, node["id"])
            if children:
                node["children"] = children
            result.append(node)
        return result

    def list_folders(self) -> list[dict]:
        folders = list(self._load()["folders"])
        return self._build_tree(folders, None)

    def get_folder(self, folder_id: str) -> dict | None:
        folders = self._load()["folders"]
        for item in folders:
            if item.get("id") == folder_id:
                return item
        return None

    def create_folder(self, name: str, parent_id: str | None = None) -> dict:
        with self._lock:
            now = _utc_now()
            created = {
                "id": self._new_id(),
                "name": name,
                "parentId": parent_id,
                "createdAt": now,
                "updatedAt": now,
            }
            data = self._load()
            data["folders"].append(created)
            self._write(data)
            return created

    def update_folder(self, folder_id: str, name: str) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_folder(data["folders"], folder_id)
            updated = {**item, "name": name, "updatedAt": _utc_now()}
            data["folders"][index] = updated
            self._write(data)
            return updated

    def delete_folder(self, folder_id: str) -> None:
        with self._lock:
            data = self._load()
            self._find_folder(data["folders"], folder_id)
            ids_to_delete = self._collect_subtree_ids(data["folders"], folder_id)
            data["folders"] = [f for f in data["folders"] if f["id"] not in ids_to_delete]
            self._write(data)

    def _collect_subtree_ids(self, folders: list[dict], folder_id: str) -> set[str]:
        result = {folder_id}
        for item in folders:
            if item.get("parentId") == folder_id:
                result.update(self._collect_subtree_ids(folders, item["id"]))
        return result

    def move_folder(self, folder_id: str, parent_id: str | None) -> dict:
        with self._lock:
            data = self._load()
            index, item = self._find_folder(data["folders"], folder_id)
            if parent_id is not None:
                self._find_folder(data["folders"], parent_id)
            updated = {**item, "parentId": parent_id, "updatedAt": _utc_now()}
            data["folders"][index] = updated
            self._write(data)
            return updated
```

- [ ] **Step 2: 验证导入**

```bash
cd /e/CDP_Project_codex && python -c "from cdp_backend.folder_store import FolderStore; print('OK')"
```

Expected: 输出 `OK`

- [ ] **Step 3: Commit**

```bash
git add cdp_backend/folder_store.py
git commit -m "feat: add FolderStore class for folder CRUD and tree operations

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 文件夹 CRUD API 路由

**Files:**
- Modify: `cdp_backend/app_factory.py`

- [ ] **Step 1: 在 create_app 中初始化 FolderStore**

在 `create_app()` 函数中，`solution_store` 初始化之后添加 FolderStore 初始化，并将其传入 `register_routes`。

修改 `create_app()` 中的这几行：

```python
solutions_file = os.environ.get("SOLUTIONS_FILE", os.path.join(BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME))
solution_store = SolutionStore(solutions_file)
```

改为：

```python
solutions_file = os.environ.get("SOLUTIONS_FILE", os.path.join(BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME))
solution_store = SolutionStore(solutions_file)
folders_file = os.environ.get("FOLDERS_FILE", os.path.join(BASE_DIR, RUNTIME_DIRNAME, FOLDERS_FILENAME))
folder_store = FolderStore(folders_file)
```

并在文件顶部 import 中添加：

```python
from .folder_store import FolderNotFoundError, FolderStore
```

完整修改后的 import（第 13-14 行区域）：

```python
from .constants import BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME, FOLDERS_FILENAME
from .engine import ConfigEngine
from .folder_store import FolderNotFoundError, FolderStore
from .solution_store import InvalidSolutionStateError, SolutionNotFoundError, SolutionStore
from .validator import ConfigValidationError
```

同时更新 `register_routes` 的调用签名，添加 `folder_store` 参数：

```python
register_routes(app, engine, production, solution_store, folder_store)
```

- [ ] **Step 2: 更新 register_routes 签名并添加文件夹路由**

修改 `register_routes` 函数签名添加 `folder_store` 参数：

```python
def register_routes(
    app: Flask,
    engine: ConfigEngine,
    production: bool,
    solution_store: SolutionStore,
    folder_store: FolderStore,
) -> None:
```

在 `register_routes` 函数末尾（`delete_solution` 路由之后，函数返回之前）添加以下文件夹路由：

```python
    @app.route("/api/folders")
    def list_folders():
        return jsonify(folder_store.list_folders())

    @app.route("/api/folders", methods=["POST"])
    def create_folder():
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"error": "folder name is required"}), 400
        parent_id = payload.get("parentId")
        created = folder_store.create_folder(name, parent_id)
        return jsonify(created), 201

    @app.route("/api/folders/<folder_id>", methods=["PUT"])
    def update_folder(folder_id: str):
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"error": "folder name is required"}), 400
        try:
            updated = folder_store.update_folder(folder_id, name)
        except FolderNotFoundError:
            return jsonify({"error": "folder not found"}), 404
        return jsonify(updated)

    @app.route("/api/folders/<folder_id>", methods=["DELETE"])
    def delete_folder(folder_id: str):
        try:
            folder_store.delete_folder(folder_id)
        except FolderNotFoundError:
            return jsonify({"error": "folder not found"}), 404
        with solution_store._lock:
            data = solution_store._load()
            for item in data["solutions"]:
                if item.get("folderId") == folder_id:
                    item["folderId"] = None
            solution_store._write(data)
        return "", 204

    @app.route("/api/folders/<folder_id>/move", methods=["PUT"])
    def move_folder(folder_id: str):
        payload = request.get_json(silent=True) or {}
        parent_id = payload.get("parentId")
        try:
            updated = folder_store.move_folder(folder_id, parent_id)
        except FolderNotFoundError:
            return jsonify({"error": "folder not found"}), 404
        return jsonify(updated)
```

- [ ] **Step 3: 验证 API 可访问**

```bash
cd /e/CDP_Project_codex && python -c "
from cdp_backend.app_factory import create_app
app, engine = create_app()
print('App created OK')
"
```

Expected: 输出 `App created OK`（如果有依赖问题先忽略，重点确认 import 正确）

- [ ] **Step 4: Commit**

```bash
git add cdp_backend/app_factory.py
git commit -m "feat: add folder CRUD and move API routes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 方案 API 支持 folderId + 方案移动 API

**Files:**
- Modify: `cdp_backend/app_factory.py`

- [ ] **Step 1: 修改 create_solution_draft 支持 folderId**

找到 `create_solution_draft` 路由（约第 170 行）。当前实现：

```python
    @app.route("/api/solutions/drafts", methods=["POST"])
    def create_solution_draft():
        created = solution_store.create_draft(request.get_json(silent=True) or {})
        return jsonify(created), 201
```

因为 `create_draft` 使用 `_client_fields` 过滤，需要先在 `SolutionStore.CLIENT_EDITABLE_FIELDS` 中加入 `"folderId"`。修改 `cdp_backend/solution_store.py` 第 24 行：

```python
CLIENT_EDITABLE_FIELDS = ("name", "defaultCrowdName", "nodes", "workbenchFieldIds", "customFields", "folderId")
```

同时在 `app_factory.py` 中添加方案移动路由。在 `delete_solution` 路由之后添加。
因为方案移动不限制状态（草稿和已发布都可以），所以直接操作数据存储：

```python
    @app.route("/api/solutions/<solution_id>/move", methods=["PUT"])
    def move_solution(solution_id: str):
        payload = request.get_json(silent=True) or {}
        folder_id = payload.get("folderId")
        try:
            solution = solution_store.get_solution(solution_id)
            if solution is None:
                return jsonify({"error": "solution not found"}), 404
            updated = {**solution, "folderId": folder_id, "updatedAt": utc_now()}
            with solution_store._lock:
                data = solution_store._load()
                index, _item = solution_store._find_solution(data["solutions"], solution_id)
                data["solutions"][index] = updated
                solution_store._write(data)
        except SolutionNotFoundError:
            return jsonify({"error": "solution not found"}), 404
        return jsonify(updated)
```

需要在 `app_factory.py` 顶部导入 `utc_now`，在 `from .solution_store import ...` 行改为：

```python
from .solution_store import InvalidSolutionStateError, SolutionNotFoundError, SolutionStore, utc_now
```

- [ ] **Step 2: 修改 list_solutions 支持 folderId 筛选**

找到 `list_solutions` 路由（约第 156 行），修改为支持 `folderId` 查询参数：

```python
    @app.route("/api/solutions")
    def list_solutions():
        status = request.args.get("status")
        folder_id = request.args.get("folderId")
        if status in (None, "all"):
            solutions = solution_store.list_solutions()
        else:
            solutions = solution_store.list_solutions(status=status)
        if folder_id:
            solutions = [s for s in solutions if s.get("folderId") == folder_id]
        return jsonify(solutions)
```

- [ ] **Step 3: 验证**

```bash
cd /e/CDP_Project_codex && python -c "from cdp_backend.solution_store import SolutionStore; print(SolutionStore.CLIENT_EDITABLE_FIELDS)"
```

Expected: 输出包含 `folderId`

- [ ] **Step 4: Commit**

```bash
git add cdp_backend/app_factory.py cdp_backend/solution_store.py
git commit -m "feat: add folderId support to solution API and solution move endpoint

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 前端 useFoldersApi 可组合函数

**Files:**
- Create: `cdp-web/src/composables/useFoldersApi.js`

- [ ] **Step 1: 创建 useFoldersApi.js**

```javascript
function buildUrl(path, params) {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }
  return url.pathname + url.search
}

async function parseResponseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (response.status === 204) return null
  const data = await parseResponseBody(response)
  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.error) ||
      (typeof data === 'string' && data.trim()) ||
      `Request failed with status ${response.status}`
    throw new Error(message)
  }
  return data
}

export function useFoldersApi() {
  return {
    listFolders() {
      return request('/api/folders')
    },
    createFolder(name, parentId) {
      return request('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: parentId || null }),
      })
    },
    updateFolder(id, name) {
      return request(`/api/folders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      })
    },
    deleteFolder(id) {
      return request(`/api/folders/${id}`, { method: 'DELETE' })
    },
    moveFolder(id, parentId) {
      return request(`/api/folders/${id}/move`, {
        method: 'PUT',
        body: JSON.stringify({ parentId }),
      })
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/composables/useFoldersApi.js
git commit -m "feat: add useFoldersApi composable for folder API calls

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: FolderTree Vue 组件

**Files:**
- Create: `cdp-web/src/components/FolderTree.vue`

这个组件是递归树，支持展开/折叠、新建、重命名、删除、拖拽、右键菜单。包含"未分类"虚拟节点。

- [ ] **Step 1: 创建 FolderTree.vue**

```vue
<template>
  <div class="folder-tree">
    <div class="folder-tree-head">
      <span class="display-body-light" style="font-size:11px">方案文件夹</span>
      <el-button class="folder-tree-add" text size="small" @click.stop="startCreate(null)">
        + 新建
      </el-button>
    </div>

    <div
      v-for="folder in folderTree"
      :key="folder.id"
      class="folder-tree-node"
      :class="{ 'drag-over': dragOverFolderId === folder.id }"
      @dragover.prevent="onDragOverFolder($event, folder.id)"
      @dragleave="onDragLeaveFolder"
      @drop.prevent="onDropOnFolder($event, folder.id)"
    >
      <div
        class="folder-tree-row"
        :class="{ active: selectedFolderId === folder.id }"
        @click="selectFolder(folder.id)"
        @contextmenu.prevent="onContextMenu($event, folder)"
      >
        <span
          class="folder-expand-toggle"
          @click.stop="toggleExpand(folder.id)"
        >
          {{ expandedIds.has(folder.id) ? '▾' : '▸' }}
        </span>
        <span class="folder-icon">📂</span>
        <span class="folder-name">{{ folder.name }}</span>
        <span v-if="dragOverFolderId === folder.id" class="folder-drop-hint">释放到此处</span>
      </div>

      <div v-if="expandedIds.has(folder.id)" class="folder-children">
        <FolderTreeNode
          v-for="child in folder.children || []"
          :key="child.id"
          :folder="child"
          :depth="1"
          :expanded-ids="expandedIds"
          :selected-folder-id="selectedFolderId"
          :drag-over-folder-id="dragOverFolderId"
          :editing-folder-id="editingFolderId"
          :edit-name="editName"
          @toggle-expand="toggleExpand"
          @select-folder="selectFolder"
          @context-menu="onContextMenu"
          @drag-over-folder="onDragOverFolder"
          @drag-leave-folder="onDragLeaveFolder"
          @drop-on-folder="onDropOnFolder"
          @start-edit="startEdit"
          @cancel-edit="cancelEdit"
          @save-edit="saveEdit"
        />
      </div>
    </div>

    <div
      class="folder-tree-row uncategorized"
      :class="{ active: selectedFolderId === '__uncategorized__' }"
      @click="selectFolder('__uncategorized__')"
      @dragover.prevent="onDragOverFolder($event, '__uncategorized__')"
      @dragleave="onDragLeaveFolder"
      @drop.prevent="onDropOnFolder($event, '__uncategorized__')"
    >
      <span class="folder-icon" style="opacity:0.5">📂</span>
      <span class="folder-name" style="color:#999">未分类</span>
    </div>

    <div v-if="creatingParentId !== undefined" class="folder-create-row">
      <el-input
        v-model="createName"
        size="small"
        class="intercom-input"
        placeholder="文件夹名称"
        @keyup.enter="finishCreate"
        @keyup.esc="cancelCreate"
        ref="createInputRef"
      />
      <el-button size="small" text @click="finishCreate">确定</el-button>
      <el-button size="small" text @click="cancelCreate">取消</el-button>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="folder-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="context-menu-item" @click="contextRename">✏️ 重命名</div>
        <div class="context-menu-item" @click="contextNewChild">📂 新建子文件夹</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" @click="contextDelete">🗑 删除</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FolderTreeNode from './FolderTreeNode.vue'

const props = defineProps({
  folders: { type: Array, default: () => [] },
})

const emit = defineEmits(['select-folder', 'folders-changed'])

const expandedIds = ref(new Set())
const selectedFolderId = ref(null)
const creatingParentId = ref(undefined)
const createName = ref('')
const createInputRef = ref(null)
const editingFolderId = ref(null)
const editName = ref('')
const dragOverFolderId = ref(null)
const contextMenu = ref({ visible: false, x: 0, y: 0, folder: null })

const folderTree = computed(() => props.folders || [])

function toggleExpand(id) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedIds.value = next
}

function selectFolder(id) {
  selectedFolderId.value = id
  emit('select-folder', id)
}

function startCreate(parentId) {
  creatingParentId.value = parentId
  createName.value = ''
  nextTick(() => {
    createInputRef.value?.focus?.()
  })
}

function cancelCreate() {
  creatingParentId.value = undefined
  createName.value = ''
}

function finishCreate() {
  const name = createName.value.trim()
  if (!name) return
  contextMenu.value.visible = false
  cancelCreate()
  emit('folders-changed', { action: 'create', parentId: creatingParentId.value, name })
}

function startEdit(id, currentName) {
  editingFolderId.value = id
  editName.value = currentName
}

function cancelEdit() {
  editingFolderId.value = null
  editName.value = ''
}

function saveEdit(id) {
  const name = editName.value.trim()
  if (!name) return
  editingFolderId.value = null
  editName.value = ''
  contextMenu.value.visible = false
  emit('folders-changed', { action: 'rename', id, name })
}

function onDragOverFolder(event, folderId) {
  dragOverFolderId.value = folderId
}

function onDragLeaveFolder() {
  dragOverFolderId.value = null
}

function onDropOnFolder(event, folderId) {
  dragOverFolderId.value = null
  const srcFolderId = event.dataTransfer?.getData('text/folder-id')
  const srcSolutionId = event.dataTransfer?.getData('text/solution-id')

  if (srcFolderId && srcFolderId !== folderId) {
    emit('folders-changed', { action: 'move-folder', id: srcFolderId, targetParentId: folderId === '__uncategorized__' ? null : folderId })
  }
  if (srcSolutionId) {
    emit('folders-changed', { action: 'move-solution', solutionId: srcSolutionId, targetFolderId: folderId === '__uncategorized__' ? null : folderId })
  }
}

function onContextMenu(event, folder) {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    folder,
  }
  document.addEventListener('click', closeContextMenu, { once: true })
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function contextRename() {
  if (contextMenu.value.folder) {
    startEdit(contextMenu.value.folder.id, contextMenu.value.folder.name)
  }
}

function contextNewChild() {
  if (contextMenu.value.folder) {
    contextMenu.value.visible = false
    startCreate(contextMenu.value.folder.id)
  }
}

function contextDelete() {
  const folder = contextMenu.value.folder
  if (!folder) return
  contextMenu.value.visible = false

  ElMessageBox.confirm(
    `删除「${folder.name}」后其中的方案将归入"未分类"，子文件夹也会一并删除。是否继续？`,
    '删除文件夹',
    { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    emit('folders-changed', { action: 'delete', id: folder.id })
  }).catch(() => {})
}

function getFolderById(folders, id) {
  for (const f of folders) {
    if (f.id === id) return f
    if (f.children) {
      const found = getFolderById(f.children, id)
      if (found) return found
    }
  }
  return null
}

watch(() => props.folders, (newFolders) => {
  if (editingFolderId.value) {
    const folder = getFolderById(newFolders, editingFolderId.value)
    if (folder) {
      editName.value = folder.name
    }
  }
}, { deep: true })

defineExpose({ selectedFolderId, selectFolder })
</script>

<style scoped>
.folder-tree {
  padding: 8px 0;
  font-size: 12px;
  user-select: none;
}
.folder-tree-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px 6px;
}
.folder-tree-add.el-button {
  font-size: 11px !important;
  color: #ff6b4a !important;
  height: auto !important;
  padding: 0 !important;
}
.folder-tree-node {
  transition: background 0.15s;
}
.folder-tree-node.drag-over {
  background: rgba(255, 107, 74, 0.08);
  border-radius: 4px;
}
.folder-tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}
.folder-tree-row:hover {
  background: rgba(0, 0, 0, 0.04);
}
.folder-tree-row.active {
  background: rgba(255, 107, 74, 0.08);
  color: #ff6b4a;
}
.folder-tree-row.uncategorized {
  margin-top: 4px;
  border-top: 1px solid #eee;
  padding-top: 7px;
}
.folder-expand-toggle {
  width: 14px;
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
  text-align: center;
}
.folder-icon {
  flex-shrink: 0;
  font-size: 13px;
}
.folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-drop-hint {
  font-size: 10px;
  color: #ff6b4a;
  flex-shrink: 0;
}
.folder-children {
  margin-left: 14px;
}
.folder-create-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  margin-top: 4px;
}
.folder-create-row .el-input {
  flex: 1;
}
.folder-edit-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
}
.folder-context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e0dcd6;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px;
  min-width: 150px;
}
.context-menu-item {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}
.context-menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
}
.context-menu-item.danger {
  color: #d94e32;
}
.context-menu-item.danger:hover {
  background: rgba(217, 78, 50, 0.06);
}
.context-menu-divider {
  height: 1px;
  background: #eee;
  margin: 4px 0;
}
</style>
```

- [ ] **Step 2: 创建 FolderTreeNode.vue（递归子节点）**

```vue
<template>
  <div
    class="folder-tree-node"
    :class="{ 'drag-over': dragOverFolderId === folder.id }"
    @dragover.prevent="onDragOverFolder($event, folder.id)"
    @dragleave="$emit('drag-leave-folder')"
    @drop.prevent="onDropOnFolder($event, folder.id)"
  >
    <div
      class="folder-tree-row"
      :class="{ active: selectedFolderId === folder.id }"
      :style="{ paddingLeft: (8 + depth * 0) + 'px' }"
      draggable="true"
      @dragstart="onDragStart($event, folder)"
      @click="$emit('select-folder', folder.id)"
      @contextmenu.prevent="$emit('context-menu', $event, folder)"
    >
      <span
        class="folder-expand-toggle"
        v-if="(folder.children && folder.children.length > 0)"
        @click.stop="$emit('toggle-expand', folder.id)"
      >
        {{ expandedIds.has(folder.id) ? '▾' : '▸' }}
      </span>
      <span v-else class="folder-expand-toggle" style="visibility:hidden">▸</span>
      <span class="folder-icon">📂</span>

      <template v-if="editingFolderId === folder.id">
        <el-input
          v-model="localEditName"
          size="small"
          class="intercom-input"
          style="flex:1;min-width:0"
          @keyup.enter="$emit('save-edit', folder.id)"
          @keyup.esc="$emit('cancel-edit')"
          @click.stop
          ref="editInputRef"
        />
        <el-button size="small" text @click.stop="$emit('save-edit', folder.id)" style="font-size:11px">确定</el-button>
        <el-button size="small" text @click.stop="$emit('cancel-edit')" style="font-size:11px">取消</el-button>
      </template>
      <template v-else>
        <span class="folder-name">{{ folder.name }}</span>
      </template>

      <span v-if="dragOverFolderId === folder.id" class="folder-drop-hint">释放到此处</span>
    </div>

    <div v-if="expandedIds.has(folder.id) && (folder.children && folder.children.length > 0)" class="folder-children">
      <FolderTreeNode
        v-for="child in folder.children"
        :key="child.id"
        :folder="child"
        :depth="depth + 1"
        :expanded-ids="expandedIds"
        :selected-folder-id="selectedFolderId"
        :drag-over-folder-id="dragOverFolderId"
        :editing-folder-id="editingFolderId"
        :edit-name="editName"
        @toggle-expand="(id) => $emit('toggle-expand', id)"
        @select-folder="(id) => $emit('select-folder', id)"
        @context-menu="(ev, f) => $emit('context-menu', ev, f)"
        @drag-over-folder="(ev, id) => $emit('drag-over-folder', ev, id)"
        @drag-leave-folder="$emit('drag-leave-folder')"
        @drop-on-folder="(ev, id) => $emit('drop-on-folder', ev, id)"
        @start-edit="(id, name) => $emit('start-edit', id, name)"
        @cancel-edit="$emit('cancel-edit')"
        @save-edit="(id) => $emit('save-edit', id)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  folder: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  expandedIds: { type: Set, default: () => new Set() },
  selectedFolderId: { type: String, default: null },
  dragOverFolderId: { type: String, default: null },
  editingFolderId: { type: String, default: null },
  editName: { type: String, default: '' },
})

const emit = defineEmits([
  'toggle-expand', 'select-folder', 'context-menu',
  'drag-over-folder', 'drag-leave-folder', 'drop-on-folder',
  'start-edit', 'cancel-edit', 'save-edit',
])

const localEditName = ref(props.editName)
const editInputRef = ref(null)

watch(() => props.editName, (val) => { localEditName.value = val })
watch(() => props.editingFolderId, (val) => {
  if (val === props.folder.id) {
    localEditName.value = props.editName
  }
})

function onDragStart(event, folder) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/folder-id', folder.id)
}

function onDragOverFolder(event, folderId) {
  emit('drag-over-folder', event, folderId)
}

function onDropOnFolder(event, folderId) {
  emit('drop-on-folder', event, folderId)
}
</script>
```

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/components/FolderTree.vue cdp-web/src/components/FolderTreeNode.vue
git commit -m "feat: add FolderTree and FolderTreeNode recursive tree components

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: SolutionCenter 集成 FolderTree

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue`

改动点：
1. 导入 useFoldersApi 和 FolderTree
2. 在左侧栏加入 FolderTree，放在状态筛选上方
3. 方案列表根据选中文件夹筛选
4. 处理文件夹事件（新建/重命名/删除/移动文件夹/移动方案）
5. 方案列表项显示文件夹名
6. 新增草稿时默认使用当前选中文件夹
7. 方案列表项支持拖拽到文件夹

- [ ] **Step 1: 在 SolutionCenter.vue 中集成 FolderTree**

在 `<script setup>` 中新增导入：

```javascript
import { useFoldersApi } from '../composables/useFoldersApi'
import FolderTree from './FolderTree.vue'
```

新增响应式状态和 API 实例：

```javascript
const { listFolders, createFolder, updateFolder, deleteFolder, moveFolder } = useFoldersApi()
const folderTree = ref([])
const selectedFolderId = ref(null)
const loadingFolders = ref(false)
```

新增文件夹相关方法：

```javascript
async function loadFolders() {
  loadingFolders.value = true
  try {
    folderTree.value = await listFolders()
  } catch (error) {
    ElMessage.error(error.message || '文件夹列表加载失败')
  } finally {
    loadingFolders.value = false
  }
}

async function handleFolderChange(event) {
  try {
    if (event.action === 'create') {
      await createFolder(event.name, event.parentId)
      ElMessage.success('文件夹已创建')
    } else if (event.action === 'rename') {
      await updateFolder(event.id, event.name)
      ElMessage.success('文件夹已重命名')
    } else if (event.action === 'delete') {
      await deleteFolder(event.id)
      ElMessage.success('文件夹已删除')
    } else if (event.action === 'move-folder') {
      await moveFolder(event.id, event.targetParentId)
      ElMessage.success('文件夹已移动')
    } else if (event.action === 'move-solution') {
      await fetch(`/api/solutions/${event.solutionId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: event.targetFolderId }),
      })
      ElMessage.success('方案已移动')
    }
    await loadFolders()
    await loadSolutions()
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  }
}

function onFolderSelect(folderId) {
  selectedFolderId.value = folderId
  loadSolutions()
}
```

修改 `filteredSolutions` computed — 增加按文件夹筛选：

```javascript
const filteredSolutions = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  let list = solutions.value

  if (selectedFolderId.value) {
    if (selectedFolderId.value === '__uncategorized__') {
      list = list.filter(item => !item.folderId)
    } else {
      list = list.filter(item => item.folderId === selectedFolderId.value)
    }
  }

  if (!keyword) return list
  return list.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    return name.includes(keyword)
  })
})
```

修改 `loadSolutions` — 传递 folderId 筛选：

```javascript
async function loadSolutions() {
  loadingList.value = true
  try {
    const params = { status: statusFilter.value }
    if (selectedFolderId.value && selectedFolderId.value !== '__uncategorized__') {
      params.folderId = selectedFolderId.value
    }
    solutions.value = await listSolutions(statusFilter.value)
    // 客户端侧筛选未分类
    if (selectedFolderId.value === '__uncategorized__') {
      solutions.value = solutions.value.filter(item => !item.folderId)
    } else if (!selectedFolderId.value) {
      // 显示全部，不筛选
    }
  } catch (error) {
    ElMessage.error(error.message || '方案列表加载失败')
  } finally {
    loadingList.value = false
  }
}
```

修改 `createBlankDraft` — 新方案默认归入当前选中文件夹：

在 `createBlankDraft` 函数中，修改 `createDraft` 调用的 body，添加 `folderId`：

```javascript
const created = await createDraft({
  name: `未命名方案 ${new Date().toLocaleDateString('zh-CN')}`,
  defaultCrowdName: '未命名人群包',
  nodes: [],
  workbenchFieldIds: [],
  folderId: selectedFolderId.value === '__uncategorized__' ? null : (selectedFolderId.value || null),
})
```

修改 `onMounted` — 同时加载文件夹：

```javascript
onMounted(async () => {
  await Promise.all([loadSolutions(), loadAvailablePackages(), loadFolders()])
})
```

- [ ] **Step 2: 修改 Template — 在左侧栏加入 FolderTree**

在左侧栏 `.solution-sidebar` 中，将 FolderTree 插入在 `.solution-sidebar-head` 之后、`.solution-sidebar-controls` 之前：

```html
<aside class="solution-sidebar">
  <div class="solution-sidebar-head">
    <!-- 保持不变 -->
  </div>

  <FolderTree
    :folders="folderTree"
    @select-folder="onFolderSelect"
    @folders-changed="handleFolderChange"
  />

  <div class="solution-sidebar-controls">
    <!-- 保持不变 -->
  </div>
  <!-- 其余保持不变 -->
</aside>
```

同时在方案列表项中显示所属文件夹名。在每个方案列表项 meta 区域增加文件夹显示：

```html
<div class="solution-list-meta">
  <span>{{ item.nodes?.length || 0 }} 个节点</span>
  <span>{{ getFolderName(item.folderId) }}</span>
  <span>{{ formatTime(item.updatedAt) }}</span>
</div>
```

新增辅助方法：

```javascript
function getFolderName(folderId) {
  if (!folderId) return '未分类'
  const findIn = (list) => {
    for (const f of list) {
      if (f.id === folderId) return f.name
      if (f.children) {
        const found = findIn(f.children)
        if (found) return found
      }
    }
    return null
  }
  return findIn(folderTree.value) || '未知文件夹'
}
```

给方案列表项添加拖拽支持（在方案 div 上）：

```html
<div
  v-for="item in filteredSolutions"
  :key="item.id"
  role="button"
  tabindex="0"
  class="solution-list-item"
  :class="{ active: item.id === activeSolution?.id }"
  draggable="true"
  @dragstart="onSolutionDragStart($event, item)"
  @click="openSolution(item.id)"
  ...
>
```

添加拖拽处理方法：

```javascript
function onSolutionDragStart(event, item) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/solution-id', item.id)
}
```

- [ ] **Step 3: 验证编译**

```bash
cd /e/CDP_Project_codex/cdp-web && npx vite build --mode development 2>&1 | tail -5
```

Expected: 构建成功，无报错。

- [ ] **Step 4: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: integrate FolderTree into SolutionCenter with folder-aware filtering

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: NormalMode 工作台集成 FolderTree

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`

改动点：
1. 导入 useFoldersApi 和 FolderTree
2. 在"已发布方案"面板中，搜索框上方加入 FolderTree
3. 点击文件夹筛选已发布方案列表
4. 只显示含有已发布方案的文件夹

- [ ] **Step 1: 在 NormalMode.vue 中集成 FolderTree**

在 `<script setup>` 中新增导入：

```javascript
import { useFoldersApi } from '../composables/useFoldersApi'
import FolderTree from './FolderTree.vue'
```

新增状态：

```javascript
const { listFolders } = useFoldersApi()
const publishedFolderTree = ref([])
const selectedPublishedFolderId = ref(null)
```

新增方法：

```javascript
async function loadPublishedFolders() {
  try {
    const allFolders = await listFolders()
    const publishedIds = new Set(
      publishedSolutions.value.map(s => s.folderId).filter(Boolean)
    )
    publishedFolderTree.value = filterFoldersByPublished(allFolders, publishedIds)
  } catch {
    // silently ignore folder load failures in workbench
  }
}

function filterFoldersByPublished(folders, publishedIds) {
  return folders.reduce((acc, f) => {
    const childResults = f.children ? filterFoldersByPublished(f.children, publishedIds) : []
    const hasPublishedInTree = publishedIds.has(f.id) || childResults.length > 0
    if (hasPublishedInTree) {
      acc.push({ ...f, children: childResults.length > 0 ? childResults : (f.children || []) })
    }
    return acc
  }, [])
}

function onPublishedFolderSelect(folderId) {
  selectedPublishedFolderId.value = folderId
}

function getPublishedSolutionsInFolder() {
  if (!selectedPublishedFolderId.value) return publishedSolutions.value
  if (selectedPublishedFolderId.value === '__uncategorized__') {
    return publishedSolutions.value.filter(s => !s.folderId)
  }
  return publishedSolutions.value.filter(s => s.folderId === selectedPublishedFolderId.value)
}
```

修改 `loadPublishedSolutions` — 加载后也加载文件夹：

```javascript
async function loadPublishedSolutions() {
  loadingPublishedSolutions.value = true
  try {
    publishedSolutions.value = await listSolutions('published')
    await loadPublishedFolders()
  } catch (error) {
    ElMessage.error(error.message || '已发布方案列表加载失败')
  } finally {
    loadingPublishedSolutions.value = false
  }
}
```

更新 `filteredPublishedSolutions` computed 使用文件夹筛选：

```javascript
const filteredPublishedSolutions = computed(() => {
  const keyword = solutionSearch.value.trim().toLowerCase()
  const baseList = getPublishedSolutionsInFolder()

  if (!keyword) return baseList
  return baseList.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    const source = String(item?.source || '').toLowerCase()
    return name.includes(keyword) || source.includes(keyword)
  })
})
```

- [ ] **Step 2: 修改 Template**

在 `workbench-solution-section` 中，将 FolderTree 插入在标题区域之后、搜索框之前：

```html
<section v-if="leftPanelMode === 'solutions'" class="workbench-section workbench-solution-section">
  <div class="workbench-section-head">
    <!-- 保持不变 -->
  </div>

  <FolderTree
    :folders="publishedFolderTree"
    @select-folder="onPublishedFolderSelect"
  />

  <el-input
    v-model="solutionSearch"
    placeholder="搜索方案..."
    ...
  >
```

- [ ] **Step 3: 验证编译**

```bash
cd /e/CDP_Project_codex/cdp-web && npx vite build --mode development 2>&1 | tail -5
```

Expected: 构建成功，无报错。

- [ ] **Step 4: Commit**

```bash
git add cdp-web/src/components/NormalMode.vue
git commit -m "feat: integrate FolderTree into NormalMode published solutions panel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd /e/CDP_Project_codex && python app.py &
sleep 2
curl -s http://localhost:5000/api/health | head -1
```

Expected: 返回健康检查 JSON

- [ ] **Step 2: 测试文件夹 CRUD API**

```bash
# 创建文件夹
curl -s -X POST http://localhost:5000/api/folders -H 'Content-Type: application/json' -d '{"name":"测试文件夹"}' | python -m json.tool

# 列出文件夹
curl -s http://localhost:5000/api/folders | python -m json.tool

# 重命名（替换 :id 为上一步返回的 id）
curl -s -X PUT http://localhost:5000/api/folders/FOLDER_ID -H 'Content-Type: application/json' -d '{"name":"重命名后"}' | python -m json.tool

# 删除文件夹
curl -s -X DELETE http://localhost:5000/api/folders/FOLDER_ID -w "\nHTTP %{http_code}\n"
```

- [ ] **Step 3: 测试方案加 folderId**

```bash
# 创建带 folderId 的草稿
curl -s -X POST http://localhost:5000/api/solutions/drafts -H 'Content-Type: application/json' -d '{"name":"文件夹测试方案","nodes":[],"folderId":"some_folder_id"}' | python -m json.tool

# 移动方案（替换方案 id）
curl -s -X PUT http://localhost:5000/api/solutions/SOLUTION_ID/move -H 'Content-Type: application/json' -d '{"folderId":null}' | python -m json.tool
```

- [ ] **Step 4: Commit（如有修正）**

```bash
git add -A
git commit -m "chore: end-to-end verification fixes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Implementation Order

按 Task 序号顺序执行（1 → 9）。每个 Task 必须通过验证后才能进入下一个。
