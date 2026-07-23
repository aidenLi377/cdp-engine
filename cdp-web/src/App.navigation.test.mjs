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
  assert.match(mainNav, /<el-radio-button value="workbench">/)
  assert.match(mainNav, /<el-radio-button value="solutions">/)
  assert.match(mainNav, /<el-radio-button value="task-center">/)
  assert.match(appVue, /<LoginView v-else-if="authState === 'guest'"/)
  assert.doesNotMatch(appVue, /const visualSection = ref/)
})

test('top-level modes use one animated black slider with quiet text-only choices', () => {
  assert.match(appVue, /class="intercom-radio-group app-mode-switcher"/)
  assert.match(appVue, /:class="`is-\$\{appMode\}`"/)

  assert.match(
    globalCss,
    /\.app-shell-nav \.app-mode-switcher\s*\{[^}]*grid-template-columns:\s*repeat\(3, var\(--app-nav-item-width\)\);[^}]*border:\s*0 !important;[^}]*background:\s*transparent !important;/s,
  )
  assert.match(
    globalCss,
    /\.app-shell-nav \.app-mode-switcher::before\s*\{[^}]*background:\s*#1d1d1f;[^}]*transition:\s*transform 420ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/s,
  )
  assert.match(globalCss, /\.app-mode-switcher\.is-solutions::before\s*\{[^}]*translate3d\(var\(--app-nav-item-width\), 0, 0\);/s)
  assert.match(globalCss, /\.app-mode-switcher\.is-task-center::before\s*\{[^}]*calc\(var\(--app-nav-item-width\) \* 2\)/s)
  assert.match(
    globalCss,
    /\.app-mode-switcher \.el-radio-button\.is-active \.el-radio-button__inner,[\s\S]*?background:\s*transparent !important;[^}]*color:\s*#ffffff !important;/s,
  )
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)/)
})

test('shell header stays compact and makes room for the signed-in account', () => {
  assert.match(globalCss, /\.app-shell-header \{[^}]*min-height: 56px;/s)
  assert.match(globalCss, /\.app-shell-header \{[^}]*padding: 8px 24px;/s)
  assert.match(globalCss, /\.app-shell-header \{[^}]*grid-template-columns: minmax\(220px, 1fr\) auto auto;/s)
  assert.match(appVue, /class="app-shell-account"/)
})

test('shell title is concise without the CDP prefix', () => {
  assert.match(appVue, /class="display-feature-title">圈选工作台<\/div>/)
  assert.doesNotMatch(appVue, />CDP 圈选工作台</)
  assert.doesNotMatch(appVue, /可视化搭建、方案管理与任务调度/)
})

test('brief network stalls do not immediately show a disconnected backend', () => {
  assert.match(appVue, /const HEALTH_FAILURE_THRESHOLD = 3/)
  assert.match(appVue, /consecutiveBackendFailures >= HEALTH_FAILURE_THRESHOLD/)
  assert.match(appVue, />\s*暂时无法连接服务\s*</)
  assert.doesNotMatch(appVue, />重试<\/el-button>/)
  assert.doesNotMatch(appVue, /AbortSignal\.timeout\(5000\)/)
})

test('large top-level modes are loaded on demand', () => {
  assert.match(appVue, /defineAsyncComponent\(\(\) => import\('\.\/components\/NormalMode\.vue'\)\)/)
  assert.match(appVue, /defineAsyncComponent\(\(\) => import\('\.\/components\/SolutionCenter\.vue'\)\)/)
  assert.match(appVue, /defineAsyncComponent\(\(\) => import\('\.\/components\/TaskCenter\.vue'\)\)/)
})
