import { fetchWithTimeout } from './apiClient.js'

export const CONFIG_VERSION_EVENT = 'cdp:config-version-changed'

let currentConfigVersion = null
let pendingVersionRequest = null

export function normalizeConfigVersion(value) {
  const candidate =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value.version
      : value
  const version = Number(candidate)
  return Number.isInteger(version) && version >= 0 ? version : 0
}

export function buildMetaVersionKey(buildId, configVersion) {
  const normalizedBuildId = String(buildId || 'local').trim() || 'local'
  return `${normalizedBuildId}.${normalizeConfigVersion(configVersion)}`
}

function announceConfigVersion(version, previousVersion) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(CONFIG_VERSION_EVENT, {
      detail: { version, previousVersion },
    }),
  )
}

export function adoptConfigVersion(value, { notify = false } = {}) {
  const version = normalizeConfigVersion(value)
  const previousVersion = currentConfigVersion
  if (previousVersion !== null && version < previousVersion) {
    return previousVersion
  }
  currentConfigVersion = version

  if (
    version !== previousVersion &&
    (notify || previousVersion !== null)
  ) {
    announceConfigVersion(version, previousVersion)
  }
  return version
}

export function getKnownConfigVersion() {
  return currentConfigVersion
}

export async function refreshConfigVersion() {
  if (pendingVersionRequest) return pendingVersionRequest

  pendingVersionRequest = (async () => {
    const response = await fetchWithTimeout('/api/config/version', {
      cache: 'no-store',
    })
    if (!response.ok) {
      throw new Error('配置版本检查失败')
    }
    return adoptConfigVersion(await response.json())
  })().finally(() => {
    pendingVersionRequest = null
  })

  return pendingVersionRequest
}

export function resetConfigVersionState() {
  currentConfigVersion = null
  pendingVersionRequest = null
}
