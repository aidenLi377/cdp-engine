import test from 'node:test'
import assert from 'node:assert/strict'

import { bindRuntimeUsageSections } from './useSolutionRuntime.js'

test('bindRuntimeUsageSections keeps solution-use sections bound to live runtime node state', () => {
  const runtimeNode = {
    id: 'node-1',
    packageType: 'category',
    operator: null,
    schema: [
      { key: 'channel', label: 'Channel' },
      { key: 'dateRange', label: 'Date Range' },
    ],
    logicMatrix: { DEFAULT: ['channel', 'dateRange'] },
    formData: {
      channel: ['tmall'],
      dateRange: ['2026-05-01', '2026-05-15'],
    },
    modeData: { audience: 'vip' },
    selectedFirstDate: null,
    collapsed: false,
  }

  const baseSections = [
    {
      index: 0,
      nodeId: 'node-1',
      node: {
        id: 'node-1',
        packageType: 'category',
        operator: null,
        formData: { channel: ['tmall'] },
        modeData: { audience: 'vip' },
        schema: [{ key: 'channel', label: 'Channel' }],
      },
      fields: [{ key: 'channel', label: 'Channel' }],
    },
  ]

  const sections = bindRuntimeUsageSections(baseSections, [runtimeNode])

  assert.notEqual(sections[0].node, runtimeNode)
  assert.equal(sections[0].node.formData, runtimeNode.formData)
  assert.equal(sections[0].node.modeData, runtimeNode.modeData)
  assert.equal(sections[0].node.schema, sections[0].fields)
  assert.deepEqual(runtimeNode.schema, [
    { key: 'channel', label: 'Channel' },
    { key: 'dateRange', label: 'Date Range' },
  ])

  sections[0].node.formData.channel = ['jd']
  assert.deepEqual(runtimeNode.formData.channel, ['jd'])
})
