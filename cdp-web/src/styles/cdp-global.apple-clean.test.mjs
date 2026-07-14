import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(currentDir, 'cdp-global.css'), 'utf8')
const refreshCss = css.slice(css.indexOf('/* Apple Clean Pro visual refresh'))

test('apple clean pro theme exposes clean color, shape, and motion tokens', () => {
  assert.match(css, /\/\* ============================================================ \*\/\n\/\* Apple Clean Pro visual refresh/)
  assert.match(css, /--apple-clean-bg: #fffdf8;/)
  assert.match(css, /--apple-clean-accent: #ff6b4a;/)
  assert.match(css, /--apple-clean-line: rgba\(255,107,74,0\.16\);/)
  assert.doesNotMatch(refreshCss, /--apple-clean-blue|--apple-clean-cyan|rgba\(0,113,227|rgba\(54,193,250|rgba\(240,247,255|#0071e3/)
  assert.match(css, /--apple-clean-radius-panel: 10px;/)
  assert.match(css, /--apple-clean-radius-control: 8px;/)
  assert.match(css, /--apple-clean-motion: 260ms cubic-bezier\(0\.16, 1, 0\.3, 1\);/)
})

test('apple clean pro uses single warm light instead of mixed blue-orange glow', () => {
  assert.match(css, /\.cdp-engine-container::before \{[\s\S]*radial-gradient\(circle at 18% 8%, rgba\(255,107,74,0\.08\) 0, transparent 32%\)[\s\S]*radial-gradient\(circle at 78% 12%, rgba\(255,255,255,0\.62\) 0, transparent 30%\)/)
  assert.doesNotMatch(refreshCss, /radial-gradient\(circle at [^)]*rgba\(0,113,227|radial-gradient\(circle at [^)]*rgba\(54,193,250/)
})

test('apple clean pro overrides dirty gray shell and card surfaces', () => {
  assert.match(css, /\.intercom-card,[\s\S]*?\.tc-history-card \{[\s\S]*border-radius: var\(--apple-clean-radius-panel\);[\s\S]*box-shadow: var\(--apple-clean-shadow\);/)
  assert.match(css, /\.app-shell-header \{[\s\S]*background: rgba\(255,250,245,0\.82\);[\s\S]*border-bottom: 1px solid var\(--apple-clean-line\);/)
  assert.match(css, /\.intercom-radio-group \.el-radio-button__original-radio:checked \+ \.el-radio-button__inner \{[\s\S]*background: linear-gradient\(135deg, var\(--apple-clean-ink\) 0%, #2f261f 100%\)/)
})

test('apple clean pro turns package buttons into light row actions instead of rounded rectangles', () => {
  assert.match(css, /\.btn-group \.el-button \{[\s\S]*justify-content: flex-start !important;[\s\S]*background: transparent !important;[\s\S]*border-radius: 4px !important;[\s\S]*border-bottom: 1px solid var\(--apple-clean-line\) !important;/)
  assert.match(css, /\.btn-group \.el-button::before \{[\s\S]*background: var\(--apple-clean-accent\);/)
  assert.match(css, /\.btn-group \.el-button:hover \{[\s\S]*background: rgba\(255,255,255,0\.74\) !important;[\s\S]*transform: translateX\(3px\) !important;/)
})

test('apple clean pro explicitly warms solution center and folder tree local styles', () => {
  assert.match(css, /\.solution-center-page,[\s\S]*?\.solution-empty-state \{[\s\S]*color: var\(--apple-clean-ink\) !important;/)
  assert.match(css, /\.solution-list-meta,[\s\S]*?\.folder-name \{[\s\S]*color: var\(--apple-clean-muted\) !important;/)
  assert.match(css, /\.solution-status-chip,[\s\S]*?\.folder-context-menu \{[\s\S]*background: rgba\(255,253,249,0\.90\) !important;[\s\S]*border-color: var\(--apple-clean-line\) !important;/)
  assert.match(css, /\.folder-row:hover,[\s\S]*?\.folder-row\.active \{[\s\S]*background: var\(--apple-clean-accent-soft\) !important;[\s\S]*color: var\(--apple-clean-accent\) !important;/)
  assert.match(css, /\.node-skeleton,[\s\S]*?\.skeleton-bar \{[\s\S]*background: linear-gradient\(90deg, rgba\(255,248,242,0\.86\) 25%, rgba\(255,239,232,0\.94\) 50%, rgba\(255,248,242,0\.86\) 75%\) !important;/)
})

test('apple clean pro gives solution empty state the warm orange workbench canvas', () => {
  assert.match(css, /\.solution-empty-state \{[\s\S]*background:[\s\S]*radial-gradient\(circle at 50% 42%, rgba\(255,107,74,0\.12\) 0, transparent 34%\),[\s\S]*linear-gradient\(180deg, rgba\(255,248,242,0\.88\) 0%, rgba\(255,253,248,0\.96\) 100%\) !important;/)
  assert.doesNotMatch(refreshCss, /\.solution-empty-state \{[\s\S]*(rgba\(0,113,227|rgba\(54,193,250|rgba\(240,247,255|#cfe8ff|#dbeafe)/)
})

test('apple clean pro keeps disabled task center test buttons readable', () => {
  assert.match(css, /#app \.tc-btn-sm:not\(:disabled\):not\(\.is-disabled\):not\(\.is-dmp\):not\(\.is-cancel\)/)
  assert.match(css, /#app \.tc-btn-sm:disabled,[\s\S]*?#app \.tc-btn-sm\.el-button\.is-disabled \{[\s\S]*background: rgba\(255,253,249,0\.86\) !important;[\s\S]*color: var\(--apple-clean-muted\) !important;[\s\S]*opacity: 1 !important;/)
})
