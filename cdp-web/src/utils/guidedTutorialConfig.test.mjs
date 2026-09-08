import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATEGORY_ITEM_TUTORIAL_VALUES,
  CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
  CATEGORY_ITEM_TUTORIAL_STEPS,
  COMBINATION_BATCH_TUTORIAL_STEPS,
  DMP_BATCH_TUTORIAL_STEPS,
  DMP_BATCH_TUTORIAL_TAGS,
  GUIDED_TUTORIAL_STEPS,
  PULL_ANALYSIS_GROUP_TUTORIAL_STEPS,
  PULL_ANALYSIS_GROUP_TUTORIAL_VALUES,
  SOLUTION_REUSE_TUTORIAL_STEPS,
  SOLUTION_REUSE_TUTORIAL_VALUES,
} from './guidedTutorialConfig.js'

test('类目商品行为教程提供可直接复制的人群包名称示例', () => {
  assert.equal(CATEGORY_ITEM_TUTORIAL_VALUES.audienceName, '近30天购买指定7商品人群')
})

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

test('教程从干净圈包画布开始并以成功完成和拓展提示结束', () => {
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

test('自动化圈人最终确认会提醒用户登录数据引擎', () => {
  const confirmStep = CATEGORY_ITEM_TUTORIAL_STEPS.find((step) => step.id === 'final-confirm')
  assert.equal(confirmStep.warning.title, '请确保已登录数据引擎')
  assert.match(confirmStep.warning.body, /未登录.*自动化圈人失败/)
})

test('达摩盘教程使用约定的四个画像标签', () => {
  assert.deepEqual(DMP_BATCH_TUTORIAL_TAGS.map((tag) => tag.name), [
    '用户年龄',
    '用户性别',
    '城市等级',
    '大快消策略人群（新）',
  ])
})

test('达摩盘教程覆盖批量取数、横向对比、双重排序和复制', () => {
  const ids = DMP_BATCH_TUTORIAL_STEPS.map((step) => step.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids.slice(0, 3), ['open-task-center', 'select-dmp-tags', 'open-dmp-batch'])
  assert.ok(ids.includes('input-dmp-crowds'))
  assert.ok(ids.includes('wait-dmp-batch'))
  assert.ok(ids.includes('select-comparison-metrics'))
  assert.ok(ids.includes('inspect-comparison-table'))
  assert.ok(ids.includes('sort-label-order'))
  assert.ok(ids.includes('sort-audience-order'))
  assert.equal(ids.at(-1), 'dmp-tutorial-complete')
})

test('达摩盘等待步骤不锁页面且失败分支有明确引导', () => {
  const waitStep = DMP_BATCH_TUTORIAL_STEPS.find((step) => step.id === 'wait-dmp-batch')
  assert.equal(waitStep.nonBlocking, true)
  assert.match(waitStep.body, /不会被锁住/)
  assert.match(waitStep.hint, /失败项.*重试.*修改名单/)
})

test('达摩盘指标说明包含原始占比与标签内 Rebase 口径', () => {
  const metricStep = DMP_BATCH_TUTORIAL_STEPS.find((step) => step.id === 'select-comparison-metrics')
  assert.match(metricStep.body, /原始覆盖比例/)
  assert.match(metricStep.body, /同一标签内重新归一化/)
})

test('调整标签后明确提醒点击右下角应用排序', () => {
  const orderStep = DMP_BATCH_TUTORIAL_STEPS.find((step) => step.id === 'sort-label-order')
  assert.match(orderStep.body, /右下角的“应用排序”/)
  assert.match(orderStep.hint, /右下角“应用排序”/)
})

test('六个内置教程都注册到统一配置中', () => {
  assert.equal(Object.keys(GUIDED_TUTORIAL_STEPS).length, 6)
})

test('多竞品组合批量教程覆盖三行展开九包与全量执行', () => {
  const ids = COMBINATION_BATCH_TUTORIAL_STEPS.map(step => step.id)
  assert.deepEqual(ids, [
    'combo-open-group',
    'combo-confirm-group',
    'combo-open-field',
    'combo-open-excel',
    'combo-paste',
    'combo-create',
    'combo-start-automation',
    'combo-select-all',
    'combo-confirm-run',
    'combo-wait',
    'combo-complete',
  ])
  for (const step of COMBINATION_BATCH_TUTORIAL_STEPS.slice(0, 4)) {
    assert.ok(step.target, `${step.id} 应提供明确的高亮目标`)
    assert.notEqual(step.nonBlocking, true, `${step.id} 应限制用户按指引完成操作`)
  }
})

test('拉力分析方案组教程覆盖两个派生方案、字段聚合与批量执行', () => {
  const ids = PULL_ANALYSIS_GROUP_TUTORIAL_STEPS.map(step => step.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids[0], 'pull-open-picker-base')
  assert.ok(ids.includes('pull-duplicate-competitor-node'))
  assert.ok(ids.includes('pull-bind-own-analysis'))
  assert.ok(ids.includes('pull-unbind-own-node'))
  assert.ok(ids.includes('pull-bind-competitor-node'))
  assert.ok(ids.includes('pull-move-three-solutions'))
  assert.ok(ids.includes('pull-enter-group'))
  assert.ok(ids.includes('pull-inspect-group-packages'))
  assert.ok(ids.includes('pull-explain-aggregation-origin'))
  assert.ok(ids.includes('pull-run-baseline'))
  assert.ok(ids.includes('pull-wait-baseline'))
  assert.ok(ids.includes('pull-inspect-batch-sync'))
  assert.ok(ids.includes('pull-run-second'))
  assert.ok(ids.includes('pull-wait-second'))
  assert.ok(ids.indexOf('pull-wait-baseline') < ids.indexOf('pull-open-batch-analysis'))
  assert.ok(ids.indexOf('pull-save-batch-competitor') < ids.indexOf('pull-run-second'))
  assert.equal(ids.at(-1), 'pull-group-complete')
  assert.equal(PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.folderName, '拉力分析｜本品与竞品浏览转化')
  assert.equal(PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.baselineCrowdNames.length, 3)
  assert.equal(PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.finalCrowdNames.length, 3)
})

test('方案复用教程覆盖制作、一对多字段、发布和两次真实应用', () => {
  const ids = SOLUTION_REUSE_TUTORIAL_STEPS.map(step => step.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids[0], 'solution-clean-workbench')
  assert.ok(ids.includes('duplicate-own-node'))
  assert.ok(ids.includes('bind-analysis-first'))
  assert.ok(ids.includes('bind-analysis-second'))
  assert.ok(ids.includes('publish-tutorial-solution'))
  assert.ok(ids.includes('run-first-solution-automation'))
  assert.ok(ids.includes('run-second-solution-automation'))
  assert.equal(ids.at(-1), 'solution-tutorial-complete')
  assert.equal(SOLUTION_REUSE_TUTORIAL_VALUES.ownBrand, 'SK-II')
  assert.equal(SOLUTION_REUSE_TUTORIAL_VALUES.initialCompetitorBrand, 'Shiseido/资生堂')
  assert.equal(SOLUTION_REUSE_TUTORIAL_VALUES.secondCompetitorBrand, 'CPB/肌肤之钥')
})

test('方案教程首个组件只放行类目公域行为按钮', () => {
  const step = SOLUTION_REUSE_TUTORIAL_STEPS.find(item => item.id === 'add-public-behavior')
  assert.equal(step.target, '[data-tutorial-target="add-category-public"]')
  assert.equal(step.focusPadding, 0)
})

test('自定义字段绑定步骤明确要求点击字段空白处', () => {
  const bindingSteps = SOLUTION_REUSE_TUTORIAL_STEPS.filter(item => [
    'bind-analysis-first',
    'bind-analysis-second',
    'bind-own-brand',
    'bind-competitor-brand',
  ].includes(item.id))
  assert.equal(bindingSteps.length, 4)
  bindingSteps.forEach((step) => {
    assert.match(`${step.body}${step.hint}`, /空白处/)
    assert.match(step.warning?.body || '', /下拉框/)
  })
})

test('数据引擎人群圈包与数据引擎取数模板的跨页导航高亮只包住按钮本体', () => {
  const navigationSteps = SOLUTION_REUSE_TUTORIAL_STEPS.filter(item => [
    'open-solution-center',
    'open-workbench-after-publish',
  ].includes(item.id))
  assert.equal(navigationSteps.length, 2)
  navigationSteps.forEach((step) => {
    assert.match(step.target, />?\s*\.el-radio-button__inner$/)
    assert.equal(step.focusPadding, 1)
    assert.equal(step.focusRadius, 999)
  })
})

test('方案教程第四章突出一对多字段的核心提效价值', () => {
  const entryStep = SOLUTION_REUSE_TUTORIAL_STEPS.find(item => item.id === 'open-solution-picker')
  const fieldStep = SOLUTION_REUSE_TUTORIAL_STEPS.find(item => item.id === 'open-analysis-field')
  assert.match(entryStep.title, /业务提效/)
  assert.match(entryStep.body, /不需要重新搭建方案/)
  assert.match(fieldStep.title, /不用重新搭建方案/)
  assert.match(fieldStep.body, /只需要更换分析类目和竞争品牌两个业务参数/)
})
