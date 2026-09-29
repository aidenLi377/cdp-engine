import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const folderTreeVue = readFileSync(join(currentDir, 'FolderTree.vue'), 'utf8')
const dynamicFormVue = readFileSync(join(currentDir, 'DynamicForm.vue'), 'utf8')
const customFieldDialogVue = readFileSync(join(currentDir, 'CustomFieldEditDialog.vue'), 'utf8')
const globalCss = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('folder combinations are offered only for leaf folders with at least two direct published solutions', () => {
  assert.match(normalModeVue, /@batch-apply="openBatchPreviewForFolder"/)
  assert.match(normalModeVue, /buildLeafFolderDirectCounts\(publishedFolderTree\.value, publishedSolutions\.value\)/)
  assert.match(normalModeVue, /function openBatchPreview\(folderId = selectedPublishedFolderId\.value\)/)
  assert.match(normalModeVue, /folder\?\.children[\s\S]*?父文件夹不支持组合，请选择一个具体的子文件夹/)
  assert.match(normalModeVue, /getDirectPublishedSolutionsInFolder\(folderId\)/)
  assert.match(normalModeVue, /if \(!openBatchPreview\(folderId\)\) return/)
  assert.match(normalModeVue, /:show-batch-badges="true"/)
  assert.match(normalModeVue, /solutions\.length < 2/)
})

test('compact layout is the only combination workbench layout', () => {
  assert.match(normalModeVue, /v-if="batchMode" class="batch-compact-rail"/)
  assert.doesNotMatch(normalModeVue, /layout-preview-switch/)
  assert.doesNotMatch(normalModeVue, /compactLayoutPreview/)
  assert.doesNotMatch(normalModeVue, /batch-folder-callout/)
  assert.doesNotMatch(normalModeVue, /batch-workbench-band/)
})

test('combination workbench can be cleared back to the free-build workspace', () => {
  assert.match(normalModeVue, /v-if="batchMode"[\s\S]*?@click="clearCanvas"[\s\S]*?清空组合/)
  assert.match(normalModeVue, /function clearCanvas\(\)[\s\S]*?resetWorkbenchContext\(\)/)
  assert.match(normalModeVue, /function resetWorkbenchContext\([^)]*\)[\s\S]*?resetBatchContext\(\)[\s\S]*?workbenchMode\.value = 'free-build'/)
})

test('batch workbench switches package detail by configured crowd name', () => {
  assert.match(normalModeVue, /class="batch-compact-tabs"/)
  assert.match(normalModeVue, /class="batch-compact-tab"/)
  assert.match(normalModeVue, /entry\.crowdName \|\| '未命名人群包'/)
  assert.match(normalModeVue, /@click="activateBatchEntry\(entryIndex\)"/)
  assert.match(normalModeVue, /currentSolution\.value = nextEntry\.record/)
  assert.match(normalModeVue, /nodeList\.value = nextEntry\.nodes/)
})

test('batch package rail exposes every package through scrolling, buttons, and keyboard navigation', () => {
  assert.match(normalModeVue, /ref="batchTabsRef"/)
  assert.match(normalModeVue, /@wheel="onBatchTabsWheel"/)
  assert.match(normalModeVue, /@click="scrollBatchTabs\(-1\)"/)
  assert.match(normalModeVue, /@click="scrollBatchTabs\(1\)"/)
  assert.match(normalModeVue, /function revealBatchTab\(index, behavior = 'smooth'\)/)
  assert.match(normalModeVue, /revealBatchTab\(index\)/)
  assert.match(normalModeVue, /@keydown\.left\.prevent="activateAdjacentBatchEntry\(entryIndex, -1\)"/)
  assert.match(normalModeVue, /@keydown\.right\.prevent="activateAdjacentBatchEntry\(entryIndex, 1\)"/)
  assert.match(globalCss, /\.batch-compact-scroll \{[^}]*height: 32px;/s)
  assert.match(globalCss, /\.batch-compact-tabs \{[^}]*overflow-x: auto;/s)
})

test('batch parameter editing synchronizes every same-name custom field', () => {
  assert.match(normalModeVue, /composeBatchCustomFieldSections/)
  assert.match(normalModeVue, /String\(field\?\.name \|\| ''\)\.trim\(\) === name/)
  assert.match(normalModeVue, /syncCustomFieldValue\(entry\.nodes, field\.id, fields, cloneValue\(value\)\)/)
  assert.match(normalModeVue, /适用于 \$\{section\.entryCount \|\| 0\}/)
})

