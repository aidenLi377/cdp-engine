import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const BACKGROUND_SCRIPT_PATH = path.resolve('chrome-extension/databank-automation/background.js')
const BACKGROUND_SCRIPT_SOURCE = fs.readFileSync(BACKGROUND_SCRIPT_PATH, 'utf8')

function createBackgroundHarness() {
  let runtimeListener = null
  let now = 0
  let pingCount = 0
  let createdUrl = ''
  const messageTrail = []
  const messagePayloadTrail = []
  const updateTrail = []
  const windowUpdateTrail = []
  const storageData = {
    dmpConditionCache: {
      200: [{ tagId: 200, option: 'A' }],
      201: [],
    },
    columnVisibility: { CTR: false },
    rebaseExcludedTagIds: [300],
  }

  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeListener = listener
        },
      },
    },
    tabs: {
      async query() {
        return []
      },
      async create(payload = {}) {
        createdUrl = payload.url || 'https://databank.tmall.com/#/userDefinedAnalyses'
        return { id: 101, windowId: 88, status: 'complete', url: createdUrl }
      },
      async get(tabId) {
        const isSenderTab = tabId === 7
        return {
          id: tabId,
          windowId: isSenderTab ? 66 : 88,
          status: 'complete',
          url: isSenderTab ? 'http://127.0.0.1:5173/' : createdUrl,
        }
      },
      async update(tabId, payload) {
        updateTrail.push({ tabId, payload })
      },
      async sendMessage(_tabId, payload) {
        messageTrail.push(payload.type)
        messagePayloadTrail.push(payload)
        if (payload.type === 'PING_AUTOMATION_READY') {
          pingCount += 1
          return { ok: true, ready: pingCount >= 3 }
        }
        if (payload.type === 'PING_CROWD_READY') {
          return { ok: true, ready: true }
        }
        if (payload.type === 'PING_DMP_READY') {
          return { ok: true, ready: true, onCrowd: true }
        }
        if (payload.type === 'AUTOMATE_DATABANK') {
          return { ok: true, message: 'done' }
        }
        if (payload.type === 'AUTOMATE_DATABANK_CROWD') {
          return { ok: true, trail: [{ step: 'confirm_dialog_found', stopped: true }] }
        }
        if (payload.type === 'AUTOMATE_DATABANK_WAIT_APPLY') {
          return { ok: true, step: 'manual_apply_confirmed' }
        }
        if (payload.type === 'AUTOMATE_DMP') {
          return { ok: true, crowdId: '888', rowIndex: 0, crowdName: '演示人群' }
        }
        if (payload.type === 'AUTOMATE_DMP_WAIT_PORTRAIT') {
          return { ok: true, step: 'portrait_found' }
        }
        throw new Error(`Unexpected message type: ${payload.type}`)
      },
    },
    windows: {
      async update(windowId, payload) {
        windowUpdateTrail.push({ windowId, payload })
      },
    },
    scripting: {
      async executeScript() {},
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.filter((key) => Object.hasOwn(storageData, key)).map((key) => [key, storageData[key]]))
        },
        async set(patch) {
          Object.assign(storageData, patch)
        },
      },
    },
  }

  const context = {
    console,
    chrome,
    URL,
    Date: { now: () => now },
    setTimeout(callback, delay = 0) {
      now += Number(delay) || 0
      queueMicrotask(callback)
      return now
    },
    clearTimeout() {},
  }

  vm.runInNewContext(BACKGROUND_SCRIPT_SOURCE, context, { filename: BACKGROUND_SCRIPT_PATH })

  async function sendProjectMessage(message) {
    return await new Promise((resolve) => {
      const keepChannelOpen = runtimeListener(
        message,
        { tab: { id: 7, windowId: 66, url: 'http://127.0.0.1:5173/' } },
        (response) => resolve(response),
      )
      assert.equal(keepChannelOpen, true)
    })
  }

  return {
    sendProjectMessage,
    messageTrail,
    messagePayloadTrail,
    updateTrail,
    windowUpdateTrail,
    storageData,
  }
}

