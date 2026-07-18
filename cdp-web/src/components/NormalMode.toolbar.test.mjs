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
  assert.match(normalModeVue, /class="workbench-compact-action"/)
  assert.doesNotMatch(normalModeVue, /workbench-primary-action/)
  assert.doesNotMatch(css, /\.workbench-primary-action/)
  assert.doesNotMatch(normalModeVue, /自由搭建当前画布，并可直接存为方案草稿/)
})

test('save draft is a compact secondary toolbar action', () => {
  assert.match(normalModeVue, /class="workbench-compact-action save-draft"/)
  assert.match(normalModeVue, />\s*存草稿\s*</)
  assert.doesNotMatch(normalModeVue, /class="intercom-btn-primary[^"]*"[^>]*\n[\s\S]*?saveWorkbenchDraft/)
  assert.match(css, /\.workbench-compact-action\.save-draft\.el-button \{[^}]*color: #5f6368 !important;/s)
})

test('workbench toolbar stays on one line without widening the canvas', () => {
  assert.match(css, /\.center-panel \{[^}]*min-width: 0;/s)
  assert.match(css, /\.panel-toolbar \{[^}]*flex-wrap: nowrap;/s)
  assert.match(css, /\.workbench-toolbar-copy \{[^}]*min-width: 0;/s)
  assert.match(css, /\.workbench-toolbar-actions \{[^}]*min-width: 0;/s)
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
  assert.match(normalModeVue, /\.\.\.structuredClone\(editableState\)/)
  assert.match(normalModeVue, /schema,\s*logicMatrix,/s)
  assert.doesNotMatch(normalModeVue, /structuredClone\(\{\s*nodeList: toRaw\(nodeList\.value\)/s)
})

test('live JSON generation cancels stale requests when the form changes again', () => {
  assert.match(normalModeVue, /let jsonBuildAbort = null/)
  assert.match(normalModeVue, /signal: buildAbort\.signal/)
  assert.match(normalModeVue, /jsonBuildAbort\?\.abort\(\)\s*clearTimeout\(jsonTimer\)/)
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
  assert.match(css, /\.workbench-toolbar-icon-btn\.el-button \{[^}]*width: 28px !important;[^}]*height: 28px !important;/s)
})
