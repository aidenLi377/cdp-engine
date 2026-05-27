import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('custom field cards render compact +N overflow badges with tooltip content', () => {
  assert.match(normalModeVue, /getCfValueSummaryMeta\(section\)\.primaryText/)
  assert.match(normalModeVue, /getCfValueSummaryMeta\(section\)\.overflowCount > 0/)
  assert.match(normalModeVue, /popper-class="cf-value-tooltip"/)
  assert.match(normalModeVue, /class="cf-use-card-value-row"/)
  assert.match(normalModeVue, /class="cf-type-indicator cf-use-card-dot"/)
  assert.match(normalModeVue, /class="display-body strong cf-use-card-name"/)
  assert.match(normalModeVue, /class="display-mono cf-use-card-more"/)
})

test('custom field card bar uses a horizontal float-rail with stronger interaction styling', () => {
  assert.match(css, /\.cf-cards-bar \{[^}]*overflow-x: auto;[^}]*overflow-y: hidden;/s)
  assert.match(css, /\.cf-cards-bar \{[^}]*padding: 6px 6px 12px 8px;/s)
  assert.match(css, /\.cf-cards-bar \{[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s)
  assert.match(css, /\.cf-cards-bar::before \{[^}]*position: sticky;[^}]*left: 0;[^}]*width: 18px;[^}]*margin-right: 0;/s)
  assert.match(css, /\.cf-use-card \{[^}]*position: relative;[^}]*min-height: 50px;/s)
  assert.match(css, /\.cf-use-card::before \{[^}]*transform: translateX\(-130%\);/s)
  assert.match(css, /\.cf-use-card:hover::before \{[^}]*transform: translateX\(135%\);/s)
  assert.match(css, /\.cf-use-card-count \{[^}]*position: absolute;[^}]*top: 7px;[^}]*right: 8px;/s)
  assert.match(css, /\.cf-use-card-more \{[^}]*height: 16px;[^}]*font-size: 9px;/s)
  assert.match(css, /\.cf-value-tooltip \{[^}]*white-space: pre-line;[^}]*border-radius: 14px !important;/s)
})
