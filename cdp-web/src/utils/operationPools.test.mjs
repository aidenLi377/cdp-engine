import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOperationPoolExpression,
  buildOperationPools,
  moveNodeToOperationPool,
  moveNodeToOwnOperationPool,
  normalizeOperationPoolNodes,
  removeNodeFromOperationPools,
  setOperationPoolRelation,
  setOperationPoolType,
} from './operationPools.js'

function legacyNodes() {
  return [
    { id: 'a', operator: null },
    { id: 'b', operator: 'n' },
    { id: 'c', operator: 'n' },
  ]
}

test('legacy nodes become one operation pool per node without changing compute', () => {
  const nodes = legacyNodes()
  normalizeOperationPoolNodes(nodes)

  const result = buildOperationPoolExpression(nodes)
  assert.equal(result.compute, '(0)n(1)n(2)')
  assert.deepEqual([...result.fromPoolIdByIndex.values()], [0, 1, 2])
  assert.equal(new Set(nodes.map((node) => node.poolId)).size, 3)
})

test('moving the third node into the second union pool builds official grouped JSON semantics', () => {
  const nodes = legacyNodes()
  normalizeOperationPoolNodes(nodes)
  const secondPoolId = buildOperationPools(nodes)[1].id

  moveNodeToOperationPool(nodes, 2, secondPoolId)
  setOperationPoolType(nodes, secondPoolId, 'u')

  const result = buildOperationPoolExpression(nodes)
  assert.equal(result.compute, '(0)n(1u2)')
  assert.deepEqual([...result.fromPoolIdByIndex.values()], [0, 1, 1])
  assert.equal(nodes[2].operator, null)
})

test('dropping an earlier node on a later node keeps the requested target pool and order', () => {
  const nodes = legacyNodes()
  normalizeOperationPoolNodes(nodes)
  const thirdPoolId = buildOperationPools(nodes)[2].id

  moveNodeToOperationPool(nodes, 0, thirdPoolId, 2)

  assert.deepEqual(nodes.map((node) => node.id), ['b', 'a', 'c'])
  assert.equal(buildOperationPoolExpression(nodes).compute, '(0)n(1n2)')
})

test('pool relation remains separate from the pool internal operator', () => {
  const nodes = legacyNodes()
  normalizeOperationPoolNodes(nodes)
  const thirdPoolId = buildOperationPools(nodes)[2].id

  setOperationPoolType(nodes, thirdPoolId, 'u')
  setOperationPoolRelation(nodes, thirdPoolId, 'd')

  assert.equal(buildOperationPoolExpression(nodes).compute, '(0)n(1)d(2)')
})

test('a pooled node can be split back into its own operation pool', () => {
  const nodes = legacyNodes()
  normalizeOperationPoolNodes(nodes)
  const secondPoolId = buildOperationPools(nodes)[1].id
  moveNodeToOperationPool(nodes, 2, secondPoolId)
  moveNodeToOwnOperationPool(nodes, 2)

  assert.equal(buildOperationPoolExpression(nodes).compute, '(0)n(1)n(2)')
  assert.equal(buildOperationPools(nodes).length, 3)
})

test('removing a pool leader preserves the relation on the next member', () => {
  const nodes = legacyNodes()
  normalizeOperationPoolNodes(nodes)
  const secondPoolId = buildOperationPools(nodes)[1].id
  moveNodeToOperationPool(nodes, 2, secondPoolId)
  setOperationPoolRelation(nodes, secondPoolId, 'd')

  const removed = removeNodeFromOperationPools(nodes, 1)

  assert.equal(removed.id, 'b')
  assert.equal(buildOperationPoolExpression(nodes).compute, '(0)d(1)')
})
