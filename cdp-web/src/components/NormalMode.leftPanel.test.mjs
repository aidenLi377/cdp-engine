import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('left panel search inputs use a line icon instead of emoji prefixes', () => {
  assert.match(normalModeVue, /import \{ Search \} from '@element-plus\/icons-vue'/)
  assert.match(normalModeVue, /<el-icon class="search-prefix-icon"><Search \/><\/el-icon>/)
  assert.doesNotMatch(normalModeVue, /<template #prefix><span[^>]*>[^<]*🔍/)
  assert.doesNotMatch(normalModeVue, /<template #prefix><span[^>]*>[^<]*🔎/)
  assert.match(css, /\.search-prefix-icon \{[^}]*width: 15px;[^}]*height: 15px;[^}]*color: #9a9aa0;/s)
})

test('workbench scroll lists reserve room for native scrollbars', () => {
  assert.match(css, /\.btn-group,[\s\S]*?\.published-solution-list,[\s\S]*?scrollbar-gutter: stable;/)
  assert.match(css, /\.btn-group,[\s\S]*?\.published-solution-list,[\s\S]*?padding-right: 12px;/)
  assert.match(css, /\.published-solution-item,[\s\S]*?\.intercom-list-item,[\s\S]*?box-sizing: border-box;/)
})

test('package library buttons have room and layer for hover glow', () => {
  assert.match(css, /\.btn-group \{[^}]*gap: 10px;[^}]*padding-top: 8px;[^}]*padding-bottom: 12px;/s)
  assert.match(css, /\.btn-group \.el-button \{[^}]*position: relative;/s)
  assert.match(css, /\.btn-group \.el-button:hover \{[^}]*transform: translateY\(-1px\) !important;[^}]*z-index: 1;/s)
})

test('published solution hover card has room and layer for its glow', () => {
  assert.match(css, /\.published-solution-list \{[^}]*gap: 12px;[^}]*padding-top: 8px;[^}]*padding-bottom: 12px;/s)
  assert.match(css, /\.published-solution-item \{[^}]*position: relative;/s)
  assert.match(css, /\.published-solution-item:hover \{[^}]*border-color: rgba\(0,0,0,0\.12\);[^}]*transform: translateY\(-1px\);[^}]*z-index: 1;/s)
  assert.match(css, /\.published-solution-item\.active \{[^}]*z-index: 2;/s)
})

test('published solution cards stay neutral until selected', () => {
  assert.match(css, /\.published-solution-item \{[^}]*background: rgba\(255,255,255,0\.86\);/s)
  assert.match(css, /\.published-solution-item:hover \{[^}]*background: rgba\(255,255,255,0\.96\);/s)
  assert.match(css, /\.published-solution-item\.active \{[^}]*border-color: rgba\(255,107,74,0\.34\);[^}]*linear-gradient\(180deg, rgba\(255,255,255,0\.96\) 0%, rgba\(255,244,239,0\.96\) 100%\);/s)
})

test('left panel defaults to package library and uses one active panel at a time', () => {
  assert.match(normalModeVue, /const leftPanelMode = ref\('packages'\)/)
  assert.match(normalModeVue, /v-if="leftPanelMode === 'solutions'"/)
  assert.match(normalModeVue, /v-else/)
})

test('left panel has a lightweight border toggle for switching to solutions', () => {
  assert.match(normalModeVue, /class="left-panel-edge-toggle"/)
  assert.match(normalModeVue, /toggleLeftPanelMode/)
  assert.match(normalModeVue, /leftPanelMode === 'packages' \? '选方案' : '组件库'/)
})
