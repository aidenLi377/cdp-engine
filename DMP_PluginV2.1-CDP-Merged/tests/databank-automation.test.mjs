import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const CONTENT_SCRIPT_PATH = path.resolve(currentDir, '..', 'databank-automation.js')
const CONTENT_SCRIPT_SOURCE = fs.readFileSync(CONTENT_SCRIPT_PATH, 'utf8')

const DATABANK_PARAM_TRIGGER_XPATH =
  '/html/body/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div[2]/div/div/div/div/div[2]/div[1]/div[1]/div[3]/span[2]'
const DATABANK_TEXTAREA_XPATH = '/html/body/div[6]/div[2]/div[1]/div/div[2]/div/span/textarea'
const DATABANK_CONFIRM_XPATH = '/html/body/div[6]/div[2]/div[2]/button[1]'
const DATABANK_CALCULATE_COUNT_XPATH =
  '/html/body/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div[2]/div/div/div/div/div[2]/div[2]/div[3]/div/div/span'
const DATABANK_CROWD_COUNT_XPATH =
  '/html/body/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div[2]/div/div/div/div/div[2]/div[2]/div[2]/span'
const DATABANK_CREATE_CROWD_XPATH =
  '/html/body/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div[2]/div/div/div/div/div[2]/div[2]/div[6]/button[1]/span'
const DATABANK_CREATE_CONFIRM_XPATH = '/html/body/div[6]/div[2]/div[2]/form/div[2]/div/button[1]/span'

class FakeElement {
  constructor(tagName, text = '') {
    this.tagName = String(tagName || '').toUpperCase()
    this.textContent = text
    this.style = { display: 'block', visibility: 'visible', opacity: '1' }
    this.disabled = false
    this.readOnly = false
    this.attributes = new Map()
    this.parentElement = null
    this.children = []
    this.value = ''
    this.isConnected = true
  }

  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
  }

  querySelectorAll(selector) {
    const results = []

    function visit(node) {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          results.push(child)
        }
        visit(child)
      }
    }

    visit(this)
    return results
  }

  getBoundingClientRect() {
    if (this.style.display === 'none' || this.style.visibility === 'hidden' || this.style.opacity === '0') {
      return { width: 0, height: 0 }
    }
    return { width: 120, height: 32 }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  dispatchEvent(event) {
    this.onDispatchEvent?.(event)
    return true
  }

  focus() {}

  scrollIntoView() {}

  closest(selector) {
    const wanted = selector
      .split(',')
      .map((item) => item.trim().replace(/^\./, '').replace(/^\[/, '').replace(/\]$/, ''))
      .filter(Boolean)
    let current = this
    while (current) {
      const className = current.className || ''
      const role = current.getAttribute?.('role')
      if (
        wanted.includes('role="dialog"') && role === 'dialog' ||
        wanted.includes(String(current.tagName || '').toLowerCase()) ||
        wanted.some((item) => className.split(/\s+/).includes(item))
      ) {
        return current
      }
      current = current.parentElement
    }
    return null
  }
}

class FakeButtonElement extends FakeElement {
  constructor(text = '') {
    super('button', text)
  }
}

class FakeTextareaElement extends FakeElement {
  constructor() {
    super('textarea', '')
  }

  get value() {
    return this._value || ''
  }

  set value(nextValue) {
    this._value = String(nextValue ?? '')
  }
}

class FakeInputElement extends FakeElement {
  constructor() {
    super('input', '')
  }
}

function matchesSelector(node, selector) {
  return String(selector || '')
    .split(',')
    .map((item) => item.trim())
    .some((item) => {
      if (item === '*') return true
      if (item.startsWith('.')) {
        return String(node.className || '').split(/\s+/).includes(item.slice(1))
      }
      if (item === '[aria-busy="true"]') return node.getAttribute?.('aria-busy') === 'true'
      if (item === '[role="button"]') return node.getAttribute?.('role') === 'button'
      return node.tagName === item.toUpperCase()
    })
}

