import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const appVue = readFileSync(join(currentDir, 'App.vue'), 'utf8')
const globalCss = readFileSync(join(currentDir, 'styles', 'cdp-global.css'), 'utf8')

test('top-level app navigation is an in-flow shell header, not a floating mode switch', () => {
  assert.match(appVue, /class="app-shell-header"/)
  assert.doesNotMatch(appVue, /mode-switch-container/)
})

test('existing top-level workbench navigation remains available after adding login', () => {
  const mainNav = appVue.match(
    /<nav class="app-shell-nav"[\s\S]*?<\/nav>/,
  )?.[0]

  assert.ok(mainNav, 'main app navigation should exist')
  assert.match(appVue, /const appMode = ref\('workbench'\)/)
  assert.match(mainNav, /<el-radio-button label="workbench">/)
  assert.match(mainNav, /<el-radio-button label="solutions">/)
  assert.match(mainNav, /<el-radio-button label="task-center">/)
  assert.match(appVue, /<LoginView v-else-if="authState === 'guest'"/)
  assert.doesNotMatch(appVue, /const visualSection = ref/)
})

test('shell header stays compact and makes room for the signed-in account', () => {
  assert.match(globalCss, /\.app-shell-header \{[^}]*min-height: 56px;/s)
  assert.match(globalCss, /\.app-shell-header \{[^}]*padding: 8px 24px;/s)
  assert.match(globalCss, /\.app-shell-header \{[^}]*grid-template-columns: minmax\(220px, 1fr\) auto auto;/s)
  assert.match(appVue, /class="app-shell-account"/)
})
