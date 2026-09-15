import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { GUIDED_TUTORIAL_STEPS } from './guidedTutorialConfig.js'
import { TUTORIAL_CATALOG } from './tutorialCatalog.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const generated = JSON.parse(readFileSync(
  resolve(currentDir, '../../../ai_system_capability_catalog.json'),
  'utf8',
))

test('AI system capability knowledge stays synchronized with every tutorial', () => {
  const byId = new Map(generated.capabilities.map(item => [item.id, item]))
  assert.equal(byId.size, TUTORIAL_CATALOG.length + 1)
  assert.ok(generated.systemFeatures.length >= 30)
  assert.ok(byId.has('direct-workbench-audience-build'))
  for (const tutorial of TUTORIAL_CATALOG) {
    const capability = byId.get(tutorial.id)
    assert.ok(capability, `missing AI capability ${tutorial.id}`)
    assert.equal(capability.title, tutorial.title)
    assert.equal(capability.steps.length, GUIDED_TUTORIAL_STEPS[tutorial.id].length)
    assert.ok(capability.execution?.action)
    assert.ok(capability.operationComparison?.value)
  }
})
