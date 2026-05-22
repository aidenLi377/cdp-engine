# 方案中心 一对多自定义字段 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将方案中心从旧的 1:1 字段勾选机制重构为 1:N 自定义字段控制逻辑——用户创建自定义字段，一个自定义字段指向多个原始组件的同类型字段，使用端只展示自定义字段，编辑自定义字段时同步更新所有绑定的底层组件字段。

**Architecture:** 在后端 `solution_store.py` 的 `CLIENT_EDITABLE_FIELDS` 中新增 `customFields`，数据模型从数组勾选转为自定义字段对象列表。前端核心数据流：`solutionState.js` 中新编序列化/反序列化工具 → `useSolutionRuntime.js` 中新增自定义字段值同步逻辑 → `SolutionCenter.vue` 右侧栏改造为自定义字段创建/管理界面 → `SolutionUseForm.vue` 改为渲染自定义字段表单并控制原始组件值同步。

**Tech Stack:** Python Flask (后端), Vue 3 + Element Plus (前端), JSON 文件存储

---

## 文件变更总览

| 文件 | 操作 | 职责 |
|------|------|------|
| `cdp_backend/solution_store.py` | 修改 | 数据模型新增 `customFields` |
| `cdp-web/src/utils/solutionState.js` | 修改 | 新增 customField 相关工具函数 |
| `cdp-web/src/composables/useSolutionRuntime.js` | 修改 | 新增自定义字段值同步逻辑 |
| `cdp-web/src/composables/useSolutionsApi.js` | 不修改 | 无变更 |
| `cdp-web/src/composables/useCdpShared.js` | 不修改 | 无变更 |
| `cdp-web/src/components/SolutionCenter.vue` | 修改 | 右侧栏改造，替换旧的 checkbox 机制 |
| `cdp-web/src/components/SolutionUseForm.vue` | 重写 | 改为渲染自定义字段 + 高亮联动 |
| `cdp-web/src/components/SolutionPreviewDrawer.vue` | 修改 | 适配新 customFields 预览 |
| `cdp-web/src/components/DynamicForm.vue` | 不修改 | 保持现有渲染能力 |
| `cdp-web/src/components/NormalMode.vue` | 修改 | 工作台方案使用态适配自定义字段 |

---

### Task 1: 后端数据模型 —— 新增 customFields

**Files:**
- Modify: `cdp_backend/solution_store.py:25`

- [ ] **Step 1: 将 customFields 加入 CLIENT_EDITABLE_FIELDS**

```python
# Line 25, 修改前:
CLIENT_EDITABLE_FIELDS = ("name", "defaultCrowdName", "nodes", "workbenchFieldIds")

# 修改后:
CLIENT_EDITABLE_FIELDS = ("name", "defaultCrowdName", "nodes", "workbenchFieldIds", "customFields")
```

`workbenchFieldIds` 保留以兼容旧数据，但新逻辑不再使用它。

- [ ] **Step 2: 验证后端运行正常**

```bash
cd E:/CDP_Project_codex && python -c "from cdp_backend.solution_store import SolutionStore; print('OK')"
```

Expected: 输出 `OK`，无错误

- [ ] **Step 3: Commit**

```bash
git add cdp_backend/solution_store.py
git commit -m "feat: add customFields to solution store editable fields"
```

---

### Task 2: solutionState.js —— 新增自定义字段工具函数

**Files:**
- Modify: `cdp-web/src/utils/solutionState.js`

在现有函数后面追加以下新函数，保留所有现有函数不变（旧 workbenchFieldIds 相关函数仍保留以兼容旧数据）。

- [ ] **Step 1: 追加 customFields 序列化和使用区构建函数**

在文件末尾追加以下代码：

