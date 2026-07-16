# Gallery White C Border-Only Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert persistent interior cards across Workbench, Solution Center, and Task Center to pure-white, border-only surfaces while preserving small control fills and semantic states.

**Architecture:** Extend the existing final Gallery White layer in `cdp-global.css`; do not edit component templates or scripts. Add selector-bounded regression contracts that read the final matching selector-list rule, then make the smallest CSS changes required to turn persistent card surfaces and hover states into pure-white, shadow-free treatments.

**Tech Stack:** Vue 3 styling, plain CSS custom properties, Node.js `node:test`, Vite, `vue-tsc`.

## Global Constraints

- Only modify `cdp-web/src/styles/cdp-global.css` and `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`.
- Do not modify Vue templates, scripts, data flow, APIs, backend code, dependencies, or build configuration.
- Do not change layout dimensions, interaction behavior, copy, permissions, or business states.
- Persistent cards use `--ui-surface`; card borders use `--ui-divider`; hover feedback may use `--ui-control-border`.
- Card default, hover, and selected states must not use gray fill, colored fill, shadow, or translation to create hierarchy.
- Preserve `--ui-fill` for segmented-control inactive items, inputs where already used, disabled states, settings hover, and small empty-state illustrations.
- Preserve Signal Orange for small focus/count/status signals and preserve P1 `--ui-success`, `--ui-warning`, and `--ui-danger` semantics.

---

## File Map

- `cdp-web/src/styles/cdp-global.css`: final Gallery White production overrides for persistent surfaces, hover treatment, and the Workbench edge toggle.
- `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`: selector-bounded contracts for C surface, hover, edge-toggle, and preserved-control behavior.

### Task 1: Make Persistent Interior Cards Pure White and Border-Only

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.css:2644-2678`
- Modify: `cdp-web/src/styles/cdp-global.css:2927-2933`
- Test: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs:338-end`

**Interfaces:**
- Consumes: `effectiveSelectorListRule(source: string, selector: string): string` from the existing Gallery White test helper.
- Produces: final selector-list rules whose declaration text is testable for `--ui-surface`, neutral borders, `box-shadow: none`, and hover `transform: none`.

- [ ] **Step 1: Write failing C surface and hover contracts**

Append the following tests to `cdp-global.gallery-white.test.mjs`:

```js
test('gallery white C keeps persistent interior cards pure white and border-only', () => {
  for (const selector of [
    '.workbench-section',
    '.panel-name-area',
    '.json-code',
    '.summary-compute',
    '.creating-custom-field-panel',
    '.custom-field-item',
    '#app .tc-test-col',
    '#app .tc-tag-item:not(.disabled):not(.ready)',
    '#app .tc-history-item',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /border-color:\s*var\(--ui-divider\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
  }

  assert.match(
    effectiveSelectorListRule(themeCss, '.final-list-area'),
    /background:\s*var\(--ui-surface\)\s*!important/,
  )
})

test('gallery white C card hover uses only a stronger neutral border', () => {
  for (const selector of [
    '.intercom-card:hover',
    '.published-solution-item:hover',
    '.solution-list-item:hover',
    '.intercom-list-item:hover',
    '.solution-use-card:hover',
    '.cf-use-card:hover',
    '.custom-field-item:hover',
    '#app .tc-history-item:hover',
    '#app .tc-tag-item:hover:not(.disabled):not(.ready)',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /border-color:\s*var\(--ui-control-border\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.match(rule, /transform:\s*none\s*!important/)
  }
})

test('gallery white C keeps the workbench edge toggle white and shadow-free', () => {
  const baseRule = effectiveSelectorListRule(themeCss, '.left-panel-edge-toggle')
  assert.match(baseRule, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(baseRule, /border-color:\s*var\(--ui-divider\)\s*!important/)
  assert.match(baseRule, /box-shadow:\s*none\s*!important/)

  const hoverRule = effectiveSelectorListRule(themeCss, '.left-panel-edge-toggle:hover')
  assert.match(hoverRule, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(hoverRule, /border-color:\s*var\(--ui-control-border\)\s*!important/)
  assert.match(hoverRule, /box-shadow:\s*none\s*!important/)

  const activeRule = effectiveSelectorListRule(themeCss, '.left-panel-edge-toggle.is-solutions')
  assert.match(activeRule, /color:\s*var\(--ui-accent\)\s*!important/)
  assert.match(activeRule, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(activeRule, /border-color:\s*var\(--ui-accent\)\s*!important/)
  assert.match(activeRule, /box-shadow:\s*none\s*!important/)
})
```

- [ ] **Step 2: Run the focused contract to verify RED**

