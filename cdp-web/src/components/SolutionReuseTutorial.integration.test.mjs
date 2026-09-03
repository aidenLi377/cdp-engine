import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const srcDir = dirname(currentDir)
const appVue = readFileSync(join(srcDir, 'App.vue'), 'utf8')
const announcementVue = readFileSync(join(currentDir, 'AnnouncementCenter.vue'), 'utf8')
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const solutionCenterVue = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const dynamicFormVue = readFileSync(join(currentDir, 'DynamicForm.vue'), 'utf8')
const customFieldDialogVue = readFileSync(join(currentDir, 'CustomFieldEditDialog.vue'), 'utf8')
const overlayVue = readFileSync(join(currentDir, 'GuidedTutorialOverlay.vue'), 'utf8')

test('方案复用教程从公告入口跨越数据引擎人群圈包和数据引擎取数模板', () => {
  assert.match(announcementVue, /SOLUTION_REUSE_TUTORIAL_ID/)
  assert.match(announcementVue, /方案制作 · 共同浏览本品与竞品/)
  assert.match(appVue, /data-tutorial-target="open-solution-center"/)
  assert.match(appVue, /data-tutorial-target="open-workbench"/)
  assert.match(appVue, /completeGuidedTutorialStep\('open-solution-center'\)/)
  assert.match(appVue, /completeGuidedTutorialStep\('open-workbench-after-publish'\)/)
})

test('数据引擎人群圈包只在真实草稿和真实自动化成功后推进方案教程', () => {
  assert.match(normalModeVue, /workbenchDraftId: String\(created\?\.id \|\| ''\)/)
  assert.match(normalModeVue, /isTutorialPublishedSolution\(detail\)/)
  assert.match(normalModeVue, /getSolutionTutorialSnapshot\(run\)/)
  assert.match(normalModeVue, /derivedSolutionMeta\.hasStructureChanges === false/)
  assert.match(normalModeVue, /firstAutomationSnapshot: snapshot/)
  assert.match(normalModeVue, /first\.solutionId === snapshot\.solutionId/)
  assert.match(normalModeVue, /first\.crowdName !== snapshot\.crowdName/)
  assert.match(normalModeVue, /cdp:tutorial-confirm-solution-automation/)
})

test('一对多字段会校验字段名称、节点和原始字段', () => {
  assert.match(solutionCenterVue, /tutorialCustomFieldIsValid/)
  assert.match(solutionCenterVue, /bindings\.length === 2/)
  assert.match(solutionCenterVue, /tutorialBindingMatches\(binding, 0, 'leafCates'\)/)
  assert.match(solutionCenterVue, /tutorialBindingMatches\(binding, 1, 'leafCates'\)/)
  assert.match(solutionCenterVue, /tutorialBindingMatches\(bindings\[0\], 0, 'stdBrand'\)/)
  assert.match(solutionCenterVue, /tutorialBindingMatches\(bindings\[0\], 1, 'stdBrand'\)/)
  assert.match(solutionCenterVue, /tutorialCustomFieldsReady\(\)/)
  assert.match(solutionCenterVue, /completeGuidedTutorialStep\('confirm-publish-tutorial-solution'\)/)
})

test('教程高亮覆盖配置字段、字段编辑和误触恢复', () => {
  assert.match(dynamicFormVue, /solution-node-\$\{props\.nodeIndex\}-\$\{field\.key\}/)
  assert.match(dynamicFormVue, /solution-\$\{role\}-\$\{field\.key\}/)
  assert.match(customFieldDialogVue, /edit-analysis-value/)
  assert.match(customFieldDialogVue, /edit-competitor-value/)
  assert.match(customFieldDialogVue, /save-custom-field-value/)
  assert.match(overlayVue, /'change-analysis-category': 'open-analysis-field'/)
  assert.match(overlayVue, /'save-analysis-category': 'open-analysis-field'/)
  assert.match(overlayVue, /'change-competitor-brand': 'open-competitor-field'/)
  assert.match(overlayVue, /'confirm-publish-tutorial-solution': 'publish-tutorial-solution'/)
})