```js
// --- Custom Fields (1:N mapping) ---

/**
 * 从自定义字段列表构建使用端 sections。
 * 每个自定义字段变成一个 section，包含其绑定的原始组件信息用于高亮。
 * 
 * customField: { id, name, type, group, defaultValue, bindings: [{ nodeId, fieldKey }] }
 * node: 运行时节点对象(含 schema, formData, modeData 等)
 */
export function buildCustomFieldSections(customFields, nodes) {
  const fieldList = Array.isArray(customFields) ? customFields : []
  if (fieldList.length === 0) return []

  const nodeMap = new Map()
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    nodeMap.set(String(node?.id), node)
  })

  return fieldList.map((cf) => {
    const boundNodes = []
    ;(Array.isArray(cf.bindings) ? cf.bindings : []).forEach((binding) => {
      const node = nodeMap.get(String(binding.nodeId))
      if (!node) return
      const field = (Array.isArray(node.schema) ? node.schema : []).find(
        (f) => f.key === binding.fieldKey
      )
      if (!field) return
      boundNodes.push({
        nodeId: node.id,
        packageType: node.packageType,
        fieldKey: field.key,
        fieldLabel: field.Label || field.label || field.key,
      })
    })

    return {
      customFieldId: cf.id,
      name: cf.name,
      type: cf.type,
      group: cf.group || '',
      defaultValue: cf.defaultValue || {},
      bindings: boundNodes,
    }
  })
}

/**
 * 将自定义字段的编辑值同步到所有绑定节点的 formData/modeData 中。
 * 返回更新后的节点列表(直接 mutate 原对象，但返回引用以便追踪)。
 */
export function syncCustomFieldValue(nodes, customFieldId, customFields, newValue) {
  const cfs = Array.isArray(customFields) ? customFields : []
  const cf = cfs.find((c) => c.id === customFieldId)
  if (!cf) return nodes

  const nodeMap = new Map()
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    nodeMap.set(String(node?.id), node)
  })

  ;(Array.isArray(cf.bindings) ? cf.bindings : []).forEach((binding) => {
    const node = nodeMap.get(String(binding.nodeId))
    if (!node) return

    // 同步 formData
    if (!node.formData) node.formData = {}
    if (typeof newValue === 'object' && newValue !== null) {
      node.formData[binding.fieldKey] = { ...(node.formData[binding.fieldKey] || {}), ...newValue }
    } else {
      node.formData[binding.fieldKey] = newValue
    }

    // 如果有 modeData，也同步
    if (newValue && typeof newValue === 'object' && newValue.mode !== undefined) {
      if (!node.modeData) node.modeData = {}
      node.modeData[binding.fieldKey] = newValue.mode
    }
  })

  return nodes
}

/**
 * 检查节点中是否有被指定自定义字段绑定的字段。
 * 用于高亮判断。
 */
export function getNodeBindingFieldKeys(customFieldId, customFields) {
  const cfs = Array.isArray(customFields) ? customFields : []
  const cf = cfs.find((c) => c.id === customFieldId)
  if (!cf) return new Set()

  return new Set(
    (Array.isArray(cf.bindings) ? cf.bindings : []).map((b) => b.fieldKey)
  )
}
```

- [ ] **Step 2: 验证模块导入正常**

```bash
cd E:/CDP_Project_codex && node -e "import('./cdp-web/src/utils/solutionState.js').then(m => console.log(Object.keys(m)))"
```

Expected: 输出包含 `buildCustomFieldSections`, `syncCustomFieldValue`, `getNodeBindingFieldKeys` 等新函数名

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/utils/solutionState.js
git commit -m "feat: add custom field utility functions to solutionState"
```

---

### Task 3: useSolutionRuntime.js —— 新增自定义字段运行时逻辑

**Files:**
- Modify: `cdp-web/src/composables/useSolutionRuntime.js`

- [ ] **Step 1: 在 useSolutionRuntime 中新增三个方法**

在 `useSolutionRuntime` 函数的 return 对象中追加:

```js
// 在文件顶部 import 中新增:
import { buildCustomFieldSections, syncCustomFieldValue, getNodeBindingFieldKeys } from '../utils/solutionState.js'

// 在 useSolutionRuntime 函数体内新增:

function buildCustomFieldUsageSections(customFields, nodes) {
  return buildCustomFieldSections(customFields, nodes)
}

function applyCustomFieldValue(nodes, customFieldId, customFields, newValue) {
  return syncCustomFieldValue(nodes, customFieldId, customFields, newValue)
}

function getCustomFieldBoundFieldKeys(customFieldId, customFields) {
  return getNodeBindingFieldKeys(customFieldId, customFields)
}

// 在 return 对象中追加:
return {
  // ... 现有导出
  buildCustomFieldUsageSections,
  applyCustomFieldValue,
  getCustomFieldBoundFieldKeys,
}
```

完整修改位置：`useSolutionRuntime.js` 第 1 行 import 部分和第 133 行 return 对象部分。

- [ ] **Step 2: 验证模块导入**

```bash
cd E:/CDP_Project_codex && node -e "import('./cdp-web/src/composables/useSolutionRuntime.js').then(m => console.log('OK'))"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/composables/useSolutionRuntime.js
git commit -m "feat: add custom field runtime logic to useSolutionRuntime"
```

---

### Task 4: SolutionCenter.vue —— 右侧栏改造

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue`

这是最大的改动。需要：
1. 替换右侧栏的 "工作台字段" checkbox 区块为 "自定义字段" 管理区块
2. 新增自定义字段创建流程状态管理
3. 新增"创建字段 → 选择类型 → 绑定组件"的交互逻辑
4. 在中间编辑区支持 hover 高亮联动

**核心变更点：**

- [ ] **Step 1: 替换右侧栏模板（Lines 261-311）**

将现有的 `intercom-card solution-settings-card` (工作台字段 checkbox 区) 替换为新的自定义字段管理区。

