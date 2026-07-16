# Gallery White Density and Manual Crowd Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every task follows RED, GREEN, focused verification, review, then commit.

**Goal:** Finish the approved Gallery White A cleanup: reduce visual density, remove gray control surfaces, center capsule/button labels, simplify explanatory copy, add the custom-field hover badge, and make crowd naming manual without changing backend contracts.

**Architecture:** Keep all presentation changes in Vue templates and the final Gallery White override layer in `cdp-global.css`. Limit behavior changes to `NormalMode.vue` crowd-name state: the UI remains empty until manually entered or restored from a saved default, while execution/JSON still use `未命名人群包` as an internal fallback. Do not modify backend, APIs, routing, persistence schemas, or task execution handlers.

**Tech Stack:** Vue 3, Element Plus, CSS, Node.js `node:test`, Vite, `vue-tsc`.

## Global constraints

- Frontend files only: `cdp-web/src/**` plus frontend contract tests and these implementation notes.
- Preserve the three-column layout, component add behavior, solution save/load semantics, undo/redo, task execution, request payload shapes, and all backend interfaces.
- White is the default, hover, selected, disabled, and dropdown surface. Orange is only a small accent; gray fills are forbidden.
- Each task starts by changing/adding a contract test and observing the expected failure.

---

### Task 1: Make crowd naming manual with a safe execution fallback

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`
- Modify: `cdp-web/src/components/NormalMode.status.test.mjs`

**Interfaces:**
- UI state: `crowdNameInput` starts and clears to `''`.
- Saved solution load: restore only a non-empty `record.defaultCrowdName`; never derive from solution name.
- Runtime payload/JSON: use `crowdNameInput.trim() || DEFAULT_CROWD_NAME` without writing the fallback into the input.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions that require an empty initial value, empty clear/restore fallbacks, no `nameAuto` state/template marker, no `generateCrowdName`, and no watcher call to it. Require `loadSolution` to consume only `defaultCrowdName`. Require runtime JSON to retain the `DEFAULT_CROWD_NAME` fallback.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test src/components/NormalMode.status.test.mjs`

Expected: FAIL because auto-name state/generation and the old initialization still exist.

- [ ] **Step 3: Implement the minimum state change**

In `NormalMode.vue`:

```js
const crowdNameInput = ref('')
```

Remove `nameAuto`, its tooltip/label, its snapshot field, `generateCrowdName`, watcher invocation, and add-node re-enable logic. Make clear and missing snapshot values restore `''`. Keep `onNameManualEdit()` only for `markDerivedParamChange()`. Load `record.defaultCrowdName` only when non-empty. Keep `DEFAULT_CROWD_NAME` solely in generated JSON/execution fallbacks; do not mutate the input when applying it. Keep `DEFAULT_DRAFT_NAME` behavior unchanged.

- [ ] **Step 4: Run focused verification and commit**

Run: `node --test src/components/NormalMode.status.test.mjs src/components/NormalMode.toolbar.test.mjs`

Commit: `feat: make workbench crowd naming manual`

---

### Task 2: Simplify the Workbench library and remove redundant explanations

**Files:**
- Modify: `cdp-web/src/App.vue`
- Modify: `cdp-web/src/components/NormalMode.vue`
- Modify: `cdp-web/src/styles/cdp-global.css`
- Modify: `cdp-web/src/App.navigation.test.mjs`
- Modify: `cdp-web/src/components/NormalMode.leftPanel.test.mjs`
- Modify: `cdp-web/src/components/NormalMode.toolbar.test.mjs`
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`

- [ ] **Step 1: Write failing copy and CSS contracts**

Require the app header and Workbench to omit `可视化搭建、方案管理与任务调度`, `自由搭建时可继续增删节点`, and `自由搭建当前画布，并可直接存为方案草稿`. Add effective-rule assertions for a borderless transparent `.workbench-package-section`, a compact 32px search control, and single-column borderless component rows with white default/hover surfaces.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test src/App.navigation.test.mjs src/components/NormalMode.leftPanel.test.mjs src/components/NormalMode.toolbar.test.mjs src/styles/cdp-global.gallery-white.test.mjs`