function createContentHarness(options = {}) {
  let now = 0
  let runtimeListener = null
  let dialogOpen = false
  let followupDialogOpen = false
  let confirmClickCount = 0
  let frameworkInputAccepted = false
  let rerenderCount = 0
  let triggerClickAt = null
  let triggerClickCount = 0
  let calculateClickCount = 0
  let createCrowdClickCount = 0
  let createConfirmClickCount = 0
  let fetchCallCount = 0

  const trigger = new FakeElement('span', '参数粘贴')
  const loadingMask = new FakeElement('div')
  loadingMask.className = 'next-loading-mask'
  const unrelatedConfirm = new FakeButtonElement('确定')
  const calculateCountControl = new FakeElement('span', '计算人数')
  calculateCountControl.isConnected = false
  calculateCountControl.click = () => {
    calculateClickCount += 1
    countValue.isConnected = Boolean(options.calculatedCountDisplay)
  }
  const coverageRoot = new FakeElement('div')
  const coverageLabel = new FakeElement('span', '覆盖人数')
  const countValue = new FakeElement('strong', String(options.calculatedCountDisplay || ''))
  countValue.isConnected = false
  const unrelatedNearbyNumber = new FakeElement('span', String(options.unrelatedNearbyNumber || ''))
  unrelatedNearbyNumber.isConnected = Boolean(options.unrelatedNearbyNumber)
  coverageRoot.appendChild(coverageLabel)
  coverageRoot.appendChild(countValue)
  coverageRoot.appendChild(unrelatedNearbyNumber)
  const createCrowdButton = new FakeButtonElement('创建人群')
  const createCrowdControl = new FakeElement('span', '创建人群')
  createCrowdControl.isConnected = false
  createCrowdButton.appendChild(createCrowdControl)
  createCrowdButton.isConnected = false
  const createDialogRoot = new FakeElement('div', '填写人群信息')
  createDialogRoot.className = 'el-dialog'
  createDialogRoot.setAttribute('role', 'dialog')
  createDialogRoot.isConnected = false
  const createNameInput = new FakeInputElement()
  createNameInput.value = String(options.createCrowdName || '')
  createNameInput.maxLength = 20
  const createConfirmButton = new FakeButtonElement('创建')
  const createConfirmControl = new FakeElement('span', '创建')
  createConfirmButton.appendChild(createConfirmControl)
  createDialogRoot.appendChild(createNameInput)
  createDialogRoot.appendChild(createConfirmButton)
  createCrowdButton.click = () => {
    createCrowdClickCount += 1
    createDialogRoot.isConnected = true
    createNameInput.isConnected = true
    createConfirmButton.isConnected = true
    createConfirmControl.isConnected = true
  }
  createConfirmButton.click = () => {
    createConfirmClickCount += 1
    createDialogRoot.isConnected = false
    createNameInput.isConnected = false
    createConfirmButton.isConnected = false
    createConfirmControl.isConnected = false
  }
  const followupDialogRoot = new FakeElement('div')
  followupDialogRoot.className = 'el-dialog'
  followupDialogRoot.setAttribute('role', 'dialog')
  followupDialogRoot.isConnected = false
  const followupTextarea = new FakeTextareaElement()
  const followupConfirm = new FakeButtonElement('确定')
  followupDialogRoot.appendChild(followupTextarea)
  followupDialogRoot.appendChild(followupConfirm)

  let dialogRoot = null
  let textarea = null
  let dialogConfirm = null

  function setConfirmEnabled(node, enabled) {
    if (node instanceof FakeButtonElement) node.disabled = !enabled
    node.setAttribute('aria-disabled', enabled ? 'false' : 'true')
  }

  function buildImportDialog(initialValue = '') {
    const root = new FakeElement('div')
    root.className = 'el-dialog'
    root.setAttribute('role', 'dialog')

    const nextTextarea = new FakeTextareaElement()
    nextTextarea._value = String(initialValue)
    let trackedValue = nextTextarea.value
    if (options.controlledTextarea) {
      Object.defineProperty(nextTextarea, 'value', {
        configurable: true,
        get() {
          return this._value || ''
        },
        set(nextValue) {
          this._value = String(nextValue ?? '')
          trackedValue = this._value
        },
      })
    }

    const nextConfirm = options.confirmRoleButton
      ? new FakeElement('div', options.confirmText || '确认')
      : new FakeButtonElement(options.confirmText || '确定')
    if (options.confirmRoleButton) nextConfirm.setAttribute('role', 'button')
    setConfirmEnabled(nextConfirm, !options.confirmInitiallyDisabled)

    root.appendChild(nextTextarea)
    root.appendChild(nextConfirm)

    nextTextarea.onDispatchEvent = (event) => {
      if (event.type !== 'input') return
      const inputAccepted = !options.controlledTextarea || trackedValue !== nextTextarea.value
      if (!inputAccepted) return
      frameworkInputAccepted = true
      trackedValue = nextTextarea.value
      if (options.enableConfirmOnAcceptedInput) setConfirmEnabled(nextConfirm, true)
      if (options.rerenderOnAcceptedInput && rerenderCount === 0) {
        root.isConnected = false
        rerenderCount += 1
        const replacement = buildImportDialog(nextTextarea.value)
        dialogRoot = replacement.root
        textarea = replacement.textarea
        dialogConfirm = replacement.confirm
      }
    }

    nextConfirm.click = () => {
      confirmClickCount += 1
      root.isConnected = false
      dialogOpen = false
      followupDialogOpen = true
      followupDialogRoot.isConnected = true
      calculateCountControl.isConnected = true
      createCrowdButton.isConnected = true
      createCrowdControl.isConnected = true
    }

    return { root, textarea: nextTextarea, confirm: nextConfirm }
  }

  const initialDialog = buildImportDialog()
  dialogRoot = initialDialog.root
  textarea = initialDialog.textarea
  dialogConfirm = initialDialog.confirm
  dialogRoot.isConnected = false

  trigger.click = () => {
    triggerClickCount += 1
    if (triggerClickAt == null) triggerClickAt = now
    if (triggerClickCount < (options.triggerOpensDialogOnAttempt || 1)) return
    dialogOpen = true
    dialogRoot.isConnected = true
  }

  const document = {
    querySelectorAll(selector) {
      const nodes = [trigger, unrelatedConfirm, coverageRoot, coverageLabel]
      if (countValue.isConnected) nodes.push(countValue)
      if (unrelatedNearbyNumber.isConnected) nodes.push(unrelatedNearbyNumber)
      if (createCrowdButton.isConnected) nodes.push(createCrowdButton, createCrowdControl)
      if (createDialogRoot.isConnected) nodes.push(createDialogRoot, createNameInput, createConfirmButton, createConfirmControl)
      if (options.pageLoadingUntilMs != null && now < options.pageLoadingUntilMs) {
        nodes.push(loadingMask)
      }
      if (dialogOpen) nodes.push(textarea, dialogConfirm)
      if (followupDialogOpen) nodes.push(followupTextarea, followupConfirm)
      return nodes.filter((node) => matchesSelector(node, selector))
    },
    evaluate(xpath) {
      const node =
        xpath === DATABANK_PARAM_TRIGGER_XPATH ? trigger
            : xpath === DATABANK_TEXTAREA_XPATH ? (dialogOpen ? textarea : null)
              : xpath === DATABANK_CONFIRM_XPATH ? (dialogOpen ? dialogConfirm : null)
                : xpath === DATABANK_CALCULATE_COUNT_XPATH && calculateCountControl.isConnected
                  ? calculateCountControl
                  : xpath === DATABANK_CROWD_COUNT_XPATH && countValue.isConnected
                    ? countValue
                  : xpath === DATABANK_CREATE_CROWD_XPATH && createCrowdControl.isConnected
                    ? createCrowdControl
                    : xpath === DATABANK_CREATE_CONFIRM_XPATH && createConfirmControl.isConnected
                      ? createConfirmControl
              : null
      return { singleNodeValue: node }
    },
    readyState: 'complete',
    body: {
      get textContent() {
        const churnSuffix = options.unrelatedDomChurnUntilMs != null && now < options.unrelatedDomChurnUntilMs
          ? ` ${Math.floor(now / 100)}`
          : ''
        return `数据引擎 参数配置 参数粘贴${churnSuffix}`
      },
      scrollHeight: 900,
    },
    documentElement: { scrollHeight: 900 },
    images: [],
    fonts: { status: 'loaded' },
  }

  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeListener = listener
        },
      },
    },
  }

  const context = {
    console,
    chrome,
    document,
    window: {
      __databankAutomationContentScriptLoaded: false,
      __databankAutomationRunning: false,
      location: { href: 'https://databank.tmall.com/#/userDefinedAnalyses' },
      getComputedStyle(node) {
        return node.style
      },
    },
    Element: FakeElement,
    HTMLButtonElement: FakeButtonElement,
    HTMLTextAreaElement: FakeTextareaElement,
    HTMLInputElement: FakeInputElement,
    XPathResult: { FIRST_ORDERED_NODE_TYPE: 0 },
    MouseEvent: class {
      constructor(type, init) {
        this.type = type
        Object.assign(this, init)
      }
    },
    Event: class {
      constructor(type, init) {
        this.type = type
        Object.assign(this, init)
      }
    },
    Date: { now: () => now },
    async fetch(url, init) {
      fetchCallCount += 1
      if (typeof options.fetchImpl !== 'function') {
        throw new Error(`unexpected fetch: ${url}`)
      }
      return await options.fetchImpl(url, init)
    },
    URL,
    URLSearchParams,
    setTimeout(callback, delay = 0) {
      now += Number(delay) || 0
      if (dialogOpen && options.enableConfirmAfterMs != null && now >= options.enableConfirmAfterMs) {
        setConfirmEnabled(dialogConfirm, true)
      }
      queueMicrotask(callback)
      return now
    },
    clearTimeout() {},
  }
  context.window.window = context.window

  vm.runInNewContext(CONTENT_SCRIPT_SOURCE, context, { filename: CONTENT_SCRIPT_PATH })

  async function sendAutomationMessage(message) {
    return await new Promise((resolve) => {
      const keepChannelOpen = runtimeListener(message, null, (response) => resolve(response))
      assert.equal(keepChannelOpen, true)
    })
  }

  return {
    sendAutomationMessage,
    getState() {
      return {
        confirmClickCount,
        frameworkInputAccepted,
        rerenderCount,
        triggerClickAt,
        triggerClickCount,
        calculateClickCount,
        createCrowdClickCount,
        createConfirmClickCount,
        fetchCallCount,
        pastedJsonText: textarea.value,
        now,
      }
    },
  }
}

