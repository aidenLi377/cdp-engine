import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const batchModeVue = readFileSync(join(currentDir, 'BatchMode.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('standard template action floats without occupying header layout space', () => {
  assert.match(batchModeVue, /class="batch-template-float"/)
  assert.doesNotMatch(batchModeVue, /class="batch-header"/)
  assert.doesNotMatch(batchModeVue, /class="action-area"/)
  assert.match(css, /\.batch-workspace \{[^}]*position: relative;[^}]*height: 100%;[^}]*min-height: 0;/s)
  assert.doesNotMatch(css, /\.batch-workspace \{[^}]*height: 100vh;/s)
  assert.match(css, /\.batch-template-float\.el-button \{[^}]*position: absolute;[^}]*top: 18px;[^}]*right: 32px;/s)
  assert.match(css, /\.pipeline-scroll-area \{[^}]*padding: 64px 44px 36px;/s)
})

test('pipeline add action is a fixed circular animated control', () => {
  assert.match(batchModeVue, /class="plus-btn" @click="addPipelineItem" aria-label="添加条件模板"/)
  assert.doesNotMatch(batchModeVue, /class="intercom-btn-primary plus-btn"/)
  assert.match(css, /\.plus-btn \{[^}]*width: 46px !important;[^}]*height: 46px !important;[^}]*aspect-ratio: 1 \/ 1;/s)
  assert.match(css, /\.plus-btn::before \{/)
  assert.match(css, /@keyframes plusFloat/)
  assert.match(css, /@keyframes plusHalo/)
})

test('batch scrollable lists keep content clear of scrollbars', () => {
  assert.match(css, /\.card-list-area \{[^}]*overflow-y: auto;[^}]*padding: 22px 34px 22px 22px;/s)
  assert.match(css, /\.card-list-area,[\s\S]*?\.dialog-scroll-area,[\s\S]*?\.drawer-scroll,[\s\S]*?scrollbar-gutter: stable;/)
  assert.match(css, /\.intercom-list-item,[\s\S]*?box-sizing: border-box;/)
})
