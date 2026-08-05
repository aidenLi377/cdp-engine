import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const dynamicFormVue = readFileSync(join(currentDir, 'DynamicForm.vue'), 'utf8')

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
  assert.match(normalModeVue, /适用于 \{\{ section\.entryCount \|\| 0 \}\}/)
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
