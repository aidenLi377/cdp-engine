import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const solutionCenterVue = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('solution sidebar controls are compact and visually secondary', () => {
  assert.match(css, /\.solution-sidebar-controls \{[^}]*gap: 8px;[^}]*padding: 10px;[^}]*border-radius: 12px;/s)
  assert.match(css, /\.solution-filter-group \.el-radio-button__inner \{[^}]*padding: 5px 0 !important;[^}]*font-size: 12px !important;/s)
  assert.match(css, /\.solution-sidebar-controls \.intercom-input \.el-input__wrapper \{[^}]*min-height: 30px !important;[^}]*font-size: 13px !important;/s)
  assert.match(css, /\.solution-sidebar-controls \.solution-sidebar-actions \.el-button \{[^}]*height: 28px !important;[^}]*font-size: 12px !important;/s)
})

test('custom field management actions exist in right panel', () => {
  assert.match(solutionCenterVue, /class="solution-field-actions"/)
  assert.match(solutionCenterVue, /@click="startCreateCustomField"/)
  assert.match(solutionCenterVue, /@click="clearAllCustomFields"/)
  assert.match(solutionCenterVue, /const customFields = ref/)
  assert.match(solutionCenterVue, /function startCreateCustomField\(\)/)
  assert.match(solutionCenterVue, /function clearAllCustomFields\(\)/)
  assert.match(css, /\.solution-field-action\.el-button \{[^}]*height: 24px !important;[^}]*font-size: 12px !important;/s)
})

test('solution editor toolbar uses compact icon actions in one row', () => {
  assert.match(solutionCenterVue, /class="solution-add-node-control"/)
  assert.match(solutionCenterVue, /class="solution-toolbar-icon-actions"/)
  assert.match(solutionCenterVue, /class="solution-toolbar-icon-btn publish"/)
  assert.match(solutionCenterVue, /import \{ Check, Plus, Upload \} from '@element-plus\/icons-vue'/)
  assert.doesNotMatch(solutionCenterVue, /class="intercom-btn-primary"[\s\S]*?saveDraft/)
  assert.doesNotMatch(solutionCenterVue, /class="intercom-btn-accent"[\s\S]*?publishDraft/)
  assert.match(css, /\.solution-editor-toolbar \{[^}]*flex-wrap: nowrap;/s)
  assert.match(css, /\.solution-toolbar-actions \{[^}]*flex-wrap: nowrap;[^}]*gap: 6px;/s)
  assert.match(css, /\.solution-toolbar-icon-btn\.el-button \{[^}]*width: 30px;[^}]*height: 30px !important;/s)
  assert.match(css, /\.solution-package-select \{[^}]*width: 176px;/s)
})

test('solution center description copy stays concise', () => {
  assert.match(solutionCenterVue, />草稿编辑、发布与工作台预览</)
  assert.doesNotMatch(solutionCenterVue, /勾选后会进入工作台方案使用态与预览抽屉/)
})

test('solution scrollable lists reserve room for the scrollbar', () => {
  assert.match(css, /\.solution-list \{[^}]*padding-right: 12px;[^}]*scrollbar-gutter: stable;/s)
  assert.match(css, /\.solution-list-item,[\s\S]*?\.published-solution-item,[\s\S]*?\.intercom-list-item,[\s\S]*?box-sizing: border-box;/)
  assert.match(css, /\.solution-node-scroll,[\s\S]*?\.solution-settings-scroll \{[^}]*padding-right: 12px;/s)
  assert.match(css, /\.solution-use-scroll \{[^}]*padding-right: 12px;/s)
})

test('active solution list item has room and layer for its glow', () => {
  assert.match(css, /\.solution-list \{[^}]*gap: 12px;[^}]*padding-top: 8px;[^}]*padding-bottom: 12px;/s)
  assert.match(css, /\.solution-list-item \{[^}]*position: relative;/s)
  assert.match(css, /\.solution-list-item:hover,[\s\S]*?\.solution-list-item\.active \{[^}]*transform: translateY\(-1px\);[^}]*z-index: 1;/s)
  assert.match(css, /\.solution-list-item\.active \{[^}]*z-index: 2;/s)
})

test('solution list items expose a delete action without opening the item', () => {
  assert.doesNotMatch(solutionCenterVue, /<button\s+v-for="item in filteredSolutions"/)
  assert.match(solutionCenterVue, /role="button"/)
  assert.match(solutionCenterVue, /@keydown\.enter\.prevent="openSolution\(item\.id\)"/)
  assert.match(solutionCenterVue, /@keydown\.space\.prevent="openSolution\(item\.id\)"/)
  assert.match(solutionCenterVue, /class="solution-list-delete"/)
  assert.match(solutionCenterVue, /@click\.stop="deleteListedSolution\(item\)"/)
  assert.match(solutionCenterVue, /async function deleteListedSolution\(item\)/)
})

test('solution list delete action is styled as a compact secondary control', () => {
  assert.match(css, /\.solution-list-delete\.el-button \{/)
  assert.match(css, /\.solution-list-delete\.el-button \{[^}]*height: 28px !important;/s)
})

test('solution center uses the app main height and keeps the list scrollable', () => {
  assert.match(css, /\.solution-center-page \{[^}]*height: 100%;[^}]*min-height: 0;/s)
  assert.doesNotMatch(css, /\.solution-center-page \{[^}]*height: 100vh;/s)
  assert.match(css, /\.solution-list \{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto;/s)
  assert.match(css, /\.solution-sidebar-footer \{[^}]*margin-top: 18px;[^}]*margin-bottom: 0;/s)
})

test('solution center does not expose internal source metadata in the UI', () => {
  assert.doesNotMatch(solutionCenterVue, /activeSolution\.source\s*\|\|\s*['"]manual['"]/)
  assert.doesNotMatch(solutionCenterVue, /item\.source\s*===/)
  assert.doesNotMatch(solutionCenterVue, /const source = String\(item\?\.source/)
  assert.doesNotMatch(solutionCenterVue, />状态信息</)
  assert.doesNotMatch(solutionCenterVue, />来源</)
})
