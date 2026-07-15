import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const BRIDGE_PATH = path.resolve('chrome-extension/databank-automation/bridge.js')
const source = fs.readFileSync(BRIDGE_PATH, 'utf8')

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
        callback({
          ok: true,
          settings: {
            readyTagIds: ['200'],
            columnVisibility: { CTR: false },
            rebaseExcludedTagIds: ['300'],
          },
        })
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
  vm.runInNewContext(source, context, { filename: BRIDGE_PATH })
  return {
    dispatch(data) {
      messageListener({ source: window, data })
    },
    posted,
    forwarded,
  }
}

test('bridge forwards a DMP settings read and returns the settings payload', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_DMP_GET_SETTINGS',
    requestId: 1,
  })

  assert.equal(harness.forwarded[0].type, 'CDP_DMP_GET_SETTINGS')
  assert.deepEqual(harness.posted[0].payload.settings.readyTagIds, ['200'])
})

test('bridge forwards only the supplied writable DMP settings', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_DMP_UPDATE_SETTINGS',
    requestId: 2,
    columnVisibility: { CTR: true, PPC: false },
    rebaseExcludedTagIds: ['200'],
  })

  assert.deepEqual(harness.forwarded[0].columnVisibility, { CTR: true, PPC: false })
  assert.deepEqual(harness.forwarded[0].rebaseExcludedTagIds, ['200'])
  assert.equal(harness.posted[0].payload.settings.columnVisibility.CTR, false)
})

test('bridge forwards the DataBank manual apply wait message', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_AUTOMATE_DATABANK_WAIT_APPLY',
    requestId: 3,
  })

  assert.equal(harness.forwarded[0].type, 'CDP_AUTOMATE_DATABANK_WAIT_APPLY')
})
