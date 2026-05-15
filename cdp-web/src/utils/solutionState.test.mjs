import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fieldToken,
  serializeNodesForSolution,
  cleanWorkbenchFieldIds,
  buildUsageSections,
  isWorkbenchStructureLocked,
} from './solutionState.js'

test('serializeNodesForSolution strips runtime-only fields and preserves persisted shape', () => {
  const nodes = [
    {
      id: 'node-1',
      packageType: 'category',
      operator: 'AND',
      formData: { channel: ['tmall'] },
      modeData: { audience: 'vip' },
      schema: [{ key: 'channel', label: 'Channel' }],
      logicMatrix: { DEFAULT: ['channel'] },
      collapsed: true,
      selectedFirstDate: new Date('2026-05-15T00:00:00Z'),
      tempUiState: { dragging: false },
    },
  ]

  assert.deepEqual(serializeNodesForSolution(nodes), [
    {
      id: 'node-1',
      packageType: 'category',
      operator: 'AND',
      formData: { channel: ['tmall'] },
      modeData: { audience: 'vip' },
    },
  ])
})

test('fieldToken uses persisted nodeId:fieldKey format', () => {
  assert.equal(fieldToken('node-1', 'channel'), 'node-1:channel')
})

test('buildUsageSections keeps only selected fields and preserves grouped node data for component use', () => {
  const nodes = [
    {
      id: 'node-1',
      packageType: 'category',
      operator: 'AND',
      schema: [
        { key: 'channel', label: 'Channel' },
        { key: 'dateRange', label: 'Date Range' },
      ],
      formData: {
        channel: ['tmall'],
        dateRange: ['2026-05-01', '2026-05-15'],
      },
      modeData: { audience: 'vip' },
    },
    {
      id: 'node-2',
      packageType: 'product',
      operator: 'OR',
      schema: [
        { key: 'behavior', label: 'Behavior' },
        { key: 'sku', label: 'SKU' },
      ],
      formData: {
        behavior: ['buy'],
        sku: ['sku-1'],
      },
    },
  ]

  const workbenchFieldIds = [
    'node-1:channel',
    'node-2:sku',
  ]

  const sections = buildUsageSections(nodes, workbenchFieldIds)

  assert.equal(sections.length, 2)
  assert.deepEqual(sections.map((section) => section.index), [0, 1])
  assert.deepEqual(sections.map((section) => section.node.id), ['node-1', 'node-2'])
  assert.deepEqual(sections[0].node, {
    id: 'node-1',
    packageType: 'category',
    operator: 'AND',
    formData: {
      channel: ['tmall'],
      dateRange: ['2026-05-01', '2026-05-15'],
    },
    modeData: { audience: 'vip' },
    schema: [{ key: 'channel', label: 'Channel' }],
  })
  assert.deepEqual(sections[1].node, {
    id: 'node-2',
    packageType: 'product',
    operator: 'OR',
    formData: {
      behavior: ['buy'],
      sku: ['sku-1'],
    },
    modeData: {},
    schema: [{ key: 'sku', label: 'SKU' }],
  })
  assert.deepEqual(sections[0].fields, [{ key: 'channel', label: 'Channel' }])
  assert.deepEqual(sections[1].fields, [{ key: 'sku', label: 'SKU' }])
})

test('cleanWorkbenchFieldIds removes selections for deleted nodes', () => {
  const nodes = [
    {
      id: 'node-1',
      schema: [{ key: 'channel', label: 'Channel' }],
    },
  ]

  const cleaned = cleanWorkbenchFieldIds(
    ['node-1:channel', 'node-2:sku'],
    nodes,
  )

  assert.deepEqual(cleaned, ['node-1:channel'])
})

test('buildUsageSections returns [] when no workbench fields are selected', () => {
  const nodes = [
    {
      id: 'node-1',
      packageType: 'category',
      schema: [{ key: 'channel', label: 'Channel' }],
      formData: { channel: ['tmall'] },
    },
  ]

  assert.deepEqual(buildUsageSections(nodes, []), [])
})

test('cleanWorkbenchFieldIds removes invalid field keys after schema changes', () => {
  const nodes = [
    {
      id: 'node-1',
      schema: [{ key: 'channel', label: 'Channel' }],
    },
  ]

  const cleaned = cleanWorkbenchFieldIds(
    ['node-1:channel', 'node-1:oldField'],
    nodes,
  )

  assert.deepEqual(cleaned, ['node-1:channel'])
})

test('isWorkbenchStructureLocked only locks workbench structure for active published solutions', () => {
  assert.equal(isWorkbenchStructureLocked(null), false)
  assert.equal(isWorkbenchStructureLocked({ id: 'draft-1', status: 'draft' }), false)
  assert.equal(isWorkbenchStructureLocked({ id: 'pub-1', status: 'published' }), true)
})
