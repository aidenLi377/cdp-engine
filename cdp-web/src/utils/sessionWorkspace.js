const SESSION_STATE_PREFIX = 'cdp.session.'

function getSessionStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readSessionWorkspace(key, ownerId) {
  const storage = getSessionStorage()
  if (!storage || !ownerId) return null

  try {
    const raw = storage.getItem(`${SESSION_STATE_PREFIX}${key}`)
    if (!raw) return null
    const stored = JSON.parse(raw)
    if (!stored || stored.ownerId !== ownerId || typeof stored.payload !== 'object') {
      return null
    }
    return stored.payload
  } catch {
    return null
  }
}

export function writeSessionWorkspace(key, ownerId, payload) {
  const storage = getSessionStorage()
  if (!storage || !ownerId) return false

  try {
    storage.setItem(
      `${SESSION_STATE_PREFIX}${key}`,
      JSON.stringify({ ownerId, payload }),
    )
    return true
  } catch {
    return false
  }
}

export function removeSessionWorkspace(key) {
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.removeItem(`${SESSION_STATE_PREFIX}${key}`)
  } catch {
    // Ignore unavailable storage and continue with in-memory state.
  }
}

export function clearSessionWorkspace() {
  const storage = getSessionStorage()
  if (!storage) return

  try {
    const keys = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(SESSION_STATE_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    // Session storage is an enhancement; logout must still succeed if it is unavailable.
  }
}

export { SESSION_STATE_PREFIX }
