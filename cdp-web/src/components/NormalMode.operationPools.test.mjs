import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalModeVue = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')

test('workbench exposes compact controls for adding intersection and union pools', () => {
  assert.match(normalModeVue, /class="operation-pool-add-bar" aria-label="添加运算池"/)
  assert.match(normalModeVue, /@click="addEmptyOperationPool\('n'\)"/)
  assert.match(normalModeVue, /添加交集运算池/)
  assert.match(normalModeVue, /@click="addEmptyOperationPool\('u'\)"/)
  assert.match(normalModeVue, /添加并集运算池/)
})

test('behavior library items can be dragged directly into a target operation pool', () => {
  assert.match(normalModeVue, /draggable="true"[\s\S]*?@dragstart="onPackageDragStart\(\$event, pkg\)"/)
  assert.match(normalModeVue, /@drop\.prevent="onDropIntoPool\(\$event, pool\.id\)"/)
  assert.match(normalModeVue, /async function addPackageToPool\(packageType, poolId\)/)
  assert.match(normalModeVue, /node\.poolId = targetPool\.id/)
  assert.match(normalModeVue, /node\.poolOperator = targetPool\.type/)
})

test('empty pools stay visual-only until a behavior is dropped into them', () => {
  assert.match(normalModeVue, /const emptyOperationPools = ref\(\[createEmptyOperationPoolDraft\('n'\)\]\)/)
  assert.match(normalModeVue, /const filledOperationPools = computed\(\(\) => buildOperationPools\(nodeList\.value\)\)/)
  assert.match(normalModeVue, /v-for="\(pool, poolIndex\) in filledOperationPools"/)
  assert.match(normalModeVue, /removeEmptyOperationPool\(targetPool\.id\)/)
  assert.match(normalModeVue, /emptyOperationPools: cloneValue\(toRaw\(emptyOperationPools\.value\)\)/)
})

test('a fresh or cleared workbench starts with one intersection pool and fills it first', () => {
  assert.match(normalModeVue, /function resetWorkbenchContext\(\{ withDefaultPool = true \} = \{\}\)/)
  assert.match(normalModeVue, /withDefaultPool \? \[createEmptyOperationPoolDraft\('n'\)\] : \[\]/)
  assert.match(normalModeVue, /const defaultEmptyPool = emptyOperationPools\.value\[0\]/)
  assert.match(normalModeVue, /await addPackageToPool\(packageType, defaultEmptyPool\.id\)/)
})
