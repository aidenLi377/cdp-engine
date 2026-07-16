# Gallery White Control and Parameter Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改后端、接口或既有业务逻辑的前提下，把全站菜单式下拉和指定分段控件统一为清爽的黑白橙 Gallery White A 方案，并完成参数精确联动与可见文案调整。

**Architecture:** 所有视觉变化集中在 `cdp-global.css` 的 Gallery White 末尾覆盖层，通过显式 Element Plus 选择器覆盖默认灰底；参数联动只复用 `NormalMode.vue` 的 `highlightedCfId`，不新增持久状态；标题与任务按钮只改模板文案。每个任务先新增源码契约测试并确认 RED，再做最小实现。

**Tech Stack:** Vue 3、Element Plus 2.13、CSS、Node.js `node:test`、Vite、`vue-tsc`

## Global Constraints

- 只修改前端；不得修改后端、接口、扩展消息协议、依赖、构建配置、路由或权限。
- 不得修改方案序列化、任务执行函数、数据请求、持久化逻辑、函数名或状态语义。
- 保持现有三栏结构、栏宽、工作台交互、方案保存、撤销、重做和任务执行行为。
- 视觉方向是 Apple-like Gallery White A：纯白表面、黑色选中态、发丝边框、橙色只作细微信号；不得出现灰色环境填充或橙色块。
- 全站所有菜单式下拉均不得有灰底，包括 Select、Select V2、Tree Select、Dropdown、Cascader、Autocomplete 的触发器、标签、面板、默认、hover、selected、disabled、empty 和 loading 状态。
- 下拉禁用态保持白底，只用三级文字色、透明度和禁用光标表达；该规则优先于通用禁用态填充。
- 页面主导航、方案库分段、状态过滤和摘要工具栏必须保持既有功能，只调整形状、尺寸和状态表面。
- 参数卡联动只高亮顶部参数卡、中栏准确字段和右侧准确摘要行；不得高亮整个行为节点；再次点击同一参数必须取消。
- 只能修改设计说明允许的源码与对应前端契约测试。

---

### Task 1: Unify controls and make every dropdown state white

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.css`
- Test: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`

**Interfaces:**
- Consumes: 现有 Gallery White token `--ui-surface`、`--ui-ink`、`--ui-divider`、`--ui-control-border`、`--ui-text-tertiary`、`--ui-accent`、`--ui-accent-ring`。
- Produces: 全局菜单式下拉白底契约，以及主导航、方案中心分段和摘要工具栏统一尺寸契约；后续任务不依赖新的 JS 接口。

- [ ] **Step 1: Write failing Gallery White contract tests**

在 `cdp-global.gallery-white.test.mjs` 末尾增加以下测试。测试必须读取 `themeCss` 的最后生效规则，确保不是被旧 CSS 偶然满足：

