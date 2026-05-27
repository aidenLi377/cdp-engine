# Node Display Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted editable node display names and replace default `节点 N` labels across solution center, workbench, and custom-field-linked UI.

**Architecture:** Persist a new `displayName` field on each node, preserve it through runtime hydration, and centralize label rendering through shared helpers. Update all node-label UI to use the helper so solution center, workbench, dialogs, and binding prompts stay consistent.

**Tech Stack:** Vue 3, Element Plus, plain JS modules, Flask-backed JSON persistence, Node test runner

---

### Task 1: Add persisted node display name serialization and label helpers

**Files:**
- Modify: `E:/CDP_Project_codex/cdp-web/src/utils/solutionState.js`
- Modify: `E:/CDP_Project_codex/cdp-web/src/utils/solutionState.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add tests for:
- `serializeNodesForSolution` preserving `displayName`
- a new `getNodeDisplayName(node, index)` helper returning `displayName` first and fallback `节点 N`

- [ ] **Step 2: Run test to verify it fails**

Run: `node cdp-web/src/utils/solutionState.test.mjs`
Expected: FAIL because `displayName` is missing from serialized nodes and helper is undefined.

- [ ] **Step 3: Write minimal implementation**

Update node serialization to include `displayName`, and add shared helpers:
- `serializeNodesForSolution`
- `getNodeDisplayName(node, index)`
- optional helper for bindings like `getNodeDisplayNameById(nodeList, nodeId)`

- [ ] **Step 4: Run test to verify it passes**

Run: `node cdp-web/src/utils/solutionState.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cdp-web/src/utils/solutionState.js cdp-web/src/utils/solutionState.test.mjs
git commit -m "feat: persist node display names"
```

### Task 2: Preserve node display names through runtime hydration and node duplication

**Files:**
- Modify: `E:/CDP_Project_codex/cdp-web/src/composables/useSolutionRuntime.js`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/NormalMode.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/SolutionCenter.vue`

- [ ] **Step 1: Write the failing tests**

Add tests asserting copied nodes do not retain the original custom name and hydrated nodes keep saved `displayName`.

- [ ] **Step 2: Run test to verify it fails**

Run:
- `node cdp-web/src/components/NormalMode.toolbar.test.mjs`
- `node cdp-web/src/components/SolutionCenter.listActions.test.mjs`
Expected: FAIL because no display-name-aware behavior exists yet.

- [ ] **Step 3: Write minimal implementation**

Update runtime node creation/hydration to preserve `displayName`, and duplication flows in workbench and solution center to clear `displayName` on the new node copy.

- [ ] **Step 4: Run test to verify it passes**

Run:
- `node cdp-web/src/components/NormalMode.toolbar.test.mjs`
- `node cdp-web/src/components/SolutionCenter.listActions.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cdp-web/src/composables/useSolutionRuntime.js cdp-web/src/components/NormalMode.vue cdp-web/src/components/SolutionCenter.vue
git commit -m "feat: carry node display names through runtime flows"
```

### Task 3: Add editable node naming in solution center

**Files:**
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/SolutionCenter.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/SolutionCenter.listActions.test.mjs`
- Modify: `E:/CDP_Project_codex/cdp-web/src/styles/cdp-global.css`

- [ ] **Step 1: Write the failing tests**

Add tests asserting the solution center node header exposes a node name input/trigger and no longer hardcodes `节点 {{ index + 1 }}`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node cdp-web/src/components/SolutionCenter.listActions.test.mjs`
Expected: FAIL because node headers still render `节点 {{ index + 1 }}` only.

- [ ] **Step 3: Write minimal implementation**

Add editable node naming UI in draft mode, read-only display in published mode, and update node headers to show `displayName` fallback text through the shared helper.

- [ ] **Step 4: Run test to verify it passes**

Run: `node cdp-web/src/components/SolutionCenter.listActions.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cdp-web/src/components/SolutionCenter.vue cdp-web/src/components/SolutionCenter.listActions.test.mjs cdp-web/src/styles/cdp-global.css
git commit -m "feat: add editable node names in solution center"
```

### Task 4: Replace node index labels across workbench and custom-field-linked UI

**Files:**
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/NormalMode.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/CustomFieldEditDialog.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/SolutionUseForm.vue`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/NormalMode.leftPanel.test.mjs`
- Modify: `E:/CDP_Project_codex/cdp-web/src/components/NormalMode.status.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add tests for:
- workbench node headers using shared node labels
- custom-field dialog using saved node names
- copy-binding prompt no longer hardcoding only `节点 N`

- [ ] **Step 2: Run test to verify it fails**

Run:
- `node cdp-web/src/components/NormalMode.leftPanel.test.mjs`
- `node cdp-web/src/components/NormalMode.status.test.mjs`
Expected: FAIL because existing text still depends on `节点 {{ index + 1 }}` and dialog helper still returns index labels.

- [ ] **Step 3: Write minimal implementation**

Replace hardcoded index label rendering with the shared helper everywhere in workbench and custom-field-linked surfaces.

- [ ] **Step 4: Run test to verify it passes**

Run:
- `node cdp-web/src/components/NormalMode.leftPanel.test.mjs`
- `node cdp-web/src/components/NormalMode.status.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cdp-web/src/components/NormalMode.vue cdp-web/src/components/CustomFieldEditDialog.vue cdp-web/src/components/SolutionUseForm.vue cdp-web/src/components/NormalMode.leftPanel.test.mjs cdp-web/src/components/NormalMode.status.test.mjs
git commit -m "feat: use node display names across workbench flows"
```

### Task 5: Verify persistence and regression coverage end-to-end

**Files:**
- Modify: `E:/CDP_Project_codex/test_solutions_api.py`
- Modify: `E:/CDP_Project_codex/docs/superpowers/specs/2026-05-25-node-display-name-design.md` (only if spec needs evidence note; otherwise no change)

- [ ] **Step 1: Write the failing test**

Add API coverage that a saved draft/published solution round-trips node `displayName`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python test_solutions_api.py`
Expected: FAIL because `displayName` is not yet preserved by serialization/backend payloads.

- [ ] **Step 3: Write minimal implementation**

Ensure frontend payloads already include `displayName`, and adjust any backend-facing expectations/tests to reflect persisted node names.

- [ ] **Step 4: Run test to verify it passes**

Run:
- `python test_solutions_api.py`
- `python test_solution_store.py`
- `node cdp-web/src/utils/solutionState.test.mjs`
- `node cdp-web/src/components/SolutionCenter.listActions.test.mjs`
- `node cdp-web/src/components/NormalMode.leftPanel.test.mjs`
- `node cdp-web/src/components/NormalMode.status.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test_solutions_api.py test_solution_store.py cdp-web/src/utils/solutionState.test.mjs cdp-web/src/components/SolutionCenter.listActions.test.mjs cdp-web/src/components/NormalMode.leftPanel.test.mjs cdp-web/src/components/NormalMode.status.test.mjs
git commit -m "test: cover node display name persistence"
```
