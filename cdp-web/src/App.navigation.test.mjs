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

test('solution center is nested under visual workbench navigation', () => {
  const mainNav = appVue.match(
    /<nav class="app-shell-nav"[\s\S]*?<\/nav>/,
  )?.[0]

  assert.ok(mainNav, 'main app navigation should exist')
  assert.match(appVue, /const appMode = ref\('visual'\)/)
  assert.match(appVue, /const visualSection = ref\('workbench'\)/)
  assert.match(appVue, /v-if="appMode === 'visual'"/)
  assert.match(appVue, /v-if="visualSection === 'workbench'"/)
  assert.match(appVue, /v-else-if="visualSection === 'solutions'"/)
  assert.match(appVue, /class="app-shell-visual-nav"/)
  assert.match(appVue, /class="app-shell-subnav-label"/)
  assert.doesNotMatch(mainNav, /<el-radio-button label="solutions">/)
})

test('shell header is compact and visually groups visual subnavigation', () => {
  assert.match(globalCss, /\.app-shell-header \{[^}]*min-height: 56px;/s)
  assert.match(globalCss, /\.app-shell-header \{[^}]*padding: 8px 24px;/s)
  assert.match(globalCss, /\.app-shell-visual-nav \{[^}]*display: inline-flex;/s)
  assert.match(globalCss, /\.app-shell-subnav \{[^}]*border-left: 1px solid rgba\(0,0,0,0\.08\);/s)
})
