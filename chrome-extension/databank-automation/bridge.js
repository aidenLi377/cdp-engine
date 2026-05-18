const PROJECT_MESSAGE_TYPE = 'CDP_AUTOMATE_DATABANK'
const BRIDGE_RESPONSE_SOURCE = 'databank-extension-bridge'

function logInfo(message, extra) {
  if (extra !== undefined) {
    console.info(`[Databank Automation][bridge] ${message}`, extra)
    return
  }
  console.info(`[Databank Automation][bridge] ${message}`)
}

function logError(message, extra) {
  if (extra !== undefined) {
    console.error(`[Databank Automation][bridge] ${message}`, extra)
    return
  }
  console.error(`[Databank Automation][bridge] ${message}`)
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return

  const payload = event.data
  if (payload?.source !== 'cdp-web') return
  if (payload?.type !== PROJECT_MESSAGE_TYPE) return
  logInfo('receive project postMessage', { requestId: payload.requestId, payloadLength: String(payload.jsonText || '').length })

  chrome.runtime.sendMessage(
    {
      type: PROJECT_MESSAGE_TYPE,
      requestId: payload.requestId,
      jsonText: payload.jsonText,
      pageUrl: window.location.href,
    },
    (response) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        logError('runtime.sendMessage failed', runtimeError.message || String(runtimeError))
      } else {
        logInfo('runtime.sendMessage response', response)
      }
      const result = runtimeError
        ? { ok: false, error: runtimeError.message || '插件通信失败' }
        : response || { ok: false, error: '插件未返回结果' }

      logInfo('post bridge response back to page', { requestId: payload.requestId, result })
      window.postMessage(
        {
          source: BRIDGE_RESPONSE_SOURCE,
          requestId: payload.requestId,
          ok: Boolean(result.ok),
          error: result.error || '',
        },
        window.location.origin,
      )
    },
  )
})
