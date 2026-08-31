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

test('copy and automation dialogs require a package scope choice', () => {
  assert.match(normalModeVue, /选择要复制的人群包参数/)
  assert.match(normalModeVue, /v-model="batchCopyIndex"/)
  assert.match(normalModeVue, /仅圈当前人群包/)
  assert.match(normalModeVue, /圈完全部人群包/)
  assert.match(normalModeVue, /for \(const index of targetIndexes\)/)
  assert.match(normalModeVue, /await sendMessageToDatabankExtension\(getGeneratedJsonText\(\)\)/)
})

test('parameter batch entry is limited to a single solution session', () => {
  assert.match(normalModeVue, /function canBatchParameterSection\(section\)/)
  assert.match(normalModeVue, /workbenchMode\.value === 'solution-use'/)
  assert.match(normalModeVue, /&& !batchMode\.value/)
  assert.match(normalModeVue, /:show-batch-action="canBatchParameterSection\(editingCfSection\)"/)
  assert.match(normalModeVue, /@batch="openParameterBatchFromEditor"/)
  assert.doesNotMatch(normalModeVue, /class="cf-parameter-batch-trigger"/)
  assert.match(customFieldDialogVue, /class="cf-edit-batch-action"/)
  assert.match(customFieldDialogVue, /Excel 批量/)
  assert.match(normalModeVue, /批量参数只能从正在使用的单个方案中创建/)
})

test('parameter batch dialog keeps its actions visible while rows scroll', () => {
  assert.match(globalCss, /\.parameter-batch-dialog\.el-dialog \{[^}]*display: flex;[^}]*flex-direction: column;/s)
  assert.match(globalCss, /\.parameter-batch-dialog \.el-dialog__body \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow-y: auto;/s)
  assert.match(globalCss, /\.parameter-batch-dialog \.el-dialog__footer \{[^}]*flex: 0 0 auto;[^}]*background: #fff;/s)
})

test('Excel parameter rows become independent entries on the same solution', () => {
  assert.match(normalModeVue, /buildParameterBatchRows/)
  assert.match(normalModeVue, /每一行生成 1 个人群包/)
  assert.match(normalModeVue, /syncCustomFieldValue\(nodes, customFieldId, customFields, cloneValue\(row\.values\)\)/)
  assert.match(normalModeVue, /parameterBatchValues: cloneValue\(row\.values\)/)
  assert.match(normalModeVue, /batchKind\.value = 'parameter'/)
  assert.match(normalModeVue, /await activateBatchEntry\(0, \{ skipPersist: true \}\)/)
})

test('the row-specific parameter cannot be overwritten by shared batch edits', () => {
  assert.match(normalModeVue, /function isParameterBatchSection\(section\)/)
  assert.match(normalModeVue, /该参数由 Excel 行独立控制/)
  assert.match(normalModeVue, /是本次按行拆分的参数，不能同步覆盖/)
  assert.match(normalModeVue, /其余参数修改一次，同步写入/)
})