test('教程搜索选择器把弹出选项置于遮罩之上，并在选中后先关闭再进入下一步', () => {
  assert.match(dynamicFormVue, /popper-class="getTutorialSelectPopperClass\(node, field\)"/)
  assert.match(dynamicFormVue, /@visible-change="handleTutorialSelectVisibleChange\(node, field, \$event\)"/)
  assert.match(dynamicFormVue, /completeTutorialStepAfterSelectClose\(node, field, stepId\)/)
  assert.match(customFieldDialogVue, /popper-class="getTutorialSelectPopperClass\(\)"/)
  assert.match(customFieldDialogVue, /completeTutorialStepAfterSelectClose\('change-analysis-category'\)/)
  assert.match(overlayVue, /guided-tutorial-select-popper/)
  assert.match(dynamicFormVue, /Element Plus restores focus to the input/)
  assert.match(dynamicFormVue, /finishPendingTutorialSelectStep\(node, field\)[\s\S]*?180/)
})

test('方案教程的保存目标绑定在保存草稿按钮，而不是添加节点按钮', () => {
  assert.equal((solutionCenterVue.match(/data-tutorial-target="save-solution-draft"/g) || []).length, 1)
  const addNodeBlock = solutionCenterVue.match(/<div class="solution-add-node-control">[\s\S]*?<div class="solution-toolbar-icon-actions">/)?.[0] || ''
  const saveButton = solutionCenterVue.match(/<el-button\s+ref="saveBtnRef"[\s\S]*?<\/el-button>/)?.[0] || ''
  assert.doesNotMatch(addNodeBlock, /save-solution-draft/)
  assert.match(saveButton, /data-tutorial-target="save-solution-draft"/)
})

test('圈包草稿进入数据引擎取数模板时按 ID 自动同步，并提供失败重试出口', () => {
  assert.match(normalModeVue, /workbenchDraftSyncStatus: 'pending'/)
  assert.match(solutionCenterVue, /getSolution\(expectedId,/)
  assert.match(solutionCenterVue, /TUTORIAL_DRAFT_SYNC_DELAYS/)
  assert.match(solutionCenterVue, /cdp:tutorial-retry-workbench-draft-sync/)
  assert.match(solutionCenterVue, /workbenchDraftSyncStatus: 'timeout'/)
  assert.match(overlayVue, /重新同步草稿/)
  assert.match(overlayVue, /正在同步刚刚保存的“圈包草稿”/)
})

test('复制与字段联动动效尊重减少动态效果设置', () => {
  assert.match(normalModeVue, /tutorial-copy-source/)
  assert.match(normalModeVue, /tutorial-copy-arrival/)
  assert.match(normalModeVue, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(solutionCenterVue, /tutorial-field-map-ready/)
  assert.match(overlayVue, /guided-tutorial__field-map/)
  assert.match(overlayVue, /guided-tutorial__solution-results/)
})

test('共同浏览步骤高亮完整的交并差控制区，并给整个系统确认弹窗留出可点击区域', () => {
  assert.match(normalModeVue, /class="tutorial-intersection-control"/)
  assert.match(normalModeVue, /:data-tutorial-target=\"index === 1 \? 'solution-intersection' : undefined\"/)
  assert.match(normalModeVue, /aria-label=\"节点关系：交集、并集、差集\"/)
  assert.match(overlayVue, /messageBoxSelector/)
  assert.match(overlayVue, /\.is-message-box \.el-message-box/)
  assert.match(overlayVue, /document\.querySelectorAll\(messageBoxSelector\)/)
  assert.match(overlayVue, /systemDialogConfirmLabel/)
  assert.match(overlayVue, /整个确认弹窗都可以操作/)
  assert.match(overlayVue, /messageBoxTarget && targetChanged/)
  assert.match(overlayVue, /trackTargetPosition\(1200\)/)
  assert.match(overlayVue, /scheduleTargetScrollCorrections/)
  assert.match(overlayVue, /targetIsClipped/)
  assert.doesNotMatch(overlayVue, /guided-tutorial-active/)
})

test('第四章用单独信息块突出少量改参复用整套圈人逻辑', () => {
  assert.match(overlayVue, /guided-tutorial__efficiency-callout/)
  assert.match(overlayVue, /业务提效/)
  assert.match(overlayVue, /只换 2 个业务参数，直接复用整套圈人逻辑/)
  assert.match(overlayVue, /无需重新搭节点/)
})

test('教程把方案名称和人群包名称单独列出并支持直接复制', () => {
  assert.match(overlayVue, /copyableNameItems/)
  assert.match(overlayVue, /copyTutorialName\(item\)/)
  assert.match(overlayVue, /label: '方案名称'/)
  assert.match(overlayVue, /label: '默认人群包名称'/)
  assert.match(overlayVue, /label: '第二次人群包名称'/)
  assert.match(overlayVue, /CATEGORY_ITEM_TUTORIAL_VALUES\.audienceName/)
  assert.match(overlayVue, /已复制/)
})