替换 `SolutionCenter.vue` 第 261-311 行（`<div class="intercom-card solution-settings-card">` 到对应的 `</div>` 闭合之前的部分）：

```html
        <div class="intercom-card solution-settings-card">
          <div class="solution-settings-head">
            <div>
              <div class="display-feature-title">自定义字段（一对多）</div>
              <div class="display-body-light">创建字段，让一个字段控制多个组件</div>
            </div>
            <div class="solution-field-actions">
              <span class="display-mono">{{ customFields.length }} 个字段</span>
              <el-button
                class="solution-field-action"
                text
                :disabled="isPublished"
                @click="clearAllCustomFields"
              >
                清空
              </el-button>
            </div>
          </div>

          <div v-if="customFields.length === 0 && !creatingCustomField" class="empty-state-sm display-body-light">
            点击下方按钮创建第一个自定义字段
          </div>

          <div v-else class="custom-field-list">
            <div
              v-for="cf in customFields"
              :key="cf.id"
              class="custom-field-item"
              :class="{ active: highlightedCustomFieldId === cf.id }"
              @click="highlightCustomField(cf.id)"
              @mouseenter="highlightCustomField(cf.id)"
              @mouseleave="highlightCustomField(null)"
            >
              <div class="custom-field-item-head">
                <span class="display-body strong">{{ cf.name }}</span>
                <el-button
                  class="solution-field-action"
                  text
                  size="small"
                  :disabled="isPublished"
                  @click.stop="removeCustomField(cf.id)"
                >
                  ×
                </el-button>
              </div>
              <div class="display-body-light custom-field-meta">
                <span>{{ cf.type }}</span>
                <span>{{ (cf.bindings || []).length }} 个绑定</span>
                <span v-if="cf.group">分组: {{ cf.group }}</span>
              </div>
            </div>
          </div>

          <!-- 创建中的内联表单 -->
          <div v-if="creatingCustomField" class="creating-custom-field-panel">
            <div class="creating-steps">
              <span class="creating-step" :class="{ active: creatingCustomFieldStep === 1, done: creatingCustomFieldStep > 1 }">① 选择字段类型</span>
              <span class="creating-step" :class="{ active: creatingCustomFieldStep === 2 }">② 绑定组件</span>
            </div>

            <div v-if="creatingCustomFieldStep === 1" class="creating-step-body">
              <el-input
                v-model="creatingCustomFieldName"
                class="intercom-input"
                placeholder="输入自定义字段名称（如：今年、去年）"
                size="small"
              />
              <p class="display-body-light creating-hint">
                在左侧主区域点击一个原始字段来确定类型。非同类型字段会自动置灰。
                <template v-if="creatingCustomFieldType">
                  <br/>已选类型: <strong>{{ creatingCustomFieldType }}</strong>
                </template>
              </p>
              <el-button
                v-if="creatingCustomFieldType"
                class="intercom-btn-primary btn-small"
                @click="creatingCustomFieldStep = 2"
              >
                下一步: 绑定同类型字段 (已选 {{ creatingCustomFieldBindings.length }} 个)
              </el-button>
            </div>

            <div v-if="creatingCustomFieldStep === 2" class="creating-step-body">
              <p class="display-body-light creating-hint">
                在左侧主区域继续点击同类型字段以关联到「{{ creatingCustomFieldName }}」。已选 {{ creatingCustomFieldBindings.length }} 个绑定。
              </p>
              <div class="creating-step-actions">
                <el-button
                  class="intercom-btn-primary btn-small"
                  :disabled="creatingCustomFieldBindings.length === 0"
                  @click="finishCreateCustomField"
                >
                  完成创建
                </el-button>
                <el-button
                  class="intercom-btn-outlined btn-small"
                  @click="cancelCreateCustomField"
                >
                  取消
                </el-button>
              </div>
            </div>
          </div>

          <el-button
            v-if="!creatingCustomField"
            class="intercom-btn-primary btn-small"
            style="width:100%;margin-top:8px"
            :disabled="isPublished || nodeList.length === 0"
            @click="startCreateCustomField"
          >
            + 新增自定义字段（一对多）
          </el-button>
        </div>
```

- [ ] **Step 2: 新增 script 中的状态和方法**

在 `<script setup>` 中，替换 `workbenchFieldIds` 相关逻辑。

新增状态变量（在现有 ref 声明附近追加）：

```js
const customFields = ref([])
const highlightedCustomFieldId = ref(null)
const creatingCustomField = ref(false)
const creatingCustomFieldStep = ref(1)
const creatingCustomFieldName = ref('')
const creatingCustomFieldType = ref('')
const creatingCustomFieldBindings = ref([])
```

新增方法（在现有 methods 区域追加）：

