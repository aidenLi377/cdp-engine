import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./TaskCenter.vue', import.meta.url), 'utf8')

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

test('task center enables only ready multi-condition tags and explains both states', () => {
  assert.match(source, /isConditionalTagReady/)
  assert.match(source, /已就绪/)
  assert.match(source, /待配置/)
  assert.doesNotMatch(source, /:disabled="tag\.needCondition"/)
})

test('DataBank flow stops after opening the manual confirmation dialog', () => {
  const start = source.indexOf('async function executeDatabank')
  const end = source.indexOf('async function executeDmp', start)
  const databankFlow = source.slice(start, end)

  assert.match(databankFlow, /sendToExtension\('CDP_AUTOMATE_DATABANK_CROWD'/)
  assert.match(databankFlow, /confirm_dialog_found/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_WAIT_APPLY/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_DATAHUB/)
  assert.match(source, /自动流程已完成/)
  assert.match(source, /确认弹窗已打开，请前往 DataBank 页面人工点击“应用”/)
})

test('task center uses run copy for both idle actions without changing handlers', () => {
  assert.match(source, /@click="runDatabank">运行<\/el-button>/)
  assert.match(source, /@click="runDmp">运行<\/el-button>/)
  assert.match(source, /输入人群包名称并点击运行，任务进度将在此处实时展示。/)
  assert.doesNotMatch(source, /@click="run(?:Databank|Dmp)">测试<\/el-button>/)
})
