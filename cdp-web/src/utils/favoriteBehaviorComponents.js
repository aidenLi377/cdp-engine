const STORAGE_KEY_PREFIX = 'cdp.behavior-component-favorites.v1'
const MAX_FAVORITES = 30

function getStorage(storage) {
  if (storage !== undefined) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function storageKey(ownerId) {
  const normalizedOwnerId = String(ownerId || '').trim()
  return normalizedOwnerId
    ? `${STORAGE_KEY_PREFIX}:${encodeURIComponent(normalizedOwnerId)}`
    : ''
}

function normalizeFavorites(packages) {
  if (!Array.isArray(packages)) return []
  return [...new Set(
    packages
      .map(packageName => String(packageName || '').trim())
      .filter(Boolean),
  )].slice(0, MAX_FAVORITES)
}

export function loadFavoriteBehaviorComponents(ownerId, storage) {
  const key = storageKey(ownerId)
  const targetStorage = getStorage(storage)
  if (!key || !targetStorage) return []

  try {
    return normalizeFavorites(JSON.parse(targetStorage.getItem(key) || '[]'))
  } catch {
    return []
  }
}

export function saveFavoriteBehaviorComponents(ownerId, packages, storage) {
  const favorites = normalizeFavorites(packages)
  const key = storageKey(ownerId)
  const targetStorage = getStorage(storage)
  if (!key || !targetStorage) return favorites

  try {
    targetStorage.setItem(key, JSON.stringify(favorites))
  } catch {
    // Favorites are an enhancement; keep the current in-memory selection.
  }
  return favorites
}

export function toggleFavoriteBehaviorComponent(packages, packageName) {
  const normalizedPackages = normalizeFavorites(packages)
  const normalizedPackageName = String(packageName || '').trim()
  if (!normalizedPackageName) return normalizedPackages
  if (normalizedPackages.includes(normalizedPackageName)) {
    return normalizedPackages.filter(item => item !== normalizedPackageName)
  }
  return normalizeFavorites([...normalizedPackages, normalizedPackageName])
}

export { STORAGE_KEY_PREFIX as FAVORITE_BEHAVIOR_COMPONENTS_STORAGE_KEY_PREFIX }