```js
function loadCustomFields(record) {
  customFields.value = Array.isArray(record?.customFields) ? [...record.customFields] : []
}

function startCreateCustomField() {
  if (isPublished.value || nodeList.value.length === 0) return
  creatingCustomField.value = true
  creatingCustomFieldStep.value = 1
  creatingCustomFieldName.value = ''
  creatingCustomFieldType.value = ''
  creatingCustomFieldBindings.value = []
}

function cancelCreateCustomField() {
  creatingCustomField.value = false
  creatingCustomFieldStep.value = 1
  creatingCustomFieldName.value = ''
  creatingCustomFieldType.value = ''
  creatingCustomFieldBindings.value = []
}

function onFieldClickForBinding(nodeId, fieldKey) {
  if (!creatingCustomField.value) return

  // 找到对应的 node 和 field
  const node = nodeList.value.find(n => n.id === nodeId)
  if (!node) return
  const field = (Array.isArray(node.schema) ? node.schema : []).find(f => f.key === fieldKey)
  if (!field) return

  if (creatingCustomFieldStep.value === 1) {
    // 第一步：确立类型 + 自动绑定首个字段
    if (!creatingCustomFieldName.value.trim()) {
      creatingCustomFieldName.value = field.Label || field.label || fieldKey
    }
    creatingCustomFieldType.value = field.Widget_Type
    creatingCustomFieldBindings.value = [{ nodeId, fieldKey }]
    creatingCustomFieldStep.value = 2
  } else if (creatingCustomFieldStep.value === 2) {
    // 第二步：绑定/取消绑定同类型字段
    if (field.Widget_Type !== creatingCustomFieldType.value) return
    const existingIdx = creatingCustomFieldBindings.value.findIndex(
      b => b.nodeId === nodeId && b.fieldKey === fieldKey
    )
    if (existingIdx >= 0) {
      creatingCustomFieldBindings.value.splice(existingIdx, 1)
    } else {
      creatingCustomFieldBindings.value.push({ nodeId, fieldKey })
    }
  }
}

function finishCreateCustomField() {
  if (!creatingCustomFieldName.value.trim() || creatingCustomFieldBindings.value.length === 0) return

  customFields.value.push({
    id: `cf_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: creatingCustomFieldName.value.trim(),
    type: creatingCustomFieldType.value,
    group: '',
    defaultValue: {},
    bindings: [...creatingCustomFieldBindings.value],
  })

  cancelCreateCustomField()
  ElMessage.success(`自定义字段「${creatingCustomFieldName.value}」创建成功`)
}

function removeCustomField(cfId) {
  customFields.value = customFields.value.filter(cf => cf.id !== cfId)
  if (highlightedCustomFieldId.value === cfId) highlightedCustomFieldId.value = null
}

function clearAllCustomFields() {
  customFields.value = []
  highlightedCustomFieldId.value = null
}

function highlightCustomField(cfId) {
  highlightedCustomFieldId.value = cfId
}

// 判断节点中是否有字段被当前高亮的自定义字段绑定
function getNodeHighlightedFieldKeys(nodeId) {
  if (!highlightedCustomFieldId.value) return new Set()
  const cf = customFields.value.find(c => c.id === highlightedCustomFieldId.value)
  if (!cf) return new Set()
  return new Set(
    (cf.bindings || []).filter(b => b.nodeId === nodeId).map(b => b.fieldKey)
  )
}

function isFieldHighlighted(nodeId, fieldKey) {
  return getNodeHighlightedFieldKeys(nodeId).has(fieldKey)
}

function isNodeHighlighted(nodeId) {
  return getNodeHighlightedFieldKeys(nodeId).size > 0
}

