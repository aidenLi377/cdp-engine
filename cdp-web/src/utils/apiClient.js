const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

function buildUrl(path, params) {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }
  return url.pathname + url.search
}

async function fetchWithTimeout(input, options = {}) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: callerSignal,
    ...fetchOptions
  } = options

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(input, { ...fetchOptions, signal: callerSignal })
  }

  const controller = new AbortController()
  let timedOut = false

  const forwardCallerAbort = () => {
    controller.abort(callerSignal?.reason)
  }

  if (callerSignal?.aborted) {
    forwardCallerAbort()
  } else {
    callerSignal?.addEventListener('abort', forwardCallerAbort, { once: true })
  }

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(input, { ...fetchOptions, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`请求超过 ${Math.max(1, Math.ceil(timeoutMs / 1000))} 秒，请稍后再试`)
      timeoutError.name = 'TimeoutError'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    callerSignal?.removeEventListener('abort', forwardCallerAbort)
  }
}

async function parseResponseBody(response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, options = {}) {
  const { headers, ...fetchOptions } = options
  const response = await fetchWithTimeout(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    ...fetchOptions,
  })

  if (response.status === 204) return null

  const data = await parseResponseBody(response)
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('cdp:auth-required'))
    }
    const message =
      (data && typeof data === 'object' && (data.message || data.error)) ||
      (typeof data === 'string' && data.trim()) ||
      `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return data
}

export { DEFAULT_REQUEST_TIMEOUT_MS, buildUrl, fetchWithTimeout, request }
