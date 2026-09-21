import { buildOperationPools } from './operationPools.js'

const VALID_OPERATORS = new Set(['n', 'u', 'd'])
const VALID_POOL_OPERATORS = new Set(['n', 'u'])

function normalizedNodes(nodes) {
  return Array.isArray(nodes) ? nodes : []
}

export function validateWorkbenchOutput({ nodes, generatedJson, generationStatus = 'ready' }) {
  const items = normalizedNodes(nodes)
  const issues = []

  if (items.length === 0) issues.push('请至少添加一个圈选组件')
  if (items.some((node) => node?._hydrationError)) issues.push('存在加载失败的组件，请移除或重新加载')
  if (items.some((node) => !String(node?.packageType || '').trim())) issues.push('存在未识别的组件类型')
  if (items.some((node) => (
    node?.packageType === '自定义人群'
    && !String(node?.formData?.crowdIds || '').trim()
  ))) issues.push('请填写自定义人群的人群包名称')

  const generatedItems = Array.isArray(generatedJson?.list) ? generatedJson.list : []
  if (items.length > 0 && generationStatus === 'building') {
    issues.push('生成接口正在更新，请稍候')
  } else if (items.length > 0 && generationStatus === 'failed') {
    issues.push('生成接口暂未就绪，请稍后重试')
  } else if (items.length > 0 && generatedItems.length === 0) {
    issues.push('生成结果暂未就绪，请稍后重试')
  }
  if (items.length > 0 && !String(generatedJson?.compute || '').trim()) {
    issues.push('组件关系尚未生成')
  }

  return { valid: issues.length === 0, issues }
}

export function validateSolutionIntegrity({ name, nodes }) {
  const items = normalizedNodes(nodes)
  const pools = buildOperationPools(items)
  const issues = []

  if (!String(name || '').trim()) issues.push('方案名称不能为空')
  if (items.length === 0) issues.push('请至少添加一个组件')
  if (items.some((node) => node?._hydrationError)) issues.push('存在加载失败的组件')
  if (items.some((node) => !String(node?.packageType || '').trim())) issues.push('存在未识别的组件类型')
  if (pools.slice(1).some((pool) => !VALID_OPERATORS.has(pool?.entries?.[0]?.node?.operator))) {
    issues.push('组件之间存在无效的交并差关系')
  }
  if (pools.some((pool) => {
    const configuredType = pool?.entries?.[0]?.node?.poolOperator
    return configuredType != null && !VALID_POOL_OPERATORS.has(configuredType)
  })) {
    issues.push('运算池仅支持交集或并集')
  }

  return {
    valid: issues.length === 0,
    issues,
    summary: {
      nodeCount: items.length,
    },
  }
}