// 判断字段在创建模式下是否可选（同类型/非同类型置灰）
function isFieldSelectableForBinding(field) {
  if (!creatingCustomField.value) return false
  if (creatingCustomFieldStep.value === 1) return true
  return field.Widget_Type === creatingCustomFieldType.value
}
```

- [ ] **Step 3: 更新 buildSolutionPayload**

在 `buildSolutionPayload()` 函数中新增 `customFields`:

```js
function buildSolutionPayload() {
  // ... 现有代码
  return {
    name,
    defaultCrowdName,
    nodes: serializeNodesForSolution(nodeList.value),
    workbenchFieldIds: [...workbenchFieldIds.value],
    customFields: cloneValue(customFields.value),  // 新增
  }
}
```

- [ ] **Step 4: 更新 applySolutionRecord**

在 `applySolutionRecord()` 函数中新增 customFields 加载:

```js
async function applySolutionRecord(record) {
  // ... 现有代码
  loadCustomFields(record)  // 新增
}
```

- [ ] **Step 5: 更新 setSavedSnapshotFromRecord**

在 `setSavedSnapshotFromRecord()` 的 JSON.stringify 中新增 customFields:

```js
lastSavedSnapshot.value = JSON.stringify({
  name,
  defaultCrowdName,
  nodes: record?.nodes || [],
  workbenchFieldIds: [...fieldIds],
  customFields: Array.isArray(record?.customFields) ? [...record.customFields] : [],  // 新增
})
```

- [ ] **Step 6: 更新 currentDraftSnapshot**

在 `currentDraftSnapshot` computed 的 JSON.stringify 中新增 customFields:

```js
return JSON.stringify({
  name,
  defaultCrowdName,
  nodes: serializeNodesForSolution(nodeList.value),
  workbenchFieldIds: [...workbenchFieldIds.value],
  customFields: cloneValue(customFields.value),  // 新增
})
```

- [ ] **Step 7: 修改 DynamicForm 调用，传递高亮和选择状态**

在中间编辑器区域 (Line 232 附近) 的 `<DynamicForm :node="node" />` 调用处，新增 props 传递。由于 DynamicForm 目前只接受 `node` prop，需要通过 provide/inject 或直接修改 DynamicForm 来支持高亮状态。

**方案：** 在 SolutionCenter 中使用 `provide` 向子组件 DynamicForm 传递高亮和选择状态。

在 `<script setup>` 中新增:

```js
import { provide } from 'vue'

provide('solutionCenterContext', {
  highlightedCustomFieldId,
  customFields,
  creatingCustomField,
  creatingCustomFieldType,
  creatingCustomFieldStep,
  onFieldClickForBinding,
  isFieldHighlighted,
  isNodeHighlighted,
  isFieldSelectableForBinding,
})
```

- [ ] **Step 8: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: replace workbench field checkboxes with custom field management in SolutionCenter"
```

---

### Task 5: DynamicForm.vue —— 支持高亮和选择模式

**Files:**
- Modify: `cdp-web/src/components/DynamicForm.vue`

- [ ] **Step 1: 注入 solutionCenterContext 并应用 CSS class**

在 `<script setup>` 中新增:

```js
import { inject } from 'vue'

const ctx = inject('solutionCenterContext', null)
```

在模板中每个 `el-form-item` 上增加动态 class。将现有的:

```html
<el-form-item v-show="isVisible(field, node)">
```

改为:

```html
<el-form-item
  v-show="isVisible(field, node)"
  :class="{
    'field-highlighted': ctx?.isFieldHighlighted?.(node.id, field.key),
    'field-dimmed': ctx?.creatingCustomField && ctx?.creatingCustomFieldStep === 2 && field.Widget_Type !== ctx?.creatingCustomFieldType,
    'field-selectable': ctx?.creatingCustomField && (ctx?.creatingCustomFieldStep === 1 || field.Widget_Type === ctx?.creatingCustomFieldType),
    'field-selected': ctx?.creatingCustomField && ctx?.creatingCustomFieldBindings?.some(b => b.nodeId === node.id && b.fieldKey === field.key)
  }"
  @click="ctx?.creatingCustomField && (ctx?.creatingCustomFieldStep === 1 || field.Widget_Type === ctx?.creatingCustomFieldType) ? ctx?.onFieldClickForBinding?.(node.id, field.key) : null"
>
```

并在模板的 `<el-form-item>` 中新增 `<div v-if="ctx?.creatingCustomField && ctx?.creatingCustomFieldBindings?.some(b => b.nodeId === node.id && b.fieldKey === field.key)" class="check-mark">✓</div>` 用于显示选中标记。

- [ ] **Step 2: 同样在 SolutionCenter 中需要给 node-card 增加高亮 class**

在 SolutionCenter.vue 的 `node-wrapper` div 上增加:

