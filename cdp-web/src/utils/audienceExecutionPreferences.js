const STORAGE_PREFIX = 'cdp.audience-execution-preferences.v1'
const VALID_MODES = new Set(['calculate_only', 'create_only', 'create_and_count'])

function getDefaultStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function storageKey(ownerId) {
  return `${STORAGE_PREFIX}:${String(ownerId || '')}`
}

export function getDefaultAudienceExecutionMode(nodeCount) {
  return Number(nodeCount) > 6 ? 'create_and_count' : 'calculate_only'
}

export function loadAudienceExecutionPreferences(
  ownerId,
  groupKey,
  storage = getDefaultStorage(),
) {
  if (!storage || !ownerId || !groupKey) return {}
  try {
    const payload = JSON.parse(storage.getItem(storageKey(ownerId)) || '{}')
    const preferences = payload?.groups?.[groupKey]
    if (!preferences || typeof preferences !== 'object') return {}
    return Object.fromEntries(
      Object.entries(preferences).filter(([, mode]) => VALID_MODES.has(mode)),
    )
  } catch {
    return {}
  }
}

export function saveAudienceExecutionPreference(
  ownerId,
  groupKey,
  entryKey,
  mode,
  storage = getDefaultStorage(),
) {
  if (!storage || !ownerId || !groupKey || !entryKey || !VALID_MODES.has(mode)) return false
  try {
    const key = storageKey(ownerId)
    const payload = JSON.parse(storage.getItem(key) || '{}')
    const groups = payload?.groups && typeof payload.groups === 'object' ? payload.groups : {}
    const current = groups[groupKey] && typeof groups[groupKey] === 'object' ? groups[groupKey] : {}
    storage.setItem(key, JSON.stringify({
      version: 1,
      groups: {
        ...groups,
        [groupKey]: {
          ...current,
          [entryKey]: mode,
        },
      },
    }))
    return true
  } catch {
    return false
  }
}

export { STORAGE_PREFIX as AUDIENCE_EXECUTION_PREFERENCE_PREFIX }
