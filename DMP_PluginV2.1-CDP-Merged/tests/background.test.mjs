import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const BACKGROUND_SCRIPT_PATH = path.resolve(currentDir, '..', 'background.js')
const BACKGROUND_SCRIPT_SOURCE = fs.readFileSync(BACKGROUND_SCRIPT_PATH, 'utf8')

function createBackgroundHarness(options = {}) {
  let runtimeListener = null
  let now = 0
  let pingCount = 0
  const messageTrail = []
  const sentPayloads = []
  const updateTrail = []
  const removeTrail = []
  const windowUpdateTrail = []
  const fetchCalls = []
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
      async query(queryInfo) {
        if (typeof options.tabsQuery === 'function') return await options.tabsQuery(queryInfo)
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
        if (payload.type === 'QUERY_DATABANK_REALTIME_COUNT') {
          return options.realtimeCountResponse || {
            ok: true,
            directRealtime: true,
            crowdCount: 144157,
          }
        }
        if (payload.type === 'CREATE_DATABANK_CROWD_API') {
          return options.directCreateResponse || {
            ok: true,
            directCreate: true,
            preflightPassed: true,
            crowdCreated: true,
            crowdId: 78408082,
          }
        }
        if (payload.type === 'AUTOMATE_DATABANK_CROWD') {
          return {
            ok: true,
            trail: [{ step: payload.autoApply ? 'auto_apply_submitted' : 'confirm_dialog_found' }],
          }
        }
        if (payload.type === 'CANCEL_CDP_AUTOMATION') {
          return { ok: true, cancelled: true }
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
    async fetch(url, init) {
      fetchCalls.push({ url: String(url), init })
      if (typeof options.fetchImpl !== 'function') throw new Error(`Unexpected fetch: ${url}`)
      return await options.fetchImpl(String(url), init)
    },
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
    fetchCalls,
    storageData,
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

test('background waits for the databank page to report ready before sending automation', async () => {
  const harness = createBackgroundHarness()

  const response = await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"demo"}',
    autoCalculate: true,
  })

  assert.deepEqual(harness.messageTrail, [
    'PING_AUTOMATION_READY',
    'PING_AUTOMATION_READY',
    'PING_AUTOMATION_READY',
    'AUTOMATE_DATABANK',
  ])
  assert.equal(response.ok, true)
  assert.equal(harness.sentPayloads.at(-1).autoCalculate, true)
})

test('background runs opt-in realtime count in an existing DataBank tab without opening or focusing a page', async () => {
  const harness = createBackgroundHarness({
    async tabsQuery(queryInfo) {
      assert.equal(queryInfo.url, 'https://databank.tmall.com/*')
      return [{
        id: 222,
        windowId: 99,
        active: false,
        status: 'complete',
        url: 'https://databank.tmall.com/#/customAnalysis',
      }]
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"接口试验包","list":[],"compute":""}',
    crowdName: '接口试验包',
    runId: 'run-api-count-1',
  })

  assert.equal(response.ok, true)
  assert.equal(response.directRealtime, true)
  assert.equal(response.crowdCount, 144157)
  assert.equal(harness.sentPayloads.at(-1).type, 'QUERY_DATABANK_REALTIME_COUNT')
  assert.equal(harness.sentPayloads.at(-1).crowdName, '接口试验包')
  assert.deepEqual(harness.updateTrail, [])
  assert.deepEqual(harness.windowUpdateTrail, [])
})

