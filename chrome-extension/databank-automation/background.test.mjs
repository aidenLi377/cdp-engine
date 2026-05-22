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
  const messageTrail = []
  const updateTrail = []
  const windowUpdateTrail = []

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
      async create() {
        return { id: 101, windowId: 88, status: 'complete', url: 'https://databank.tmall.com/#/userDefinedAnalyses' }
      },
      async get(tabId) {
        const isSenderTab = tabId === 7
        return {
          id: tabId,
          windowId: isSenderTab ? 66 : 88,
          status: 'complete',
          url: isSenderTab ? 'http://127.0.0.1:5173/' : 'https://databank.tmall.com/#/userDefinedAnalyses',
        }
      },
      async update(tabId, payload) {
        updateTrail.push({ tabId, payload })
      },
      async sendMessage(_tabId, payload) {
        messageTrail.push(payload.type)
        if (payload.type === 'PING_AUTOMATION_READY') {
          pingCount += 1
          return { ok: true, ready: pingCount >= 3 }
        }
        if (payload.type === 'AUTOMATE_DATABANK') {
          return { ok: true, message: 'done' }
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
    updateTrail,
    windowUpdateTrail,
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
