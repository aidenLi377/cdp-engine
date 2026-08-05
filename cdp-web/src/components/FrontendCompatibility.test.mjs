import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const componentDir = new URL('.', import.meta.url)
const vueFiles = readdirSync(componentDir)
  .filter((name) => name.endsWith('.vue'))
  .map((name) => ({ name, source: readFileSync(new URL(name, componentDir), 'utf8') }))

test('Element Plus selection controls use value instead of the deprecated label-as-value API', () => {
  const deprecated = []
  const controlTag = /<el-(?:radio|radio-button|checkbox|checkbox-button)\b[^>]*>/g
  for (const file of vueFiles) {
    for (const match of file.source.matchAll(controlTag)) {
      if (/\s(?:v-bind:|:)?label=/.test(match[0]) && !/\s(?:v-bind:|:)?value=/.test(match[0])) {
        deprecated.push(`${file.name}: ${match[0]}`)
      }
    }
  }
  assert.deepEqual(deprecated, [])
})

test('popconfirm reference slots do not target tooltip components with fragment roots', () => {
  const invalid = vueFiles
    .filter((file) => /<template\s+#reference>\s*<el-tooltip\b/s.test(file.source))
    .map((file) => file.name)
  assert.deepEqual(invalid, [])
})
