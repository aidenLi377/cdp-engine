import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./cdp-global.css', import.meta.url), 'utf8')
const marker = '/* Atelier White workspace refresh */'
const markerIndex = css.indexOf(marker)
const atelierCss = markerIndex >= 0 ? css.slice(markerIndex) : ''

test('atelier white is the final workspace presentation layer', () => {
  assert.ok(markerIndex >= 0, 'Atelier White marker must exist')
  assert.equal(css.lastIndexOf(marker), markerIndex)
  assert.match(atelierCss, /--aw-ink:\s*#0a0a0b;/)
  assert.match(atelierCss, /--aw-paper:\s*#ffffff;/)
  assert.match(atelierCss, /--aw-line:\s*rgba\(10,\s*10,\s*11,\s*0\.12\);/)
  assert.doesNotMatch(atelierCss, /background(?:-color)?:\s*(?:#f5f5f7|#f2f2f2|#f0f0f0|#fafafa)/i)
})

test('app shell is a precise three-zone header with one animated navigation lens', () => {
  assert.match(atelierCss, /#app \.app-shell-header\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*1fr\)\s+auto\s+minmax\(220px,\s*1fr\);/s)
  assert.match(atelierCss, /#app \.app-shell-header\s*\{[^}]*height:\s*58px;/s)
  assert.match(atelierCss, /#app \.app-shell-header\s*\{[^}]*border-bottom:\s*1px solid var\(--aw-line\);/s)
  assert.match(atelierCss, /#app \.app-mode-switcher::before\s*\{[^}]*background:\s*var\(--aw-ink\);/s)
})

test('all three work areas use white rails and consistent structural separators', () => {
  assert.match(
    atelierCss,
    /#app \.left-panel,[\s\S]*?#app \.tc-control-panel\s*\{[^}]*background:\s*var\(--aw-paper\)\s*!important;[^}]*box-shadow:\s*none\s*!important;/,
  )
  assert.match(atelierCss, /#app \.left-panel\s*\{[^}]*border-right:\s*1px solid var\(--aw-line\)\s*!important;/s)
  assert.match(atelierCss, /#app \.right-panel\s*\{[^}]*border-left:\s*1px solid var\(--aw-line\)\s*!important;/s)
  assert.match(atelierCss, /#app \.tc-control-panel\s*\{[^}]*border-right:\s*1px solid var\(--aw-line\)\s*!important;/s)
})

test('workbench and solution center use typography and whitespace instead of gray cards', () => {
  assert.match(atelierCss, /#app \.workbench-section\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;/s)
  assert.match(atelierCss, /#app \.behavior-card\s*\{[^}]*background:\s*var\(--aw-paper\)\s*!important;[^}]*box-shadow:\s*none\s*!important;/s)
  assert.match(atelierCss, /#app \.solution-list-item\s*\{[^}]*min-height:\s*48px;[^}]*border-bottom:\s*1px solid var\(--aw-line\)\s*!important;/s)
  assert.match(atelierCss, /#app \.solution-list-item\.active\s*\{[^}]*box-shadow:\s*inset 2px 0 0 var\(--aw-ink\)\s*!important;/s)
})

test('task center launch area and history use quiet rows instead of boxed cards', () => {
  assert.match(atelierCss, /#app \.tc-test-row\s*\{[^}]*gap:\s*18px;/s)
  assert.match(atelierCss, /#app \.tc-test-col\s*\{[^}]*padding:\s*0 0 14px;[^}]*border-bottom:\s*1px solid var\(--aw-line\)\s*!important;/s)
  assert.match(atelierCss, /#app \.tc-history-item\s*\{[^}]*border:\s*0\s*!important;[^}]*border-bottom:\s*1px solid var\(--aw-line\)\s*!important;/s)
  assert.match(atelierCss, /#app \.tc-tags-body\s*\{[^}]*scrollbar-color:\s*var\(--aw-line-strong\)\s+transparent;/s)
})

test('atelier white keeps focus visible and motion optional', () => {
  assert.match(atelierCss, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--aw-ink\);/s)
  assert.match(atelierCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/)
})
