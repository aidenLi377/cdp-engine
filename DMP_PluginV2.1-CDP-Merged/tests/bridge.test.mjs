import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(currentDir, '..', 'bridge.js'), 'utf8')

function createHarness() {
  let messageListener = null
  const posted = []
  const forwarded = []
  const window = {
    location: { href: 'http://127.0.0.1:5173/', origin: 'http://127.0.0.1:5173' },
    addEventListener(type, listener) {
      if (type === 'message') messageListener = listener
    },
    postMessage(payload, origin) {
      posted.push({ payload, origin })
    },
  }
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(payload, callback) {
        forwarded.push(payload)
        if (payload.type === 'CDP_DMP_GET_SETTINGS' || payload.type === 'CDP_DMP_UPDATE_SETTINGS') {
          callback({ ok: true, settings: { readyTagIds: ['200'], columnVisibility: { CTR: false }, rebaseExcludedTagIds: ['300'] } })
        } else {
          callback({ ok: true, trail: [{ step: 'done' }] })
        }
      },
    },
  }
  const context = {
    window,
    chrome,
    console,
    JSON,
    setTimeout() { return 1 },
    clearTimeout() {},
  }
  vm.runInNewContext(source, context, { filename: 'bridge.js' })
  return {
    dispatch(data) {
      messageListener({ source: window, data })
    },
    posted,
    forwarded,
  }
}

test('bridge answers CDP connection ping without starting a task', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_AUTOMATE_DATABANK',
    requestId: 'ping',
    jsonText: '{}',
  })
  assert.equal(harness.forwarded.length, 0)
  assert.equal(harness.posted[0].payload.ok, true)
  assert.equal(harness.posted[0].payload.source, 'databank-extension-bridge')
})

test('bridge forwards DataBank payload and returns the correlated response', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_AUTOMATE_DATABANK',
    requestId: 'request-1',
    jsonText: '{"demo":true}',
  })
  assert.equal(harness.forwarded[0].type, 'CDP_AUTOMATE_DATABANK')
  assert.equal(harness.forwarded[0].jsonText, '{"demo":true}')
  assert.equal(harness.forwarded[0].pageUrl, 'http://127.0.0.1:5173/')
  assert.equal(harness.posted[0].payload.requestId, 'request-1')
  assert.equal(harness.posted[0].payload.ok, true)
})

test('bridge forwards and returns shared DMP settings', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_DMP_UPDATE_SETTINGS',
    requestId: 'settings-1',
    columnVisibility: { CTR: true },
    rebaseExcludedTagIds: ['200'],
  })
  assert.equal(harness.forwarded[0].columnVisibility.CTR, true)
  assert.deepEqual(harness.forwarded[0].rebaseExcludedTagIds, ['200'])
  assert.deepEqual(harness.posted[0].payload.settings.readyTagIds, ['200'])
})
