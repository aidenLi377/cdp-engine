import { markRaw, toRaw } from 'vue'
import { useCdpShared } from './useCdpShared.js'
import { cleanWorkbenchFieldIds } from '../utils/solutionState.js'
import { fetchWithTimeout } from '../utils/apiClient.js'

function cloneValue(value) {
  if (value == null) return value
  return structuredClone(toRaw(value))
}

export function bindRuntimeUsageSections(baseSections, nodes) {
  const nodeById = new Map(
    (Array.isArray(nodes) ? nodes : []).map((node) => [String(node?.id), node]),
  )

  return (Array.isArray(baseSections) ? baseSections : []).map((section) => {
    const runtimeNode = nodeById.get(section.nodeId)
    if (!runtimeNode) return section

    return {
      ...section,
      node: {
        id: runtimeNode.id,
        displayName: runtimeNode.displayName,
        packageType: runtimeNode.packageType,
        operator: runtimeNode.operator,
        formData: runtimeNode.formData,
        modeData: runtimeNode.modeData,
        logicMatrix: runtimeNode.logicMatrix,
        selectedFirstDate: runtimeNode.selectedFirstDate,
        collapsed: runtimeNode.collapsed,
        schema: section.fields,
      },
    }
  })
}

const pendingMetaFetches = {}
let pendingMetaBundleFetch = null
let metaBundleLoaded = false
const metaBuildId = typeof __CDP_BUILD_ID__ === 'undefined' ? 'local' : __CDP_BUILD_ID__
const metaVersionQuery = `?v=${encodeURIComponent(metaBuildId)}`

export function useSolutionRuntime() {
  const { schemaCache, logicMatrixCache } = useCdpShared()

  function getCachedPackageMeta(packageType) {
    if (
      Object.prototype.hasOwnProperty.call(schemaCache.value, packageType) &&
      Object.prototype.hasOwnProperty.call(logicMatrixCache.value, packageType)
    ) {
      return {
        schema: schemaCache.value[packageType],
        matrix: logicMatrixCache.value[packageType],
      }
    }
    return null
  }

  function storePackageMeta(packageType, data) {
    schemaCache.value[packageType] = markRaw(data?.schema || [])
    logicMatrixCache.value[packageType] = markRaw(data?.matrix || {})
    return getCachedPackageMeta(packageType)
  }

  function preloadAllPackageMeta() {
    if (metaBundleLoaded) return Promise.resolve(Object.keys(schemaCache.value).length)
    if (pendingMetaBundleFetch) return pendingMetaBundleFetch

    pendingMetaBundleFetch = (async () => {
      const response = await fetchWithTimeout(`/api/meta${metaVersionQuery}`)
      if (!response.ok) throw new Error('组件元数据预加载失败')

      const bundle = await response.json()
      Object.entries(bundle || {}).forEach(([packageType, data]) => {
        storePackageMeta(packageType, data)
      })
      metaBundleLoaded = true
      return Object.keys(bundle || {}).length
    })().finally(() => {
      pendingMetaBundleFetch = null
    })

    return pendingMetaBundleFetch
  }

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
    const cached = getCachedPackageMeta(packageType)
    if (cached) return cached

    if (pendingMetaBundleFetch) {
      try {
        await pendingMetaBundleFetch
      } catch {
        // Fall back to the individual endpoint below.
      }
      const bundled = getCachedPackageMeta(packageType)
      if (bundled) return bundled
    }

    if (pendingMetaFetches[packageType]) {
      return pendingMetaFetches[packageType]
    }

    const promise = (async () => {
      try {
        const response = await fetchWithTimeout(
          `/api/meta/${encodeURIComponent(packageType)}${metaVersionQuery}`,
        )
        if (!response.ok) {
          throw new Error(`组件元数据加载失败: ${packageType}`)
        }

        const data = await response.json()
        return storePackageMeta(packageType, data)
      } finally {
        delete pendingMetaFetches[packageType]
      }
    })()

    pendingMetaFetches[packageType] = promise
    return promise
  }

  async function createRuntimeNode(node = {}, index = 0) {
    const packageType = node?.packageType || ''
    const meta = await fetchPackageMeta(packageType)
    const defaults = buildInitialNodeState(meta.schema, packageType)

    return {
      id: node?.id || `node_${Date.now()}_${index}`,
      displayName: typeof node?.displayName === 'string' ? node.displayName : '',
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
    const results = await Promise.allSettled(
      sourceNodes.map((node, index) => createRuntimeNode(node, index))
    )
    const hydrated = []
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        hydrated.push(result.value)
      } else {
        console.error(`节点 ${sourceNodes[i]?.packageType || i} 加载失败:`, result.reason)
        hydrated.push({
          id: sourceNodes[i]?.id || `node_error_${i}`,
          displayName: typeof sourceNodes[i]?.displayName === 'string' ? sourceNodes[i].displayName : '',
          packageType: sourceNodes[i]?.packageType || '未知组件',
          operator: i === 0 ? null : (sourceNodes[i]?.operator ?? 'n'),
          schema: [],
          logicMatrix: {},
          formData: sourceNodes[i]?.formData || {},
          modeData: sourceNodes[i]?.modeData || {},
          collapsed: false,
          _hydrationError: true,
        })
      }
    })
    return hydrated
  }

  function normalizeWorkbenchFieldIds(workbenchFieldIds, nodes) {
    return cleanWorkbenchFieldIds(workbenchFieldIds, nodes)
  }

  return {
    cloneValue,
    createRuntimeNode,
    hydrateNodes,
    normalizeWorkbenchFieldIds,
    preloadAllPackageMeta,
  }
}
