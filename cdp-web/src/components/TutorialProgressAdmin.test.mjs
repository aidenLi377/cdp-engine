import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const panelVue = readFileSync(join(currentDir, 'TutorialProgressAdminPanel.vue'), 'utf8')
const adminVue = readFileSync(join(currentDir, 'AdminCenter.vue'), 'utf8')
const appVue = readFileSync(join(currentDir, '..', 'App.vue'), 'utf8')
const centerVue = readFileSync(join(currentDir, 'TutorialCenter.vue'), 'utf8')

test('system management exposes per-user tutorial progress as a dedicated section', () => {
  assert.match(adminVue, /id: 'tutorial-progress'/)
  assert.match(adminVue, /label: '教程进度管理'/)
  assert.match(adminVue, /<TutorialProgressAdminPanel :users="users" :current-user-id="currentUserId"/)
})

test('tutorial progress admin lists every course and saves each checkbox immediately', () => {
  assert.match(panelVue, /v-for="tutorial in TUTORIAL_CATALOG"/)
  assert.match(panelVue, /type="checkbox"/)
  assert.match(panelVue, /@change="setTutorialStatus\(tutorial\.id, \$event\.target\.checked\)"/)
  assert.match(panelVue, /\/api\/admin\/tutorial-progress/)
  assert.match(panelVue, /\/api\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/tutorial-progress/)
  assert.match(panelVue, /completedTutorialIds/)
  assert.match(panelVue, /计 \{\{ tutorialWeight\(tutorial\.id\) \}\} 项/)
})

test('signed-in users poll server progress and tutorial center receives live updates', () => {
  assert.match(appVue, /tutorialProgressTimer = setInterval\(\(\) => void refreshTutorialProgress\(\), 3000\)/)
  assert.match(appVue, /:synced-progress-items="tutorialProgressItems"/)
  assert.match(centerVue, /syncedProgressItems: \{ type: Array/)
  assert.match(centerVue, /progressItems\.value = items/)
})
