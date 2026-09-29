import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const BACKGROUND_SCRIPT_PATH = path.resolve(currentDir, '..', 'background.js')
const BACKGROUND_SCRIPT_SOURCE = fs.readFileSync(BACKGROUND_SCRIPT_PATH, 'utf8')
const DMP_RESULT_CORE_SOURCE = fs.readFileSync(path.resolve(currentDir, '..', 'dmp-result-core.js'), 'utf8')

function createBackgroundHarness(options = {}) {
  let runtimeListener = null
  let dmpRequestListener = null
  let databankHeadersListener = null
  let now = 0
  let pingCount = 0
  const messageTrail = []
  const sentPayloads = []
  const sentTabIds = []
  const updateTrail = []
  const removeTrail = []
  const windowUpdateTrail = []
  const fetchCalls = []
  const pageFetchCalls = []
  const createdTabs = []
  const createdTabStates = new Map()
  let nextDmpTabId = 102
  let nextDatabankTabId = 101
  const storageData = {
    dmpConditionCache: { 200: [{ tagId: 200 }], 201: [] },
    columnVisibility: { CTR: false },
    rebaseExcludedTagIds: [300],
  }
  const sessionData = { ...(options.sessionData || {}) }

  const chrome = {
    runtime: {
      getURL(resource) { return `chrome-extension://test/${resource}` },
      onMessage: {
        addListener(listener) {
          runtimeListener = listener
        },
      },
    },
    tabs: {
      async query(queryInfo) {
        if (typeof options.tabsQuery === 'function') {
          const tabs = await options.tabsQuery(queryInfo)
          for (const tab of tabs || []) {
            if (Number.isInteger(tab?.id)) createdTabStates.set(tab.id, { ...tab })
          }
          return tabs
        }
        return []
      },
      async create(createInfo = {}) {
        const isDmp = String(createInfo.url || '').startsWith('https://dmp.taobao.com/')
        const tab = {
          id: isDmp ? nextDmpTabId++ : nextDatabankTabId++,
          windowId: 88,
          status: 'complete',
          url: createInfo.url || 'https://databank.tmall.com/#/userDefinedAnalyses',
        }
        createdTabs.push({ ...createInfo, id: tab.id })
        createdTabStates.set(tab.id, tab)
        if (isDmp && options.autoCaptureDmpAuth && dmpRequestListener) {
          dmpRequestListener({
            initiator: 'https://dmp.taobao.com',
            tabId: tab.id,
            url: 'https://dmp.taobao.com/api_2/crowd/?bizCode=dmp&_tb_token_=fresh-token&_csrf=fresh-csrf&csrfId=fresh-id&spm=fresh-spm',
          })
        }
        return tab
      },
      async get(tabId) {
        if (createdTabStates.has(tabId)) return createdTabStates.get(tabId)
        const isSenderTab = tabId === 7
        const isDmpTab = tabId === 99
        if (isDmpTab && options.dmpTabClosed) throw new Error('No tab with id: 99')
        return {
          id: tabId,
          windowId: isSenderTab ? 66 : 88,
          status: 'complete',
          url: isSenderTab
            ? 'http://127.0.0.1:5173/'
            : isDmpTab
              ? 'https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId=1'
              : 'https://databank.tmall.com/#/userDefinedAnalyses',
        }
      },
      async update(tabId, payload) {
        updateTrail.push({ tabId, payload })
        const tab = createdTabStates.get(tabId)
        if (tab) Object.assign(tab, payload)
        if (
          tab
          && options.autoCaptureDmpAuth
          && String(payload?.url || '').startsWith('https://dmp.taobao.com/')
          && dmpRequestListener
        ) {
          dmpRequestListener({
            initiator: 'https://dmp.taobao.com',
            tabId,
            url: 'https://dmp.taobao.com/api_2/crowd/?bizCode=dmp&_tb_token_=fresh-token&_csrf=fresh-csrf&csrfId=fresh-id&spm=fresh-spm',
          })
        }
        if (
          tab
          && options.autoCaptureDmpAnalysis
          && String(payload?.url || '').includes('insight-new/perspective')
          && runtimeListener
        ) {
          const crowdId = new URL(String(payload.url).replace('#!', '?route=')).searchParams.get('crowdId')
            || String(payload.url).match(/[?&]crowdId=([^&]+)/)?.[1]
            || '1'
          runtimeListener(
            {
              type: 'DMP_CAPTURE_ANALYSIS_CONTEXT',
              url: `https://dmp.taobao.com/api_2/analysis/tag/114554?bizCode=dmp&_tb_token_=fresh-token&_csrf=fresh-csrf&csrfId=fresh-id&spm=fresh-spm`,
              payload: {
                version: '2.0', crowdId,
                selectTagOptionSet: { operator: 1, selectTagOptionSet: [], selects: [] },
                needUnknown: false, ext: {}, effectQuery: { indexTypes: ['ctr', 'ppc'] },
              },
            },
            { tab: { ...tab } },
            () => {},
          )
        }
      },
      async remove(tabId) {
        removeTrail.push(tabId)
        createdTabStates.delete(tabId)
      },
      async sendMessage(_tabId, payload) {
        messageTrail.push(payload.type)
        sentPayloads.push(payload)
        sentTabIds.push(_tabId)
        if (payload.type === 'PING_AUTOMATION_READY') {
          pingCount += 1
          return { ok: true, ready: pingCount >= 3 }
        }
        if (payload.type === 'PING_CROWD_READY') {
          return { ok: true, ready: true }
        }
        if (payload.type === 'AUTOMATE_DATABANK') {
          if (
            (payload.executionMode === 'context_warmup' || options.captureWarmupForAnyAutomation)
            && options.warmupRequestHeaders
            && databankHeadersListener
          ) {
            databankHeadersListener({
              tabId: _tabId,
              url: 'https://databank.tmall.com/api/paasapi',
              requestHeaders: Object.entries(options.warmupRequestHeaders)
                .map(([name, value]) => ({ name, value })),
            })
          }
          return options.warmupAutomationResponse || { ok: true, message: 'done' }
        }
        if (payload.type === 'QUERY_DATABANK_REALTIME_COUNT') {
          if (typeof options.realtimeCountResponse === 'function') {
            return await options.realtimeCountResponse(payload, _tabId)
          }
          return options.realtimeCountResponse || {
            ok: true,
            directRealtime: true,
            crowdCount: 144157,
          }
        }
        if (payload.type === 'CREATE_DATABANK_CROWD_API') {
          if (typeof options.directCreateResponse === 'function') {
            return await options.directCreateResponse(payload, _tabId)
          }
          return options.directCreateResponse || {
            ok: true,
            directCreate: true,
            preflightPassed: true,
            crowdCreated: true,
            crowdId: 78408082,
          }
        }
        if (payload.type === 'PREPARE_DATABANK_API_CONTEXT') {
          const configured = typeof options.databankContextResponse === 'function'
            ? await options.databankContextResponse(payload, _tabId)
            : options.databankContextResponse
          const fallback = payload.requestHeaders?.['x-csrf-token']
            ? {
                ok: true,
                ready: true,
                source: 'page_security_context',
                requestHeaders: payload.requestHeaders,
              }
            : {
                ok: true,
                ready: false,
                source: 'page_missing_context',
                requestHeaders: {},
              }
          const response = configured || fallback
          return response?.ready === true
            ? { accountKey: 'brand:test', accountSource: 'brand_id', ...response }
            : response
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
      async executeScript(details) {
        if (!details?.func) return []
        const [url, init] = details.args || []
        pageFetchCalls.push({
          tabId: details.target?.tabId,
          world: details.world,
          url: String(url),
          init,
        })
        if (typeof options.pageFetchImpl !== 'function') throw new Error(`Unexpected page fetch: ${url}`)
        return [{ result: await options.pageFetchImpl(String(url), init) }]
      },
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.filter((key) => Object.hasOwn(storageData, key)).map((key) => [key, storageData[key]]))
        },
        async set(patch) { Object.assign(storageData, patch) },
      },
      session: {
        async get(keys) { return Object.fromEntries(keys.filter((key) => Object.hasOwn(sessionData, key)).map((key) => [key, sessionData[key]])) },
        async set(patch) { Object.assign(sessionData, patch) },
        async remove(keys) {
          for (const key of (Array.isArray(keys) ? keys : [keys])) delete sessionData[key]
        },
      },
    },
    webRequest: {
      onBeforeRequest: {
        addListener(listener) { dmpRequestListener = listener },
      },
      onBeforeSendHeaders: {
        addListener(listener) { databankHeadersListener = listener },
      },
    },
  }

  const context = {
    console,
    chrome,
    URL,
    AbortController,
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

  vm.runInNewContext(DMP_RESULT_CORE_SOURCE, context, { filename: 'dmp-result-core.js' })
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

  async function captureDmpAnalysisContext(url, payload) {
    return await new Promise((resolve) => {
      const keepChannelOpen = runtimeListener(
        { type: 'DMP_CAPTURE_ANALYSIS_CONTEXT', url, payload },
        { tab: { id: 99, windowId: 77, url: 'https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId=1' } },
        (response) => resolve(response),
      )
      assert.equal(keepChannelOpen, false)
    })
  }

  return {
    sendProjectMessage,
    captureDmpAnalysisContext,
    advanceTime(milliseconds) { now += Number(milliseconds) || 0 },
    captureDmpRequest(details) { dmpRequestListener(details) },
    captureDatabankHeaders(details) { databankHeadersListener(details) },
    messageTrail,
    sentPayloads,
    sentTabIds,
    updateTrail,
    removeTrail,
    windowUpdateTrail,
    fetchCalls,
    pageFetchCalls,
    createdTabs,
    storageData,
    sessionData,
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

function pageJsonResponse(body, status = 200) {
  return {
    requestCompleted: true,
    status,
    ok: status >= 200 && status < 300,
    url: 'https://dmp.taobao.com/api_2/test',
    redirected: false,
    contentType: 'application/json;charset=UTF-8',
    text: JSON.stringify(body),
  }
}

test('direct DMP extraction reuses a captured payload for multiple tags without opening a DMP tab', async () => {
  const harness = createBackgroundHarness({
    async fetchImpl(url, init) {
      if (url.endsWith('/dmp_tags_dictionary.json')) {
        return jsonResponse([
          {
            tagId: '114554', tagName: '用户性别', mainCategory: '用户特征',
            category: '基础特征', needCondition: false,
          },
          {
            tagId: '114555', tagName: '用户年龄', mainCategory: '用户特征',
            category: '基础特征', needCondition: false,
          },
        ])
      }
      throw new Error(`DMP API must not run from the extension service worker: ${url}`)
    },
    async pageFetchImpl(url, init) {
      if (url.includes('/api_2/crowd/')) {
        const params = new URL(url).searchParams
        assert.equal(params.get('crowdName'), '接口试验包')
        assert.equal(params.get('_tb_token_'), 'test-token')
        assert.equal(params.get('_csrf'), 'test-csrf')
        assert.equal(params.get('csrfId'), 'test-id')
        assert.equal(params.get('spm'), 'test-spm')
        assert.equal(init.credentials, 'include')
        return pageJsonResponse({
          info: { ok: true, code: 0 },
          data: { list: [
            { crowdId: 1, crowdName: '接口试验包-近似', coverage: 999 },
            {
              crowdId: 42, crowdName: '接口试验包', coverage: 100,
              storageType: 1, selectTagOptionSet: { operator: 1, selects: [{ tagId: 132581 }] },
            },
          ] },
        })
      }
      const tagId = url.match(/\/api_2\/analysis\/tag\/(\d+)/)?.[1]
      assert.ok(['114554', '114555'].includes(tagId))
      assert.equal(new URL(url).searchParams.get('_tb_token_'), 'test-token')
      assert.equal(new URL(url).searchParams.get('_csrf'), 'test-csrf')
      assert.equal(new URL(url).searchParams.get('csrfId'), 'test-id')
      assert.equal(new URL(url).searchParams.get('spm'), 'test-spm')
      assert.equal(init.method, 'POST')
      assert.equal(init.credentials, 'include')
      const body = JSON.parse(init.body)
      assert.equal(body.crowdId, 42)
      assert.equal(body.selectTagOptionSet.selectTagOptionSet[0].id, 42)
      assert.equal(body.selectTagOptionSet.selectTagOptionSet[0].storageType, 1)
      assert.deepEqual(body.effectQuery, {
        indexTypes: ['ctr', 'ppc'], cateId: '50025705', deliverType: 4,
      })
      if (tagId === '114555') {
        return pageJsonResponse({
          info: { ok: true, code: 0 },
          data: { chartDataFull: [
            { tagName: '用户年龄', optionName: '25-29岁', rate: '0.25', ctrIndex: '8', ppcIndex: '1.2-1.4' },
          ] },
        })
      }
      return pageJsonResponse({
        info: { ok: true, code: 0 },
        data: { chartDataFull: [
          { tagName: '用户性别', optionName: '女性用户', rate: '0.6', ctrIndex: '6', ppcIndex: '1.0-1.2' },
          { tagName: '用户性别', optionName: '男性用户', rate: '0.4', ctrIndex: '7', ppcIndex: '0.8-1.0' },
        ] },
      })
    },
  })
  const captured = await harness.captureDmpAnalysisContext(
    'https://dmp.taobao.com/api_2/analysis/tag/114554?bizCode=dmp&_tb_token_=test-token&_csrf=test-csrf&csrfId=test-id&spm=test-spm',
    {
      version: '2.0',
      crowdId: 1,
      selectTagOptionSet: { operator: 1, selectTagOptionSet: [], selects: [] },
      needUnknown: false,
      ext: {},
      effectQuery: { indexTypes: ['ctr', 'ppc'], cateId: '50025705', deliverType: 4 },
    },
  )
  assert.equal(captured.ok, true)
  harness.advanceTime(24 * 60 * 60 * 1000)
  const response = await harness.sendProjectMessage({
    type: 'CDP_DMP_DIRECT_EXTRACT', pageUrl: 'http://127.0.0.1:5173/', runId: 'dmp-run-1',
    crowdName: '接口试验包', selectedTags: ['114554', '114555'],
  })
  assert.equal(response.ok, true)
  assert.equal(response.crowdId, 42)
  assert.equal(response.crowdCount, 100)
  assert.equal(response.results.length, 3)
  assert.equal(response.results[0]['覆盖人数'], '60')
  assert.equal(response.results[0]['Rebase'], '60%')
  assert.equal(response.results[0]['CTR'], '6')
  assert.equal(response.results[2]['标签名称'], '用户年龄')
  assert.equal(response.results[2]['覆盖人数'], '25')
  assert.equal(response.results[2]['Rebase'], '100%')
  assert.deepEqual(Array.from(response.trail, (item) => item.step), [
    'analysis_context_ready', 'searched', 'matched',
    'tag_extracted', 'tag_extracted', 'data_extracted',
  ])
  assert.deepEqual(harness.createdTabs, [])
  assert.deepEqual(harness.updateTrail, [])
  assert.equal(harness.fetchCalls.length, 1)
  assert.equal(harness.pageFetchCalls.length, 3)
  assert.ok(harness.pageFetchCalls.every((call) => call.tabId === 99 && call.world === 'MAIN'))
})

test('direct DMP extraction never creates a carrier tab when the captured portrait page is gone', async () => {
  const harness = createBackgroundHarness({
    dmpTabClosed: true,
    autoCaptureDmpAuth: true,
    async fetchImpl(url) {
      if (url.endsWith('/dmp_tags_dictionary.json')) {
        return jsonResponse([{
          tagId: '114554', tagName: '用户性别', mainCategory: '用户特征',
          category: '基础特征', needCondition: false,
        }])
      }
      throw new Error(`DMP API must not run from the extension service worker: ${url}`)
    },
    async pageFetchImpl(url, init) {
      if (url.includes('/api_2/crowd/')) {
        return pageJsonResponse({
          info: { ok: true, code: 0 },
          data: { list: [{
            crowdId: 88, crowdName: '已关闭画像页的人群', coverage: 123456,
            storageType: 1, selectTagOptionSet: { operator: 1, selects: [{ tagId: 132581 }] },
          }] },
        })
      }
      assert.equal(init.method, 'POST')
      return pageJsonResponse({
        info: { ok: true, code: 0 },
        data: { chartDataFull: [
          { tagName: '用户性别', optionName: '女性用户', rate: '0.5', ctrIndex: '6', ppcIndex: '1.0-1.2' },
        ] },
      })
    },
  })
  const captured = await harness.captureDmpAnalysisContext(
    'https://dmp.taobao.com/api_2/analysis/tag/114554?bizCode=dmp&_tb_token_=test-token&_csrf=test-csrf&csrfId=test-id',
    {
      version: '2.0', crowdId: 1,
      selectTagOptionSet: { operator: 1, selectTagOptionSet: [], selects: [] },
      needUnknown: false, ext: {}, effectQuery: { indexTypes: ['ctr', 'ppc'] },
    },
  )
  assert.equal(captured.ok, true)
  harness.advanceTime(31 * 60 * 1000)

  const response = await harness.sendProjectMessage({
    type: 'CDP_DMP_DIRECT_EXTRACT', pageUrl: 'http://127.0.0.1:5173/', runId: 'dmp-run-temp-tab',
    crowdName: '已关闭画像页的人群', selectedTags: ['114554'],
  })

  assert.equal(response.ok, false)
  assert.equal(response.code, 'DMP_PAGE_REQUIRED')
  assert.match(response.error, /不会自动创建或关闭后台标签页/)
  assert.deepEqual(harness.createdTabs, [])
  assert.deepEqual(harness.removeTrail, [])
  assert.deepEqual(harness.pageFetchCalls, [])
  assert.deepEqual(harness.updateTrail, [])
  assert.deepEqual(harness.windowUpdateTrail, [])
})

test('direct DMP extraction reuses an existing DMP page for first portrait and restores its original URL', async () => {
  let crowdSearchCalls = 0
  const harness = createBackgroundHarness({
    autoCaptureDmpAuth: true,
    autoCaptureDmpAnalysis: true,
    async tabsQuery(queryInfo) {
      assert.equal(queryInfo.url, 'https://dmp.taobao.com/*')
      return [{
        id: 99,
        windowId: 88,
        status: 'complete',
        url: 'https://dmp.taobao.com/index_new.html#!/crowds-new/list',
      }]
    },
    async fetchImpl(url) {
      if (url.endsWith('/dmp_tags_dictionary.json')) {
        return jsonResponse([{
          tagId: '114554', tagName: '用户性别', mainCategory: '用户特征',
          category: '基础特征', needCondition: false,
        }])
      }
      throw new Error(`Unexpected extension fetch: ${url}`)
    },
    async pageFetchImpl(url, init) {
      if (url.includes('/api_2/crowd/')) {
        crowdSearchCalls += 1
        assert.equal(new URL(url).searchParams.get('crowdName'), '待取数人群')
        assert.equal(new URL(url).searchParams.get('_tb_token_'), 'fresh-token')
        return pageJsonResponse({
          info: { ok: true, code: 0 },
          data: { list: [{
            crowdId: 66, crowdName: '待取数人群', coverage: 200,
            storageType: 1, selectTagOptionSet: { operator: 1, selects: [{ tagId: 132581 }] },
          }] },
        })
      }
      assert.equal(init.method, 'POST')
      return pageJsonResponse({
        info: { ok: true, code: 0 },
        data: { chartDataFull: [
          { tagName: '用户性别', optionName: '女性用户', rate: '0.5', ctrIndex: '6', ppcIndex: '1.0-1.2' },
        ] },
      })
    },
  })
  const response = await harness.sendProjectMessage({
    type: 'CDP_DMP_DIRECT_EXTRACT', pageUrl: 'http://127.0.0.1:5173/', runId: 'dmp-run-missing-context',
    crowdName: '待取数人群', selectedTags: ['114554'],
    batchId: 'dmp-run-missing-context', batchIndex: 1, batchTotal: 2,
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdId, 66)
  assert.equal(response.crowdCount, 200)
  assert.equal(response.results[0]['覆盖人数'], '100')
  assert.equal(response.trail[0].source, 'auto_portrait')
  assert.equal(response.trail[0].warmedUp, true)
  assert.equal(crowdSearchCalls, 2)
  assert.deepEqual(harness.createdTabs, [])
  assert.equal(harness.updateTrail.length, 3)
  assert.equal(harness.updateTrail[0].tabId, 99)
  assert.match(harness.updateTrail[0].payload.url, /cdpWarmup=/)
  assert.match(harness.updateTrail[1].payload.url, /insight-new\/perspective\?crowdId=66/)
  assert.equal(harness.updateTrail[2].payload.url, 'https://dmp.taobao.com/index_new.html#!/crowds-new/list')
  assert.deepEqual(harness.removeTrail, [])
  assert.ok(harness.pageFetchCalls.every((call) => call.tabId === 99 && call.world === 'MAIN'))
  assert.deepEqual(harness.windowUpdateTrail, [])

  const initializationUpdateCount = harness.updateTrail.length
  const secondResponse = await harness.sendProjectMessage({
    type: 'CDP_DMP_DIRECT_EXTRACT', pageUrl: 'http://127.0.0.1:5173/', runId: 'dmp-run-missing-context',
    crowdName: '待取数人群', selectedTags: ['114554'],
    batchId: 'dmp-run-missing-context', batchIndex: 2, batchTotal: 2,
  })

  assert.equal(secondResponse.ok, true)
  assert.equal(secondResponse.trail[0].source, 'batch_cached')
  assert.equal(secondResponse.trail[0].reusedForBatch, true)
  assert.equal(secondResponse.trail[0].batchId, 'dmp-run-missing-context')
  assert.equal(secondResponse.trail[0].batchIndex, 2)
  assert.equal(crowdSearchCalls, 3)
  assert.equal(harness.updateTrail.length, initializationUpdateCount)
})

test('direct DMP extraction never fabricates a portrait payload when the official page does not provide one', async () => {
  const harness = createBackgroundHarness({
    autoCaptureDmpAuth: true,
    async tabsQuery(queryInfo) {
      assert.equal(queryInfo.url, 'https://dmp.taobao.com/*')
      return [{
        id: 99,
        windowId: 88,
        status: 'complete',
        url: 'https://dmp.taobao.com/index_new.html#!/crowds-new/list',
      }]
    },
    async pageFetchImpl(url) {
      assert.ok(url.includes('/api_2/crowd/'))
      return pageJsonResponse({
        info: { ok: true, code: 0 },
        data: { list: [{
          crowdId: 77, crowdName: '无画像请求的人群', coverage: 10,
          storageType: 1, selectTagOptionSet: { operator: 1, selects: [] },
        }] },
      })
    },
  })
  const response = await harness.sendProjectMessage({
    type: 'CDP_DMP_DIRECT_EXTRACT', pageUrl: 'http://127.0.0.1:5173/', runId: 'dmp-run-no-official-payload',
    crowdName: '无画像请求的人群', selectedTags: ['114554'],
  })

  assert.equal(response.ok, false)
  assert.match(response.error, /未产生真实画像请求/)
  assert.equal(harness.updateTrail.length, 3)
  assert.match(harness.updateTrail[1].payload.url, /insight-new\/perspective\?crowdId=77/)
  assert.equal(harness.updateTrail[2].payload.url, 'https://dmp.taobao.com/index_new.html#!/crowds-new/list')
  assert.deepEqual(harness.createdTabs, [])
  assert.deepEqual(harness.removeTrail, [])
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
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      requestHeaders: { 'x-csrf-token': 'batch-csrf-count' },
    },
  })

  const prepared = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-api-count-1',
  })
  assert.equal(prepared.ready, true)
  assert.equal(prepared.sessionReady, true)

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
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      requestHeaders: { 'x-csrf-token': 'batch-csrf-create' },
    },
  })

  const prepared = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-api-create-1',
  })
  assert.equal(prepared.ready, true)
  assert.equal(prepared.sessionReady, true)

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

