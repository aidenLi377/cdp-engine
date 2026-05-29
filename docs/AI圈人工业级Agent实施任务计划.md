# AI 圈人工业级 Agent 实施任务计划

日期：2026-05-28

关联主文档：[AI圈人工业级Agent制作文档.md](./AI圈人工业级Agent制作文档.md)

## 1. 文档目标

本文档面向实际开发执行，用于把“AI 圈人工业级 Agent 制作文档”拆成可交付、可验收、可测试的实施任务。

重点说明：

- 不覆盖现有“方案中心”和“应用方案”能力。
- 不重做当前工作台生成 JSON 的链路。
- 第一阶段优先复用已有方案中心、工作台、节点运行时、方案加载、JSON 生成能力。
- AI Agent 的新增部分应作为“适配层”和“智能层”接在现有系统上。

本计划适合直接交给开发者或开发型 AI 按阶段执行。

## 2. 当前项目已有能力判断

当前项目已经具备很多 Agent 第一阶段所需的地基。

### 2.1 已具备的核心能力

| 能力 | 当前状态 | 说明 |
| --- | --- | --- |
| 方案中心 | 已具备 | 已支持草稿、正式方案、方案管理 |
| 工作台自由搭建 | 已具备 | 用户可添加节点、填写参数、设置交并差 |
| 工作台应用正式方案 | 已具备 | `NormalMode.vue` 中已有 `loadPublishedSolution` 和 `setWorkbenchFromSolution` |
| 方案节点加载为工作台节点 | 已具备 | 已能 hydrate 方案节点为运行时节点 |
| 节点参数渲染 | 已具备 | `DynamicForm` 和运行时 schema 已可渲染参数 |
| 交并差关系 | 已具备 | 节点 `operator` 已支持 `n/u/d` |
| 工作台生成最终 JSON | 已具备 | `buildFinalJson` 已根据 `nodeList` 调用后端生成最终结果 |
| 保存工作台为方案草稿 | 已具备 | `createDraft(buildDraftPayload())` 已存在 |
| 应用方案后继续编辑 | 基本具备 | 当前已支持方案使用态下的节点视图和结构变化标记 |
| customFields 批量参数 | 已具备 | 当前已有自定义字段绑定与同步逻辑 |

### 2.2 第一阶段还缺什么

第一阶段不是重做方案中心，而是补齐“AI WorkbenchPlan 到工作台”的适配层。

还缺：

| 缺口 | 说明 |
| --- | --- |
| WorkbenchPlan 独立协议 | 当前有方案对象，但还没有 AI 专用目标状态协议 |
| WorkbenchPlan 校验器 | 当前没有专门校验 AI 计划的校验层 |
| applyAiWorkbenchPlan | 当前有 `setWorkbenchFromSolution(record)`，但它接收正式方案 record，不接收 AI Plan |
| 内置 AI 方案卡片 | 当前有方案中心列表，但没有 AI 候选方案卡片入口 |
| 应用前圈人概览 | 当前没有 AI 方案应用前的不可编辑概览确认 |
| Plan 到现有工作台状态的映射 | 需要把 `plan.nodes[].params` 写入 `node.formData/modeData` |
| 字段类型适配表 | 需要明确不同字段类型如何写入 `formData/modeData` |
| 规则版节点解释器 | 需要用规则解释节点、关系和整体人群定义 |
| AI 应用前保护 | 需要快照、失败回滚、应用确认、错误提示 |
| delta 反馈闭环 | 需要记录 AI 推荐和用户最终配置之间的差异 |
| AI 计划测试 | 需要覆盖 Plan 校验、应用、最终 JSON 生成链路 |

准确判断：

```text
第一阶段的工作台结构化应用能力：已完成约 70%-80%
第一阶段的 AI Plan 适配层：还需完成约 20%-30%
```

## 3. 总体实施原则

### 3.1 不要重做已有系统

不要重做：

- 方案中心。
- 方案草稿/发布。
- 方案应用到工作台。
- 工作台节点编辑。
- 工作台最终 JSON 生成。
- DynamicForm。
- 后端现有 `/api/generate`。

应该复用：

- `NormalMode.vue` 中的运行时节点逻辑。
- `createRuntimeNode`。
- `hydrateNodes`。
- `nodeList`。
- `crowdNameInput`。
- `buildFinalJson`。
- `createDraft`。
- `useSolutionRuntime.js`。
- `useSolutionsApi.js`。

### 3.2 AI 第一阶段先不接模型

第一阶段目标是验证“结构化计划可以安全配置工作台”。不要接 DeepSeek、OpenAI 或其他模型。

第一阶段只做：

```text
手写 WorkbenchPlan
-> 校验
-> 展示方案卡片
-> 用户点击应用
-> 工作台被自动配置
```

### 3.3 模型接入必须排在校验器之后

必须先有：

- WorkbenchPlan schema。
- validateWorkbenchPlan。
- applyAiWorkbenchPlan。
- 测试用例。

然后才能接真实模型。否则模型输出不可控，会污染工作台状态。

## 4. 推荐开发分支与任务粒度

