import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const dynamicFormVue = readFileSync(join(currentDir, 'DynamicForm.vue'), 'utf8')
const css = readFileSync(join(currentDir, '..', 'styles', 'cdp-global.css'), 'utf8')

test('custom field cards render compact +N overflow badges with tooltip content', () => {
  assert.match(normalModeVue, /getCfValueSummaryMeta\(section\)\.primaryText/)
  assert.match(normalModeVue, /getCfValueSummaryMeta\(section\)\.overflowCount > 0/)
  assert.match(normalModeVue, /popper-class="cf-value-tooltip"/)
  assert.match(normalModeVue, /class="cf-use-card-value-row"/)
  assert.match(normalModeVue, /class="cf-type-indicator cf-use-card-dot"/)
  assert.match(normalModeVue, /class="display-body strong cf-use-card-name"/)
  assert.match(normalModeVue, /class="display-mono cf-use-card-more"/)
})

test('custom field card bar uses a horizontal float-rail with stronger interaction styling', () => {
  assert.match(css, /\.cf-cards-bar \{[^}]*overflow-x: auto;[^}]*overflow-y: hidden;/s)
  assert.match(css, /\.cf-cards-bar \{[^}]*padding: 6px 6px 12px 8px;/s)
  assert.match(css, /\.cf-cards-bar \{[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s)
  assert.doesNotMatch(css, /\.cf-cards-bar::(?:before|after)\s*\{/)
  assert.match(css, /\.cf-use-card \{[^}]*position: relative;[^}]*min-height: 50px;/s)
  assert.match(css, /\.cf-use-card::before \{[^}]*transform: translateX\(-130%\);/s)
  assert.match(css, /\.cf-use-card:hover::before \{[^}]*transform: translateX\(135%\);/s)
  assert.match(css, /\.cf-use-card-count \{[^}]*position: absolute;[^}]*top: 7px;[^}]*right: 8px;/s)
  assert.match(css, /\.cf-use-card-more \{[^}]*height: 16px;[^}]*font-size: 9px;/s)
  assert.match(css, /\.cf-value-tooltip \{[^}]*white-space: pre-line;[^}]*border-radius: 14px !important;/s)
})

test('solution-use parameter highlighting stays field-level and reaches the matching summary row', () => {
  const solutionUseStart = normalModeVue.indexOf("workbenchMode === 'solution-use'")
  const freeBuildStart = normalModeVue.indexOf('<div v-else key="free-build"', solutionUseStart)
  const solutionUseTemplate = normalModeVue.slice(solutionUseStart, freeBuildStart)
  const summaryFunctionStart = normalModeVue.indexOf('function isSummaryRowHighlighted')
  const summaryFunctionEnd = normalModeVue.indexOf('\n}', summaryFunctionStart) + 2
  const summaryFunction = normalModeVue.slice(summaryFunctionStart, summaryFunctionEnd)
  const fieldHighlightStart = normalModeVue.indexOf('isFieldHighlighted: (nodeId, fieldKey) => {')
  const fieldHighlightEnd = normalModeVue.indexOf('\n  },', fieldHighlightStart) + 4
  const fieldHighlightCallback = normalModeVue.slice(fieldHighlightStart, fieldHighlightEnd)

  assert.doesNotMatch(solutionUseTemplate, /node-highlighted/)
  assert.match(normalModeVue, /'summary-row-highlighted': highlightedCfId && isSummaryRowHighlighted\(node\.id, item\.key\)/)
  assert.match(summaryFunction, /if \(!highlightedCfId\.value\) return false/)
  assert.match(summaryFunction, /c\.id === highlightedCfId\.value/)
  assert.doesNotMatch(summaryFunction, /collapsedCfId/)
  assert.match(normalModeVue, /'cf-use-card-active': highlightedCfId === section\.customFieldId/)
  assert.match(fieldHighlightCallback, /highlightedCfId\.value/)
})

test('single-field overflow policy is enabled only while using a solution', () => {
  const solutionUseStart = normalModeVue.indexOf("workbenchMode === 'solution-use'")
  const freeBuildStart = normalModeVue.indexOf('<div v-else key="free-build"', solutionUseStart)
  const solutionUseTemplate = normalModeVue.slice(solutionUseStart, freeBuildStart)
  const freeBuildTemplate = normalModeVue.slice(freeBuildStart, normalModeVue.indexOf('<script setup>', freeBuildStart))

  assert.match(solutionUseTemplate, /:overflow-policy="!batchMode \? 'solution-use' : 'legacy'"/)
  assert.match(freeBuildTemplate, /<DynamicForm v-else v-show="!node\.collapsed" :node="node" :node-index="index" @overflow-split="handleOverflowSplit"/)
  assert.doesNotMatch(freeBuildTemplate, /overflow-policy="solution-use"/)
  assert.match(normalModeVue, /const overflows = workbenchMode\.value === 'solution-use'/)
  assert.match(normalModeVue, /if \(workbenchMode\.value !== 'solution-use' \|\| batchMode\.value\) return \[\]/)
})

test('solution-use defers overflow splitting until all other parameters are complete', () => {
  assert.match(dynamicFormVue, /overflowPolicy: \{ type: String, default: 'legacy' \}/)
  assert.match(dynamicFormVue, /function deferSolutionUseOverflow\(node, allOverflows\)/)
  assert.match(dynamicFormVue, /deferred: true/)
  assert.match(dynamicFormVue, /请先完成其他参数，再点击页面顶部的“确认拆分”/)
  assert.match(normalModeVue, /const previewNodes = cloneValue\(nodeList\.value\)/)
  assert.match(normalModeVue, /syncCustomFieldValue\(\s*previewNodes,/)
  assert.match(normalModeVue, /if \(overflowFieldKeys\.length > 1\)/)
  assert.match(normalModeVue, /最后确认拆分 · \{\{ deferredSolutionSplitSummary\.nodeCount \}\} 处/)
  assert.match(normalModeVue, /function confirmDeferredSolutionSplit\(\)/)
  assert.match(normalModeVue, /参数已完成，确认拆分/)
  assert.match(normalModeVue, /拆分节点继承当前全部参数/)
  assert.match(normalModeVue, /if \(payload\?\.deferred\) return/)
  assert.match(normalModeVue, /请先完成其余参数，再点击页面顶部“最后确认拆分”/)
})

test('overflow clones inherit custom-field bindings so later edits stay synchronized', () => {
  const splitStart = normalModeVue.indexOf('function handleOverflowSplit(payload)')
  const splitEnd = normalModeVue.indexOf('\nfunction buildDraftWorkbenchFieldIds', splitStart)
  const splitFunction = normalModeVue.slice(splitStart, splitEnd)

  assert.match(splitFunction, /const sourceBindings = \(cf\.bindings \|\| \[\]\)\.filter\(binding => binding\.nodeId === sourceNode\.id\)/)
  assert.match(splitFunction, /const derivedBindings = splits\.flatMap/)
  assert.match(splitFunction, /nodeId: split\.id/)
  assert.match(splitFunction, /bindings: \[\.\.\.\(cf\.bindings \|\| \[\]\), \.\.\.derivedBindings\]/)
})
