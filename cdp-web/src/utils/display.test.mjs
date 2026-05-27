import test from 'node:test'
import assert from 'node:assert/strict'

import { summarizeCfDisplayValue } from './display.js'

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