test('content automation clicks shortly after the loading mask clears and the paste trigger is stable', async () => {
  const pageLoadingUntilMs = 2500
  const harness = createContentHarness({ pageLoadingUntilMs })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"stable-page"}',
  })

  assert.equal(response.ok, true)
  assert.ok(response.trail.some((entry) => entry.step === 'page_initialized'))
  assert.ok(harness.getState().triggerClickAt >= pageLoadingUntilMs)
  assert.ok(harness.getState().triggerClickAt < pageLoadingUntilMs + 1000)
  assert.equal(harness.getState().calculateClickCount, 0)
})

test('content automation clicks calculate count after import confirmation when requested', async () => {
  const harness = createContentHarness({ calculatedCountDisplay: '7,257,408' })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"calculate-count"}',
    autoCalculate: true,
  })

  assert.equal(response.ok, true)
  assert.equal(response.autoCalculated, true)
  assert.equal(response.countReady, true)
  assert.equal(response.crowdCount, 7257408)
  assert.equal(harness.getState().calculateClickCount, 1)
  assert.ok(response.trail.some((entry) => entry.step === 'clicked_calculate_count'))
})

test('calculated count ignores unrelated nearby numbers when the exact count node is empty', async () => {
  const harness = createContentHarness({ unrelatedNearbyNumber: '3' })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"calculate-count"}',
    autoCalculate: true,
  })

  assert.equal(response.ok, true)
  assert.equal(response.countReady, false)
  assert.equal(response.crowdCount, null)
  assert.ok(response.trail.some((entry) => entry.step === 'count_still_pending'))
})

