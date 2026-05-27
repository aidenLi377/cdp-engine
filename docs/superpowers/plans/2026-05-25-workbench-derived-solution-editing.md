# Workbench Derived Solution Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the workbench stay fully editable after applying a published solution, keep `customFields` as a bulk-edit tool, and support saving the current workbench into a new draft or an existing draft.

**Architecture:** Move the "applied solution" state from a read-only `solution-use` branch toward a derived-workbench session tracked by runtime flags in `NormalMode.vue`. Reuse existing draft APIs and runtime node hydration, then reshape the toolbar and `SolutionUseForm.vue` so bulk editing remains available without owning the whole editing surface.

**Tech Stack:** Vue 3, Element Plus, node:test file-based component tests, existing `/api/solutions` draft APIs

---

## File Map

- Modify: `cdp-web/src/components/NormalMode.vue`
  - Remove structure locking for loaded published solutions.
  - Add derived-session flags, status copy, and save actions.
  - Reuse existing node canvas for applied solutions instead of the old restricted branch.
- Modify: `cdp-web/src/components/SolutionUseForm.vue`
  - Reposition as a bulk-edit panel and add split-value messaging.
- Modify: `cdp-web/src/components/NormalMode.status.test.mjs`
  - Cover derived-session status copy and save actions.
- Modify: `cdp-web/src/components/NormalMode.leftPanel.test.mjs`
  - Cover unlocked package library behavior after applying a solution.
- Modify: `cdp-web/src/components/NormalMode.toolbar.test.mjs`
  - Cover new save actions and removal of old exit/read-only affordances.

### Task 1: Lock behavior regression tests

**Files:**
- Modify: `cdp-web/src/components/NormalMode.leftPanel.test.mjs`
- Modify: `cdp-web/src/components/NormalMode.status.test.mjs`

- [ ] **Step 1: Add a failing test for unlocked package library after applying a solution**

```js
test('applied solutions keep package search and add buttons editable', () => {
  assert.doesNotMatch(normalModeVue, /:disabled="workbenchMode === 'solution-use' \|\| structureLocked"/)
  assert.doesNotMatch(normalModeVue, /v-if="structureLocked"/)
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test cdp-web/src/components/NormalMode.leftPanel.test.mjs cdp-web/src/components/NormalMode.status.test.mjs`
Expected: FAIL because `NormalMode.vue` still disables package actions and still renders the old exit/read-only affordances.

- [ ] **Step 3: Add a failing status test for derived-solution session copy and save actions**

```js
test('derived solution sessions advertise free editing and draft save actions', () => {
  assert.match(normalModeVue, /当前内容可自由编辑，不影响原正式方案/)
  assert.match(normalModeVue, /另存为新方案/)
  assert.match(normalModeVue, /保存到草稿方案/)
})
```

- [ ] **Step 4: Re-run the focused tests and verify failure**

Run: `node --test cdp-web/src/components/NormalMode.leftPanel.test.mjs cdp-web/src/components/NormalMode.status.test.mjs`
Expected: FAIL on the new status/action assertions.

### Task 2: Derived-workbench runtime state

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`

- [ ] **Step 1: Implement derived-session flags and unlocked structure flow**

Code to introduce in `NormalMode.vue`:

```js
const derivedSolutionMeta = reactive({
  sourceSolutionId: null,
  sourceSolutionVersion: null,
  sourceSolutionName: '',
  hasStructureChanges: false,
  hasParamChanges: false,
})

const isDerivedSolutionSession = computed(() => !!derivedSolutionMeta.sourceSolutionId)
```

- [ ] **Step 2: Update `setWorkbenchFromSolution()` to seed derived-session metadata**

```js
Object.assign(derivedSolutionMeta, {
  sourceSolutionId: record?.id || null,
  sourceSolutionVersion: record?._version ?? null,
  sourceSolutionName: record?.name || '',
  hasStructureChanges: false,
  hasParamChanges: false,
})
workbenchMode.value = 'solution-use'
```

- [ ] **Step 3: Replace structure-lock guards with derived-session dirty markers**

```js
function markStructureChanged() {
  if (isDerivedSolutionSession.value) {
    derivedSolutionMeta.hasStructureChanges = true
  }
}
```

- [ ] **Step 4: Re-run the focused tests and verify they pass**

Run: `node --test cdp-web/src/components/NormalMode.leftPanel.test.mjs cdp-web/src/components/NormalMode.status.test.mjs`
Expected: PASS for the newly introduced unlocked-state expectations.

### Task 3: Bulk-edit panel behavior and toolbar actions

**Files:**
- Modify: `cdp-web/src/components/SolutionUseForm.vue`
- Modify: `cdp-web/src/components/NormalMode.vue`
- Modify: `cdp-web/src/components/NormalMode.toolbar.test.mjs`

- [ ] **Step 1: Add a failing toolbar test for replacing the old exit action**

```js
test('solution toolbar offers draft-save actions instead of exit-only controls', () => {
  assert.match(normalModeVue, /另存为新方案/)
  assert.match(normalModeVue, /保存到草稿方案/)
  assert.doesNotMatch(normalModeVue, /退出方案使用/)
})
```

- [ ] **Step 2: Run the focused toolbar test and verify failure**

Run: `node --test cdp-web/src/components/NormalMode.toolbar.test.mjs`
Expected: FAIL because the old exit button is still present and the save buttons do not exist.

- [ ] **Step 3: Implement toolbar actions and bulk-edit messaging**

Implementation targets:

```js
async function saveAsNewDerivedDraft() { /* createDraft with current nodes + customFields */ }
async function saveIntoExistingDraft() { /* choose draft, call updateDraft */ }
function getCustomFieldValueState(section) { /* return 'single' or 'diverged' */ }
```

- [ ] **Step 4: Re-run the toolbar test and verify pass**

Run: `node --test cdp-web/src/components/NormalMode.toolbar.test.mjs`
Expected: PASS

### Task 4: Draft persistence verification

**Files:**
- Modify: `cdp-web/src/components/NormalMode.vue`

- [ ] **Step 1: Run the component test suite for touched workbench files**

Run: `node --test cdp-web/src/components/NormalMode.status.test.mjs cdp-web/src/components/NormalMode.leftPanel.test.mjs cdp-web/src/components/NormalMode.toolbar.test.mjs`
Expected: PASS

- [ ] **Step 2: Run existing runtime tests to catch accidental model breaks**

Run: `node --test cdp-web/src/composables/useSolutionRuntime.test.mjs cdp-web/src/utils/solutionState.test.mjs`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-25-workbench-derived-solution-editing.md \
  cdp-web/src/components/NormalMode.vue \
  cdp-web/src/components/SolutionUseForm.vue \
  cdp-web/src/components/NormalMode.status.test.mjs \
  cdp-web/src/components/NormalMode.leftPanel.test.mjs \
  cdp-web/src/components/NormalMode.toolbar.test.mjs
git commit -m "feat: unlock derived solution editing in workbench"
```
