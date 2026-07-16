# Gallery White Pure White Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dirty-looking full-height cold-gray side rails by making every three-column outer rail pure white while preserving hierarchy through hairline dividers and inner control fills.

**Architecture:** Keep the existing EOF-authoritative `Gallery White visual refresh` layer. Add one selector-bounded contract for the existing grouped rail rule, then change that rule's background token from `--ui-fill` to `--ui-surface`; do not touch Vue files or layout behavior.

**Tech Stack:** Vue 3 scoped/global CSS, Node `node:test`, Vite, `vue-tsc`.

## Global Constraints

- Only `cdp-web/src/styles/cdp-global.css` and `cdp-web/src/styles/cdp-global.gallery-white.test.mjs` may change in the implementation commit.
- `.left-panel`, `.right-panel`, `.solution-sidebar`, `.solution-settings`, and `#app .tc-control-panel` must use `var(--ui-surface)` as their full-height background.
- `--ui-fill` remains available only for small controls, disabled states, hover states, empty states, and compact inner blocks; it must not be the grouped rail background.
- Preserve `var(--ui-divider)` borders and `box-shadow: none`; do not add shadows, gradients, new layout rules, or new tokens.
- Do not modify any Vue template/script, JavaScript/TypeScript logic, API, route, store, composable, utility, backend, database, extension, dependency, or configuration file.
- Keep `http://localhost:5174/` as the isolated visual preview.

---

### Task 1: Convert the three-column side rails to pure white

**Files:**
- Modify: `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`
- Modify: `cdp-web/src/styles/cdp-global.css:2628-2636`

**Interfaces:**
- Consumes: Existing `--ui-surface`, `--ui-divider`, `effectiveRule`-style theme contract conventions, and the current grouped side-rail selector.
- Produces: A regression-locked pure-white outer rail rule shared by Workbench, Solution Center, and Task Center.

- [ ] **Step 1: Write the failing side-rail contract**

Append this complete test to `cdp-web/src/styles/cdp-global.gallery-white.test.mjs`:

```js
test('gallery white keeps full-height three-column rails pure white', () => {
  const match = themeCss.match(
    /\.left-panel,\s*\.right-panel,\s*\.solution-sidebar,\s*\.solution-settings,\s*#app \.tc-control-panel\s*\{([^{}]*)\}/,
  )

  assert.ok(match, 'Expected the shared three-column rail rule in the Gallery White layer')
  const rule = match[1]

  assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.doesNotMatch(rule, /background:\s*var\(--ui-fill\)/)
  assert.match(rule, /border-color:\s*var\(--ui-divider\)\s*!important/)
  assert.match(rule, /box-shadow:\s*none\s*!important/)
})
```

- [ ] **Step 2: Run the focused contract and verify RED**

Run:

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
```

Expected: exit 1; the new test fails because the grouped rule still contains `background: var(--ui-fill) !important` instead of `var(--ui-surface)`.

- [ ] **Step 3: Implement the minimum pure-white rail change**

In `cdp-web/src/styles/cdp-global.css`, replace only the background declaration in the existing rule with:

```css
.left-panel,
.right-panel,
.solution-sidebar,
.solution-settings,
#app .tc-control-panel {
  background: var(--ui-surface) !important;
  border-color: var(--ui-divider) !important;
  box-shadow: none !important;
}
```

- [ ] **Step 4: Verify GREEN and the full regression**

Run:

```powershell
Set-Location cdp-web
node --test src/styles/cdp-global.gallery-white.test.mjs
$tests = (Get-ChildItem src -Recurse -Filter *.test.mjs).FullName
node --test $tests
npm run build
Set-Location ..
git diff --check
git status --short
```

Expected:

- Gallery White focused contract: 22/22 pass.
- All frontend Node tests: 111/111 pass.
- `vue-tsc --build` and Vite build: exit 0; the existing large-chunk warning may remain.
- Exactly the two allowed implementation files are modified before commit.
- `git diff --check`: no output.

- [ ] **Step 5: Verify the isolated browser preview**

Reload `http://localhost:5174/` and inspect Workbench, Solution Center, and Task Center at 1440×900.

Expected:

- Workbench and Solution Center outer left/right rails are visually pure white.
- Task Center control rail is visually pure white.
- Hairline dividers remain visible; small disabled/input surfaces retain subtle gray hierarchy.
- No interaction or application data is changed during read-only tab navigation.

- [ ] **Step 6: Commit the implementation**

Run:

```powershell
git add -- cdp-web/src/styles/cdp-global.css cdp-web/src/styles/cdp-global.gallery-white.test.mjs
git diff --cached --check
git commit -m "style: make gallery rails pure white"
```

Expected: one implementation commit containing exactly the two allowed files.
