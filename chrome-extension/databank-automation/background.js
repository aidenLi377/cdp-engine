const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
])

const DATABANK_URL = 'https://databank.tmall.com/#/userDefinedAnalyses'
const PROJECT_MESSAGE_TYPE = 'CDP_AUTOMATE_DATABANK'
const CONTENT_MESSAGE_TYPE = 'AUTOMATE_DATABANK'

function logInfo(message, extra) {
  if (extra !== undefined) {
    console.info(`[Databank Automation][background] ${message}`, extra)
    return
  }
  console.info(`[Databank Automation][background] ${message}`)
}

function logError(message, extra) {
  if (extra !== undefined) {
    console.error(`[Databank Automation][background] ${message}`, extra)
    return
  }
  console.error(`[Databank Automation][background] ${message}`)
}

async function findDatabankTab() {
  const tabs = await chrome.tabs.query({ url: ['https://databank.tmall.com/*'] })
  logInfo('findDatabankTab result', tabs.map((tab) => ({ id: tab.id, url: tab.url, status: tab.status })))
  return tabs[0] || null
}

async function focusTab(tab) {
  if (!tab?.id) return
  await chrome.tabs.update(tab.id, { active: true })
  if (tab.windowId != null) {
    await chrome.windows.update(tab.windowId, { focused: true })
  }
}

async function createDatabankTab() {
  const created = await chrome.tabs.create({ url: DATABANK_URL, active: false })
  logInfo('created databank tab silently', { tabId: created.id, windowId: created.windowId, status: created.status })
  return created
}

async function waitForTabComplete(tabId, retries = 40) {
  for (let index = 0; index < retries; index += 1) {
    const tab = await chrome.tabs.get(tabId)
    logInfo('waitForTabComplete poll', { tabId, attempt: index + 1, status: tab?.status, url: tab?.url })
    if (tab?.status === 'complete') return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('达摩盘页面加载超时')
}

async function ensureContentScriptInjected(tabId) {
  logInfo('inject content script', { tabId })
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  })
  logInfo('content script injected', { tabId })
}

async function sendAutomationToTab(tabId, jsonText, retries = 20) {
  let lastError = null

  for (let index = 0; index < retries; index += 1) {
    try {
      logInfo('send automation message', { tabId, attempt: index + 1, payloadLength: jsonText.length })
      const response = await chrome.tabs.sendMessage(tabId, {
        type: CONTENT_MESSAGE_TYPE,
        jsonText,
      })
      logInfo('received automation response', { tabId, attempt: index + 1, response })
      return response
    } catch (error) {
      lastError = error
      logError('send automation message failed', { tabId, attempt: index + 1, error: error?.message || String(error) })
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  throw lastError || new Error('达摩盘页面脚本未就绪')
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== PROJECT_MESSAGE_TYPE) return

  logInfo('receive project message', {
    senderTabId: sender?.tab?.id,
    senderUrl: sender?.tab?.url || '',
    pageUrl: message?.pageUrl || '',
    jsonLength: String(message?.jsonText || '').length,
  })

  const senderUrl = message.pageUrl || sender.tab?.url || ''
  const senderOrigin = senderUrl ? new URL(senderUrl).origin : ''
  if (!ALLOWED_ORIGINS.has(senderOrigin)) {
    logError('sender origin rejected', { senderOrigin })
    sendResponse({ ok: false, error: '消息来源未被允许' })
    return
  }

  const jsonText = String(message.jsonText || '').trim()
  if (!jsonText) {
    logError('empty jsonText received')
    sendResponse({ ok: false, error: 'jsonText 不能为空' })
    return
  }

  ;(async () => {
    let tab = null
    try {
      tab = await createDatabankTab()
      if (!tab?.id) {
        logError('failed to create databank tab')
        sendResponse({ ok: false, error: '无法打开参数页面' })
        return
      }

      await waitForTabComplete(tab.id)
      await ensureContentScriptInjected(tab.id)
      const result = await sendAutomationToTab(tab.id, jsonText)
      logInfo('automation finished silently', { tabId: tab.id, result })
      sendResponse(result)
    } catch (error) {
      logError('automation execution failed', error)
      if (tab?.id) {
        try {
          const latestTab = await chrome.tabs.get(tab.id)
          await focusTab(latestTab)
          logInfo('focused databank tab after failure', { tabId: tab.id })
        } catch (focusError) {
          logError('failed to focus databank tab after error', focusError)
        }
      }
      sendResponse({ ok: false, error: error?.message || '插件执行失败' })
    }
  })()

  return true
})
