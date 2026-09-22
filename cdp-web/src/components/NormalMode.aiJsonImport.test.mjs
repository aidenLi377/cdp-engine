import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const normalMode = readFileSync(join(currentDir, 'NormalMode.vue'), 'utf8')
const aiDrawer = readFileSync(join(currentDir, 'AiAudienceDrawer.vue'), 'utf8')

test('engine JSON plans replace the workbench without a second confirmation', () => {
  assert.match(aiDrawer, /maxlength="200000"/)
  assert.match(aiDrawer, /直接粘贴数据引擎JSON/)
  assert.match(aiDrawer, /skipReplaceConfirmation: plan\.value\.skipReplaceConfirmation === true/)
  assert.match(
    normalMode,
    /skipReplaceConfirmation = false[\s\S]*?if \(!skipReplaceConfirmation\) \{[\s\S]*?confirmReplaceCanvas/,
  )
  assert.match(normalMode, /const hydratedNodes = await hydrateNodes\(nodes\)/)
  assert.match(normalMode, /if \(hydratedNodes\.some\(node => node\._hydrationError\)\)/)
})
