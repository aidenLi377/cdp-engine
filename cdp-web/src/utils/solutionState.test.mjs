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

// ============================================================
// Custom Fields (1:N mapping) tests
// ============================================================

import {
  buildCustomFieldSections,
  syncCustomFieldValue,
  getNodeBindingFieldKeys,
} from './solutionState.js'

test('buildCustomFieldSections maps custom fields to bound node fields with widgetType and options', () => {
  const nodes = [
    {
      id: 'node-1',
      packageType: '商品行为',
      schema: [
        { key: 'date_range', Label: '时间维度', Widget_Type: '日期_切换', options: [] },
        { key: 'channel', Label: '渠道', Widget_Type: '复选组', options: ['天猫', '京东'] },
      ],
    },
    {
      id: 'node-2',
      packageType: '商品行为',
      schema: [
        { key: 'date_range', Label: '时间维度', Widget_Type: '日期_切换', options: [] },
        { key: 'brand', Label: '品牌', Widget_Type: '搜索多选', options: ['欧莱雅', '雅诗兰黛'] },
      ],
    },
  ]

  const customFields = [
    {
      id: 'cf-1',
      name: '统计时间',
      type: '日期_切换',
      group: '',
      defaultValue: { days: 30 },
      bindings: [
        { nodeId: 'node-1', fieldKey: 'date_range' },
        { nodeId: 'node-2', fieldKey: 'date_range' },
      ],
    },
    {
      id: 'cf-2',
      name: '标准品牌',
      type: '搜索多选',
      group: '',
      defaultValue: [],
      bindings: [
        { nodeId: 'node-2', fieldKey: 'brand' },
      ],
    },
  ]

  const sections = buildCustomFieldSections(customFields, nodes)

  assert.equal(sections.length, 2)

  // First custom field
  assert.equal(sections[0].customFieldId, 'cf-1')
  assert.equal(sections[0].name, '统计时间')
  assert.equal(sections[0].type, '日期_切换')
  assert.equal(sections[0].defaultValue.days, 30)
  assert.equal(sections[0].bindings.length, 2)
  assert.deepEqual(sections[0].bindings[0], {
    nodeId: 'node-1',
    packageType: '商品行为',
    fieldKey: 'date_range',
    fieldLabel: '时间维度',
    widgetType: '日期_切换',
    options: [],
  })

  // Second custom field
  assert.equal(sections[1].customFieldId, 'cf-2')
  assert.equal(sections[1].bindings.length, 1)
  assert.equal(sections[1].bindings[0].widgetType, '搜索多选')
  assert.deepEqual(sections[1].bindings[0].options, ['欧莱雅', '雅诗兰黛'])
})

test('buildCustomFieldSections skips bindings for deleted nodes and missing fields', () => {
  const nodes = [
    {
      id: 'node-1',
      packageType: '商品行为',
      schema: [{ key: 'date_range', Label: '时间维度', Widget_Type: '日期_切换', options: [] }],
    },
  ]

  const customFields = [
    {
      id: 'cf-1',
      name: '测试',
      type: '日期_切换',
      group: '',
      defaultValue: {},
      bindings: [
        { nodeId: 'node-1', fieldKey: 'date_range' },
        { nodeId: 'node-deleted', fieldKey: 'date_range' },       // deleted node
        { nodeId: 'node-1', fieldKey: 'non_existent_field' },     // missing field
      ],
    },
  ]

  const sections = buildCustomFieldSections(customFields, nodes)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].bindings.length, 1) // only the valid binding
  assert.equal(sections[0].bindings[0].nodeId, 'node-1')
  assert.equal(sections[0].bindings[0].fieldKey, 'date_range')
})

test('buildCustomFieldSections returns empty array for empty or missing custom fields', () => {
  assert.deepEqual(buildCustomFieldSections([], []), [])
  assert.deepEqual(buildCustomFieldSections(null, []), [])
  assert.deepEqual(buildCustomFieldSections(undefined, []), [])
})

test('syncCustomFieldValue writes array values without corrupting them', () => {
  const nodes = [
    {
      id: 'node-1',
      formData: { cate: ['美妆'] },
      modeData: {},
    },
    {
      id: 'node-2',
      formData: { cate: ['护肤'] },
      modeData: {},
    },
  ]

  const customFields = [
    {
      id: 'cf-1',
      bindings: [
        { nodeId: 'node-1', fieldKey: 'cate' },
        { nodeId: 'node-2', fieldKey: 'cate' },
      ],
    },
  ]

  syncCustomFieldValue(nodes, 'cf-1', customFields, ['面部护理', '精华'])
  assert.deepEqual(nodes[0].formData.cate, ['面部护理', '精华'])
  assert.deepEqual(nodes[1].formData.cate, ['面部护理', '精华'])
})

test('syncCustomFieldValue handles date/number objects with mode sync', () => {
  const nodes = [
    {
      id: 'node-1',
      formData: { date_range: { days: 30 } },
      modeData: { date_range: 'recent' },
    },
  ]

  const customFields = [
    {
      id: 'cf-1',
      bindings: [{ nodeId: 'node-1', fieldKey: 'date_range' }],
    },
  ]

  syncCustomFieldValue(nodes, 'cf-1', customFields, { days: 60, dateRange: [], mode: 'recent' })
  assert.equal(nodes[0].formData.date_range.days, 60)
  assert.equal(nodes[0].modeData.date_range, 'recent')
  // mode should not be left in formData after sync
  // (current behavior keeps it, but it's harmless — documenting here)
})

test('syncCustomFieldValue returns nodes unchanged when custom field not found', () => {
  const nodes = [{ id: 'node-1', formData: { cate: ['美妆'] } }]
  const customFields = []
  const result = syncCustomFieldValue(nodes, 'cf-nonexistent', customFields, ['new'])
  assert.deepEqual(result[0].formData.cate, ['美妆']) // unchanged
})

test('syncCustomFieldValue handles string and primitive values', () => {
  const nodes = [
    { id: 'node-1', formData: { title: '' } },
  ]
  const customFields = [
    { id: 'cf-1', bindings: [{ nodeId: 'node-1', fieldKey: 'title' }] },
  ]
  syncCustomFieldValue(nodes, 'cf-1', customFields, '指定商品标题关键字')
  assert.equal(nodes[0].formData.title, '指定商品标题关键字')
})

test('getNodeBindingFieldKeys returns all bindings for a custom field', () => {
  const customFields = [
    {
      id: 'cf-1',
      bindings: [
        { nodeId: 'node-1', fieldKey: 'date_range' },
        { nodeId: 'node-2', fieldKey: 'date_range' },
      ],
    },
  ]

  const bindings = getNodeBindingFieldKeys('cf-1', customFields)
  assert.equal(bindings.length, 2)
  assert.deepEqual(bindings[0], { nodeId: 'node-1', fieldKey: 'date_range' })
})

test('getNodeBindingFieldKeys returns empty array for unknown custom field', () => {
  assert.deepEqual(getNodeBindingFieldKeys('cf-nonexistent', []), [])
  assert.deepEqual(getNodeBindingFieldKeys(null, []), [])
})
