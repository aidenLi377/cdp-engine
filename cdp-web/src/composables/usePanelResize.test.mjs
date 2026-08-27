import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { clampPanelWidth, panelWidthStorageKey } from './usePanelResize.js'

const componentUrl = name => new URL(`../components/${name}.vue`, import.meta.url)

test('clampPanelWidth enforces the configured range', () => {
  assert.equal(clampPanelWidth(120, 240, 460), 240)
  assert.equal(clampPanelWidth(341.6, 240, 460), 342)
  assert.equal(clampPanelWidth(900, 240, 460), 460)
})

test('panel widths are scoped by user and panel', () => {
  assert.equal(
    panelWidthStorageKey('workbench-left', 'user-7'),
    'cdp.panel-width:v1:user-7:workbench-left',
  )
})

test('all primary work areas expose border-only resize separators', () => {
  const sources = ['NormalMode', 'SolutionCenter', 'TaskCenter']
    .map(name => readFileSync(fileURLToPath(componentUrl(name)), 'utf8'))

  for (const source of sources) {
    assert.match(source, /panel-resize-handle/)
    assert.match(source, /role="separator"/)
    assert.doesNotMatch(source, /拖动调整/)
  }
})

