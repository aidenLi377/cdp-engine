import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createQuickDateRangeGroups,
  getQuickDateRange,
  getQuickRangeSelectableStart,
  formatQuickDateValue,
} from './dateQuickRanges.js'

const referenceDate = new Date(2026, 7, 3, 15, 30)

test('recent 180 days ends yesterday and contains exactly 180 calendar days', () => {
  assert.deepEqual(
    getQuickDateRange('recent180Days', referenceDate),
    ['20260204', '20260802'],
  )
})

test('previous 180 days immediately precedes the recent period', () => {
  assert.deepEqual(
    getQuickDateRange('previous180Days', referenceDate),
    ['20250808', '20260203'],
  )
})

test('one-year presets end yesterday and form two adjacent calendar-year periods', () => {
  assert.deepEqual(
    getQuickDateRange('recent1Year', referenceDate),
    ['20250803', '20260802'],
  )
  assert.deepEqual(
    getQuickDateRange('previous1Year', referenceDate),
    ['20240803', '20250802'],
  )
})

test('one-year presets clamp leap-day anniversaries without crossing into March', () => {
  const leapDay = new Date(2024, 1, 29, 8, 0)
  assert.deepEqual(
    getQuickDateRange('recent1Year', leapDay),
    ['20230228', '20240228'],
  )
  assert.deepEqual(
    getQuickDateRange('previous1Year', leapDay),
    ['20220228', '20230227'],
  )
})

test('six-month presets use complete months and exclude the current month', () => {
  assert.deepEqual(
    getQuickDateRange('recent6Months', referenceDate),
    ['20260201', '20260731'],
  )
  assert.deepEqual(
    getQuickDateRange('previous6Months', referenceDate),
    ['20250801', '20260131'],
  )
})

test('selectable history covers the start of the previous rolling year', () => {
  assert.equal(
    formatQuickDateValue(getQuickRangeSelectableStart(referenceDate)),
    '20240803',
  )

  assert.equal(
    formatQuickDateValue(getQuickRangeSelectableStart(new Date(2026, 0, 1))),
    '20240101',
  )
})

test('quick range groups expose UI labels without changing the date range shape', () => {
  assert.deepEqual(createQuickDateRangeGroups(referenceDate), [
    {
      label: '日维度',
      items: [
        { key: 'recent180Days', label: '最近180天', dateRange: ['20260204', '20260802'] },
        { key: 'previous180Days', label: '上一个180天', dateRange: ['20250808', '20260203'] },
        { key: 'recent1Year', label: '近一年', dateRange: ['20250803', '20260802'] },
        { key: 'previous1Year', label: '前一年', dateRange: ['20240803', '20250802'] },
      ],
    },
    {
      label: '月维度',
      items: [
        { key: 'recent6Months', label: '最近6个完整月', dateRange: ['20260201', '20260731'] },
        { key: 'previous6Months', label: '上一个6个月', dateRange: ['20250801', '20260131'] },
      ],
    },
  ])
})

test('invalid presets fail explicitly instead of returning an incomplete range', () => {
  assert.throws(
    () => getQuickDateRange('futurePeriod', referenceDate),
    /未知的快捷日期周期/,
  )
})
