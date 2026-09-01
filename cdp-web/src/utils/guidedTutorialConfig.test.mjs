import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
  CATEGORY_ITEM_TUTORIAL_STEPS,
} from './guidedTutorialConfig.js'

test('类目商品行为教程保留原稿中的七个商品 ID', () => {
  assert.deepEqual(CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS, [
    '566446518116',
    '620909794925',
    '537574170700',
    '540211731451',
    '634025846178',
    '577875075059',
    '1055622646901',
  ])
})

test('每个教程步骤都有独立引导语且步骤 ID 不重复', () => {
  const ids = CATEGORY_ITEM_TUTORIAL_STEPS.map((step) => step.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const step of CATEGORY_ITEM_TUTORIAL_STEPS) {
    assert.ok(step.title.trim())
    assert.ok(step.body.trim())
    assert.ok(step.hint.trim())
  }
})

test('教程从干净工作台开始并以成功完成和拓展提示结束', () => {
  assert.equal(CATEGORY_ITEM_TUTORIAL_STEPS[0].id, 'clean-workbench')
  assert.equal(CATEGORY_ITEM_TUTORIAL_STEPS.at(-1).id, 'tutorial-complete')
  assert.match(CATEGORY_ITEM_TUTORIAL_STEPS.at(-1).hint, /关键词、类目、品牌/)
})

test('行为和时间允许自由选择，同时保留推荐值', () => {
  const ids = CATEGORY_ITEM_TUTORIAL_STEPS.map((step) => step.id)
  const behaviorStep = CATEGORY_ITEM_TUTORIAL_STEPS.find((step) => step.id === 'select-behavior')
  const timeStep = CATEGORY_ITEM_TUTORIAL_STEPS.find((step) => step.id === 'set-time')

  assert.ok(ids.includes('select-behavior'))
  assert.ok(!ids.includes('select-purchase'))
  assert.match(behaviorStep.body, /任选/)
  assert.match(behaviorStep.body, /推荐“购买”/)
  assert.match(timeStep.body, /固定日期.*都可以/)
  assert.match(timeStep.body, /推荐近 30 天/)
})

test('添加七项按钮使用紧贴控件的高亮边距', () => {
  const addStep = CATEGORY_ITEM_TUTORIAL_STEPS.find((step) => step.id === 'add-product-ids')
  assert.equal(addStep.focusPadding, 0)
  assert.equal(addStep.focusRadius, 7)
})

test('批量输入步骤明确说明 Excel 一列和本次七个示例 ID', () => {
  const pasteStep = CATEGORY_ITEM_TUTORIAL_STEPS.find((step) => step.id === 'paste-ids')
  assert.match(pasteStep.body, /Excel.*一整列商品 ID/)
  assert.match(pasteStep.body, /示例中的 7 个商品 ID/)
  assert.match(pasteStep.hint, /自己的 Excel 一列/)
})
