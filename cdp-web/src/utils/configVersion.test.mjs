import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adoptConfigVersion,
  buildMetaVersionKey,
  CONFIG_VERSION_EVENT,
  getKnownConfigVersion,
  normalizeConfigVersion,
  refreshConfigVersion,
  resetConfigVersionState,
} from './configVersion.js'

test('configuration versions are normalized into stable non-negative integers', () => {
  assert.equal(normalizeConfigVersion({ version: 12 }), 12)
  assert.equal(normalizeConfigVersion('7'), 7)
  assert.equal(normalizeConfigVersion(-1), 0)
  assert.equal(normalizeConfigVersion('invalid'), 0)
  assert.equal(buildMetaVersionKey('release-abc', 12), 'release-abc.12')
})

test('adopting a newer published version announces cache invalidation', () => {
  resetConfigVersionState()
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent
  class TestCustomEvent extends Event {
    constructor(type, options = {}) {
      super(type)
      this.detail = options.detail
    }
  }
  globalThis.window = new EventTarget()
  globalThis.CustomEvent = TestCustomEvent
  const announcements = []
  window.addEventListener(CONFIG_VERSION_EVENT, (event) => {
    announcements.push(event.detail)
  })

  try {
    adoptConfigVersion(3)
    adoptConfigVersion({ version: 4 })
    adoptConfigVersion(2)
    assert.equal(getKnownConfigVersion(), 4)
    assert.deepEqual(announcements, [{ version: 4, previousVersion: 3 }])
  } finally {
    resetConfigVersionState()
    globalThis.window = originalWindow
    globalThis.CustomEvent = originalCustomEvent
  }
})

test('version checks bypass browser cache and deduplicate concurrent requests', async () => {
  resetConfigVersionState()
  const originalFetch = globalThis.fetch
  let calls = 0
  let receivedOptions = null
  globalThis.fetch = async (_input, options) => {
    calls += 1
    receivedOptions = options
    return new Response(JSON.stringify({ version: 9 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const versions = await Promise.all([
      refreshConfigVersion(),
      refreshConfigVersion(),
    ])
    assert.deepEqual(versions, [9, 9])
    assert.equal(calls, 1)
    assert.equal(receivedOptions.cache, 'no-store')
  } finally {
    resetConfigVersionState()
    globalThis.fetch = originalFetch
  }
})
