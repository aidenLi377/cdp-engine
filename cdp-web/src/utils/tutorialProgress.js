import { request } from './apiClient.js'

export const TUTORIAL_PROGRESS_EVENT = 'cdp:tutorial-progress-changed'

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