test('a stable dash at the exact count XPath is returned as a completed dash result without blocking the queue', async () => {
  const harness = createContentHarness({ calculatedCountDisplay: '—' })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"count-unavailable"}',
    executionMode: 'calculate_only',
  })

  assert.equal(response.ok, true)
  assert.equal(response.countReady, true)
  assert.equal(response.countUnavailable, true)
  assert.equal(response.crowdCount, '-')
  assert.equal(harness.getState().calculateClickCount, 1)
  assert.ok(response.trail.some((entry) => entry.step === 'count_unavailable' && entry.countDisplay === '—'))
  assert.ok(harness.getState().now < 30000)
})

test('calculate-only reuses an exact existing crowd count before opening parameter import', async () => {
  const requestedUrls = []
  const harness = createContentHarness({
    async fetchImpl(url) {
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errCode: 0,
            data: {
              list: [
                { id: 91, name: '兰蔻8月液精华购买Y25-近似', count: 7, gmtCreate: 3 },
                { id: 92, name: '兰蔻8月液精华购买Y25', count: 19000, gmtCreate: 2, status: 'CREATED' },
              ],
            },
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"兰蔻8月液精华购买Y25"}',
    executionMode: 'calculate_only',
    crowdName: '兰蔻8月液精华购买Y25',
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdFound, true)
  assert.equal(response.crowdReused, true)
  assert.equal(response.countReady, true)
  assert.equal(response.crowdCount, 19000)
  assert.equal(response.crowdId, 92)
  assert.equal(harness.getState().triggerClickCount, 0)
  assert.equal(harness.getState().confirmClickCount, 0)
  assert.equal(harness.getState().calculateClickCount, 0)
  assert.ok(response.trail.some((entry) => entry.step === 'existing_crowd_reused_for_count'))
  assert.equal(new URL(requestedUrls[0]).searchParams.get('keyword'), '兰蔻8月液精华购买Y25')
})

test('calculate-only completes with a dash when the exact existing crowd has no numeric count', async () => {
  const harness = createContentHarness({
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errCode: 0,
            data: {
              list: [
                { id: 93, name: 'D15欧加DLINE其它_0924', count: null, gmtCreate: 4, status: 'CREATED' },
              ],
            },
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"D15欧加DLINE其它_0924"}',
    executionMode: 'calculate_only',
    crowdName: 'D15欧加DLINE其它_0924',
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdReused, true)
  assert.equal(response.countReady, true)
  assert.equal(response.countUnavailable, true)
  assert.equal(response.crowdCount, '-')
  assert.equal(harness.getState().triggerClickCount, 0)
  assert.equal(harness.getState().calculateClickCount, 0)
})

test('calculate-only falls back to live calculation when no exact crowd exists', async () => {
  const harness = createContentHarness({
    calculatedCountDisplay: '19,000',
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errCode: 0,
            data: { list: [{ id: 94, name: '同名前缀-但不是精确匹配', count: 88 }] },
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"同名前缀"}',
    executionMode: 'calculate_only',
    crowdName: '同名前缀',
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdReused, false)
  assert.equal(response.countReady, true)
  assert.equal(response.crowdCount, 19000)
  assert.equal(harness.getState().triggerClickCount, 1)
  assert.equal(harness.getState().confirmClickCount, 1)
  assert.equal(harness.getState().calculateClickCount, 1)
  assert.ok(response.trail.some((entry) => entry.step === 'existing_crowd_not_found_for_count'))
})

test('create mode verifies the configured crowd name and confirms without editing it', async () => {
  const harness = createContentHarness({
    createCrowdName: '新品兴趣人群0921',
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        async json() {
          return { errCode: 0, data: { list: [] } }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"新品兴趣人群0921"}',
    executionMode: 'create_and_count',
    crowdName: '新品兴趣人群0921',
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdCreated, true)
  assert.equal(response.executionMode, 'create_and_count')
  assert.equal(harness.getState().createCrowdClickCount, 1)
  assert.equal(harness.getState().createConfirmClickCount, 1)
})

test('create-and-count reuses an exact existing crowd instead of creating a duplicate', async () => {
  const requestedUrls = []
  const harness = createContentHarness({
    createCrowdName: '新品兴趣人群0921',
    async fetchImpl(url) {
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errCode: 0,
            data: {
              list: [
                { id: 81, name: '新品兴趣人群0921-近似', count: 9, gmtCreate: 3 },
                { id: 82, name: '新品兴趣人群0921', count: 7257408, gmtCreate: 2, status: 'CREATED' },
              ],
            },
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"新品兴趣人群0921"}',
    executionMode: 'create_and_count',
    crowdName: '新品兴趣人群0921',
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdFound, true)
  assert.equal(response.crowdReused, true)
  assert.equal(response.crowdCreated, false)
  assert.equal(response.crowdId, 82)
  assert.equal(response.countReady, true)
  assert.equal(response.crowdCount, 7257408)
  assert.equal(harness.getState().triggerClickCount, 0)
  assert.equal(harness.getState().confirmClickCount, 0)
  assert.equal(harness.getState().createCrowdClickCount, 0)
  assert.equal(harness.getState().createConfirmClickCount, 0)
  assert.ok(response.trail.some((entry) => entry.step === 'existing_crowd_reused'))
  assert.equal(new URL(requestedUrls[0]).searchParams.get('keyword'), '新品兴趣人群0921')
})

test('create-only reuses an exact existing crowd before opening parameter import', async () => {
  const harness = createContentHarness({
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errCode: 0,
            data: {
              list: [
                { id: 83, name: '只建包查重0921', count: null, gmtCreate: 5, status: 'CREATED' },
              ],
            },
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"只建包查重0921"}',
    executionMode: 'create_only',
    crowdName: '只建包查重0921',
  })

  assert.equal(response.ok, true)
  assert.equal(response.executionMode, 'create_only')
  assert.equal(response.crowdFound, true)
  assert.equal(response.crowdReused, true)
  assert.equal(response.crowdCreated, false)
  assert.equal(response.crowdId, 83)
  assert.equal(response.message, '已存在同名人群包，已跳过重复创建')
  assert.equal(harness.getState().triggerClickCount, 0)
  assert.equal(harness.getState().confirmClickCount, 0)
  assert.equal(harness.getState().createCrowdClickCount, 0)
  assert.equal(harness.getState().createConfirmClickCount, 0)
})

test('create mode refuses a modal whose configured name does not match', async () => {
  const harness = createContentHarness({
    createCrowdName: '错误名称0921',
    async fetchImpl() {
      return { ok: true, status: 200, async json() { return { errCode: 0, data: { list: [] } } } }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"正确名称0921"}',
    executionMode: 'create_only',
    crowdName: '正确名称0921',
  })

  assert.equal(response.ok, false)
  assert.match(response.error, /期望“正确名称0921”，实际“错误名称0921”/)
  assert.equal(harness.getState().createConfirmClickCount, 0)
})

test('crowd count query uses the exact name and keeps a zero count', async () => {
  const requestedUrls = []
  const harness = createContentHarness({
    async fetchImpl(url) {
      requestedUrls.push(url)
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errCode: 0,
            data: {
              list: [
                { id: 1, name: '新品兴趣人群0921-近似', count: 99, gmtCreate: 3 },
                { id: 2, name: '新品兴趣人群0921', count: 8, gmtCreate: 1 },
                { id: 3, name: '新品兴趣人群0921', count: 0, gmtCreate: 2, status: 'CREATED' },
              ],
            },
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'QUERY_DATABANK_CROWD_COUNT',
    crowdName: '新品兴趣人群0921',
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdFound, true)
  assert.equal(response.countReady, true)
  assert.equal(response.crowdCount, 0)
  assert.equal(response.crowdId, 3)
  const url = new URL(requestedUrls[0])
  assert.equal(url.searchParams.get('keyword'), '新品兴趣人群0921')
  assert.equal(url.searchParams.get('category2NotEqualList'), 'scene_crowd')
})

test('crowd count query reports expired login for 401 and 403', async () => {
  for (const status of [401, 403]) {
    const harness = createContentHarness({
      async fetchImpl() {
        return { ok: false, status }
      },
    })
    const response = await harness.sendAutomationMessage({
      type: 'QUERY_DATABANK_CROWD_COUNT',
      crowdName: '新品兴趣人群0921',
    })
    assert.equal(response.ok, false)
    assert.equal(response.code, 'DATABANK_LOGIN_REQUIRED')
    assert.match(response.error, /重新登录数据引擎/)
  }
})

test('custom crowds are resolved with one full-list request before the JSON is pasted', async () => {
  const requestedUrls = []
  const harness = createContentHarness({
    async fetchImpl(url, init) {
      requestedUrls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: [
              { name: 'HN919I人群BH', id: '78393014' },
              { name: '第二个人群', bizId: '78392453' },
            ],
            errCode: 0,
            errMsg: 'Success',
          }
        },
      }
    },
  })
  const input = {
    crowdName: '组合人群',
    list: [
      { selectionLv1: ['CROWD', 'CUSTOM'], selectionLv3: { crowdIds: ['HN919I人群BH'] }, fromPoolId: 0 },
      { selectionLv1: ['CROWD', 'CUSTOM'], selectionLv3: { crowdIds: ['第二个人群'] }, fromPoolId: 1 },
    ],
    compute: '(0)n(1)',
  }

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: JSON.stringify(input),
  })

  assert.equal(response.ok, true)
  assert.equal(harness.getState().fetchCallCount, 1)
  assert.equal(requestedUrls.length, 1)
  assert.match(requestedUrls[0].url, /path=\/api\/dimension\/listChildDimension&type=CROWD&id=CUSTOM/)
  assert.equal(requestedUrls[0].init.credentials, 'include')
  const pasted = JSON.parse(harness.getState().pastedJsonText)
  assert.deepEqual(Array.from(pasted.list[0].selectionLv3.crowdIds), ['78393014#|#78393014'])
  assert.deepEqual(Array.from(pasted.list[1].selectionLv3.crowdIds), ['78392453#|#78392453'])
  assert.ok(response.trail.some((entry) => entry.step === 'resolved_custom_crowds' && entry.count === 2))
})