test('an uncertain create response is never submitted a second time for the same account and name', async () => {
  let createAttempts = 0
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 304,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      accountKey: 'brand:29478',
      accountSource: 'brand_id',
      requestHeaders: { 'x-csrf-token': 'uncertain-create-csrf' },
    },
    directCreateResponse() {
      createAttempts += 1
      return { ok: false, code: 'DATABANK_DIRECT_API_FAILED', error: '响应中断' }
    },
    async fetchImpl() {
      return jsonResponse({ errCode: 0, data: { total: 0, list: [] } })
    },
  })
  const runId = 'run-uncertain-create'
  await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  const request = {
    type: 'CDP_CREATE_DATABANK_CROWD_API',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"绝不重复","list":[],"compute":""}',
    crowdName: '绝不重复',
    runId,
  }
  const first = await harness.sendProjectMessage(request)
  const second = await harness.sendProjectMessage(request)

  assert.equal(first.ok, false)
  assert.equal(second.ok, false)
  assert.equal(second.code, 'DATABANK_CREATE_CONFIRMATION_PENDING')
  assert.equal(createAttempts, 1)
  assert.match(second.error, /不会再次创建/)
})

test('an uncertain create guard survives a service worker restart and still blocks a duplicate', async () => {
  let createAttempts = 0
  const sharedOptions = {
    async tabsQuery() {
      return [{
        id: 305,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      accountKey: 'brand:29478',
      accountSource: 'brand_id',
      requestHeaders: { 'x-csrf-token': 'restart-guard-csrf' },
    },
    directCreateResponse() {
      createAttempts += 1
      return { ok: false, code: 'DATABANK_DIRECT_API_FAILED', error: '响应中断' }
    },
    async fetchImpl() {
      return jsonResponse({ errCode: 0, data: { total: 0, list: [] } })
    },
  }

  const firstHarness = createBackgroundHarness(sharedOptions)
  await firstHarness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-before-restart',
  })
  const first = await firstHarness.sendProjectMessage({
    type: 'CDP_CREATE_DATABANK_CROWD_API',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"重启保护","list":[],"compute":""}',
    crowdName: '重启保护',
    runId: 'run-before-restart',
  })
  assert.equal(first.ok, false)
  assert.equal(createAttempts, 1)

  const restartedHarness = createBackgroundHarness({
    ...sharedOptions,
    sessionData: structuredClone(firstHarness.sessionData),
  })
  await restartedHarness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-after-restart',
  })
  const retried = await restartedHarness.sendProjectMessage({
    type: 'CDP_CREATE_DATABANK_CROWD_API',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"重启保护","list":[],"compute":""}',
    crowdName: '重启保护',
    runId: 'run-after-restart',
  })

  assert.equal(retried.ok, false)
  assert.equal(retried.code, 'DATABANK_CREATE_CONFIRMATION_PENDING')
  assert.equal(createAttempts, 1)
  assert.match(retried.error, /不会再次创建/)
})

