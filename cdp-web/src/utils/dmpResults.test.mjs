import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DMP_RESULT_COLUMNS,
  defaultColumnVisibility,
  formatPercentageForDisplay,
  isConditionalTagReady,
  normalizeDmpSettings,
  normalizeResultRow,
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