建议按以下 11 个任务执行。每个任务都可以独立开发、测试、提交。

```text
任务 1：WorkbenchPlan 类型与示例
任务 2：WorkbenchPlan 校验器
任务 3：字段类型适配表
任务 4：WorkbenchPlan 应用器
任务 5：应用前圈人概览预览
任务 6：AI 候选方案卡片临时入口
任务 7：Mock Planner 与后端预览接口
任务 8：AI 对话框 MVP
任务 9：DeepSeek ModelProvider 接入
任务 10：规则版节点关系解释器
任务 11：用户学习 MVP 与 delta 反馈
```

任务 1-6 对应第一阶段。
任务 7-9 对应第二阶段。
任务 10-11 对应第三阶段。

## 5. 任务 1：WorkbenchPlan 类型与示例

### 5.1 目标

在前端新增 AI 专用 WorkbenchPlan 协议和 2-3 个内置示例计划，用于第一阶段不接模型的验证。

### 5.2 建议新增文件

```text
cdp-web/src/ai/workbenchPlan.js
cdp-web/src/ai/builtinPlans.js
cdp-web/src/ai/workbenchPlan.test.mjs
```

### 5.3 WorkbenchPlan 最小结构

第一阶段可先实现最小字段：

```js
export const OPERATOR_VALUES = ['n', 'u', 'd']

export function createWorkbenchPlan(input) {
  return {
    planId: input.planId || `plan_${Date.now()}`,
    title: input.title || '',
    summary: input.summary || '',
    crowdName: input.crowdName || input.title || '',
    source: input.source || { type: 'system_scheme', matchReason: '' },
    missingSlots: input.missingSlots || [],
    warnings: input.warnings || [],
    nodes: input.nodes || [],
  }
}
```

### 5.4 内置方案示例

示例 1：两节点品类新客。

```js
export const builtinAiPlans = [
  {
    planId: 'builtin_category_new_customer_basic',
    title: '品类新客基础版',
    summary: '统计期内购买指定品牌指定品类，但排除历史购买过该品牌的人。',
    crowdName: '品类新客_基础版',
    source: {
      type: 'system_scheme',
      matchReason: '系统内置测试方案',
    },
    warnings: ['这是第一阶段内置测试方案，参数仅用于验证工作台自动配置能力。'],
    missingSlots: [],
    nodes: [
      {
        tempId: 'node_1',
        packageType: '类目商品行为',
        operator: null,
        description: '统计期内购买指定品牌指定品类的人',
        params: {}
      },
      {
        tempId: 'node_2',
        packageType: '商品行为',
        operator: 'd',
        description: '对比期内购买指定品牌的人',
        params: {}
      }
    ]
  }
]
```

注意：第一版示例参数可以先为空或只填当前项目确定存在的字段，避免因为维表值不匹配导致测试失败。第二轮再加入真实品牌、类目、日期值。

### 5.5 验收标准

- 可以 import `builtinAiPlans`。
- 每个内置计划都有 title、nodes。
- 每个节点都有 tempId、packageType、operator、params。
- 第一个节点 operator 为 null。
- 后续节点 operator 为 n/u/d。

### 5.6 测试点

```text
node cdp-web/src/ai/workbenchPlan.test.mjs
```

测试内容：

- 内置方案数量大于 0。
- 每个方案至少有 1 个节点。
- 第一个节点 operator 是 null。
- 后续节点 operator 合法。

## 6. 任务 2：WorkbenchPlan 校验器

### 6.1 目标

新增前端校验器，先做结构校验和基础业务校验。后续可迁移或同步到后端。

### 6.2 建议新增文件

```text
cdp-web/src/ai/validateWorkbenchPlan.js
cdp-web/src/ai/validateWorkbenchPlan.test.mjs
```

### 6.3 校验函数设计

```js
export function validateWorkbenchPlan(plan, context = {}) {
  const errors = []
  const warnings = []

  if (!plan || typeof plan !== 'object') {
    errors.push({ path: '', message: '方案不能为空' })
    return { ok: false, errors, warnings }
  }

  if (!String(plan.title || '').trim()) {
    errors.push({ path: 'title', message: '方案名称不能为空' })
  }

  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    errors.push({ path: 'nodes', message: '方案至少需要一个节点' })
  }

  const packageSet = new Set(context.packages || [])

  ;(plan.nodes || []).forEach((node, index) => {
    if (!node.tempId) {
      errors.push({ path: `nodes[${index}].tempId`, message: '节点缺少 tempId' })
    }

    if (!node.packageType) {
      errors.push({ path: `nodes[${index}].packageType`, message: '节点缺少组件类型' })
    } else if (packageSet.size > 0 && !packageSet.has(node.packageType)) {
      errors.push({
        path: `nodes[${index}].packageType`,
        message: `组件类型「${node.packageType}」不存在`,
      })
    }

    if (index === 0 && node.operator !== null) {
      errors.push({ path: `nodes[${index}].operator`, message: '第一个节点 operator 必须为 null' })
    }

    if (index > 0 && !['n', 'u', 'd'].includes(node.operator)) {
      errors.push({ path: `nodes[${index}].operator`, message: '后续节点 operator 必须是 n/u/d' })
    }

    if (!node.params || typeof node.params !== 'object' || Array.isArray(node.params)) {
      errors.push({ path: `nodes[${index}].params`, message: '节点 params 必须是对象' })
    }
  })

  return { ok: errors.length === 0, errors, warnings }
}
```