```html
<div
  v-for="(node, index) in nodeList"
  ...
  class="node-wrapper solution-node-wrapper"
  :class="{ 'node-highlighted': isNodeHighlighted(node.id) }"
>
```

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/components/DynamicForm.vue cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: add field highlighting and selection mode to DynamicForm and SolutionCenter"
```

---

### Task 6: SolutionUseForm.vue —— 重写为自定义字段表单

**Files:**
- Modify: `cdp-web/src/components/SolutionUseForm.vue`

- [ ] **Step 1: 重写模板，渲染自定义字段而非原始组件节**

完整替换 SolutionUseForm.vue 的内容：

```vue
<template>
  <div class="solution-use-shell">
    <div v-if="customFieldSections.length === 0" class="solution-use-empty">
      <div class="display-sub">当前方案暂无自定义字段</div>
      <div class="display-body-light">
        {{ solutionName || '当前方案' }} 尚未配置自定义字段，请在方案中心创建后再使用。
      </div>
    </div>

    <div v-else class="solution-use-scroll">
      <div
        v-for="section in customFieldSections"
        :key="section.customFieldId"
        class="intercom-card solution-use-card"
        :class="{ 'use-card-highlighted': highlightedCfId === section.customFieldId }"
        @click="$emit('highlightCf', section.customFieldId)"
        @mouseenter="$emit('highlightCf', section.customFieldId)"
        @mouseleave="$emit('highlightCf', null)"
      >
        <div class="solution-use-card-head">
          <div>
            <div class="display-feature-title">{{ section.name }}</div>
            <div class="display-body-light">{{ section.type }}</div>
          </div>
          <div class="solution-use-tags">
            <span v-for="binding in section.bindings" :key="binding.nodeId + binding.fieldKey" class="badge-mono">
              {{ binding.packageType }} · {{ binding.fieldLabel }}
            </span>
          </div>
        </div>

        <div class="solution-use-card-body">
          <el-form label-position="top" size="large">
            <el-form-item>
              <template #label>
                <span class="display-body strong">{{ section.name }}</span>
              </template>

              <!-- 日期型自定义字段 -->
              <template v-if="section.type.includes('日期')">
                <div class="range-block">
                  <el-radio-group v-model="cfValueModes[section.customFieldId]" size="small" class="intercom-radio-group" @change="onCfValueChange(section)">
                    <el-radio-button label="recent">过去 N 天</el-radio-button>
                    <el-radio-button label="range">固定日期</el-radio-button>
                  </el-radio-group>
                  <div v-if="cfValueModes[section.customFieldId] === 'recent'" class="range-inputs">
                    <el-input-number
                      v-model="cfValues[section.customFieldId].days"
                      :min="1" :max="366" size="small" controls-position="right"
                      class="intercom-input" style="width:120px"
                      @change="onCfValueChange(section)"
                    />
                    <span class="display-body">天</span>
                  </div>
                  <div v-if="cfValueModes[section.customFieldId] === 'range'" class="range-inputs">
                    <el-date-picker
                      v-model="cfValues[section.customFieldId].dateRange"
                      type="daterange" range-separator="至"
                      start-placeholder="开始日期" end-placeholder="结束日期"
                      format="YYYY-MM-DD" value-format="YYYYMMDD"
                      size="small" class="intercom-input" style="width:260px"
                      @change="onCfValueChange(section)"
                    />
                  </div>
                </div>
              </template>

              <!-- 数值型自定义字段 -->
              <template v-else-if="section.type.includes('数值')">
                <div class="range-block">
                  <el-radio-group v-model="cfValueModes[section.customFieldId]" size="small" class="intercom-radio-group" @change="onCfValueChange(section)">
                    <el-radio-button label="unlimited">不限</el-radio-button>
                    <el-radio-button label="min">≥ 最小值</el-radio-button>
                    <el-radio-button label="range">自定义区间</el-radio-button>
                  </el-radio-group>
                  <div class="range-inputs" v-if="cfValueModes[section.customFieldId] !== 'unlimited'">
                    <el-input-number
                      v-model="cfValues[section.customFieldId].min"
                      :min="0" :controls="false" placeholder="最小值"
                      size="small" class="intercom-input" style="width:140px"
                      @change="onCfValueChange(section)"
                    />
                    <span v-if="cfValueModes[section.customFieldId] === 'range'" class="display-body range-sep">—</span>
                    <el-input-number
                      v-if="cfValueModes[section.customFieldId] === 'range'"
                      v-model="cfValues[section.customFieldId].max"
                      :min="0" :controls="false" placeholder="最大值"
                      size="small" class="intercom-input" style="width:140px"
                      @change="onCfValueChange(section)"
                    />
                  </div>
                </div>
              </template>

              <!-- 其他类型 fallback -->
              <template v-else>
                <el-input v-model="cfValues[section.customFieldId]" class="intercom-input" @input="onCfValueChange(section)" />
              </template>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch, onMounted } from 'vue'

const props = defineProps({
  customFieldSections: { type: Array, default: () => [] },
  solutionName: { type: String, default: '' },
  highlightedCfId: { type: String, default: null },
})

const emit = defineEmits(['highlightCf', 'cfValueChange'])

const cfValues = reactive({})
const cfValueModes = reactive({})

function initCfValues() {
  props.customFieldSections.forEach((section) => {
    if (section.type.includes('日期')) {
      cfValues[section.customFieldId] = {
        days: section.defaultValue?.days || 30,
        dateRange: section.defaultValue?.dateRange || [],
      }
      cfValueModes[section.customFieldId] = section.defaultValue?.mode || 'recent'
    } else if (section.type.includes('数值')) {
      cfValues[section.customFieldId] = {
        min: section.defaultValue?.min ?? null,
        max: section.defaultValue?.max ?? null,
      }
      cfValueModes[section.customFieldId] = section.defaultValue?.mode || 'unlimited'
    } else {
      cfValues[section.customFieldId] = section.defaultValue ?? ''
    }
  })
}