```js
test('gallery white A uses independent white capsules for reviewed control groups', () => {
  for (const selector of [
    '.app-shell-nav .el-radio-group',
    '.solution-library-switch',
    '.solution-filter-group',
    '.json-tabs',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*transparent\s*!important/)
    assert.match(rule, /border:\s*0\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
  }

  const nav = effectiveSelectorListRule(themeCss, '.app-shell-nav .el-radio-button__inner')
  assert.match(nav, /min-width:\s*84px/)
  assert.match(nav, /height:\s*30px/)
  assert.match(nav, /border-radius:\s*999px\s*!important/)
  assert.match(nav, /background:\s*var\(--ui-surface\)\s*!important/)

  for (const selector of ['.json-tab', '.json-actions .el-button']) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /height:\s*32px\s*!important/)
    assert.match(rule, /border-radius:\s*8px\s*!important/)
  }
})

test('gallery white A keeps every menu-style dropdown state white', () => {
  const whiteSelectors = [
    '.el-select__wrapper',
    '.el-select-v2__wrapper',
    '.el-select__selection .el-tag',
    '.el-select-v2__tag',
    '.el-dropdown > .el-button',
    '.el-select-dropdown',
    '.el-select-dropdown__item',
    '.el-select-dropdown__item:hover',
    '.el-select-dropdown__item.is-hovering',
    '.el-select-dropdown__item.is-selected',
    '.el-select-dropdown__item.is-disabled',
    '.el-dropdown-menu',
    '.el-dropdown-menu__item',
    '.el-dropdown-menu__item:not(.is-disabled):focus',
    '.el-dropdown-menu__item.is-active',
    '.el-dropdown-menu__item.is-disabled',
    '.el-cascader__dropdown',
    '.el-cascader-node',
    '.el-cascader-node:not(.is-disabled):hover',
    '.el-cascader-node.in-active-path',
    '.el-cascader-node.is-active',
    '.el-cascader-node.is-disabled',
    '.el-autocomplete-suggestion',
    '.el-autocomplete-suggestion li',
    '.el-autocomplete-suggestion li:hover',
    '.el-autocomplete-suggestion li.highlighted',
    '.el-tree-select__popper .el-tree-node__content',
    '.el-tree-select__popper .el-tree-node__content:hover',
    '.el-tree-select__popper .el-tree-node.is-current > .el-tree-node__content',
    '.el-tree-select__popper .el-tree-node.is-disabled > .el-tree-node__content',
    '.el-select-dropdown__empty',
    '.el-select-dropdown__loading',
    '.el-cascader-menu__empty-text',
  ]

  for (const selector of whiteSelectors) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background(?:-color)?:\s*var\(--ui-surface\)\s*!important/)
    assert.doesNotMatch(rule, /var\(--ui-fill\)|#f5f5f7|#f2f2f2|#f0f0f0/i)
  }

  for (const selector of [
    '.el-select-dropdown__item.is-disabled',
    '.el-dropdown-menu__item.is-disabled',
    '.el-cascader-node.is-disabled',
    '.el-tree-select__popper .el-tree-node.is-disabled > .el-tree-node__content',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /color:\s*var\(--ui-text-tertiary\)\s*!important/)
    assert.match(rule, /cursor:\s*not-allowed\s*!important/)
  }
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test cdp-web/src/styles/cdp-global.gallery-white.test.mjs
```

Expected: the two new tests fail because the final Gallery White layer does not yet contain explicit transparent control-group rules and complete white dropdown-state rules.

- [ ] **Step 3: Add the minimal final Gallery White overrides**

在 `cdp-global.css` 的 Gallery White 区域末尾新增一个 `Gallery White A control polish` 块。保持现有 token，不改 Element Plus 组件或 Vue 脚本。实现内容必须包含：

