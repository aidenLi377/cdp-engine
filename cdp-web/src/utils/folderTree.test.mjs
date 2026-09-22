import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildFolderSubtreeCounts,
  collectFolderSubtreeIds,
  findFolderById,
} from './folderTree.js'

const folders = [
  {
    id: 'dior',
    name: 'Dior',
    children: [
      { id: 'kol', name: 'KOL', children: [] },
      {
        id: 'analysis',
        name: '分析',
        children: [{ id: 'competitor', name: '竞争分析', children: [] }],
      },
    ],
  },
]

test('collectFolderSubtreeIds includes the selected folder and every descendant', () => {
  assert.deepEqual(
    [...collectFolderSubtreeIds(folders, 'dior')],
    ['dior', 'kol', 'analysis', 'competitor'],
  )
  assert.deepEqual([...collectFolderSubtreeIds(folders, 'kol')], ['kol'])
})

test('buildFolderSubtreeCounts rolls direct item counts up through every ancestor', () => {
  const counts = buildFolderSubtreeCounts(folders, [
    { folderId: 'dior' },
    { folderId: 'kol' },
    { folderId: 'analysis' },
    { folderId: 'competitor' },
    { folderId: 'competitor' },
    { folderId: null },
  ])

  assert.deepEqual(counts, {
    dior: 5,
    kol: 1,
    analysis: 3,
    competitor: 2,
  })
})

test('unknown folders fall back safely without widening the selection', () => {
  assert.equal(findFolderById(folders, 'missing'), null)
  assert.deepEqual([...collectFolderSubtreeIds(folders, 'missing')], ['missing'])
})
