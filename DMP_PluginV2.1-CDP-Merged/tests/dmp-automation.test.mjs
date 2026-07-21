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

test('DMP waits for the initial crowd list to fully settle before pressing Enter', () => {
  const phaseStart = source.indexOf('async function phase1SearchAndMatch')
  const phaseEnd = source.indexOf('// ============= Phase 2', phaseStart)
  const phase1 = source.slice(phaseStart, phaseEnd)
  const readinessAt = phase1.indexOf('await waitForCrowdListInitialized()')
  const inputAt = phase1.indexOf('// Find search input')
  const keydownAt = phase1.indexOf("new KeyboardEvent('keydown'")
  const keyupAt = phase1.indexOf("new KeyboardEvent('keyup'")
  const tableWaitAt = phase1.indexOf('// Wait for results table')

  assert.match(source, /document\.readyState !== 'complete'/)
  assert.match(source, /isCrowdListLoading\(\)/)
  assert.match(source, /stableChecks >= DMP_INITIAL_LIST_STABLE_CHECKS/)
  assert.match(source, /await sleep\(DMP_INITIAL_LIST_SETTLE_MS\)/)
  assert.ok(readinessAt >= 0)
  assert.ok(inputAt > readinessAt)
  assert.ok(keydownAt > inputAt)
  assert.ok(keyupAt > keydownAt)
  assert.ok(tableWaitAt > keyupAt)
  assert.doesNotMatch(source, /DMP_SEARCH_ONLY_TEST_MODE|searchOnly: true/)
  assert.equal((phase1.match(/new KeyboardEvent\('keydown'/g) || []).length, 1)
  assert.equal((phase1.match(/new KeyboardEvent\('keyup'/g) || []).length, 1)
})
