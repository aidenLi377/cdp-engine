const DEFAULT_RETRY_DELAYS_MS = [0, 400, 1200]

function defaultWait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function createTaskProgressPersistence({ write, wait = defaultWait } = {}) {
  if (typeof write !== 'function') throw new TypeError('write must be a function')

  const pendingWrites = new Map()

  function enqueue(taskId, payload) {
    const id = String(taskId || '').trim()
    if (!id) return Promise.reject(new Error('缺少任务 ID，无法保存任务进度'))

    const previous = pendingWrites.get(id) || Promise.resolve()
    const pending = previous
      .catch(() => undefined)
      .then(() => write(id, payload))

    pendingWrites.set(id, pending)
    pending.then(
      () => { if (pendingWrites.get(id) === pending) pendingWrites.delete(id) },
      () => { if (pendingWrites.get(id) === pending) pendingWrites.delete(id) },
    )
    return pending
  }

  async function save(taskId, payload, options = {}) {
    const retryDelaysMs = Array.isArray(options.retryDelaysMs) && options.retryDelaysMs.length > 0
      ? options.retryDelaysMs
      : DEFAULT_RETRY_DELAYS_MS
    let lastError = null

    for (const rawDelay of retryDelaysMs) {
      const delayMs = Math.max(0, Number(rawDelay) || 0)
      if (delayMs > 0) await wait(delayMs)
      try {
        return await enqueue(taskId, payload)
      } catch (error) {
        lastError = error
      }
    }

    throw lastError || new Error('任务进度保存失败')
  }

  return { enqueue, save }
}

export { DEFAULT_RETRY_DELAYS_MS, createTaskProgressPersistence }
