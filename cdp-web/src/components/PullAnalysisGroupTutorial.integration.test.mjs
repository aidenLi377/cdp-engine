import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const solutionCenterVue = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const folderTreeVue = readFileSync(join(currentDir, 'FolderTree.vue'), 'utf8')
const overlayVue = readFileSync(join(currentDir, 'GuidedTutorialOverlay.vue'), 'utf8')
const detailVue = readFileSync(join(currentDir, 'PullAnalysisGroupTutorialDetail.vue'), 'utf8')

test('进阶教程从真实基础方案派生两个三节点方案', () => {
  assert.match(normalModeVue, /pullBaseSolutionId/)
  assert.match(normalModeVue, /pullOwnDraftId/)
  assert.match(normalModeVue, /pullCompetitorDraftId/)
  assert.match(solutionCenterVue, /index === 1 \? 'pull-duplicate-node-1'/)
  assert.match(solutionCenterVue, /insertNodeAtPosition\(nodeList\.value, duplicated, index\)/)
  assert.match(solutionCenterVue, /pullAnalysisStructureReady/)
  assert.match(solutionCenterVue, /purchaseNode\?\.operator === 'n'/)
})

test('复制竞品节点时只保留正确的跳过动作，弹窗退出后重新定位', () => {
  assert.match(solutionCenterVue, /confirmButtonText: shouldForceSkip \? '跳过并继续' : '自动绑定'/)
  assert.match(solutionCenterVue, /showCancelButton: !shouldForceSkip/)
  assert.doesNotMatch(solutionCenterVue, /本次新节点用途不同，请选择“跳过”/)
  assert.match(solutionCenterVue, /window\.setTimeout\(\(\) => \{[\s\S]*completeGuidedTutorialStep\('pull-skip-auto-bind'\)/)
  assert.match(overlayVue, /scheduleDialogHandoffCorrections/)
  assert.match(overlayVue, /attributeFilter: \['class', 'style', 'aria-hidden'\]/)
})

test('一对多字段会按业务关系验证 8 + 4 + 4 处绑定', () => {
  assert.match(solutionCenterVue, /pullAnalysisFieldsReady/)
  assert.match(solutionCenterVue, /\[\[0, 'leafCates'\], \[1, 'leafCates'\], \[2, 'leafCates'\]\]/)
  assert.match(solutionCenterVue, /\[\[0, 'stdBrand'\], \[2, 'stdBrand'\]\]/)
  assert.match(solutionCenterVue, /\[\[1, 'stdBrand'\], \[2, 'stdBrand'\]\]/)
  assert.match(normalModeVue, /\['分析类目', 8\]/)
  assert.match(normalModeVue, /\['本品牌', 4\]/)
  assert.match(normalModeVue, /\['竞争品牌', 4\]/)
})

test('方案文件夹记录真实 ID 并要求三个正式方案全部拖入', () => {
  assert.match(folderTreeVue, /pull-create-folder/)
  assert.match(folderTreeVue, /pull-folder-name/)
  assert.match(solutionCenterVue, /pullFolderId: String\(created\?\.id \|\| ''\)/)
  assert.match(solutionCenterVue, /requiredIds\.length === 3 && memberIds\.length === 3/)
  assert.match(normalModeVue, /tutorial-batch-folder-id/)
  assert.match(normalModeVue, /pull-open-group-preview/)
})

test('组合教程支持名称一键复制、全量执行与仅重试失败项', () => {
  assert.match(overlayVue, /pull-own-solution-name/)
  assert.match(overlayVue, /pull-own-crowd-name/)
  assert.match(overlayVue, /pull-competitor-solution-name/)
  assert.match(overlayVue, /pull-folder-name/)
  assert.match(normalModeVue, /scope === 'failed'/)
  assert.match(normalModeVue, /pullBatchFailedNames/)
  assert.match(normalModeVue, /cdp:tutorial-retry-pull-batch/)
  assert.match(detailVue, /少量改参/)
})

test('方案组课程进度使用紧凑轨道，不再用三张厚重状态卡', () => {
  assert.match(overlayVue, /guided-tutorial__course-progress::before/)
  assert.match(overlayVue, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(overlayVue, /grid-template-rows: 14px minmax\(0, auto\)/)
  assert.match(overlayVue, /right: 12\.5%/)
  assert.match(overlayVue, /left: 12\.5%/)
  assert.match(overlayVue, /:aria-current="pullCourseLesson === index \+ 1 \? 'step' : undefined"/)
  assert.doesNotMatch(overlayVue, /\.guided-tutorial__course-progress span\.done \{[^}]*background:/s)
  assert.doesNotMatch(overlayVue, /\.guided-tutorial__course-progress span\.active \{[^}]*background:/s)
})

test('组合应用先检查三个方案和运行默认场景，再改参完成第二轮', () => {
  assert.match(normalModeVue, /pull-batch-package-/)
  assert.match(normalModeVue, /pullVisitedPackageIndexes/)
  assert.match(normalModeVue, /pull-run-baseline/)
  assert.match(normalModeVue, /pull-run-second/)
  assert.match(normalModeVue, /pullBatchRound: tutorialRound/)
  assert.match(normalModeVue, /pullBaselineStatus/)
  assert.match(normalModeVue, /pullSecondStatus/)
  assert.match(overlayVue, /pull-explain-aggregation-origin/)
  assert.match(overlayVue, /共同浏览 2/)
  assert.match(overlayVue, /修改 1 次 → 同步 3 个方案的 8 处绑定/)
  assert.match(detailVue, /两轮圈人看见真实提效/)
  assert.match(detailVue, /默认场景3个包，改参后再生成3个新包/)
})

test('多竞品教程必须由用户点击应用方案组合后才进入参数编辑', () => {
  assert.match(normalModeVue, /if \(isGuidedTutorialStep\('combo-confirm-group'\)\) \{[\s\S]*allHaveCompetitorField/)
  assert.match(normalModeVue, /if \(isGuidedTutorialStep\('combo-confirm-group'\)\) \{\s*completeGuidedTutorialStep\('combo-confirm-group'\)/)
  assert.doesNotMatch(normalModeVue, /batchMode\.value[\s\S]{0,250}completeGuidedTutorialStep\('combo-confirm-group'\)/)
})

test('多竞品九包从发起到确认均提供独立高亮步骤', () => {
  assert.match(normalModeVue, /isGuidedTutorialStep\('combo-start-automation'\)/)
  assert.match(normalModeVue, /isGuidedTutorialStep\('combo-select-all'\)/)
  assert.match(normalModeVue, /isGuidedTutorialStep\('combo-confirm-run'\)/)
  assert.match(normalModeVue, /completeGuidedTutorialStep\('combo-confirm-run'\)/)
})

test('非阻塞教程使用小型上下箭头收起，不再占据一整行', () => {
  assert.match(overlayVue, /:aria-label="cardCollapsed \? '展开操作指引' : '收起操作指引'"/)
  assert.match(overlayVue, /\.guided-tutorial__collapse \{[\s\S]*width: 24px;[\s\S]*height: 24px;/)
  assert.match(overlayVue, /\.guided-tutorial__card\.is-collapsed \{[\s\S]*width: 44px !important;/)
  assert.doesNotMatch(overlayVue, />\{\{ cardCollapsed \? '展开操作指引' : '收起指引，腾出操作空间' \}\}<\/button>/)
})

test('第二轮自动生成新名称，避免覆盖第一轮人群包', () => {
  assert.match(normalModeVue, /applyPullTutorialFinalCrowdNames/)
  assert.match(normalModeVue, /defaultCrowdName: crowdName/)
  assert.match(normalModeVue, /pullBatchPackageNames: batchEntries\.value\.map\(entry => entry\.crowdName\)/)
  assert.match(overlayVue, /pull-final-crowd-/)
})
