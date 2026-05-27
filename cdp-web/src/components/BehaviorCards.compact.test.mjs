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
  assert.match(normalModeVue, /behavior-card-header/)
  assert.match(solutionCenterVue, /behavior-card-header/)
  assert.match(css, /\.behavior-card-header \{/)
})

test('behavior cards reduce form density and keep compact card spacing', () => {
  assert.match(css, /\.dynamic-form \{[^}]*padding: 18px 20px;/s)
  assert.match(css, /\.card-header-inner \{[^}]*padding: 10px 14px;/s)
  assert.match(css, /\.behavior-card-action-group \{[^}]*gap: 4px;/s)
  assert.match(css, /\.behavior-card-icon-btn\.el-button \{[^}]*width: 26px !important;/s)
})

test('behavior cards style radio choices as compact segmented controls', () => {
  assert.match(css, /\.behavior-card \.intercom-radio-group \{[^}]*display: inline-flex;[^}]*background: transparent;[^}]*border: 0;/s)
  assert.match(css, /\.behavior-card \.intercom-radio-group \.el-radio-button__inner \{[^}]*min-height: 28px !important;[^}]*padding: 0 12px !important;/s)
  assert.match(css, /\.behavior-card \.intercom-radio-group \.el-radio-button__original-radio:checked \+ \.el-radio-button__inner \{[^}]*background: linear-gradient\(135deg, #ff8d6d 0%, #ff6b4a 100%\) !important;/s)
})

test('plain radio choices in behavior cards keep the bullet visually attached to their own label', () => {
  assert.match(css, /\.behavior-card \.el-form-item__content > \.el-radio-group:not\(\.intercom-radio-group\),[^}]*\.behavior-card \.el-form-item__content > \.custom-checkbox-group \{[^}]*column-gap: 26px;[^}]*row-gap: 8px;/s)
  assert.match(css, /\.behavior-card \.el-radio,[^}]*\.behavior-card \.el-checkbox \{[^}]*gap: 2px;[^}]*margin-right: 0 !important;/s)
  assert.match(css, /\.behavior-card \.el-radio__label \{[^}]*padding-left: 2px !important;/s)
  assert.match(css, /\.behavior-card \.el-radio__input \{[^}]*margin-right: 0;/s)
  assert.match(css, /\.behavior-card \.el-checkbox__label \{[^}]*padding-left: 2px !important;/s)
  assert.match(css, /\.behavior-card \.el-checkbox__input \{[^}]*margin-right: 0;/s)
})
