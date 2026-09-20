export const POOL_INTERSECTION = 'n'
export const POOL_UNION = 'u'

const VALID_POOL_OPERATORS = new Set([POOL_INTERSECTION, POOL_UNION])
const VALID_RELATION_OPERATORS = new Set(['n', 'u', 'd'])

function fallbackPoolId(node, index) {
  return `pool_${String(node?.id || index)}`
}

function normalizedPoolId(node, index) {
  const poolId = String(node?.poolId || '').trim()
  return poolId || fallbackPoolId(node, index)
}

function normalizedPoolOperator(value) {
  return VALID_POOL_OPERATORS.has(value) ? value : POOL_INTERSECTION
}

function normalizedRelationOperator(value) {
  return VALID_RELATION_OPERATORS.has(value) ? value : 'n'
}

export function createOperationPoolId(seed = '') {
  const suffix = Math.random().toString(16).slice(2, 8)
  const normalizedSeed = String(seed || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-24)
  return `pool_${normalizedSeed || Date.now()}_${suffix}`
}

export function buildOperationPools(nodes) {
  const source = Array.isArray(nodes) ? nodes : []
  const pools = []
  const poolById = new Map()

  source.forEach((node, index) => {
    const id = normalizedPoolId(node, index)
    let pool = poolById.get(id)
    if (!pool) {
      pool = {
        id,
        type: normalizedPoolOperator(node?.poolOperator),
        operator: pools.length === 0 ? null : normalizedRelationOperator(node?.operator),
        entries: [],
      }
      poolById.set(id, pool)
      pools.push(pool)
    }
    pool.entries.push({ node, index })
  })

  return pools
}

export function normalizeOperationPoolNodes(nodes) {
  const source = Array.isArray(nodes) ? nodes : []
  buildOperationPools(source).forEach((pool, poolIndex) => {
    pool.entries.forEach(({ node }, entryIndex) => {
      node.poolId = pool.id
      node.poolOperator = pool.type
      node.operator = entryIndex === 0
        ? (poolIndex === 0 ? null : normalizedRelationOperator(pool.operator))
        : null
    })
  })
  return source
}

export function setOperationPoolType(nodes, poolId, type) {
  const nextType = normalizedPoolOperator(type)
  buildOperationPools(nodes)
    .find((pool) => pool.id === String(poolId))
    ?.entries.forEach(({ node }) => {
      node.poolOperator = nextType
    })
  return normalizeOperationPoolNodes(nodes)
}

export function setOperationPoolRelation(nodes, poolId, operator) {
  const pools = buildOperationPools(nodes)
  const poolIndex = pools.findIndex((pool) => pool.id === String(poolId))
  if (poolIndex <= 0) return normalizeOperationPoolNodes(nodes)
  pools[poolIndex].entries[0].node.operator = normalizedRelationOperator(operator)
  return normalizeOperationPoolNodes(nodes)
}

function sourcePoolContext(nodes, sourceIndex) {
  return buildOperationPools(nodes).find(
    (pool) => pool.entries.some((entry) => entry.index === sourceIndex),
  ) || null
}

function preserveSourcePoolRelation(sourcePool, movedNode) {
  if (!sourcePool || sourcePool.entries[0]?.node !== movedNode) return
  const nextLeader = sourcePool.entries[1]?.node
  if (nextLeader) nextLeader.operator = sourcePool.operator
}

export function moveNodeToOperationPool(nodes, sourceIndex, targetPoolId, targetIndex = null) {
  const source = Array.isArray(nodes) ? nodes : []
  if (sourceIndex < 0 || sourceIndex >= source.length) return source

  const poolsBefore = buildOperationPools(source)
  const sourcePool = sourcePoolContext(source, sourceIndex)
  const targetPool = poolsBefore.find((pool) => pool.id === String(targetPoolId))
  if (!sourcePool || !targetPool) return source

  const movedNode = source[sourceIndex]
  const targetNodeId = Number.isInteger(targetIndex) ? source[targetIndex]?.id : null
  preserveSourcePoolRelation(sourcePool, movedNode)
  source.splice(sourceIndex, 1)

  const targetEntries = source
    .map((node, index) => ({ node, index }))
    .filter(({ node, index }) => normalizedPoolId(node, index) === targetPool.id)

  let insertIndex = targetEntries.length
    ? targetEntries[targetEntries.length - 1].index + 1
    : source.length
  if (targetNodeId) {
    const requestedIndex = source.findIndex((node) => node?.id === targetNodeId)
    if (requestedIndex >= 0) insertIndex = requestedIndex
  }

  movedNode.poolId = targetPool.id
  movedNode.poolOperator = targetPool.type
  movedNode.operator = null
  source.splice(insertIndex, 0, movedNode)
  return normalizeOperationPoolNodes(source)
}

