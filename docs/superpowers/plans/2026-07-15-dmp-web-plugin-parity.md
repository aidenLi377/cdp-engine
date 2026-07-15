# DMP Web and Plugin Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CDP task center and the merged DMP panel share readiness/settings and return the same ten-column DMP extraction result.

**Architecture:** The extension owns DMP condition state, settings, extraction, and calculations. A pure result core makes the original formulas testable; the bridge exposes settings to the Vue task center, which only controls visibility and Rebase preferences and renders complete results.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript, Vue 3, Element Plus, Node.js built-in test runner.

## Global Constraints

- Do not modify the original DMP business files at `E:\插件开发\DMP\DMP-Plugin` root.
- Do not change DataBank behavior, backend APIs, database schema, solution libraries, authentication, or user isolation.
- Update only the CDP built-in extension and `DMP_PluginV2.1-CDP-Merged`.
- Preserve complete result data even when columns are hidden.
- Keep old task rows with `点击TGI` and `转化TGI` readable as aliases of `CTR` and `PPC`.
- Use failing tests before every production behavior change.

---

### Task 1: Pure DMP result core

**Files:**
- Create: `chrome-extension/databank-automation/dmp-result-core.js`
- Create: `chrome-extension/databank-automation/dmp-result-core.test.mjs`
- Modify: `chrome-extension/databank-automation/manifest.json`

**Interfaces:**
- Produces: `globalThis.DmpResultCore` with `ALL_COLUMNS`, `getReadyTagIds(conditionCache)`, `buildRequest(payload, tagId, tagInfo, conditionCache)`, and `finalizeRows(rawRows, totalCoverageCount, excludedTagIds)`.

- [ ] **Step 1: Write failing result-core tests**

```javascript
test('ready tag ids require non-empty condition arrays', () => {
  assert.deepEqual(core.getReadyTagIds({ a: [{}], b: [], c: null }), ['a'])
})

test('conditional requests use only their own cached multiGroupOptions', () => {
  const built = core.buildRequest(payload, '200', { tagId: '200', needCondition: true }, { '200': [{ tagId: 200 }] })
  assert.deepEqual(built.body.multiGroupOptions, [{ tagId: 200 }])
})

test('coverage and excluded Rebase match the original plugin formula', () => {
  const rows = core.finalizeRows(rawRows, 1000, ['200'])
  assert.equal(rows[0]['覆盖人数'], '200')
  assert.equal(rows[0]['Rebase'], '20%')
  assert.equal(rows[0]['Rebase后人数'], '200')
})
```

- [ ] **Step 2: Verify RED**

Run: `node --test chrome-extension/databank-automation/dmp-result-core.test.mjs`

Expected: FAIL because `dmp-result-core.js` does not exist.

- [ ] **Step 3: Implement the pure core**