```css
/* Gallery White A control polish */
.app-shell-nav .el-radio-group,
.solution-library-switch,
.solution-filter-group,
.json-tabs {
  gap: 4px !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible;
}

.app-shell-nav .el-radio-button__inner {
  min-width: 84px;
  height: 30px;
  padding: 0 14px !important;
  color: var(--ui-text-secondary) !important;
  background: var(--ui-surface) !important;
  border: 1px solid var(--ui-divider) !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}

.solution-library-switch .el-radio-button__inner,
.solution-filter-group .el-radio-button__inner {
  min-height: 28px;
  color: var(--ui-text-secondary) !important;
  background: var(--ui-surface) !important;
  border: 1px solid var(--ui-divider) !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}

.app-shell-nav .el-radio-button.is-active .el-radio-button__inner,
.solution-library-switch .el-radio-button.is-active .el-radio-button__inner,
.solution-filter-group .el-radio-button.is-active .el-radio-button__inner,
.json-tab.active {
  color: var(--ui-surface) !important;
  background: var(--ui-ink) !important;
  border-color: var(--ui-ink) !important;
  box-shadow: none !important;
}

.json-tab,
.json-actions .el-button {
  box-sizing: border-box;
  height: 32px !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

.json-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  color: var(--ui-text-secondary);
  background: var(--ui-surface);
  border: 1px solid var(--ui-divider);
}

.el-select__wrapper,
.el-select-v2__wrapper,
.el-select__selection .el-tag,
.el-select-v2__tag,
.el-dropdown > .el-button,
.el-select-dropdown,
.el-select-dropdown__item,
.el-dropdown-menu,
.el-dropdown-menu__item,
.el-cascader__dropdown,
.el-cascader-menu,
.el-cascader-node,
.el-autocomplete-suggestion,
.el-autocomplete-suggestion__wrap,
.el-autocomplete-suggestion li,
.el-tree-select__popper,
.el-tree-select__popper .el-tree-node__content,
.el-select-dropdown__empty,
.el-select-dropdown__loading,
.el-cascader-menu__empty-text {
  background: var(--ui-surface) !important;
  background-color: var(--ui-surface) !important;
}

.el-select-dropdown__item:hover,
.el-select-dropdown__item.is-hovering,
.el-select-dropdown__item.is-selected,
.el-dropdown-menu__item:not(.is-disabled):focus,
.el-dropdown-menu__item:not(.is-disabled):hover,
.el-dropdown-menu__item.is-active,
.el-cascader-node:not(.is-disabled):hover,
.el-cascader-node.in-active-path,
.el-cascader-node.is-active,
.el-autocomplete-suggestion li:hover,
.el-autocomplete-suggestion li.highlighted,
.el-tree-select__popper .el-tree-node__content:hover,
.el-tree-select__popper .el-tree-node.is-current > .el-tree-node__content {
  color: var(--ui-accent) !important;
  background: var(--ui-surface) !important;
  background-color: var(--ui-surface) !important;
  box-shadow: inset 2px 0 0 var(--ui-accent) !important;
}

.el-select-dropdown__item.is-disabled,
.el-dropdown-menu__item.is-disabled,
.el-cascader-node.is-disabled,
.el-tree-select__popper .el-tree-node.is-disabled > .el-tree-node__content {
  color: var(--ui-text-tertiary) !important;
  background: var(--ui-surface) !important;
  background-color: var(--ui-surface) !important;
  cursor: not-allowed !important;
  opacity: 0.58;
  box-shadow: none !important;
}
```

如果现有 DOM 使用更具体的 Element Plus 类名，可在不扩大到非下拉树节点的前提下补充等价选择器；不得用 `--ui-fill`，也不得改变组件行为。

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --test cdp-web/src/styles/cdp-global.gallery-white.test.mjs cdp-web/src/App.navigation.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit the control polish**

```powershell
git add cdp-web/src/styles/cdp-global.css cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git commit -m "style: unify gallery white controls"
```

---

