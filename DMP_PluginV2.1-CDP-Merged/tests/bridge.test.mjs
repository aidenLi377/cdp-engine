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
        } else if (payload.type === 'CDP_CHECK_DATABANK_CUSTOM_DEPENDENCIES') {
          callback({ ok: true, ready: false, results: [{ crowdName: payload.crowdNames[0], state: 'waiting', ready: false }] })
        } else if (payload.type === 'CDP_QUERY_DATABANK_REALTIME_COUNT') {
          callback({ ok: true, countReady: true, countThreshold: true, crowdCount: '<2000', directRealtime: true })
        } else if (payload.type === 'CDP_CREATE_DATABANK_CROWD_API') {
          callback({
            ok: true,
            message: '已通过接口创建人群包',
            crowdName: '接口建包',
            crowdCreated: true,
            crowdId: 78408082,
            directCreate: true,
            preflightPassed: true,
          })
        } else if (payload.type === 'CDP_CANCEL_TASK') {
          callback({ ok: true, cancelled: true, closedTabs: 2 })
        } else {
          callback({ ok: true, trail: [{ step: 'done' }], autoCalculated: payload.autoCalculate === true })
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
    autoCalculate: true,
  })
  assert.equal(harness.forwarded[0].type, 'CDP_AUTOMATE_DATABANK')
  assert.equal(harness.forwarded[0].jsonText, '{"demo":true}')
  assert.equal(harness.forwarded[0].autoCalculate, true)
  assert.equal(harness.posted[0].payload.autoCalculated, true)
  assert.equal(harness.forwarded[0].pageUrl, 'http://127.0.0.1:5173/')
  assert.equal(harness.posted[0].payload.requestId, 'request-1')
  assert.equal(harness.posted[0].payload.ok, true)
})

test('bridge forwards the opt-in realtime count request without changing its JSON', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
    requestId: 'realtime-count-1',
    jsonText: '{"crowdName":"接口试验包","list":[],"compute":""}',
    crowdName: '接口试验包',
  })

  assert.equal(harness.forwarded[0].type, 'CDP_QUERY_DATABANK_REALTIME_COUNT')
  assert.equal(harness.forwarded[0].jsonText, '{"crowdName":"接口试验包","list":[],"compute":""}')
  assert.equal(harness.forwarded[0].crowdName, '接口试验包')
  assert.equal(harness.posted[0].payload.requestId, 'realtime-count-1')
  assert.equal(harness.posted[0].payload.ok, true)
  assert.equal(harness.posted[0].payload.countReady, true)
  assert.equal(harness.posted[0].payload.countThreshold, true)
  assert.equal(harness.posted[0].payload.crowdCount, '<2000')
})

test('bridge forwards guarded direct-create requests and exposes the preflight result', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_CREATE_DATABANK_CROWD_API',
    requestId: 'direct-create-1',
    jsonText: '{"crowdName":"接口建包","list":[],"compute":""}',
    crowdName: '接口建包',
  })

  assert.equal(harness.forwarded[0].type, 'CDP_CREATE_DATABANK_CROWD_API')
  assert.equal(harness.forwarded[0].crowdName, '接口建包')
  assert.equal(harness.posted[0].payload.directCreate, true)
  assert.equal(harness.posted[0].payload.preflightPassed, true)
  assert.equal(harness.posted[0].payload.crowdId, 78408082)
  assert.equal(harness.posted[0].payload.crowdName, '接口建包')
  assert.equal(harness.posted[0].payload.message, '已通过接口创建人群包')
})

test('bridge forwards the explicit DataBank auto apply choice', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_AUTOMATE_DATABANK_CROWD',
    requestId: 'crowd-1',
    crowdName: '待推送人群',
    autoApply: true,
  })

  assert.equal(harness.forwarded[0].crowdName, '待推送人群')
  assert.equal(harness.forwarded[0].autoApply, true)
})

test('bridge normalizes custom crowd dependency names and returns their readiness', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_CHECK_DATABANK_CUSTOM_DEPENDENCIES',
    requestId: 'dependencies-1',
    crowdNames: ['  自定义包A  ', '自定义包A', '', '自定义包B'],
  })

  assert.deepEqual(Array.from(harness.forwarded[0].crowdNames), ['自定义包A', '自定义包B'])
  assert.equal(harness.posted[0].payload.ready, false)
  assert.equal(harness.posted[0].payload.results[0].state, 'waiting')
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

test('bridge forwards normalized multi-label direct DMP extraction', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_DMP_DIRECT_EXTRACT',
    requestId: 'dmp-direct-1',
    crowdName: '接口试验包',
    selectedTags: ['114554', '114555', '114554'],
  })
  assert.equal(harness.forwarded[0].type, 'CDP_DMP_DIRECT_EXTRACT')
  assert.equal(harness.forwarded[0].crowdName, '接口试验包')
  assert.deepEqual(Array.from(harness.forwarded[0].selectedTags), ['114554', '114555'])
  assert.equal(harness.posted[0].payload.requestId, 'dmp-direct-1')
})

test('bridge forwards hard-stop requests with the correlated run id and acknowledgement', () => {
  const harness = createHarness()
  harness.dispatch({
    source: 'cdp-web',
    type: 'CDP_CANCEL_TASK',
    requestId: 'cancel-1',
    runId: 'run-42',
  })

  assert.equal(harness.forwarded[0].type, 'CDP_CANCEL_TASK')
  assert.equal(harness.forwarded[0].runId, 'run-42')
  assert.equal(harness.posted[0].payload.requestId, 'cancel-1')
  assert.equal(harness.posted[0].payload.cancelled, true)
  assert.equal(harness.posted[0].payload.closedTabs, 2)
})