function onCfValueChange(section) {
  const value = cfValues[section.customFieldId]
  const mode = cfValueModes[section.customFieldId]
  emit('cfValueChange', {
    customFieldId: section.customFieldId,
    value: section.type.includes('日期') ? { ...value, mode } :
           section.type.includes('数值') ? { ...value, mode } :
           value,
  })
}

onMounted(() => { initCfValues() })
watch(() => props.customFieldSections, initCfValues, { deep: true })
</script>
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/SolutionUseForm.vue
git commit -m "feat: rewrite SolutionUseForm to render custom fields with sync logic"
```

---

### Task 7: NormalMode.vue —— 适配自定义字段使用态

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`

- [ ] **Step 1: 更新 usageSections 计算和 SolutionUseForm 调用**

在 `<script setup>` 中，将 `usageSections` computed 替换为 custom field sections：

```js
// 在 import 中新增:
import { buildCustomFieldSections } from '../utils/solutionState.js'

// 替换 usageSections computed:
const customFieldSections = computed(() =>
  buildCustomFieldSections(
    currentSolution.value?.customFields || [],
    nodeList.value,
  ),
)
```

在模板中将 `<SolutionUseForm>` 调用改为传递新的 props：

```html
<SolutionUseForm
  v-else
  :custom-field-sections="customFieldSections"
  :solution-name="currentSolution?.name || ''"
  :highlighted-cf-id="highlightedCfId"
  @highlight-cf="onHighlightCf"
  @cf-value-change="onCfValueChange"
/>
```

新增高亮状态和方法：

```js
const highlightedCfId = ref(null)

function onHighlightCf(cfId) {
  highlightedCfId.value = cfId
}

function onCfValueChange({ customFieldId, value }) {
  syncCustomFieldValue(
    nodeList.value,
    customFieldId,
    currentSolution.value?.customFields || [],
    value,
  )
}
```

- [ ] **Step 2: 在中间区增加节点高亮**

在 node 渲染区域 (自由搭建模式下的 `node-wrapper`) 增加高亮逻辑：

需要注入 provided context 让 DynamicForm 中的字段也能高亮。在 `NormalMode.vue` 中 provide 高亮信息给 DynamicForm。

```js
import { provide } from 'vue'

provide('solutionCenterContext', {
  highlightedCustomFieldId: highlightedCfId,
  customFields: computed(() => currentSolution.value?.customFields || []),
  creatingCustomField: ref(false),
  creatingCustomFieldType: ref(''),
  creatingCustomFieldStep: ref(2),
  onFieldClickForBinding: () => {},
  isFieldHighlighted: (nodeId, fieldKey) => {
    if (!highlightedCfId.value) return false
    const cfs = currentSolution.value?.customFields || []
    const cf = cfs.find(c => c.id === highlightedCfId.value)
    if (!cf) return false
    return (cf.bindings || []).some(b => b.nodeId === nodeId && b.fieldKey === fieldKey)
  },
  isNodeHighlighted: () => false,
  isFieldSelectableForBinding: () => false,
})
```

- [ ] **Step 3: 在右侧栏 JSON/摘要区增加自定义字段信息**

不需要改变——右侧 JSON 生成逻辑不变，因为底层 node 的 formData 已经被同步更新了。

- [ ] **Step 4: Commit**

```bash
git add cdp-web/src/components/NormalMode.vue
git commit -m "feat: adapt workbench NormalMode for custom field usage"
```

---

### Task 8: SolutionPreviewDrawer.vue —— 适配预览

**Files:**
- Modify: `cdp-web/src/components/SolutionPreviewDrawer.vue`

- [ ] **Step 1: 更新为使用 customFields 预览**

将模板中遍历 `sections` 的部分改为遍历 `customFieldSections`。修改 props 为：

```js
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  customFieldSections: { type: Array, default: () => [] },
  solutionName: { type: String, default: '' },
})
```

模板改为遍历 `customFieldSections`，每个 section 展示其名称、类型、绑定的组件列表。

- [ ] **Step 2: 更新 SolutionCenter 中的 previewSections 和 SolutionPreviewDrawer 调用**

在 `SolutionCenter.vue` 中：

```js
// 在 import 中新增:
import { buildCustomFieldSections } from '../utils/solutionState.js'

// previewSections 改为:
const previewSections = computed(() =>
  buildCustomFieldSections(customFields.value, nodeList.value),
)
```

模板中 `<SolutionPreviewDrawer>` 调用改为:

```html
<SolutionPreviewDrawer
  v-model="previewVisible"
  :custom-field-sections="previewSections"
  :solution-name="activeSolution?.name || ''"
/>
```

- [ ] **Step 3: Commit**

```bash
git add cdp-web/src/components/SolutionPreviewDrawer.vue cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: update SolutionPreviewDrawer for custom fields"
```

