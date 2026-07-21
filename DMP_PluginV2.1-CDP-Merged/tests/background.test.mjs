import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const BACKGROUND_SCRIPT_PATH = path.resolve(currentDir, '..', 'background.js')
const BACKGROUND_SCRIPT_SOURCE = fs.readFileSync(BACKGROUND_SCRIPT_PATH, 'utf8')

function createBackgroundHarness() {
  let runtimeListener = null
  let now = 0
  let pingCount = 0
  const messageTrail = []
  const sentPayloads = []
  const updateTrail = []
  const removeTrail = []
  const windowUpdateTrail = []
  const storageData = {
    dmpConditionCache: { 200: [{ tagId: 200 }], 201: [] },
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
      async remove(tabId) {
        removeTrail.push(tabId)
      },
      async sendMessage(_tabId, payload) {
        messageTrail.push(payload.type)
        sentPayloads.push(payload)
        if (payload.type === 'PING_AUTOMATION_READY') {
          pingCount += 1
          return { ok: true, ready: pingCount >= 3 }
        }
        if (payload.type === 'PING_CROWD_READY') {
          return { ok: true, ready: true }
        }
        if (payload.type === 'AUTOMATE_DATABANK') {
          return { ok: true, message: 'done' }
        }
        if (payload.type === 'AUTOMATE_DATABANK_CROWD') {
          return {
            ok: true,
            trail: [{ step: payload.autoApply ? 'auto_apply_submitted' : 'confirm_dialog_found' }],
          }
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
        async set(patch) { Object.assign(storageData, patch) },
      },
      session: {
        async get() { return {} },
        async set() {},
        async remove() {},
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
    sentPayloads,
    updateTrail,
    removeTrail,
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

test('background reads and updates shared DMP settings', async () => {
  const harness = createBackgroundHarness()
  const initial = await harness.sendProjectMessage({ type: 'CDP_DMP_GET_SETTINGS', pageUrl: 'http://127.0.0.1:5173/' })
  assert.deepEqual(Array.from(initial.settings.readyTagIds), ['200'])
  assert.equal(initial.settings.columnVisibility.CTR, false)
  assert.equal(initial.settings.columnVisibility.PPC, true)

  const updated = await harness.sendProjectMessage({
    type: 'CDP_DMP_UPDATE_SETTINGS',
    pageUrl: 'http://127.0.0.1:5173/',
    columnVisibility: { PPC: false },
    rebaseExcludedTagIds: ['200'],
  })
  assert.equal(updated.settings.columnVisibility.PPC, false)
  assert.deepEqual(Array.from(harness.storageData.rebaseExcludedTagIds), ['200'])
})

test('background keeps manual DataBank confirmation tabs and forwards autoApply=false', async () => {
  const harness = createBackgroundHarness()
  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK_CROWD',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '人工确认人群',
    autoApply: false,
  })

  const command = harness.sentPayloads.find((payload) => payload.type === 'AUTOMATE_DATABANK_CROWD')
  assert.equal(response.ok, true)
  assert.equal(command.autoApply, false)
  assert.deepEqual(harness.removeTrail, [])
})

test('background closes only successfully auto-applied DataBank tabs and returns focus to the task center', async () => {
  const harness = createBackgroundHarness()
  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK_CROWD',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '自动推送人群',
    autoApply: true,
  })

  assert.equal(response.ok, true)
  assert.deepEqual(harness.removeTrail, [101])
  assert.equal(JSON.stringify(harness.updateTrail.at(-1)), JSON.stringify({
    tabId: 7,
    payload: { active: true },
  }))
})

test('background accepts task messages from the production CDP origin', async () => {
  const harness = createBackgroundHarness()
  const response = await harness.sendProjectMessage({
    type: 'CDP_DMP_GET_SETTINGS',
    pageUrl: 'https://duruo377.top/',
  })

  assert.equal(response.ok, true)
  assert.deepEqual(Array.from(response.settings.readyTagIds), ['200'])
})
