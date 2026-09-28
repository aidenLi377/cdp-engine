import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUDIENCE_SCHEDULE_MISSED_AFTER_MS,
  completeAudienceSchedule,
  deferAudienceSchedule,
  getAudienceScheduleTiming,
  loadAudienceSchedules,
  nextAudienceScheduleRun,
  saveAudienceSchedules,
} from './audienceSchedules.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function task(overrides = {}) {
  return {
    id: 'schedule-1',
    groupKey: 'folder:1',
    groupName: '高洁丝',
    repeat: 'once',
    runAt: 2_000,
    snapshot: { entries: [{ id: 'entry-1' }] },
    selectedIndexes: [0],
    status: 'scheduled',
    ...overrides,
  }
}

test('scheduled audience tasks persist per owner', () => {
  const storage = memoryStorage()
  assert.equal(saveAudienceSchedules('user-a', [task()], storage), true)
  assert.equal(loadAudienceSchedules('user-a', storage).length, 1)
  assert.equal(loadAudienceSchedules('user-b', storage).length, 0)
})

test('one-time tasks become due and eventually require manual recovery', () => {
  assert.equal(getAudienceScheduleTiming(task(), 2_001).due, true)
  const timing = getAudienceScheduleTiming(task(), 2_000 + AUDIENCE_SCHEDULE_MISSED_AFTER_MS + 1)
  assert.equal(timing.due, false)
  assert.equal(timing.missed, true)
})

test('environment deferral waits until the retry time', () => {
  const deferred = deferAudienceSchedule(task(), '登录失效', { now: 2_100, retryDelayMs: 500 })
  assert.equal(deferred.status, 'waiting_environment')
  assert.equal(getAudienceScheduleTiming(deferred, 2_500).due, false)
  assert.equal(getAudienceScheduleTiming(deferred, 2_600).due, true)
})

test('recurring tasks skip historical occurrences and preserve one next run', () => {
  assert.equal(nextAudienceScheduleRun(1_000, 'daily', 1_000 + 3 * 86_400_000), 1_000 + 4 * 86_400_000)
  const completed = completeAudienceSchedule(task({ repeat: 'weekly' }), { now: 2_100 })
  assert.equal(completed.status, 'scheduled')
  assert.ok(completed.runAt > 2_100)
})

test('one-time completion records errors without retrying creation automatically', () => {
  const completed = completeAudienceSchedule(task(), {
    now: 2_100,
    hasErrors: true,
    result: '1 个失败',
  })
  assert.equal(completed.status, 'completed_with_errors')
  assert.equal(completed.lastError, '1 个失败')
})
