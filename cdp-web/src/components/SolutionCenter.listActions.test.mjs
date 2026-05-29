import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const solutionCenterVue = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('solution sidebar controls are compact and visually secondary', () => {
  assert.match(solutionCenterVue, /class="solution-sidebar-toolbar"/)
  assert.match(solutionCenterVue, /class="solution-sidebar-icon-actions"/)
  assert.match(solutionCenterVue, /class="solution-sidebar-icon-btn"/)
  assert.match(solutionCenterVue, /:icon="RefreshRight"/)
  assert.match(solutionCenterVue, /:icon="CopyDocument"/)
  assert.match(solutionCenterVue, /import \{ Check, CopyDocument, Delete, EditPen, Plus, RefreshRight, Upload \} from '@element-plus\/icons-vue'/)
  assert.match(css, /\.solution-sidebar-controls \{[^}]*gap: 6px;[^}]*padding: 0;[^}]*background: transparent;/s)
  assert.match(css, /\.solution-sidebar-toolbar \{[^}]*display: flex;[^}]*align-items: center;[^}]*gap: 8px;/s)
  assert.match(css, /\.solution-filter-group \.el-radio-button__inner \{[^}]*padding: 4px 0 !important;[^}]*font-size: 12px !important;/s)
  assert.match(css, /\.solution-sidebar-controls \.intercom-input \.el-input__wrapper \{[^}]*min-height: 28px !important;[^}]*font-size: 13px !important;/s)
  assert.match(css, /\.solution-sidebar-icon-btn\.el-button \{[^}]*width: 28px !important;[^}]*height: 28px !important;[^}]*border-radius: 999px !important;/s)
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
  assert.match(solutionCenterVue, /import \{ Check, CopyDocument, Delete, EditPen, Plus, RefreshRight, Upload \} from '@element-plus\/icons-vue'/)
  assert.doesNotMatch(solutionCenterVue, /class="intercom-btn-primary"[\s\S]*?saveDraft/)
  assert.doesNotMatch(solutionCenterVue, /class="intercom-btn-accent"[\s\S]*?publishDraft/)
  assert.match(css, /\.solution-editor-toolbar \{[^}]*flex-wrap: nowrap;/s)
  assert.match(css, /\.solution-toolbar-actions \{[^}]*flex-wrap: nowrap;[^}]*gap: 6px;/s)
  assert.match(css, /\.solution-toolbar-icon-btn\.el-button \{[^}]*width: 30px;[^}]*height: 30px !important;/s)
  assert.match(css, /\.solution-package-select \{[^}]*width: 176px;/s)
})

test('solution center nodes support editable display names in drafts', () => {
  assert.match(solutionCenterVue, /class="solution-node-name-trigger"/)
  assert.match(solutionCenterVue, /class="intercom-input solution-node-name-editor"/)
  assert.match(solutionCenterVue, /v-model="node\.displayName"/)
  assert.match(solutionCenterVue, /beginNodeNameEdit\(node\)/)
  assert.match(solutionCenterVue, /finishNodeNameEdit\(node\)/)
  assert.match(solutionCenterVue, /cancelNodeNameEdit\(node\)/)
  assert.match(solutionCenterVue, /getNodeNameInputStyle\(node, index\)/)
  assert.match(solutionCenterVue, /import \{ getNodeDisplayName, serializeCustomFieldsForSolution, serializeNodesForSolution, cloneNodeForDuplicate, insertNodeAtPosition \} from '\.\.\/utils\/solutionState\.js'/)
  assert.match(css, /\.solution-node-name-trigger,[\s\S]*?\.solution-node-name-editor \{[^}]*max-width: 240px;/s)
  assert.match(css, /\.solution-node-name-trigger \{[^}]*border-radius: 999px;[^}]*cursor: text;/s)
  assert.match(css, /\.solution-node-name-editor \.el-input__wrapper \{[^}]*border-radius: 999px !important;[^}]*font-size: 12px !important;/s)
})