test('ordinary JSON does not request the custom crowd list', async () => {
  const harness = createContentHarness()

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: JSON.stringify({
      crowdName: '普通人群',
      list: [{ selectionLv1: ['FIELD', 'SEARCH'], selectionLv3: { searchs: ['香水'] } }],
      compute: '(0)',
    }),
  })

  assert.equal(response.ok, true)
  assert.equal(harness.getState().fetchCallCount, 0)
})

test('realtime count sends generated JSON directly and omits captcha', async () => {
  let capturedRequest = null
  const harness = createContentHarness({
    async fetchImpl(url, init) {
      capturedRequest = { url, init }
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() {
          return { data: 144157, errCode: 0, errMsg: 'Success', codeClass: 'SUCCESS' }
        },
      }
    },
  })
  const model = {
    crowdName: '原名称',
    list: [{ selectionLv1: ['FIELD', 'SEARCH'], selectionLv3: { searchs: ['香水'] }, fromPoolId: 0 }],
    compute: '(0)',
  }

  const response = await harness.sendAutomationMessage({
    type: 'QUERY_DATABANK_REALTIME_COUNT',
    jsonText: JSON.stringify(model),
    crowdName: '接口试验包',
    requestHeaders: {
      'x-csrf-token': 'csrf-token-for-test',
      'x-requested-with': 'XMLHttpRequest',
      'bx-v': '2.5.31',
    },
  })

  assert.equal(response.ok, true)
  assert.equal(response.directRealtime, true)
  assert.equal(response.crowdCount, 144157)
  assert.equal(capturedRequest.url, 'https://databank.tmall.com/api/paasapi')
  assert.equal(capturedRequest.init.method, 'POST')
  assert.equal(capturedRequest.init.headers['x-csrf-token'], 'csrf-token-for-test')
  const outerPayload = JSON.parse(capturedRequest.init.body)
  assert.equal(outerPayload.path, '/api/v1/custom/realtime/count')
  assert.equal(Object.hasOwn(outerPayload, 'captcha'), false)
  assert.deepEqual(JSON.parse(outerPayload.customModelStr), { ...model, crowdName: '接口试验包' })
  assert.equal(harness.getState().triggerClickCount, 0)
})

