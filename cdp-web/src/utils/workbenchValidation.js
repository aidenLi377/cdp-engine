const VALID_OPERATORS = new Set(['n', 'u', 'd'])

function normalizedNodes(nodes) {
  return Array.isArray(nodes) ? nodes : []
}

export function validateWorkbenchOutput({ nodes, generatedJson, generationStatus = 'ready' }) {
  const items = normalizedNodes(nodes)
  const issues = []

  if (items.length === 0) issues.push('请至少添加一个圈选组件')
  if (items.some((node) => node?._hydrationError)) issues.push('存在加载失败的组件，请移除或重新加载')
  if (items.some((node) => !String(node?.packageType || '').trim())) issues.push('存在未识别的组件类型')

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
  const issues = []

  if (!String(name || '').trim()) issues.push('方案名称不能为空')
  if (items.length === 0) issues.push('请至少添加一个组件')
  if (items.some((node) => node?._hydrationError)) issues.push('存在加载失败的组件')
  if (items.some((node) => !String(node?.packageType || '').trim())) issues.push('存在未识别的组件类型')
  if (items.slice(1).some((node) => !VALID_OPERATORS.has(node?.operator))) {
    issues.push('组件之间存在无效的交并差关系')
  }

  return {
    valid: issues.length === 0,
    issues,
    summary: {
      nodeCount: items.length,
    },
  }
}