test('solution center description copy stays concise', () => {
  assert.match(solutionCenterVue, />草稿编辑、发布与工作台预览</)
  assert.doesNotMatch(solutionCenterVue, /勾选后会进入工作台方案使用态与预览抽屉/)
})

test('folder selection still filters in all status and all button clears folder context explicitly', () => {
  assert.match(solutionCenterVue, /if \(selectedFolderId\.value\)/)
  assert.match(solutionCenterVue, /@click="handleAllFilterClick"/)
  assert.match(solutionCenterVue, /function handleAllFilterClick\(\)/)
  assert.match(solutionCenterVue, /selectedFolderId\.value = null/)
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

test('solution list items expose inline icon actions without opening the item', () => {
  assert.doesNotMatch(solutionCenterVue, /<button\s+v-for="item in filteredSolutions"/)
  assert.match(solutionCenterVue, /role="button"/)
  assert.match(solutionCenterVue, /@keydown\.enter\.prevent="openSolution\(item\.id\)"/)
  assert.match(solutionCenterVue, /@keydown\.space\.prevent="openSolution\(item\.id\)"/)
  assert.match(solutionCenterVue, /class="solution-list-item-actions"/)
  assert.match(solutionCenterVue, /class="solution-list-icon-btn delete"/)
  assert.match(solutionCenterVue, /@click\.stop="deleteListedSolution\(item\)"/)
  assert.match(solutionCenterVue, /class="solution-list-icon-btn edit-draft"/)
  assert.match(solutionCenterVue, /@click\.stop="createEditDraftFromPublished"/)
  assert.match(solutionCenterVue, /async function deleteListedSolution\(item\)/)
})

test('duplicated solution center nodes clear custom display names and use shared label helper in prompts', () => {
  assert.match(solutionCenterVue, /cloneNodeForDuplicate/)
  assert.match(solutionCenterVue, /getNodeDisplayName\(duplicated, index \+ 1\)/)
})

test('solution list icon actions are compact and card-integrated', () => {
  assert.match(css, /\.solution-list-item-actions \{[^}]*opacity: 0;[^}]*transform: translateX\(4px\);/s)
  assert.match(css, /\.solution-list-item:hover \.solution-list-item-actions,[\s\S]*?\.solution-list-item\.active \.solution-list-item-actions \{[^}]*opacity: 1;[^}]*transform: translateX\(0\);/s)
  assert.match(css, /\.solution-list-icon-btn\.el-button \{[^}]*width: 24px !important;[^}]*height: 24px !important;[^}]*border-radius: 999px !important;/s)
})

test('solution center uses the app main height and keeps the list scrollable', () => {
  assert.match(css, /\.solution-center-page \{[^}]*height: 100%;[^}]*min-height: 0;/s)
  assert.doesNotMatch(css, /\.solution-center-page \{[^}]*height: 100vh;/s)
  assert.match(css, /\.solution-list \{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto;/s)
  assert.match(css, /\.solution-node-scroll,[\s\S]*?\.solution-settings-scroll \{[^}]*overflow-y: auto;[^}]*padding-top: 8px;/s)
  assert.match(css, /\.solution-node-wrapper \{[^}]*position: relative;/s)
  assert.doesNotMatch(solutionCenterVue, /class="solution-sidebar-footer"/)
})

test('active solution is marked inside the card instead of using a separate footer block', () => {
  assert.match(solutionCenterVue, /class="solution-active-dot pulse-breath"/)
  assert.match(solutionCenterVue, /item\.id === activeSolution\?\.id/)
  assert.match(css, /\.solution-active-dot \{[^}]*width: 8px;[^}]*background: radial-gradient\(/s)
})

test('solution center does not expose internal source metadata in the UI', () => {
  assert.doesNotMatch(solutionCenterVue, /activeSolution\.source\s*\|\|\s*['"]manual['"]/)
  assert.doesNotMatch(solutionCenterVue, /item\.source\s*===/)
  assert.doesNotMatch(solutionCenterVue, /const source = String\(item\?\.source/)
  assert.doesNotMatch(solutionCenterVue, />状态信息</)
  assert.doesNotMatch(solutionCenterVue, />来源</)
})
