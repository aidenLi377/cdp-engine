import test from 'node:test'
import assert from 'node:assert/strict'

import { rankCategoryOptions } from './categoryOptionSearch.js'

test('category search ranks deeper matching levels before first-level matches', () => {
  const options = [
    { label: '彩妆/香水/美妆工具>CC霜', value: 'top-level-hit' },
    { label: '美容护肤/美体/精油>香水', value: 'second-level-leaf' },
    { label: '美容护肤/美体/精油>香水>女士', value: 'second-level-parent' },
    { label: '美容护肤/美体/精油>身体护理>香水', value: 'third-level-leaf' },
  ]

  assert.deepEqual(
    rankCategoryOptions(options, '香水').map(option => option.value),
    [
      'third-level-leaf',
      'second-level-leaf',
      'second-level-parent',
      'top-level-hit',
    ],
  )
})

test('category search prefers exact leaf matches within the same level', () => {
  const options = [
    { label: '美容护肤/美体/精油>香水套装', value: 'prefix-hit' },
    { label: '美容护肤/美体/精油>香水', value: 'exact-hit' },
    { label: '美容护肤/美体/精油>女士香水', value: 'contains-hit' },
  ]

  assert.deepEqual(
    rankCategoryOptions(options, '香水').map(option => option.value),
    ['exact-hit', 'prefix-hit', 'contains-hit'],
  )
})

test('category search keeps all options and their original order when the query is empty', () => {
  const options = [
    { label: '美容护肤/美体/精油>香水', value: 'perfume' },
    { label: '美容护肤/美体/精油>乳液/面霜', value: 'cream' },
  ]

  assert.equal(rankCategoryOptions(options, ''), options)
})

test('category search still accepts a pasted full category path', () => {
  const options = [
    { label: '旅行购物>美容护肤/美体/精油>化妆水/爽肤水', value: 'travel-toner' },
    { label: '美容护肤/美体/精油>化妆水/爽肤水', value: 'toner' },
    { label: '美容护肤/美体/精油>乳液/面霜', value: 'cream' },
  ]

  assert.deepEqual(
    rankCategoryOptions(options, '美容护肤/美体/精油 > 化妆水/爽肤水').map(option => option.value),
    ['toner', 'travel-toner'],
  )
})
