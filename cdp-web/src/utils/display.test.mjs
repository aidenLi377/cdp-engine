import test from 'node:test'
import assert from 'node:assert/strict'

import { getCfComparableValueKey, summarizeCfDisplayValue } from './display.js'

test('summarizeCfDisplayValue compacts multi-select arrays into first item plus overflow metadata', () => {
  assert.deepEqual(
    summarizeCfDisplayValue(['乳液/面霜', '面部护理套装', '旅行购物>美容护肤/美体/精油']),
    {
      primaryText: '乳液/面霜',
      overflowCount: 2,
      overflowText: '面部护理套装\n旅行购物>美容护肤/美体/精油',
    },
  )
})

test('summarizeCfDisplayValue keeps scalar values as a single-line summary', () => {
  assert.deepEqual(
    summarizeCfDisplayValue('天猫'),
    {
      primaryText: '天猫',
      overflowCount: 0,
      overflowText: '',
    },
  )
})

test('summarizeCfDisplayValue normalizes empty arrays to an empty-state summary', () => {
  assert.deepEqual(
    summarizeCfDisplayValue([]),
    {
      primaryText: '(空)',
      overflowCount: 0,
      overflowText: '',
    },
  )
})

test('date range comparison ignores inactive recent-day values', () => {
  const first = getCfComparableValueKey(
    { days: 30, dateRange: ['20260901', '20260916'] },
    'range',
    '日期_切换',
  )
  const second = getCfComparableValueKey(
    { days: 180, dateRange: ['20260901', '20260916'] },
    'range',
    '日期_切换',
  )

  assert.equal(first, second)
})

test('date range comparison still detects different effective ranges', () => {
  const first = getCfComparableValueKey(
    { days: 30, dateRange: ['20260901', '20260916'] },
    'range',
    '日期_切换',
  )
  const second = getCfComparableValueKey(
    { days: 30, dateRange: ['20260902', '20260916'] },
    'range',
    '日期_切换',
  )

  assert.notEqual(first, second)
})

test('recent-date comparison ignores an inactive fixed range', () => {
  const first = getCfComparableValueKey(
    { days: 30, dateRange: ['20260901', '20260916'] },
    'recent',
    '日期_切换',
  )
  const second = getCfComparableValueKey(
    { days: 30, dateRange: [] },
    'recent',
    '日期_切换',
  )

  assert.equal(first, second)
})