```javascript
(function (root, factory) {
  const api = factory()
  root.DmpResultCore = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ALL_COLUMNS = ['所属大类', '标签类型', '标签名称', '特征明细', '人群占比', '覆盖人数', 'Rebase', 'Rebase后人数', 'CTR', 'PPC']

  function getReadyTagIds(cache) {
    return Object.entries(cache || {}).filter(([, value]) => Array.isArray(value) && value.length > 0).map(([id]) => String(id))
  }

  function buildRequest(payload, tagId, tagInfo, conditionCache) {
    const body = JSON.parse(JSON.stringify(payload.payload || {}))
    delete body.multiGroupOptions
    if (tagInfo.needCondition) {
      const options = conditionCache?.[String(tagId)]
      if (!Array.isArray(options) || options.length === 0) return { ok: false, error: '未配置下钻条件' }
      body.multiGroupOptions = JSON.parse(JSON.stringify(options))
    }
    const id = String(tagId)
    const url = String(payload.url || '')
      .replace(/\/tag\/\d+/, `/tag/${id}`)
      .replace(/tagId=\d+/, `tagId=${id}`)
      .replace(/\/analysis\/\d+/, `/analysis/${id}`)
    if (body.tagId !== undefined) body.tagId = Number.parseInt(id, 10)
    return { ok: true, url, body }
  }

  function finalizeRows(rawRows, totalCoverageCount, excludedTagIds) {
    const excluded = new Set((excludedTagIds || []).map(String))
    const sums = {}
    for (const row of rawRows) {
      const detail = String(row['特征明细'] || '')
      const pct = row['人群占比'] === '-' ? NaN : Number.parseFloat(row['人群占比'])
      if (!detail.includes('⚠️') && !detail.includes('❌') && Number.isFinite(pct)) sums[row['标签名称']] = (sums[row['标签名称']] || 0) + pct
    }
    return rawRows.map((row) => {
      const pct = row['人群占比'] === '-' ? NaN : Number.parseFloat(row['人群占比'])
      const id = String(row._dictTagId || '')
      const coverage = totalCoverageCount > 0 && Number.isFinite(pct) ? String(Math.round(totalCoverageCount * pct / 100)) : '-'
      const rebase = !Number.isFinite(pct) ? '-' : excluded.has(id) ? row['人群占比'] : sums[row['标签名称']] > 0 ? `${pct / sums[row['标签名称']] * 100}%` : '0%'
      const rebaseCount = rebase === '-' || totalCoverageCount <= 0 ? '-' : excluded.has(id) ? coverage : String(Math.round(totalCoverageCount * Number.parseFloat(rebase) / 100))
      return { '所属大类': row['所属大类'], '标签类型': row['标签类型'], '标签名称': row['标签名称'], '特征明细': row['特征明细'], '人群占比': row['人群占比'], '覆盖人数': coverage, Rebase: rebase, 'Rebase后人数': rebaseCount, CTR: row.CTR, PPC: row.PPC }
    })
  }

  return { ALL_COLUMNS, getReadyTagIds, buildRequest, finalizeRows }
})
```

Load `dmp-result-core.js` immediately before `dmp-content.js` in the DMP content-script manifest entry.

- [ ] **Step 4: Verify GREEN**

Run: `node --test chrome-extension/databank-automation/dmp-result-core.test.mjs`

Expected: all result-core tests pass.

- [ ] **Step 5: Record the task checkpoint**

Run: `git diff --check -- chrome-extension/databank-automation/dmp-result-core.js chrome-extension/databank-automation/dmp-result-core.test.mjs chrome-extension/databank-automation/manifest.json`

Expected: exit code 0. Do not create an intermediate code commit because `TaskCenter.vue` and other approved work already overlap the dirty worktree.

### Task 2: Shared settings bridge

**Files:**
- Modify: `chrome-extension/databank-automation/background.test.mjs`
- Create: `chrome-extension/databank-automation/bridge.test.mjs`
- Modify: `chrome-extension/databank-automation/background.js`
- Modify: `chrome-extension/databank-automation/bridge.js`

**Interfaces:**
- Consumes: `DmpResultCore.ALL_COLUMNS` semantics for default visibility.
- Produces: `CDP_DMP_GET_SETTINGS` and `CDP_DMP_UPDATE_SETTINGS` messages with `{ settings: { readyTagIds, columnVisibility, rebaseExcludedTagIds } }`.

- [ ] **Step 1: Write failing background and bridge tests**

```javascript
test('background reads normalized shared DMP settings', async () => {
  const response = await harness.sendProjectMessage({ type: 'CDP_DMP_GET_SETTINGS', pageUrl: localUrl })
  assert.deepEqual(response.settings.readyTagIds, ['200'])
  assert.equal(response.settings.columnVisibility['覆盖人数'], true)
})

test('bridge forwards settings updates and returns settings', () => {
  harness.dispatch({ source: 'cdp-web', type: 'CDP_DMP_UPDATE_SETTINGS', requestId: 1, columnVisibility: { CTR: false } })
  assert.equal(harness.forwarded[0].columnVisibility.CTR, false)
  assert.equal(harness.posted[0].payload.settings.columnVisibility.CTR, false)
})
```

- [ ] **Step 2: Verify RED**

Run: `node --test chrome-extension/databank-automation/background.test.mjs chrome-extension/databank-automation/bridge.test.mjs`

Expected: FAIL because the settings messages are not accepted or returned.

- [ ] **Step 3: Implement storage-backed settings handlers**

