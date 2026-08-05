import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const appVue = readFileSync(join(currentDir, '..', 'App.vue'), 'utf8')
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const solutionCenterVue = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const taskCenterVue = readFileSync(join(currentDir, 'TaskCenter.vue'), 'utf8')

test('top-level modules keep live instances and restore an account-scoped module choice', () => {
  assert.match(appVue, /<KeepAlive>[\s\S]*?<NormalMode[\s\S]*?<SolutionCenter[\s\S]*?<TaskCenter/s)
  assert.match(appVue, /readSessionWorkspace\(APP_MODE_SESSION_KEY, user\?\.id\)/)
  assert.match(appVue, /writeSessionWorkspace\(APP_MODE_SESSION_KEY, currentUser\.value\.id/)
  assert.match(appVue, /clearSessionWorkspace\(\)/)
})

test('workbench snapshot is versioned, account-scoped, and restored through node hydration', () => {
  assert.match(normalModeVue, /const WORKBENCH_SESSION_VERSION = 1/)
  assert.match(normalModeVue, /writeSessionWorkspace\([\s\S]*?WORKBENCH_SESSION_KEY[\s\S]*?props\.sessionOwnerId/s)
  assert.match(normalModeVue, /async function restoreWorkbenchSession\(\)[\s\S]*?hydrateNodes/s)
  assert.match(normalModeVue, /window\.addEventListener\('beforeunload', persistWorkbenchSession\)/)
})

test('copy and publish run integrity checks before side effects', () => {
  const copyStart = normalModeVue.indexOf('async function copyJson')
  const copyValidation = normalModeVue.indexOf("ensureGeneratedOutputReady('复制')", copyStart)
  const clipboardWrite = normalModeVue.indexOf('navigator.clipboard.writeText', copyStart)
  assert.ok(copyValidation > copyStart && clipboardWrite > copyValidation)

  const publishStart = solutionCenterVue.indexOf('async function publishDraft')
  const validation = solutionCenterVue.indexOf('validateSolutionIntegrity', publishStart)
  const confirmation = solutionCenterVue.indexOf('ElMessageBox.confirm', validation)
  const publishRequest = solutionCenterVue.indexOf('publishSolution(activeSolution.value.id)', confirmation)
  assert.ok(validation > publishStart && confirmation > validation && publishRequest > confirmation)
})

test('automation checks generation service readiness without enforcing parameter completeness', () => {
  const batchAutomation = normalModeVue.match(
    /async function startBatchAutomationFlow[\s\S]*?\n\}/,
  )?.[0]
  const singleAutomation = normalModeVue.match(
    /async function startAutoDataBankFlow[\s\S]*?\n\}/,
  )?.[0]

  assert.ok(batchAutomation, 'batch automation flow should exist')
  assert.ok(singleAutomation, 'single automation flow should exist')
  assert.match(batchAutomation, /ensureGeneratedOutputReady/)
  assert.match(singleAutomation, /await buildFinalJson\(\)[\s\S]*?ensureGeneratedOutputReady/)
  assert.match(batchAutomation, /sendMessageToDatabankExtension\(getGeneratedJsonText\(\)\)/)
  assert.match(singleAutomation, /sendMessageToDatabankExtension\(getGeneratedJsonText\(\)\)/)
})

test('task center exposes local installation and manual redetection while preserving connection protocol', () => {
  assert.match(taskCenterVue, />\{\{ installingExtension \? '下载中…' : '安装扩展' \}\}<\/button>/)
  assert.match(taskCenterVue, />\{\{ extensionCheckBusy \? '检测中…' : '重新检测' \}\}<\/button>/)
  assert.match(taskCenterVue, /fetchWithTimeout\('\/api\/extension\/download'/)
  assert.match(taskCenterVue, /type: 'CDP_AUTOMATE_DATABANK'/)
})
