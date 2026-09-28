import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const folderTreeVue = readFileSync(join(currentDir, 'FolderTree.vue'), 'utf8')
const folderTreeNodeVue = readFileSync(join(currentDir, 'FolderTreeNode.vue'), 'utf8')

test('top-level folder rows support inline rename editing just like child rows', () => {
  assert.match(folderTreeVue, /v-if="editingFolderId === folder\.id"/)
  assert.match(folderTreeVue, /v-model="editName"/)
  assert.match(folderTreeVue, /@keyup\.enter="saveEdit\(folder\.id\)"/)
  assert.match(folderTreeVue, /@keyup\.esc="cancelEdit"/)
  assert.match(folderTreeVue, /@click\.stop="saveEdit\(folder\.id\)"/)
  assert.match(folderTreeVue, /@click\.stop="cancelEdit"/)
})

test('context menu rename action starts edit mode instead of being a dead-end', () => {
  assert.match(folderTreeVue, /function contextRename\(\)/)
  assert.match(folderTreeVue, /contextMenu\.value\.visible = false\s+startEdit\(contextMenu\.value\.folder\.id/)
  assert.match(folderTreeVue, /startEdit\(contextMenu\.value\.folder\.id, contextMenu\.value\.folder\.name\)/)
  assert.match(folderTreeNodeVue, /v-if="editingFolderId === folder\.id"/)
})

test('folder rename uses compact icon actions and a compact input', () => {
  for (const source of [folderTreeVue, folderTreeNodeVue]) {
    assert.match(source, /aria-label="确认重命名"/)
    assert.match(source, /aria-label="取消重命名"/)
    assert.match(source, /width: 26px;/)
    assert.match(source, /height: 26px;/)
    assert.match(source, /min-height: 28px !important;/)
  }
})

test('folder rows use a monochrome vector icon instead of a colored emoji', () => {
  assert.match(folderTreeVue, /import \{ Folder as FolderIcon \} from '@element-plus\/icons-vue'/)
  assert.match(folderTreeNodeVue, /import \{ Folder as FolderIcon \} from '@element-plus\/icons-vue'/)
  assert.match(folderTreeVue, /<el-icon class="folder-icon"><FolderIcon \/><\/el-icon>/)
  assert.match(folderTreeNodeVue, /<el-icon class="folder-icon"><FolderIcon \/><\/el-icon>/)
  assert.doesNotMatch(folderTreeVue, /📂/)
  assert.doesNotMatch(folderTreeNodeVue, /📂/)
})

test('only eligible leaf folders expose a compact combination badge without replacing folder selection', () => {
  assert.match(folderTreeVue, /class="folder-batch-badge"/)
  assert.match(folderTreeVue, /!hasFolderChildren\(folder\)[\s\S]*?getBatchCount\(folder\.id\) >= 2/)
  assert.match(folderTreeNodeVue, /!hasChildren[\s\S]*?getBatchCount\(folder\.id\) >= 2/)
  assert.match(folderTreeVue, /getBatchCount\(folder\.id\) >= 2/)
  assert.match(folderTreeVue, /@click\.stop="openBatchFolder\(folder\.id\)"/)
  assert.match(folderTreeVue, /emit\('batch-apply', folderId\)/)
  assert.match(folderTreeNodeVue, /@click\.stop="\$emit\('batch-apply', folder\.id\)"/)
  assert.match(folderTreeVue, /<span aria-hidden="true">✦<\/span>/)
  assert.match(folderTreeNodeVue, /<span aria-hidden="true">✦<\/span>/)
})

test('new solution groups use a compact creation form without asking for execution policy', () => {
  assert.match(folderTreeVue, /class="folder-create-heading"[\s\S]*?新建方案组/)
  assert.match(folderTreeVue, /class="folder-create-fields"[\s\S]*?placeholder="方案组名称"/)
  assert.match(folderTreeVue, /class="folder-create-actions"[\s\S]*?>取消<[\s\S]*?>创建</)
  assert.doesNotMatch(folderTreeVue, /默认执行|createExecutionMode|folder-create-mode/)
  assert.match(folderTreeVue, /emit\('folders-changed', \{ action: 'create', parentId, name \}\)/)
})

test('folder names select and toggle expandable rows with keyboard parity', () => {
  assert.match(folderTreeVue, /@click="activateFolder\(folder\)"/)
  assert.match(folderTreeVue, /@keydown\.enter\.prevent="activateFolder\(folder\)"/)
  assert.match(folderTreeVue, /if \(hasFolderChildren\(folder\)\) toggleExpand\(folder\.id\)/)
  assert.match(folderTreeNodeVue, /@click="activateFolder"/)
  assert.match(folderTreeNodeVue, /if \(hasChildren\.value\) emit\('toggle-expand', props\.folder\.id\)/)
  assert.match(folderTreeVue, /:aria-expanded="hasFolderChildren\(folder\)/)
  assert.match(folderTreeNodeVue, /:aria-expanded="hasChildren/)
})

test('leaf folders keep alignment without exposing a false expansion affordance', () => {
  assert.match(folderTreeVue, /v-if="hasFolderChildren\(folder\)"[\s\S]*?class="folder-expand-toggle"/)
  assert.match(folderTreeVue, /v-else class="folder-expand-toggle" style="visibility:hidden"/)
  assert.match(folderTreeNodeVue, /v-if="hasChildren"/)
  assert.match(folderTreeNodeVue, /v-else class="folder-expand-toggle" style="visibility:hidden"/)
})

test('nested folder drops stop at the target row and show its complete path', () => {
  for (const source of [folderTreeVue, folderTreeNodeVue]) {
    assert.match(source, /@dragenter\.stop\.prevent=/)
    assert.match(source, /@dragover\.stop\.prevent=/)
    assert.match(source, /@drop\.stop\.prevent=/)
    assert.match(source, /\.folder-tree-row\.drag-over/)
    assert.doesNotMatch(source, /\.folder-tree-node\.drag-over/)
  }
  assert.match(folderTreeNodeVue, /移动到 \{\{ dropTargetPath \}\}/)
  assert.match(folderTreeNodeVue, /:folder-path="\[\.\.\.folderPath, child\.name\]"/)
  assert.match(folderTreeVue, /window\.setTimeout\([\s\S]*?600\)/)
})
