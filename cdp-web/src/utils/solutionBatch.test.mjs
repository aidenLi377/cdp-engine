import test from 'node:test'
import assert from 'node:assert/strict'

import {
  analyzeBatchCustomFieldCompatibility,
  buildBatchCustomFieldSections,
  collectUniqueCustomFieldNames,
} from './solutionBatch.js'

test('combination preview reports field coverage, type compatibility and binding totals', () => {
  const solutions = [
    {
      id: 'browse',
      customFields: [
        { name: '分析类目', type: '搜索多选', bindings: [{}, {}] },
        { name: '本品牌', type: '搜索多选', bindings: [{}] },
      ],
    },
    {
      id: 'buy-own',
      customFields: [
        { name: '分析类目', type: '搜索多选', bindings: [{}, {}, {}] },
        { name: '本品牌', type: '搜索多选', bindings: [{}, {}] },
      ],
    },
    {
      id: 'buy-competitor',
      customFields: [
        { name: '分析类目', type: '搜索多选', bindings: [{}, {}, {}] },
        { name: '本品牌', type: '搜索单选', bindings: [{}] },
      ],
    },
  ]

  const rows = analyzeBatchCustomFieldCompatibility(solutions)
  const category = rows.find(row => row.name === '分析类目')
  const ownBrand = rows.find(row => row.name === '本品牌')

  assert.equal(category.solutionCount, 3)
  assert.equal(category.coverageComplete, true)
  assert.equal(category.bindingCount, 8)
  assert.equal(category.compatible, true)
  assert.equal(ownBrand.bindingCount, 4)
  assert.equal(ownBrand.compatible, false)
})

test('batch parameter names deduplicate only by trimmed display name', () => {
  const solutions = [
    {
      customFields: [
        { name: '统计时间_前', type: '日期' },
        { name: '类目', type: '多选' },
      ],
    },
    {
      customFields: [
        { name: ' 统计时间_前 ', type: '普通输入' },
        { name: '本品牌', type: '单选' },
      ],
    },
  ]

  assert.deepEqual(
    collectUniqueCustomFieldNames(solutions),
    ['统计时间_前', '类目', '本品牌'],
  )
})

test('batch sections merge same-name bindings and retain package coverage', () => {
  const entries = [
    {
      id: 'solution-in',
      crowdName: '流入人群',
      solutionName: '流入方案',
      record: { customFields: [{ id: 'in-time', name: '统计时间_前' }] },
      nodes: [{ id: 'node-in' }],
    },
    {
      id: 'solution-out',
      crowdName: '流出人群',
      solutionName: '流出方案',
      record: { customFields: [{ id: 'out-time', name: '统计时间_前' }] },
      nodes: [{ id: 'node-out' }],
    },
  ]

  const buildSections = (fields, nodes) => fields.map((field) => ({
    customFieldId: field.id,
    name: field.name,
    type: '日期',
    bindings: [{
      nodeId: nodes[0].id,
      fieldKey: 'time',
    }],
  }))

  const [section] = buildBatchCustomFieldSections(entries, buildSections)

  assert.equal(section.name, '统计时间_前')
  assert.equal(section.customFieldId, 'batch:统计时间_前')
  assert.equal(section.entryCount, 2)
  assert.deepEqual(
    section.bindings.map((binding) => binding.entryId),
    ['solution-in', 'solution-out'],
  )
})
