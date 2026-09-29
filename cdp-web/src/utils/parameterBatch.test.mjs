import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDatedParameterCrowdName,
  buildDateParameterBatchRows,
  buildParameterBatchRows,
  collectBatchAllowedValues,
  isBatchableParameterSection,
  isDateBatchParameterSection,
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

test('batchable parameters include date fields bound only to date widgets', () => {
  assert.equal(isBatchableParameterSection({ type: '搜索多选' }), true)
  assert.equal(isBatchableParameterSection({ bindings: [{ widgetType: '列表输入' }] }), true)
  assert.equal(isBatchableParameterSection({ type: '日期_切换', bindings: [{ widgetType: '日期_切换' }] }), true)
  assert.equal(isDateBatchParameterSection({ type: '日期_切换', bindings: [{ widgetType: '搜索多选' }] }), false)
  assert.equal(isBatchableParameterSection({ type: '日期_切换' }), false)
})

test('date batch rows accept recent days and one or two column fixed ranges', () => {
  const rows = buildDateParameterBatchRows(
    '过去 30 天\n60\n2026-09-01\t2026-09-15\n2026/09/16 至 2026/09/20\n2026-09-21\t2026-09-21',
    { baseName: '购买人群', minimumDate: '20240101', maximumDate: '20260928' },
  )
  assert.equal(rows.length, 5)
  assert.deepEqual(rows.map((row) => row.parameterValue), [
    { days: 30, dateRange: [], mode: 'recent' },
    { days: 60, dateRange: [], mode: 'recent' },
    { dateRange: ['20260901', '20260915'], mode: 'range' },
    { dateRange: ['20260916', '20260920'], mode: 'range' },
    { dateRange: ['20260921', '20260921'], mode: 'range' },
  ])
  assert.equal(rows[2].values[0], '2026-09-01 至 2026-09-15')
  assert.equal(rows[2].crowdName, '购买人群_2026-09-01 至 2026-09-15')
  assert.ok(rows.every((row) => row.valid))
})

test('date batch rejects invalid, duplicate and out-of-range rows before creation', () => {
  const rows = buildDateParameterBatchRows(
    '过去 0 天\n过去 367 天\n2026-02-30\t2026-03-01\n2026-09-10\t2026-09-01\n2025-01-01\t2026-09-01\n2024-01-01\t2024-01-02\n2026-09-28\t2026-09-29\n过去30天\n最近 30 天\n2026-09-01\t',
    { minimumDate: '20250101', maximumDate: '20260928' },
  )
  assert.equal(rows.length, 10)
  assert.ok(rows.slice(0, 7).every((row) => !row.valid))
  assert.equal(rows[7].valid, true)
  assert.equal(rows[8].duplicateOf, 8)
  assert.equal(rows[8].valid, false)
  assert.match(rows[9].issues.join(''), /开始日期和结束日期/)
})

test('automation appends the run date after the full split date name and stays idempotent', () => {
  const original = '组合人群_2026-08-01 至 2026-08-15｜1·人群'
  const prepared = buildDatedParameterCrowdName({ crowdName: original }, '0929')
  assert.deepEqual(prepared, { baseName: original, crowdName: `${original}_0929` })
  assert.deepEqual(buildDatedParameterCrowdName({
    ...prepared, runDateSuffix: '0929',
  }, '0929'), prepared)
  assert.deepEqual(buildDatedParameterCrowdName({
    ...prepared, runDateSuffix: '0929',
  }, '0930'), { baseName: original, crowdName: `${original}_0930` })
  assert.deepEqual(buildDatedParameterCrowdName({
    baseCrowdName: original,
    crowdName: '组合人群_2026-08-01 0929',
    runDateSuffix: '0929',
  }, '0929'), prepared)
})

test('allowed values use the intersection shared by every binding', () => {
  assert.deepEqual(collectBatchAllowedValues({
    bindings: [
      { options: ['品牌1', '品牌2'] },
      { options: [{ value: '品牌2', label: '品牌二' }, { value: '品牌3' }] },
    ],
  }), ['品牌2'])
})
