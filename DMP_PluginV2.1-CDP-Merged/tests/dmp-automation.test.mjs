import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(currentDir, '..', 'cdp-dmp-automation.js'), 'utf8')

test('DMP automation content script reports ready on the crowd page', () => {
  let runtimeListener = null
  const window = {
    location: { href: 'https://dmp.taobao.com/index_new.html#!/crowds-new/list?spm=' },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle() {
      return { display: 'block', visibility: 'visible', opacity: '1' }
    },
  }
  const document = {
    body: { textContent: 'DMP crowd list '.repeat(30) },
    querySelector() { return null },
    querySelectorAll() { return [] },
    evaluate() { return { singleNodeValue: null } },
  }
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) { runtimeListener = listener },
      },
    },
  }
  const context = {
    window,
    document,
    chrome,
    console,
    Element: class Element {},
    XPathResult: { FIRST_ORDERED_NODE_TYPE: 0 },
    MouseEvent: class MouseEvent {},
    URL,
    fetch,
    setTimeout,
    clearTimeout,
  }
  vm.runInNewContext(source, context, { filename: 'cdp-dmp-automation.js' })
  let response = null
  const asyncResponse = runtimeListener(
    { type: 'PING_DMP_READY' },
    {},
    (payload) => { response = payload },
  )
  assert.equal(asyncResponse, false)
  assert.equal(response.ok, true)
  assert.equal(response.ready, true)
  assert.equal(response.onCrowd, true)
})
