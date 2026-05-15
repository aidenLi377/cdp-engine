import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fieldToken,
  serializeNodesForSolution,
  cleanWorkbenchFieldIds,
  buildUsageSections,
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

test('buildUsageSections keeps only selected fields and preserves node grouping', () => {
  const nodes = [
    {
      id: 'node-1',
      packageType: 'category',
      schema: [
        { key: 'channel', label: 'Channel' },
        { key: 'dateRange', label: 'Date Range' },
      ],
      formData: {
        channel: ['tmall'],
        dateRange: ['2026-05-01', '2026-05-15'],
      },
    },
    {
      id: 'node-2',
      packageType: 'product',
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
    fieldToken('node-1', 'channel'),
    fieldToken('node-2', 'sku'),
  ]

  assert.deepEqual(buildUsageSections(nodes, workbenchFieldIds), [
    {
      nodeId: 'node-1',
      packageType: 'category',
      fields: [
        {
          fieldKey: 'channel',
          label: 'Channel',
          value: ['tmall'],
          token: fieldToken('node-1', 'channel'),
        },
      ],
    },
    {
      nodeId: 'node-2',
      packageType: 'product',
      fields: [
        {
          fieldKey: 'sku',
          label: 'SKU',
          value: ['sku-1'],
          token: fieldToken('node-2', 'sku'),
        },
      ],
    },
  ])
})

test('cleanWorkbenchFieldIds removes selections for deleted nodes', () => {
  const nodes = [
    {
      id: 'node-1',
      schema: [{ key: 'channel', label: 'Channel' }],
    },
  ]

  const cleaned = cleanWorkbenchFieldIds(
    [fieldToken('node-1', 'channel'), fieldToken('node-2', 'sku')],
    nodes,
  )

  assert.deepEqual(cleaned, [fieldToken('node-1', 'channel')])
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
    [fieldToken('node-1', 'channel'), fieldToken('node-1', 'oldField')],
    nodes,
  )

  assert.deepEqual(cleaned, [fieldToken('node-1', 'channel')])
})