### 6.4 第一阶段校验范围

第一阶段必须校验：

- plan 是对象。
- title 非空。
- nodes 非空。
- 每个节点有 tempId。
- 每个节点有 packageType。
- packageType 存在于当前 `/api/packages` 返回列表中。
- 第一个节点 operator 为 null。
- 后续节点 operator 为 n/u/d。
- params 是对象。

第一阶段暂不强制校验：

- 品牌是否在维表。
- 类目是否在维表。
- 字段联动后是否可见。
- 日期格式是否完全匹配。

这些放到任务 6 或后端校验器中增强。

### 6.5 验收标准

- 合法 plan 返回 `{ ok: true }`。
- 缺 title 返回错误。
- 缺 nodes 返回错误。
- 非法 operator 返回错误。
- 不存在的 packageType 返回错误。

### 6.6 测试点

```text
node cdp-web/src/ai/validateWorkbenchPlan.test.mjs
```

## 7. 任务 3：字段类型适配表

### 7.1 目标

梳理当前工作台动态表单中不同字段类型对应的 `formData/modeData` 写入格式，形成 AI 参数写入适配表。

这是 `applyAiWorkbenchPlan` 的前置任务，也是后续提供给 LLM 的 schema context 基础。

### 7.2 建议新增文件

```text
cdp-web/src/ai/fieldValueAdapters.js
cdp-web/src/ai/fieldValueAdapters.test.mjs
```

### 7.3 需要覆盖的字段类型

至少梳理以下类型：

| 字段类型 | 写入目标 | 说明 |
| --- | --- | --- |
| 普通单选 | `formData[key] = value` | value 通常是字符串 |
| 普通多选 | `formData[key] = array` | value 必须是数组 |
| 日期切换 | `modeData[key] + formData[key]` | 支持 recent/range |
| 数值切换 | `modeData[key] + formData[key]` | 支持 unlimited/min/range |
| 级联选择 | 先父级后子级 | 需要确认当前项目字段关系 |
| 品牌/类目选择 | 通常写数组 | 后续要接维表校验 |
| 自定义字段绑定 | 不直接写入 | customFields 是批量编辑工具，不作为 AI Plan 第一阶段写入目标 |

### 7.4 适配函数设计

```js
export function applyFieldValue({ node, field, key, value }) {
  if (!field) return { ok: false, reason: 'field_not_found' }

  if (field.Widget_Type === '日期_切换' || field.Widget_Type === '日期切换') {
    return applyDateSwitchValue({ node, key, value })
  }

  if (field.Widget_Type === '数值_切换' || field.Widget_Type === '数值切换') {
    return applyNumberSwitchValue({ node, key, value })
  }

  if (Array.isArray(value)) {
    node.formData[key] = cloneValue(value)
    return { ok: true }
  }

  node.formData[key] = cloneValue(value)
  return { ok: true }
}
```

注意：当前项目中中文字段类型可能存在编码、命名差异，开发时必须从实际 `node.schema` 中抽样确认，不要只按文档猜。

### 7.5 输出 schema context

适配表还应能生成给模型看的字段说明：

```js
export function describeFieldForAi(field) {
  return {
    key: field.key,
    label: field.Label || field.label || field.key,
    widgetType: field.Widget_Type,
    valueShape: inferValueShape(field),
  }
}
```

示例：

```json
{
  "key": "date",
  "label": "统计时间",
  "widgetType": "日期_切换",
  "valueShape": {
    "mode": "recent",
    "days": 90
  }
}
```

### 7.6 验收标准

- 普通字段可以正确写入 `formData`。
- 多选字段可以正确写入数组。
- 日期切换可以正确写入 `modeData` 和 `formData`。
- 数值切换可以正确写入 `modeData` 和 `formData`。
- 未知字段返回错误或跳过，不导致应用流程崩溃。
- 适配表能输出基础 AI schema context。

### 7.7 测试点

```text
node cdp-web/src/ai/fieldValueAdapters.test.mjs
```

## 8. 任务 4：WorkbenchPlan 应用器

### 8.1 目标

实现 `applyAiWorkbenchPlan`，把 AI Plan 应用到当前工作台。

这一步是第一阶段最关键的工程任务。

### 8.2 推荐改动位置

优先新增 composable，而不是继续把逻辑塞进 `NormalMode.vue`。

建议新增：

```text
cdp-web/src/composables/useAiWorkbenchPlan.js
cdp-web/src/composables/useAiWorkbenchPlan.test.mjs
```

原因：

- `NormalMode.vue` 已经承载大量工作台逻辑。
- AI 应用器后续会继续扩展字段适配、快照、回滚、反馈记录。
- 直接 composable 化可以减少后续迁移成本。

composable 通过参数接收当前工作台上下文：