Run:

```powershell
node --test src/styles/cdp-global.gallery-white.test.mjs
```

from `cdp-web`.

Expected: the existing 22 tests pass and the three new C tests fail because the selectors are missing from the final Gallery White layer or still contain shadow, translation, translucent fill, or warm fill.

- [ ] **Step 3: Implement the minimal Gallery White C rules**

Add a separate C persistent-surface rule after the existing persistent-card group. Do not append these selectors to the existing group, because that group also normalizes border style and radius:

```css
.workbench-section,
.panel-name-area,
.json-code,
.summary-compute,
.creating-custom-field-panel,
.custom-field-item,
#app .tc-test-col,
#app .tc-tag-item:not(.disabled):not(.ready),
#app .tc-history-item
{
  background: var(--ui-surface) !important;
  border-color: var(--ui-divider) !important;
  box-shadow: none !important;
}
```

This preserves each component's existing border style and radius. Add a separate rule for the list container:

```css
.final-list-area {
  background: var(--ui-surface) !important;
}
```

Replace the existing Gallery White card-hover rule with this complete selector list and declaration block:

```css
.intercom-card:hover,
.published-solution-item:hover,
.solution-list-item:hover,
.intercom-list-item:hover,
.solution-use-card:hover,
.cf-use-card:hover,
.custom-field-item:hover,
#app .tc-history-item:hover,
#app .tc-tag-item:hover:not(.disabled):not(.ready) {
  background: var(--ui-surface) !important;
  border-color: var(--ui-control-border) !important;
  box-shadow: none !important;
  transform: none !important;
}
```

The `.ready` exclusion ensures a ready P1 state retains its semantic treatment.

Add these final Gallery White edge-toggle rules before the reduced-motion media query:

```css
.left-panel-edge-toggle {
  background: var(--ui-surface) !important;
  border-color: var(--ui-divider) !important;
  box-shadow: none !important;
}

.left-panel-edge-toggle:hover {
  color: var(--ui-ink) !important;
  background: var(--ui-surface) !important;
  border-color: var(--ui-control-border) !important;
  box-shadow: none !important;
}

.left-panel-edge-toggle.is-solutions {
  color: var(--ui-accent) !important;
  background: var(--ui-surface) !important;
  border-color: var(--ui-accent) !important;
  box-shadow: none !important;
}
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
node --test src/styles/cdp-global.gallery-white.test.mjs
```

Expected: 25 tests pass, 0 fail.

- [ ] **Step 5: Verify preserved small gray and semantic states**

Confirm the existing contracts still pass and the final diff does not replace these allowed rules:

```text
.intercom-radio-group .el-radio-button__inner -> var(--ui-fill)
.empty-state-illustration.create -> var(--ui-fill)
.empty-state-illustration.use -> var(--ui-fill)
.tc-btn-sm:disabled -> var(--ui-fill)
.tc-tag-item.disabled -> var(--ui-fill)
.tc-tag-item.needCond.ready -> semantic success treatment
```

Run:

```powershell
git diff --check
git diff -- cdp-web/src/styles/cdp-global.css cdp-web/src/styles/cdp-global.gallery-white.test.mjs
```

Expected: no whitespace errors; the diff contains only C CSS overrides and the three contracts.

- [ ] **Step 6: Run the full frontend regression suite and production build**

Run from `cdp-web`:

```powershell
node --test
npm run build
```

Expected: 114 tests pass, 0 fail; `vue-tsc --build` and `vite build` succeed. The existing Vite large-chunk warning may remain.

- [ ] **Step 7: Run the scope and protected-region audit**

Compare the task against the plan commit. Expected changed implementation paths:

```text
cdp-web/src/styles/cdp-global.css
cdp-web/src/styles/cdp-global.gallery-white.test.mjs
```

Expected: 2 allowed paths, 0 forbidden paths; Vue template/script protected regions remain unchanged; working tree contains no unrelated changes.

- [ ] **Step 8: Perform browser QA at 1440×900**

Reload `http://localhost:5174/` and inspect Workbench, Solution Center, and Task Center.

Expected:

```text
Workbench: workbench library, name panel, JSON/summary cards are pure white with hairline borders.
Solution Center: creation/custom-field and solution cards are pure white with no hover lift or shadow.
Task Center: test cards, available tags, and history items are pure white; disabled tags remain gray; semantic P1 states remain colored.
All pages: no framework overlay, no new console error, no clipping or layout shift.
```

- [ ] **Step 9: Commit the implementation**

```powershell
git add -- cdp-web/src/styles/cdp-global.css cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git commit -m "style: make gallery cards border-only"
```
