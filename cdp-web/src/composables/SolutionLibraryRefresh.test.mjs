import test from 'node:test'
import assert from 'node:assert/strict'

import { useSolutionsApi } from './useSolutionsApi.js'
import { useFoldersApi } from './useFoldersApi.js'

test('forced solution and folder refresh bypass browser caches', async () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const requests = []

  globalThis.window = {
    location: { origin: 'http://localhost' },
    dispatchEvent() {},
  }
  globalThis.fetch = async (input, options) => {
    requests.push({ input, options })
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await useSolutionsApi().listSolutions('published', 'mine', { fresh: true })
    await useFoldersApi().listFolders('mine', { fresh: true })
  } finally {
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
  }

  assert.equal(requests.length, 2)
  for (const item of requests) {
    assert.equal(item.options.cache, 'no-store')
    assert.match(item.input, /[?&]_refresh=\d+/)
  }
  assert.match(requests[0].input, /\/api\/solutions\?status=published&scope=mine/)
  assert.match(requests[1].input, /\/api\/folders\?scope=mine/)
})
