const STORAGE_PREFIX = 'cdp.audience-schedules.v1'

export const AUDIENCE_SCHEDULE_MISSED_AFTER_MS = 24 * 60 * 60 * 1000
export const AUDIENCE_SCHEDULE_REPEATS = new Set(['once', 'daily', 'weekly'])

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

function toTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizeRepeat(value) {
  return AUDIENCE_SCHEDULE_REPEATS.has(value) ? value : 'once'
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null
  const runAt = toTimestamp(task.runAt)
  if (!task.id || !runAt || !task.snapshot || typeof task.snapshot !== 'object') return null
  return {
    ...task,
    id: String(task.id),
    groupKey: String(task.groupKey || ''),
    groupName: String(task.groupName || '未命名方案组'),
    repeat: normalizeRepeat(task.repeat),
    runAt,
    createdAt: toTimestamp(task.createdAt) || Date.now(),
    updatedAt: toTimestamp(task.updatedAt) || Date.now(),
    status: ['scheduled', 'waiting_environment', 'running', 'missed', 'completed', 'completed_with_errors']
      .includes(task.status)
      ? task.status
      : 'scheduled',
    selectedIndexes: Array.isArray(task.selectedIndexes)
      ? [...new Set(task.selectedIndexes.map(Number).filter(Number.isInteger))]
      : [],
    lastRunAt: toTimestamp(task.lastRunAt) || null,
    nextAttemptAt: toTimestamp(task.nextAttemptAt) || null,
    lastError: String(task.lastError || ''),
    lastResult: String(task.lastResult || ''),
  }
}

export function loadAudienceSchedules(ownerId, storage = getDefaultStorage()) {
  if (!storage || !ownerId) return []
  try {
    const payload = JSON.parse(storage.getItem(storageKey(ownerId)) || '{}')
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks : []
    return tasks.map(normalizeTask).filter(Boolean).sort((a, b) => a.runAt - b.runAt)
  } catch {
    return []
  }
}

export function saveAudienceSchedules(ownerId, tasks, storage = getDefaultStorage()) {
  if (!storage || !ownerId || !Array.isArray(tasks)) return false
  try {
    const normalizedTasks = tasks.map(normalizeTask).filter(Boolean).slice(-50)
    storage.setItem(storageKey(ownerId), JSON.stringify({ version: 1, tasks: normalizedTasks }))
    return true
  } catch {
    return false
  }
}

export function getAudienceScheduleTiming(task, now = Date.now()) {
  const normalized = normalizeTask(task)
  if (!normalized) return { due: false, missed: false, waitMs: Infinity }
  const retryAt = normalized.status === 'waiting_environment' && normalized.nextAttemptAt
    ? normalized.nextAttemptAt
    : normalized.runAt
  const waitMs = retryAt - now
  const missed = normalized.repeat === 'once'
    && normalized.status !== 'running'
    && normalized.status !== 'completed'
    && normalized.status !== 'completed_with_errors'
    && now - normalized.runAt > AUDIENCE_SCHEDULE_MISSED_AFTER_MS
  return {
    due: !missed
      && ['scheduled', 'waiting_environment'].includes(normalized.status)
      && waitMs <= 0,
    missed,
    waitMs,
  }
}

export function nextAudienceScheduleRun(runAt, repeat, now = Date.now()) {
  const normalizedRepeat = normalizeRepeat(repeat)
  if (normalizedRepeat === 'once') return null
  const step = normalizedRepeat === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  let nextRunAt = toTimestamp(runAt)
  if (!nextRunAt) nextRunAt = now + step
  while (nextRunAt <= now) nextRunAt += step
  return nextRunAt
}

export function completeAudienceSchedule(task, {
  now = Date.now(),
  hasErrors = false,
  result = '',
} = {}) {
  const normalized = normalizeTask(task)
  if (!normalized) return null
  const nextRunAt = nextAudienceScheduleRun(normalized.runAt, normalized.repeat, now)
  return {
    ...normalized,
    runAt: nextRunAt || normalized.runAt,
    status: nextRunAt ? 'scheduled' : (hasErrors ? 'completed_with_errors' : 'completed'),
    lastRunAt: now,
    updatedAt: now,
    nextAttemptAt: null,
    lastError: hasErrors ? String(result || '部分任务执行失败') : '',
    lastResult: String(result || (hasErrors ? '部分任务执行失败' : '执行完成')),
  }
}

export function deferAudienceSchedule(task, error, {
  now = Date.now(),
  retryDelayMs = 5 * 60 * 1000,
} = {}) {
  const normalized = normalizeTask(task)
  if (!normalized) return null
  return {
    ...normalized,
    status: 'waiting_environment',
    updatedAt: now,
    nextAttemptAt: now + retryDelayMs,
    lastError: String(error || '等待浏览器与登录环境恢复'),
  }
}

export { STORAGE_PREFIX as AUDIENCE_SCHEDULE_STORAGE_PREFIX }