test('direct crowd creation checks duplicates, runs canAcc, then creates without reusing captcha', async () => {
  const requests = []
  const harness = createContentHarness({
    async fetchImpl(url, init = {}) {
      requests.push({ url: String(url), init })
      if ((init.method || 'GET') === 'GET') {
        return {
          ok: true,
          status: 200,
          redirected: false,
          async json() { return { data: { list: [] }, errCode: 0, errMsg: 'Success' } },
        }
      }
      const payload = JSON.parse(init.body)
      if (payload.path === '/api/v1/custom/canAcc') {
        return {
          ok: true,
          status: 200,
          redirected: false,
          async json() { return { data: 0, errCode: 0, errMsg: 'Success' } },
        }
      }
      assert.equal(payload.path, '/api/v1/custom/databank')
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() { return { data: 78408082, errCode: 0, errMsg: 'Success' } },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'CREATE_DATABANK_CROWD_API',
    jsonText: '{"crowdName":"旧名称","list":[],"compute":""}',
    crowdName: '接口建包0922',
    requestHeaders: {
      'x-csrf-token': 'csrf-create-test',
      'x-requested-with': 'XMLHttpRequest',
      'bx-v': '2.5.31',
    },
  })

  assert.equal(response.ok, true)
  assert.equal(response.directCreate, true)
  assert.equal(response.preflightPassed, true)
  assert.equal(response.crowdCreated, true)
  assert.equal(response.crowdId, 78408082)
  assert.equal(requests.length, 3)
  const preflightPayload = JSON.parse(requests[1].init.body)
  const createPayload = JSON.parse(requests[2].init.body)
  assert.equal(preflightPayload.path, '/api/v1/custom/canAcc')
  assert.equal(createPayload.path, '/api/v1/custom/databank')
  assert.equal(Object.hasOwn(createPayload, 'captcha'), false)
  assert.equal(JSON.parse(createPayload.customModelStr).crowdName, '接口建包0922')
  assert.equal(requests[2].init.headers['x-csrf-token'], 'csrf-create-test')
})

test('direct crowd creation stops before canAcc when the API context is not initialized', async () => {
  const harness = createContentHarness({
    async fetchImpl(_url, init = {}) {
      assert.equal(init.method || 'GET', 'GET')
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() { return { data: { list: [] }, errCode: 0 } },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'CREATE_DATABANK_CROWD_API',
    jsonText: '{"crowdName":"未初始化","list":[],"compute":""}',
    crowdName: '未初始化',
    requestHeaders: {},
  })

  assert.equal(response.ok, false)
  assert.equal(response.code, 'DATABANK_REQUEST_CONTEXT_REQUIRED')
  assert.match(response.error, /手动计算一次人数/)
  assert.equal(harness.getState().fetchCallCount, 1)
})

test('direct crowd creation reports captcha requirements instead of replaying an old token', async () => {
  const harness = createContentHarness({
    async fetchImpl(_url, init = {}) {
      if ((init.method || 'GET') === 'GET') {
        return { ok: true, status: 200, redirected: false, async json() { return { data: { list: [] }, errCode: 0 } } }
      }
      const payload = JSON.parse(init.body)
      if (payload.path === '/api/v1/custom/canAcc') {
        return { ok: true, status: 200, redirected: false, async json() { return { data: 0, errCode: 0 } } }
      }
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() { return { data: null, errCode: 400, errMsg: 'captcha required', codeClass: 'CLIENT_ERROR' } },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'CREATE_DATABANK_CROWD_API',
    jsonText: '{"crowdName":"需验证","list":[],"compute":""}',
    crowdName: '需验证',
    requestHeaders: { 'x-csrf-token': 'csrf-create-test' },
  })

  assert.equal(response.ok, false)
  assert.equal(response.code, 'DATABANK_CAPTCHA_REQUIRED')
  assert.match(response.error, /页面建包/)
})

test('direct crowd creation reuses an exact existing crowd before checking API context', async () => {
  const harness = createContentHarness({
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() {
          return { data: { list: [{ id: 88, name: '已存在接口包', count: null, status: 'CREATING' }] }, errCode: 0 }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'CREATE_DATABANK_CROWD_API',
    jsonText: '{"crowdName":"已存在接口包","list":[],"compute":""}',
    crowdName: '已存在接口包',
    requestHeaders: {},
  })

  assert.equal(response.ok, true)
  assert.equal(response.crowdReused, true)
  assert.equal(response.crowdCreated, false)
  assert.equal(response.crowdId, 88)
  assert.equal(harness.getState().fetchCallCount, 1)
})

test('realtime count treats numeric data as success even when the API also returns a warning code', async () => {
  const harness = createContentHarness({
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() {
          return {
            data: 19000,
            errCode: 477008002011,
            errMsg: '人数轻度模糊处理',
            codeClass: 'CLIENT_ERROR',
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'QUERY_DATABANK_REALTIME_COUNT',
    jsonText: '{"crowdName":"模糊人数包","list":[],"compute":""}',
    crowdName: '模糊人数包',
  })

  assert.equal(response.ok, true)
  assert.equal(response.countReady, true)
  assert.equal(response.crowdCount, 19000)
  assert.equal(response.message, '已通过接口直接取得人数')
})

test('realtime count records the privacy threshold as a successful less-than-2000 result', async () => {
  const harness = createContentHarness({
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() {
          return {
            data: null,
            errCode: 477012012051,
            errMsg: '< 2000',
            codeClass: 'CLIENT_ERROR',
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'QUERY_DATABANK_REALTIME_COUNT',
    jsonText: '{"crowdName":"低量级包","list":[],"compute":""}',
    crowdName: '低量级包',
  })

  assert.equal(response.ok, true)
  assert.equal(response.countReady, true)
  assert.equal(response.countThreshold, true)
  assert.equal(response.crowdCount, '<2000')
  assert.equal(response.message, '人数低于隐私保护阈值')
})

test('realtime count returns errMsg only when data is null and it is not a threshold result', async () => {
  const harness = createContentHarness({
    async fetchImpl() {
      return {
        ok: true,
        status: 200,
        redirected: false,
        async json() {
          return {
            data: null,
            errCode: 477012001055,
            errMsg: '所选固定日期早于品牌可用数据的最早日期',
            codeClass: 'CLIENT_ERROR',
          }
        },
      }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'QUERY_DATABANK_REALTIME_COUNT',
    jsonText: '{"crowdName":"日期错误包","list":[],"compute":""}',
    crowdName: '日期错误包',
  })

  assert.equal(response.ok, false)
  assert.match(response.error, /所选固定日期早于品牌可用数据的最早日期/)
})

test('a missing custom crowd stops before opening the paste dialog', async () => {
  const harness = createContentHarness({
    async fetchImpl() {
      return { ok: true, status: 200, async json() { return { data: [], errCode: 0 } } }
    },
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: JSON.stringify({
      crowdName: '失败任务',
      list: [{ selectionLv1: ['CROWD', 'CUSTOM'], selectionLv3: { crowdIds: ['不存在的人群'] } }],
      compute: '(0)',
    }),
  })

  assert.equal(response.ok, false)
  assert.match(response.error, /未找到自定义人群：不存在的人群/)
  assert.equal(harness.getState().fetchCallCount, 1)
  assert.equal(harness.getState().triggerClickCount, 0)
  assert.equal(harness.getState().confirmClickCount, 0)
})

test('unrelated page text changes do not postpone a ready paste trigger', async () => {
  const harness = createContentHarness({ unrelatedDomChurnUntilMs: 10000 })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"dynamic-page"}',
  })

  assert.equal(response.ok, true)
  assert.ok(harness.getState().triggerClickAt < 1000)
})

test('content automation retries the live paste trigger once when the dialog does not open', async () => {
  const harness = createContentHarness({ triggerOpensDialogOnAttempt: 2 })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"retry-paste"}',
  })

  assert.equal(response.ok, true)
  assert.equal(harness.getState().triggerClickCount, 2)
})

test('crowd push finds Alimama inside the visible dialog and clicks the refreshed live node', () => {
  const locatorStart = CONTENT_SCRIPT_SOURCE.indexOf('function findVisibleAlimamaControl')
  const locatorEnd = CONTENT_SCRIPT_SOURCE.indexOf('async function waitForCrowdApplyDialogInitialized', locatorStart)
  const locatorFlow = CONTENT_SCRIPT_SOURCE.slice(locatorStart, locatorEnd)
  const waitStart = CONTENT_SCRIPT_SOURCE.indexOf('async function waitForCrowdApplyDialogInitialized')
  const waitEnd = CONTENT_SCRIPT_SOURCE.indexOf('async function databankSelectAlimama', waitStart)
  const waitFlow = CONTENT_SCRIPT_SOURCE.slice(waitStart, waitEnd)
  const selectStart = CONTENT_SCRIPT_SOURCE.indexOf('async function databankSelectAlimama')
  const selectEnd = CONTENT_SCRIPT_SOURCE.indexOf('async function databankSelectDmp', selectStart)
  const selectFlow = CONTENT_SCRIPT_SOURCE.slice(selectStart, selectEnd)
  const settleAt = selectFlow.indexOf('const label = await waitForCrowdApplyDialogInitialized()')
  const clickAt = selectFlow.indexOf('clickNode(label)')

  assert.match(locatorFlow, /getNodeByXpath\(CROWD_DIALOG_ALIMAMA_XPATH\)/)
  assert.match(locatorFlow, /document\.querySelectorAll\(DIALOG_ROOT_SELECTORS\)/)
  assert.match(locatorFlow, /includes\('阿里妈妈'\)/)
  assert.match(locatorFlow, /label, \[role="radio"\], button, \[role="button"\]/)
  assert.match(waitFlow, /Date\.now\(\) - firstVisibleAt >= CROWD_DIALOG_FINAL_SETTLE_MS/)
  assert.match(waitFlow, /const latestControl = findVisibleAlimamaControl\(\)/)
  assert.match(waitFlow, /return latestControl/)
  assert.doesNotMatch(waitFlow, /alimamaNode ===|dialogRoot ===|signature ===/)
  assert.ok(settleAt >= 0)
  assert.ok(clickAt > settleAt)
})

test('content automation treats the import dialog as closed even if another 确定 button stays visible elsewhere', async () => {
  const harness = createContentHarness()

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"demo"}',
  })

  assert.equal(response.ok, true)
})

