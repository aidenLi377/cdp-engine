if (!window.__databankAutomationContentScriptLoaded) {
  window.__databankAutomationContentScriptLoaded = true
  window.__databankAutomationRunning = false
  console.info('[Databank Automation][content] script initialized')

  const DATABANK_PARAM_TRIGGER_XPATH = '/html/body/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div[2]/div/div/div/div/div[2]/div[1]/div[1]/div[3]/span[2]'
  const DATABANK_TEXTAREA_XPATH = '/html/body/div[6]/div[2]/div[1]/div/div[2]/div/span/textarea'
  const DATABANK_CONFIRM_XPATH = '/html/body/div[6]/div[2]/div[2]/button[1]'

  function getNodeByXpath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
  }

  function getVisibleNodeByText(tagName, text) {
    const nodes = Array.from(document.querySelectorAll(tagName))
    return nodes.find((node) => isNodeVisible(node) && String(node.textContent || '').trim().includes(text)) || null
  }

  function getVisibleTextareas() {
    return Array.from(document.querySelectorAll('textarea')).filter((node) => isNodeVisible(node) && !node.readOnly && !node.disabled)
  }

  function isNodeVisible(node) {
    if (!node || !(node instanceof Element)) return false
    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
    const rect = node.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function isNodeInteractive(node) {
    if (!isNodeVisible(node)) return false
    if (node instanceof HTMLButtonElement || node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      return !node.disabled && !node.readOnly
    }
    const ariaDisabled = node.getAttribute('aria-disabled')
    return ariaDisabled !== 'true'
  }

  async function waitForLocator(resolveNode, label, timeoutMs = 20000, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const node = resolveNode()
      if (node) {
        console.info('[Databank Automation][content] locator ready', label)
        return node
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    throw new Error(`等待页面元素超时: ${label}`)
  }

  async function waitForConfirmButtonRemoved(timeoutMs = 10000, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const byXpath = getNodeByXpath(DATABANK_CONFIRM_XPATH)
      const byText = getVisibleNodeByText('button', '确定')
      if ((!byXpath || !isNodeVisible(byXpath)) && !byText) {
        console.info('[Databank Automation][content] confirm button removed')
        return
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    throw new Error('已点击确定，但导入弹窗未关闭')
  }

  async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  function clickNode(node) {
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center', inline: 'center' })
    }
    if (typeof node.focus === 'function') node.focus()
    if (typeof node.click === 'function') {
      node.click()
      return
    }
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  }

  function inputTextarea(node, value) {
    if (typeof node.focus === 'function') node.focus()
    node.value = value
    node.dispatchEvent(new Event('input', { bubbles: true }))
    node.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async function runPreflightChecks() {
    const currentUrl = window.location.href
    if (!currentUrl.includes('databank.tmall.com/#/userDefinedAnalyses')) {
      throw new Error('当前页面不是目标参数页面')
    }

    if (getVisibleTextareas().length > 0) {
      throw new Error('检测到已有导入弹窗未关闭，请先手动处理当前弹窗')
    }

    return { step: 'preflight_ok', message: '页面状态校验通过' }
  }

  async function automateDatabank(jsonText) {
    const statusTrail = []
    console.info('[Databank Automation][content] automate start', { payloadLength: jsonText.length })

    statusTrail.push(await runPreflightChecks())

    const triggerNode = await waitForLocator(
      () => {
        const node = getNodeByXpath(DATABANK_PARAM_TRIGGER_XPATH)
        return isNodeInteractive(node) ? node : getVisibleNodeByText('span', '参数粘贴')
      },
      '参数粘贴入口',
      30000,
      300,
    )
    console.info('[Databank Automation][content] click 参数粘贴')
    clickNode(triggerNode)
    statusTrail.push({ step: 'clicked_paste', message: '已点击参数粘贴' })

    await sleep(300)

    const textareaNode = await waitForLocator(
      () => {
        const xpathNode = getNodeByXpath(DATABANK_TEXTAREA_XPATH)
        if (isNodeInteractive(xpathNode)) return xpathNode
        const visibleTextareas = getVisibleTextareas()
        return visibleTextareas[0] || null
      },
      '导入输入框',
    )
    console.info('[Databank Automation][content] input textarea')
    inputTextarea(textareaNode, jsonText)
    statusTrail.push({ step: 'filled_textarea', message: '已写入参数内容' })

    await sleep(150)

    const confirmNode = await waitForLocator(
      () => {
        const xpathNode = getNodeByXpath(DATABANK_CONFIRM_XPATH)
        if (isNodeInteractive(xpathNode)) return xpathNode
        return getVisibleNodeByText('button', '确定')
      },
      '确定按钮',
    )
    console.info('[Databank Automation][content] click 确定')
    clickNode(confirmNode)
    statusTrail.push({ step: 'clicked_confirm', message: '已点击确定' })

    await waitForConfirmButtonRemoved()
    statusTrail.push({ step: 'dialog_closed', message: '导入弹窗已关闭' })

    console.info('[Databank Automation][content] automate success')
    return {
      ok: true,
      statusTrail,
      message: '参数已自动导入，请继续在新页面完成后续操作',
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'AUTOMATE_DATABANK') return

    if (window.__databankAutomationRunning) {
      sendResponse({ ok: false, error: '已有自动化流程正在执行，请稍后重试', statusTrail: [] })
      return false
    }

    window.__databankAutomationRunning = true
    console.info('[Databank Automation][content] receive runtime message', {
      payloadLength: String(message.jsonText || '').length,
    })

    automateDatabank(String(message.jsonText || ''))
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[Databank Automation][content] automate failed', error)
        sendResponse({
          ok: false,
          error: error?.message || '自动化执行失败',
          statusTrail: [],
        })
      })
      .finally(() => {
        window.__databankAutomationRunning = false
      })

    return true
  })
}
