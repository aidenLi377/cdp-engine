# Compact Behavior Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign workbench and solution-center behavior cards into compact, icon-driven parameter cards with tighter spacing and stronger interaction feedback.

**Architecture:** Update the shared card header structure in both `NormalMode.vue` and `SolutionCenter.vue` so drag, collapse, title, node badge, and icon actions use the same compact layout. Tighten the shared CSS in `cdp-global.css` for header density, body padding, control heights, and motion. Lock the redesign with text-level component/CSS tests and existing no-emit type validation.

**Tech Stack:** Vue 3 SFCs, Element Plus, global CSS, Node test runner, `vue-tsc`

---

### Task 1: Lock the compact card contract with tests

**Files:**
- Create: `E:\CDP_Project_codex\cdp-web\src\components\BehaviorCards.compact.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const solutionCenterVue = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('behavior cards use icon-first compact headers in workbench and solution center', () => {
  assert.match(normalModeVue, /behavior-card-icon-btn/)
  assert.match(solutionCenterVue, /behavior-card-icon-btn/)
  assert.match(css, /\.behavior-card-header/)
  assert.match(css, /\.dynamic-form \{[^}]*padding: 18px 20px;/s)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/BehaviorCards.compact.test.mjs`
Expected: FAIL because the compact header classes and compact spacing do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Modify the Vue templates and shared CSS to introduce the compact header classes, icon action buttons, and reduced body spacing.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/BehaviorCards.compact.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cdp-web/src/components/BehaviorCards.compact.test.mjs cdp-web/src/components/NormalMode.vue cdp-web/src/components/SolutionCenter.vue cdp-web/src/styles/cdp-global.css
git commit -m "feat: compact behavior card layout"
```

### Task 2: Verify no type regressions

**Files:**
- Test: `E:\CDP_Project_codex\cdp-web\src\components\BehaviorCards.compact.test.mjs`

- [ ] **Step 1: Run focused component tests**

Run: `node --test src/components/BehaviorCards.compact.test.mjs src/components/NormalMode.customFields.test.mjs src/utils/display.test.mjs`
Expected: PASS

- [ ] **Step 2: Run no-emit type checks**

Run: `npx.cmd vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS

- [ ] **Step 3: Run node-config type checks**

Run: `npx.cmd vue-tsc --noEmit -p tsconfig.node.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add cdp-web/src/components/BehaviorCards.compact.test.mjs
git commit -m "test: verify compact behavior cards"
```