```js
export function useAiWorkbenchPlan({
  packages,
  nodeList,
  currentSolution,
  workbenchMode,
  crowdNameInput,
  createRuntimeNode,
  buildFinalJson,
  resetHistory,
  snapshotPaused,
  cloneValue,
}) {
  async function applyAiWorkbenchPlan(plan) {}

  return { applyAiWorkbenchPlan }
}
```

它需要访问：

- `nodeList`
- `createRuntimeNode`
- `buildFinalJson`
- `crowdNameInput`
- `resetHistory`
- `snapshotPaused`
- `takeSnapshot`

如果某些函数仍在 `NormalMode.vue` 内部，优先通过参数传入，不要为了任务 4 大规模重构工作台。

### 8.3 函数设计

```js
async function applyAiWorkbenchPlan(plan) {
  const validation = validateWorkbenchPlan(plan, { packages: packages.value })
  if (!validation.ok) {
    ElMessage.error(validation.errors[0]?.message || 'AI 方案校验失败')
    return false
  }

  const shouldContinue = await confirmReplaceCanvasForAiPlan()
  if (!shouldContinue) return false

  const previousState = {
    nodes: cloneValue(nodeList.value),
    crowdName: crowdNameInput.value,
    currentSolution: cloneValue(currentSolution.value),
    workbenchMode: workbenchMode.value,
  }

  snapshotPaused.value = true
  try {
    nodeList.value = []
    currentSolution.value = null
    workbenchMode.value = 'free-build'
    crowdNameInput.value = String(plan.crowdName || plan.title || DEFAULT_CROWD_NAME).trim()

    for (let index = 0; index < plan.nodes.length; index += 1) {
      const plannedNode = plan.nodes[index]
      const node = await createRuntimeNode({ packageType: plannedNode.packageType }, index)
      node.operator = index === 0 ? null : plannedNode.operator
      applyAiParamsToNode(node, plannedNode.params || {})
      node.collapsed = false
      nodeList.value.push(node)
    }

    resetHistory()
    await buildFinalJson()
    ElMessage.success('AI 方案已应用到工作台')
    return true
  } catch (error) {
    nodeList.value = previousState.nodes
    crowdNameInput.value = previousState.crowdName
    currentSolution.value = previousState.currentSolution
    workbenchMode.value = previousState.workbenchMode
    ElMessage.error(error?.message || 'AI 方案应用失败，已恢复原工作台')
    return false
  } finally {
    snapshotPaused.value = false
  }
}
```

### 8.4 参数写入函数

参数写入必须复用任务 3 的字段类型适配表，不要在 `applyAiWorkbenchPlan` 中硬编码大量字段类型判断。

```js
function applyAiParamsToNode(node, params) {
  Object.entries(params || {}).forEach(([key, value]) => {
    const field = (node.schema || []).find(item => item.key === key)
    const result = applyFieldValue({ node, field, key, value })
    if (!result.ok) {
      node._aiApplyWarnings = [
        ...(node._aiApplyWarnings || []),
        { key, reason: result.reason },
      ]
    }
  })
}
```

### 8.5 当前方案应用能力如何复用

已有 `setWorkbenchFromSolution(record)` 用于正式方案 record。不要删除它。

两条路径并存：

```text
正式方案应用：setWorkbenchFromSolution(record)
AI 方案应用：applyAiWorkbenchPlan(plan)
```

后续可以抽象公共函数：

```text
setWorkbenchFromNodes(nodes, metadata)
```

但第一版不建议为了抽象大改现有逻辑。

### 8.6 验收标准

- 点击内置 AI 方案后，工作台中间栏出现对应节点。
- 多节点顺序正确。
- 第二个及后续节点 operator 正确。
- crowdNameInput 被写入。
- 右侧 JSON 预览会重新生成。
- 应用失败时能恢复原工作台。
- 当前工作台非空时有确认提示。

### 8.7 测试点

建议新增测试：

```text
cdp-web/src/composables/useAiWorkbenchPlan.test.mjs
```

测试内容：

- mock 一个合法 plan。
- 调用应用函数后 nodeList 长度正确。
- operator 正确。
- crowdName 正确。
- 非法 plan 不会改变 nodeList。

## 9. 任务 5：应用前圈人概览预览

### 9.1 目标

在真正调用 `applyAiWorkbenchPlan` 之前，展示一个不可编辑的“圈人概览预览”，让用户清楚理解 AI 将要配置什么。

这一步对应产品路径中的关键环节：

```text
AI 先展示类似圈人结果概览的信息框
-> 用户确认
-> 再应用到工作台
```

### 9.2 推荐新增组件

```text
cdp-web/src/components/AiPlanOverviewPreview.vue
```

### 9.3 预览内容

概览至少展示：

- 方案名称。
- 匹配来源和匹配理由。
- 人群包名称建议。
- 节点列表。
- 每个节点的业务描述。
- 每个节点的关键参数摘要。
- 节点之间的交并差关系。
- warnings。
- missingSlots。

### 9.4 节点关系展示

第一版不需要复杂拓扑图，可以先用线性结构：

```text
节点1：近90天购买品牌A面霜的人
  差集
节点2：近365天购买品牌A的人
  差集
节点3：大盘对应品牌A人群
```

