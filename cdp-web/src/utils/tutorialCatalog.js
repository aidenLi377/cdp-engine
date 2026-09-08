import {
  CATEGORY_ITEM_TUTORIAL_ID,
  COMBINATION_BATCH_TUTORIAL_ID,
  DMP_BATCH_TUTORIAL_ID,
  PARAMETER_BATCH_TUTORIAL_ID,
  PULL_ANALYSIS_GROUP_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_ID,
} from './guidedTutorialConfig.js'

export const TUTORIAL_MILESTONE_TOTAL = 7

export const TUTORIAL_MILESTONE_WEIGHTS = Object.freeze({
  [COMBINATION_BATCH_TUTORIAL_ID]: 1,
  [CATEGORY_ITEM_TUTORIAL_ID]: 1,
  [DMP_BATCH_TUTORIAL_ID]: 1,
  [SOLUTION_REUSE_TUTORIAL_ID]: 1,
  [PULL_ANALYSIS_GROUP_TUTORIAL_ID]: 2,
  [PARAMETER_BATCH_TUTORIAL_ID]: 1,
})

export const TUTORIAL_PREREQUISITES = Object.freeze({
  [PULL_ANALYSIS_GROUP_TUTORIAL_ID]: Object.freeze([SOLUTION_REUSE_TUTORIAL_ID]),
  [COMBINATION_BATCH_TUTORIAL_ID]: Object.freeze([PULL_ANALYSIS_GROUP_TUTORIAL_ID]),
})

export const TUTORIAL_CATALOG = Object.freeze([
  Object.freeze({
    id: DMP_BATCH_TUTORIAL_ID,
    sequence: '01',
    track: 'quick',
    title: '达摩盘批量取画像与横向对比',
    shortTitle: '批量取画像',
    duration: '约 1–2 分钟',
    result: '批量采集多个人群包画像，并形成可直接复制的对比表',
    capability: '批量取数 · 指标选择 · 横向对比',
    businessProblem: '大促复盘时，一次比较多个人群包的结构差异',
  }),
  Object.freeze({
    id: CATEGORY_ITEM_TUTORIAL_ID,
    sequence: '02',
    track: 'quick',
    title: '7 个商品 ID 自动拆分',
    shortTitle: '商品 ID 拆分',
    duration: '约 5 分钟',
    result: '完成 1 个人群，并理解一列 ID 如何自动拆成多个条件',
    capability: 'Excel 批量粘贴 · 条件自动拆分',
    businessProblem: '临时拿到一批商品 ID 时，不再逐条建立行为条件',
  }),
  Object.freeze({
    id: PARAMETER_BATCH_TUTORIAL_ID,
    sequence: '03',
    track: 'quick',
    title: '只改一个参数，批量创建多个人群包',
    shortTitle: '单方案参数批量建包',
    duration: '批量操作约 2 分钟，方案准备另计',
    result: '沉淀 1 个可复用方案，并用 4 个品牌生成 4 个独立人群包',
    capability: '单参数批量替换 · Excel 按行建包 · 全量自动化圈人',
    businessProblem: '需要为多个竞争品牌分别圈包时，只替换品牌参数，一行一个品牌批量生成人群包',
  }),
  Object.freeze({
    id: SOLUTION_REUSE_TUTORIAL_ID,
    sequence: '04',
    track: 'pull',
    lesson: 1,
    title: '创建「共同浏览」基础方案',
    shortTitle: '共同浏览',
    duration: '约 8–12 分钟',
    result: '创建并发布带一对多自定义字段的共同浏览方案',
    capability: '方案制作 · 一对多字段 · 两次应用验证',
    businessProblem: '沉淀一套可反复替换类目与竞品的拉力分析底稿',
  }),
  Object.freeze({
    id: PULL_ANALYSIS_GROUP_TUTORIAL_ID,
    sequence: '05',
    track: 'pull',
    lesson: 2,
    lessonEnd: 3,
    title: '扩展购买方案并组合批量圈人',
    shortTitle: '购买方案与组合应用',
    duration: '约 9–12 分钟',
    result: '新增 2 个方案、组成 1 个方案组，并完成两轮共 6 次圈人',
    capability: '方案派生 · 同名字段聚合 · 组合批量圈人',
    businessProblem: '大促前只改少量参数，一次生成浏览与购买链路的三个人群包',
  }),
  Object.freeze({
    id: COMBINATION_BATCH_TUTORIAL_ID, sequence: '06', track: 'pull', lesson: 4,
    title: '多个竞品，一次完成多组拉力圈人', shortTitle: '多竞品组合批量',
    duration: '操作约 2 分钟，平台执行时间另计',
    result: '复用已有三方案，三行竞品生成并完成九个人群包',
    capability: '组合参数批量展开 · 按竞品分组 · 全量执行',
    businessProblem: '需要比较多个竞品时，复用整套拉力方案，一次粘贴名单准备多组人群',
  }),
])

export function normalizeTutorialProgress(items) {
  if (!Array.isArray(items)) return []
  return items.filter((item) => item && typeof item.tutorialId === 'string')
}

export function completedTutorialIds(items) {
  return new Set(normalizeTutorialProgress(items)
    .filter((item) => typeof item.completedAt === 'string' && Number.isFinite(Date.parse(item.completedAt)))
    .map((item) => item.tutorialId))
}

export function countCompletedMilestones(items) {
  const ids = completedTutorialIds(items)
  return Object.entries(TUTORIAL_MILESTONE_WEIGHTS).reduce(
    (total, [id, weight]) => total + (ids.has(id) ? weight : 0),
    0,
  )
}

export function nextTutorialId(items) {
  const ids = completedTutorialIds(items)
  return TUTORIAL_CATALOG.find((item) => !ids.has(item.id))?.id || ''
}

export function isTutorialUnlocked(tutorialId, items) {
  const ids = completedTutorialIds(items)
  if (ids.has(tutorialId)) return true
  return (TUTORIAL_PREREQUISITES[tutorialId] || []).every((id) => ids.has(id))
}

export function becameAllTutorialsComplete(previousItems, nextItems) {
  return countCompletedMilestones(previousItems) < TUTORIAL_MILESTONE_TOTAL
    && countCompletedMilestones(nextItems) >= TUTORIAL_MILESTONE_TOTAL
}
