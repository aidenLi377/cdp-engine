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

  const trigger = new FakeElement('span', '参数粘贴')
  const loadingMask = new FakeElement('div')
  loadingMask.className = 'next-loading-mask'
  const unrelatedConfirm = new FakeButtonElement('确定')
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
    }

    return { root, textarea: nextTextarea, confirm: nextConfirm }
  }

  const initialDialog = buildImportDialog()
  dialogRoot = initialDialog.root
  textarea = initialDialog.textarea
  dialogConfirm = initialDialog.confirm
  dialogRoot.isConnected = false

  trigger.click = () => {
    triggerClickAt = now
    dialogOpen = true
    dialogRoot.isConnected = true
  }

  const document = {
    querySelectorAll(selector) {
      const nodes = [trigger, unrelatedConfirm]
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
              : null
      return { singleNodeValue: node }
    },
    readyState: 'complete',
    body: { textContent: '数据引擎 参数配置 参数粘贴', scrollHeight: 900 },
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
        now,
      }
    },
  }
}

test('content automation waits for the full parameter page to settle before clicking paste', async () => {
  const pageLoadingUntilMs = 2500
  const harness = createContentHarness({ pageLoadingUntilMs })

  const response = await harness.sendAutomationMessage({
    type: 'AUTOMATE_DATABANK',
    jsonText: '{"crowdName":"stable-page"}',
  })

  assert.equal(response.ok, true)
  assert.ok(response.trail.some((entry) => entry.step === 'page_initialized'))
  assert.ok(harness.getState().triggerClickAt >= pageLoadingUntilMs + 3500)
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
