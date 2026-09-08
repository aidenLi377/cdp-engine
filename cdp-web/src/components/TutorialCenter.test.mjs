import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GUIDED_TUTORIAL_STEPS } from '../utils/guidedTutorialConfig.js'
import { TUTORIAL_OPERATION_COMPARISONS } from '../utils/tutorialComparisons.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const centerVue = readFileSync(join(currentDir, 'TutorialCenter.vue'), 'utf8')
const appVue = readFileSync(join(currentDir, '..', 'App.vue'), 'utf8')
const guidedTutorial = readFileSync(join(currentDir, '..', 'composables', 'useGuidedTutorial.js'), 'utf8')
const catalog = readFileSync(join(currentDir, '..', 'utils', 'tutorialCatalog.js'), 'utf8')
const celebrationVue = readFileSync(join(currentDir, 'TutorialCelebration.vue'), 'utf8')

test('new tutorial center is a first-class account entry outside announcements', () => {
  assert.match(appVue, /class="app-tutorial-link"/)
  assert.match(appVue, /appMode === 'tutorials'/)
  assert.match(appVue, /import\('\.\/components\/TutorialCenter\.vue'\)/)
  assert.match(centerVue, /LEARNING CENTER/)
  assert.match(centerVue, /做完一次，带走能继续使用的成果/)
})

test('tutorial center shows check-ins, mastered methods and business outcomes', () => {
  assert.match(centerVue, /完成打卡/)
  assert.match(centerVue, /你已经掌握的能力/)
  assert.match(centerVue, /可解决/)
  assert.match(centerVue, /businessProblem/)
  assert.match(centerVue, /完成最后一步后自动记入当前账号/)
})

test('tutorial overview keeps the progress summary compact so courses enter the first viewport', () => {
  assert.match(centerVue, /\.tutorial-hero \{[^}]*min-height: 0;[^}]*padding: 24px 32px;[^}]*grid-template-columns: minmax\(0, 1fr\) 132px;/s)
  assert.match(centerVue, /\.tutorial-hero__progress \{[^}]*width: 116px;[^}]*height: 116px;/s)
  assert.match(centerVue, /\.tutorial-summary-grid article \{[^}]*min-height: 58px;[^}]*padding: 11px 15px;/s)
  assert.match(centerVue, /\.tutorial-section \{[^}]*margin: 30px auto 0;/s)
  assert.match(centerVue, /@media \(max-width: 900px\)[\s\S]*?\.tutorial-hero \{[^}]*grid-template-columns: minmax\(0, 1fr\) 104px;/s)
  assert.doesNotMatch(centerVue, /@media \(max-width: 900px\)[\s\S]{0,300}?\.tutorial-summary-grid,[\s\S]{0,120}?grid-template-columns: 1fr;/s)
})

test('single-parameter batch creation is a compact formal skill instead of a clipped extra lesson', () => {
  assert.match(centerVue, /先掌握三种高频业务提效方法/)
  assert.match(centerVue, /\.tutorial-quick-grid \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s)
  assert.match(centerVue, /padding: 22px clamp\(24px, 5vw, 76px\) max\(96px,/)
  assert.doesNotMatch(centerVue, /EXTRA · 番外篇|开始番外篇|class="tutorial-extra"/)
  assert.match(catalog, /只改一个参数，批量创建多个人群包/)
  assert.match(catalog, /track: 'quick'/)
})

test('pull analysis is presented as one four-lesson course ending in multi-competitor batch output', () => {
  assert.match(centerVue, /大促拉力分析提效/)
  assert.match(centerVue, /创建共同浏览方案/)
  assert.match(centerVue, /创建购买本品与购买竞品/)
  assert.match(centerVue, /三方案组合批量圈人/)
  assert.match(centerVue, /三个竞品，一次准备九个包/)
  assert.match(centerVue, /两轮共 6 个包，再扩展三个竞品的 9 个包/)
  assert.match(catalog, /\[PULL_ANALYSIS_GROUP_TUTORIAL_ID\]: 2/)
  assert.match(catalog, /\[COMBINATION_BATCH_TUTORIAL_ID\]: 1/)
})

test('pull analysis lessons enforce sequential prerequisites in the overview and direct entry path', () => {
  assert.match(catalog, /TUTORIAL_PREREQUISITES/)
  assert.match(catalog, /\[PULL_ANALYSIS_GROUP_TUTORIAL_ID\]: Object\.freeze\(\[SOLUTION_REUSE_TUTORIAL_ID\]\)/)
  assert.match(catalog, /\[COMBINATION_BATCH_TUTORIAL_ID\]: Object\.freeze\(\[PULL_ANALYSIS_GROUP_TUTORIAL_ID\]\)/)
  assert.match(centerVue, /:disabled="!isUnlocked\(PULL_ANALYSIS_GROUP_TUTORIAL_ID\)"/)
  assert.match(centerVue, /:disabled="!isUnlocked\(COMBINATION_BATCH_TUTORIAL_ID\)"/)
  assert.match(centerVue, /完成第 1 课后解锁/)
  assert.match(centerVue, /完成第 2 课后解锁/)
  assert.match(centerVue, /完成第 3 课后解锁/)
  assert.match(centerVue, /v-if="!isCompleted\(PULL_ANALYSIS_GROUP_TUTORIAL_ID\)"[\s\S]*?disabled[\s\S]*?待解锁/)
  assert.match(centerVue, /if \(!detailComponents\[id\] \|\| !isUnlocked\(id\)\) return/)
})

test('tutorial center has a dedicated all-complete celebration page', () => {
  assert.match(centerVue, /TutorialCelebration/)
  assert.match(centerVue, /celebrationToken/)
  assert.match(centerVue, /celebrationVisible\.value = true/)
  assert.match(celebrationVue, /7 个提效点全部完成/)
  assert.match(celebrationVue, /你已经跑通 X-Data 的核心提效方法/)
  assert.match(celebrationVue, /回看教程/)
  assert.match(celebrationVue, /带着成果返回工作区/)
  assert.match(celebrationVue, /prefers-reduced-motion: reduce/)
})

test('finishing a guided tutorial records server-backed progress', () => {
  assert.match(guidedTutorial, /recordTutorialCompletion\(completedTaskId\)/)
  assert.doesNotMatch(guidedTutorial, /guided-tutorial\.completed/)
})

test('every guided tutorial explains the same business task in manual and X-Data terms', () => {
  const tutorialIds = Object.keys(GUIDED_TUTORIAL_STEPS)
  assert.deepEqual(Object.keys(TUTORIAL_OPERATION_COMPARISONS).sort(), tutorialIds.sort())
  for (const tutorialId of tutorialIds) {
    const comparison = TUTORIAL_OPERATION_COMPARISONS[tutorialId]
    assert.ok(comparison.task)
    assert.equal(comparison.manual.length, 2)
    assert.equal(comparison.product.length, 2)
    assert.ok(comparison.value)
  }
  assert.match(centerVue, /TutorialOperationComparison/)
})
