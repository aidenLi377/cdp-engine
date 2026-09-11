import { request } from './apiClient.js'

export const TUTORIAL_PROGRESS_EVENT = 'cdp:tutorial-progress-changed'
export const TUTORIAL_CHECKPOINT_EVENT = 'cdp:tutorial-checkpoint-changed'
const SESSION_STATE_PREFIX = 'cdp.session.'

export async function fetchTutorialProgress() {
  const items = await request('/api/tutorial-progress', { cache: 'no-store' })
  return Array.isArray(items) ? items : []
}

export async function recordTutorialCompletion(tutorialId) {
  const item = await request(
    `/api/tutorial-progress/${encodeURIComponent(tutorialId)}/complete`,
    { method: 'POST' },
  )
  window.dispatchEvent(new CustomEvent(TUTORIAL_PROGRESS_EVENT, { detail: item }))
  return item
}

export async function fetchTutorialCheckpoints() {
  const items = await request('/api/tutorial-checkpoints', { cache: 'no-store' })
  return Array.isArray(items) ? items : []
}

export function captureTutorialSessionSnapshot() {
  if (typeof window === 'undefined') return {}
  const snapshot = {}
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (!key?.startsWith(SESSION_STATE_PREFIX)) continue
      const value = window.sessionStorage.getItem(key)
      if (typeof value === 'string') snapshot[key] = value
    }
  } catch {
    return {}
  }
  return snapshot
}

export function restoreTutorialSessionSnapshot(snapshot) {
  if (typeof window === 'undefined' || !snapshot || typeof snapshot !== 'object') return false
  try {
    Object.entries(snapshot).forEach(([key, value]) => {
      if (!key.startsWith(SESSION_STATE_PREFIX) || typeof value !== 'string') return
      window.sessionStorage.setItem(key, value)
    })
    return true
  } catch {
    return false
  }
}

export function tutorialSnapshotAppMode(snapshot, fallback = 'workbench') {
  if (!snapshot || typeof snapshot !== 'object') return fallback
  for (const [key, raw] of Object.entries(snapshot)) {
    if (!key.endsWith('app-mode.v1') || typeof raw !== 'string') continue
    try {
      const mode = JSON.parse(raw)?.payload?.mode
      if (['workbench', 'solutions', 'task-center'].includes(mode)) return mode
    } catch {
      // Ignore a damaged entry and use the server-side fallback.
    }
  }
  return fallback
}

export async function recordTutorialCheckpoint(tutorialId, payload) {
  const item = await request(
    `/api/tutorial-checkpoints/${encodeURIComponent(tutorialId)}`,
    { method: 'PUT', body: JSON.stringify(payload) },
  )
  window.dispatchEvent(new CustomEvent(TUTORIAL_CHECKPOINT_EVENT, { detail: item }))
  return item
}

export async function clearTutorialCheckpoint(tutorialId) {
  await request(
    `/api/tutorial-checkpoints/${encodeURIComponent(tutorialId)}`,
    { method: 'DELETE' },
  )
  window.dispatchEvent(new CustomEvent(TUTORIAL_CHECKPOINT_EVENT, {
    detail: { tutorialId, deleted: true },
  }))
}
