import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const CORE_PATH = path.resolve('chrome-extension/databank-automation/dmp-result-core.js')
const CORE_SOURCE = fs.readFileSync(CORE_PATH, 'utf8')
const context = { console }
context.globalThis = context
vm.runInNewContext(CORE_SOURCE, context, { filename: CORE_PATH })
const core = context.DmpResultCore

test('ready tag ids require non-empty condition arrays', () => {
  const ids = core.getReadyTagIds({
    200: [{ tagId: 200, option: 'A' }],
    201: [],
    202: null,
    203: { tagId: 203 },
  })

  assert.deepEqual(Array.from(ids), ['200'])
})

test('conditional requests use their own cached options and ordinary tags inherit none', () => {
  const payload = {
    url: 'https://dmp.taobao.com/api/tag/100?tagId=100',
    payload: { tagId: 100, multiGroupOptions: [{ tagId: 999 }] },
  }
  const cache = { 200: [{ tagId: 200, option: 'A' }] }

  const conditional = core.buildRequest(payload, '200', { tagId: '200', needCondition: true }, cache)
  const ordinary = core.buildRequest(payload, '201', { tagId: '201', needCondition: false }, cache)

  assert.equal(conditional.ok, true)
  assert.equal(conditional.url, 'https://dmp.taobao.com/api/tag/200?tagId=200')
  assert.deepEqual(JSON.parse(JSON.stringify(conditional.body.multiGroupOptions)), cache[200])
  assert.equal(conditional.body.tagId, 200)
  assert.equal(Object.hasOwn(ordinary.body, 'multiGroupOptions'), false)
  assert.equal(ordinary.body.tagId, 201)
})

test('conditional requests fail locally when the configured options are missing', () => {
  const result = core.buildRequest(
    { url: 'https://dmp.taobao.com/api/tag/100', payload: { tagId: 100 } },
    '200',
    { tagId: '200', needCondition: true },
    {},
  )

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: '未配置下钻条件' })
})

test('coverage and Rebase rows match the original plugin formulas and column order', () => {
  const rawRows = [
    {
      '所属大类': '用户特征', '标签类型': '人口属性', '标签名称': '年龄',
      '特征明细': '18-24', '人群占比': '20%', CTR: '120', PPC: '80', _dictTagId: '200',
    },
    {
      '所属大类': '用户特征', '标签类型': '人口属性', '标签名称': '年龄',
      '特征明细': '25-29', '人群占比': '30%', CTR: '110', PPC: '70', _dictTagId: '200',
    },
    {
      '所属大类': '私域特征', '标签类型': '会员', '标签名称': '会员状态',
      '特征明细': '会员', '人群占比': '25%', CTR: '-', PPC: '-', _dictTagId: '300',
    },
  ]

  const rows = core.finalizeRows(rawRows, 1000, ['300'])

  assert.deepEqual(Object.keys(rows[0]), Array.from(core.ALL_COLUMNS))
  assert.equal(rows[0]['覆盖人数'], '200')
  assert.equal(rows[0].Rebase, '40%')
  assert.equal(rows[0]['Rebase后人数'], '400')
  assert.equal(rows[1]['覆盖人数'], '300')
  assert.equal(rows[1].Rebase, '60%')
  assert.equal(rows[1]['Rebase后人数'], '600')
  assert.equal(rows[2]['覆盖人数'], '250')
  assert.equal(rows[2].Rebase, '25%')
  assert.equal(rows[2]['Rebase后人数'], '250')
})

test('zero coverage is displayed as a dash like the original plugin', () => {
  const rows = core.finalizeRows([
    {
      '所属大类': '用户特征', '标签类型': '人口属性', '标签名称': '年龄',
      '特征明细': '未知', '人群占比': '0%', CTR: '-', PPC: '-', _dictTagId: '200',
    },
  ], 1000, [])

  assert.equal(rows[0]['覆盖人数'], '-')
  assert.equal(rows[0].Rebase, '0%')
  assert.equal(rows[0]['Rebase后人数'], '0')
})
