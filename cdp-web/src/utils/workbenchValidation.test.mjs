import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validateSolutionIntegrity,
  validateWorkbenchOutput,
} from './workbenchValidation.js'

test('output validation blocks an empty workbench or an unavailable generation service', () => {
  assert.equal(validateWorkbenchOutput({ nodes: [], generatedJson: {} }).valid, false)
  const result = validateWorkbenchOutput({
    nodes: [{ packageType: '商品行为' }, { packageType: '类目公域行为', operator: 'n' }],
    generatedJson: { list: [{}], compute: '(0)n(1)' },
    generationStatus: 'failed',
  })
  assert.equal(result.valid, false)
  assert.match(result.issues.join('；'), /生成接口暂未就绪/)
})

test('output validation does not infer missing parameters from generated item count', () => {
  const result = validateWorkbenchOutput({
    nodes: [{ packageType: '商品行为' }, { packageType: '类目公域行为', operator: 'n' }],
    generatedJson: { list: [{}], compute: '(0)n(1)' },
    generationStatus: 'ready',
  })
  assert.deepEqual(result, { valid: true, issues: [] })
})

test('copy validation accepts a fully generated workbench', () => {
  const result = validateWorkbenchOutput({
    nodes: [{ packageType: '商品行为' }],
    generatedJson: { list: [{}], compute: '(0)' },
  })
  assert.deepEqual(result, { valid: true, issues: [] })
})

test('publish validation reports invalid relationships and summarizes valid nodes', () => {
  const invalid = validateSolutionIntegrity({
    name: '测试方案',
    nodes: [{ packageType: '商品行为' }, { packageType: '类目公域行为', operator: 'x' }],
  })
  assert.equal(invalid.valid, false)
  assert.match(invalid.issues.join('；'), /无效的交并差关系/)

  const valid = validateSolutionIntegrity({
    name: '测试方案',
    nodes: [{ packageType: '商品行为' }, { packageType: '类目公域行为', operator: 'u' }],
  })
  assert.equal(valid.valid, true)
  assert.equal(valid.summary.nodeCount, 2)
})