---

### Task 9: CSS 样式补充

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue` (追加 style)
- Modify: `cdp-web/src/components/SolutionUseForm.vue` (追加 style)
- Modify: `cdp-web/src/components/DynamicForm.vue` (追加 style)

- [ ] **Step 1: 在各组件中追加 scoped style**

在 `SolutionCenter.vue` 的 `<style scoped>` 中追加：

```css
.custom-field-item {
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 6px;
}
.custom-field-item:hover, .custom-field-item.active {
  border-color: var(--accent, #ff6b4a);
  background: rgba(255, 107, 74, 0.04);
}
.custom-field-item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.custom-field-meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
}
.creating-custom-field-panel {
  background: rgba(255, 107, 74, 0.04);
  border: 1px solid rgba(255, 107, 74, 0.2);
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
}
.creating-steps {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.creating-step {
  font-size: 11px;
  color: var(--text-muted);
}
.creating-step.active { color: var(--accent, #ff6b4a); font-weight: 600; }
.creating-step.done { color: var(--text-secondary); }
.creating-step-body { margin-top: 8px; }
.creating-hint { font-size: 11px; margin: 8px 0; }
.creating-step-actions { display: flex; gap: 8px; margin-top: 8px; }
.node-highlighted {
  border-color: var(--accent, #ff6b4a) !important;
  box-shadow: 0 0 0 3px rgba(255, 107, 74, 0.15) !important;
}
```

在 `DynamicForm.vue` 的 `<style scoped>` 中追加：

```css
.field-highlighted {
  border-color: var(--accent, #ff6b4a) !important;
  background: rgba(255, 107, 74, 0.06) !important;
  box-shadow: 0 0 0 2px rgba(255, 107, 74, 0.1);
  border-radius: 4px;
}
.field-dimmed {
  opacity: 0.35;
  pointer-events: none;
  filter: grayscale(0.6);
}
.field-selectable {
  cursor: pointer;
  border: 2px dashed transparent;
  position: relative;
}
.field-selectable:hover {
  border-color: var(--accent, #ff6b4a);
  background: rgba(255, 107, 74, 0.03);
}
.field-selected {
  border-color: var(--accent, #ff6b4a);
  background: rgba(255, 107, 74, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 107, 74, 0.2);
}
.check-mark {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent, #ff6b4a);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

在 `SolutionUseForm.vue` 的 `<style scoped>` 中追加：

```css
.use-card-highlighted {
  border-color: var(--accent, #ff6b4a) !important;
  box-shadow: 0 0 0 3px rgba(255, 107, 74, 0.15) !important;
  transition: all 0.2s ease;
}
```

- [ ] **Step 2: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue cdp-web/src/components/DynamicForm.vue cdp-web/src/components/SolutionUseForm.vue
git commit -m "style: add custom field interaction styles (highlight, dimmed, selectable)"
```

---

### Task 10: 端到端验证

- [ ] **Step 1: 启动后端，验证 API 正常**

```bash
cd E:/CDP_Project_codex && python -c "
from cdp_backend.solution_store import SolutionStore
store = SolutionStore('.runtime/test_solutions.json')
# 创建带 customFields 的方案
draft = store.create_draft({
    'name': '测试自定义字段',
    'defaultCrowdName': '测试人群包',
    'nodes': [],
    'customFields': [
        {
            'id': 'cf_test',
            'name': '今年',
            'type': '日期_切换',
            'group': '',
            'defaultValue': {'days': 30, 'mode': 'recent'},
            'bindings': [{'nodeId': 'node_1', 'fieldKey': 'date_range'}]
        }
    ]
})
print('Created:', draft.get('customFields'))
# 验证 update
updated = store.update_draft(draft['id'], {'name': '更新名称', 'customFields': draft['customFields']})
print('Updated customFields preserved:', 'customFields' in updated)
# 清理
store.delete_solution(draft['id'])
print('OK - customFields round-trip successful')
"
```

Expected: 输出确认 customFields 正确保存和读取

- [ ] **Step 2: 启动开发服务器，手动测试完整流程**

```bash
cd E:/CDP_Project_codex && powershell -File start-dev.ps1
```

在浏览器中测试:
1. 打开方案中心 → 新建草稿 → 添加 2-3 个行为组件
2. 在右侧栏点击"+ 新增自定义字段（一对多）"
3. 输入名称，点击一个时间字段确定类型
4. 继续点击其他组件的同类型字段完成绑定
5. 完成创建，保存草稿
6. 切换到使用态预览，验证只展示自定义字段
7. 悬停自定义字段，验证高亮联动
8. 修改自定义字段值，验证原始组件值同步

- [ ] **Step 3: Commit (如有微调)**

```bash
git add -A
git commit -m "chore: end-to-end validation and minor fixes"
```
