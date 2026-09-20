import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getDependentMultiDisplay,
  getDependentOptions,
  getDateDefaultDays,
  getFieldUiLabel,
  getNumericMinimum,
  getNumericPrecision,
  getNumericSummaryPrefix,
  getSingleChoiceDefault,
  getSingleChoiceOptions,
  usesPlainRadios,
} from './fieldUiConfig.js'

test('dependent multi-select options and display follow the selected behavior', () => {
  const field = {
    options: ['货品运营', '超级直播'],
    optionsByValue: {
      曝光: ['货品运营'],
      观看: ['超级直播', '超级短视频', '短直联动'],
    },
    uiConfig: {
      optionSourceKey: 'bhv',
      displayByValue: { 曝光: 'select', 观看: 'checkbox' },
    },
  }

  assert.deepEqual(getDependentOptions(field, { formData: { bhv: '曝光' } }), ['货品运营'])
  assert.deepEqual(getDependentOptions(field, { formData: { bhv: '' } }), [])
  assert.equal(getDependentMultiDisplay(field, { formData: { bhv: '曝光' } }), 'select')
  assert.deepEqual(
    getDependentOptions(field, { formData: { bhv: '观看' } }),
    ['超级直播', '超级短视频', '短直联动'],
  )
  assert.equal(getDependentMultiDisplay(field, { formData: { bhv: '观看' } }), 'checkbox')
})

test('single choice options and defaults come from live field metadata', () => {
  const field = {
    key: 'account',
    options: ['以下全部投放账号', 'dior迪奥官方旗舰店'],
    uiConfig: {
      display: 'radio',
      defaultValue: 'dior迪奥官方旗舰店',
    },
  }

  assert.deepEqual(getSingleChoiceOptions(field), [
    { value: '以下全部投放账号', label: '以下全部投放账号' },
    { value: 'dior迪奥官方旗舰店', label: 'dior迪奥官方旗舰店' },
  ])
  assert.equal(getSingleChoiceDefault(field), 'dior迪奥官方旗舰店')
  assert.equal(usesPlainRadios(field), true)
})

test('legacy title switch remains backward compatible without configured options', () => {
  const field = { key: 'title_type', Widget_Type: '单选组' }

  assert.equal(getSingleChoiceDefault(field), '任意商品标题关键字')
  assert.equal(getSingleChoiceOptions(field).length, 2)
})

test('an explicit empty single-choice default keeps radio groups unselected', () => {
  const field = {
    key: 'bhv',
    options: ['曝光', '点击', '观看'],
    uiConfig: { defaultValue: null },
  }

  assert.equal(getSingleChoiceDefault(field), '')
})

test('numeric and copy settings use metadata with safe fallbacks', () => {
  const field = {
    uiConfig: {
      minimum: 1,
      precision: 0,
      minModeLabel: '大于',
      minSummaryPrefix: '>',
    },
  }

  assert.equal(getNumericMinimum(field), 1)
  assert.equal(getNumericPrecision(field), 0)
  assert.equal(getFieldUiLabel(field, 'minModeLabel', '至少'), '大于')
  assert.equal(getNumericSummaryPrefix(field), '>')
  assert.equal(getNumericSummaryPrefix({}), '≥')
  assert.equal(getDateDefaultDays({ uiConfig: { defaultDays: 180 } }), 180)
  assert.equal(getDateDefaultDays({ uiConfig: { defaultDays: 999 } }), 30)
})