后续可以增强为拓扑图或流程图。

### 9.5 交互按钮

预览弹窗按钮：

- 确认应用到工作台。
- 返回修改/换方案。
- 取消。

只有点击“确认应用到工作台”才调用 `applyAiWorkbenchPlan`。

### 9.6 验收标准

- 用户点击方案卡片后先看到概览预览，而不是直接应用。
- 概览中能看到节点和关系。
- 点击确认后才应用工作台。
- 点击取消不会修改工作台。
- warnings 和 missingSlots 能展示。

## 10. 任务 6：AI 候选方案卡片临时入口

### 10.1 目标

在不接模型的情况下，让用户可以从 UI 选择一个内置 AI 方案并应用到工作台，用于验证第一阶段闭环。

### 10.2 推荐实现

在 `NormalMode.vue` 顶部工具栏或左侧面板增加临时入口：

```text
AI 方案试用
```

点击后打开一个轻量弹窗或抽屉，展示 `builtinAiPlans`。

### 10.3 方案卡片内容

每张卡片展示：

- title。
- summary。
- source.matchReason。
- 节点数量。
- 节点关系。
- warnings。
- 预览概览按钮。

### 10.4 推荐组件

如果想拆组件：

```text
cdp-web/src/components/AiPlanPreviewDialog.vue
```

第一版建议尽量拆组件，不要继续扩大 `NormalMode.vue`。如果必须在 `NormalMode.vue` 内接入口，也只保留弹窗开关状态和事件绑定。

### 10.5 验收标准

- 工作台可以打开 AI 方案试用入口。
- 能看到至少 2 个内置方案。
- 点击“预览概览”后打开 `AiPlanOverviewPreview`。
- 在概览中点击“确认应用到工作台”后调用 `applyAiWorkbenchPlan`。
- 应用后弹窗关闭。
- 应用失败时展示错误。

## 11. 任务 7：Mock Planner 与后端预览接口

### 11.1 目标

新增后端 AI 预览接口，但先不接真实模型。用规则或 mock 返回候选 WorkbenchPlan。

这一步是从“前端内置方案”过渡到“后端 Agent 服务”的桥。

### 11.2 建议新增后端模块

```text
cdp_backend/ai_agent/__init__.py
cdp_backend/ai_agent/plans.py
cdp_backend/ai_agent/mock_planner.py
cdp_backend/ai_agent/validator.py
```

### 11.3 建议新增接口

在 `cdp_backend/app_factory.py` 注册：

```http
POST /api/ai/plans/preview
POST /api/ai/plans/validate
```

### 11.4 mock planner 行为

规则示例：

- 用户输入包含“品类新客”，返回品类新客内置 plan。
- 用户输入包含“老客”，返回品牌老客内置 plan。
- 否则返回追问或空方案。

响应结构：

```json
{
  "traceId": "mock_trace_001",
  "replyType": "plans",
  "message": "我根据你的输入生成了以下候选方案。",
  "plans": [],
  "questions": [],
  "learningSuggestion": null,
  "errors": [],
  "warnings": []
}
```

### 11.5 验收标准

- `POST /api/ai/plans/preview` 可返回候选 plans。
- 输入“品类新客”能返回至少一个 plan。
- 输入模糊内容能返回 questions 或友好提示。
- `POST /api/ai/plans/validate` 能校验基础结构。

### 11.6 测试点

新增：

```text
test_ai_agent_api.py
```

测试：

- preview 接口正常返回。
- validate 合法 plan 返回 ok。
- validate 非法 plan 返回 errors。

## 12. 任务 8：AI 对话框 MVP

### 12.1 目标

新增真实 AI 对话入口，但仍然使用 mock planner，不接真实模型。

### 12.2 推荐新增组件

```text
cdp-web/src/components/AiAssistantDrawer.vue
cdp-web/src/components/AiPlanCard.vue
cdp-web/src/composables/useAiAgentApi.js
```

### 12.3 前端流程

```text
用户点击 AI 圈人
-> 打开 AiAssistantDrawer
-> 用户输入自然语言
-> 调用 /api/ai/plans/preview
-> 展示候选方案卡片
-> 用户点击预览概览
-> 用户在概览中确认应用
-> 调用 applyAiWorkbenchPlan
-> 工作台自动配置
```

### 12.4 Drawer 内容

必须包含：

- 输入框。
- 发送按钮。
- loading 状态。
- 候选方案卡片。
- 应用前概览预览。
- 追问展示。
- 错误提示。

第一版不需要完整聊天历史，但建议保留最近一次输入和响应。

### 12.5 验收标准

- 工作台有 AI 入口。
- 可以输入自然语言。
- 可以看到 mock 返回方案。
- 可以先预览概览，再应用方案到工作台。
- 缺少参数时能展示追问。

## 13. 任务 9：DeepSeek ModelProvider 接入

### 13.1 目标

把 mock planner 替换或扩展为真实模型 planner，并保持模型可替换。

### 13.2 原则

不要让业务代码直接调用 DeepSeek。必须通过 ModelProvider 抽象。

