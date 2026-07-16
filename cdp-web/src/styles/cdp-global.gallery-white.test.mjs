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

test('app shell and login use neutral surfaces with signal orange only', () => {
  const appStyle = vueStyle('App.vue')
  const loginStyle = vueStyle('components/LoginView.vue')
  const forbidden = /#f5f3ee|#f3f0e9|#f8f6f1|#ece8df|#171715|#77736c|#9a968f|#67635d|#8f8b84|#9b978f|#ff6b4a|rgba\(255,\s*107,\s*74/i

  assert.doesNotMatch(appStyle, forbidden)
  assert.doesNotMatch(loginStyle, forbidden)
  assert.match(appStyle, /\.auth-checking-screen\s*\{[\s\S]*background:\s*var\(--ui-fill\)/)
  assert.match(loginStyle, /\.login-shell\s*\{[\s\S]*background:\s*var\(--ui-canvas\)/)
  assert.match(loginStyle, /\.login-atmosphere\s*\{[\s\S]*display:\s*none/)
  assert.match(loginStyle, /\.login-entry\s*\{[\s\S]*background:\s*var\(--ui-fill\)/)
  assert.match(loginStyle, /\.login-field input:focus\s*\{[\s\S]*var\(--ui-accent-ring\)/)
  assert.match(loginStyle, /\.login-submit\s*\{[\s\S]*background:\s*var\(--ui-ink\)/)
})

test('workbench supporting styles use tokens without warm fills or colored shadows', () => {
  const files = [
    'components/DynamicForm.vue',
    'components/CustomFieldEditDialog.vue',
    'components/FolderTree.vue',
    'components/FolderTreeNode.vue',
  ]
  const styles = files.map(vueStyle).join('\n')

  assert.doesNotMatch(styles, /#ff6b4a|#f05a3a|rgba\(255,\s*107,\s*74/i)
  assert.doesNotMatch(styles, /box-shadow\s*:[^;]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.match(vueStyle('components/DynamicForm.vue'), /\.field-selected\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
  assert.match(vueStyle('components/FolderTree.vue'), /\.folder-tree-row\.active\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
})

test('dynamic form uses neutral tokens and shared danger semantics', () => {
  const style = vueStyle('components/DynamicForm.vue')

  assert.doesNotMatch(style, /#e8e4dc|#fcfcf9|#f0ece4|#e0554a|rgba\(224,\s*85,\s*74/i)
  assert.match(style, /\.paste-panel-body\s*\{[\s\S]*border:\s*1px solid var\(--ui-control-border\)[\s\S]*background:\s*var\(--ui-surface\)/)
  assert.match(style, /\.paste-stat\.err\s*\{[\s\S]*color:\s*var\(--ui-danger\)/)
  assert.match(style, /\.paste-chip\.err\s*\{[\s\S]*background:\s*rgba\(255,\s*59,\s*48,\s*0\.06\)[\s\S]*color:\s*var\(--ui-danger\)[\s\S]*border:\s*1px solid rgba\(255,\s*59,\s*48,\s*0\.1\)/)
})

test('solution center keeps active, creating, drag, and highlight states clean', () => {
  const solutionStyle = vueStyle('components/SolutionCenter.vue')
  const useStyle = vueStyle('components/SolutionUseForm.vue')
  const styles = solutionStyle + useStyle

  assert.doesNotMatch(styles, /#ff6b4a|rgba\(255,\s*107,\s*74/i)
  assert.match(solutionStyle, /\.custom-field-item\.active\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
  assert.match(solutionStyle, /\.creating-custom-field-panel\s*\{[\s\S]*background:\s*var\(--ui-fill\)/)
  assert.match(solutionStyle, /\.skeleton-bar\s*\{[\s\S]*background:\s*linear-gradient\([^;]*(#f5f5f7|var\(--ui-fill\))/)
  assert.match(useStyle, /\.use-card-highlighted\s*\{[\s\S]*var\(--ui-accent-ring\)/)
})

test('task center uses neutral surfaces, signal orange, and P1 status colors', () => {
  const taskStyle = vueStyle('components/TaskCenter.vue')

  assert.doesNotMatch(taskStyle, /#f8f7f5|#f2f1ee|#ff6b4a|#e55a3e|#ff7b5e|rgba\(255\s*,?\s*107\s*,?\s*74/i)
  assert.doesNotMatch(taskStyle, /(?:linear|radial)-gradient\([^)]*(#ff6b35|255\s*,\s*107\s*,\s*53)/i)
  assert.match(taskStyle, /\.task-center-page\s*\{[\s\S]*background:\s*var\(--ui-canvas\)/)
  assert.match(taskStyle, /\.tc-btn-sm\.is-dmp\s*\{[\s\S]*background:\s*var\(--ui-ink\)/)
  assert.match(taskStyle, /\.tc-tag-item\.checked\s*\{[\s\S]*background:\s*var\(--ui-surface\)/)
  assert.match(taskStyle, /\.tc-phase-step\.current \.tc-phase-dot\s*\{[\s\S]*border-color:\s*var\(--ui-accent\)/)
})

test('task center maps progress and history states to P1 semantic colors', () => {
  const taskStyle = vueStyle('components/TaskCenter.vue')

  assert.match(taskStyle, /\.tc-phase-step\.done \.tc-phase-dot\s*\{[\s\S]*background:\s*var\(--ui-success\)[\s\S]*border-color:\s*var\(--ui-success\)/)
  assert.match(taskStyle, /\.tc-history-status-dot\.completed\s*\{[\s\S]*background:\s*var\(--ui-success\)/)
  assert.match(taskStyle, /\.tc-history-status-dot\.running\s*\{[\s\S]*background:\s*var\(--ui-warning\)/)
  assert.match(taskStyle, /\.tc-history-status-dot\.failed\s*\{[\s\S]*background:\s*var\(--ui-danger\)/)
})
