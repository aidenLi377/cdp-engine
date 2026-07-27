import { isRef, markRaw, toRaw } from 'vue'
import { useCdpShared } from './useCdpShared.js'
import { cleanWorkbenchFieldIds } from '../utils/solutionState.js'
import { fetchWithTimeout } from '../utils/apiClient.js'
import {
  buildMetaVersionKey,
  CONFIG_VERSION_EVENT,
  refreshConfigVersion,
} from '../utils/configVersion.js'

function unwrapCloneValue(value, seen = new WeakMap()) {
  if (isRef(value)) return unwrapCloneValue(value.value, seen)

  const rawValue = toRaw(value)
  if (rawValue == null || typeof rawValue !== 'object') return rawValue
  if (seen.has(rawValue)) return seen.get(rawValue)

  if (Array.isArray(rawValue)) {
    const result = []
    seen.set(rawValue, result)
    rawValue.forEach((item) => result.push(unwrapCloneValue(item, seen)))
    return result
  }

  if (rawValue instanceof Map) {
    const result = new Map()
    seen.set(rawValue, result)
    rawValue.forEach((item, key) => {
      result.set(unwrapCloneValue(key, seen), unwrapCloneValue(item, seen))
    })
    return result
  }

  if (rawValue instanceof Set) {
    const result = new Set()
    seen.set(rawValue, result)
    rawValue.forEach((item) => result.add(unwrapCloneValue(item, seen)))
    return result
  }

  const isPlainObject = Object.getPrototypeOf(rawValue) === Object.prototype
    || Object.getPrototypeOf(rawValue) === null
  if (!isPlainObject) return rawValue

  const result = {}
  seen.set(rawValue, result)
  Object.keys(rawValue).forEach((key) => {
    result[key] = unwrapCloneValue(rawValue[key], seen)
  })
  return result
}

export function cloneValue(value) {
  if (value == null) return value
  return structuredClone(unwrapCloneValue(value))
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
let pendingMetaBundleKey = null
let metaBundleLoadedKey = null
let activeMetaVersionKey = null
const metaBuildId = typeof __CDP_BUILD_ID__ === 'undefined' ? 'local' : __CDP_BUILD_ID__
const runtimeSharedCache = useCdpShared()

function clearRuntimeMetaCache() {
  Object.keys(pendingMetaFetches).forEach((key) => {
    delete pendingMetaFetches[key]
  })
  pendingMetaBundleFetch = null
  pendingMetaBundleKey = null
  metaBundleLoadedKey = null
  runtimeSharedCache.schemaCache.value = {}
  runtimeSharedCache.logicMatrixCache.value = {}
}

function activateConfigVersion(configVersion) {
  const nextKey = buildMetaVersionKey(metaBuildId, configVersion)
  if (nextKey !== activeMetaVersionKey) {
    clearRuntimeMetaCache()
    activeMetaVersionKey = nextKey
  }
  return nextKey
}

async function ensureActiveMetaVersion() {
  return activateConfigVersion(await refreshConfigVersion())
}

if (typeof window !== 'undefined') {
  window.addEventListener(CONFIG_VERSION_EVENT, (event) => {
    activateConfigVersion(event.detail?.version)
  })
}

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

  async function preloadAllPackageMeta() {
    const metaVersionKey = await ensureActiveMetaVersion()
    if (metaBundleLoadedKey === metaVersionKey) {
      return Object.keys(schemaCache.value).length
    }
    if (pendingMetaBundleFetch && pendingMetaBundleKey === metaVersionKey) {
      return pendingMetaBundleFetch
    }

    const request = (async () => {
      const versionQuery = `?v=${encodeURIComponent(metaVersionKey)}`
      const response = await fetchWithTimeout(`/api/meta${versionQuery}`)
      if (!response.ok) throw new Error('组件元数据预加载失败')

      const bundle = await response.json()
      if (activeMetaVersionKey !== metaVersionKey) {
        return preloadAllPackageMeta()
      }
      Object.entries(bundle || {}).forEach(([packageType, data]) => {
        storePackageMeta(packageType, data)
      })
      metaBundleLoadedKey = metaVersionKey
      return Object.keys(bundle || {}).length
    })()

    pendingMetaBundleKey = metaVersionKey
    pendingMetaBundleFetch = request
    try {
      return await request
    } finally {
      if (pendingMetaBundleFetch === request) {
        pendingMetaBundleFetch = null
        pendingMetaBundleKey = null
      }
    }
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
    const metaVersionKey = await ensureActiveMetaVersion()
    const cached = getCachedPackageMeta(packageType)
    if (cached) return cached

    if (pendingMetaBundleFetch && pendingMetaBundleKey === metaVersionKey) {
      try {
        await pendingMetaBundleFetch
      } catch {
        // Fall back to the individual endpoint below.
      }
      const bundled = getCachedPackageMeta(packageType)
      if (bundled) return bundled
    }

    const pendingKey = `${metaVersionKey}:${packageType}`
    if (pendingMetaFetches[pendingKey]) {
      return pendingMetaFetches[pendingKey]
    }

    const promise = (async () => {
      try {
        const versionQuery = `?v=${encodeURIComponent(metaVersionKey)}`
        const response = await fetchWithTimeout(
          `/api/meta/${encodeURIComponent(packageType)}${versionQuery}`,
        )
        if (!response.ok) {
          throw new Error(`组件元数据加载失败: ${packageType}`)
        }

        const data = await response.json()
        if (activeMetaVersionKey !== metaVersionKey) {
          return fetchPackageMeta(packageType)
        }
        return storePackageMeta(packageType, data)
      } finally {
        delete pendingMetaFetches[pendingKey]
      }
    })()

    pendingMetaFetches[pendingKey] = promise
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
