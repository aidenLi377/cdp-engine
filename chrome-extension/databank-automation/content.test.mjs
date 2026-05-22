import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const CONTENT_SCRIPT_PATH = path.resolve('chrome-extension/databank-automation/content.js')
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
  }

  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
  }

  querySelectorAll(tagName) {
    const wantedTag = String(tagName || '').toUpperCase()
    const results = []

    function visit(node) {
      for (const child of node.children) {
        if (child.tagName === wantedTag) {
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

  dispatchEvent(_event) {}

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
}

class FakeInputElement extends FakeElement {
  constructor() {
    super('input', '')
  }
}

function createContentHarness() {
  let now = 0
  let runtimeListener = null
  let dialogOpen = false
  let followupDialogOpen = false

  const trigger = new FakeElement('span', '参数粘贴')
  const dialogRoot = new FakeElement('div')
  dialogRoot.className = 'el-dialog'
  dialogRoot.setAttribute('role', 'dialog')
  const textarea = new FakeTextareaElement()
  const dialogConfirm = new FakeButtonElement('确定')
  dialogRoot.appendChild(textarea)
  dialogRoot.appendChild(dialogConfirm)

  const unrelatedConfirm = new FakeButtonElement('确定')
  const followupDialogRoot = new FakeElement('div')
  followupDialogRoot.className = 'el-dialog'
  followupDialogRoot.setAttribute('role', 'dialog')
  const followupTextarea = new FakeTextareaElement()
  const followupConfirm = new FakeButtonElement('确定')
  followupDialogRoot.appendChild(followupTextarea)
  followupDialogRoot.appendChild(followupConfirm)

  trigger.click = () => {
    dialogOpen = true
  }
  dialogConfirm.click = () => {
    dialogOpen = false
    followupDialogOpen = true
  }

  const document = {
    querySelectorAll(tagName) {
      const tag = String(tagName || '').toLowerCase()
      if (tag === 'span') return [trigger]
      if (tag === 'textarea') {
        const textareas = []
        if (dialogOpen) textareas.push(textarea)
        if (followupDialogOpen) textareas.push(followupTextarea)
        return textareas
      }
      if (tag === 'button') {
        const buttons = [unrelatedConfirm]
        if (dialogOpen) buttons.push(dialogConfirm)
        if (followupDialogOpen) buttons.push(followupConfirm)
        return buttons
      }
      return []
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
  }
}

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
