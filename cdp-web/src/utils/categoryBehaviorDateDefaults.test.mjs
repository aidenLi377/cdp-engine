import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyCategoryBehaviorDateDefault,
  getCategoryBehaviorDateMeta,
  initializeCategoryBehaviorDateState,
  markCategoryBehaviorDateManual,
  resolveCategoryBehaviorRecentDays,
} from './categoryBehaviorDateDefaults.js'

function categoryNode(behaviors, days = 30) {
  return {
    packageType: '类目公域行为',
    schema: [{ key: 'time', Widget_Type: '日期_切换' }],
    formData: { bhv: behaviors, time: { days, dateRange: [] } },
    modeData: { time: 'recent' },
  }
}

test('category behavior defaults match the requested recent-day mapping', () => {
  assert.equal(resolveCategoryBehaviorRecentDays(['购买']), 366)
  assert.equal(resolveCategoryBehaviorRecentDays(['预售']), 180)
  assert.equal(resolveCategoryBehaviorRecentDays(['浏览']), 30)
  assert.equal(resolveCategoryBehaviorRecentDays(['收藏']), 90)
  assert.equal(resolveCategoryBehaviorRecentDays(['加购']), 90)
  assert.equal(resolveCategoryBehaviorRecentDays(['评论']), 366)
})

test('multiple behaviors use the shortest recent period', () => {
  assert.equal(resolveCategoryBehaviorRecentDays(['购买', '浏览', '收藏']), 30)
})

test('automatic defaults follow behavior changes until the user edits the date', () => {
  const node = categoryNode(['购买'])
  initializeCategoryBehaviorDateState(node)
  assert.equal(applyCategoryBehaviorDateDefault(node), true)
  assert.equal(node.formData.time.days, 366)

  node.formData.bhv = ['购买', '收藏']
  assert.equal(applyCategoryBehaviorDateDefault(node), true)
  assert.equal(node.formData.time.days, 90)

  markCategoryBehaviorDateManual(node)
  node.formData.time.days = 45
  node.formData.bhv = ['浏览']
  assert.equal(applyCategoryBehaviorDateDefault(node), false)
  assert.equal(node.formData.time.days, 45)
  assert.match(getCategoryBehaviorDateMeta(node).text, /不会覆盖/)
})

test('existing solutions preserve saved dates until the user restores the behavior default', () => {
  const node = categoryNode(['购买'], 60)
  initializeCategoryBehaviorDateState(node, { preserveExisting: true })
  assert.equal(applyCategoryBehaviorDateDefault(node), false)
  assert.equal(node.formData.time.days, 60)
  assert.equal(getCategoryBehaviorDateMeta(node).text, '已保留方案原时间')

  assert.equal(applyCategoryBehaviorDateDefault(node, { force: true }), true)
  assert.equal(node.formData.time.days, 366)
  assert.equal(getCategoryBehaviorDateMeta(node).manual, false)
})
