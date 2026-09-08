import test from 'node:test'
import assert from 'node:assert/strict'
import { expandCombinationParameterRows } from './combinationParameterBatch.js'

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
