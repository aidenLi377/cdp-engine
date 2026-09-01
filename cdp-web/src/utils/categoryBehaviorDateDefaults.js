export const CATEGORY_PUBLIC_PACKAGE = '类目公域行为'

export const CATEGORY_BEHAVIOR_RECENT_DAYS = Object.freeze({
  购买: 366,
  预售: 180,
  浏览: 30,
  收藏: 90,
  加购: 90,
  评论: 366,
})

const STATE_KEY = '_categoryBehaviorDateState'

function getBehaviors(node) {
  const value = node?.formData?.bhv
  return (Array.isArray(value) ? value : (value ? [value] : []))
    .map((item) => String(item || '').trim())
    .filter((item) => CATEGORY_BEHAVIOR_RECENT_DAYS[item])
}

function getDateFieldKey(node) {
  const schema = Array.isArray(node?.schema) ? node.schema : []
  return schema.find((field) => field?.key === 'time' && field?.Widget_Type === '日期_切换')?.key
    || schema.find((field) => field?.Widget_Type === '日期_切换')?.key
    || 'time'
}

function ensureState(node) {
  if (!node || typeof node !== 'object') return null
  if (!node[STATE_KEY] || typeof node[STATE_KEY] !== 'object') {
    node[STATE_KEY] = {
      initialized: false,
      manual: false,
      manualReason: '',
      appliedDays: null,
    }
  }
  return node[STATE_KEY]
}

export function resolveCategoryBehaviorRecentDays(behaviors) {
  const normalized = (Array.isArray(behaviors) ? behaviors : (behaviors ? [behaviors] : []))
    .map((item) => String(item || '').trim())
    .filter((item) => CATEGORY_BEHAVIOR_RECENT_DAYS[item])
  if (normalized.length === 0) return null
  return Math.min(...normalized.map((item) => CATEGORY_BEHAVIOR_RECENT_DAYS[item]))
}

export function initializeCategoryBehaviorDateState(node, { preserveExisting = false } = {}) {
  if (node?.packageType !== CATEGORY_PUBLIC_PACKAGE) return null
  const state = ensureState(node)
  state.initialized = preserveExisting
  state.manual = preserveExisting
  state.manualReason = preserveExisting ? 'existing' : ''
  state.appliedDays = preserveExisting ? Number(node?.formData?.[getDateFieldKey(node)]?.days) || null : null
  return state
}

export function applyCategoryBehaviorDateDefault(node, { force = false } = {}) {
  if (node?.packageType !== CATEGORY_PUBLIC_PACKAGE) return false
  const behaviors = getBehaviors(node)
  const days = resolveCategoryBehaviorRecentDays(behaviors)
  if (!days) return false

  const state = ensureState(node)
  if (state.manual && !force) return false

  const fieldKey = getDateFieldKey(node)
  if (!node.formData) node.formData = {}
  if (!node.modeData) node.modeData = {}
  const current = node.formData[fieldKey]

  node.modeData[fieldKey] = 'recent'
  node.formData[fieldKey] = {
    ...(current && typeof current === 'object' ? current : {}),
    days,
    dateRange: [],
  }
  state.initialized = true
  state.manual = false
  state.manualReason = ''
  state.appliedDays = days
  return true
}

export function markCategoryBehaviorDateManual(node) {
  if (node?.packageType !== CATEGORY_PUBLIC_PACKAGE) return false
  const state = ensureState(node)
  state.initialized = true
  state.manual = true
  state.manualReason = 'user'
  return true
}

export function getCategoryBehaviorDateMeta(node) {
  if (node?.packageType !== CATEGORY_PUBLIC_PACKAGE) return null
  const behaviors = getBehaviors(node)
  const days = resolveCategoryBehaviorRecentDays(behaviors)
  if (!days) return null

  const state = node?.[STATE_KEY] && typeof node[STATE_KEY] === 'object'
    ? node[STATE_KEY]
    : { manual: false, manualReason: '' }
  if (state.manual) {
    return {
      days,
      manual: true,
      canRestore: true,
      text: state.manualReason === 'existing'
        ? '已保留方案原时间'
        : '已手动调整，切换行为不会覆盖',
    }
  }

  return {
    days,
    manual: false,
    canRestore: false,
    text: behaviors.length > 1
      ? `多行为按最短周期：最近 ${days} 天 · 统计至昨天`
      : `已按“${behaviors[0]}”设为最近 ${days} 天 · 统计至昨天`,
  }
}
