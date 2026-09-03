import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./TaskCenter.vue', import.meta.url), 'utf8')
const batchPopoverSource = fs.readFileSync(new URL('./TaskBatchPopover.vue', import.meta.url), 'utf8')
const comparisonSource = fs.readFileSync(new URL('./DmpComparisonWorkspace.vue', import.meta.url), 'utf8')
const tutorialOverlaySource = fs.readFileSync(new URL('./GuidedTutorialOverlay.vue', import.meta.url), 'utf8')
const globalStyles = fs.readFileSync(new URL('../styles/cdp-global.css', import.meta.url), 'utf8')

test('task center synchronizes shared DMP settings through the extension', () => {
  assert.match(source, /CDP_DMP_GET_SETTINGS/)
  assert.match(source, /CDP_DMP_UPDATE_SETTINGS/)
  assert.match(source, /loadDmpSettings/)
  assert.match(source, /saveDmpSettings/)
})

test('task center exposes field visibility and per-tag Rebase controls', () => {
  assert.match(source, />显示字段</)
  assert.match(source, />Rebase</)
  assert.match(source, /rebaseExcludedTagIds/)
  assert.match(source, /DMP_RESULT_COLUMNS/)
})

test('comparison metric exposes the Rebase crowd-share display label', () => {
  assert.match(comparisonSource, /metric === 'Rebase' \? 'Rebase 人群占比' : metric/)
})

test('task center enables only ready multi-condition tags with plain status copy', () => {
  assert.match(source, /isConditionalTagReady/)
  assert.match(source, /已就绪/)
  assert.match(source, /\? '已就绪' : '需配置'/)
  assert.doesNotMatch(source, /✅|⚙️/)
  assert.doesNotMatch(source, /:disabled="tag\.needCondition"/)
})

test('DMP flow continues from search matching into portrait extraction', () => {
  const start = source.indexOf('async function executeDmp')
  const end = source.indexOf('async function executeViaExtension', start)
  const dmpFlow = source.slice(start, end)
  const crowdIdCheckAt = dmpFlow.indexOf('!phase1.crowdId')
  const portraitWaitAt = dmpFlow.indexOf('CDP_AUTOMATE_DMP_WAIT_PORTRAIT')
  const extractAt = dmpFlow.indexOf('CDP_AUTOMATE_DMP_EXTRACT')

  assert.ok(crowdIdCheckAt >= 0)
  assert.ok(portraitWaitAt > crowdIdCheckAt)
  assert.ok(extractAt > portraitWaitAt)
  assert.doesNotMatch(dmpFlow, /searchOnly/)
})

