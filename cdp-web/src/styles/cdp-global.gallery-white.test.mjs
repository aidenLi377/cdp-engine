import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(currentDir, 'cdp-global.css'), 'utf8')
const marker = '/* Gallery White visual refresh'
const markerIndex = css.indexOf(marker)
const themeCss = markerIndex >= 0 ? css.slice(markerIndex) : ''

export function vueStyle(relativePath) {
  const source = readFileSync(join(currentDir, '..', relativePath), 'utf8')
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join('\n')
}

test('gallery white exposes the approved neutral, accent, and semantic tokens', () => {
  assert.ok(markerIndex >= 0, 'Gallery White theme marker must exist')
  assert.match(themeCss, /--ui-canvas:\s*#ffffff;/)
  assert.match(themeCss, /--ui-fill:\s*#f5f5f7;/)
  assert.match(themeCss, /--ui-ink:\s*#1d1d1f;/)
  assert.match(themeCss, /--ui-text-secondary:\s*#6e6e73;/)
  assert.match(themeCss, /--ui-text-tertiary:\s*#86868b;/)
  assert.match(themeCss, /--ui-control-border:\s*#d2d2d7;/)
  assert.match(themeCss, /--ui-divider:\s*#e8e8ed;/)
  assert.match(themeCss, /--ui-accent:\s*#ff6b35;/)
  assert.match(themeCss, /--ui-success:\s*#34c759;/)
  assert.match(themeCss, /--ui-warning:\s*#ffcc00;/)
  assert.match(themeCss, /--ui-danger:\s*#ff3b30;/)
})

test('gallery white removes warm environmental color and dirty decoration', () => {
  assert.doesNotMatch(themeCss, /#fffdf8|#fff8f2|#fff3ed|#211813|#5a372b|#2f261f/i)
  assert.doesNotMatch(themeCss, /linear-gradient\([^)]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.doesNotMatch(themeCss, /radial-gradient\([^)]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.doesNotMatch(themeCss, /box-shadow\s*:[^;]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
})

test('gallery white keeps surfaces neutral and primary actions black', () => {
  assert.match(themeCss, /\.cdp-engine-container\s*\{[\s\S]*background:\s*var\(--ui-canvas\)/)
  assert.match(themeCss, /\.cdp-engine-container::before,[\s\S]*\.cdp-engine-container::after\s*\{[\s\S]*display:\s*none/)
  assert.match(themeCss, /\.intercom-btn-primary,[\s\S]*background:\s*var\(--ui-ink\)/)
  assert.match(themeCss, /\.intercom-input \.el-input__wrapper\.is-focus[\s\S]*border-color:\s*var\(--ui-accent\)/)
})

test('gallery white retains accessible reduced-motion behavior', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/)
})