```javascript
const MSG_DMP_GET_SETTINGS = 'CDP_DMP_GET_SETTINGS'
const MSG_DMP_UPDATE_SETTINGS = 'CDP_DMP_UPDATE_SETTINGS'

async function readDmpSettings() {
  const stored = await chrome.storage.local.get(['dmpConditionCache', 'columnVisibility', 'rebaseExcludedTagIds'])
  return normalizeDmpSettings(stored)
}
```

Allow both messages through origin validation, merge only provided writable keys, and add `settings` to `bridge.js` response serialization.

- [ ] **Step 4: Verify GREEN and existing background behavior**

Run: `node --test chrome-extension/databank-automation/background.test.mjs chrome-extension/databank-automation/bridge.test.mjs chrome-extension/databank-automation/content.test.mjs`

Expected: all tests pass, including the existing DataBank tests.

- [ ] **Step 5: Record the task checkpoint**

Run: `git diff --check -- chrome-extension/databank-automation/background.js chrome-extension/databank-automation/bridge.js chrome-extension/databank-automation/background.test.mjs chrome-extension/databank-automation/bridge.test.mjs`

Expected: exit code 0.

### Task 3: DMP extraction parity

**Files:**
- Create: `chrome-extension/databank-automation/dmp-content.test.mjs`
- Modify: `chrome-extension/databank-automation/dmp-content.js`

**Interfaces:**
- Consumes: `DmpResultCore.buildRequest` and `DmpResultCore.finalizeRows`.
- Produces: extraction responses containing `crowdCount` and complete rows in the ten-column standard schema.

- [ ] **Step 1: Write failing extraction tests**

```javascript
test('DMP interception persists multi-condition readiness', async () => {
  harness.dispatchPayload({ payload: { multiGroupOptions: [{ tagId: 200 }] } })
  assert.deepEqual(harness.storage.dmpConditionCache['200'], [{ tagId: 200 }])
})

test('DMP extraction returns coverage and original Rebase fields', async () => {
  const response = await harness.extract(['200'])
  assert.equal(response.crowdCount, 1000)
  assert.deepEqual(Object.keys(response.results[0]), core.ALL_COLUMNS)
  assert.equal(response.results[0]['覆盖人数'], '200')
})
```

- [ ] **Step 2: Verify RED**

Run: `node --test chrome-extension/databank-automation/dmp-content.test.mjs`

Expected: FAIL because condition persistence and ten-column rows are missing.

- [ ] **Step 3: Implement extraction parity**

Add a `DMP_PAYLOAD_INTERCEPTED` listener that persists valid conditions, read shared settings before extraction, wait for the original coverage XPath before tag requests, use `buildRequest` for every tag, and call `finalizeRows` with the total coverage count and shared exclusions.

Missing conditional configuration returns a standard warning row without making a fetch. Fetch failures also return a standard ten-field warning row.

- [ ] **Step 4: Verify GREEN and extension regression**

Run: `node --test chrome-extension/databank-automation/*.test.mjs`

Expected: all built-in extension tests pass.

- [ ] **Step 5: Record the task checkpoint**

Run: `git diff --check -- chrome-extension/databank-automation/dmp-content.js chrome-extension/databank-automation/dmp-content.test.mjs`

Expected: exit code 0.

### Task 4: Task center settings and complete result UI

**Files:**
- Create: `cdp-web/src/utils/dmpResults.js`
- Create: `cdp-web/src/utils/dmpResults.test.mjs`
- Create: `cdp-web/src/components/TaskCenter.dmpParity.test.mjs`
- Modify: `cdp-web/src/components/TaskCenter.vue`

**Interfaces:**
- Produces: `DMP_RESULT_COLUMNS`, `normalizeResultRow(row)`, `visibleResultColumns(rows, visibility)`, and `isConditionalTagReady(tag, readyTagIds)`.
- Consumes: the settings bridge protocol from Task 2.

- [ ] **Step 1: Write failing utility and component-contract tests**

```javascript
test('old TGI names normalize to CTR and PPC without mutating input', () => {
  const row = { 点击TGI: '120', 转化TGI: '80' }
  const normalized = normalizeResultRow(row)
  assert.equal(normalized.CTR, '120')
  assert.equal(normalized.PPC, '80')
  assert.equal(row.CTR, undefined)
})

test('conditional tags are selectable only when extension reports ready', () => {
  assert.equal(isConditionalTagReady({ tagId: '200', needCondition: true }, ['200']), true)
  assert.equal(isConditionalTagReady({ tagId: '201', needCondition: true }, ['200']), false)
})
```