test('batch mode locks raw package details and names to keep shared parameters authoritative', () => {
  assert.match(normalModeVue, /:readonly="batchMode"/)
  assert.match(normalModeVue, /:disabled="batchMode"\s+@input="onNameManualEdit"/)
  assert.match(dynamicFormVue, /:disabled="props\.readonly"/)
})

test('copy dialog chooses a source while batch automation directly lists a compact default-selected queue', () => {
  assert.match(normalModeVue, /选择要复制的人群包参数/)
  assert.match(normalModeVue, /v-model="batchCopyIndex"/)
  assert.doesNotMatch(normalModeVue, /仅圈当前人群包/)
  assert.doesNotMatch(normalModeVue, /圈完全部人群包/)
  assert.match(normalModeVue, /class="batch-task-table-head"/)
  assert.match(normalModeVue, /人群包名称/)
  assert.match(normalModeVue, /操作方式/)
  assert.match(normalModeVue, /batchAutomationSelectedIndexes/)
  assert.match(normalModeVue, /toggleBatchAutomationEntry/)
  assert.match(normalModeVue, /for \(const index of targetIndexes\)/)
  assert.match(normalModeVue, /const executionMode = getBatchEntryExecutionMode\(entry\)/)
  assert.match(normalModeVue, /sendDatabankRealtimeCount\(jsonText, entry\.crowdName, run\.id, \{[\s\S]*?precheckedNoMatch: true/)
  assert.match(normalModeVue, /sendDatabankDirectCreateWithReconciliation\([\s\S]*?entry\.crowdName,[\s\S]*?run\.id,[\s\S]*?precheckedNoMatch: true/)
  assert.match(normalModeVue, /两种操作都会先精确检查同名人群包/)
  assert.match(normalModeVue, /entry\.crowdReused = result\?\.crowdReused === true[\s\S]*?if \(executionMode === 'calculate_only'\)/)
  assert.match(normalModeVue, /class="automation-single-mode-grid"/)
  assert.doesNotMatch(normalModeVue, /setSingleAutomationMode\('create_only'\)/)
  assert.match(normalModeVue, /AUTO_CALCULATE_EXTENSION_VERSION = '2\.2\.2'/)
  assert.match(normalModeVue, /CUSTOM_CROWD_EXTENSION_VERSION = '2\.2\.5'/)
  assert.match(normalModeVue, /AUDIENCE_TASK_EXTENSION_VERSION = '2\.2\.34'/)
  assert.match(normalModeVue, /class="batch-interface-only"[\s\S]*?接口执行/)
  assert.doesNotMatch(normalModeVue, /页面计算|页面建包|页面取数/)
  assert.match(normalModeVue, /const batchCreateMethod = ref\('api'\)/)
  assert.match(normalModeVue, /const batchRealtimeCountMethod = ref\('api'\)/)
  assert.doesNotMatch(normalModeVue, /contextPreparation\?\.warmupResult|contextPreparation\.warmupResult/)
  assert.match(normalModeVue, /node\?\.packageType === '自定义人群'/)
  assert.match(normalModeVue, /ensureAutomationExtensionReady/)
  assert.doesNotMatch(normalModeVue, /function sendMessageToDatabankExtension/)
  assert.match(normalModeVue, /class="automation-login-prerequisite"[\s\S]*?请确认当前浏览器已登录数据引擎/)
  assert.match(globalCss, /\.automation-login-prerequisite/)
})

test('single automation offers two API-only execution choices and safely handles large packages', () => {
  assert.match(normalModeVue, /class="automation-single-panel"/)
  assert.match(normalModeVue, /class="automation-single-mode-grid"/)
  assert.match(normalModeVue, /aria-label="单个人群包的执行方式"/)
  assert.doesNotMatch(normalModeVue, />只圈包</)
  assert.match(normalModeVue, />建包并取数</)
  assert.match(normalModeVue, />只算人数</)
  assert.match(normalModeVue, /function setSingleAutomationMode\(mode\)[\s\S]*?mode === 'create_and_count'[\s\S]*?singleCreateAndCount\.value = true[\s\S]*?batchRealtimeCountMethod\.value = 'api'/)
  assert.match(normalModeVue, /singleRealtimeCountUnsupported = computed\(\(\) => !batchMode\.value && nodeList\.value\.length > 6\)/)
  assert.match(normalModeVue, /:disabled="databankAutomating \|\| singleRealtimeCountUnsupported"/)
  const singleFlow = normalModeVue.slice(
    normalModeVue.indexOf('async function startAutoDataBankFlow'),
    normalModeVue.indexOf('function sendDatabankCrowdCountQuery'),
  )
  const crowdNameValidation = singleFlow.indexOf("const crowdName = String(crowdNameInput.value || '').trim()")
  const jsonBuild = singleFlow.indexOf('await buildFinalJson()')
  assert.ok(crowdNameValidation > 0 && crowdNameValidation < jsonBuild)
  assert.match(singleFlow, /if \(!crowdName\)[\s\S]*?请先输入人群包名称/)
  assert.doesNotMatch(singleFlow, /crowdNameInput\.value \|\| DEFAULT_CROWD_NAME/)
  assert.match(singleFlow, /showAutomationStage\('正在准备人群包参数\.\.\.'\)/)
  assert.match(singleFlow, /showAutomationStage\('正在检查同名人群包\.\.\.'\)[\s\S]*?sendDatabankCrowdCountQuery\(crowdName\)/)
  assert.match(singleFlow, /首次使用时将先用轻量参数准备接口环境/)
  assert.match(singleFlow, /ensureDatabankApiContextReady\(run\.id\)/)
  assert.doesNotMatch(singleFlow, /ensureDatabankApiContextReady\(run\.id, \{[\s\S]*?jsonText/)
  assert.doesNotMatch(singleFlow, /contextPreparation\?\.warmupResult|contextPreparation\.warmupResult/)
  assert.doesNotMatch(singleFlow, /正在打开数据银行/)
  assert.match(singleFlow, /const executionMode = getSingleAutomationMode\(\)/)
  assert.match(singleFlow, /sendDatabankCrowdCountQuery\(crowdName\)[\s\S]*?existingCrowd\?\.crowdFound === true/)
  assert.match(singleFlow, /sendDatabankRealtimeCount\(jsonText, crowdName, run\.id, \{ precheckedNoMatch: true \}\)/)
  assert.match(singleFlow, /sendDatabankDirectCreateWithReconciliation\([\s\S]*?crowdName,[\s\S]*?run\.id,[\s\S]*?precheckedNoMatch: true/)
  assert.match(singleFlow, /executionMode === 'create_and_count'[\s\S]*?createSingleAudienceCountTask\(crowdName, result\)/)
  assert.match(singleFlow, /backgroundCountTask: true/)
  assert.match(singleFlow, /接口建包成功：\$\{crowdName\}/)
  assert.match(normalModeVue, /CROWD_COUNT_POLL_INTERVAL_MIN_MS = 45 \* 1000/)
  assert.match(normalModeVue, /CROWD_COUNT_POLL_INTERVAL_MAX_MS = 75 \* 1000/)
  assert.match(normalModeVue, /function startSingleAudienceCountPolling/)
  assert.match(normalModeVue, /getCountPollingSummary\(task\)/)
  assert.doesNotMatch(normalModeVue, /人数已经查询 10 分钟|超过 10 分钟/)
  assert.match(normalModeVue, /requiresRealtimeCountApi[\s\S]*?AUDIENCE_TASK_EXTENSION_VERSION/)
  assert.match(globalCss, /\.automation-single-mode-grid/)
  assert.match(globalCss, /\.automation-single-mode-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(globalCss, /\.automation-single-mode\.is-active/)
  assert.match(globalCss, /\.single-count-task-stack/)
})

test('automation prepares the DataBank API context and reconciles ambiguous create failures', () => {
  assert.match(normalModeVue, /CDP_PREPARE_DATABANK_API_CONTEXT/)
  assert.match(normalModeVue, /async function ensureDatabankApiContextReady\(runId = '', options = \{\}\)/)
  assert.match(normalModeVue, /sendDatabankApiContextCheck\(false, true, runId\)/)
  assert.doesNotMatch(normalModeVue, /sendDatabankApiContextCheck\([^)]*jsonText|sendDatabankApiContextCheck\([^)]*crowdName/)
  assert.match(normalModeVue, /正在读取已打开的数据银行接口环境/)
  assert.match(normalModeVue, /const manualSetupRequired = warmupResult\?\.hasOpenTab === false/)
  assert.match(normalModeVue, /'DATABANK_PAGE_REQUIRED',[\s\S]*?'DATABANK_REQUEST_CONTEXT_REQUIRED',[\s\S]*?'DATABANK_LOGIN_REQUIRED'/)
  assert.match(normalModeVue, /if \(!manualSetupRequired\) \{[\s\S]*?数据银行接口环境自动准备失败，请稍后重试/)
  assert.match(normalModeVue, /首次使用前，完成一次接口初始化/)
  assert.match(normalModeVue, /点击一次「计算人数」/)
  assert.match(normalModeVue, /ensureDatabankApiContextReady\(run\.id/)
  assert.match(normalModeVue, /CDP_RELEASE_DATABANK_API_SESSION/)
  assert.match(normalModeVue, /async function sendDatabankDirectCreateWithReconciliation/)
  assert.match(normalModeVue, /creationConfirmedByLookup: true/)
  assert.match(normalModeVue, /建包响应中断，但已查询到同名人群包，已按成功处理/)
  assert.match(globalCss, /\.databank-context-message-box/)
})

test('each audience row exposes two execution modes and the workbench keeps compact task progress', () => {
  for (const mode of ['calculate_only', 'create_and_count']) {
    assert.match(normalModeVue, new RegExp(mode))
  }
  assert.doesNotMatch(folderTreeVue, /默认执行|calculate_only|create_and_count/)
  assert.doesNotMatch(folderTreeVue, /value="create_only"/)
  assert.doesNotMatch(normalModeVue, />只建包<|>只圈包</)
  assert.match(normalModeVue, /class="batch-task-launch"/)
  assert.ok(
    normalModeVue.indexOf('class="batch-task-launch"')
      < normalModeVue.indexOf('class="workbench-compact-action workbench-writeback-action"'),
  )
  assert.match(globalCss, /\.workbench-writeback-action\.el-button \{[^}]*margin-left: 2px;/s)
  assert.doesNotMatch(normalModeVue, /<section class="batch-task-center"/)
  assert.match(normalModeVue, /v-for="mode in BATCH_EXECUTION_MODES"/)
  assert.match(normalModeVue, /@click="updateBatchEntryExecutionMode\(row\.index, mode\.value\)"/)
  assert.match(globalCss, /\.batch-task-dialog \.batch-run-queue-row\.is-selectable \{[^}]*min-height: 42px;/s)
  assert.match(globalCss, /\.batch-row-mode-button \{[^}]*height: 26px;/s)
  assert.match(globalCss, /@media \(max-width: 720px\)[\s\S]*?\.batch-task-dialog \.batch-run-queue-row\.is-selectable \{[^}]*grid-template-columns: 22px minmax\(0, 1fr\) 54px 34px;/s)
  assert.match(globalCss, /@media \(max-width: 720px\)[\s\S]*?\.batch-task-dialog \.batch-run-queue \{[^}]*overflow-x: hidden;/s)
  assert.match(normalModeVue, /CROWD_COUNT_POLL_INTERVAL_MIN_MS = 45 \* 1000/)
  assert.match(normalModeVue, /CROWD_COUNT_POLL_INTERVAL_MAX_MS = 75 \* 1000/)
  assert.match(normalModeVue, /function getRandomCountPollingIntervalMs/)
  assert.match(normalModeVue, /已等待 \$\{formatPollingElapsed/)
  assert.match(normalModeVue, /已查询 \$\{attempts\} 次/)
  assert.doesNotMatch(normalModeVue, /超过 10 分钟/)
  assert.match(normalModeVue, /超过 6 个行为时不支持实时计算/)
  assert.match(normalModeVue, /DATABANK_LOGIN_REQUIRED/)
  assert.match(normalModeVue, /prepareBatchCrowdNamesForRun/)
  assert.match(normalModeVue, /getShanghaiDateSuffix/)
  assert.match(normalModeVue, /\/api\/audience-runs\/export/)
})

test('eligible audiences default to count-only and remember choices per user and solution group', () => {
  assert.match(normalModeVue, /getDefaultAudienceExecutionMode/)
  assert.match(normalModeVue, /loadAudienceExecutionPreferences/)
  assert.match(normalModeVue, /saveAudienceExecutionPreference/)
  assert.match(normalModeVue, /function getBatchExecutionPreferenceKey\(folderId = selectedPublishedFolderId\.value\)/)
  assert.match(normalModeVue, /const executionPreferenceKey = getBatchExecutionPreferenceKey\(\)/)
  assert.match(normalModeVue, /batchExecutionPreferenceKey\.value = executionPreferenceKey/)
  assert.match(normalModeVue, /function rememberBatchEntryExecutionMode/)
  assert.match(normalModeVue, /rememberBatchEntryExecutionMode\(entry, mode\)/)
})

test('batch automation preflights the target and custom crowd dependencies before API execution', () => {
  const automationFlow = normalModeVue.slice(
    normalModeVue.indexOf('async function startBatchAutomationFlow'),
    normalModeVue.indexOf('function retryPullAnalysisBatch'),
  )
  assert.match(automationFlow, /sendDatabankCrowdCountQuery\(entry\.crowdName\)[\s\S]*?if \(existingCrowd\?\.crowdFound === true\)/)
  assert.match(automationFlow, /extractCustomCrowdDependencyNames\(jsonText\)[\s\S]*?sendDatabankCustomDependencyCheck\(dependencyNames\)/)
  const duplicateCheck = automationFlow.indexOf('sendDatabankCrowdCountQuery(entry.crowdName)')
  const realtimeExecution = automationFlow.indexOf('sendDatabankRealtimeCount(jsonText, entry.crowdName, run.id, {')
  const createExecution = automationFlow.indexOf('sendDatabankDirectCreateWithReconciliation(')
  assert.ok(duplicateCheck >= 0 && duplicateCheck < realtimeExecution && duplicateCheck < createExecution)
  assert.match(normalModeVue, /CDP_CHECK_DATABANK_CUSTOM_DEPENDENCIES/)
  assert.match(normalModeVue, /waiting_dependency/)
  assert.match(normalModeVue, /dependency_blocked/)
  assert.match(normalModeVue, /refreshBatchEntryDependencies/)
  assert.match(globalCss, /\.batch-run-refresh/)
})

test('a mixed batch skips API-context preparation for existing crowds and prepares only after the first miss', () => {
  const automationFlow = normalModeVue.slice(
    normalModeVue.indexOf('async function startBatchAutomationFlow'),
    normalModeVue.indexOf('function retryPullAnalysisBatch'),
  )
  const duplicateCheck = automationFlow.indexOf('sendDatabankCrowdCountQuery(entry.crowdName)')
  const existingBranchStart = automationFlow.indexOf('if (existingCrowd?.crowdFound === true)')
  const dependencyStart = automationFlow.indexOf('if (entry.internalDependencies.length > 0)')
  const contextPreparation = automationFlow.indexOf('ensureDatabankApiContextReady(')
  const createExecution = automationFlow.indexOf('sendDatabankDirectCreateWithReconciliation(')
  const existingBranch = automationFlow.slice(existingBranchStart, dependencyStart)

  assert.ok(duplicateCheck >= 0)
  assert.ok(duplicateCheck < existingBranchStart)
  assert.match(existingBranch, /applyBatchAutomationResult\([\s\S]*?continue/)
  assert.doesNotMatch(existingBranch, /ensureDatabankApiContextReady/)
  assert.ok(existingBranchStart < contextPreparation)
  assert.ok(contextPreparation < createExecution)
  assert.match(automationFlow, /let batchContextPreparation = null/)
  assert.match(automationFlow, /if \(batchContextPreparation\?\.ready !== true\)[\s\S]*?ensureDatabankApiContextReady/)
})

test('batch task progress follows only this run selection and completed results wait for manual export', () => {
  assert.doesNotMatch(normalModeVue, /batch-task-stage-card/)
  assert.match(normalModeVue, /const batchTaskTargetIndexes = ref\(\[\]\)/)
  assert.match(normalModeVue, /const batchTaskProgressEntries = computed/)
  assert.match(normalModeVue, /batchTaskProgressSucceededCount\.value \/ batchTaskProgressEntries\.value\.length/)
  assert.match(normalModeVue, /completeBatchTaskStage\('全部完成', '结果已就绪，可随时导出 Excel'\)/)
  const autoExport = normalModeVue.slice(
    normalModeVue.indexOf('function maybeAutoExportBatchResults'),
    normalModeVue.indexOf('function applyBatchAutomationResult'),
  )
  assert.doesNotMatch(autoExport, /exportBatchAudienceResults\(/)
})

test('existing crowds still calculating enter background polling instead of succeeding with a dash', () => {
  const resultHandler = normalModeVue.slice(
    normalModeVue.indexOf('function applyBatchAutomationResult'),
    normalModeVue.indexOf('async function startBatchAutomationFlow'),
  )
  assert.match(resultHandler, /result\?\.countPending === true/)
  assert.match(resultHandler, /entry\.automationStatus = 'waiting_count'/)
  assert.match(normalModeVue, /countPending: existingCrowd\?\.countReady !== true/)
  assert.match(normalModeVue, /if \(!entry\.countReady\)[\s\S]*?startCrowdCountPolling/)
})

test('a batch run resolves internal crowd dependencies before downstream packages execute', () => {
  assert.match(normalModeVue, /const batchRunDateSuffix = ref\(''\)/)
  assert.match(normalModeVue, /const dateSuffix = force \|\| !batchRunDateSuffix\.value[\s\S]*?batchRunDateSuffix\.value = dateSuffix/)
  assert.match(normalModeVue, /function compileBatchDependencyGraph\(\)/)
  assert.match(normalModeVue, /sourceEntry\.isInternalPrerequisite = true[\s\S]*?sourceEntry\.executionMode = 'create_and_count'/)
  assert.match(normalModeVue, /function rewriteBatchInternalDependencyNames\(entry, payload\)/)
  assert.match(normalModeVue, /node\.selectionLv3\.crowdIds = Array\.isArray\(crowdIds\) \? rewritten : rewritten\[0\]/)
  assert.match(normalModeVue, /function rewriteResolvedCustomCrowdIds\(payload, dependencies\)/)
  assert.match(normalModeVue, /crowdId: sourceEntry\?\.crowdId \?\? null/)
  assert.match(normalModeVue, /const targetIndexes = expandBatchIndexesWithDependencies\(requestedIndexes\)/)
  assert.match(normalModeVue, /rewriteBatchInternalDependencyNames\(entry, getGeneratedJsonText\(\)\)/)
  assert.match(normalModeVue, /buildInternalDependencyResult\(entry\)/)
  assert.match(normalModeVue, /rewriteResolvedCustomCrowdIds\(jsonText, internalDependencyResult\.results\)/)
  assert.match(normalModeVue, /rewriteResolvedCustomCrowdIds\(jsonText, dependencyResult\.results\)/)
  assert.match(normalModeVue, /function queueReadyInternalDependencyRuns\(\)/)
  assert.match(normalModeVue, /if \(!entry\.countReady\) \{[\s\S]*?startCrowdCountPolling/)
  assert.match(normalModeVue, /建立前置包/)
  assert.match(normalModeVue, /等待出数/)
  assert.match(normalModeVue, /执行后续包/)
  assert.match(normalModeVue, /就绪后自动继续/)
  assert.match(globalCss, /\.batch-dependency-rail/)
  assert.match(globalCss, /\.batch-dependency-stage/)
})

test('parameter batch supports a single solution and an unexpanded combination session', () => {
  assert.match(normalModeVue, /function canBatchParameterSection\(section\)/)
  assert.match(normalModeVue, /workbenchMode\.value === 'solution-use'/)
  assert.match(normalModeVue, /&& !isParameterBatch\.value/)
  assert.match(normalModeVue, /:show-batch-action="canBatchParameterSection\(editingCfSection\)"/)
  assert.match(normalModeVue, /@batch="openParameterBatchFromEditor"/)
  assert.doesNotMatch(normalModeVue, /class="cf-parameter-batch-trigger"/)
  assert.match(customFieldDialogVue, /class="cf-edit-batch-action"/)
  assert.match(customFieldDialogVue, /Excel 批量/)
  assert.match(normalModeVue, /expandCombinationParameterRows/)
  assert.match(normalModeVue, /parameterBatchRows\.value\.length \* parameterBatchSourceCount\.value/)
  assert.match(normalModeVue, /同名字段先聚合，再按每个方案自己的绑定关系生效/)
})

test('combination parameter batch keeps the companion tutorial beside the dialog at desktop widths', () => {
  assert.match(globalCss, /guided-tutorial-dialog-companion-open \.parameter-batch-dialog\.el-dialog/)
  assert.match(globalCss, /width: min\(760px, calc\(100vw - 420px\)\) !important/)
  assert.match(globalCss, /margin: 16px 16px 16px auto !important/)
})

test('parameter batch dialog keeps its actions visible while rows scroll', () => {
  assert.match(globalCss, /\.parameter-batch-dialog\.el-dialog \{[^}]*display: flex;[^}]*flex-direction: column;/s)
  assert.match(globalCss, /\.parameter-batch-dialog\.el-dialog \{[^}]*height: min\(820px, calc\(100vh - 32px\)\);[^}]*margin: 16px auto !important;/s)
  assert.match(globalCss, /\.parameter-batch-dialog \.el-dialog__body \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow-y: auto;/s)
  assert.match(globalCss, /\.parameter-batch-dialog \.el-dialog__footer \{[^}]*flex: 0 0 auto;[^}]*background: #fff;/s)
  assert.match(globalCss, /@media \(max-height: 860px\)[\s\S]*?\.parameter-batch-preview-row \{[^}]*min-height: 43px;/s)
})

test('Excel parameter rows become independent entries on the same solution', () => {
  assert.match(normalModeVue, /buildParameterBatchRows/)
  assert.match(normalModeVue, /每一行生成 \{\{ parameterBatchSourceCount \}\} 个人群包/)
  assert.match(normalModeVue, /syncCustomFieldValue\(nodes, customFieldId, customFields, cloneValue\(row\.parameterValue \?\? row\.values\)\)/)
  assert.match(normalModeVue, /parameterBatchValues: cloneValue\(row\.values\)/)
  assert.match(normalModeVue, /batchKind\.value = 'parameter'/)
  assert.match(normalModeVue, /await activateBatchEntry\(0, \{ skipPersist: true \}\)/)
})

test('date parameter batch explains both recent days and fixed Excel date columns', () => {
  assert.match(normalModeVue, /buildDateParameterBatchRows\(parameterBatchText\.value/)
  assert.match(normalModeVue, /第一列开始时间，第二列结束时间/)
  assert.match(normalModeVue, /<table v-if="isDateBatchParameterSection\(parameterBatchSection\)" class="parameter-batch-date-sheet"/)
  assert.match(normalModeVue, /第一列<\/small>开始时间/)
  assert.match(normalModeVue, /第二列<\/small>结束时间/)
  assert.match(normalModeVue, /复制 Excel 两列日期的数据行，不含表头/)
  assert.match(globalCss, /\.parameter-batch-date-sheet \{[^}]*width: 100%;/s)
  assert.match(globalCss, /\.parameter-batch-guide\.is-date-batch \{[^}]*grid-template-columns: 30px minmax\(0, 1fr\);/s)
  assert.match(normalModeVue, /已检查日期格式、先后顺序、可选范围和重复行/)
  assert.match(normalModeVue, /row\.sourceText \?\? row\.values\.join/)
  assert.match(normalModeVue, /parameterBatchIsDate: Boolean\(row\.parameterValue\)/)
  assert.match(normalModeVue, /if \(isDateParameterBatch\(\)\) \{[\s\S]*?buildDatedParameterCrowdName\(entry, dateSuffix, index\)/)
  assert.match(normalModeVue, /const crowdName = dateParameterBatch \? String\(value \|\| ''\)\.trim\(\) : truncateCrowdName\(value\)/)
})

test('the row-specific parameter cannot be overwritten by shared batch edits', () => {
  assert.match(normalModeVue, /function isParameterBatchSection\(section\)/)
  assert.match(normalModeVue, /该参数由 Excel 行独立控制/)
  assert.match(normalModeVue, /activeBatchEntry\?\.parameterBatchSourceRow \|\| 1/)
  assert.match(normalModeVue, /是本次按行拆分的参数，不能同步覆盖/)
  assert.match(normalModeVue, /其余参数修改一次，同步写入/)
})

test('formal batch automation preserves successes and retries only failed or interrupted packages', () => {
  assert.match(normalModeVue, /class="batch-recovery-bar"/)
  assert.match(normalModeVue, /class="batch-recovery-action"/)
  assert.doesNotMatch(normalModeVue, /<el-button\s+class="intercom-btn-primary"\s+size="small"\s+:disabled="databankAutomating"\s+@click="openBatchFailureRecovery"/)
  assert.match(normalModeVue, /成功结果会保留，恢复时只重新提交未完成的包/)
  assert.match(globalCss, /\.batch-recovery-bar \{[^}]*background: #fff;[^}]*border: 1px solid #e3e6eb;/s)
  assert.match(globalCss, /\.batch-recovery-bar::before \{[^}]*background: #f26a3d;/s)
  assert.match(globalCss, /\.batch-recovery-bar \.batch-recovery-action\.el-button \{[^}]*background: #fff;[^}]*border: 1px solid #d8dce3;/s)
  assert.match(normalModeVue, /openBatchAutomationDialog\('failed'\)/)
  assert.match(normalModeVue, /entry\.automationStatus === 'failed'/)
  assert.match(normalModeVue, /startBatchAutomationFlow\('failed'\)/)
  assert.match(normalModeVue, /可仅重试失败任务/)
})

test('failed-task retries remain API-only and never fall back to page calculation', () => {
  const automationFlow = normalModeVue.slice(
    normalModeVue.indexOf('async function startBatchAutomationFlow'),
    normalModeVue.indexOf('function retryPullAnalysisBatch'),
  )
  assert.match(normalModeVue, /if \(options\?\.allowPageWarmup === false\) \{[\s\S]*?未切换执行通道/)
  assert.match(automationFlow, /allowPageWarmup: scope !== 'failed'/)
  assert.match(automationFlow, /entry\.automationStatus = scope === 'failed' \? 'failed' : 'idle'/)
  assert.match(automationFlow, /if \(scope !== 'failed'\) await promptDatabankContextSetup/)
})

test('a running package restored after interruption is converted into an actionable failed item', () => {
  assert.match(normalModeVue, /const wasInterrupted = entry\?\.automationStatus === 'running'/)
  assert.match(normalModeVue, /automationStatus: wasInterrupted[\s\S]*?\? 'failed'/)
  assert.match(normalModeVue, /automationInterrupted: wasInterrupted/)
  assert.match(normalModeVue, /上次执行在完成前中断，请仅重试该任务/)
})

test('one package failure does not stop the remaining formal batch queue', () => {
  const automationFlow = normalModeVue.slice(
    normalModeVue.indexOf('async function startBatchAutomationFlow'),
    normalModeVue.indexOf('function retryPullAnalysisBatch'),
  )
  assert.match(automationFlow, /for \(const index of targetIndexes\)/)
  assert.match(automationFlow, /任务准备失败[\s\S]*?continue/)
  assert.match(automationFlow, /自动化圈人失败[\s\S]*?continue/)
})

test('running batch tasks can be reopened and interrupted without losing completed results', () => {
  assert.match(normalModeVue, /:disabled="databankAutomating && !batchMode"/)
  assert.match(normalModeVue, /@click="handleAutomationButtonClick"/)
  assert.match(normalModeVue, /执行中 · 查看/)
  assert.match(normalModeVue, /function handleAutomationButtonClick\(\)[\s\S]*?openBatchAutomationDialog\('all'\)/)
  assert.match(normalModeVue, /v-if="batchMode && batchTaskCanInterrupt"/)
  assert.match(normalModeVue, /@click="interruptBatchAutomation"/)
  assert.match(normalModeVue, /type: 'CDP_CANCEL_TASK'/)
  assert.match(normalModeVue, /runId,[\s\S]*?window\.location\.origin/)
  assert.match(normalModeVue, /用户已中断，可重新执行该任务/)
})

test('interrupting a batch cancels count pollers and every batch exit releases its API session', () => {
  const interruptFlow = normalModeVue.slice(
    normalModeVue.indexOf('async function interruptBatchAutomation'),
    normalModeVue.indexOf('function getRandomCountPollingIntervalMs'),
  )
  const automationFlow = normalModeVue.slice(
    normalModeVue.indexOf('async function startBatchAutomationFlow'),
    normalModeVue.indexOf('function retryPullAnalysisBatch'),
  )

  assert.match(interruptFlow, /internalDependencyResumeTimer[\s\S]*?cancelAllCrowdCountPolling\(\)/)
  assert.match(interruptFlow, /sendDatabankTaskCancel\(run\.id\)/)
  assert.match(automationFlow, /finally \{[\s\S]*?releaseDatabankApiSession\(run\.id\)/)
})

test('dash and privacy-threshold counts are successful results and stay textual in Excel export', () => {
  const resultHandler = normalModeVue.slice(
    normalModeVue.indexOf('function applyBatchAutomationResult'),
    normalModeVue.indexOf('async function startBatchAutomationFlow'),
  )
  assert.match(resultHandler, /result\?\.countUnavailable === true/)
  assert.match(resultHandler, /entry\.crowdCount = '-'/)
  assert.match(resultHandler, /const normalizedCount = normalizeCrowdCountValue\(result\?\.crowdCount\)/)
  assert.match(resultHandler, /entry\.crowdCount = normalizedCount/)
  assert.match(resultHandler, /entry\.automationStatus = 'success'/)
  assert.match(normalModeVue, /function normalizeCrowdCountValue\(value\)[\s\S]*?'<2000'/)
  assert.match(normalModeVue, /crowdCount: entry\.countReady === true \? normalizeCrowdCountValue\(entry\.crowdCount\) : null/)
  assert.match(normalModeVue, /countObtainedAt: entry\.countReady === true \? \(entry\.countCompletedAt \|\| null\) : null/)
  assert.match(normalModeVue, /parameters: JSON\.stringify\(entry\.generatedJson \|\| \{\}\)/)
  assert.doesNotMatch(normalModeVue, /parameters: JSON\.stringify\(entry\.generatedJson \|\| \{\}, null, 2\)/)
  assert.match(normalModeVue, /function formatCrowdCount\(value\)[\s\S]*?normalized === '<2000'/)
  assert.match(normalModeVue, /if \(!batchEntries\.value\.length \|\| batchExporting\.value\) return/)
  assert.match(normalModeVue, /:loading="batchExporting"/)
  assert.match(normalModeVue, /:disabled="!batchTaskCanExport \|\| batchExporting"/)
  assert.match(normalModeVue, /v-if="!batchMode"[\s\S]*?>取消<\/el-button>/)
  assert.doesNotMatch(normalModeVue, /batchMode \? '关闭' : '取消'/)
  assert.match(normalModeVue, /popper-class="batch-task-status-tooltip"/)
  assert.match(globalCss, /\.batch-task-status-tooltip/)
  assert.match(globalCss, /\.automation-dialog-footer \{[^}]*justify-content: flex-end;/s)
})