test('background waits for the databank page to report ready before sending automation', async () => {
  const harness = createBackgroundHarness()

  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"demo"}',
  })

  assert.deepEqual(harness.messageTrail, [
    'PING_AUTOMATION_READY',
    'PING_AUTOMATION_READY',
    'PING_AUTOMATION_READY',
    'AUTOMATE_DATABANK',
  ])
  assert.equal(response.ok, true)
})

test('background focuses the databank tab during automation so the page is not throttled in the background', async () => {
  const harness = createBackgroundHarness()

  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"demo"}',
  })

  assert.equal(response.ok, true)
  assert.equal(JSON.stringify(harness.updateTrail[0]), JSON.stringify({
    tabId: 101,
    payload: { active: true },
  }))
  assert.equal(JSON.stringify(harness.windowUpdateTrail[0]), JSON.stringify({
    windowId: 88,
    payload: { focused: true },
  }))
  assert.equal(JSON.stringify(harness.updateTrail[harness.updateTrail.length - 1]), JSON.stringify({
    tabId: 7,
    payload: { active: true },
  }))
})

test('background keeps the DMP tab active while waiting for portrait readiness', async () => {
  const harness = createBackgroundHarness()

  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DMP',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '演示人群',
  })

  assert.equal(response.ok, true)
  assert.equal(JSON.stringify(harness.updateTrail[harness.updateTrail.length - 1]), JSON.stringify({
    tabId: 101,
    payload: { active: true },
  }))
})

test('background keeps the DataBank tab active for the human confirmation step', async () => {
  const harness = createBackgroundHarness()

  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK_CROWD',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '演示人群',
  })

  assert.equal(response.ok, true)
  assert.equal(JSON.stringify(harness.updateTrail[harness.updateTrail.length - 1]), JSON.stringify({
    tabId: 101,
    payload: { active: true },
  }))
})

test('background forwards the DataBank manual apply wait to the retained crowd tab', async () => {
  const harness = createBackgroundHarness()
  await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK_CROWD',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '演示人群',
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK_WAIT_APPLY',
    pageUrl: 'http://127.0.0.1:5173/',
  })

  assert.equal(response.ok, true)
  assert.equal(harness.messageTrail.includes('AUTOMATE_DATABANK_WAIT_APPLY'), true)
})

test('background forwards the matched crowd context to the portrait wait step', async () => {
  const harness = createBackgroundHarness()
  const phase1 = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DMP',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '演示人群',
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DMP_WAIT_PORTRAIT',
    pageUrl: 'http://127.0.0.1:5173/',
    phase1Result: phase1,
  })

  const waitMessage = harness.messagePayloadTrail.find((item) => item.type === 'AUTOMATE_DMP_WAIT_PORTRAIT')
  assert.equal(response.ok, true)
  assert.equal(waitMessage.phase1Result.crowdName, '演示人群')
  assert.equal(waitMessage.phase1Result.rowIndex, 0)
})

test('background returns normalized shared DMP settings', async () => {
  const harness = createBackgroundHarness()

  const response = await harness.sendProjectMessage({
    type: 'CDP_DMP_GET_SETTINGS',
    pageUrl: 'http://127.0.0.1:5173/',
  })

  assert.equal(response.ok, true)
  assert.deepEqual(Array.from(response.settings.readyTagIds), ['200'])
  assert.equal(response.settings.columnVisibility.CTR, false)
  assert.equal(response.settings.columnVisibility.PPC, true)
  assert.deepEqual(Array.from(response.settings.rebaseExcludedTagIds), ['300'])
})

test('background persists writable DMP settings without replacing condition readiness', async () => {
  const harness = createBackgroundHarness()

  const response = await harness.sendProjectMessage({
    type: 'CDP_DMP_UPDATE_SETTINGS',
    pageUrl: 'http://127.0.0.1:5173/',
    columnVisibility: { CTR: true, PPC: false },
    rebaseExcludedTagIds: ['200'],
  })

  assert.equal(response.ok, true)
  assert.equal(harness.storageData.columnVisibility.PPC, false)
  assert.deepEqual(Array.from(harness.storageData.rebaseExcludedTagIds), ['200'])
  assert.deepEqual(Array.from(response.settings.readyTagIds), ['200'])
})