推荐结构：

```text
cdp_backend/ai_agent/model_provider.py
cdp_backend/ai_agent/deepseek_provider.py
cdp_backend/ai_agent/prompt.py
cdp_backend/ai_agent/planner.py
```

### 13.3 Provider 接口

```python
class ModelProvider:
    def create_plan(self, *, user_message, schema_context, matched_schemes):
        raise NotImplementedError

    def explain_workbench(self, *, nodes, schema_context):
        raise NotImplementedError
```

### 13.4 DeepSeekProvider

DeepSeekProvider 负责：

- 读取 API key。
- 调用 deepseek-v4-pro。
- 使用 JSON Output 或 Tool Calling。
- 返回 AiAgentResponse。
- 捕获模型错误并转换为业务错误。

### 13.5 环境变量

建议：

```text
DEEPSEEK_API_KEY=xxx
AI_MODEL_PROVIDER=deepseek
AI_MODEL_NAME=deepseek-v4-pro
AI_AGENT_ENABLED=true
```

### 13.6 模型输出后必须校验

模型输出流程：

```text
DeepSeek 输出 AiAgentResponse
-> 后端解析 JSON
-> 对每个 plan 执行 validateWorkbenchPlan
-> 不合法 plan 从候选列表移除
-> 全部不合法则返回 error 或 questions
```

### 13.7 验收标准

- 关闭 `AI_AGENT_ENABLED` 时接口不调用模型。
- 使用 mock provider 时功能不受影响。
- 使用 deepseek provider 时能返回结构化响应。
- 模型输出非法 JSON 时系统不崩溃。
- 模型输出非法 plan 时不会展示应用按钮。

## 14. 任务 10：规则版节点关系解释器

### 14.1 目标

实现不依赖 LLM 的规则版解释器，用于解释当前工作台每个节点、节点关系和整体人群定义。

这一步是用户学习的前置能力。第一版应先用规则解释，LLM 只负责润色和建议命名。

### 14.2 建议新增文件

```text
cdp_backend/ai_agent/explainer.py
test_ai_agent_explainer.py
```

如果前端也需要即时预览，可后续补：

```text
cdp-web/src/ai/explainWorkbenchState.js
```

### 14.3 节点解释规则

输入示例：

```json
{
  "packageType": "商品行为",
  "formData": {
    "stdBrand": ["品牌A"],
    "bhv": ["购买"]
  },
  "modeData": {}
}
```

输出示例：

```text
购买过品牌A商品的人
```

节点解释优先使用：

- packageType。
- 字段 label。
- formData 展示值。
- modeData 中的日期/数值模式。

第一版不要求完美，但要做到稳定、可测试。

### 14.4 关系解释规则

operator 映射：

| operator | 关系解释 |
| --- | --- |
| n | 与上一组取交集 |
| u | 与上一组取并集 |
| d | 从当前结果中排除这一组 |

示例：

```text
节点1：近90天购买过品牌A面霜的人
节点2：近365天购买过品牌A的人
关系：从节点1中排除节点2
```

### 14.5 整体解释规则

将节点解释和关系解释拼成完整定义：

```text
这个人群表示：近90天购买过品牌A面霜的人，但排除近365天购买过品牌A的人。
```

如果节点超过 3 个，可以输出分步解释：

```text
第一步，圈出……
第二步，排除……
第三步，再排除……
```

### 14.6 输出结构

```json
{
  "summary": "这个人群表示……",
  "nodeExplanations": [
    {
      "nodeId": "node_1",
      "title": "节点1",
      "description": "近90天购买过品牌A面霜的人"
    }
  ],
  "relationExplanations": [
    {
      "fromIndex": 0,
      "toIndex": 1,
      "operator": "d",
      "description": "从节点1中排除节点2"
    }
  ],
  "suggestedNames": ["品类新客", "面霜品类新客"]
}
```

### 14.7 验收标准

- 单节点能生成可读描述。
- 多节点能生成关系描述。
- `n/u/d` 都有明确解释。
- 能生成整体 summary。
- 不依赖模型也能通过测试。

## 15. 任务 11：用户学习 MVP 与 delta 反馈

### 15.1 目标

实现“AI 学习当前人群”的最小闭环。

第一版可以先不用 embedding 和向量库，使用本地 JSON 或现有 runtime 存储，但必须设计 userId 隔离和 delta 反馈结构。

### 15.2 后端新增模块

```text
cdp_backend/ai_agent/scheme_store.py
cdp_backend/ai_agent/feedback_store.py
```

### 15.3 后端新增接口

```http
POST /api/ai/workbench/explain
POST /api/ai/learning/save
POST /api/ai/feedback
GET /api/ai/schemes
DELETE /api/ai/schemes/<scheme_id>
```

### 15.4 userId 隔离策略

如果当前项目还没有正式登录体系，先实现一个用户 ID 解析函数：

```python
def resolve_current_user_id(request):
    return request.headers.get("X-User-Id") or "local_user"
```

所有学习方案读写必须带 userId：

```text
保存方案：只能保存到当前 userId
查询方案：只能查询当前 userId
删除方案：只能删除当前 userId 下的 scheme
反馈事件：必须记录当前 userId
```