test('a confirmed create remains guarded until the exact-name list exposes it', async () => {
  let createAttempts = 0
  const sharedOptions = {
    async tabsQuery() {
      return [{
        id: 306,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      accountKey: 'brand:confirmed-create',
      accountSource: 'brand_id',
      requestHeaders: { 'x-csrf-token': 'confirmed-create-csrf' },
    },
    directCreateResponse() {
      createAttempts += 1
      return {
        ok: true,
        directCreate: true,
        preflightPassed: true,
        crowdCreated: true,
        crowdId: 78408083,
      }
    },
    async fetchImpl() {
      return jsonResponse({ errCode: 0, data: { total: 0, list: [] } })
    },
  }
  const harness = createBackgroundHarness(sharedOptions)
  const runId = 'run-confirmed-create-guard'
  await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  const request = {
    type: 'CDP_CREATE_DATABANK_CROWD_API',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"成功后等待列表同步","list":[],"compute":""}',
    crowdName: '成功后等待列表同步',
    runId,
  }

  const first = await harness.sendProjectMessage(request)
  assert.equal(first.ok, true)
  assert.equal(harness.sessionData.cdpDatabankCreateGuards['brand:confirmed-create\n成功后等待列表同步'].state, 'confirmed')

  const restartedHarness = createBackgroundHarness({
    ...sharedOptions,
    sessionData: structuredClone(harness.sessionData),
  })
  await restartedHarness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-confirmed-create-after-restart',
  })
  const retriedBeforeIndexing = await restartedHarness.sendProjectMessage({
    ...request,
    runId: 'run-confirmed-create-after-restart',
  })

  assert.equal(retriedBeforeIndexing.ok, false)
  assert.equal(retriedBeforeIndexing.code, 'DATABANK_CREATE_CONFIRMATION_PENDING')
  assert.equal(createAttempts, 1)
  assert.match(retriedBeforeIndexing.error, /不会再次创建/)
  assert.equal(restartedHarness.sessionData.cdpDatabankCreateGuards['brand:confirmed-create\n成功后等待列表同步'].state, 'confirmed')
})

