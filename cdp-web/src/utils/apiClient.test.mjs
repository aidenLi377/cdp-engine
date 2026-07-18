import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
} from './apiClient.js'

test('API requests use a 30 second default timeout', () => {
  assert.equal(DEFAULT_REQUEST_TIMEOUT_MS, 30_000)
})

test('fetchWithTimeout rejects stalled requests with a timeout error', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = (_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
  })

  await assert.rejects(
    fetchWithTimeout('/api/stalled', { timeoutMs: 10 }),
    (error) => error?.name === 'TimeoutError' && /1 秒/.test(error.message),
  )
})

test('fetchWithTimeout keeps caller cancellation distinct from a timeout', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = (_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
  })

  const controller = new AbortController()
  const request = fetchWithTimeout('/api/cancelled', {
    timeoutMs: 100,
    signal: controller.signal,
  })
  controller.abort(new DOMException('cancelled', 'AbortError'))

  await assert.rejects(request, (error) => error?.name === 'AbortError')
})