test('background runs guarded direct creation in an existing DataBank tab without opening or focusing a page', async () => {
  const harness = createBackgroundHarness({
    async tabsQuery(queryInfo) {
      assert.equal(queryInfo.url, 'https://databank.tmall.com/*')
      return [{
        id: 303,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/customAnalysis',
      }]
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_CREATE_DATABANK_CROWD_API',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"接口建包","list":[],"compute":""}',
    crowdName: '接口建包',
    runId: 'run-api-create-1',
  })

  assert.equal(response.ok, true)
  assert.equal(response.directCreate, true)
  assert.equal(response.crowdId, 78408082)
  assert.equal(harness.sentPayloads.at(-1).type, 'CREATE_DATABANK_CROWD_API')
  assert.equal(harness.sentPayloads.at(-1).crowdName, '接口建包')
  assert.deepEqual(harness.updateTrail, [])
  assert.deepEqual(harness.windowUpdateTrail, [])
})

test('background checks an exact crowd name through the API without opening a DataBank tab', async () => {
  const harness = createBackgroundHarness({
    async fetchImpl(url) {
      assert.equal(new URL(url).searchParams.get('keyword'), '目标人群0921')
      return jsonResponse({
        errCode: 0,
        data: {
          list: [
            { id: 1, name: '目标人群0921-近似', status: 'CREATED', count: 99 },
            { id: 2, name: '目标人群0921', status: 'CREATED', count: 4674, gmtCreate: 20 },
          ],
        },
      })
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_CROWD_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '目标人群0921',
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdFound, true)
  assert.equal(response.crowdCount, 4674)
  assert.deepEqual(harness.messageTrail, [])
  assert.deepEqual(harness.updateTrail, [])
})

test('background classifies custom crowd dependencies as ready, waiting, missing, or ambiguous', async () => {
  const fixtures = {
    已就绪: [{ id: 1, name: '已就绪', status: 'CREATED', count: 12, canSelectOrLookalike: 1 }],
    计算中: [{ id: 2, name: '计算中', status: 'CREATING', count: null, canSelectOrLookalike: 0 }],
    未找到: [{ id: 3, name: '未找到-近似', status: 'CREATED', count: 4 }],
    有重名: [
      { id: 4, name: '有重名', status: 'CREATED', count: 5 },
      { id: 5, name: '有重名', status: 'CREATED', count: 6 },
    ],
  }
  const harness = createBackgroundHarness({
    async fetchImpl(url) {
      const keyword = new URL(url).searchParams.get('keyword')
      return jsonResponse({ errCode: 0, data: { list: fixtures[keyword] || [] } })
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_CHECK_DATABANK_CUSTOM_DEPENDENCIES',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdNames: ['已就绪', '计算中', '未找到', '有重名'],
  })

  assert.equal(response.ok, true)
  assert.equal(response.ready, false)
  assert.deepEqual(Array.from(response.results, (item) => item.state), ['ready', 'waiting', 'missing', 'ambiguous'])
  assert.deepEqual(harness.messageTrail, [])
})

test('background returns a login-required code for unauthenticated crowd queries', async () => {
  const harness = createBackgroundHarness({
    async fetchImpl() { return jsonResponse({}, 403) },
  })
  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_CROWD_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '需要登录',
  })
  assert.equal(response.ok, false)
  assert.equal(response.code, 'DATABANK_LOGIN_REQUIRED')
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

test('parameter automation focuses before waiting for load and has no duplicate fixed settle delay', () => {
  const start = BACKGROUND_SCRIPT_SOURCE.indexOf('async function runDatabankParam')
  const end = BACKGROUND_SCRIPT_SOURCE.indexOf('// Run DataBank crowd search', start)
  const flow = BACKGROUND_SCRIPT_SOURCE.slice(start, end)

  assert.ok(flow.indexOf('await focusTab(tab)') < flow.indexOf('await waitForTabComplete(tab.id)'))
  assert.doesNotMatch(flow, /PARAM_PAGE_SETTLE_MS|setTimeout/)
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

test('background hard-stop acknowledges only after cancelling and closing the tracked run tab', async () => {
  const harness = createBackgroundHarness()
  await harness.sendProjectMessage({
    type: 'CDP_AUTOMATE_DATABANK_CROWD',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '待终止人群',
    autoApply: false,
    runId: 'run-stop-1',
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_CANCEL_TASK',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-stop-1',
  })

  assert.equal(response.ok, true)
  assert.equal(response.cancelled, true)
  assert.equal(response.closedTabs, 1)
  assert.equal(harness.sentPayloads.at(-1).type, 'CANCEL_CDP_AUTOMATION')
  assert.equal(harness.sentPayloads.at(-1).runId, 'run-stop-1')
  assert.deepEqual(harness.removeTrail, [101])
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
