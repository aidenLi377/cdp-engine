import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildParameterBatchRows,
  collectBatchAllowedValues,
  isBatchableParameterSection,
  parseExcelParameterMatrix,
} from './parameterBatch.js'

test('Excel parameter paste treats rows as packages and cells as values', () => {
  assert.deepEqual(parseExcelParameterMatrix(
    '品牌1\t品牌2\n品牌3\t\n品牌4\t品牌5\t品牌6\n',
  ), [
    { sourceRow: 1, values: ['品牌1', '品牌2'] },
    { sourceRow: 2, values: ['品牌3'] },
    { sourceRow: 3, values: ['品牌4', '品牌5', '品牌6'] },
  ])
})
test('parameter batch rows ignore blanks and deduplicate inside one row', () => {
  const rows = buildParameterBatchRows('品牌1\t\t品牌1\t品牌2\n\n品牌3', {
    baseName: '流入',
  })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0].values, ['品牌1', '品牌2'])
  assert.equal(rows[0].crowdName, '流入_品牌1+品牌2')
})

test('parameter batch validates dictionary values, limits and repeated rows', () => {
  const rows = buildParameterBatchRows('品牌1\t品牌2\n品牌2\t品牌1\n未知品牌', {
    allowedValues: ['品牌1', '品牌2'],
    maxItems: 1,
    baseName: '流入',
  })
  assert.equal(rows[0].overLimit, true)
  assert.equal(rows[1].duplicateOf, 1)
  assert.deepEqual(rows[2].invalidValues, ['未知品牌'])
  assert.ok(rows.every((row) => !row.valid))
})

test('batchable parameters are driven by multi-value widget types', () => {
  assert.equal(isBatchableParameterSection({ type: '搜索多选' }), true)
  assert.equal(isBatchableParameterSection({ bindings: [{ widgetType: '列表输入' }] }), true)
  assert.equal(isBatchableParameterSection({ type: '日期_切换' }), false)
})

test('allowed values use the intersection shared by every binding', () => {
  assert.deepEqual(collectBatchAllowedValues({
    bindings: [
      { options: ['品牌1', '品牌2'] },
      { options: [{ value: '品牌2', label: '品牌二' }, { value: '品牌3' }] },
    ],
  }), ['品牌2'])
})
