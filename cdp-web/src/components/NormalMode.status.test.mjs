import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')

test('workbench mode is rendered as a read-only status indicator', () => {
  assert.match(normalModeVue, /class="workbench-phase-status"/)
  assert.match(normalModeVue, /class="workbench-phase-dot"/)
  assert.doesNotMatch(normalModeVue, /workbench-mode-switch/)
  assert.doesNotMatch(normalModeVue, /handleWorkbenchModeChange/)
})

test('right panel crowd name header does not repeat the workbench phase status', () => {
  const rightPanelNameHeader = normalModeVue.match(
    /<div class="workbench-name-top">[\s\S]*?<\/div>\s*<\/div>/,
  )?.[0]

  assert.ok(rightPanelNameHeader, 'right panel crowd name header should exist')
  assert.doesNotMatch(rightPanelNameHeader, /solution-status-chip/)
  assert.doesNotMatch(rightPanelNameHeader, /workbenchMode === 'solution-use'/)
})

test('custom field dialog can resolve persisted node display names', () => {
  const customFieldDialogVue = readFileSync(join(currentDir, 'CustomFieldEditDialog.vue'), 'utf8')
  const solutionUseFormVue = readFileSync(join(currentDir, 'SolutionUseForm.vue'), 'utf8')

  assert.match(customFieldDialogVue, /getNodeDisplayNameById/)
  assert.match(customFieldDialogVue, /return getNodeDisplayNameById\(props\.nodeList \|\| \[\], nodeId\)/)
  assert.match(solutionUseFormVue, /binding\.nodeDisplayName \|\| binding\.packageType/)
})

test('derived solution sessions clearly state free editing without mutating the published source', () => {
  assert.doesNotMatch(normalModeVue, /当前内容可自由编辑，不影响原正式方案/)
  assert.match(normalModeVue, /当前内容已偏离原方案结构/)
  assert.doesNotMatch(normalModeVue, /当前内容仍沿用原方案结构/)
  assert.match(normalModeVue, /来源方案：\{\{ currentSolution\.name \|\| '未命名方案' \}\}，当前改动仅保留在工作台/)
})

test('solution-use dynamic form is no longer wrapped in a readonly surface', () => {
  assert.doesNotMatch(normalModeVue, /class="solution-readonly-surface"/)
})

test('crowd naming stays manual while runtime JSON keeps an unnamed fallback', () => {
  assert.match(normalModeVue, /const crowdNameInput = ref\(''\)/)
  assert.match(normalModeVue, /crowdNameInput\.value = ''/)
  assert.match(normalModeVue, /crowdNameInput\.value = snapshot\.crowdNameInput \?\? ''/)

  assert.doesNotMatch(normalModeVue, /\bnameAuto\b/)
  assert.doesNotMatch(normalModeVue, /function generateCrowdName\(/)
  assert.doesNotMatch(normalModeVue, /generateCrowdName\(\)/)
  assert.doesNotMatch(normalModeVue, /名称会随当前自由搭建参数自动生成/)

  const setWorkbenchFromSolution = normalModeVue.match(
    /async function setWorkbenchFromSolution\(record\) \{[\s\S]*?\n\}/,
  )?.[0]
  assert.ok(setWorkbenchFromSolution, 'solution loader should exist')
  assert.match(
    setWorkbenchFromSolution,
    /crowdNameInput\.value = String\(record\?\.defaultCrowdName \?\? ''\)\.trim\(\)/,
  )
  const crowdNameRestore = setWorkbenchFromSolution.match(/crowdNameInput\.value = [^\r\n]+/)?.[0]
  assert.ok(crowdNameRestore, 'solution loader should restore the crowd name')
  assert.doesNotMatch(crowdNameRestore, /record\?\.name/)
  assert.doesNotMatch(crowdNameRestore, /DEFAULT_CROWD_NAME/)

  const buildFinalJson = normalModeVue.match(
    /async function buildFinalJson\(\) \{[\s\S]*?\n\}/,
  )?.[0]
  assert.ok(buildFinalJson, 'runtime JSON builder should exist')
  assert.match(
    buildFinalJson,
    /crowdName: String\(crowdNameInput\.value \|\| ''\)\.trim\(\) \|\| DEFAULT_CROWD_NAME/,
  )
})
