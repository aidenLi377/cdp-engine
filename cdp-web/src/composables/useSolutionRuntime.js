import { useCdpShared } from './useCdpShared'
import { buildUsageSections, cleanWorkbenchFieldIds } from '../utils/solutionState.js'

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

export function useSolutionRuntime() {
  const { schemaCache, logicMatrixCache } = useCdpShared()

  function buildInitialNodeState(schema, packageType) {
    const formData = {}
    const modeData = {}

    for (const field of schema) {
      if (field.Widget_Type === '搜索单选') {
        formData[field.key] = ''
      } else if (
        ['搜索多选', '复选组', '下拉多选'].includes(field.Widget_Type) ||
        ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)
      ) {
        formData[field.key] = []
      } else if (field.Widget_Type === '单选组') {
        formData[field.key] = '任意商品标题关键词'
      } else if (field.Widget_Type === '数值_切换') {
        modeData[field.key] = 'unlimited'
        formData[field.key] = { min: null, max: null }
      } else if (field.Widget_Type === '日期_切换') {
        modeData[field.key] = 'recent'
        formData[field.key] = { days: 30, dateRange: [] }
      } else {
        formData[field.key] = ''
      }
    }

    if (packageType === 'AIPL状态' && Object.prototype.hasOwnProperty.call(formData, 'cate')) {
      formData.cate = Array.isArray(formData.cate) ? ['全部'] : '全部'
    }

    if (packageType === '商品行为') {
      if (Object.prototype.hasOwnProperty.call(formData, 'cate')) {
        formData.cate = Array.isArray(formData.cate) ? ['全部'] : '全部'
      }
      if (Object.prototype.hasOwnProperty.call(formData, 'leafCates')) {
        formData.leafCates = Array.isArray(formData.leafCates) ? ['全部'] : '全部'
      }
    }

    return { formData, modeData }
  }

  async function fetchPackageMeta(packageType) {
    if (schemaCache.value[packageType] && logicMatrixCache.value[packageType]) {
      return {
        schema: cloneValue(schemaCache.value[packageType]),
        matrix: cloneValue(logicMatrixCache.value[packageType]),
      }
    }

    const response = await fetch(`/api/meta/${encodeURIComponent(packageType)}`)
    if (!response.ok) {
      throw new Error(`组件元数据加载失败: ${packageType}`)
    }

    const data = await response.json()
    schemaCache.value[packageType] = data.schema || []
    logicMatrixCache.value[packageType] = data.matrix || {}

    return {
      schema: cloneValue(schemaCache.value[packageType]),
      matrix: cloneValue(logicMatrixCache.value[packageType]),
    }
  }

  async function createRuntimeNode(node = {}, index = 0) {
    const packageType = node?.packageType || ''
    const meta = await fetchPackageMeta(packageType)
    const defaults = buildInitialNodeState(meta.schema, packageType)

    return {
      id: node?.id || `node_${Date.now()}_${index}`,
      packageType,
      operator: index === 0 ? null : (node?.operator ?? 'n'),
      schema: meta.schema,
      logicMatrix: meta.matrix,
      formData: { ...defaults.formData, ...(cloneValue(node?.formData) || {}) },
      modeData: { ...defaults.modeData, ...(cloneValue(node?.modeData) || {}) },
      selectedFirstDate: null,
      collapsed: false,
    }
  }

  async function hydrateNodes(nodes) {
    const sourceNodes = Array.isArray(nodes) ? nodes : []
    return Promise.all(sourceNodes.map((node, index) => createRuntimeNode(node, index)))
  }

  function normalizeWorkbenchFieldIds(workbenchFieldIds, nodes) {
    return cleanWorkbenchFieldIds(workbenchFieldIds, nodes)
  }

  function buildRuntimeUsageSections(nodes, workbenchFieldIds) {
    const baseSections = buildUsageSections(nodes, workbenchFieldIds)
    const nodeById = new Map(
      (Array.isArray(nodes) ? nodes : []).map((node) => [String(node?.id), node]),
    )

    return baseSections.map((section) => {
      const runtimeNode = nodeById.get(section.nodeId)
      return {
        ...section,
        node: {
          ...(cloneValue(runtimeNode) || {}),
          id: runtimeNode?.id ?? section.node.id,
          packageType: runtimeNode?.packageType ?? section.node.packageType,
          operator: runtimeNode?.operator ?? section.node.operator,
          formData: cloneValue(runtimeNode?.formData) || cloneValue(section.node.formData) || {},
          modeData: cloneValue(runtimeNode?.modeData) || cloneValue(section.node.modeData) || {},
          logicMatrix: cloneValue(runtimeNode?.logicMatrix) || {},
          selectedFirstDate: runtimeNode?.selectedFirstDate ?? null,
          collapsed: runtimeNode?.collapsed ?? false,
          schema: section.fields,
        },
      }
    })
  }

  return {
    cloneValue,
    buildInitialNodeState,
    fetchPackageMeta,
    createRuntimeNode,
    hydrateNodes,
    normalizeWorkbenchFieldIds,
    buildRuntimeUsageSections,
  }
}