- [ ] **Step 3: Remove copy and add final Gallery White overrides**

Delete only the three explanatory text nodes. At the end of `cdp-global.css`, remove the inner library card border/radius/shadow/fill, retain the column divider, set search height to 32px, and render component entries as compact white rows without outer borders. Use orange only for the add affordance or a 2px hover rail; never introduce a gray hover fill.

- [ ] **Step 4: Verify and commit**

Run the same focused test command.

Commit: `style: simplify gallery white workbench library`

---

### Task 3: Refine Solution Center copy and custom-field disclosure

**Files:**
- Modify: `cdp-web/src/components/SolutionCenter.vue`
- Modify: `cdp-web/src/styles/cdp-global.css`
- Modify: `cdp-web/src/components/SolutionCenter.listActions.test.mjs`
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`

- [ ] **Step 1: Write failing template and style contracts**

Require removal of `草稿编辑、发布与工作台预览` and `创建字段，让一个字段控制多个组件`. Require visible title `自定义字段`, button copy `+ 新增自定义字段`, and a focusable/hoverable `一对多` badge element. Assert the badge is positioned in the upper-right, hidden by default, and shown on card hover/focus-within.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test src/components/SolutionCenter.listActions.test.mjs src/styles/cdp-global.gallery-white.test.mjs`

- [ ] **Step 3: Implement the disclosure**

Change the title text and add an `aria-hidden="true"` micro-badge inside the settings card header. Remove the helper copy. Add final CSS that uses a black badge with white text and reveals it via `.solution-settings-card:hover` and `.solution-settings-card:focus-within`; do not add JavaScript state.

- [ ] **Step 4: Verify and commit**

Run the same focused command.

Commit: `style: refine solution center field controls`

---

### Task 4: Center all capsules and remove Task Center gray button fills

**Files:**
- Modify: `cdp-web/src/components/TaskCenter.vue`
- Modify: `cdp-web/src/styles/cdp-global.css`
- Modify: `cdp-web/src/components/TaskCenter.dmpParity.test.mjs`
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`

- [ ] **Step 1: Write failing effective-style contracts**

Require top navigation, solution switches/filters, and Task Center buttons to use `display: inline-flex`, `align-items: center`, `justify-content: center`, and `line-height: 1`. Require every Task Center disabled button class and Element Plus disabled button to retain a white background, neutral border/text, no gray fill, and centered labels.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test src/components/TaskCenter.dmpParity.test.mjs src/styles/cdp-global.gallery-white.test.mjs`

- [ ] **Step 3: Add scoped, final overrides**

Normalize all `.task-center-page button` and `.task-center-page .el-button` layouts. Override disabled states at sufficient specificity with `var(--ui-surface)` and neutral border/text tokens. Normalize the three top navigation capsules and Solution Center radio capsules without changing click handlers or active-state meaning.

- [ ] **Step 4: Verify and commit**

Run the same focused command.

Commit: `style: center controls and whiten disabled buttons`

---

### Task 5: Full regression and browser QA

**Files:**
- Modify only files needed to correct regressions discovered by verification.

- [ ] **Step 1: Run the complete frontend test suite**

From `cdp-web` run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Build production frontend**

Run: `npm run build`

Expected: `vue-tsc` and Vite complete successfully.

- [ ] **Step 3: Inspect the changed-file boundary**

Run: `git diff --name-only 305fcd2...HEAD`

Confirm no backend/API/schema/config file was changed by this iteration.

- [ ] **Step 4: Browser QA at `http://localhost:5174/`**

Check Workbench, Solution Center, and Task Center at desktop width. Verify: no gray menu/button surfaces; compact borderless library; removed explanations; manual-empty crowd name with safe execution; centered capsule labels; custom-field badge only on hover/focus; unchanged add/save/load/run interactions; no console errors.

- [ ] **Step 5: Final independent review**

Review the full branch from merge base `305fcd2` to `HEAD`, resolve all Critical/Important findings, rerun focused checks if any file changes, then rerun `npm test` and `npm run build` before reporting completion.