test('DataBank API operations reuse one locked tab and context for the whole run', async () => {
  let tabQueryCount = 0
  const harness = createBackgroundHarness({
    async tabsQuery() {
      tabQueryCount += 1
      return [{
        id: tabQueryCount === 1 ? 401 : 402,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      requestHeaders: { 'x-csrf-token': 'batch-session-csrf' },
    },
  })

  const runId = 'run-batch-session-1'
  const prepared = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  assert.equal(prepared.sessionReady, true)

  for (const crowdName of ['批次包一', '批次包二']) {
    const response = await harness.sendProjectMessage({
      type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
      pageUrl: 'http://127.0.0.1:5173/',
      jsonText: JSON.stringify({ crowdName, list: [], compute: '' }),
      crowdName,
      runId,
    })
    assert.equal(response.ok, true)
    assert.equal(response.reusedBatchContext, true)
  }

  const countCommandIndexes = harness.sentPayloads
    .map((payload, index) => ({ payload, index }))
    .filter(({ payload }) => payload.type === 'QUERY_DATABANK_REALTIME_COUNT')
    .map(({ index }) => index)
  assert.deepEqual(countCommandIndexes.map((index) => harness.sentTabIds[index]), [401, 401])
  assert.equal(tabQueryCount, 1)

  const released = await harness.sendProjectMessage({
    type: 'CDP_RELEASE_DATABANK_API_SESSION',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  assert.equal(released.released, true)
})

test('existing crowd preflights stay lightweight and the first missing crowd prepares one reusable batch session', async () => {
  let tabQueryCount = 0
  let contextInspectionCount = 0
  const existingCrowds = new Map([
    ['前置包一', { id: 11, name: '前置包一', status: 'CREATED', count: 1100 }],
    ['前置包二', { id: 12, name: '前置包二', status: 'CREATED', count: 2200 }],
  ])
  const harness = createBackgroundHarness({
    async tabsQuery() {
      tabQueryCount += 1
      return [{
        id: 405,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse() {
      contextInspectionCount += 1
      return {
        ok: true,
        ready: true,
        source: 'page_security_context',
        accountKey: 'brand:mixed-batch',
        accountSource: 'brand_id',
        requestHeaders: { 'x-csrf-token': 'mixed-batch-csrf' },
      }
    },
    async fetchImpl(url) {
      const keyword = new URL(url).searchParams.get('keyword')
      const crowd = existingCrowds.get(keyword)
      return jsonResponse({
        errCode: 0,
        data: { total: crowd ? 1 : 0, list: crowd ? [crowd] : [] },
      })
    },
  })

  for (const crowdName of existingCrowds.keys()) {
    const existing = await harness.sendProjectMessage({
      type: 'CDP_QUERY_DATABANK_CROWD_COUNT',
      pageUrl: 'http://127.0.0.1:5173/',
      crowdName,
    })
    assert.equal(existing.crowdFound, true)
  }
  assert.equal(tabQueryCount, 0)
  assert.equal(contextInspectionCount, 0)
  assert.equal(harness.sentPayloads.some((payload) => payload.type === 'PREPARE_DATABANK_API_CONTEXT'), false)

  const runId = 'run-mixed-existing-and-missing'
  const prepared = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  assert.equal(prepared.sessionReady, true)

  const created = await harness.sendProjectMessage({
    type: 'CDP_CREATE_DATABANK_CROWD_API',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"首个缺失包","list":[],"compute":""}',
    crowdName: '首个缺失包',
    runId,
  })
  const counted = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"后续缺失包","list":[],"compute":""}',
    crowdName: '后续缺失包',
    runId,
  })

  assert.equal(created.ok, true)
  assert.equal(created.reusedBatchContext, true)
  assert.equal(counted.ok, true)
  assert.equal(counted.reusedBatchContext, true)
  assert.equal(tabQueryCount, 1)
  assert.equal(contextInspectionCount, 1)
  assert.equal(harness.sentPayloads.filter((payload) => payload.type === 'PREPARE_DATABANK_API_CONTEXT').length, 1)
  const operationIndexes = harness.sentPayloads
    .map((payload, index) => ({ payload, index }))
    .filter(({ payload }) => ['CREATE_DATABANK_CROWD_API', 'QUERY_DATABANK_REALTIME_COUNT'].includes(payload.type))
  assert.deepEqual(operationIndexes.map(({ index }) => harness.sentTabIds[index]), [405, 405])
})

test('a changed DataBank security token stops an active batch instead of reusing stale account context', async () => {
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 406,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      accountKey: 'brand:before-switch',
      accountSource: 'brand_id',
      requestHeaders: { 'x-csrf-token': 'csrf-before-switch' },
    },
  })
  const runId = 'run-account-switch'
  await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })

  harness.captureDatabankHeaders({
    tabId: 406,
    requestHeaders: [{ name: 'x-csrf-token', value: 'csrf-after-switch' }],
  })
  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"切换账号后不得继续","list":[],"compute":""}',
    crowdName: '切换账号后不得继续',
    runId,
  })

  assert.equal(response.ok, false)
  assert.equal(response.code, 'DATABANK_REQUEST_CONTEXT_REQUIRED')
  assert.match(response.error, /账号或接口安全信息已变化/)
  assert.equal(harness.sentPayloads.some((payload) => payload.type === 'QUERY_DATABANK_REALTIME_COUNT'), false)
})

