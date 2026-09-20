import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(currentDir, 'NormalMode.vue'), 'utf8')
const styles = readFileSync(resolve(currentDir, '../styles/cdp-global.css'), 'utf8')

test('batch automation offers AI names only after final task expansion', () => {
  assert.match(source, /v-if="batchMode" class="batch-automation-picker"/)
  assert.match(source, /AI 生成名称/)
  assert.match(source, /suggestBatchAudienceNames/)
  assert.match(source, /fetchWithTimeout\('\/api\/ai\/batch-names'/)
  assert.match(source, /parameterValues: Array\.isArray\(entry\?\.parameterBatchValues\)/)
  assert.match(source, /parameters: getNodeSummary\(node\)/)
})

test('generated batch names remain editable and block empty or duplicate names', () => {
  assert.match(source, /第 \$\{row\.index \+ 1\} 个人群包名称/)
  assert.match(source, /@update:model-value="value => updateBatchEntryCrowdName/)
  assert.match(source, /getBatchCrowdNameIssue/)
  assert.match(source, /batchAutomationNamesValid/)
  assert.match(source, /请先处理空名称或重复名称/)
})

test('batch naming UI explains no XT prefix and keeps a compact editable queue', () => {
  assert.match(source, /不添加 XT；生成后仍可逐个修改/)
  assert.match(styles, /\.batch-ai-naming-bar/)
  assert.match(styles, /\.batch-run-name-editor/)
  assert.match(styles, /\.batch-run-queue-row\.is-selectable\.has-name-error/)
})
