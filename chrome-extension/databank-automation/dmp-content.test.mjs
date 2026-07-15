import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const CORE_PATH = path.resolve('chrome-extension/databank-automation/dmp-result-core.js')
const CONTENT_PATH = path.resolve('chrome-extension/databank-automation/dmp-content.js')
const CORE_SOURCE = fs.readFileSync(CORE_PATH, 'utf8')
const CONTENT_SOURCE = fs.readFileSync(CONTENT_PATH, 'utf8')

function createDmpHarness(initialStorage = {}) {
  let runtimeListener = null
  const eventListeners = new Map()
  const requestBodies = []
  const storageData = {
    dmpConditionCache: {},
    rebaseExcludedTagIds: [],
    ...initialStorage,
  }
  const basePayload = {
    url: 'https://dmp.taobao.com/api/analysis/100?tagId=100',
    payload: { crowdId: 888, tagId: 100, multiGroupOptions: [{ tagId: 999 }] },
  }

  class FakeElement {}
  const coverageNode = { textContent: '1,000' }
  const window = {
    __dmpAutomationContentScriptLoaded: false,
    __dmpAutomationRunning: false,
    __DMP_PAYLOAD__: basePayload,
    location: { href: 'https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId=888' },
    getComputedStyle() {
      return { display: 'block', visibility: 'visible', opacity: '1' }
    },
    addEventListener(type, listener) {
      const listeners = eventListeners.get(type) || []
      listeners.push(listener)
      eventListeners.set(type, listeners)
    },
    removeEventListener(type, listener) {
      eventListeners.set(type, (eventListeners.get(type) || []).filter((item) => item !== listener))
    },
  }
  const document = {
    body: { textContent: 'DMP portrait page '.repeat(30) },
    querySelector() { return null },
    querySelectorAll() { return [] },
    evaluate() { return { singleNodeValue: coverageNode } },
  }
  const chrome = {
    runtime: {
      getURL(name) { return `chrome-extension://test/${name}` },
      onMessage: {
        addListener(listener) { runtimeListener = listener },
      },
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.filter((key) => Object.hasOwn(storageData, key)).map((key) => [key, storageData[key]]))
        },
        async set(patch) {
          Object.assign(storageData, JSON.parse(JSON.stringify(patch)))
        },
      },
    },
  }
  async function fetch(url, options = {}) {
    if (String(url).includes('dmp_tags_dictionary.json')) {
      return {
        async json() {
          return [{ tagId: '200', tagName: '年龄', mainCategory: '用户特征', category: '人口属性', needCondition: true }]
        },
      }
    }
    requestBodies.push(JSON.parse(options.body))
    return {
      async json() {
        return {
          data: {
            chartDataFull: [
              { tagName: '年龄', optionName: '18-24', rate: 0.2, ctrIndex: '120', ppcIndex: '80' },
              { tagName: '年龄', optionName: '25-29', rate: 0.3, ctrIndex: '110', ppcIndex: '70' },
            ],
          },
        }
      },
    }
  }

  const context = {
    window,
    document,
    chrome,
    console,
    fetch,
    Element: FakeElement,
    XPathResult: { FIRST_ORDERED_NODE_TYPE: 0 },
    MouseEvent: class MouseEvent {},
    KeyboardEvent: class KeyboardEvent {},
    Event: class Event {},
    URL,
    setTimeout,
    clearTimeout,
  }
  context.globalThis = context
  vm.runInNewContext(CORE_SOURCE, context, { filename: CORE_PATH })
  vm.runInNewContext(CONTENT_SOURCE, context, { filename: CONTENT_PATH })

  return {
    storageData,
    requestBodies,
    dispatchPayload(payload) {
      window.__DMP_PAYLOAD__ = payload
      for (const listener of eventListeners.get('DMP_PAYLOAD_INTERCEPTED') || []) {
        listener({ detail: payload })
      }
    },
    async extract(selectedTags) {
      return await new Promise((resolve) => {
        const keepChannelOpen = runtimeListener(
          { type: 'AUTOMATE_DMP_EXTRACT', phase1Result: { crowdId: 888 }, selectedTags },
          {},
          resolve,
        )
        assert.equal(keepChannelOpen, true)
      })
    },
  }
}