test('DataBank batch context is automatically refreshed at most once after an explicit invalid-context response', async () => {
  let countAttempts = 0
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 403,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      requestHeaders: { 'x-csrf-token': 'refreshed-csrf' },
    },
    realtimeCountResponse() {
      countAttempts += 1
      return countAttempts === 1
        ? { ok: false, code: 'DATABANK_REQUEST_CONTEXT_REQUIRED', error: '接口环境已失效' }
        : { ok: true, directRealtime: true, crowdCount: 24680 }
    },
  })

  const runId = 'run-batch-refresh-1'
  await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"恢复测试","list":[],"compute":""}',
    crowdName: '恢复测试',
    runId,
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdCount, 24680)
  assert.equal(response.contextRefreshed, true)
  assert.equal(countAttempts, 2)
})

test('a strict API retry never falls back to DataBank page warm-up', async () => {
  let countAttempts = 0
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 407,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      requestHeaders: { 'x-csrf-token': 'strict-retry-csrf' },
    },
    realtimeCountResponse() {
      countAttempts += 1
      return { ok: false, code: 'DATABANK_REQUEST_CONTEXT_REQUIRED', error: '接口环境已失效' }
    },
  })

  const runId = 'run-strict-api-retry'
  await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    jsonText: '{"crowdName":"严格接口重试","list":[],"compute":""}',
    crowdName: '严格接口重试',
    runId,
    allowPageWarmup: false,
  })

  assert.equal(response.ok, false)
  assert.equal(response.code, 'DATABANK_REQUEST_CONTEXT_REQUIRED')
  assert.equal(countAttempts, 1)
  assert.equal(harness.sentPayloads.some((payload) => payload.type === 'AUTOMATE_DATABANK'), false)
})