后续接入真实账号体系时，只替换 `resolve_current_user_id`，不要改业务存储结构。

### 15.5 前端新增入口

在工作台结果区或顶部增加：

```text
AI 学习当前人群
```

点击后：

```text
读取当前 nodeList
-> 调用 /api/ai/workbench/explain
-> 展示解释和建议名称
-> 用户确认名称和描述
-> 调用 /api/ai/learning/save
```

### 15.6 学习弹窗字段

包含：

- 推荐名称。
- 用户可编辑名称。
- 整体解释。
- 节点解释。
- 关系解释。
- 是否关联最近自然语言。
- 保存按钮。

### 15.7 第一版学习存储

可以先存：

```json
{
  "id": "scheme_001",
  "userId": "local_user",
  "name": "品类新客",
  "description": "用户确认的人群解释",
  "planTemplate": {},
  "sourceWorkbenchState": {},
  "examples": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 15.8 delta 反馈结构

当用户应用 AI 方案后又手动修改，系统应记录 delta。

最小结构：

```json
{
  "id": "feedback_001",
  "userId": "local_user",
  "traceId": "ai_trace_001",
  "eventType": "modified_after_apply",
  "predictedPlan": {},
  "finalWorkbenchState": {},
  "diff": [
    {
      "type": "param_changed",
      "nodeIndex": 1,
      "fieldKey": "date",
      "before": {
        "mode": "recent",
        "days": 365
      },
      "after": {
        "mode": "recent",
        "days": 180
      }
    }
  ],
  "createdAt": "..."
}
```

第一版可以先在以下时机记录：

- AI 方案应用成功时记录 `predictedPlan`。
- 用户点击复制或保存时记录 `finalWorkbenchState`。
- 对比两者生成 diff。
- 用户确认学习时，将 diff 关联到保存的 scheme。

### 15.9 delta 学习用途

delta 不要求第一版自动改用户方案，但要存下来。后续可用于：

- 判断某个默认值是否应更新。
- 判断用户是否经常新增某类节点。
- 判断某个候选方案是否经常被大幅修改。
- 给用户提示“是否更新你的个人定义”。

### 15.10 验收标准

- 用户能点击 AI 学习当前人群。
- 系统能解释当前节点和关系。
- 用户能保存名称和描述。
- 保存后能在用户方案列表中看到。
- 再次输入相同名称时，mock planner 能优先返回该方案。
- 学习方案按 userId 隔离。
- AI 应用后用户修改的 delta 能被记录。

## 16. 每个任务给开发 AI 的推荐提示词

### 16.1 执行任务 1 的提示词

```text
请阅读 docs/AI圈人工业级Agent制作文档.md 和 docs/AI圈人工业级Agent实施任务计划.md。
只执行任务 1：WorkbenchPlan 类型与示例。
不要修改方案中心、工作台主逻辑、后端接口。
新增 cdp-web/src/ai/workbenchPlan.js、builtinPlans.js、workbenchPlan.test.mjs。
完成后运行对应 node 测试。
```

### 16.2 执行任务 2 的提示词

```text
只执行任务 2：WorkbenchPlan 校验器。
基于任务 1 的文件新增 validateWorkbenchPlan.js 和测试。
校验范围只做结构校验、operator 校验、packageType 白名单校验。
不要接模型，不要改 UI。
```

### 16.3 执行任务 3 的提示词

```text
只执行任务 3：字段类型适配表。
新增 cdp-web/src/ai/fieldValueAdapters.js 和测试。
梳理当前 DynamicForm/schema 中常见字段类型对应的 formData/modeData 写入格式。
至少支持普通字段、多选字段、日期切换、数值切换。
不要改 UI，不要接模型。
```

### 16.4 执行任务 4 的提示词

```text
只执行任务 4：WorkbenchPlan 应用器。
新增 cdp-web/src/composables/useAiWorkbenchPlan.js。
通过参数接收 nodeList、createRuntimeNode、crowdNameInput、buildFinalJson、resetHistory 等上下文。
复用任务 3 的字段类型适配表写入参数。
不要删除 setWorkbenchFromSolution。
应用失败必须回滚。
补充 composable 测试。
```

### 16.5 执行任务 5 的提示词

```text
只执行任务 5：应用前圈人概览预览。
新增 AiPlanOverviewPreview.vue。
用户点击方案后先展示不可编辑概览，包含节点、关系、参数摘要、warnings。
只有用户确认后才调用 applyAiWorkbenchPlan。
不要接后端，不要接模型。
```

### 16.6 执行任务 6 的提示词

```text
只执行任务 6：AI 候选方案卡片临时入口。
在工作台中增加 AI 方案试用入口，展示 builtinAiPlans。
点击方案先打开 AiPlanOverviewPreview。
在概览中确认后调用 applyAiWorkbenchPlan。
不要接后端，不要接模型。
```

### 16.7 执行任务 7 的提示词

```text
只执行任务 7：Mock Planner 与后端预览接口。
新增 cdp_backend/ai_agent 模块。
新增 /api/ai/plans/preview 和 /api/ai/plans/validate。
使用规则 mock，不接真实模型。
补 test_ai_agent_api.py。
```

### 16.8 执行任务 8 的提示词

```text
只执行任务 8：AI 对话框 MVP。
新增 AiAssistantDrawer、AiPlanCard、useAiAgentApi。
调用 /api/ai/plans/preview 展示候选方案。
用户点击方案后先打开概览预览，确认后复用 applyAiWorkbenchPlan。
不要接真实模型。
```

### 16.9 执行任务 9 的提示词

```text
只执行任务 9：DeepSeek ModelProvider 接入。
新增 ModelProvider 抽象和 DeepSeekProvider。
通过环境变量控制 provider 和模型名称。
模型输出必须经过 validateWorkbenchPlan。
模型失败时回退到友好错误，不影响工作台。
```

### 16.10 执行任务 10 的提示词

```text
只执行任务 10：规则版节点关系解释器。
新增 cdp_backend/ai_agent/explainer.py 和测试。
用规则解释每个节点、operator 关系和整体人群定义。
第一版不依赖 LLM。
```

### 16.11 执行任务 11 的提示词

```text
只执行任务 11：用户学习 MVP 与 delta 反馈。
新增 AI 学习当前人群入口、保存接口、本地 scheme store、feedback_store。
实现 userId 隔离策略，默认 header X-User-Id 或 local_user。
记录 AI 推荐 plan 与用户最终工作台状态的 delta。
用户确认后再保存学习结果。
不要自动回写已有方案。
```

## 17. 推荐验收顺序

不要等全部做完才验收。建议每个任务独立验收。

```text
任务 1 验收：内置 WorkbenchPlan 可被加载
任务 2 验收：非法 plan 会被拦截
任务 3 验收：字段类型适配表能正确写入常见字段
任务 4 验收：合法 plan 能填入工作台
任务 5 验收：应用前能展示圈人概览
任务 6 验收：用户可从 UI 预览并应用内置 AI 方案
任务 7 验收：后端 mock 接口可返回 plan
任务 8 验收：AI 对话框可展示、预览并应用 mock plan
任务 9 验收：DeepSeek 可返回结构化 plan 且受校验器约束
任务 10 验收：规则解释器能解释节点、关系和整体定义
任务 11 验收：用户可学习当前工作台、按 userId 隔离并记录 delta
```

## 18. 风险清单

### 18.1 风险：AI Plan 字段名和当前 schema 不一致

处理：

- 第一阶段先允许 params 为空。
- 第二阶段引入字段映射表。
- 第三阶段用 schema context 约束模型输出。

### 18.2 风险：NormalMode.vue 承载过多逻辑

处理：

- AI 新增逻辑优先放到 composable 和独立组件。
- `NormalMode.vue` 只保留入口状态、事件绑定和上下文传参。
- `applyAiWorkbenchPlan` 直接放入 `useAiWorkbenchPlan.js`，不要先写进 `NormalMode.vue` 再迁移。

### 18.3 风险：模型输出不可控

处理：

- 必须先做 mock。
- 必须先做 validateWorkbenchPlan。
- 模型 plan 不合法不允许应用。

### 18.4 风险：用户误以为 AI 修改了正式方案

处理：

- AI 应用进入自由工作台实例。
- 明确提示“当前内容仅在工作台生效，不影响正式方案”。
- 如果要沉淀，必须另存或学习。

### 18.5 风险：学习结果污染用户定义

处理：

- 学习必须用户确认。
- 学习结果可编辑、可删除。
- 更新已有定义必须二次确认。

### 18.6 风险：字段类型适配不完整导致参数填错

处理：

- 第一阶段 params 可以为空或只使用已验证字段。
- 字段适配表必须有测试。
- 未识别字段跳过并记录 warning，不应强写。
- 后续模型 schema context 必须来自字段适配表，而不是手写猜测。

### 18.7 风险：学习方案跨用户污染

处理：

- 所有学习方案和反馈事件必须带 userId。
- 后端查询必须按 userId 过滤。
- 本地开发态用 `local_user`，生产态替换为真实登录用户。

## 19. 最小可上线版本定义

最小可上线版本不等于全部工业级能力。建议上线范围：

- AI 按钮。
- AI 对话框。
- mock 或真实模型生成候选 WorkbenchPlan。
- WorkbenchPlan 校验。
- 用户确认后应用到工作台。
- 用户可以继续手动调整。
- 不生成最终 JSON，仍由系统生成。

暂不上线：

- 自动学习。
- 团队共享。
- 向量库。
- 版本回滚。
- 批量圈人。

## 20. 最终实施结论

当前项目已经完成了 Agent 第一阶段最难的底座：方案中心、方案应用、工作台节点运行时、参数表单、交并差关系、最终 JSON 生成。

接下来不要重做这些能力。正确路线是：

```text
在现有方案应用能力旁边新增 AI WorkbenchPlan 适配层
-> 用内置 plan 验证自动填工作台
-> 用 mock planner 验证 AI 对话路径
-> 接入 DeepSeek
-> 增加用户学习
-> 增加反馈闭环和工业化能力
```
