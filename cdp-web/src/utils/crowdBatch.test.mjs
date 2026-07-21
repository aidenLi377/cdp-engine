import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCrowdBatch } from './crowdBatch.js'

test('parses crowd names pasted from lines, commas, semicolons and tabs', () => {
  const result = parseCrowdBatch('人群A\n人群B,人群C；人群D\t人群E')

  assert.deepEqual(result.items, ['人群A', '人群B', '人群C', '人群D', '人群E'])
  assert.equal(result.inputCount, 5)
  assert.equal(result.duplicateCount, 0)
})

test('trims, removes blanks and reports exact duplicate names without imposing a limit', () => {
  const names = Array.from({ length: 120 }, (_, index) => `人群包-${index + 1}`)
  const result = parseCrowdBatch(`  ${names.join('\n')}\n人群包-1\n\n`)

  assert.equal(result.items.length, 120)
  assert.equal(result.items.at(-1), '人群包-120')
  assert.equal(result.inputCount, 121)
  assert.equal(result.duplicateCount, 1)
})
