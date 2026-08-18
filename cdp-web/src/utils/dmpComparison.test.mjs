import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDefaultLabelOrder,
  buildDmpComparisonMatrix,
  buildLabelStructureFingerprint,
  compareTagNameStructures,
  comparisonExportGrid,
  comparisonToCsv,
  comparisonToTsv,
  reconcileLabelOrder,
} from './dmpComparison.js'

test('comparison requires the same label-name frequency regardless of row order', () => {
  const base = [
    { 标签名称: '城市等级', 特征明细: '一线城市' },
    { 标签名称: '城市等级', 特征明细: '二线城市' },
    { 标签名称: '人生阶段', 特征明细: '有车' },
  ]
  const reordered = [
    { 标签名称: '人生阶段', 特征明细: '新晋父母' },
    { 标签名称: '城市等级', 特征明细: '三线城市' },
    { 标签名称: '城市等级', 特征明细: '一线城市' },
  ]

  assert.equal(compareTagNameStructures(base, reordered).compatible, true)
})

test('comparison rejects different label names even when total counts match', () => {
  const result = compareTagNameStructures(
    [{ 标签名称: '城市等级' }, { 标签名称: '人生阶段' }],
    [{ 标签名称: '城市等级' }, { 标签名称: '用户性别' }],
  )

  assert.equal(result.compatible, false)
  assert.deepEqual(result.differences, [
    { labelName: '人生阶段', baseCount: 1, candidateCount: 0 },
    { labelName: '用户性别', baseCount: 0, candidateCount: 1 },
  ])
})

test('comparison rejects a different occurrence count for the same label', () => {
  const result = compareTagNameStructures(
    [{ 标签名称: '城市等级' }, { 标签名称: '城市等级' }],
    [{ 标签名称: '城市等级' }],
  )

  assert.equal(result.compatible, false)
  assert.deepEqual(result.differences, [
    { labelName: '城市等级', baseCount: 2, candidateCount: 1 },
  ])
})

test('comparison rejects empty label names', () => {
  const result = compareTagNameStructures(
    [{ 标签名称: '城市等级' }],
    [{ 标签名称: '  ' }],
  )

  assert.equal(result.compatible, false)
  assert.match(result.reason, /标签名称为空/)
})

test('matrix fixes the first two columns and creates one package column per selected metric', () => {
  const matrix = buildDmpComparisonMatrix([
    {
      id: 'task-a',
      crowdName: '人群包 A',
      results: [{ 标签名称: '城市等级', 特征明细: '一线城市', 覆盖人数: 100, CTR: 12 }],
    },
    {
      id: 'task-b',
      crowdName: '人群包 B',
      results: [{ 标签名称: '城市等级', 特征明细: '一线城市', 覆盖人数: 200, CTR: 15 }],
    },
  ], ['覆盖人数'])
  const grid = comparisonExportGrid(matrix)

  assert.deepEqual(grid.headers, ['标签名称', '特征明细', '人群包 A｜覆盖人数', '人群包 B｜覆盖人数'])
  assert.deepEqual(grid.rows[0], ['城市等级', '一线城市', 100, 200])
  assert.doesNotMatch(comparisonToTsv(matrix), /所属大类|标签类型/)
})

test('matrix uses grouped package metrics and preserves missing features as dashes', () => {
  const matrix = buildDmpComparisonMatrix([
    {
      id: 'task-a',
      name: '人群包 A',
      results: [
        { 标签名称: '城市等级', 特征明细: '一线城市', 覆盖人数: 100, CTR: 12 },
        { 标签名称: '城市等级', 特征明细: '二线城市', 覆盖人数: 120, CTR: 13 },
      ],
    },
    {
      id: 'task-b',
      name: '人群包 B',
      results: [
        { 标签名称: '城市等级', 特征明细: '一线城市', 覆盖人数: 200, CTR: 15 },
        { 标签名称: '城市等级', 特征明细: '三线城市', 覆盖人数: 180, CTR: 14 },
      ],
    },
  ], ['覆盖人数', 'CTR'])
  const grid = comparisonExportGrid(matrix)

  assert.deepEqual(grid.headers, [
    '标签名称',
    '特征明细',
    '人群包 A｜覆盖人数',
    '人群包 A｜CTR',
    '人群包 B｜覆盖人数',
    '人群包 B｜CTR',
  ])
  assert.deepEqual(grid.rows[1], ['城市等级', '二线城市', 120, 13, '—', '—'])
  assert.match(comparisonToCsv(matrix), /"人群包 B｜CTR"/)
})

test('spreadsheet exports preserve the required first columns and escape CSV values', () => {
  const matrix = buildDmpComparisonMatrix([
    {
      id: 'task-a',
      name: '人群包, A',
      results: [{ 标签名称: '兴趣"偏好', 特征明细: '护肤\t美妆', 覆盖人数: 88 }],
    },
  ], ['覆盖人数'])

  assert.match(comparisonToTsv(matrix), /^标签名称\t特征明细\t人群包, A｜覆盖人数/m)
  assert.match(comparisonToCsv(matrix), /^"标签名称","特征明细","人群包, A｜覆盖人数"/m)
  assert.match(comparisonToCsv(matrix), /"兴趣""偏好"/)
})

test('label order follows first occurrence and reconciles stale persisted values', () => {
  const rows = [
    { 标签名称: '用户性别' },
    { 标签名称: '城市等级' },
    { 标签名称: '用户性别' },
    { 标签名称: '人生阶段' },
  ]

  assert.deepEqual(buildDefaultLabelOrder(rows), ['用户性别', '城市等级', '人生阶段'])
  assert.deepEqual(
    reconcileLabelOrder(['城市等级', '不存在', '城市等级'], rows),
    ['城市等级', '用户性别', '人生阶段'],
  )
})

test('label structure fingerprint ignores row order but keeps label counts', () => {
  const left = [{ 标签名称: '城市等级' }, { 标签名称: '用户性别' }, { 标签名称: '城市等级' }]
  const reordered = [{ 标签名称: '城市等级' }, { 标签名称: '城市等级' }, { 标签名称: '用户性别' }]
  const changed = [{ 标签名称: '城市等级' }, { 标签名称: '用户性别' }]

  assert.equal(buildLabelStructureFingerprint(left), buildLabelStructureFingerprint(reordered))
  assert.notEqual(buildLabelStructureFingerprint(left), buildLabelStructureFingerprint(changed))
})

test('custom label order moves whole label groups and drives spreadsheet export order', () => {
  const matrix = buildDmpComparisonMatrix([
    {
      id: 'task-a',
      name: '人群包 A',
      results: [
        { 标签名称: '用户性别', 特征明细: '女性用户', 覆盖人数: 100 },
        { 标签名称: '城市等级', 特征明细: '一线城市', 覆盖人数: 200 },
        { 标签名称: '用户性别', 特征明细: '男性用户', 覆盖人数: 120 },
        { 标签名称: '城市等级', 特征明细: '二线城市', 覆盖人数: 180 },
      ],
    },
  ], ['覆盖人数'], ['城市等级', '用户性别'])

  assert.deepEqual(matrix.labelOrder, ['城市等级', '用户性别'])
  assert.deepEqual(matrix.rows.map((row) => `${row.labelName}:${row.featureDetail}`), [
    '城市等级:一线城市',
    '城市等级:二线城市',
    '用户性别:女性用户',
    '用户性别:男性用户',
  ])
  assert.match(comparisonToTsv(matrix), /^标签名称[\s\S]*\n城市等级\t一线城市/)
})