test('background prepares the DataBank API context from an already-open page without focusing it', async () => {
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 304,
        windowId: 91,
        active: false,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      requestHeaders: {
        'x-csrf-token': 'csrf-from-page',
        'x-requested-with': 'XMLHttpRequest',
      },
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    openSetup: false,
  })

  assert.equal(response.ok, true)
  assert.equal(response.ready, true)
  assert.equal(response.source, 'page_security_context')
  assert.equal(harness.sessionData.cdpDatabankRequestContext.headers['x-csrf-token'], 'csrf-from-page')
  assert.deepEqual(harness.updateTrail, [])
  assert.deepEqual(harness.windowUpdateTrail, [])
})

test('background initializes DataBank with the fixed lightweight payload inside an already-open parameter page', async () => {
  const taskJson = '{"crowdName":"首次当前任务","list":[],"compute":""}'
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 305,
        windowId: 91,
        active: false,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    warmupRequestHeaders: {
      'x-csrf-token': 'csrf-from-automated-warmup',
      'x-requested-with': 'XMLHttpRequest',
      'bx-v': 'bx-from-automated-warmup',
    },
    captureWarmupForAnyAutomation: true,
    warmupAutomationResponse: {
      ok: true,
      executionMode: 'calculate_only',
      countReady: true,
      crowdCount: 19000,
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    openSetup: false,
    autoWarmup: true,
    jsonText: taskJson,
    crowdName: '首次当前任务',
    executionMode: 'calculate_only',
    precheckedNoMatch: true,
  })

  assert.equal(response.ok, true)
  assert.equal(response.ready, true)
  assert.equal(response.warmedUp, true)
  assert.equal(response.source, 'lightweight_page_initialization')
  assert.equal(response.usedCurrentTask, false)
  assert.equal(response.warmupResult, null)
  assert.equal(harness.createdTabs.length, 0)
  assert.deepEqual(harness.updateTrail, [])
  assert.deepEqual(harness.windowUpdateTrail, [])
  assert.deepEqual(harness.removeTrail, [])
  assert.equal(harness.sessionData.cdpDatabankRequestContext.headers['x-csrf-token'], 'csrf-from-automated-warmup')
  const warmupPayload = harness.sentPayloads.find((payload) => payload.executionMode === 'context_warmup')
  assert.ok(warmupPayload)
  assert.deepEqual(JSON.parse(warmupPayload.jsonText), {
    crowdName: '未命名',
    list: [{
      selectionLv1: ['FULL_LINK', 'FULL_LINK'],
      selectionLv3: {
        cate: 'ALL',
        types: ['15187#|#D_ROYALTY'],
        dateType: 'RELATIVE_RANGE',
        dateValue: '30',
      },
      fromPoolId: 1,
    }],
    compute: '(0)',
  })
  assert.equal(warmupPayload.precheckedNoMatch, true)
})

