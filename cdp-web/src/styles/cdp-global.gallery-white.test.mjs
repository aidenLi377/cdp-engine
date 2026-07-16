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

function effectiveRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...source.matchAll(new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^{}]*)\\}`, 'g'))]

  assert.ok(matches.length > 0, `Expected an explicit rule for ${selector}`)
  return matches.at(-1)[1]
}

export function effectiveSelectorListRule(source, selector) {
  const matches = [...source.matchAll(/(?=(?:^|})\s*([^{}]+?)\s*\{([^{}]*)\})/g)].filter((match) =>
    match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .some((candidate) => candidate.trim() === selector),
  )

  assert.ok(matches.length > 0, `Expected an explicit selector-list rule for ${selector}`)
  return matches.at(-1)[2]
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

test('gallery white workbench library is a compact borderless white row list', () => {
  const section = effectiveRule(themeCss, '.workbench-package-section')
  const search = effectiveRule(themeCss, '.workbench-package-section .pkg-search .el-input__wrapper')
  const list = effectiveRule(themeCss, '.workbench-package-section .btn-group')
  const row = effectiveRule(themeCss, '.workbench-package-section .btn-group .el-button')
  const hover = effectiveRule(themeCss, '.workbench-package-section .btn-group .el-button:hover')

  assert.match(section, /border:\s*0\s*!important/)
  assert.match(section, /border-radius:\s*0\s*!important/)
  assert.match(section, /background:\s*transparent\s*!important/)
  assert.match(section, /box-shadow:\s*none\s*!important/)
  assert.match(search, /height:\s*32px\s*!important/)
  assert.match(list, /display:\s*grid/)
  assert.match(list, /grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(row, /height:\s*32px\s*!important/)
  assert.match(row, /border:\s*0\s*!important/)
  assert.match(row, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(row, /box-shadow:\s*none\s*!important/)
  assert.match(hover, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(hover, /box-shadow:\s*inset 2px 0 0 var\(--ui-accent\)\s*!important/)
  assert.match(hover, /transform:\s*none\s*!important/)
  assert.doesNotMatch(row + hover, /var\(--ui-fill\)|#f5f5f7/i)
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

test('gallery white EOF explicitly overrides every reviewed reachable legacy selector', () => {
  const selectors = [
    '.solution-center-page',
    '.plus-btn',
    '.plus-btn::before',
    '.plus-btn:hover',
    '.final-header',
    '.final-badge',
    '.empty-state-illustration.create',
    '.empty-state-illustration.use',
    '.use-card-highlighted',
    '.workbench-phase-status.is-free-build .workbench-phase-dot',
    '.workbench-phase-status.is-solution-use .workbench-phase-dot',
    '.cf-cards-bar',
    '.cf-cards-bar::-webkit-scrollbar-thumb',
    '.cf-cards-bar::-webkit-scrollbar-thumb:hover',
    '.cf-value-tooltip',
    '.offline-banner',
  ]

  for (const selector of selectors) effectiveRule(themeCss, selector)
})

test('gallery white solution center canvas has no effective warm atmosphere', () => {
  const rule = effectiveRule(themeCss, '.solution-center-page')

  assert.match(rule, /background:\s*var\(--ui-canvas\)\s*!important/)
  assert.doesNotMatch(rule, /(?:linear|radial)-gradient|#fffdf8|#fff8f2|#fff3ed|#ff6b35|255\s*,\s*107\s*,\s*53/i)
})

test('gallery white plus action stays black and removes its orange halo', () => {
  const base = effectiveRule(themeCss, '.plus-btn')
  const halo = effectiveRule(themeCss, '.plus-btn::before')
  const hover = effectiveRule(themeCss, '.plus-btn:hover')

  assert.match(base, /background:\s*var\(--ui-ink\)\s*!important/)
  assert.match(base, /box-shadow:\s*none\s*!important/)
  assert.match(base, /animation:\s*none\s*!important/)
  assert.match(halo, /display:\s*none\s*!important/)
  assert.match(halo, /animation:\s*none\s*!important/)
  assert.match(hover, /background:\s*var\(--ui-ink\)\s*!important/)
  assert.match(hover, /box-shadow:\s*none\s*!important/)
  assert.doesNotMatch(base + halo + hover, /(?:linear|radial)-gradient|#ff6b35|#ff6748|#e3472f|255\s*,\s*107\s*,\s*53|255\s*,\s*95\s*,\s*63/i)
})

test('gallery white final header and badge use neutral framing with a solid signal', () => {
  const header = effectiveRule(themeCss, '.final-header')
  const badge = effectiveRule(themeCss, '.final-badge')

  assert.match(header, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(header, /border-color:\s*var\(--ui-divider\)\s*!important/)
  assert.match(header, /box-shadow:\s*none\s*!important/)
  assert.doesNotMatch(header, /(?:linear|radial)-gradient|#ff6b35|255\s*,\s*107\s*,\s*53/i)
  assert.match(badge, /background:\s*var\(--ui-accent\)\s*!important/)
  assert.match(badge, /box-shadow:\s*none\s*!important/)
  assert.doesNotMatch(badge, /(?:linear|radial)-gradient|rgba\(255\s*,\s*107\s*,\s*53/i)
})

test('gallery white empty and highlighted cards use static neutral treatment', () => {
  const create = effectiveRule(themeCss, '.empty-state-illustration.create')
  const use = effectiveRule(themeCss, '.empty-state-illustration.use')
  const highlighted = effectiveRule(themeCss, '.use-card-highlighted')

  for (const rule of [create, use]) {
    assert.match(rule, /background:\s*var\(--ui-fill\)\s*!important/)
    assert.match(rule, /color:\s*var\(--ui-text-tertiary\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.doesNotMatch(rule, /(?:linear|radial)-gradient|#ff6b35|#3b82f6|255\s*,\s*107\s*,\s*53/i)
  }
  assert.match(highlighted, /animation:\s*none\s*!important/)
  assert.match(highlighted, /box-shadow:\s*none\s*!important/)
})

test('gallery white workbench phase dots use solid semantic signals without glow', () => {
  const freeBuild = effectiveRule(themeCss, '.workbench-phase-status.is-free-build .workbench-phase-dot')
  const solutionUse = effectiveRule(themeCss, '.workbench-phase-status.is-solution-use .workbench-phase-dot')

  assert.match(freeBuild, /background:\s*var\(--ui-success\)\s*!important/)
  assert.match(solutionUse, /background:\s*var\(--ui-accent\)\s*!important/)
  for (const rule of [freeBuild, solutionUse]) {
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.match(rule, /animation:\s*none\s*!important/)
    assert.doesNotMatch(rule, /(?:linear|radial)-gradient|rgba\([^)]*\)/i)
  }
})

test('gallery white custom-field scrollbars and tooltip are neutral controls', () => {
  const bar = effectiveRule(themeCss, '.cf-cards-bar')
  const thumb = effectiveRule(themeCss, '.cf-cards-bar::-webkit-scrollbar-thumb')
  const thumbHover = effectiveRule(themeCss, '.cf-cards-bar::-webkit-scrollbar-thumb:hover')
  const tooltip = effectiveRule(themeCss, '.cf-value-tooltip')

  assert.match(bar, /scrollbar-color:\s*var\(--ui-control-border\)\s+transparent/)
  assert.match(thumb, /background:\s*var\(--ui-control-border\)\s*!important/)
  assert.match(thumbHover, /background:\s*var\(--ui-text-tertiary\)\s*!important/)
  assert.match(tooltip, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(tooltip, /color:\s*var\(--ui-ink\)\s*!important/)
  assert.match(tooltip, /border:\s*1px solid var\(--ui-control-border\)\s*!important/)
  assert.match(tooltip, /box-shadow:\s*var\(--ui-shadow-float\)\s*!important/)
  assert.doesNotMatch(bar + thumb + thumbHover + tooltip, /(?:linear|radial)-gradient|#ff6b35|255\s*,\s*107\s*,\s*53/i)
})

test('gallery white offline banner uses a white container with a small danger signal', () => {
  const banner = effectiveRule(themeCss, '.offline-banner')
  assert.match(banner, /color:\s*var\(--ui-ink\)\s*!important/)
  assert.match(banner, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(banner, /border-bottom:\s*1px solid var\(--ui-danger\)\s*!important/)
  assert.match(banner, /box-shadow:\s*none\s*!important/)
  assert.doesNotMatch(banner, /background:\s*var\(--ui-danger\)/)

  const signal = effectiveRule(themeCss, '.offline-banner::before')
  assert.match(signal, /content:\s*["']{2}/)
  assert.match(signal, /width:\s*6px/)
  assert.match(signal, /height:\s*6px/)
  assert.match(signal, /background:\s*var\(--ui-danger\)/)
  assert.match(signal, /border-radius:\s*50%/)

  assert.match(
    effectiveRule(themeCss, '.offline-banner .el-button'),
    /color:\s*var\(--ui-danger\)\s*!important/,
  )
})

test('gallery white solution signals are solid and transient rings stay static', () => {
  const active = effectiveRule(themeCss, '.solution-active-dot')
  const dirty = effectiveRule(themeCss, '.solution-active-dot.dirty')
  const pulse = effectiveRule(themeCss, '.pulse-breath')
  const publishRing = effectiveRule(themeCss, '.publish-ring')

  for (const rule of [active, dirty]) {
    assert.match(rule, /background:\s*var\(--ui-accent\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.doesNotMatch(rule, /(?:linear|radial)-gradient|rgba\(255\s*,\s*107\s*,\s*74/i)
  }

  for (const rule of [pulse, publishRing]) {
    assert.match(rule, /animation:\s*none\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
  }
})

test('gallery white warm upload and publish controls keep neutral hover treatment', () => {
  const warmHover = effectiveRule(themeCss, '.intercom-btn-warm:hover')
  const publish = effectiveRule(themeCss, '.solution-toolbar-icon-btn.publish.el-button')
  const publishHover = effectiveRule(themeCss, '.solution-toolbar-icon-btn.publish.el-button:hover')

  assert.match(warmHover, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(warmHover, /border-color:\s*var\(--ui-control-border\)\s*!important/)
  assert.match(warmHover, /box-shadow:\s*none\s*!important/)

  for (const rule of [publish, publishHover]) {
    assert.match(rule, /color:\s*var\(--ui-ink\)\s*!important/)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /border-color:\s*var\(--ui-control-border\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
  }

  assert.doesNotMatch(warmHover + publish + publishHover, /(?:linear|radial)-gradient|#ff6b35|#ff6b4a|255\s*,\s*107\s*,\s*(?:53|74)/i)
})

test('task center disabled actions and tag labels remain opaque and readable', () => {
  const taskStyle = vueStyle('components/TaskCenter.vue')
  const button = effectiveRule(taskStyle, '.tc-btn-sm:disabled')
  const settings = effectiveRule(taskStyle, '.tc-settings-btn:disabled')
  const tag = effectiveRule(taskStyle, '.tc-tag-item.disabled')

  assert.match(button, /background:\s*var\(--ui-fill\)\s*!important/)
  assert.match(button, /color:\s*var\(--ui-text-secondary\)\s*!important/)
  assert.match(button, /border:\s*1px solid var\(--ui-control-border\)\s*!important/)
  assert.match(button, /opacity:\s*1/)
  assert.match(button, /box-shadow:\s*none\s*!important/)
  assert.match(button, /transform:\s*none\s*!important/)

  assert.match(settings, /background:\s*var\(--ui-fill\)/)
  assert.match(settings, /color:\s*var\(--ui-text-tertiary\)/)
  assert.match(settings, /border-color:\s*var\(--ui-control-border\)/)
  assert.match(settings, /opacity:\s*1/)

  assert.match(tag, /background:\s*var\(--ui-fill\)/)
  assert.match(tag, /color:\s*var\(--ui-text-tertiary\)/)
  assert.match(tag, /border-color:\s*var\(--ui-divider\)/)
  assert.match(tag, /opacity:\s*1/)

  const disabledConditionalHover = effectiveRule(taskStyle, '.tc-tag-item.disabled.needCond:hover')
  assert.match(disabledConditionalHover, /background:\s*var\(--ui-fill\)/)
  assert.match(disabledConditionalHover, /border-color:\s*var\(--ui-divider\)/)
  assert.match(disabledConditionalHover, /transform:\s*none/)

  for (const selector of [
    '.tc-tag-item.disabled .tc-tag-name',
    '.tc-tag-item.disabled .tc-tag-check',
    '.tc-tag-item.disabled .tc-tag-need-cond',
    '.tc-tag-item.disabled .tc-tag-ready',
    '.tc-tag-item.disabled .tc-tag-pending',
  ]) {
    assert.match(effectiveRule(taskStyle, selector), /color:\s*var\(--ui-text-tertiary\)/)
  }

  for (const selector of [
    '.tc-tag-item.disabled .tc-tag-need-cond',
    '.tc-tag-item.disabled .tc-tag-ready',
    '.tc-tag-item.disabled .tc-tag-pending',
  ]) {
    assert.match(effectiveRule(taskStyle, selector), /background:\s*var\(--ui-surface\)/)
  }
})

test('gallery white keeps full-height three-column rails pure white', () => {
  for (const selector of [
    '.left-panel',
    '.right-panel',
    '.solution-sidebar',
    '.solution-settings',
    '#app .tc-control-panel',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)

    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.doesNotMatch(rule, /background:\s*var\(--ui-fill\)/)
    assert.match(rule, /border-color:\s*var\(--ui-divider\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
  }
})

test('gallery white C keeps persistent interior cards pure white and border-only', () => {
  for (const selector of [
    '.workbench-section',
    '.panel-name-area',
    '.json-code',
    '.summary-compute',
    '.creating-custom-field-panel',
    '.custom-field-item:not(.active):not(.drag-over)',
    '#app .tc-test-col:not(:focus-within)',
    '#app .tc-tag-item:not(.disabled):not(.ready):not(.checked)',
    '#app .tc-history-item',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /border-color:\s*var\(--ui-divider\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
  }

  assert.match(
    effectiveSelectorListRule(themeCss, '.final-list-area'),
    /background:\s*var\(--ui-surface\)\s*!important/,
  )

  const solutionStyle = vueStyle('components/SolutionCenter.vue')
  for (const selector of ['.custom-field-item.active', '.custom-field-item.drag-over']) {
    assert.match(effectiveRule(solutionStyle, selector), /border-color:\s*var\(--ui-accent\)/)
  }

  const taskStyle = vueStyle('components/TaskCenter.vue')
  assert.match(
    effectiveRule(taskStyle, '.tc-test-col:focus-within'),
    /border-color:\s*var\(--ui-accent\)/,
  )
  assert.match(
    effectiveSelectorListRule(themeCss, '#app .tc-tag-item.checked'),
    /border-color:\s*var\(--ui-accent\)\s*!important/,
  )
})

test('gallery white C card hover uses only a stronger neutral border', () => {
  for (const selector of [
    '.intercom-card:hover',
    '.published-solution-item:hover',
    '.solution-list-item:hover',
    '.intercom-list-item:hover',
    '.solution-use-card:hover',
    '.cf-use-card:hover',
    '.custom-field-item:hover:not(.active):not(.drag-over)',
    '#app .tc-history-item:hover',
    '#app .tc-tag-item:hover:not(.disabled):not(.ready):not(.checked)',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /border-color:\s*var\(--ui-control-border\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.match(rule, /transform:\s*none\s*!important/)
  }
})

test('gallery white C keeps the workbench edge toggle white and shadow-free', () => {
  const baseRule = effectiveSelectorListRule(themeCss, '.left-panel-edge-toggle')
  assert.match(baseRule, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(baseRule, /border-color:\s*var\(--ui-divider\)\s*!important/)
  assert.match(baseRule, /box-shadow:\s*none\s*!important/)

  const hoverRule = effectiveSelectorListRule(themeCss, '.left-panel-edge-toggle:hover')
  assert.match(hoverRule, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(hoverRule, /border-color:\s*var\(--ui-control-border\)\s*!important/)
  assert.match(hoverRule, /box-shadow:\s*none\s*!important/)

  const activeRule = effectiveSelectorListRule(themeCss, '.left-panel-edge-toggle.is-solutions')
  assert.match(activeRule, /color:\s*var\(--ui-accent\)\s*!important/)
  assert.match(activeRule, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(activeRule, /border-color:\s*var\(--ui-accent\)\s*!important/)
  assert.match(activeRule, /box-shadow:\s*none\s*!important/)
})

test('gallery white C preserves combined selected, drag, ready, and disabled states', () => {
  for (const selector of [
    '.intercom-list-item.is-selected',
    '.cf-use-card.drag-over',
    '.cf-use-card.cf-use-card-active:hover',
    '.cf-use-card.drag-over:hover',
    '.card-header-inner.drag-over',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /border-color:\s*var\(--ui-accent\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.match(rule, /transform:\s*none\s*!important/)
  }

  const checkedHover = effectiveSelectorListRule(
    themeCss,
    '#app .tc-tag-item.checked:hover:not(.disabled)',
  )
  assert.match(checkedHover, /background:\s*var\(--ui-surface\)\s*!important/)
  assert.match(checkedHover, /border-color:\s*var\(--ui-accent\)\s*!important/)
  assert.match(checkedHover, /box-shadow:\s*none\s*!important/)
  assert.match(checkedHover, /transform:\s*none\s*!important/)

  const readyHover = effectiveSelectorListRule(
    themeCss,
    '#app .tc-tag-item.ready:hover:not(.disabled)',
  )
  assert.match(readyHover, /box-shadow:\s*none\s*!important/)
  assert.match(readyHover, /transform:\s*none\s*!important/)
  assert.doesNotMatch(readyHover, /(?:^|;)\s*(?:background|border-color)\s*:/)

  const taskStyle = vueStyle('components/TaskCenter.vue')
  const disabledHover = effectiveRule(taskStyle, '.tc-tag-item.disabled.needCond:hover')
  assert.match(disabledHover, /background:\s*var\(--ui-fill\)/)
  assert.match(disabledHover, /border-color:\s*var\(--ui-divider\)/)
  assert.match(disabledHover, /transform:\s*none/)
})

test('gallery white A uses independent white capsules for reviewed control groups', () => {
  for (const selector of [
    '.app-shell-nav .el-radio-group',
    '.solution-library-switch',
    '.solution-filter-group',
    '.json-tabs',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*transparent\s*!important/)
    assert.match(rule, /border:\s*0\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
  }

  const nav = effectiveSelectorListRule(themeCss, '.app-shell-nav .el-radio-button__inner')
  assert.match(nav, /min-width:\s*84px/)
  assert.match(nav, /height:\s*30px/)
  assert.match(nav, /border-radius:\s*999px\s*!important/)
  assert.match(nav, /background:\s*var\(--ui-surface\)\s*!important/)

  for (const selector of ['.json-tab', '.json-actions .el-button']) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /height:\s*32px\s*!important/)
    assert.match(rule, /border-radius:\s*8px\s*!important/)
    assert.match(rule, /font-size:\s*12px\s*!important/)
  }
})

test('gallery white A preserves capsule radii on first and last radio buttons', () => {
  for (const selector of [
    '.app-shell-nav .el-radio-button:first-child .el-radio-button__inner',
    '.app-shell-nav .el-radio-button:last-child .el-radio-button__inner',
    '.solution-library-switch .el-radio-button:first-child .el-radio-button__inner',
    '.solution-library-switch .el-radio-button:last-child .el-radio-button__inner',
    '.solution-filter-group .el-radio-button:first-child .el-radio-button__inner',
    '.solution-filter-group .el-radio-button:last-child .el-radio-button__inner',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /border-radius:\s*999px\s*!important/)
  }
})

test('gallery white A keeps inactive radio hover white and exposes keyboard focus rings', () => {
  for (const selector of [
    '.app-shell-nav .el-radio-button:not(.is-active):hover .el-radio-button__inner',
    '.solution-library-switch .el-radio-button:not(.is-active):hover .el-radio-button__inner',
    '.solution-filter-group .el-radio-button:not(.is-active):hover .el-radio-button__inner',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /border-color:\s*var\(--ui-control-border\)\s*!important/)
    assert.match(rule, /color:\s*var\(--ui-ink\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.doesNotMatch(rule, /var\(--ui-fill\)|background:\s*var\(--ui-accent\)/)
  }

  for (const selector of [
    '.app-shell-nav .el-radio-button__original-radio:focus-visible + .el-radio-button__inner',
    '.solution-library-switch .el-radio-button__original-radio:focus-visible + .el-radio-button__inner',
    '.solution-filter-group .el-radio-button__original-radio:focus-visible + .el-radio-button__inner',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /border-color:\s*var\(--ui-accent\)\s*!important/)
    assert.match(rule, /box-shadow:\s*0 0 0 3px var\(--ui-accent-ring\)\s*!important/)
    assert.match(rule, /outline:\s*none\s*!important/)
    assert.doesNotMatch(rule, /background(?:-color)?\s*:/)
  }
})

test('gallery white A keeps every menu-style dropdown state white', () => {
  const whiteSelectors = [
    '.el-select__wrapper',
    '.el-select-v2__wrapper',
    '.el-select__selection .el-tag',
    '.el-select-v2__tag',
    '.el-dropdown > .el-button',
    '.el-select-dropdown',
    '.el-select-dropdown__item',
    '.el-select-dropdown__item:hover',
    '.el-select-dropdown__item.is-hovering',
    '.el-select-dropdown__item.is-selected',
    '.el-select-dropdown__item.is-disabled',
    '.el-dropdown-menu',
    '.el-dropdown-menu__item',
    '.el-dropdown-menu__item:not(.is-disabled):focus',
    '.el-dropdown-menu__item.is-active',
    '.el-dropdown-menu__item.is-disabled',
    '.el-cascader__dropdown',
    '.el-cascader-node',
    '.el-cascader-node:not(.is-disabled):hover',
    '.el-cascader-node.in-active-path',
    '.el-cascader-node.is-active',
    '.el-cascader-node.is-disabled',
    '.el-autocomplete-suggestion',
    '.el-autocomplete-suggestion li',
    '.el-autocomplete-suggestion:not(.is-loading) li:hover',
    '.el-autocomplete-suggestion:not(.is-loading) li.highlighted',
    '.el-autocomplete-suggestion.is-loading li',
    '.el-autocomplete-suggestion.is-loading li:hover',
    '.el-tree-select__popper .el-tree-node__content',
    '.el-tree-select__popper .el-tree-node__content:hover',
    '.el-tree-select__popper .el-tree-node.is-current > .el-tree-node__content',
    '.el-tree-select__popper .el-tree-node.is-disabled > .el-tree-node__content',
    '.el-select-dropdown__empty',
    '.el-select-dropdown__loading',
    '.el-cascader-menu__empty-text',
  ]

  for (const selector of whiteSelectors) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background(?:-color)?:\s*var\(--ui-surface\)\s*!important/)
    assert.doesNotMatch(rule, /var\(--ui-fill\)|#f5f5f7|#f2f2f2|#f0f0f0/i)
  }

  for (const selector of [
    '.el-select-dropdown__item.is-disabled',
    '.el-dropdown-menu__item.is-disabled',
    '.el-cascader-node.is-disabled',
    '.el-tree-select__popper .el-tree-node.is-disabled > .el-tree-node__content',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /color:\s*var\(--ui-text-tertiary\)\s*!important/)
    assert.match(rule, /cursor:\s*not-allowed\s*!important/)
  }

  for (const selector of [
    '.el-autocomplete-suggestion.is-loading li',
    '.el-autocomplete-suggestion.is-loading li:hover',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background:\s*var\(--ui-surface\)\s*!important/)
    assert.match(rule, /color:\s*var\(--ui-text-tertiary\)\s*!important/)
    assert.match(rule, /box-shadow:\s*none\s*!important/)
    assert.match(rule, /cursor:\s*default\s*!important/)
    assert.doesNotMatch(rule, /var\(--ui-fill\)|var\(--ui-accent\)|inset\s+2px/)
  }
})

test('gallery white A keeps trigger and selected-tag interaction states white', () => {
  const whiteSelectors = [
    '.el-cascader .el-input__wrapper',
    '.el-cascader:not(.is-disabled):hover .el-input__wrapper',
    '.el-cascader .el-input.is-focus .el-input__wrapper',
    '.el-cascader:has(.el-input__inner[aria-expanded="true"]) .el-input__wrapper',
    '.el-cascader.is-disabled .el-input__wrapper',
    '.el-autocomplete .el-input__wrapper',
    '.el-autocomplete .el-input__wrapper:hover',
    '.el-autocomplete .el-input__wrapper.is-focus',
    '.el-autocomplete[aria-expanded="true"] .el-input__wrapper',
    '.el-autocomplete .el-input.is-disabled .el-input__wrapper',
    '.el-select__wrapper:hover',
    '.el-select__wrapper:focus',
    '.el-select__wrapper.is-focus',
    '.el-select__wrapper.is-hovering',
    '.el-select__wrapper.is-focused',
    '.el-select__wrapper.is-disabled',
    '.el-select-v2__wrapper:hover',
    '.el-select-v2__wrapper:focus',
    '.el-select-v2__wrapper.is-focus',
    '.el-select-v2__wrapper.is-hovering',
    '.el-select-v2__wrapper.is-focused',
    '.el-select-v2__wrapper.is-disabled',
    '.intercom-input .el-select-v2__wrapper:hover',
    '.intercom-input .el-select-v2__wrapper.is-focused',
    '.el-dropdown > .el-button:hover',
    '.el-dropdown > .el-button:focus',
    '.el-dropdown > .el-button.is-disabled',
    '.el-dropdown > .el-button[aria-expanded="true"]',
    '.el-dropdown.is-disabled > .el-button',
    '.el-dropdown .el-dropdown__caret-button',
    '.el-dropdown .el-dropdown__caret-button:hover',
    '.el-dropdown .el-dropdown__caret-button:focus',
    '.el-dropdown .el-dropdown__caret-button.is-disabled',
    '.el-dropdown .el-dropdown__caret-button[aria-expanded="true"]',
    '.el-dropdown.is-disabled .el-dropdown__caret-button',
    '.el-select__selection .el-tag:hover',
    '.el-select__wrapper.is-disabled .el-tag',
    '.el-select__selection .el-tag .el-tag__close',
    '.el-select__selection .el-tag .el-tag__close:hover',
    '.el-select-v2__tag:hover',
    '.el-select-v2__wrapper.is-disabled .el-select-v2__tag',
    '.el-select-v2__tag .el-tag__close',
    '.el-select-v2__tag .el-tag__close:hover',
    '.el-cascader__tags .el-tag',
    '.el-cascader__tags .el-tag:hover',
    '.el-cascader__tags .el-tag .el-tag__close',
    '.el-cascader__tags .el-tag .el-tag__close:hover',
    '.el-cascader__collapse-tags .el-tag',
    '.el-cascader__collapse-tags .el-tag:hover',
    '.el-cascader__collapse-tags .el-tag .el-tag__close',
    '.el-cascader__collapse-tags .el-tag .el-tag__close:hover',
  ]

  for (const selector of whiteSelectors) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /background(?:-color)?:\s*var\(--ui-surface\)\s*!important/)
    assert.doesNotMatch(rule, /var\(--ui-fill\)|#f5f5f7|#f2f2f2|#f0f0f0/i)
  }

  for (const selector of [
    '.el-cascader .el-input.is-focus .el-input__wrapper',
    '.el-cascader:has(.el-input__inner[aria-expanded="true"]) .el-input__wrapper',
    '.el-autocomplete .el-input__wrapper.is-focus',
    '.el-autocomplete[aria-expanded="true"] .el-input__wrapper',
    '.el-select__wrapper:focus',
    '.el-select__wrapper.is-focus',
    '.el-select__wrapper.is-focused',
    '.el-select-v2__wrapper:focus',
    '.el-select-v2__wrapper.is-focus',
    '.el-select-v2__wrapper.is-focused',
    '.intercom-input .el-select-v2__wrapper.is-focused',
    '.el-dropdown > .el-button:focus',
    '.el-dropdown > .el-button[aria-expanded="true"]',
    '.el-dropdown .el-dropdown__caret-button:focus',
    '.el-dropdown .el-dropdown__caret-button[aria-expanded="true"]',
  ]) {
    const rule = effectiveSelectorListRule(themeCss, selector)
    assert.match(rule, /border-color:\s*var\(--ui-accent\)\s*!important/)
    assert.match(rule, /box-shadow:\s*0 0 0 3px var\(--ui-accent-ring\)\s*!important/)
    assert.doesNotMatch(rule, /background(?:-color)?:\s*var\(--ui-accent\)/)
  }
})
