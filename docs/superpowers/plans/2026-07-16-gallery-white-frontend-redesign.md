# Gallery White Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CDP 所有可达前端页面重构为清新、简约、冷白的 Gallery White 视觉体系，同时保证现有业务逻辑与其他功能逐字节不受影响。

**Architecture:** 原位替换 `cdp-global.css` 末尾的旧暖色主题覆盖块，以语义 CSS 令牌作为唯一全局视觉来源；局部残留只在现有 Vue `<style scoped>` 中改写。禁止修改 `main.js`、Vue `<template>/<script>`、composables、utils、后端和浏览器扩展，并在每个任务提交前用 Git 基线校验受保护区域。

**Tech Stack:** Vue 3、Element Plus、CSS、Node.js `node:test`、Vite、PowerShell。

## Global Constraints

- 只允许修改前端 CSS、下列 Vue 文件的 `<style>` 区块，以及纯视觉测试文件。
- 禁止修改 `cdp-web/src/main.js`、任何 Vue `<template>/<script>`、composables、utils、API 调用、Python 后端、数据库、浏览器扩展和业务测试。
- 不增加依赖、字体服务、图片资源、主题切换或新业务状态。
- 页面画布只使用 `#ffffff` 与 `#f5f5f7`；主文字/主行动使用 `#1d1d1f`。
- Signal Orange 固定为 `#ff6b35`，仅用于焦点、选中、链接、小型指示器和灰阶图表重点序列。
- P1 语义色固定为：成功 `#34c759`、等待/警告 `#ffcc00`、错误 `#ff3b30`。
- 禁止暖黄/米白画布、棕色主文字、橙色装饰渐变、橙色阴影和大面积浅橙容器。
- 主要行动按钮保持黑底白字；危险操作才使用红色。
- 每个 `.vue` 文件提交前必须证明 `<style>` 之前的内容与当前 `HEAD` 一致。
- 每个任务只暂存该任务列出的文件，并在提交前运行对应测试和受保护区域校验。

## File Structure

- Modify: `cdp-web/src/styles/cdp-global.css` — 保留现有基础样式，原位替换末尾主题覆盖块并提供全局令牌、Element Plus 和跨页面视觉规则。
- Create: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs` — Gallery White 令牌、禁用视觉模式、页面局部样式和可访问性契约。
- Delete: `cdp-web/src/styles/cdp-global.apple-clean.test.mjs` — 删除只认可旧暖色主题的过期测试。
- Modify style only: `cdp-web/src/App.vue` — 认证检查页和账户区域。
- Modify style only: `cdp-web/src/components/LoginView.vue` — 登录页画布、排版、表单和状态。
- Modify style only: `cdp-web/src/components/DynamicForm.vue` — 工作台字段选择、粘贴面板和焦点。
- Modify style only: `cdp-web/src/components/CustomFieldEditDialog.vue` — 自定义字段编辑提示。
- Modify style only: `cdp-web/src/components/FolderTree.vue` — 方案文件夹树视觉状态。
- Modify style only: `cdp-web/src/components/FolderTreeNode.vue` — 嵌套文件夹节点视觉状态。
- Modify style only: `cdp-web/src/components/SolutionCenter.vue` — 方案选择、创建、节点高亮和骨架屏。
- Modify style only: `cdp-web/src/components/SolutionUseForm.vue` — 方案使用表单高亮。
- Modify style only: `cdp-web/src/components/TaskCenter.vue` — 任务画布、控件、阶段、表格和状态。

---

### Task 1: Establish the Gallery White theme contract and global layer

**Files:**
- Create: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`
- Delete: `cdp-web/src/styles/cdp-global.apple-clean.test.mjs`
- Modify: `cdp-web/src/styles/cdp-global.css:2526-3243`

**Interfaces:**
- Consumes: Existing project selectors and Element Plus classes already emitted by current templates.
- Produces: `--ui-*` CSS tokens and the single final `Gallery White visual refresh` override layer used by all later tasks.

- [ ] **Step 1: Replace the old theme test with a failing Gallery White contract**

