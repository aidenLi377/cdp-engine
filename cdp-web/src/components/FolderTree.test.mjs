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
  assert.match(folderTreeVue, /startEdit\(contextMenu\.value\.folder\.id, contextMenu\.value\.folder\.name\)/)
  assert.match(folderTreeNodeVue, /v-if="editingFolderId === folder\.id"/)
})