test('content automation succeeds after the original import dialog closes even if a different dialog appears later', async () => {
  const harness = createContentHarness()

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"demo"}',
  })

  assert.equal(response.ok, true)
})

test('content automation waits for a visible disabled confirm button to become enabled', async () => {
  const harness = createContentHarness({
    confirmInitiallyDisabled: true,
    enableConfirmAfterMs: 500,
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"delayed"}',
  })

  assert.equal(response.ok, true)
  assert.equal(harness.getState().confirmClickCount, 1)
  assert.ok(harness.getState().now >= 500)
  assert.ok(response.trail.some((entry) => entry.step === 'confirm_button_ready'))
})

test('content automation uses the native textarea setter so controlled input enables confirm', async () => {
  const harness = createContentHarness({
    controlledTextarea: true,
    confirmInitiallyDisabled: true,
    enableConfirmOnAcceptedInput: true,
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"controlled"}',
  })

  assert.equal(response.ok, true)
  assert.equal(harness.getState().frameworkInputAccepted, true)
  assert.equal(harness.getState().confirmClickCount, 1)
})

test('content automation reacquires a rerendered dialog and accepts a 确认 role button', async () => {
  const harness = createContentHarness({
    controlledTextarea: true,
    rerenderOnAcceptedInput: true,
    confirmRoleButton: true,
    confirmText: '确认',
  })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"rerendered"}',
  })

  assert.equal(response.ok, true)
  assert.equal(harness.getState().rerenderCount, 1)
  assert.equal(harness.getState().confirmClickCount, 1)
})

test('content automation reports a visible disabled button instead of claiming it is missing', async () => {
  const harness = createContentHarness({ confirmInitiallyDisabled: true })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"blocked"}',
  })

  assert.equal(response.ok, false)
  assert.match(response.error, /确认按钮可见但未启用/)
})
