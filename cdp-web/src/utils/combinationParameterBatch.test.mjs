import test from 'node:test'
import assert from 'node:assert/strict'
import { expandCombinationParameterRows } from './combinationParameterBatch.js'
import { buildDatedParameterCrowdName } from './parameterBatch.js'
import { syncCustomFieldValue } from './solutionState.js'

test('three rows expand three solutions into nine independent packages using local field ids', () => {
  const sources = [0, 1, 2].map(i => ({ record: { id: i, name: `方案${i}`, customFields: [{ id: `brand-${i}`, name: '竞争品牌' }] }, nodes: [{ own: 'SK-II', competitor: 'CPB', category: '化妆水' }] }))
  const rows = ['兰蔻', '雅诗兰黛', '赫莲娜'].map((brand, i) => ({ sourceRow: i + 1, values: [brand], crowdName: brand }))
  const calls = []
  const result = expandCombinationParameterRows(sources, rows, '竞争品牌', (nodes, id, fields, value) => { calls.push(id); nodes[0].competitor = value[0] }, 1)
  assert.equal(result.length, 9)
  assert.equal(new Set(result.map(x => x.crowdName)).size, 9)
  assert.deepEqual(calls, ['brand-0', 'brand-1', 'brand-2', 'brand-0', 'brand-1', 'brand-2', 'brand-0', 'brand-1', 'brand-2'])
  assert.deepEqual(result.map(x => x.nodes[0].competitor), ['兰蔻','兰蔻','兰蔻','雅诗兰黛','雅诗兰黛','雅诗兰黛','赫莲娜','赫莲娜','赫莲娜'])
  assert.ok(result.every(x => x.nodes[0].own === 'SK-II' && x.nodes[0].category === '化妆水'))
  assert.equal(sources[0].nodes[0].competitor, 'CPB')
  result[0].nodes[0].own = 'changed'
  assert.equal(result[1].nodes[0].own, 'SK-II')
})
test('partial field coverage and more than 100 tasks are rejected before expansion', () => {
  assert.throws(() => expandCombinationParameterRows([{ record: { customFields: [] } }], [{ values: ['A'] }], '竞争品牌', () => {}), /未覆盖/)
  assert.throws(() => expandCombinationParameterRows(Array(3).fill({}), Array(34).fill({}), '竞争品牌', () => {}), /100/)
})

test('date batch values set each solution date mode and range independently', () => {
  const sources = [0, 1].map(index => ({
    record: { name: `方案${index}`, customFields: [{ id: `date-${index}`, name: '统计时间', bindings: [{ nodeId: `node-${index}`, fieldKey: 'time' }] }] },
    nodes: [{ id: `node-${index}`, formData: { time: { days: 30, dateRange: [] } }, modeData: { time: 'recent' } }],
  }))
  const rows = [{
    sourceRow: 1,
    values: ['2026-09-01 至 2026-09-15'],
    parameterValue: { dateRange: ['20260901', '20260915'], mode: 'range' },
    crowdName: '组合人群_2026-09-01 至 2026-09-15',
  }]
  const entries = expandCombinationParameterRows(sources, rows, '统计时间', syncCustomFieldValue, 1)
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map(entry => entry.nodes[0].modeData.time), ['range', 'range'])
  assert.deepEqual(entries.map(entry => entry.nodes[0].formData.time.dateRange), [
    ['20260901', '20260915'], ['20260901', '20260915'],
  ])
  assert.deepEqual(entries[0].record.customFields[0].defaultValue, rows[0].parameterValue)
  assert.equal(entries[0].crowdName, '组合人群_2026-09-01 至 2026-09-15｜1·方案0')
  assert.equal(entries[1].crowdName, '组合人群_2026-09-01 至 2026-09-15｜2·方案1')
  assert.equal(
    buildDatedParameterCrowdName(entries[0], '0929').crowdName,
    '组合人群_2026-09-01 至 2026-09-15｜1·方案0_0929',
  )
  assert.ok(entries.every(entry => entry.parameterBatchIsDate))
  assert.equal(sources[0].nodes[0].modeData.time, 'recent')
})