test('background temporarily reuses and restores an open DataBank tab outside the parameter page', async () => {
  const originalUrl = 'https://databank.tmall.com/#/home'
  const taskJson = '{"crowdName":"后台复用当前任务","list":[],"compute":""}'
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 309,
        windowId: 91,
        active: false,
        status: 'complete',
        url: originalUrl,
      }]
    },
    warmupRequestHeaders: {
      'x-csrf-token': 'csrf-from-reused-tab',
      'x-requested-with': 'XMLHttpRequest',
      'bx-v': 'bx-from-reused-tab',
    },
    captureWarmupForAnyAutomation: true,
    warmupAutomationResponse: {
      ok: true,
      executionMode: 'calculate_only',
      countReady: true,
      crowdCount: 330000,
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-reuse-generic-tab',
    autoWarmup: true,
    jsonText: taskJson,
    crowdName: '后台复用当前任务',
    executionMode: 'calculate_only',
    precheckedNoMatch: true,
  })

  assert.equal(response.ready, true)
  assert.equal(response.usedCurrentTask, false)
  assert.equal(response.warmupResult, null)
  assert.deepEqual(harness.createdTabs, [])
  assert.deepEqual(harness.windowUpdateTrail, [])
  assert.deepEqual(
    harness.updateTrail.map(item => [item.tabId, String(item.payload?.url || '')]),
    [
      [309, 'https://databank.tmall.com/#/userDefinedAnalyses'],
      [309, originalUrl],
    ],
  )
})

test('background never treats the lightweight warm-up as the current task result', async () => {
  const taskJson = JSON.stringify({
    crowdName: '首次真实任务',
    list: [{
      selectionLv1: ['FULL_LINK', 'FULL_LINK'],
      selectionLv3: { cate: 'ALL', types: ['15186#|#D_BUY'], dateType: 'RELATIVE_RANGE', dateValue: '7' },
      fromPoolId: 0,
    }],
    compute: '(0)',
  })
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 306,
        windowId: 91,
        active: false,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    warmupRequestHeaders: {
      'x-csrf-token': 'csrf-from-minimal-warmup',
      'x-requested-with': 'XMLHttpRequest',
      'bx-v': 'bx-from-minimal-warmup',
    },
    captureWarmupForAnyAutomation: true,
    warmupAutomationResponse: {
      ok: true,
      executionMode: 'calculate_only',
      countReady: true,
      crowdCount: 154643,
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId: 'run-current-task-warmup',
    autoWarmup: true,
    jsonText: taskJson,
    crowdName: '首次真实任务',
    executionMode: 'calculate_only',
    precheckedNoMatch: true,
  })

  assert.equal(response.ready, true)
  assert.equal(response.usedCurrentTask, false)
  assert.equal(response.source, 'lightweight_page_initialization')
  assert.equal(response.warmupResult, null)
  const warmupPayload = harness.sentPayloads.find((payload) => payload.type === 'AUTOMATE_DATABANK')
  assert.equal(warmupPayload.executionMode, 'context_warmup')
  assert.equal(JSON.parse(warmupPayload.jsonText).crowdName, '未命名')
  assert.notDeepEqual(JSON.parse(warmupPayload.jsonText), JSON.parse(taskJson))
  assert.equal(warmupPayload.precheckedNoMatch, true)
})