Create `cdp-web/src/styles/cdp-global.gallery-white.test.mjs` with this complete content, then delete `cdp-global.apple-clean.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(currentDir, 'cdp-global.css'), 'utf8')
const marker = '/* Gallery White visual refresh'
const markerIndex = css.indexOf(marker)
const themeCss = markerIndex >= 0 ? css.slice(markerIndex) : ''

export function vueStyle(relativePath) {
  const source = readFileSync(join(currentDir, '..', relativePath), 'utf8')
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join('\n')
}

test('gallery white exposes the approved neutral, accent, and semantic tokens', () => {
  assert.ok(markerIndex >= 0, 'Gallery White theme marker must exist')
  assert.match(themeCss, /--ui-canvas:\s*#ffffff;/)
  assert.match(themeCss, /--ui-fill:\s*#f5f5f7;/)
  assert.match(themeCss, /--ui-ink:\s*#1d1d1f;/)
  assert.match(themeCss, /--ui-text-secondary:\s*#6e6e73;/)
  assert.match(themeCss, /--ui-text-tertiary:\s*#86868b;/)
  assert.match(themeCss, /--ui-control-border:\s*#d2d2d7;/)
  assert.match(themeCss, /--ui-divider:\s*#e8e8ed;/)
  assert.match(themeCss, /--ui-accent:\s*#ff6b35;/)
  assert.match(themeCss, /--ui-success:\s*#34c759;/)
  assert.match(themeCss, /--ui-warning:\s*#ffcc00;/)
  assert.match(themeCss, /--ui-danger:\s*#ff3b30;/)
})

test('gallery white removes warm environmental color and dirty decoration', () => {
  assert.doesNotMatch(themeCss, /#fffdf8|#fff8f2|#fff3ed|#211813|#5a372b|#2f261f/i)
  assert.doesNotMatch(themeCss, /linear-gradient\([^)]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.doesNotMatch(themeCss, /radial-gradient\([^)]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.doesNotMatch(themeCss, /box-shadow\s*:[^;]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
})

test('gallery white keeps surfaces neutral and primary actions black', () => {
  assert.match(themeCss, /\.cdp-engine-container\s*\{[\s\S]*background:\s*var\(--ui-canvas\)/)
  assert.match(themeCss, /\.cdp-engine-container::before,[\s\S]*\.cdp-engine-container::after\s*\{[\s\S]*display:\s*none/)
  assert.match(themeCss, /\.intercom-btn-primary,[\s\S]*background:\s*var\(--ui-ink\)/)
  assert.match(themeCss, /\.intercom-input \.el-input__wrapper\.is-focus[\s\S]*border-color:\s*var\(--ui-accent\)/)
})

test('gallery white retains accessible reduced-motion behavior', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/)
})
```

- [ ] **Step 2: Run the contract and confirm the old theme fails it**

Run:

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
```

Expected: FAIL because the Gallery White marker and `--ui-*` tokens do not yet exist.

- [ ] **Step 3: Replace the old warm theme block in place**

In `cdp-global.css`, preserve everything before the old `Apple Clean Pro visual refresh` marker and replace that marker through EOF with the following single theme layer. Do not append this after the old block.

```css
/* ============================================================ */
/* Gallery White visual refresh                                 */
/* ============================================================ */

:root {
  --ui-canvas: #ffffff;
  --ui-fill: #f5f5f7;
  --ui-surface: #ffffff;
  --ui-ink: #1d1d1f;
  --ui-text-secondary: #6e6e73;
  --ui-text-tertiary: #86868b;
  --ui-control-border: #d2d2d7;
  --ui-divider: #e8e8ed;
  --ui-accent: #ff6b35;
  --ui-accent-ring: rgba(255, 107, 53, 0.10);
  --ui-success: #34c759;
  --ui-warning: #ffcc00;
  --ui-danger: #ff3b30;
  --ui-radius-control: 8px;
  --ui-radius-card: 10px;
  --ui-radius-panel: 12px;
  --ui-shadow-float: 0 18px 50px rgba(0, 0, 0, 0.10);
  --ui-motion: 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

html,
body,
#app,
.cdp-engine-container {
  background: var(--ui-canvas) !important;
  color: var(--ui-ink);
}

.cdp-engine-container {
  position: relative;
  isolation: isolate;
}

.cdp-engine-container::before,
.cdp-engine-container::after {
  display: none !important;
  content: none !important;
}

.app-shell-header,
.app-shell-main {
  position: relative;
  z-index: 1;
}

.display-hero,
.display-section,
.display-sub,
.display-card-title,
.display-feature-title,
.display-body,
.tc-history-title,
.tc-results-title,
.tc-tags-title,
.tc-progress-name,
.solution-node-title,
.solution-card-title,
.solution-list-name,
.published-solution-name {
  color: var(--ui-ink) !important;
}

.display-body-light,
.app-shell-subnav-label,
.summary-label,
.toolbar-actions .el-button,
.drag-handle,
.collapse-arrow,
.tc-test-label,
.tc-tag-group-name,
.tc-done-meta,
.tc-fail-msg,
.tc-progress-msg,
.tc-results-total,
.tc-history-clear,
.tc-history-item-time,
.tc-history-meta-bar,
.tc-history-meta-bar i,
.tc-empty-desc,
.tc-empty-title,
.tc-results-table td,
.workbench-name-hint,
.published-solution-meta,
.solution-meta,
.solution-node-meta {
  color: var(--ui-text-secondary) !important;
}

.app-shell-header {
  background: rgba(255, 255, 255, 0.94) !important;
  border-bottom: 1px solid var(--ui-divider) !important;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02) !important;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.left-panel,
.right-panel,
.solution-sidebar,
.solution-settings,
#app .tc-control-panel {
  background: var(--ui-fill) !important;
  border-color: var(--ui-divider) !important;
  box-shadow: none !important;
}

.center-panel,
.solution-editor,
#app .tc-monitor-panel {
  background: var(--ui-canvas) !important;
}

