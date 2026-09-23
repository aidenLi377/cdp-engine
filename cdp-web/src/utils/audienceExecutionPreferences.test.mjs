import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getDefaultAudienceExecutionMode,
  loadAudienceExecutionPreferences,
  saveAudienceExecutionPreference,
} from './audienceExecutionPreferences.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('eligible audiences default to count-only while large audiences create and count', () => {
  assert.equal(getDefaultAudienceExecutionMode(0), 'calculate_only')
  assert.equal(getDefaultAudienceExecutionMode(6), 'calculate_only')
  assert.equal(getDefaultAudienceExecutionMode(7), 'create_and_count')
})

test('execution choices are remembered per account and solution group', () => {
  const storage = createStorage()
  assert.equal(saveAudienceExecutionPreference('user-a', 'folder:one', 'solution:1', 'create_only', storage), true)
  assert.equal(saveAudienceExecutionPreference('user-a', 'folder:one', 'solution:2', 'calculate_only', storage), true)
  assert.deepEqual(loadAudienceExecutionPreferences('user-a', 'folder:one', storage), {
    'solution:1': 'create_only',
    'solution:2': 'calculate_only',
  })
  assert.deepEqual(loadAudienceExecutionPreferences('user-a', 'folder:two', storage), {})
  assert.deepEqual(loadAudienceExecutionPreferences('user-b', 'folder:one', storage), {})
})
