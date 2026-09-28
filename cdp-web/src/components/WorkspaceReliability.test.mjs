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
  assert.match(normalModeVue, /window\.addEventListener\('beforeunload', handleWorkbenchBeforeUnload\)/)
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
  assert.match(batchAutomation, /(?:const|let) jsonText = (?:rewriteBatchInternalDependencyNames\(entry, )?getGeneratedJsonText\(\)\)?[\s\S]*?sendDatabankRealtimeCount\(jsonText/)
  assert.match(batchAutomation, /sendDatabankDirectCreateWithReconciliation\(\s*jsonText/)
  assert.match(singleAutomation, /const jsonText = getGeneratedJsonText\(\)/)
  assert.match(singleAutomation, /sendDatabankRealtimeCount\(jsonText, crowdName, run\.id, \{ precheckedNoMatch: true \}\)/)
  assert.match(singleAutomation, /sendDatabankDirectCreateWithReconciliation\(\s*jsonText,\s*crowdName,\s*run\.id,\s*\{ precheckedNoMatch: true \}/)
  assert.doesNotMatch(singleAutomation, /sendMessageToDatabankExtension\(/)
})

test('task center exposes local installation and manual redetection while preserving connection protocol', () => {
  assert.match(taskCenterVue, />\{\{ installingExtension \? '下载中…' : '安装扩展' \}\}<\/button>/)
  assert.match(taskCenterVue, />\{\{ extensionCheckBusy \? '检测中…' : '重新检测' \}\}<\/button>/)
  assert.match(taskCenterVue, /fetchWithTimeout\('\/api\/extension\/download'/)
  assert.match(taskCenterVue, /type: 'CDP_EXTENSION_PING'/)
})

test('group application prepares cached solution records while the preview is open', () => {
  const start = normalModeVue.indexOf('async function enterBatchMode')
  const end = normalModeVue.indexOf('async function createParameterBatchEntries', start)
  const groupApplyFlow = normalModeVue.slice(start, end)

  assert.match(normalModeVue, /void prepareBatchPreviewEntries\([\s\S]*?getBatchExecutionPreferenceKey\(folderId\)/)
  assert.match(normalModeVue, /function prepareBatchPreviewEntries\([\s\S]*?await preloadAllPackageMeta\(\)[\s\S]*?Promise\.all\(sourceSolutions\.map/)
  assert.match(groupApplyFlow, /await prepareBatchPreviewEntries\([\s\S]*?batchPreviewSolutions\.value/)
  assert.doesNotMatch(groupApplyFlow, /await getSolution\(item\.id\)/)
  assert.match(normalModeVue, /batchPreviewPreparationStatus === 'loading'[\s\S]*?正在预载方案组件/)
  assert.match(normalModeVue, /batchPreviewPreparationStatus === 'ready'[\s\S]*?方案组件已就绪/)
})

test('preloaded component metadata avoids a redundant config-version request during hydration', () => {
  const runtimeSource = readFileSync(join(currentDir, '..', 'composables', 'useSolutionRuntime.js'), 'utf8')
  const start = runtimeSource.indexOf('async function fetchPackageMeta')
  const end = runtimeSource.indexOf('async function createRuntimeNode', start)
  const fetchFlow = runtimeSource.slice(start, end)

  const cacheCheck = fetchFlow.indexOf('metaBundleLoadedKey === activeMetaVersionKey')
  const versionCheck = fetchFlow.indexOf('await ensureActiveMetaVersion()')
  assert.ok(cacheCheck >= 0 && cacheCheck < versionCheck)
  assert.match(runtimeSource, /async function preloadAllPackageMeta\(\) \{[\s\S]*?metaBundleLoadedKey === activeMetaVersionKey[\s\S]*?await ensureActiveMetaVersion\(\)/)
})

test('automation and polling have single owners and are cancelled when their view is left', () => {
  assert.match(normalModeVue, /singleAudienceCountPollers\.get\(taskId\) === poller/)
  assert.match(normalModeVue, /crowdCountPollers\.get\(key\) === poller/)
  assert.match(normalModeVue, /function cancelActiveAutomationSilently/)
  assert.match(normalModeVue, /onBeforeUnmount\(\(\) => \{[\s\S]*?cancelActiveAutomationSilently\(\)/)
  assert.match(taskCenterVue, /function cancelActiveRunSilently/)
  assert.match(taskCenterVue, /onBeforeUnmount\(\(\) => \{[\s\S]*?cancelActiveRunSilently\(\)/)
})