.intercom-card,
.published-solution-item,
.solution-list-item,
.intercom-list-item,
.summary-node,
.json-preview,
.card-list-area,
.solution-use-card,
.solution-sidebar-panel,
.solution-editor-toolbar,
.solution-editor-empty,
.solution-settings-panel,
.cf-use-card,
#app .tc-tags-card,
#app .tc-progress-card,
#app .tc-results-card,
#app .tc-history-card {
  background: var(--ui-surface) !important;
  border: 1px solid var(--ui-divider) !important;
  border-radius: var(--ui-radius-panel) !important;
  box-shadow: none !important;
}

.intercom-card:hover,
.published-solution-item:hover,
.solution-list-item:hover,
.intercom-list-item:hover,
.solution-use-card:hover,
.cf-use-card:hover,
#app .tc-history-item:hover,
#app .tc-tag-item:hover:not(.disabled) {
  border-color: var(--ui-control-border) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.06) !important;
  transform: translateY(-1px);
}

.card-header-inner,
.solution-node-head,
.solution-use-card-head,
#app .tc-tags-head,
#app .tc-results-header,
#app .tc-history-results-head {
  background: var(--ui-surface) !important;
  border-color: var(--ui-divider) !important;
}

.el-button,
.btn-small,
.intercom-btn-warm,
.intercom-btn-outlined,
.intercom-btn-primary,
.intercom-btn-accent,
.workbench-toolbar-icon-btn.el-button,
.workbench-compact-action.el-button,
.solution-sidebar-icon-btn.el-button,
.solution-toolbar-icon-btn.el-button,
.solution-list-icon-btn.el-button,
.behavior-card-icon-btn.el-button,
#app .tc-btn-sm,
#app .tc-retry-btn,
#app .tc-btn-copy,
#app .tc-btn-csv {
  border-radius: var(--ui-radius-control) !important;
  transition: transform var(--ui-motion), box-shadow var(--ui-motion),
    background var(--ui-motion), border-color var(--ui-motion), color var(--ui-motion) !important;
}

.intercom-btn-primary,
.intercom-btn-accent,
#app .tc-btn-sm:not(:disabled):not(.is-disabled):not(.is-cancel) {
  color: #ffffff !important;
  background: var(--ui-ink) !important;
  border-color: var(--ui-ink) !important;
  box-shadow: none !important;
}

.intercom-btn-primary:hover,
.intercom-btn-accent:hover,
#app .tc-btn-sm:hover:not(:disabled):not(.is-disabled):not(.is-cancel) {
  background: #2c2c2e !important;
  border-color: #2c2c2e !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12) !important;
}

.intercom-btn-outlined,
.workbench-toolbar-icon-btn.el-button,
.workbench-compact-action.el-button,
.solution-sidebar-icon-btn.el-button,
.solution-toolbar-icon-btn.el-button,
.solution-list-icon-btn.el-button,
.behavior-card-icon-btn.el-button,
#app .tc-btn-copy,
#app .tc-btn-csv {
  color: var(--ui-ink) !important;
  background: var(--ui-surface) !important;
  border: 1px solid var(--ui-control-border) !important;
  box-shadow: none !important;
}

.intercom-btn-outlined:hover,
.workbench-toolbar-icon-btn.el-button:hover:not(.is-disabled),
.workbench-compact-action.el-button:hover:not(.is-disabled),
.solution-sidebar-icon-btn.el-button:hover:not(.is-disabled),
.solution-toolbar-icon-btn.el-button:hover:not(.is-disabled),
.solution-list-icon-btn.el-button:hover:not(.is-disabled),
.behavior-card-icon-btn.el-button:hover:not(.is-disabled),
#app .tc-btn-copy:hover,
#app .tc-btn-csv:hover {
  color: var(--ui-accent) !important;
  background: var(--ui-surface) !important;
  border-color: var(--ui-accent) !important;
  box-shadow: none !important;
}

.intercom-radio-group .el-radio-button__inner {
  color: var(--ui-text-secondary) !important;
  background: var(--ui-fill) !important;
  border-color: transparent !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}

.intercom-radio-group .el-radio-button__original-radio:checked + .el-radio-button__inner {
  color: #ffffff !important;
  background: var(--ui-ink) !important;
  border-color: var(--ui-ink) !important;
  box-shadow: none !important;
}

.intercom-input .el-input__wrapper,
.intercom-input .el-select-v2__wrapper,
.intercom-input .el-textarea__inner,
.select-auto-height .el-select__wrapper,
.select-auto-height .el-select-v2__wrapper,
#app .tc-input-sm .el-input__wrapper,
#app .tc-tags-search-input {
  color: var(--ui-ink) !important;
  background: var(--ui-surface) !important;
  border: 1px solid var(--ui-control-border) !important;
  border-radius: var(--ui-radius-control) !important;
  box-shadow: none !important;
}

.intercom-input .el-input__wrapper.is-focus,
.intercom-input .el-select-v2__wrapper.is-focused,
.intercom-input .el-textarea__inner:focus,
#app .tc-input-sm .el-input__wrapper.is-focus,
#app .tc-tags-search-input:focus {
  border-color: var(--ui-accent) !important;
  box-shadow: 0 0 0 3px var(--ui-accent-ring) !important;
}