test('DataBank flow supports explicit auto apply while preserving manual confirmation pages by default', () => {
  const start = source.indexOf('async function executeDatabank')
  const end = source.indexOf('async function executeDmp', start)
  const databankFlow = source.slice(start, end)

  assert.match(databankFlow, /sendToExtension\('CDP_AUTOMATE_DATABANK_CROWD'/)
  assert.match(databankFlow, /confirm_dialog_found/)
  assert.match(databankFlow, /auto_apply_submitted/)
  assert.match(databankFlow, /autoApply/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_WAIT_APPLY/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_DATAHUB/)
  assert.match(source, /const databankAutoApply = ref\(false\)/)
  assert.match(source, /确认页面已保留，批量完成后请逐个点击“应用”/)
  assert.match(source, /已自动点击“应用”，推送已提交至达摩盘/)
})

test('task center keeps single run actions and adds batch paste entry points', () => {
  assert.match(source, /@click="runDatabank\(\)">运行<\/el-button>/)
  assert.match(source, /@click="runDmp\(\)">运行<\/el-button>/)
  assert.match(source, /<TaskBatchPopover/)
  assert.match(source, /@run="runBatchDraft\('databank', \$event\)"/)
  assert.match(source, /@run="runBatchDraft\('dmp', \$event\)"/)
  assert.match(source, /parseCrowdBatch/)
  assert.doesNotMatch(source, /目前检测到 \$\{count\} 个人群包，是否批量执行/)
  assert.match(source, /keepRunning: true/)
  assert.match(source, /BATCH_EXECUTION_GAP_MS/)
  assert.match(source, /输入人群包名称并点击运行，任务进度将在此处实时展示。/)
  assert.doesNotMatch(source, /@click="run(?:Databank|Dmp)">测试<\/el-button>/)
})

test('task center requires the fixed extension patch version', () => {
  assert.match(source, /const EXPECTED_EXTENSION_VERSION = '2\.2\.1'/)
  assert.match(source, /for \(let index = 1; index < 3; index \+= 1\)/)
  assert.match(source, /actual\[index\] < expected\[index\]/)
})

test('run buttons use task-specific prerequisites and explain missing DMP tags on click', () => {
  const databankRule = source.match(/const canRunDatabank = computed\([^\r\n]+/)?.[0]
  const dmpRule = source.match(/const canRunDmp = computed\([^\r\n]+/)?.[0]
  const runDmp = source.match(/async function runDmp\([^)]*\) \{[\s\S]*?\n\}/)?.[0]

  assert.ok(databankRule)
  assert.ok(dmpRule)
  assert.ok(runDmp)
  assert.doesNotMatch(databankRule, /selectedTags/)
  assert.doesNotMatch(dmpRule, /selectedTags/)
  assert.match(runDmp, /selectedTags\.value\.length === 0/)
  assert.match(runDmp, /请先在特征大盘中选择至少一个已就绪的标签/)
})

test('batch execution has no frontend item cap and keeps one history record per crowd package', () => {
  assert.doesNotMatch(source, /MAX_BATCH|batchLimit|批量上限/)
  assert.doesNotMatch(source, /taskHistory\.value\.length > 50/)
  assert.match(source, /taskHistory\.value\.unshift/)
  assert.match(source, /失败 \$\{failed\} 个/)
})

test('terminal task results are confirmed by the server before success is shown', () => {
  const start = source.indexOf('async function executeViaExtension')
  const end = source.indexOf('async function cancelTask', start)
  const execution = source.slice(start, end)
  const saveAt = execution.indexOf('await saveTerminalTask')
  const completedAt = execution.indexOf("status: 'completed'", saveAt)

  assert.match(source, /createTaskProgressPersistence/)
  assert.match(source, /enqueueProgressUpdate\(activeTask\.value\.id/)
  assert.match(source, /createBackendTaskWithRetry/)
  assert.ok(saveAt >= 0)
  assert.ok(completedAt > saveAt)
  assert.match(execution, /结果仍保留在当前页面，请先复制或导出后再重试/)
  assert.doesNotMatch(execution, /apiPut\(`\$\{API\}\/\$\{backendTask\.id\}\/progress`[\s\S]*?\.catch\(\(\) => \{\}\)/)
  assert.match(source, /outcome\.task\?\.persistenceFailed/)
  assert.match(source, /批量执行已暂停：当前人群包采集完成，但服务器未确认保存/)
  assert.match(comparisonSource, /v-if="hasResults\(entry\.task\)"/)
  assert.match(comparisonSource, /task\?\.status === 'completed' && task\?\.type === 'dmp' && hasResults\(task\)/)
})

test('task termination waits for extension acknowledgement and isolates stale runs', () => {
  assert.match(source, /createRunContext/)
  assert.match(source, /new AbortController\(\)/)
  assert.match(source, /runId: run\.id/)
  assert.match(source, /sendToExtension\('CDP_CANCEL_TASK'/)
  assert.match(source, /extensionResult\?\.cancelled/)
  assert.match(source, /status: 'cancelled'/)
  assert.match(source, /activeTask\.value\?\.runId === run\.id/)
  assert.match(source, /当前任务已终止，后续队列不会继续执行/)
  assert.doesNotMatch(source, /crowdName: '__CANCEL__'/)
})

test('DataBank and DMP launch groups stay compact while batch editing moves to a temporary popover', () => {
  assert.match(source, /\.tc-test-col\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s)
  assert.match(source, /\.tc-input-sm :deep\(\.el-input__wrapper\)\s*\{[^}]*background:\s*#fff;[^}]*border:\s*0;/s)
  assert.doesNotMatch(source, /class="tc-batch-panel"|class="tc-batch-textarea"|class="tc-batch-chips"/)
  assert.match(batchPopoverSource, /placement="right-start"/)
  assert.match(batchPopoverSource, /popper-class="tc-batch-popover-shell"/)
  assert.match(batchPopoverSource, /trigger="click"/)
  assert.match(batchPopoverSource, /class="tc-batch-composer__textarea"/)
  assert.match(batchPopoverSource, /每行一个，也支持逗号和 Tab/)
  assert.match(batchPopoverSource, /`运行 \$\{draftBatch\.items\.length\} 个`/)
  assert.doesNotMatch(batchPopoverSource, /tc-batch-chip|v-for="name/)
  assert.match(globalStyles, /#app \.tc-test-col,[\s\S]*?#app \.tc-tags-card\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*0\s*!important;/)
  assert.match(globalStyles, /#app \.tc-input-sm \.el-input__wrapper,[\s\S]*?#app \.tc-tags-search-input:focus\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*0\s*!important;/)
})

test('batch popover keeps persistent drafts and starts a batch in one action', () => {
  assert.match(source, /const databankBatchDraft = ref\(/)
  assert.match(source, /const dmpBatchDraft = ref\(/)
  assert.match(source, /databankBatchDraft: databankBatchDraft\.value/)
  assert.match(source, /dmpBatchDraft: dmpBatchDraft\.value/)
  assert.match(source, /function prepareBatchRun\(type, text\)/)
  assert.match(source, /databankBatchText\.value = text[\s\S]*?databankBatchMode\.value = true/)
  assert.match(source, /dmpBatchText\.value = text[\s\S]*?dmpBatchMode\.value = true/)
  assert.match(source, /async function runBatchDraft\(type, text\)/)
  assert.match(source, /await runDatabank\(\)/)
  assert.match(source, /await runDmp\(\)/)
  assert.match(source, /finally \{[\s\S]*?databankBatchMode\.value = false[\s\S]*?dmpBatchMode\.value = false/)
  assert.match(batchPopoverSource, /emit\('update:modelValue', value\)/)
  assert.match(batchPopoverSource, /emit\('run', props\.modelValue\.trim\(\)\)/)
  assert.doesNotMatch(batchPopoverSource, /确认名单|切换为单个/)
  assert.match(batchPopoverSource, /自动应用|runHint/)
})

test('task center uses compact section markers and focus-only input underlines', () => {
  assert.match(source, /class="tc-section-heading"[\s\S]*?class="tc-section-marker"[\s\S]*?任务执行/)
  assert.match(source, /\.tc-control-panel\s*\{[^}]*border-right:\s*1px solid var\(--ui-divider\);/s)
  assert.match(source, /\.tc-section-marker\s*\{[^}]*width:\s*2px;[^}]*height:\s*13px;[^}]*background:\s*#1d1d1f;/s)
  assert.match(source, /\.tc-dmp-tools-label::before\s*\{[^}]*height:\s*13px;[^}]*background:\s*#1d1d1f;/s)
  assert.match(source, /\.tc-tags-title::before\s*\{[^}]*height:\s*13px;[^}]*background:\s*#1d1d1f;/s)
  assert.match(source, /\.tc-ext-status\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s)
  assert.match(source, /\.tc-input-sm :deep\(\.el-input__wrapper\.is-focus\)\s*\{[^}]*box-shadow:\s*inset 0 -1px 0 #1d1d1f !important;/s)
  assert.match(source, /\.tc-tags-search-input:focus\s*\{[^}]*box-shadow:\s*inset 0 -1px 0 #1d1d1f;/s)
  assert.match(globalStyles, /#app \.tc-control-panel\s*\{[^}]*border-right:\s*1px solid var\(--ui-divider\) !important;/s)
  assert.match(globalStyles, /#app \.tc-input-sm \.el-input__wrapper\.is-focus,[\s\S]*?#app \.tc-tags-search-input:focus\s*\{[^}]*box-shadow:\s*inset 0 -1px 0 #1d1d1f !important;/s)
})

test('task execution and left-aligned DMP settings are separated by a quiet fading hairline', () => {
  assert.match(source, /\.tc-test-row\s*\{[^}]*position:\s*relative;[^}]*padding:\s*0 0 18px 9px;/s)
  assert.match(source, /\.tc-test-row::after\s*\{[^}]*height:\s*1px;[^}]*linear-gradient\(90deg, rgba\(29,29,31,0\.16\), rgba\(29,29,31,0\.04\) 72%, transparent\)/s)
  assert.match(source, /\.tc-dmp-tools\s*\{[^}]*justify-content:\s*flex-start;[^}]*padding:\s*0 1px;/s)
  assert.match(source, /\.tc-dmp-tools-label\s*\{[^}]*margin-right:\s*2px;/s)
})

test('DMP settings use small rectangular black and white buttons', () => {
  assert.match(source, /\.tc-settings-btn\s*\{[^}]*min-width:\s*48px;[^}]*height:\s*24px;[^}]*border:\s*1px solid #1d1d1f;[^}]*border-radius:\s*3px;/s)
  assert.match(source, /\.tc-settings-btn:hover:not\(:disabled\)\s*\{[^}]*color:\s*#fff;[^}]*background:\s*#1d1d1f;/s)
  assert.match(globalStyles, /#app \.tc-settings-btn\s*\{[^}]*height:\s*24px !important;[^}]*border:\s*1px solid #1d1d1f !important;[^}]*border-radius:\s*3px !important;/s)
  assert.match(globalStyles, /#app \.tc-settings-btn:hover:not\(:disabled\)\s*\{[^}]*color:\s*#ffffff !important;[^}]*background:\s*#1d1d1f !important;/s)
})

test('task center centers every native and Element Plus button and keeps disabled surfaces white', () => {
  assert.match(
    source,
    /\.task-center-page button,\s*\.task-center-page \.el-button\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*line-height:\s*1;/s,
  )

  assert.match(
    source,
    /\.task-center-page button:disabled,\s*\.task-center-page \.el-button\.is-disabled\s*\{[^}]*background:\s*var\(--ui-surface\)\s*!important;[^}]*color:\s*var\(--ui-text-secondary\)\s*!important;[^}]*border:\s*1px solid var\(--ui-control-border\)\s*!important;[^}]*opacity:\s*1;/s,
  )
})

test('task center mirrors the plugin tag tree and two-column checkbox layout', () => {
  assert.match(source, /tc-tag-main-header[^>]*>\{\{ group\.mainCategory \}\}/)
  assert.doesNotMatch(source, /🎛️|📂/)
  assert.match(source, /v-for="category in group\.categories"/)
  assert.match(source, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(source, /class="tc-tag-checkbox"/)
  assert.doesNotMatch(source, /class="tc-tag-check"/)
})

test('DMP tutorial highlights each required tag row with the displayed name', () => {
  assert.match(source, /data-tutorial-target=.*dmp-tag-\$\{tag\.tagId\}/)
  assert.match(source, /DMP_TUTORIAL_TAG_IDS\.includes\(String\(tag\.tagId\)\)/)
  assert.match(comparisonSource, /Rebase 人群占比/)
})

test('tutorial recovers when a temporary operation surface is dismissed', () => {
  assert.match(tutorialOverlaySource, /targetRecoveryStepMap/)
  assert.match(tutorialOverlaySource, /'confirm-dmp-batch': 'open-dmp-batch'/)
  assert.match(tutorialOverlaySource, /'confirm-split': 'add-product-ids'/)
  assert.match(tutorialOverlaySource, /'sort-label-order': 'open-label-order'/)
  assert.match(tutorialOverlaySource, /重新点击「批量」打开名单/)
})

test('task center stabilizes tag requests and results using dictionary order', () => {
  assert.match(source, /orderTagIdsByDictionary/)
  assert.match(source, /orderResultRowsByDictionary/)
  assert.match(source, /selectedTags:\s*orderedSelectedTagIds\.value/)
  assert.match(source, /tagIds:\s*orderedSelectedTagIds\.value/)
})

test('perspective table header visually matches the plugin while masking scrolled rows', () => {
  assert.match(
    source,
    /\.tc-results-table thead\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*4;/s,
  )
  assert.match(
    source,
    /\.tc-results-table th\s*\{[^}]*background:\s*var\(--ui-surface, #fff\);[^}]*background-clip:\s*padding-box;[^}]*color:\s*#333333;/s,
  )
})

test('history result omits the redundant metadata row', () => {
  assert.doesNotMatch(source, /class="tc-history-meta-bar"/)
})

test('task history removes the large outer frame but keeps item boundaries', () => {
  assert.match(source, /\.tc-history-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-radius:\s*0;/s)
  assert.match(source, /\.tc-history-item\s*\{[^}]*border:\s*1px solid/s)
  assert.match(globalStyles, /#app \.tc-history-card,[\s\S]*?#app \.tc-history-card\.expanded\s*\{[^}]*background:\s*transparent !important;[^}]*border:\s*0 !important;[^}]*border-radius:\s*0 !important;/s)
})

test('feature panel uses borderless black and white hierarchy', () => {
  assert.match(
    source,
    /\.tc-tags-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  )
  assert.match(
    source,
    /\.tc-tag-main-header\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
  )
  assert.match(
    source,
    /\.tc-tag-checkbox\s*\{[^}]*accent-color:\s*#171717;/s,
  )
})

test('completed DMP feedback is a dismissible four-second status toast', () => {
  assert.match(source, /const COMPLETION_TOAST_DURATION_MS = 4000/)
  assert.match(source, /class="tc-completion-toast"/)
  assert.match(source, /role="status"/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /@mouseenter="pauseCompletionToast\('hover'\)"/)
  assert.match(source, /@mouseleave="resumeCompletionToast\('hover'\)"/)
  assert.match(source, /aria-label="关闭成功提示"/)
  assert.match(source, /completionToastTimer = setTimeout\(closeCompletionToast, completionToastRemaining\)/)
})

test('comparison workspace keeps identity fields fixed and only exposes optional metrics', () => {
  assert.match(comparisonSource, />\s*标签名称\s*</)
  assert.match(comparisonSource, />\s*特征明细\s*</)
  assert.match(comparisonSource, /v-for="metric in DMP_COMPARISON_METRICS"/)
  assert.match(comparisonSource, /comparisonToTsv/)
  assert.match(comparisonSource, /comparisonToCsv/)
  assert.doesNotMatch(comparisonSource, /所属大类|标签类型/)
})

test('comparison selection is ordered, accessible, and strictly revalidated after restore', () => {
  assert.match(comparisonSource, /class="dc-selector"/)
  assert.match(comparisonSource, /:aria-pressed="selectedOrder\(entry\.key\) > 0"/)
  assert.match(comparisonSource, /标签名称或标签数量与基准人群包不一致/)
  assert.match(comparisonSource, /draggable="true"/)
  assert.match(source, /function reconcileComparisonSelection\(\)/)
  assert.match(source, /compareTagNameStructures\(baselineTask\.results, task\.results\)\.compatible/)
})

test('comparison history rail can collapse to release table width and restores per session', () => {
  assert.match(comparisonSource, /class="dc-history-toggle"/)
  assert.match(comparisonSource, /:aria-expanded="!historyCollapsed"/)
  assert.match(comparisonSource, /aria-controls="dmp-task-history"/)
  assert.match(comparisonSource, /'update:historyCollapsed'/)
  assert.match(comparisonSource, /\.dc-workspace\.history-collapsed\s*\{[^}]*grid-template-columns:\s*0 minmax\(0, 1fr\);/s)
  assert.match(source, /v-model:history-collapsed="comparisonHistoryCollapsed"/)
  assert.match(source, /const comparisonHistoryCollapsed = ref\(taskSessionState\.comparisonHistoryCollapsed === true\)/)
  assert.match(source, /comparisonHistoryCollapsed: comparisonHistoryCollapsed\.value/)
})

test('history selection reopens the comparison rail and history view has no instruction panel', () => {
  assert.match(source, /@request-comparison="openComparisonFromHistory"/)
  assert.match(source, /function openComparisonFromHistory\(\) \{[\s\S]*?comparisonHistoryCollapsed\.value = false[\s\S]*?monitorView\.value = 'comparison'/)
  assert.match(comparisonSource, /\.dc-workspace\.is-history\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s)
  assert.match(comparisonSource, /\.dc-workspace\.is-history \.dc-history-rail\s*\{[^}]*border-right:\s*0;/s)
  assert.doesNotMatch(comparisonSource, /dc-history-guide|从任务记录开始|圈选后会自动进入横向对比/)
})

test('full-width history uses structured columns while preserving compact comparison controls', () => {
  assert.match(comparisonSource, /class="dc-history-columns"[\s\S]*?>人群包<[\s\S]*?>采集时间<[\s\S]*?>数据量<[\s\S]*?>状态<[\s\S]*?>横向对比</)
  assert.match(comparisonSource, /v-if="mode === 'history'" class="dc-history-time"/)
  assert.match(comparisonSource, /v-if="mode === 'history'" class="dc-history-size"/)
  assert.match(comparisonSource, /\.dc-history-columns,\s*\.dc-workspace\.is-history \.dc-history-row\s*\{[^}]*grid-template-columns:[^}]*minmax\(280px, 1\.6fr\)[^}]*minmax\(96px, 0\.55fr\)[^}]*minmax\(72px, 0\.4fr\)[^}]*minmax\(84px, 0\.45fr\)[^}]*minmax\(96px, 0\.5fr\)[^}]*28px;/s)
  assert.match(comparisonSource, /\.dc-history-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto 30px 24px;/s)
  assert.match(comparisonSource, /\.dc-workspace\.is-history \.dc-history-copy > span\s*\{\s*display:\s*none;/s)
  assert.match(comparisonSource, /class="dc-selector"[\s\S]*?class="dc-delete"/)
})

test('label ordering uses a compact six-dot field affordance and a grouped-order drawer', () => {
  assert.match(comparisonSource, /class="dc-fixed-field dc-label-field"/)
  assert.match(comparisonSource, /class="dc-label-order-trigger"/)
  assert.match(comparisonSource, /aria-label="调整标签顺序"/)
  assert.match(comparisonSource, /id="dmp-label-order-panel"/)
  assert.match(comparisonSource, /data-tutorial-target="dmp-label-order-apply"/)
  assert.match(comparisonSource, /dc-drag-demo--label/)
  assert.match(comparisonSource, /dc-drag-demo--audience/)
  assert.match(comparisonSource, />调整标签顺序</)
  assert.match(comparisonSource, /拖动整组标签，统一调整表格、复制与导出顺序/)
  assert.doesNotMatch(comparisonSource, />标签排序</)
})

test('选择指标后教程会高亮结果表格供用户查看', () => {
  assert.match(comparisonSource, /data-tutorial-target="dmp-comparison-table"/)
  assert.match(tutorialOverlaySource, /inspect-comparison-table/)
})

test('教程在标签调整完成后把高亮切换到应用排序', () => {
  assert.match(tutorialOverlaySource, /labelOrderReadyForApply/)
  assert.match(tutorialOverlaySource, /dmp-label-order-apply/)
  assert.match(comparisonSource, /syncGuidedTutorialDraftLabelOrder/)
  assert.match(comparisonSource, /prepareTutorialLabelOrder/)
  assert.match(comparisonSource, /labelOrderAutoMoved: true/)
})

test('applied label order persists by structure and drives copy and export', () => {
  assert.match(source, /v-model:label-orders="comparisonLabelOrders"/)
  assert.match(source, /const comparisonLabelOrders = ref\(/)
  assert.match(source, /comparisonLabelOrders: Object\.fromEntries/)
  assert.match(comparisonSource, /buildLabelStructureFingerprint/)
  assert.match(comparisonSource, /props\.labelOrders\?\.\[labelStructureFingerprint\.value\]/)
  assert.match(comparisonSource, /emit\('update:labelOrders', nextOrders\)/)
  assert.match(comparisonSource, /comparisonToTsv\(appliedComparisonMatrix\.value\)/)
  assert.match(comparisonSource, /comparisonToCsv\(appliedComparisonMatrix\.value\)/)
})
