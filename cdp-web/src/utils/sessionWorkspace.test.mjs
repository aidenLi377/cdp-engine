import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearSessionWorkspace,
  readSessionWorkspace,
  writeSessionWorkspace,
} from './sessionWorkspace.js'

function createStorage() {
  const values = new Map()
  return {
    get length() { return values.size },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  }
}

test('session workspace isolates payloads by account and clears only CDP session keys', () => {
  global.window = { sessionStorage: createStorage() }
  window.sessionStorage.setItem('unrelated', 'keep')

  assert.equal(writeSessionWorkspace('workbench.v1', 'user-a', { nodes: [1] }), true)
  assert.deepEqual(readSessionWorkspace('workbench.v1', 'user-a'), { nodes: [1] })
  assert.equal(readSessionWorkspace('workbench.v1', 'user-b'), null)

  clearSessionWorkspace()
  assert.equal(readSessionWorkspace('workbench.v1', 'user-a'), null)
  assert.equal(window.sessionStorage.getItem('unrelated'), 'keep')
  delete global.window
})

test('session workspace safely ignores malformed JSON', () => {
  global.window = { sessionStorage: createStorage() }
  window.sessionStorage.setItem('cdp.session.workbench.v1', '{broken')
  assert.equal(readSessionWorkspace('workbench.v1', 'user-a'), null)
  delete global.window
})