export function moveNodeToOwnOperationPool(nodes, sourceIndex, relation = 'n') {
  const source = Array.isArray(nodes) ? nodes : []
  if (sourceIndex < 0 || sourceIndex >= source.length) return source

  const sourcePool = sourcePoolContext(source, sourceIndex)
  if (!sourcePool || sourcePool.entries.length <= 1) return normalizeOperationPoolNodes(source)

  const movedNode = source[sourceIndex]
  preserveSourcePoolRelation(sourcePool, movedNode)
  source.splice(sourceIndex, 1)

  const remainingPoolIndexes = source
    .map((node, index) => ({ node, index }))
    .filter(({ node, index }) => normalizedPoolId(node, index) === sourcePool.id)
    .map(({ index }) => index)
  const insertIndex = remainingPoolIndexes.length
    ? Math.max(...remainingPoolIndexes) + 1
    : source.length

  movedNode.poolId = createOperationPoolId(movedNode.id)
  movedNode.poolOperator = POOL_INTERSECTION
  movedNode.operator = normalizedRelationOperator(relation)
  source.splice(insertIndex, 0, movedNode)
  return normalizeOperationPoolNodes(source)
}

export function prepareNodeAsOwnOperationPool(node, relation = 'n') {
  if (!node || typeof node !== 'object') return node
  node.poolId = createOperationPoolId(node.id)
  node.poolOperator = POOL_INTERSECTION
  node.operator = normalizedRelationOperator(relation)
  return node
}

export function removeNodeFromOperationPools(nodes, sourceIndex) {
  const source = Array.isArray(nodes) ? nodes : []
  if (sourceIndex < 0 || sourceIndex >= source.length) return null
  const sourcePool = sourcePoolContext(source, sourceIndex)
  const removedNode = source[sourceIndex]
  preserveSourcePoolRelation(sourcePool, removedNode)
  source.splice(sourceIndex, 1)
  normalizeOperationPoolNodes(source)
  return removedNode
}

export function removeOperationPool(nodes, poolId) {
  const source = Array.isArray(nodes) ? nodes : []
  const targetPoolId = String(poolId)
  const removed = []
  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (normalizedPoolId(source[index], index) !== targetPoolId) continue
    removed.unshift(source.splice(index, 1)[0])
  }
  normalizeOperationPoolNodes(source)
  return removed
}

export function insertOwnPoolNodesAfterPool(nodes, sourceIndex, newNodes, relation = 'u') {
  const source = Array.isArray(nodes) ? nodes : []
  const additions = Array.isArray(newNodes) ? newNodes : []
  if (!additions.length) return source

  const sourcePool = sourcePoolContext(source, sourceIndex)
  const insertIndex = sourcePool?.entries.length
    ? Math.max(...sourcePool.entries.map((entry) => entry.index)) + 1
    : Math.min(sourceIndex + 1, source.length)
  additions.forEach((node) => prepareNodeAsOwnOperationPool(node, relation))
  source.splice(insertIndex, 0, ...additions)
  return normalizeOperationPoolNodes(source)
}

export function buildOperationPoolExpression(nodes) {
  const pools = buildOperationPools(nodes)
  const fromPoolIdByIndex = new Map()
  let compute = ''

  pools.forEach((pool, poolIndex) => {
    const memberIndexes = pool.entries.map(({ index }) => index)
    memberIndexes.forEach((index) => fromPoolIdByIndex.set(index, poolIndex))
    const expression = `(${memberIndexes.join(pool.type)})`
    compute += poolIndex === 0 ? expression : `${normalizedRelationOperator(pool.operator)}${expression}`
  })

  return { compute, fromPoolIdByIndex, pools }
}
