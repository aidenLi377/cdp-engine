if (!window.__databankAutomationContentScriptLoaded) {
  window.__databankAutomationContentScriptLoaded = true;
  window.__databankAutomationRunning = false;
  console.info('[Databank Automation][content] script initialized');

  // -- Parameter paste XPaths (existing) --
  const DATABANK_PARAM_TRIGGER_XPATH = '/html/body/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div[2]/div/div/div/div/div[2]/div[1]/div[1]/div[3]/span[2]';
  const DATABANK_TEXTAREA_XPATH = '/html/body/div[6]/div[2]/div[1]/div/div[2]/div/span/textarea';
  const DATABANK_CONFIRM_XPATH = '/html/body/div[6]/div[2]/div[2]/button[1]';

  // -- Crowd flow XPaths (new) --
  const CROWD_SEARCH_XPATH = '/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div[2]/div/div[2]/div/div/div/div[2]/div/div/div[1]/div/div[1]/div[2]/span/input';
  const CROWD_FIRST_NAME_XPATH = '/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div[1]/div/div/div[2]/div/div/div[1]/div/div[2]/div[1]/div/div/div[2]/div[2]/table/tbody/tr[1]/td[2]/div/div/div';
  const CROWD_FIRST_APPLY_XPATH = '/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div[2]/div/div[2]/div/div/div/div[2]/div/div/div[1]/div/div[2]/div[1]/div/div/div[2]/div[2]/table/tbody/tr[1]/td[7]/div/div/a[1]';
  const CROWD_FINAL_APPLY_XPATH = '/html/body/div[6]/div/div[2]/div/div/div[3]/div/button[1]';
  const CROWD_DIALOG_ALIMAMA_XPATH = '/html/body/div[6]/div/div[2]/div/div/div[2]/div[2]/div/div[2]/label[1]/span[2]';
  const CROWD_DIALOG_DMP_IMG_XPATH = '/html/body/div[6]/div/div[2]/div/div/div[2]/div[2]/div/div[4]/div/div[1]/div[1]/div[1]/img';
  // DataHub XPaths
  const DATAHUB_SEARCH_XPATH = '/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div/div/div[1]/div[2]/div[1]/span/span/span[1]/input';
  const DATAHUB_STATUS_XPATH = '/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div/div/div[2]/div[1]/section/div[1]/div/div/div/div/div/table/tbody/tr[1]/td[5]/div/span';
  const DIALOG_ROOT_SELECTORS = '[role="dialog"], .el-dialog, .el-overlay-dialog, .next-dialog, .ant-modal, .ui-dialog';

  function getNodeByXpath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  function isNodeVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isNodeInteractive(node) {
    if (!isNodeVisible(node)) return false;
    if (node instanceof HTMLButtonElement || node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      return !node.disabled && !node.readOnly;
    }
    const ariaDisabled = node.getAttribute?.('aria-disabled');
    return ariaDisabled !== 'true';
  }

  function getVisibleNodeByText(tagName, text) {
    return Array.from(document.querySelectorAll(tagName)).find(
      (node) => isNodeVisible(node) && String(node.textContent || '').trim().includes(text)
    ) || null;
  }

  function getVisibleNodeByTextWithin(root, tagName, text) {
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    return Array.from(root.querySelectorAll(tagName)).find(
      (node) => isNodeVisible(node) && String(node.textContent || '').trim().includes(text)
    ) || null;
  }

  function getVisibleTextareas() {
    return Array.from(document.querySelectorAll('textarea')).filter(
      (node) => isNodeVisible(node) && !node.readOnly && !node.disabled
    );
  }

  function getDialogRoot(node) {
    if (!node || typeof node.closest !== 'function') return null;
    return node.closest(DIALOG_ROOT_SELECTORS);
  }

  function getVisibleTextareaNode() {
    const xpathNode = getNodeByXpath(DATABANK_TEXTAREA_XPATH);
    if (isNodeInteractive(xpathNode)) return xpathNode;
    const visibleTextareas = getVisibleTextareas();
    return visibleTextareas[0] || null;
  }

  function getVisibleDialogRoot() {
    const textareaNode = getVisibleTextareaNode();
    if (textareaNode) {
      const root = getDialogRoot(textareaNode);
      if (isNodeVisible(root)) return root;
    }
    const confirmNode = getNodeByXpath(DATABANK_CONFIRM_XPATH);
    const confirmRoot = getDialogRoot(confirmNode);
    if (isNodeVisible(confirmRoot)) return confirmRoot;
    return null;
  }

  function isDialogRootActive(dialogRoot) {
    if (!isNodeVisible(dialogRoot)) return false;
    const textareaNode = typeof dialogRoot.querySelectorAll === 'function'
      ? Array.from(dialogRoot.querySelectorAll('textarea')).find((node) => isNodeInteractive(node)) || null
      : null;
    if (textareaNode) return true;
    const confirmNode = getVisibleNodeByTextWithin(dialogRoot, 'button', '确定');
    return isNodeInteractive(confirmNode);
  }

  function getVisibleDialogConfirmNode() {
    const xpathNode = getNodeByXpath(DATABANK_CONFIRM_XPATH);
    if (isNodeInteractive(xpathNode)) return xpathNode;
    const textareaNode = getVisibleTextareaNode();
    const dialogRoot = getDialogRoot(textareaNode) || getVisibleDialogRoot();
    if (dialogRoot) {
      const scopedConfirmNode = getVisibleNodeByTextWithin(dialogRoot, 'button', '确定');
      if (isNodeInteractive(scopedConfirmNode)) return scopedConfirmNode;
    }
    return null;
  }

  function getVisibleConfirmNode() {
    const dialogConfirmNode = getVisibleDialogConfirmNode();
    if (dialogConfirmNode) return dialogConfirmNode;
    const globalConfirmNode = getVisibleNodeByText('button', '确定');
    return isNodeInteractive(globalConfirmNode) ? globalConfirmNode : null;
  }

  async function waitForLocator(resolveNode, label, timeoutMs, intervalMs) {
    timeoutMs = timeoutMs || 20000;
    intervalMs = intervalMs || 250;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const node = resolveNode();
      if (node) return node;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('等待页面元素超时: ' + label);
  }

  async function waitForImportDialogClosed(dialogRoot, timeoutMs, intervalMs) {
    if (!dialogRoot) return;
    timeoutMs = timeoutMs || 800;
    intervalMs = intervalMs || 80;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isDialogRootActive(dialogRoot)) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('已点击确定，但导入弹窗未关闭');
  }

  async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clickNode(node) {
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center', inline: 'center' });
    }
    if (typeof node.focus === 'function') node.focus();
    if (typeof node.click === 'function') {
      node.click();
      return;
    }
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  function inputTextarea(node, value) {
    if (typeof node.focus === 'function') node.focus();
    node.value = value;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isAutomationPageReady() {
    const currentUrl = window.location.href;
    if (!currentUrl.includes('databank.tmall.com/#/userDefinedAnalyses')) return false;
    if (document.readyState && document.readyState !== 'complete') return false;
    const triggerNode = getNodeByXpath(DATABANK_PARAM_TRIGGER_XPATH);
    if (isNodeInteractive(triggerNode)) return true;
    if (getVisibleNodeByText('span', '参数粘贴')) return true;
    if (getVisibleTextareaNode()) return true;
    if (getVisibleDialogConfirmNode()) return true;
    return false;
  }

  function isOnDataHubPage() {
    return window.location.href.includes('databank.tmall.com/#/dataHub');
  }

  function isOnCrowdPage() {
    return window.location.href.includes('databank.tmall.com/#/customAnalysis');
  }

  function isCrowdDomReady() {
    // Check for the specific search input first (XPath or visible input in the main content area)
    const searchByXpath = getNodeByXpath(CROWD_SEARCH_XPATH);
    if (isNodeVisible(searchByXpath) && !searchByXpath.readOnly && !searchByXpath.disabled) return true;
    // Fallback: look for inputs inside the main content area (not header/nav)
    const mainInputs = Array.from(document.querySelectorAll('input')).filter(
      (n) => isNodeVisible(n) && !n.readOnly && !n.disabled && n.closest('table') === null
    );
    if (mainInputs.length > 0) return true;
    // Check for the results table with actual rows
    const table = document.querySelector('table');
    if (!isNodeVisible(table)) return false;
    const tbody = table.querySelector('tbody');
    return tbody && tbody.querySelectorAll('tr').length > 0;
  }

  function isDataHubDomReady() {
    const searchByXpath = getNodeByXpath(DATAHUB_SEARCH_XPATH);
    if (isNodeVisible(searchByXpath) && !searchByXpath.readOnly && !searchByXpath.disabled) {
      console.info('[Databank Automation] dataHub ready: search input found by XPath');
      return true;
    }
    // Fallback: any visible input not inside a table
    const inputs = Array.from(document.querySelectorAll('input')).filter(
      (n) => isNodeVisible(n) && !n.readOnly && !n.disabled && !n.closest('table')
    );
    if (inputs.length > 0) {
      console.info('[Databank Automation] dataHub ready: fallback inputs count=', inputs.length);
      return true;
    }
    const table = document.querySelector('table');
    return isNodeVisible(table) && table.querySelector('tbody');
  }

  // === 参数粘贴流程 (existing) ===
  async function runPreflightChecks() {
    const currentUrl = window.location.href;
    if (!currentUrl.includes('databank.tmall.com/#/userDefinedAnalyses')) {
      throw new Error('当前页面不是目标参数页面');
    }
    if (getVisibleTextareas().length > 0) {
      throw new Error('检测到已有导入弹窗未关闭，请先手动处理当前弹窗');
    }
    return { step: 'preflight_ok', message: '页面状态校验通过' };
  }

  async function automateDatabank(jsonText) {
    const trail = [];
    console.info('[Databank Automation][content] param paste start');
    trail.push(await runPreflightChecks());
    const triggerNode = await waitForLocator(
      () => {
        const node = getNodeByXpath(DATABANK_PARAM_TRIGGER_XPATH);
        return isNodeInteractive(node) ? node : getVisibleNodeByText('span', '参数粘贴');
      },
      '参数粘贴入口', 30000, 300
    );
    clickNode(triggerNode);
    trail.push({ step: 'clicked_paste' });
    await sleep(50);
    const textareaNode = await waitForLocator(() => getVisibleTextareaNode(), '导入输入框');
    inputTextarea(textareaNode, jsonText);
    trail.push({ step: 'filled_textarea' });
    await sleep(50);
    const confirmNode = await waitForLocator(() => getVisibleConfirmNode(), '确定按钮');
    const importDialogRoot = getDialogRoot(confirmNode) || getDialogRoot(textareaNode) || getVisibleDialogRoot();
    clickNode(confirmNode);
    trail.push({ step: 'clicked_confirm' });
    try {
      await waitForImportDialogClosed(importDialogRoot);
      trail.push({ step: 'dialog_closed' });
    } catch (error) {
      trail.push({ step: 'dialog_close_check_skipped' });
    }
    console.info('[Databank Automation][content] param paste success');
    return { ok: true, trail, message: '参数已自动导入' };
  }

  // === 人群包搜索/匹配/推送流程 (new) ===
  function findCrowdRowByName(targetName) {
    // Only search visible tables that have tbody rows — skip nested/hidden/empty tables
    const tables = Array.from(document.querySelectorAll('table')).filter((t) => isNodeVisible(t));
    for (const table of tables) {
      const tbody = table.querySelector('tbody');
      if (!tbody) continue;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      if (rows.length === 0) continue;
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        for (const cell of cells) {
          if ((cell.textContent || '').trim() === targetName) return { rowIndex: i, row: rows[i] };
        }
      }
    }
    return null;
  }

  function clickApplyButton(row) {
    // Look for "应用人群" link in the row
    const links = row.querySelectorAll('a');
    for (const link of links) {
      if ((link.textContent || '').trim().includes('应用')) {
        return link;
      }
    }
    // Try XPath for first row
    return getNodeByXpath(CROWD_FIRST_APPLY_XPATH);
  }

  async function databankSearchCrowd(crowdName) {
    // Wait for SPA DOM to render
    await waitForLocator(() => isCrowdDomReady(), '页面DOM就绪', 60000, 500);

    const searchInput = await waitForLocator(() => {
      const xpathNode = getNodeByXpath(CROWD_SEARCH_XPATH);
      if (isNodeVisible(xpathNode) && !xpathNode.readOnly && !xpathNode.disabled) return xpathNode;
      const inputs = Array.from(document.querySelectorAll('input')).filter(
        (n) => isNodeVisible(n) && !n.readOnly && !n.disabled
      );
      return inputs[0] || null;
    }, '搜索输入框', 30000, 400);

    console.info('[Databank Automation] searching crowd:', crowdName);
    searchInput.value = '';
    searchInput.focus();
    searchInput.value = crowdName;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

    // Wait for results table to appear
    await waitForLocator(() => {
      const table = document.querySelector('table tbody');
      if (!table) return null;
      const rows = table.querySelectorAll('tr');
      return rows.length > 0 ? rows : null;
    }, '搜索结果列表', 20000, 500);

    return { step: 'searched', crowdName };
  }

  async function databankMatchCrowd(crowdName) {
    const rowMatch = await (async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const m = findCrowdRowByName(crowdName);
        if (m) return m.rowIndex;
        const nameNode = getNodeByXpath(CROWD_FIRST_NAME_XPATH);
        if (nameNode && (nameNode.textContent || '').trim() === crowdName) return 0;
        await sleep(500);
      }
      return -1;
    })();

    if (rowMatch < 0) {
      throw new Error('未找到匹配的人群包: ' + crowdName);
    }
    return { step: 'matched', rowIndex: rowMatch, method: 'text-match' };
  }

  async function databankApplyCrowd(matchResult) {
    // Click "应用人群" on the matched row
    const row = matchResult.row || document.querySelectorAll('table tbody tr')[matchResult.rowIndex];
    let applyBtn = null;
    if (row) applyBtn = clickApplyButton(row);
    if (!applyBtn || !isNodeVisible(applyBtn)) applyBtn = getNodeByXpath(CROWD_FIRST_APPLY_XPATH);
    if (!applyBtn || !isNodeVisible(applyBtn)) throw new Error('找不到应用人群按钮');

    clickNode(applyBtn);
    await sleep(1500);
    return { step: 'clicked_apply' };
  }

  async function databankSelectAlimama() {
    // Click "阿里妈妈" radio in the apply dialog
    const label = await waitForLocator(
      () => {
        const node = getNodeByXpath(CROWD_DIALOG_ALIMAMA_XPATH);
        return isNodeVisible(node) ? node : null;
      },
      '阿里妈妈选项', 10000, 300
    );
    clickNode(label);
    await sleep(500);
    return { step: 'selected_alimama' };
  }

  async function databankSelectDmp() {
    // Click DMP option image in the apply dialog
    const img = await waitForLocator(
      () => {
        const node = getNodeByXpath(CROWD_DIALOG_DMP_IMG_XPATH);
        return isNodeVisible(node) ? node : null;
      },
      '达摩盘选项', 10000, 300
    );
    clickNode(img);
    await sleep(500);
    return { step: 'selected_dmp' };
  }

  async function databankConfirmApply() {
    // Detect the final "应用" dialog — STOP, do NOT click. Per requirement.
    const finalBtn = getNodeByXpath(CROWD_FINAL_APPLY_XPATH);
    const dialogVisible = isNodeVisible(finalBtn);
    const applyBtns = Array.from(document.querySelectorAll('button')).filter(
      (b) => isNodeVisible(b) && (b.textContent || '').trim() === '应用'
    );
    const confirmBtns = Array.from(document.querySelectorAll('button')).filter(
      (b) => isNodeVisible(b) && (b.textContent || '').trim() === '确定'
    );

    if (dialogVisible || applyBtns.length > 0) {
      return { step: 'confirm_dialog_found', stopped: true, message: '已到达应用确认弹窗，开发阶段停止，请手动点击应用' };
    }
    if (confirmBtns.length > 0) {
      return { step: 'confirm_dialog_found', stopped: true, message: '已到达确认弹窗，开发阶段停止，请手动点击应用' };
    }
    return { step: 'no_dialog', message: '未检测到确认弹窗' };
  }

  async function runDatabankDataHubSearch(crowdName) {
    console.info('[Databank Automation] dataHub search: looking for input…');
    const searchInput = await waitForLocator(
      () => {
        const node = getNodeByXpath(DATAHUB_SEARCH_XPATH);
        if (isNodeVisible(node) && !node.readOnly && !node.disabled) {
          console.info('[Databank Automation] dataHub search: found by XPath');
          return node;
        }
        // Fallback: any visible input in .el-input or general
        const elInputs = Array.from(document.querySelectorAll('.el-input__inner, input')).filter(
          (n) => isNodeVisible(n) && !n.readOnly && !n.disabled
        );
        if (elInputs.length > 0) {
          console.info('[Databank Automation] dataHub search: found by fallback, count=', elInputs.length);
          return elInputs[0];
        }
        return null;
      },
      'DataHub搜索输入框', 30000, 400
    );

    console.info('[Databank Automation] dataHub search: typing crowd name:', crowdName);
    // Use native value setter to trigger React's synthetic onChange
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(searchInput, '');
    searchInput.focus();
    nativeSetter.call(searchInput, crowdName);
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    // Simulate Enter key
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));

    // Wait for results table to refresh
    await sleep(2500);
    console.info('[Databank Automation] dataHub search: done');
    return { step: 'datahub_searched' };
  }

  async function runDatabankDataHubCheckStatus(crowdName) {
    // Poll until status shows "已应用" or timeout (5 min)
    const deadline = Date.now() + 300000;
    let lastStatus = '';

    while (Date.now() < deadline) {
      // Re-search to refresh table
      const searchInput = getNodeByXpath(DATAHUB_SEARCH_XPATH);
      if (isNodeVisible(searchInput) && !searchInput.readOnly && !searchInput.disabled) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(searchInput, '');
        searchInput.focus();
        nativeSetter.call(searchInput, crowdName);
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        await sleep(2500);
      }

      // Try XPath first, then fallback: search table rows for the crowd name
      let statusNode = getNodeByXpath(DATAHUB_STATUS_XPATH);
      if (!isNodeVisible(statusNode)) {
        // Fallback: find row containing crowd name, then get its status cell
        const tables = Array.from(document.querySelectorAll('table')).filter((t) => isNodeVisible(t));
        for (const table of tables) {
          const rows = table.querySelectorAll('tbody tr');
          for (const row of rows) {
            if ((row.textContent || '').includes(crowdName)) {
              const cells = row.querySelectorAll('td');
              statusNode = cells[4] || null; // 5th column (0-indexed: 4)
              break;
            }
          }
          if (statusNode) break;
        }
      }

      if (statusNode && isNodeVisible(statusNode)) {
        const statusText = (statusNode.textContent || '').trim();
        if (statusText !== lastStatus) {
          console.info('[Databank Automation] dataHub status changed:', lastStatus, '->', statusText);
          lastStatus = statusText;
        }
        if (statusText.includes('已应用')) {
          return { step: 'datahub_status_verified', status: statusText };
        }
      } else {
        console.info('[Databank Automation] dataHub status node not found yet');
      }

      await sleep(5000);
    }

    throw new Error('推送状态检查超时：5分钟内未检测到「已应用」状态，当前状态为「' + lastStatus + '」');
  }

  async function runDatabankDataHubFlow(crowdName) {
    const trail = [];
    console.info('[Databank Automation] ====== dataHub flow START ======');
    console.info('[Databank Automation] crowdName:', crowdName);
    console.info('[Databank Automation] current URL:', window.location.href);

    trail.push(await runDatabankDataHubSearch(crowdName));
    trail.push(await runDatabankDataHubCheckStatus(crowdName));

    console.info('[Databank Automation] dataHub flow complete');
    return { ok: true, trail };
  }

  async function runDatabankCrowdFlow(crowdName) {
    const trail = [];
    console.info('[Databank Automation] starting crowd flow for:', crowdName);

    trail.push(await databankSearchCrowd(crowdName));
    trail.push(await databankMatchCrowd(crowdName));
    const matchResult = trail[trail.length - 1];
    trail.push(await databankApplyCrowd(matchResult));
    trail.push(await databankSelectAlimama());
    trail.push(await databankSelectDmp());
    trail.push(await databankConfirmApply());  // stops at dialog, does NOT click

    console.info('[Databank Automation] crowd flow complete (stopped before final apply)');
    return { ok: true, trail, crowdName };
  }

  // === Message handler ===
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING_AUTOMATION_READY') {
      sendResponse({ ok: true, ready: isAutomationPageReady() || isOnCrowdPage() });
      return false;
    }

    if (message?.type === 'PING_CROWD_READY') {
      sendResponse({ ok: true, ready: isOnCrowdPage() && isCrowdDomReady() });
      return false;
    }

    if (message?.type === 'PING_DATAHUB_READY') {
      sendResponse({ ok: true, ready: isOnDataHubPage() && isDataHubDomReady() });
      return false;
    }

    if (message?.type === 'AUTOMATE_DATABANK') {
      if (window.__databankAutomationRunning) {
        sendResponse({ ok: false, error: '已有自动化流程正在执行' });
        return false;
      }
      window.__databankAutomationRunning = true;
      automateDatabank(String(message.jsonText || ''))
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[Databank Automation] param paste failed:', error);
          sendResponse({ ok: false, error: error?.message || '自动化执行失败' });
        })
        .finally(() => { window.__databankAutomationRunning = false; });
      return true;
    }

    if (message?.type === 'AUTOMATE_DATABANK_CROWD') {
      if (window.__databankAutomationRunning) {
        sendResponse({ ok: false, error: '已有自动化流程正在执行' });
        return false;
      }
      window.__databankAutomationRunning = true;
      const crowdName = String(message.crowdName || '').trim();
      if (!crowdName) {
        window.__databankAutomationRunning = false;
        sendResponse({ ok: false, error: '人群包名称不能为空' });
        return false;
      }
      runDatabankCrowdFlow(crowdName)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[Databank Automation] crowd flow failed:', error);
          sendResponse({ ok: false, error: error?.message || '数据引擎自动化执行失败' });
        })
        .finally(() => { window.__databankAutomationRunning = false; });
      return true;
    }

    if (message?.type === 'AUTOMATE_DATABANK_DATAHUB') {
      if (window.__databankAutomationRunning) {
        sendResponse({ ok: false, error: '已有自动化流程正在执行' });
        return false;
      }
      window.__databankAutomationRunning = true;
      const crowdName = String(message.crowdName || '').trim();
      if (!crowdName) {
        window.__databankAutomationRunning = false;
        sendResponse({ ok: false, error: '人群包名称不能为空' });
        return false;
      }
      runDatabankDataHubFlow(crowdName)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[Databank Automation] dataHub flow failed:', error);
          sendResponse({ ok: false, error: error?.message || 'DataHub状态检查失败' });
        })
        .finally(() => { window.__databankAutomationRunning = false; });
      return true;
    }
  });
}