test('DataBank context remains reusable after 30 minutes while the account and page stay unchanged', async () => {
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 307,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      accountKey: 'brand:long-lived',
      accountSource: 'brand_id',
      requestHeaders: { 'x-csrf-token': 'long-lived-csrf' },
    },
  })
  const runId = 'run-long-lived-context'
  const prepared = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
  })
  assert.equal(prepared.ready, true)
  harness.advanceTime(24 * 60 * 60 * 1000)

  const result = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_REALTIME_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    runId,
    jsonText: '{"crowdName":"长期缓存","list":[],"compute":""}',
    crowdName: '长期缓存',
  })
  assert.equal(result.ok, true)
  assert.equal(result.crowdCount, 144157)
  assert.equal(result.reusedBatchContext, true)
})

test('DataBank restores the cached security context when switching back to a known account', async () => {
  let account = 'brand:A'
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 308,
        windowId: 91,
        active: true,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse(payload) {
      const supplied = String(payload?.requestHeaders?.['x-csrf-token'] || '')
      const expected = account === 'brand:A' ? 'csrf-a' : 'csrf-b'
      return {
        ok: true,
        ready: supplied === expected,
        source: supplied === expected ? 'page_security_context' : 'page_missing_context',
        accountKey: account,
        accountSource: 'brand_id',
        requestHeaders: supplied === expected ? { 'x-csrf-token': supplied } : {},
      }
    },
  })

  harness.captureDatabankHeaders({
    tabId: 308,
    requestHeaders: [{ name: 'x-csrf-token', value: 'csrf-a' }],
  })
  let response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT', pageUrl: 'http://127.0.0.1:5173/',
  })
  assert.equal(response.ready, true)

  account = 'brand:B'
  harness.captureDatabankHeaders({
    tabId: 308,
    requestHeaders: [{ name: 'x-csrf-token', value: 'csrf-b' }],
  })
  response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT', pageUrl: 'http://127.0.0.1:5173/',
  })
  assert.equal(response.ready, true)

  account = 'brand:A'
  response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT', pageUrl: 'http://127.0.0.1:5173/',
  })
  assert.equal(response.ready, true)
  assert.equal(harness.sessionData.cdpDatabankRequestContext.accountKey, 'brand:A')
  assert.equal(harness.sessionData.cdpDatabankRequestContext.headers['x-csrf-token'], 'csrf-a')
})

test('background never opens a hidden DataBank page when no reusable page exists', async () => {
  const harness = createBackgroundHarness()
  const response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    autoWarmup: true,
  })

  assert.equal(response.ok, true)
  assert.equal(response.ready, false)
  assert.equal(response.source, 'automated_warmup_failed')
  assert.match(response.error, /不会在后台自动打开或关闭页面/)
  assert.deepEqual(harness.createdTabs, [])
  assert.deepEqual(harness.removeTrail, [])
})

test('background skips automated warm-up when an open page exposes real context', async () => {
  const harness = createBackgroundHarness({
    async tabsQuery() {
      return [{
        id: 305,
        windowId: 91,
        active: false,
        status: 'complete',
        url: 'https://databank.tmall.com/#/userDefinedAnalyses',
      }]
    },
    databankContextResponse: {
      ok: true,
      ready: true,
      source: 'page_security_context',
      requestHeaders: { 'x-csrf-token': 'already-real' },
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_PREPARE_DATABANK_API_CONTEXT',
    pageUrl: 'http://127.0.0.1:5173/',
    autoWarmup: true,
  })

  assert.equal(response.ready, true)
  assert.equal(response.source, 'page_security_context')
  assert.equal(harness.createdTabs.length, 0)
  assert.equal(harness.sentPayloads.some((payload) => payload.executionMode === 'context_warmup'), false)
})

test('background checks an exact crowd name through the API without opening a DataBank tab', async () => {
  const harness = createBackgroundHarness({
    async fetchImpl(url) {
      assert.equal(new URL(url).searchParams.get('keyword'), '目标人群0921')
      assert.equal(new URL(url).searchParams.get('pageSize'), '20')
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

test('an exact-name lookup stops its own request before the bridge timeout', async () => {
  const harness = createBackgroundHarness({
    async fetchImpl(_url, init = {}) {
      return await new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_CROWD_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '超时查询包',
  })

  assert.equal(response.ok, false)
  assert.equal(response.code, 'DATABANK_API_TIMEOUT')
  assert.match(response.error, /检查同名人群包超时/)
})

test('background trusts the server-filtered keyword search instead of scanning the full crowd library', async () => {
  const harness = createBackgroundHarness({
    async fetchImpl(url) {
      assert.equal(new URL(url).searchParams.get('page'), '1')
      assert.equal(new URL(url).searchParams.get('pageSize'), '20')
      return jsonResponse({
        errCode: 0,
        data: {
          total: 1,
          list: [{ id: 101, name: '分页目标', status: 'CREATED', count: 321 }],
        },
      })
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_QUERY_DATABANK_CROWD_COUNT',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdName: '分页目标',
  })

  assert.equal(response.crowdFound, true)
  assert.equal(response.crowdId, 101)
  assert.equal(response.crowdCount, 321)
  assert.equal(harness.fetchCalls.length, 1)
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

test('background checks custom crowd dependencies with at most three concurrent API requests', async () => {
  let activeRequests = 0
  let maxActiveRequests = 0
  const harness = createBackgroundHarness({
    async fetchImpl(url) {
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
      await new Promise(resolve => setTimeout(resolve, 5))
      activeRequests -= 1
      const keyword = new URL(url).searchParams.get('keyword')
      return jsonResponse({
        errCode: 0,
        data: {
          total: 1,
          list: [{ id: keyword, name: keyword, status: 'CREATED', count: 1, canSelectOrLookalike: 1 }],
        },
      })
    },
  })

  const response = await harness.sendProjectMessage({
    type: 'CDP_CHECK_DATABANK_CUSTOM_DEPENDENCIES',
    pageUrl: 'http://127.0.0.1:5173/',
    crowdNames: ['依赖一', '依赖二', '依赖三', '依赖四', '依赖五'],
  })

  assert.equal(response.ok, true)
  assert.equal(response.ready, true)
  assert.equal(response.results.length, 5)
  assert.equal(maxActiveRequests, 3)
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
