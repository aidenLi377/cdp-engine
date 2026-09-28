import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const globalCss = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('batch automation exposes a compact scheduler without adding navigation', () => {
  assert.match(normalModeVue, /class="audience-schedule-trigger"/)
  assert.match(normalModeVue, /定时发起自动化圈人/)
  assert.match(normalModeVue, /audienceScheduleRepeat === option\.value/)
  assert.match(normalModeVue, /仅一次/)
  assert.match(normalModeVue, /每天/)
  assert.match(normalModeVue, /每周/)
  assert.match(globalCss, /\.audience-schedule-dialog\.el-dialog/)
  assert.doesNotMatch(normalModeVue, /定时任务导航|schedule-navigation/)
})

test('scheduled runs persist a self-contained batch snapshot and refresh the run date', () => {
  assert.match(normalModeVue, /snapshot: createScheduledBatchSnapshot\(selectedIndexes\)/)
  assert.match(normalModeVue, /loadAudienceSchedules\(props\.sessionOwnerId\)/)
  assert.match(normalModeVue, /hydrateNodes\(entry\?\.nodes \|\| \[\]\)/)
  assert.match(normalModeVue, /prepareBatchCrowdNamesForRun\(\{ force: true \}\)/)
  assert.match(normalModeVue, /startBatchAutomationFlow\('all', batchAutomationSelectedIndexes\.value\)/)
})

test('scheduler waits for existing automation and count polling instead of stealing the session', () => {
  assert.match(normalModeVue, /databankAutomating\.value[\s\S]*?batchWaitingCount\.value > 0[\s\S]*?singlePendingCountTaskCount\.value > 0/)
  assert.match(normalModeVue, /deferAudienceSchedule/)
  assert.match(normalModeVue, /status: 'missed'/)
  assert.match(normalModeVue, /setInterval\([\s\S]*?processDueAudienceSchedules\(\)[\s\S]*?30 \* 1000/)
})

test('scheduled tasks are account-scoped and recover an interrupted browser run', () => {
  assert.match(normalModeVue, /saveAudienceSchedules\(props\.sessionOwnerId, nextTasks\)/)
  assert.match(normalModeVue, /task\.status !== 'running'/)
  assert.match(normalModeVue, /上次运行被浏览器中断/)
  assert.match(normalModeVue, /if \(audienceScheduleTimer\) window\.clearInterval\(audienceScheduleTimer\)/)
})
