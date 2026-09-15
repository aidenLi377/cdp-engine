import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const dynamicFormVue = readFileSync(join(currentDir, 'DynamicForm.vue'), 'utf8')
const customFieldDialogVue = readFileSync(join(currentDir, 'CustomFieldEditDialog.vue'), 'utf8')
const globalCss = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('folder combinations are offered only when at least two published solutions exist', () => {
  assert.match(normalModeVue, /@batch-apply="openBatchPreviewForFolder"/)
  assert.match(normalModeVue, /function openBatchPreview\(\)/)
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
  assert.match(normalModeVue, /function resetWorkbenchContext\(\)[\s\S]*?resetBatchContext\(\)[\s\S]*?workbenchMode\.value = 'free-build'/)
})

test('batch workbench switches package detail by configured crowd name', () => {
  assert.match(normalModeVue, /class="batch-compact-tabs"/)
  assert.match(normalModeVue, /class="batch-compact-tab"/)
  assert.match(normalModeVue, /entry\.crowdName \|\| '未命名人群包'/)
  assert.match(normalModeVue, /@click="activateBatchEntry\(entryIndex\)"/)
  assert.match(normalModeVue, /currentSolution\.value = nextEntry\.record/)
  assert.match(normalModeVue, /nodeList\.value = nextEntry\.nodes/)
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

test('copy dialog chooses a source while batch automation directly lists a default-selected queue', () => {
  assert.match(normalModeVue, /选择要复制的人群包参数/)
  assert.match(normalModeVue, /v-model="batchCopyIndex"/)
  assert.doesNotMatch(normalModeVue, /仅圈当前人群包/)
  assert.doesNotMatch(normalModeVue, /圈完全部人群包/)
  assert.match(normalModeVue, /确认要圈的人群包/)
  assert.match(normalModeVue, /已默认全部选中/)
  assert.match(normalModeVue, /batchAutomationSelectedIndexes/)
  assert.match(normalModeVue, /toggleBatchAutomationEntry/)
  assert.match(normalModeVue, /for \(const index of targetIndexes\)/)
  assert.match(normalModeVue, /await sendMessageToDatabankExtension\(getGeneratedJsonText\(\)\)/)
  assert.match(normalModeVue, /class="automation-calculate-toggle"/)
  assert.match(normalModeVue, /:aria-pressed="databankAutoCalculate"/)
  assert.match(normalModeVue, /是否需要自动计算人数/)
  assert.match(normalModeVue, /autoCalculate: autoCalculate === true/)
  assert.match(normalModeVue, /AUTO_CALCULATE_EXTENSION_VERSION = '2\.2\.2'/)
  assert.match(normalModeVue, /payload\.autoCalculated !== true/)
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
  assert.match(normalModeVue, /syncCustomFieldValue\(nodes, customFieldId, customFields, cloneValue\(row\.values\)\)/)
  assert.match(normalModeVue, /parameterBatchValues: cloneValue\(row\.values\)/)
  assert.match(normalModeVue, /batchKind\.value = 'parameter'/)
  assert.match(normalModeVue, /await activateBatchEntry\(0, \{ skipPersist: true \}\)/)
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
  assert.match(normalModeVue, /成功结果会保留，恢复时只重新提交未完成的包/)
  assert.match(normalModeVue, /openBatchAutomationDialog\('failed'\)/)
  assert.match(normalModeVue, /entry\.automationStatus === 'failed'/)
  assert.match(normalModeVue, /startBatchAutomationFlow\('failed'\)/)
  assert.match(normalModeVue, /可仅重试失败任务/)
})

test('a running package restored after interruption is converted into an actionable failed item', () => {
  assert.match(normalModeVue, /const wasInterrupted = entry\?\.automationStatus === 'running'/)
  assert.match(normalModeVue, /automationStatus: wasInterrupted \? 'failed'/)
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
