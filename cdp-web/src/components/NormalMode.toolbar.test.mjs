import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('workbench toolbar separates copy, primary action, and secondary actions', () => {
  assert.match(normalModeVue, /class="workbench-toolbar-copy"/)
  assert.match(normalModeVue, /class="workbench-secondary-actions"/)
  assert.match(normalModeVue, /class="workbench-compact-action(?: [^"]*)?"/)
  assert.doesNotMatch(normalModeVue, /workbench-primary-action/)
  assert.doesNotMatch(css, /\.workbench-primary-action/)
  assert.doesNotMatch(normalModeVue, /自由搭建当前画布，并可直接存为方案草稿/)
})

test('output toolbar uses accessible import and copy icons before the automation action', () => {
  const importIndex = normalModeVue.indexOf('aria-label="导入 JSON"')
  const copyIndex = normalModeVue.indexOf('@click="copyJson"')
  const automationIndex = normalModeVue.indexOf('@click="handleAutomationButtonClick"')

  assert.ok(importIndex >= 0)
  assert.ok(importIndex < copyIndex)
  assert.ok(copyIndex < automationIndex)
  assert.match(normalModeVue, /:aria-label="batchMode \? '复制参数' : '复制 JSON'"/)
  assert.match(normalModeVue, /自动化圈人/)
  assert.doesNotMatch(normalModeVue, /goToDataBank|DATABANK_URL|databank-engine-button/)
  assert.match(css, /\.json-action-icon \{[^}]*width: 31px;[^}]*height: 31px;/s)
  assert.doesNotMatch(css, /\.databank-engine-button/)
})

test('crowd name and output controls share the selected P typography', () => {
  assert.match(normalModeVue, /class="panel-name-area workbench-crowd-name"/)
  assert.match(normalModeVue, /placeholder="为人群包命名"/)
  assert.match(normalModeVue, /class="crowd-name-edit-icon"/)
  assert.match(css, /\.workbench-crowd-name \.name-label-inline \{[^}]*font-size: 13px;/s)
  assert.match(css, /\.crowd-name-input \.el-input__inner \{[^}]*font-size: 15px !important;/s)
  assert.match(css, /\.json-toolbar \.json-tab \{[^}]*font-size: 13px !important;/s)
})

test('save draft is a compact secondary toolbar action', () => {
  assert.match(normalModeVue, /class="workbench-compact-action save-draft"/)
  assert.match(normalModeVue, />\s*存草稿\s*</)
  assert.doesNotMatch(normalModeVue, /class="intercom-btn-primary[^"]*"[^>]*@click="saveWorkbenchDraft"/s)
  assert.match(css, /\.workbench-compact-action\.save-draft\.el-button \{[^}]*color: #343a43 !important;/s)
})

test('workbench toolbar stays on one line without widening the canvas', () => {
  assert.match(css, /\.center-panel \{[^}]*min-width: 0;/s)
  assert.match(css, /\.panel-toolbar \{[^}]*flex-wrap: nowrap;/s)
  assert.match(css, /\.workbench-toolbar-copy \{[^}]*min-width: 0;/s)
  assert.match(css, /\.workbench-toolbar-actions \{[^}]*min-width: 0;/s)
  assert.doesNotMatch(normalModeVue, /databank-auto-calculate-inline/)
  assert.doesNotMatch(css, /\.databank-auto-calculate-inline/)
  assert.match(css, /\.automation-single-mode-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s)
})

test('workbench phase status is a compact breathing-light indicator', () => {
  assert.match(normalModeVue, /'is-free-build': workbenchMode === 'free-build'/)
  assert.match(normalModeVue, /'is-solution-use': workbenchMode === 'solution-use'/)
  assert.match(css, /\.workbench-phase-status \{[^}]*height: 24px;[^}]*background: transparent;[^}]*border: 0;/s)
  assert.match(css, /\.workbench-phase-status\.is-free-build \{[^}]*color: #248a4b;/s)
  assert.match(css, /\.workbench-phase-status\.is-free-build \.workbench-phase-dot \{[^}]*linear-gradient\(135deg, #67d88f 0%, #1fb56a 100%\);/s)
  assert.match(css, /@keyframes phasePulseGreen/)
  assert.match(css, /@keyframes phasePulseOrange/)
})

test('history snapshots reuse read-only component metadata instead of cloning large schemas', () => {
  assert.match(normalModeVue, /const \{ schema, logicMatrix, \.\.\.editableState \} = rawNode/)
  assert.match(normalModeVue, /\.\.\.cloneValue\(editableState\)/)
  assert.match(normalModeVue, /schema,\s*logicMatrix,/s)
  assert.doesNotMatch(normalModeVue, /structuredClone\(\{\s*nodeList: toRaw\(nodeList\.value\)/s)
})

test('live JSON generation cancels pending debounce before replacing a stale request', () => {
  assert.match(normalModeVue, /let jsonBuildAbort = null/)
  assert.match(normalModeVue, /signal: buildAbort\.signal/)
  assert.match(
    normalModeVue,
    /async function buildFinalJson\(\) \{\s*clearTimeout\(jsonTimer\)\s*jsonTimer = null\s*jsonBuildAbort\?\.abort\(\)/,
  )
  assert.equal(normalModeVue.match(/jsonBuildAbort\?\.abort\(\)/g)?.length, 2)
  assert.match(normalModeVue, /if \(error\.name === 'AbortError'\) return/)
})

test('derived solution sessions expose draft-save actions instead of the old exit control', () => {
  assert.match(normalModeVue, /另存为新方案/)
  assert.doesNotMatch(normalModeVue, /保存到草稿方案/)
  assert.doesNotMatch(normalModeVue, /退出方案使用/)
})

test('solution-use toolbar uses icon actions for restore and save-as-new', () => {
  assert.match(normalModeVue, /RefreshLeft/)
  assert.match(normalModeVue, /FolderAdd/)
  assert.match(normalModeVue, /class="workbench-toolbar-icon-btn"/)
  assert.match(normalModeVue, /content="恢复方案默认值"/)
  assert.match(normalModeVue, /content="另存为新方案"/)
  assert.match(css, /\.workbench-secondary-actions \.workbench-toolbar-icon-btn\.el-button \{[^}]*height: 30px !important;/s)
})