.published-solution-item.active,
.solution-list-item.active,
.cf-use-card-active,
#app .tc-history-item.expanded,
#app .tc-tag-item.checked {
  color: var(--ui-ink) !important;
  background: var(--ui-surface) !important;
  border-color: var(--ui-accent) !important;
  box-shadow: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .intercom-card,
  .published-solution-item,
  .solution-list-item,
  .intercom-list-item,
  .solution-use-card,
  .cf-use-card,
  .el-button {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Run the theme contract and production build**

Run:

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
npm run build
```

Expected: theme tests PASS; Vue type-check and Vite production build exit 0.

- [ ] **Step 5: Audit task scope and commit**

Run:

```powershell
git diff --check
git status --short
```

Expected changed paths: only the global CSS file, the new Gallery White test, and deletion of the old Apple Clean test.

Commit:

```powershell
git add cdp-web/src/styles/cdp-global.css cdp-web/src/styles/cdp-global.gallery-white.test.mjs cdp-web/src/styles/cdp-global.apple-clean.test.mjs
git commit -m "style: establish gallery white theme"
```

---

### Task 2: Refresh the application shell and login page without touching logic

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`
- Modify style only: `cdp-web/src/App.vue:134-205`
- Modify style only: `cdp-web/src/components/LoginView.vue:131-482`

**Interfaces:**
- Consumes: `--ui-*` tokens from Task 1 and existing login/auth template classes.
- Produces: Neutral authentication shell, white/gray login composition, black submit action, orange focus signal, and semantic error/success states.

- [ ] **Step 1: Add failing shell and login style assertions**

Append to the Gallery White test:

```js
test('app shell and login use neutral surfaces with signal orange only', () => {
  const appStyle = vueStyle('App.vue')
  const loginStyle = vueStyle('components/LoginView.vue')
  const forbidden = /#f5f3ee|#f3f0e9|#f8f6f1|#ece8df|#171715|#77736c|#9a968f|#67635d|#8f8b84|#9b978f|#ff6b4a|rgba\(255,\s*107,\s*74/i

  assert.doesNotMatch(appStyle, forbidden)
  assert.doesNotMatch(loginStyle, forbidden)
  assert.match(appStyle, /\.auth-checking-screen\s*\{[\s\S]*background:\s*var\(--ui-fill\)/)
  assert.match(loginStyle, /\.login-shell\s*\{[\s\S]*background:\s*var\(--ui-canvas\)/)
  assert.match(loginStyle, /\.login-atmosphere\s*\{[\s\S]*display:\s*none/)
  assert.match(loginStyle, /\.login-entry\s*\{[\s\S]*background:\s*var\(--ui-fill\)/)
  assert.match(loginStyle, /\.login-field input:focus\s*\{[\s\S]*var\(--ui-accent-ring\)/)
  assert.match(loginStyle, /\.login-submit\s*\{[\s\S]*background:\s*var\(--ui-ink\)/)
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run `node --test src/styles/cdp-global.gallery-white.test.mjs` from `cdp-web`.

Expected: FAIL on the current warm App/Login style values.

- [ ] **Step 3: Replace only App.vue style declarations**

Keep the existing selectors and layout declarations, but make these exact visual substitutions:

```css
.auth-checking-screen { background: var(--ui-fill); }
.auth-checking-mark i { background: var(--ui-ink); }
.auth-checking-mark i:nth-child(2) { background: var(--ui-accent); }
.app-shell-account { border-left-color: var(--ui-divider); }
.app-shell-avatar { background: var(--ui-ink); }
.app-shell-user { color: var(--ui-text-secondary); }
.app-shell-logout { color: var(--ui-text-tertiary); }
.app-shell-logout:hover { color: var(--ui-accent); }
```

Do not edit any line before `<style scoped>`.

- [ ] **Step 4: Replace only LoginView.vue style declarations**

Retain the current grid, responsive breakpoints, and animations, while applying these exact rules inside the existing style block:

```css
.login-shell {
  --login-ink: var(--ui-ink);
  --login-muted: var(--ui-text-secondary);
  --login-paper: var(--ui-fill);
  --login-accent: var(--ui-accent);
  color: var(--login-ink);
  background: var(--ui-canvas);
  font-family: "SF Pro Display", "SF Pro Text", "PingFang SC",
    "Segoe UI Variable", "Microsoft YaHei", sans-serif;
}

.login-shell::after,
.login-atmosphere {
  display: none;
}

.login-story { border-right-color: var(--ui-divider); }
.login-intro { color: var(--ui-text-secondary); }
.login-story-foot { color: var(--ui-text-tertiary); }
.login-story-line { background: var(--ui-divider); }

.login-entry {
  background: var(--ui-fill);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.login-field > span,
.login-password-toggle,
.login-assurance { color: var(--ui-text-secondary); }

.login-field input {
  height: 48px;
  padding: 0 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: var(--ui-radius-control);
}

.login-field input::placeholder { color: var(--ui-text-tertiary); }
.login-field input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.login-error { color: var(--ui-danger); }
.login-error span { border-color: rgba(255, 59, 48, 0.32); }

.login-submit {
  color: #ffffff;
  background: var(--ui-ink);
  border-radius: 999px;
  box-shadow: none;
}

.login-submit:hover:not(:disabled) {
  background: #2c2c2e;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.login-submit-arrow { color: var(--ui-accent); }
.login-assurance-dot {
  background: var(--ui-success);
  box-shadow: none;
}

@media (max-width: 900px) {
  .login-story { border-bottom-color: var(--ui-divider); }
}
```

Remove superseded warm background, noise texture, orbit/node halo, warm text and warm shadow declarations rather than leaving dead declarations earlier in the same selector.

- [ ] **Step 5: Prove protected Vue regions are unchanged**

Run from the repository root:

```powershell
node -e "const cp=require('node:child_process');const fs=require('node:fs');const files=['cdp-web/src/App.vue','cdp-web/src/components/LoginView.vue'];for(const f of files){const before=cp.execFileSync('git',['show','HEAD:'+f],{encoding:'utf8'});const now=fs.readFileSync(f,'utf8');const cut=s=>s.slice(0,s.search(/<style(?:\s|>)/));if(cut(before)!==cut(now)){console.error('Protected Vue region changed: '+f);process.exitCode=1}}"
```

Expected: exit 0 with no output.

- [ ] **Step 6: Run tests, build, and commit**

Run:

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
npm run build
Set-Location ..
git diff --check
```

Expected: all commands exit 0.

Commit:

```powershell
git add cdp-web/src/App.vue cdp-web/src/components/LoginView.vue cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git commit -m "style: refresh shell and login surfaces"
```

---

### Task 3: Clean workbench supporting controls and folder trees

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`
- Modify style only: `cdp-web/src/components/DynamicForm.vue:408-660`
- Modify style only: `cdp-web/src/components/CustomFieldEditDialog.vue:217-266`
- Modify style only: `cdp-web/src/components/FolderTree.vue:269-377`
- Modify style only: `cdp-web/src/components/FolderTreeNode.vue:113-159`

**Interfaces:**
- Consumes: Theme tokens from Task 1 and existing field/folder state classes.
- Produces: Orange outline-only selection, black confirmation actions, and neutral folder hover/drag states.

- [ ] **Step 1: Add failing workbench style assertions**

Append:

```js
test('workbench supporting styles use tokens without warm fills or colored shadows', () => {
  const files = [
    'components/DynamicForm.vue',
    'components/CustomFieldEditDialog.vue',
    'components/FolderTree.vue',
    'components/FolderTreeNode.vue',
  ]
  const styles = files.map(vueStyle).join('\n')

  assert.doesNotMatch(styles, /#ff6b4a|#f05a3a|rgba\(255,\s*107,\s*74/i)
  assert.doesNotMatch(styles, /box-shadow\s*:[^;]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.match(vueStyle('components/DynamicForm.vue'), /\.field-selected\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
  assert.match(vueStyle('components/FolderTree.vue'), /\.folder-tree-row\.active\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run `node --test src/styles/cdp-global.gallery-white.test.mjs` from `cdp-web`.

Expected: FAIL because the four scoped style blocks still contain old coral fills and shadows.

- [ ] **Step 3: Convert DynamicForm visual states**

Use these exact declarations while preserving all non-color layout rules:

```css
.field-highlighted,
.field-selected {
  border-color: var(--ui-accent) !important;
  background: var(--ui-surface) !important;
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.field-selectable:hover {
  border-color: var(--ui-control-border);
  background: var(--ui-fill);
}

.field-selected::after { background: var(--ui-accent); }
.paste-trigger.open { color: var(--ui-accent); }
.paste-textarea:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}
.paste-btn.confirm {
  color: #ffffff;
  background: var(--ui-ink);
  box-shadow: none;
}
.paste-btn.confirm:hover {
  background: #2c2c2e;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
}
```

- [ ] **Step 4: Convert custom-field and folder-tree signals**

Apply these exact state rules in their existing scoped style blocks:

```css
/* CustomFieldEditDialog.vue */
.cf-bound-value { color: var(--ui-accent); }

/* FolderTree.vue and FolderTreeNode.vue */
.folder-tree-node.drag-over {
  background: var(--ui-fill);
  outline: 1px solid var(--ui-accent);
}
.folder-tree-row.active {
  color: var(--ui-accent);
  background: var(--ui-surface);
  box-shadow: inset 2px 0 0 var(--ui-accent);
}
.folder-tree-row:hover:not(.active) { background: var(--ui-fill); }
.folder-tree-add.el-button,
.folder-drop-hint { color: var(--ui-accent) !important; }
.folder-context-menu { border-color: var(--ui-divider); }
.context-menu-item.danger { color: var(--ui-danger); }
.context-menu-item.danger:hover { background: rgba(255, 59, 48, 0.06); }
```

Use the existing selector names at each current coral declaration; do not add classes to templates.

- [ ] **Step 5: Prove all four Vue protected regions are unchanged**

Run:

```powershell
node -e "const cp=require('node:child_process');const fs=require('node:fs');const files=['cdp-web/src/components/DynamicForm.vue','cdp-web/src/components/CustomFieldEditDialog.vue','cdp-web/src/components/FolderTree.vue','cdp-web/src/components/FolderTreeNode.vue'];for(const f of files){const before=cp.execFileSync('git',['show','HEAD:'+f],{encoding:'utf8'});const now=fs.readFileSync(f,'utf8');const cut=s=>s.slice(0,s.search(/<style(?:\s|>)/));if(cut(before)!==cut(now)){console.error('Protected Vue region changed: '+f);process.exitCode=1}}"
```

Expected: exit 0 with no output.

- [ ] **Step 6: Run tests and commit**

Run the Gallery White test, all existing component tests, and `npm run build`; expect exit 0.

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
$tests = (Get-ChildItem src/components -Recurse -Filter *.test.mjs).FullName
node --test $tests
npm run build
Set-Location ..
git diff --check
```

Commit:

```powershell
git add cdp-web/src/components/DynamicForm.vue cdp-web/src/components/CustomFieldEditDialog.vue cdp-web/src/components/FolderTree.vue cdp-web/src/components/FolderTreeNode.vue cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git commit -m "style: clean workbench supporting controls"
```

---

### Task 4: Clean solution center selection and editing surfaces

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`
- Modify style only: `cdp-web/src/components/SolutionCenter.vue:1471-1629`
- Modify style only: `cdp-web/src/components/SolutionUseForm.vue:294-300`

**Interfaces:**
- Consumes: Theme tokens and existing solution/custom-field state classes.
- Produces: White solution surfaces, orange outline-only focus/drag states, and neutral skeleton animation.

- [ ] **Step 1: Add failing solution style assertions**

Append:

```js
test('solution center keeps active, creating, drag, and highlight states clean', () => {
  const solutionStyle = vueStyle('components/SolutionCenter.vue')
  const useStyle = vueStyle('components/SolutionUseForm.vue')
  const styles = solutionStyle + useStyle

  assert.doesNotMatch(styles, /#ff6b4a|rgba\(255,\s*107,\s*74/i)
  assert.match(solutionStyle, /\.custom-field-item\.active\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
  assert.match(solutionStyle, /\.creating-custom-field-panel\s*\{[\s\S]*background:\s*var\(--ui-fill\)/)
  assert.match(solutionStyle, /\.skeleton-bar\s*\{[\s\S]*background:\s*linear-gradient\([^;]*(#f5f5f7|var\(--ui-fill\))/)
  assert.match(useStyle, /\.use-card-highlighted\s*\{[\s\S]*var\(--ui-accent-ring\)/)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run `node --test src/styles/cdp-global.gallery-white.test.mjs` from `cdp-web`.

Expected: FAIL on the current soft orange backgrounds and old accent values.

- [ ] **Step 3: Replace solution scoped color states**

Use these exact rules with the existing selectors:

```css
.custom-field-item:hover {
  border-color: var(--ui-control-border);
  background: var(--ui-fill);
}

.custom-field-item.active,
.custom-field-item.drag-over {
  border-color: var(--ui-accent);
  background: var(--ui-surface);
  box-shadow: none;
}

.creating-custom-field-panel {
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
}

.creating-step.active,
.creating-panel-title { color: var(--ui-accent); }
.creating-binding-remove.el-button { color: var(--ui-danger) !important; }

.node-highlighted,
.use-card-highlighted {
  border-color: var(--ui-accent) !important;
  background: var(--ui-surface) !important;
  box-shadow: 0 0 0 3px var(--ui-accent-ring) !important;
}

.node-skeleton,
.skeleton-bar {
  background: linear-gradient(
    90deg,
    var(--ui-fill) 25%,
    #ececef 50%,
    var(--ui-fill) 75%
  );
  background-size: 200% 100%;
}
```

Do not alter draft/publish actions, data loading, list filtering, drag handlers, or form state.

- [ ] **Step 4: Prove both Vue protected regions are unchanged**

Run:

```powershell
node -e "const cp=require('node:child_process');const fs=require('node:fs');const files=['cdp-web/src/components/SolutionCenter.vue','cdp-web/src/components/SolutionUseForm.vue'];for(const f of files){const before=cp.execFileSync('git',['show','HEAD:'+f],{encoding:'utf8'});const now=fs.readFileSync(f,'utf8');const cut=s=>s.slice(0,s.search(/<style(?:\s|>)/));if(cut(before)!==cut(now)){console.error('Protected Vue region changed: '+f);process.exitCode=1}}"
```

Expected: exit 0 with no output.

- [ ] **Step 5: Run solution regressions, build, and commit**

Run:

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
$tests = (Get-ChildItem src/components -Filter 'Solution*.test.mjs').FullName
node --test $tests
npm run build
Set-Location ..
git diff --check
```

Expected: all commands exit 0.

Commit:

```powershell
git add cdp-web/src/components/SolutionCenter.vue cdp-web/src/components/SolutionUseForm.vue cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git commit -m "style: clean solution center surfaces"
```

---

### Task 5: Clean task center monitoring without changing task behavior

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`
- Modify style only: `cdp-web/src/components/TaskCenter.vue:696-975`

**Interfaces:**
- Consumes: Existing task state classes (`current`, `done`, `completed`, `failed`, `running`, `checked`) and global P1 tokens.
- Produces: Neutral task canvas/cards/table, black actions, orange current-state signal, and green/yellow/red semantic status dots.

- [ ] **Step 1: Add failing task-center style assertions**

Append:

```js
test('task center uses neutral surfaces, signal orange, and P1 status colors', () => {
  const taskStyle = vueStyle('components/TaskCenter.vue')

  assert.doesNotMatch(taskStyle, /#f8f7f5|#f2f1ee|#ff6b4a|#e55a3e|#ff7b5e|rgba\(255\s*,?\s*107\s*,?\s*74/i)
  assert.doesNotMatch(taskStyle, /(?:linear|radial)-gradient\([^)]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.match(taskStyle, /\.task-center-page\s*\{[\s\S]*background:\s*var\(--ui-canvas\)/)
  assert.match(taskStyle, /\.tc-btn-sm\.is-dmp\s*\{[\s\S]*background:\s*var\(--ui-ink\)/)
  assert.match(taskStyle, /\.tc-tag-item\.checked\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
  assert.match(taskStyle, /\.tc-phase-step\.current \.tc-phase-dot\s*\{[\s\S]*border-color:\s*var\(--ui-accent\)/)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run `node --test src/styles/cdp-global.gallery-white.test.mjs` from `cdp-web`.

Expected: FAIL because TaskCenter still uses warm gradients, coral controls and soft orange fills.

- [ ] **Step 3: Replace TaskCenter environmental and action styling**

Use these exact replacements while preserving sizing, flex/grid layout, overflow and transitions:

```css
.task-center-page { background: var(--ui-canvas); }
.tc-control-panel { background: var(--ui-fill); border-color: var(--ui-divider); }
.tc-monitor-panel { background: var(--ui-canvas); }
.tc-test-col { background: var(--ui-surface); border-color: var(--ui-divider); }
.tc-test-col:focus-within { border-color: var(--ui-accent); }

.tc-input-sm :deep(.el-input__wrapper.is-focus) {
  background: var(--ui-surface);
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring) !important;
}

.tc-btn-sm.is-dmp,
.tc-btn-sm.is-dmp:hover:not(:disabled) {
  color: #ffffff !important;
  background: var(--ui-ink) !important;
  border-color: var(--ui-ink) !important;
  box-shadow: none !important;
}

.tc-settings-btn:hover:not(:disabled),
.tc-settings-all,
.tc-tags-count,
.tc-results-count,
.tc-history-results-rows { color: var(--ui-accent); }

.tc-settings-option:hover { background: var(--ui-fill); }
.tc-settings-option input { accent-color: var(--ui-accent); }
.tc-tags-head,
.tc-results-header { background: var(--ui-surface); border-color: var(--ui-divider); }
```

- [ ] **Step 4: Replace TaskCenter selection, progress and status styling**

Apply:

```css
.tc-tags-search-input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.tc-tag-item:hover:not(.disabled) {
  border-color: var(--ui-control-border);
  background: var(--ui-fill);
}

.tc-tag-item.checked,
.tc-tag-item.needCond.ready.checked {
  border-color: var(--ui-accent);
  background: var(--ui-surface);
}

.tc-tag-item.checked .tc-tag-check {
  color: #ffffff;
  background: var(--ui-accent);
  border-color: var(--ui-accent);
}

.tc-phase-step.current .tc-phase-dot {
  color: var(--ui-accent);
  background: var(--ui-surface);
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.tc-progress-fill { background: var(--ui-ink); }
.tc-btn-csv {
  color: var(--ui-ink) !important;
  background: var(--ui-surface) !important;
  border-color: var(--ui-control-border) !important;
}

.tc-history-status-dot.completed { background: var(--ui-success); }
.tc-history-status-dot.running { background: var(--ui-warning); }
.tc-history-status-dot.failed { background: var(--ui-danger); }
```

Change `phasePulse` to animate only neutral-opacity orange rings using `var(--ui-accent-ring)`; do not animate colored card backgrounds.

- [ ] **Step 5: Prove TaskCenter template and script are unchanged**

Run:

```powershell
node -e "const cp=require('node:child_process');const fs=require('node:fs');const f='cdp-web/src/components/TaskCenter.vue';const before=cp.execFileSync('git',['show','HEAD:'+f],{encoding:'utf8'});const now=fs.readFileSync(f,'utf8');const cut=s=>s.slice(0,s.search(/<style(?:\s|>)/));if(cut(before)!==cut(now)){console.error('Protected Vue region changed: '+f);process.exit(1)}"
```

Expected: exit 0 with no output.

- [ ] **Step 6: Run task regressions, build, and commit**

Run:

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
node --test src/components/TaskCenter.dmpParity.test.mjs
npm run build
Set-Location ..
git diff --check
```

Expected: all commands exit 0.

Commit:

```powershell
git add cdp-web/src/components/TaskCenter.vue cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git commit -m "style: clean task center monitoring"
```

---

### Task 6: Run full regression, visual QA, and the frontend-only audit

**Files:**
- Verify only; modify only the allowed visual files if QA exposes a visual defect.

**Interfaces:**
- Consumes: All preceding visual tasks.
- Produces: Evidence that the redesign is visually coherent, buildable, regression-safe and limited to the approved presentation layer.

- [ ] **Step 1: Run every frontend Node test**

Run:

```powershell
Set-Location cdp-web
$tests = (Get-ChildItem src -Recurse -Filter *.test.mjs).FullName
node --test $tests
```

Expected: exit 0 with zero failed tests.

- [ ] **Step 2: Run the production type-check and build**

Run:

```powershell
npm run build
Set-Location ..
```

Expected: `vue-tsc --build` and the Vite production build both exit 0.

- [ ] **Step 3: Run the dirty-color source scan**

Run:

```powershell
$theme = [System.IO.File]::ReadAllText((Resolve-Path 'cdp-web/src/styles/cdp-global.css'))
$theme = $theme.Substring($theme.IndexOf('/* Gallery White visual refresh'))
$forbidden = '#fffdf8|#fff8f2|#fff3ed|#211813|#5a372b|#2f261f|(?:linear|radial)-gradient[^;]*(?:#ff6b35|255\s*,\s*107\s*,\s*53)|box-shadow[^;]*(?:#ff6b35|255\s*,\s*107\s*,\s*53)'
if ($theme -match $forbidden) { throw 'Dirty-color pattern remains in Gallery White theme' }
```

Expected: exit 0 with no output.

- [ ] **Step 4: Start the existing development stack without changing configuration**

Run from the repository root:

```powershell
.\start-dev.ps1 -NoBrowser
```

Expected: backend health is available and the existing Vite frontend is served at `http://127.0.0.1:5173/`. Reuse existing development services if the script reports they are already running.

- [ ] **Step 5: Complete browser visual QA**

Using the in-app Browser, inspect `http://127.0.0.1:5173/` at 1920×1080, 1440×900 and 1366×768. Use an existing development account; do not create users or change credentials.

Verify each of these states:

- Login: default, keyboard focus, error, loading and responsive layout.
- App shell: authentication check, navigation selection, account area and offline banner.
- Workbench: default, selected field/node, focused input, dialog, drawer, empty/loading state, batch mode and JSON preview.
- Solution center: list selection, folder tree, editor, custom field creation, draft/published states, skeleton and empty state.
- Task center: disabled controls, running, current phase, success, waiting, failure, results table and history.
- Shared overlays: Element Plus select dropdown, message, modal and drawer.

Acceptance: white/cold-gray surfaces remain visually neutral; orange never appears as a background atmosphere, gradient or shadow; primary actions are black; P1 status colors appear only with matching text/icon meaning.

- [ ] **Step 6: Audit the complete branch for forbidden file changes**

Run:

```powershell
$allowed = @(
  '^docs/superpowers/(specs|plans)/',
  '^cdp-web/src/styles/cdp-global\.css$',
  '^cdp-web/src/styles/cdp-global\.gallery-white\.test\.mjs$',
  '^cdp-web/src/styles/cdp-global\.apple-clean\.test\.mjs$',
  '^cdp-web/src/App\.vue$',
  '^cdp-web/src/components/(LoginView|DynamicForm|CustomFieldEditDialog|FolderTree|FolderTreeNode|SolutionCenter|SolutionUseForm|TaskCenter)\.vue$'
)
$changed = git diff --name-only origin/CDP_codex...HEAD
$forbidden = @($changed | Where-Object {
  $path = $_
  -not ($allowed | Where-Object { $path -match $_ })
})
if ($forbidden.Count -gt 0) { throw ('Forbidden changed paths: ' + ($forbidden -join ', ')) }
```

Expected: exit 0. Any JavaScript application file, Vue protected region, composable, utility, backend, database or extension change is a hard stop.

- [ ] **Step 7: Review final diff and commit only visual QA corrections**

Run:

```powershell
git diff --check
git status --short
git log --oneline -6
```

Expected: no unstaged implementation changes after QA. If a visual correction was required, repeat its focused test, protected-region check and build before committing it with:

```powershell
git add -- cdp-web/src/styles/cdp-global.css cdp-web/src/styles/cdp-global.gallery-white.test.mjs cdp-web/src/App.vue cdp-web/src/components/LoginView.vue cdp-web/src/components/DynamicForm.vue cdp-web/src/components/CustomFieldEditDialog.vue cdp-web/src/components/FolderTree.vue cdp-web/src/components/FolderTreeNode.vue cdp-web/src/components/SolutionCenter.vue cdp-web/src/components/SolutionUseForm.vue cdp-web/src/components/TaskCenter.vue
git commit -m "style: polish gallery white visual states"
```

Do not create an empty final commit when QA requires no correction.
