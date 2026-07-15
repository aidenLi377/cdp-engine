import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('published solution cards omit timestamps and keep compact metadata', () => {
  const publishedSolutionCard = normalModeVue.match(/<button[\s\S]*?class="published-solution-item"[\s\S]*?<\/button>/)?.[0] || ''

  assert.match(publishedSolutionCard, /item\.nodes\?\.length/)
  assert.doesNotMatch(publishedSolutionCard, /formatTime|updatedAt|published-solution-meta/)
  assert.doesNotMatch(normalModeVue, /formatTime\(item\.updatedAt\)/)
  assert.doesNotMatch(normalModeVue, /import \{ formatTime,/)
  assert.match(css, /\.published-solution-top,[\s\S]*?\{[^}]*display: flex;[^}]*align-items: flex-start;[^}]*justify-content: space-between;/s)
})

test('left panel search inputs use a line icon instead of emoji prefixes', () => {
  assert.match(normalModeVue, /Search/)
  assert.match(normalModeVue, /<el-icon class="search-prefix-icon"><Search \/><\/el-icon>/)
  assert.doesNotMatch(normalModeVue, /<template #prefix><span[^>]*>[^<]*馃攳/)
  assert.doesNotMatch(normalModeVue, /<template #prefix><span[^>]*>[^<]*馃攷/)
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

test('workbench node scroll area leaves top room for hover lift', () => {
  assert.match(css, /\.canvas-scroll-area \{[^}]*overflow-y: auto;[^}]*padding-top: 8px;/s)
  assert.match(css, /\.node-wrapper \{[^}]*position: relative;/s)
})

test('published solution cards stay neutral until selected', () => {
  assert.match(css, /\.published-solution-item \{[^}]*background: rgba\(255,255,255,0\.86\);/s)
  assert.match(css, /\.published-solution-item:hover \{[^}]*background: rgba\(255,255,255,0\.96\);/s)
  assert.match(css, /\.published-solution-item\.active \{[^}]*border-color: rgba\(255,107,74,0\.34\);[^}]*linear-gradient\(180deg, rgba\(255,255,255,0\.96\) 0%, rgba\(255,244,239,0\.96\) 100%\);/s)
})

test('workbench solution picker switches between personal and public libraries', () => {
  assert.match(normalModeVue, /const publishedLibraryScope = ref\('mine'\)/)
  assert.match(normalModeVue, /class="intercom-radio-group solution-library-switch workbench-library-switch"/)
  assert.match(normalModeVue, /<el-radio-button label="mine">我的方案<\/el-radio-button>/)
  assert.match(normalModeVue, /<el-radio-button label="public">公共方案<\/el-radio-button>/)
  assert.match(normalModeVue, /@change="switchPublishedLibrary"/)
  assert.match(normalModeVue, /listSolutions\([\s\S]*?'published',[\s\S]*?publishedLibraryScope\.value,[\s\S]*?\)/)
  assert.match(normalModeVue, /listFolders\(publishedLibraryScope\.value\)/)
  assert.match(normalModeVue, /function switchPublishedLibrary\(nextScope\)/)
  assert.match(normalModeVue, /selectedPublishedFolderId\.value = null/)
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

test('workbench node labels use shared display names instead of hardcoded node indexes', () => {
  assert.match(normalModeVue, /getNodeDisplayName\(node, index\)/)
  assert.match(normalModeVue, /getNodeDisplayName/)
  assert.doesNotMatch(normalModeVue, /节点 \{\{ index \+ 1 \}\}/)
})

test('duplicated workbench nodes clear custom display names before insertion', () => {
  assert.match(normalModeVue, /cloneNodeForDuplicate/)
  assert.match(normalModeVue, /getNodeDisplayName\(duplicated, index \+ 1\)/)
})

test('applying a solution no longer disables package search or component insertion', () => {
  assert.doesNotMatch(normalModeVue, /:disabled="workbenchMode === 'solution-use' \|\| structureLocked"/)
  assert.doesNotMatch(normalModeVue, /@click="addNode\(pkg\)"[\s\S]*?:disabled="workbenchMode === 'solution-use' \|\| structureLocked"/)
  assert.doesNotMatch(normalModeVue, /if \(workbenchMode\.value === 'solution-use' \|\| structureLocked\.value\) return/)
})

test('workbench delete icon is directly clickable instead of hiding behind a popconfirm wrapper', () => {
  assert.match(normalModeVue, /class="behavior-card-icon-btn danger"[\s\S]*?@click\.stop="removeNode\(index\)"/)
})
