import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DMP_RESULT_COLUMNS,
  defaultColumnVisibility,
  formatPercentageForDisplay,
  isConditionalTagReady,
  normalizeDmpSettings,
  normalizeResultRow,
  orderResultRowsByDictionary,
  orderTagIdsByDictionary,
  visibleResultColumns,
} from './dmpResults.js'

test('percentage display uses two decimal places without changing non-percentage values', () => {
  assert.equal(formatPercentageForDisplay('12.3456%'), '12.35%')
  assert.equal(formatPercentageForDisplay('40%'), '40.00%')
  assert.equal(formatPercentageForDisplay('0%'), '0.00%')
  assert.equal(formatPercentageForDisplay('-'), '-')
})

test('old TGI field names normalize to CTR and PPC without mutating history', () => {
  const source = { 标签名称: '年龄', 点击TGI: '120', 转化TGI: '80' }

  const normalized = normalizeResultRow(source)

  assert.equal(normalized.CTR, '120')
  assert.equal(normalized.PPC, '80')
  assert.equal(source.CTR, undefined)
  assert.equal(source.PPC, undefined)
})

test('conditional tags are ready only when the extension reports their tag id', () => {
  assert.equal(isConditionalTagReady({ tagId: '200', needCondition: true }, ['200']), true)
  assert.equal(isConditionalTagReady({ tagId: '201', needCondition: true }, ['200']), false)
  assert.equal(isConditionalTagReady({ tagId: '202', needCondition: false }, []), true)
})

test('DMP settings fill missing columns and normalize ids', () => {
  const settings = normalizeDmpSettings({
    readyTagIds: [200],
    columnVisibility: { CTR: false },
    rebaseExcludedTagIds: [300, '300'],
  })

  assert.deepEqual(settings.readyTagIds, ['200'])
  assert.equal(settings.columnVisibility.CTR, false)
  assert.equal(settings.columnVisibility.PPC, true)
  assert.deepEqual(settings.rebaseExcludedTagIds, ['300'])
})

test('visible result columns follow the original ten-column order', () => {
  const visibility = defaultColumnVisibility()
  visibility['标签类型'] = false
  visibility.PPC = false

  assert.deepEqual(
    visibleResultColumns([{ 所属大类: '用户特征', CTR: '120', PPC: '80' }], visibility),
    DMP_RESULT_COLUMNS.filter((column) => !['标签类型', 'PPC'].includes(column)),
  )
})

test('selected tag ids follow dictionary order instead of checkbox click order', () => {
  const dictionary = [
    { tagId: '100', tagName: '城市' },
    { tagId: '200', tagName: '年龄' },
    { tagId: '300', tagName: '性别' },
  ]

  assert.deepEqual(
    orderTagIdsByDictionary(['300', '100', '200'], dictionary),
    ['100', '200', '300'],
  )
})

test('result rows follow dictionary tag order and preserve row order within each tag', () => {
  const dictionary = [
    { tagId: '100', tagName: '城市' },
    { tagId: '200', tagName: '年龄' },
  ]
  const rows = [
    { 标签名称: '年龄', 特征明细: '25-29岁' },
    { 标签名称: '城市', 特征明细: '上海' },
    { 标签名称: '年龄', 特征明细: '30-34岁' },
    { 标签名称: '未知标签', 特征明细: '保留在末尾' },
  ]

  assert.deepEqual(
    orderResultRowsByDictionary(rows, dictionary).map((row) => row.特征明细),
    ['上海', '25-29岁', '30-34岁', '保留在末尾'],
  )
  assert.equal(rows[0].特征明细, '25-29岁')
})
