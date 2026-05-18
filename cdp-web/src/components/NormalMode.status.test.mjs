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
