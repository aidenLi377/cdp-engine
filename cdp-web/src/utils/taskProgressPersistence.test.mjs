import test from 'node:test'
import assert from 'node:assert/strict'

import { createTaskProgressPersistence } from './taskProgressPersistence.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('progress writes for one task are serialized so completed is always last', async () => {
  const calls = []
  const firstWrite = deferred()
  const firstStarted = deferred()
  const persistence = createTaskProgressPersistence({
    write: async (_taskId, payload) => {
      calls.push(payload.status)
      if (payload.status === 'running') {
        firstStarted.resolve()
        return firstWrite.promise
      }
      return payload
    },
  })

  const running = persistence.enqueue('task-1', { status: 'running' })
  const completed = persistence.save('task-1', { status: 'completed', result: [{ id: 1 }] })

  await firstStarted.promise
  assert.deepEqual(calls, ['running'])
  firstWrite.resolve({ status: 'running' })
  await running
  assert.equal((await completed).status, 'completed')
  assert.deepEqual(calls, ['running', 'completed'])
})

test('terminal save continues after an earlier transient progress failure', async () => {
  const calls = []
  const persistence = createTaskProgressPersistence({
    write: async (_taskId, payload) => {
      calls.push(payload.status)
      if (payload.status === 'running') throw new Error('temporary progress failure')
      return payload
    },
  })

  await persistence.enqueue('task-2', { status: 'running' }).catch(() => null)
  const saved = await persistence.save('task-2', { status: 'completed' })
  assert.equal(saved.status, 'completed')
  assert.deepEqual(calls, ['running', 'completed'])
})

test('terminal save retries before reporting a persistence failure', async () => {
  let attempts = 0
  const waits = []
  const persistence = createTaskProgressPersistence({
    write: async (_taskId, payload) => {
      attempts += 1
      if (attempts < 3) throw new Error('network unavailable')
      return payload
    },
    wait: async (delayMs) => { waits.push(delayMs) },
  })

  const saved = await persistence.save('task-3', { status: 'completed' })
  assert.equal(saved.status, 'completed')
  assert.equal(attempts, 3)
  assert.deepEqual(waits, [400, 1200])
})
