import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const solutionCenter = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const folderTree = readFileSync(join(currentDir, 'FolderTree.vue'), 'utf8')
const folderTreeNode = readFileSync(join(currentDir, 'FolderTreeNode.vue'), 'utf8')
const shareApi = readFileSync(join(currentDir, '..', 'composables', 'useFolderShareApi.js'), 'utf8')

test('personal folder rows expose a quiet share action for root and nested folders', () => {
  assert.match(solutionCenter, /:share-enabled="libraryScope === 'mine'"/)
  assert.match(solutionCenter, /@share-folder="shareFolder"/)
  assert.match(folderTree, /aria-label="分享方案文件夹"/)
  assert.match(folderTree, /emit\('share-folder', folder\)/)
  assert.match(folderTreeNode, /\$emit\('share-folder', folder\)/)
  assert.match(folderTreeNode, /:share-enabled="shareEnabled"/)
})

test('solution center recognizes a user paste without intercepting editable fields', () => {
  assert.match(solutionCenter, /window\.addEventListener\('paste', handleFolderSharePaste\)/)
  assert.match(solutionCenter, /window\.removeEventListener\('paste', handleFolderSharePaste\)/)
  assert.match(solutionCenter, /event\.clipboardData\?\.getData\('text\/plain'\)/)
  assert.match(solutionCenter, /isClipboardTextTarget\(event\.target\)/)
  assert.match(solutionCenter, /FOLDER_SHARE_PATTERN\.test\(text\)/)
  assert.match(solutionCenter, /await previewFolderShare\(text\)/)
})

test('paste preview imports an independent draft folder and refreshes the personal library', () => {
  assert.match(shareApi, /createFolderShare/)
  assert.match(shareApi, /previewFolderShare/)
  assert.match(shareApi, /importFolderShare/)
  assert.match(solutionCenter, /await importFolderShare\(folderShareText\.value\)/)
  assert.match(solutionCenter, /await Promise\.all\(\[loadFolders\(\), loadSolutions\(\)\]\)/)
  assert.match(solutionCenter, /已导入为可独立编辑的个人草稿/)
  assert.match(solutionCenter, /粘贴方案口令/)
})