### Task 2: Link a selected parameter to only its exact fields and summary rows

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`
- Test: `cdp-web/src/components/NormalMode.customFields.test.mjs`

**Interfaces:**
- Consumes: existing `highlightedCfId`, `onHighlightCf(cfId)`, `isFieldHighlighted(nodeId, fieldKey)`, and custom-field bindings shaped as `{ nodeId, fieldKey }`.
- Produces: `isSummaryRowHighlighted(nodeId, fieldKey)` driven by `highlightedCfId`; solution-use node wrappers no longer consume `node-highlighted`.

- [ ] **Step 1: Write failing parameter-linkage contract tests**

在 `NormalMode.customFields.test.mjs` 增加：

```js
test('solution-use parameter highlighting stays field-level and reaches the matching summary row', () => {
  const solutionUseStart = normalModeVue.indexOf("workbenchMode === 'solution-use'")
  const freeBuildStart = normalModeVue.indexOf('v-else class="canvas-with-minimap"', solutionUseStart)
  const solutionUseTemplate = normalModeVue.slice(solutionUseStart, freeBuildStart)
  const summaryFunctionStart = normalModeVue.indexOf('function isSummaryRowHighlighted')
  const summaryFunctionEnd = normalModeVue.indexOf('\n}', summaryFunctionStart) + 2
  const summaryFunction = normalModeVue.slice(summaryFunctionStart, summaryFunctionEnd)

  assert.doesNotMatch(solutionUseTemplate, /node-highlighted/)
  assert.match(normalModeVue, /'summary-row-highlighted': highlightedCfId && isSummaryRowHighlighted\(node\.id, item\.key\)/)
  assert.match(summaryFunction, /if \(!highlightedCfId\.value\) return false/)
  assert.match(summaryFunction, /c\.id === highlightedCfId\.value/)
  assert.doesNotMatch(summaryFunction, /collapsedCfId/)
  assert.match(normalModeVue, /'cf-use-card-active': highlightedCfId === section\.customFieldId/)
  assert.match(normalModeVue, /isFieldHighlighted: \(nodeId, fieldKey\) => \{[\s\S]*highlightedCfId\.value/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test cdp-web/src/components/NormalMode.customFields.test.mjs
```

Expected: the new test fails because solution-use still binds `node-highlighted` and summary highlighting still depends on `collapsedCfId`.

- [ ] **Step 3: Make the minimal template and state-read changes**

在方案使用分支的节点包装器中删除：

```vue
:class="{ 'node-highlighted': highlightedCfId && isNodeHighlightedForCf(node.id) }"
```

保留自由搭建分支的兼容绑定。把摘要行改为：

```vue
:class="{ 'summary-row-highlighted': highlightedCfId && isSummaryRowHighlighted(node.id, item.key) }"
```

把函数改为：

```js
function isSummaryRowHighlighted(nodeId, fieldKey) {
  if (!highlightedCfId.value) return false
  const cfs = currentSolution.value?.customFields || []
  const cf = cfs.find(c => c.id === highlightedCfId.value)
  if (!cf) return false
  return (cf.bindings || []).some(b => b.nodeId === nodeId && b.fieldKey === fieldKey)
}
```

不得修改 `onHighlightCf`、`toggleCollapseMode`、`isFieldHighlighted`、方案数据结构或任何请求逻辑。

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --test cdp-web/src/components/NormalMode.customFields.test.mjs cdp-web/src/components/NormalMode.status.test.mjs cdp-web/src/components/NormalMode.toolbar.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit the exact linkage change**

```powershell
git add cdp-web/src/components/NormalMode.vue cdp-web/src/components/NormalMode.customFields.test.mjs
git commit -m "fix: link solution parameters to exact fields"
```

---

### Task 3: Update visible shell and task copy without changing execution logic

**Files:**
- Modify: `cdp-web/src/App.vue`
- Modify: `cdp-web/src/components/TaskCenter.vue`
- Test: `cdp-web/src/App.navigation.test.mjs`
- Test: `cdp-web/src/components/TaskCenter.dmpParity.test.mjs`

**Interfaces:**
- Consumes: existing `runDatabank`, `runDmp`, `canRunDatabank`, `canRunDmp`, and `taskRunning` bindings unchanged.
- Produces: visible title `圈选工作台`, two idle action labels `运行`, and matching empty-state copy.

- [ ] **Step 1: Write failing copy contracts**

在 `App.navigation.test.mjs` 增加：

```js
test('shell title is concise without the CDP prefix', () => {
  assert.match(appVue, /class="display-feature-title">圈选工作台<\/div>/)
  assert.doesNotMatch(appVue, />CDP 圈选工作台</)
})
```

在 `TaskCenter.dmpParity.test.mjs` 增加：

```js
test('task center uses run copy for both idle actions without changing handlers', () => {
  assert.match(source, /@click="runDatabank">运行<\/el-button>/)
  assert.match(source, /@click="runDmp">运行<\/el-button>/)
  assert.match(source, /输入人群包名称并点击运行，任务进度将在此处实时展示。/)
  assert.doesNotMatch(source, /@click="run(?:Databank|Dmp)">测试<\/el-button>/)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test cdp-web/src/App.navigation.test.mjs cdp-web/src/components/TaskCenter.dmpParity.test.mjs
```

Expected: both new tests fail on the old visible strings.

- [ ] **Step 3: Change only visible template strings**

在 `App.vue` 中把：

```vue
<div class="display-feature-title">CDP 圈选工作台</div>
```

改为：

```vue
<div class="display-feature-title">圈选工作台</div>
```

在 `TaskCenter.vue` 中把两个空闲按钮的 `测试` 改为 `运行`，并把空状态改为：

```vue
<div class="tc-empty-desc">输入人群包名称并点击运行，任务进度将在此处实时展示。</div>
```

不得修改按钮属性、事件处理器、computed、函数体、状态名或注释以外的脚本。

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --test cdp-web/src/App.navigation.test.mjs cdp-web/src/components/TaskCenter.dmpParity.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Run complete frontend regression and production build**

Run:

```powershell
node --test "cdp-web/src/**/*.test.mjs"
npm run build
```

Run `npm run build` from `cdp-web`. Expected: 115 existing tests plus the new contracts all pass, and both `vue-tsc` and Vite complete successfully.

- [ ] **Step 6: Commit the copy change**

```powershell
git add cdp-web/src/App.vue cdp-web/src/components/TaskCenter.vue cdp-web/src/App.navigation.test.mjs cdp-web/src/components/TaskCenter.dmpParity.test.mjs
git commit -m "copy: simplify shell and task actions"
```

---

### Task 4: Browser QA and protected-scope audit

**Files:**
- Modify only if QA exposes a frontend regression covered by Tasks 1–3.
- Test: all affected focused tests plus the complete Node suite and production build.

**Interfaces:**
- Consumes: completed Tasks 1–3 and preview `http://localhost:5174/`.
- Produces: evidence that all 12 browser comments and the expanded all-dropdown rule are satisfied without functional regression.

- [ ] **Step 1: Audit the committed diff for protected scope**

Run:

```powershell
git diff --stat CDP_codex...HEAD
git diff --name-only CDP_codex...HEAD
git diff --check CDP_codex...HEAD
```

Expected: no backend, API, extension, dependency, build-config, route or permission file is modified; `git diff --check` exits 0.

- [ ] **Step 2: Verify representative dropdown families in browser**

At `1263×674`, `1538×674`, and `1440×900`, open representative Select, Select V2, Tree Select, Dropdown, Cascader, and Autocomplete controls across Workbench, Solution Center, and Task Center. Confirm trigger, tag, panel, default, hover, selected, disabled, empty and loading states use white surfaces; hover uses only an orange fine signal; no gray or orange blocks appear.

- [ ] **Step 3: Verify all reviewed controls and parameter behavior**

Confirm the three top navigation capsules are identical, the two Solution Center groups have no outer gray container, the JSON toolbar controls are all 32px high, title reads `圈选工作台`, and both Task Center idle actions read `运行`. In solution-use mode, click one parameter card and confirm only the top card, exact middle field and exact summary row highlight; the entire behavior card has no orange border; clicking the same parameter again clears the highlight.

- [ ] **Step 4: Check runtime health and final regression**

Confirm the page is non-empty, has no error overlay, no new console errors, no clipping and no layout jump. Re-run:

```powershell
node --test "cdp-web/src/**/*.test.mjs"
npm run build
```

Run `npm run build` from `cdp-web`. Expected: all tests and build pass.

- [ ] **Step 5: Commit any QA-only correction if needed**

If and only if QA required a correction, use a focused commit containing only the relevant frontend/test files:

```powershell
git add cdp-web/src/App.vue cdp-web/src/components/NormalMode.vue cdp-web/src/components/TaskCenter.vue cdp-web/src/styles/cdp-global.css cdp-web/src/App.navigation.test.mjs cdp-web/src/components/NormalMode.customFields.test.mjs cdp-web/src/components/TaskCenter.dmpParity.test.mjs cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git commit -m "fix: polish gallery white browser states"
```
