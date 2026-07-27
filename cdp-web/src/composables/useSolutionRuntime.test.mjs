import test from 'node:test'
import assert from 'node:assert/strict'

import { reactive } from 'vue'

import { bindRuntimeUsageSections, cloneValue } from './useSolutionRuntime.js'

test('cloneValue unwraps nested Vue proxies created by editing structured parameters', () => {
  const editValue = reactive({
    days: 17,
    dateRange: ['2026-07-01', '2026-07-17'],
  })
  const emittedPayload = {
    ...editValue,
    mode: 'recent',
  }

  const cloned = cloneValue(emittedPayload)

  assert.deepEqual(cloned, {
    days: 17,
    dateRange: ['2026-07-01', '2026-07-17'],
    mode: 'recent',
  })
  assert.notEqual(cloned.dateRange, emittedPayload.dateRange)
})

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
