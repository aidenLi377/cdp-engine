import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const dynamicFormVue = readFileSync(join(currentDir, 'DynamicForm.vue'), 'utf8')
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
  assert.match(dynamicFormVue, /label-position="left"/)
  assert.match(dynamicFormVue, /label-width="88px"/)
  assert.match(dynamicFormVue, /size="small"/)
  assert.match(css, /\.dynamic-form \{[^}]*padding: 12px 16px 13px;/s)
  assert.match(css, /\.dynamic-form \.el-form-item \{[^}]*margin-bottom: 8px;/s)
  assert.match(css, /\.card-header-inner \{[^}]*padding: 10px 14px;/s)
  assert.match(css, /\.behavior-card-action-group \{[^}]*gap: 4px;/s)
  assert.match(css, /\.behavior-card-icon-btn\.el-button \{[^}]*width: 26px !important;/s)
})

test('behavior cards style radio choices as compact segmented controls', () => {
  assert.match(css, /\.behavior-card \.intercom-radio-group \{[^}]*display: inline-flex;[^}]*background: transparent;[^}]*border: 0;/s)
  assert.match(css, /\.behavior-card \.intercom-radio-group \.el-radio-button__inner \{[^}]*min-height: 26px !important;[^}]*padding: 0 10px !important;/s)
  assert.match(css, /\.behavior-card \.intercom-radio-group \.el-radio-button__original-radio:checked \+ \.el-radio-button__inner \{[^}]*background: linear-gradient\(135deg, #ff8d6d 0%, #ff6b4a 100%\) !important;/s)
})

test('plain radio choices in behavior cards keep the bullet visually attached to their own label', () => {
  assert.match(css, /\.behavior-card \.el-form-item__content > \.el-radio-group:not\(\.intercom-radio-group\),[^}]*\.behavior-card \.el-form-item__content > \.custom-checkbox-group \{[^}]*column-gap: 20px;[^}]*row-gap: 4px;/s)
  assert.match(css, /\.behavior-card \.el-radio,[^}]*\.behavior-card \.el-checkbox \{[^}]*gap: 2px;[^}]*margin-right: 0 !important;/s)
  assert.match(css, /\.behavior-card \.el-radio__label \{[^}]*padding-left: 2px !important;/s)
  assert.match(css, /\.behavior-card \.el-radio__input \{[^}]*margin-right: 0;/s)
  assert.match(css, /\.behavior-card \.el-checkbox__label \{[^}]*padding-left: 2px !important;/s)
  assert.match(css, /\.behavior-card \.el-checkbox__input \{[^}]*margin-right: 0;/s)
})

test('shared behavior form aligns borderless date and numeric controls', () => {
  assert.match(css, /\.dynamic-form \.el-form-item__label \{[^}]*display: inline-flex;[^}]*align-items: center;/s)
  assert.match(css, /\.range-block \{[^}]*align-items: center;[^}]*flex-wrap: wrap;/s)
  assert.match(dynamicFormVue, /'range-field-row': field\.Widget_Type === '数值_切换' \|\| field\.Widget_Type === '日期_切换'/)
  assert.match(dynamicFormVue, /class="range-block numeric-mode-field"/)
  assert.match(dynamicFormVue, /class="range-block date-mode-field"/)
  assert.match(dynamicFormVue, /class="intercom-input date-recent-number"/)
  assert.match(dynamicFormVue, /:controls="false" size="small" class="intercom-input date-recent-number"/)
  assert.match(css, /#app \.behavior-card \.dynamic-form \.range-field-row \{[^}]*margin-bottom: 4px !important;[^}]*padding: 2px 0;/s)
  assert.match(css, /#app \.behavior-card \.dynamic-form \.el-form-item:not\(\.range-field-row\):has\(\+ \.range-field-row\) \{[^}]*margin-bottom: 4px;/s)
  assert.match(css, /#app \.behavior-card \.dynamic-form \.range-block \.intercom-radio-group \{[^}]*flex: 0 1 var\(--range-mode-width\);/s)
  assert.match(css, /#app \.behavior-card \.dynamic-form \.range-block \.el-radio-button__inner,[\s\S]*?border: 0 !important;/)
  assert.match(css, /#app \.behavior-card \.dynamic-form \.range-block \.range-number-input \{[^}]*width: 108px;/s)
  assert.match(css, /#app \.behavior-card \.dynamic-form \.range-block \.date-recent-number \{[^}]*width: 64px;/s)
  assert.match(css, /#app \.behavior-card \.dynamic-form \.range-block \.date-exact-picker \{[^}]*width: 248px !important;/s)
})

test('the long effect-promotion account label stays within the shared label column', () => {
  assert.match(dynamicFormVue, /getCompactFieldLabel\(field\)/)
  assert.match(dynamicFormVue, /field\?\.Label === '广告账号\(阿里妈妈\)' \? '广告账号'/)
  assert.match(dynamicFormVue, /:title="field\.Label"/)
})