function createPortraitWaitHarness() {
  let runtimeListener = null
  let rowClickCount = 0
  let nowCall = 0

  class FakeElement {
    constructor(textContent = '', visible = true) {
      this.textContent = textContent
      this.visible = visible
    }
    getBoundingClientRect() {
      return this.visible ? { width: 20, height: 20 } : { width: 0, height: 0 }
    }
    scrollIntoView() {}
    focus() {}
    click() {}
    querySelector() { return null }
    querySelectorAll() { return [] }
  }

  const portraitLink = new FakeElement('画像透视', false)
  const nameCell = new FakeElement('演示人群')
  nameCell.click = () => {
    rowClickCount += 1
    portraitLink.visible = true
  }
  const row = new FakeElement('演示人群')
  row.querySelector = (selector) => selector === 'td' ? nameCell : null
  row.querySelectorAll = (selector) => {
    if (selector === 'td') return [nameCell]
    if (selector === 'a') return [portraitLink]
    return []
  }
  const tbody = {
    querySelectorAll(selector) { return selector === 'tr' ? [row] : [] },
  }
  const window = {
    __dmpAutomationContentScriptLoaded: false,
    __dmpAutomationRunning: false,
    location: { href: 'https://dmp.taobao.com/index_new.html#!/crowds-new/list' },
    getComputedStyle(node) {
      return { display: node.visible ? 'block' : 'none', visibility: 'visible', opacity: '1' }
    },
    addEventListener() {},
    removeEventListener() {},
  }
  const document = {
    body: { textContent: 'DMP crowd list '.repeat(30) },
    querySelector(selector) { return selector === 'table tbody' ? tbody : null },
    querySelectorAll(selector) { return selector === 'span, a' ? [portraitLink] : [] },
    evaluate() { return { singleNodeValue: null } },
  }
  const chrome = {
    runtime: {
      getURL(name) { return `chrome-extension://test/${name}` },
      onMessage: { addListener(listener) { runtimeListener = listener } },
    },
    storage: { local: { async get() { return {} }, async set() {} } },
  }
  const FakeDate = {
    now() {
      nowCall += 1
      if (nowCall === 1) return 0
      if (nowCall === 2) return 1
      return 1800001
    },
  }
  const context = {
    window,
    document,
    chrome,
    console,
    Element: FakeElement,
    XPathResult: { FIRST_ORDERED_NODE_TYPE: 0 },
    MouseEvent: class MouseEvent {},
    KeyboardEvent: class KeyboardEvent {},
    Event: class Event {},
    URL,
    Date: FakeDate,
    fetch,
    setTimeout(callback) { queueMicrotask(callback); return 1 },
    clearTimeout() {},
  }
  context.globalThis = context
  vm.runInNewContext(CORE_SOURCE, context, { filename: CORE_PATH })
  vm.runInNewContext(CONTENT_SOURCE, context, { filename: CONTENT_PATH })

  return {
    get rowClickCount() { return rowClickCount },
    async waitForPortrait() {
      return await new Promise((resolve) => {
        const keepChannelOpen = runtimeListener(
          { type: 'AUTOMATE_DMP_WAIT_PORTRAIT', phase1Result: { crowdName: '演示人群', rowIndex: 0 } },
          {},
          resolve,
        )
        assert.equal(keepChannelOpen, true)
      })
    },
  }
}

test('DMP interception persists non-empty multi-condition options by tag id', async () => {
  const harness = createDmpHarness()

  harness.dispatchPayload({
    url: 'https://dmp.taobao.com/api/analysis/200',
    payload: { crowdId: 888, tagId: 200, multiGroupOptions: [{ tagId: 200, option: 'A' }] },
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(harness.storageData.dmpConditionCache['200'], [{ tagId: 200, option: 'A' }])
})

test('DMP extraction uses cached conditions and returns original ten-column calculations', async () => {
  const harness = createDmpHarness({
    dmpConditionCache: { 200: [{ tagId: 200, option: 'A' }] },
  })

  const response = await harness.extract(['200'])

  assert.equal(response.ok, true)
  assert.equal(response.crowdCount, 1000)
  assert.deepEqual(harness.requestBodies[0].multiGroupOptions, [{ tagId: 200, option: 'A' }])
  assert.deepEqual(Object.keys(response.results[0]), [
    '所属大类', '标签类型', '标签名称', '特征明细', '人群占比',
    '覆盖人数', 'Rebase', 'Rebase后人数', 'CTR', 'PPC',
  ])
  assert.equal(response.results[0]['覆盖人数'], '200')
  assert.equal(response.results[0].Rebase, '40%')
  assert.equal(response.results[0]['Rebase后人数'], '400')
})

test('portrait wait re-expands the matched crowd row when a refreshed list hides the entry', async () => {
  const harness = createPortraitWaitHarness()

  const response = await harness.waitForPortrait()

  assert.equal(response.ok, true)
  assert.equal(response.step, 'portrait_found')
  assert.equal(harness.rowClickCount, 1)
})