The component contract test must assert the presence of `CDP_DMP_GET_SETTINGS`, `CDP_DMP_UPDATE_SETTINGS`, “显示字段”, “Rebase”, “已就绪”, and “待配置”.

- [ ] **Step 2: Verify RED**

Run: `node --test cdp-web/src/utils/dmpResults.test.mjs cdp-web/src/components/TaskCenter.dmpParity.test.mjs`

Expected: FAIL because the utility and controls do not exist.

- [ ] **Step 3: Implement settings state and UI**

```javascript
const dmpSettings = ref({
  readyTagIds: [],
  columnVisibility: defaultColumnVisibility(),
  rebaseExcludedTagIds: [],
})

async function loadDmpSettings() {
  const response = await sendToExtension('CDP_DMP_GET_SETTINGS', {})
  dmpSettings.value = normalizeSettings(response.settings)
}
```

Add compact field and Rebase popovers, readiness badges, rollback on update failure, standard ten-column rendering, visible-column copy, complete-column CSV, and old-history aliases. Refresh settings after extension connection and before DMP extraction.

- [ ] **Step 4: Verify GREEN and build**

Run: `node --test cdp-web/src/**/*.test.mjs`

Expected: all frontend tests pass.

Run: `npm run build`

Working directory: `cdp-web`

Expected: type-check and Vite build exit with code 0.

- [ ] **Step 5: Record the task checkpoint**

Run: `git diff --check -- cdp-web/src/components/TaskCenter.vue cdp-web/src/components/TaskCenter.dmpParity.test.mjs cdp-web/src/utils/dmpResults.js cdp-web/src/utils/dmpResults.test.mjs`

Expected: exit code 0.

### Task 5: Synchronize the independent merged extension and verify isolation

**Files:**
- Create: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged\dmp-result-core.js`
- Modify: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged\background.js`
- Modify: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged\bridge.js`
- Modify: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged\cdp-dmp-automation.js`
- Modify: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged\manifest.json`
- Create or modify matching files under `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged\tests`

**Interfaces:**
- The merged extension exposes the same web protocol and extraction result as the built-in extension while its copied DMP panel continues using the same `chrome.storage.local` keys.

- [ ] **Step 1: Write failing merged-contract tests**

Assert that the manifest loads `dmp-result-core.js` before `cdp-dmp-automation.js`, the bridge includes both settings messages, and the DMP automation reads `dmpConditionCache` and `rebaseExcludedTagIds`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/*.test.mjs`

Working directory: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged`

Expected: the new merged-contract assertions fail.

- [ ] **Step 3: Copy the tested protocol and core into the merged version**

Copy only the approved built-in extension files, preserving merged filenames: built-in `dmp-content.js` maps to merged `cdp-dmp-automation.js`; `background.js`, `bridge.js`, and `dmp-result-core.js` keep their names. Update dynamic injection references to `cdp-dmp-automation.js` and `databank-automation.js`.

- [ ] **Step 4: Verify merged extension and original-file isolation**

Run: `node --test tests/*.test.mjs`

Expected: all merged tests pass.

Run JavaScript syntax checks and parse `manifest.json`. Compare SHA-256 hashes of original root `content.js`, `hook.js`, `panel.html`, `dmp_tags_dictionary.json`, and `icon.png` against the recorded pre-change hashes or the hashes recorded immediately before Task 5; all must be unchanged.

- [ ] **Step 5: Full regression verification**

Run:

```powershell
python -m pytest -q
node --test chrome-extension/databank-automation/*.test.mjs
node --test cdp-web/src/**/*.test.mjs
npm run build --prefix cdp-web
```

Expected: every command exits 0 with no test failures.

- [ ] **Step 6: Review the final diff by scope**

Run `git status --short` and `git diff --name-only`. Confirm that no newly changed production file lies outside the approved CDP web/extension scope and plan documents. Do not discard or rewrite pre-existing user changes.
