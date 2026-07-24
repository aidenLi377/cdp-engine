if (!window.__databankAutomationContentScriptLoaded) {
  window.__databankAutomationContentScriptLoaded = true;
  window.__databankAutomationRunning = false;
  window.__databankAutomationRunId = null;
  window.__databankAutomationCancelled = false;
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
  const CROWD_FINAL_APPLY_SPAN_XPATH = '/html/body/div[6]/div/div[2]/div/div/div[3]/div/button[1]/span';
  const CROWD_DIALOG_ALIMAMA_XPATH = '/html/body/div[6]/div/div[2]/div/div/div[2]/div[2]/div/div[2]/label[1]/span[2]';
  const CROWD_DIALOG_DMP_IMG_XPATH = '/html/body/div[6]/div/div[2]/div/div/div[2]/div[2]/div/div[4]/div/div[1]/div[1]/div[1]/img';
  const PARAM_DIALOG_SETTLE_MS = 700;
  const PARAM_VALUE_SETTLE_MS = 900;
  const PARAM_COMPLETION_SETTLE_MS = 1500;
  const PARAM_PAGE_STABLE_CHECKS = 4;
  const PARAM_PAGE_POLL_MS = 500;
  const PARAM_PAGE_FINAL_SETTLE_MS = 2000;
  const PARAM_PAGE_READY_TIMEOUT_MS = 90000;
  const CROWD_DIALOG_POLL_MS = 500;
  const CROWD_DIALOG_FINAL_SETTLE_MS = 2000;
  const CROWD_DIALOG_READY_TIMEOUT_MS = 60000;
  const CROWD_CONFIRM_SETTLE_MS = 900;
  // DataHub XPaths
  const DATAHUB_SEARCH_XPATH = '/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div/div/div[1]/div[2]/div[1]/span/span/span[1]/input';
  const DATAHUB_STATUS_XPATH = '/html/body/div[2]/div[2]/div[2]/div[2]/div/div/div/div/div[2]/div/div/div[2]/div[1]/section/div[1]/div/div/div/div/div/table/tbody/tr[1]/td[5]/div/span';
  const DIALOG_ROOT_SELECTORS = '[role="dialog"], .el-dialog, .el-overlay-dialog, .next-dialog, .ant-modal, .ui-dialog';
  const CONFIRM_CONTROL_SELECTOR = 'button, [role="button"]';
  const CONFIRM_CONTROL_TEXTS = ['确定', '确认'];
  const PAGE_LOADING_SELECTORS = [
    '.next-loading-mask',
    '.next-loading-indicator',
    '.next-loading-tip',
    '.ant-spin-spinning',
    '.el-loading-mask',
    '.el-loading-spinner',
    '[aria-busy="true"]',
  ];
  let pendingManualApplyControl = null;

  function beginAutomationRun(runId) {
    window.__databankAutomationRunId = String(runId || '');
    window.__databankAutomationCancelled = false;
  }

  function finishAutomationRun(runId) {
    if (window.__databankAutomationRunId === String(runId || '')) {
      window.__databankAutomationRunId = null;
    }
  }

  function cancellationError() {
    const error = new Error('任务已终止');
    error.name = 'AbortError';
    return error;
  }

  function assertAutomationActive() {
    if (window.__databankAutomationCancelled) throw cancellationError();
  }

  function getNodeByXpath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  function isNodeVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    if ('isConnected' in node && !node.isConnected) return false;
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

  function getParamTriggerNode() {
    const xpathNode = getNodeByXpath(DATABANK_PARAM_TRIGGER_XPATH);
    return isNodeInteractive(xpathNode) ? xpathNode : getVisibleNodeByText('span', '参数粘贴');
  }

  function hasVisibleLoadingIndicator(root) {
    const queryRoot = root && typeof root.querySelectorAll === 'function' ? root : document;
    return PAGE_LOADING_SELECTORS.some((selector) =>
      Array.from(queryRoot.querySelectorAll(selector)).some(isNodeVisible)
    );
  }

  function isParamPageLoading() {
    return hasVisibleLoadingIndicator(document);
  }

  function getParamPageSignature() {
    if (!window.location.href.includes('databank.tmall.com/#/userDefinedAnalyses')) return '';
    if (document.readyState && document.readyState !== 'complete') return '';
    if (document.fonts?.status === 'loading') return '';
    if (Array.from(document.images || []).some((image) => !image.complete)) return '';
    if (isParamPageLoading()) return '';

    const triggerNode = getParamTriggerNode();
    if (!isNodeInteractive(triggerNode)) return '';

    const allElementCount = document.querySelectorAll('*').length;
    const visibleControlCount = Array.from(
      document.querySelectorAll('input, textarea, button, [role="button"]')
    ).filter(isNodeVisible).length;
    const bodyTextLength = String(document.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .length;
    const bodyScrollHeight = Number(
      document.body?.scrollHeight || document.documentElement?.scrollHeight || 0
    );

    return [allElementCount, visibleControlCount, bodyTextLength, bodyScrollHeight].join('|');
  }

  async function waitForParamPageInitialized() {
    const deadline = Date.now() + PARAM_PAGE_READY_TIMEOUT_MS;
    let previousSignature = '';
    let stableChecks = 0;

    while (Date.now() < deadline) {
      const signature = getParamPageSignature();
      if (!signature) {
        previousSignature = '';
        stableChecks = 0;
        await sleep(PARAM_PAGE_POLL_MS);
        continue;
      }

      if (signature === previousSignature) stableChecks += 1;
      else stableChecks = 1;
      previousSignature = signature;

      if (stableChecks >= PARAM_PAGE_STABLE_CHECKS) {
        await sleep(PARAM_PAGE_FINAL_SETTLE_MS);
        if (getParamPageSignature() === signature) {
          console.info('[Databank Automation] parameter page is fully settled');
          return { step: 'page_initialized', message: '参数页面已完整加载并保持稳定' };
        }
        previousSignature = '';
        stableChecks = 0;
        continue;
      }

      await sleep(PARAM_PAGE_POLL_MS);
    }

    throw new Error('等待数据引擎参数页面完整加载超时');
  }

  function getVisibleNodeByTextWithin(root, tagName, text) {
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    return Array.from(root.querySelectorAll(tagName)).find(
      (node) => isNodeVisible(node) && String(node.textContent || '').trim().includes(text)
    ) || null;
  }

  function isConfirmControl(node) {
    if (!node) return false;
    const text = String(node.textContent || '').replace(/\s+/g, '');
    return CONFIRM_CONTROL_TEXTS.some((label) => text.includes(label));
  }

  function getVisibleConfirmControlWithin(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    const visibleControls = Array.from(root.querySelectorAll(CONFIRM_CONTROL_SELECTOR)).filter(
      (node) => isNodeVisible(node) && isConfirmControl(node)
    );
    return visibleControls.find((node) => isNodeInteractive(node)) || visibleControls[0] || null;
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
    if ('isConnected' in dialogRoot && !dialogRoot.isConnected) return false;
    const textareaNode = typeof dialogRoot.querySelectorAll === 'function'
      ? Array.from(dialogRoot.querySelectorAll('textarea')).find((node) => isNodeInteractive(node)) || null
      : null;
    if (textareaNode) return true;
    return Boolean(getVisibleConfirmControlWithin(dialogRoot));
  }

  function getVisibleDialogConfirmNode(dialogRoot) {
    const activeDialogRoot = isNodeVisible(dialogRoot) ? dialogRoot : getVisibleDialogRoot();
    if (activeDialogRoot) {
      const scopedConfirmNode = getVisibleConfirmControlWithin(activeDialogRoot);
      if (scopedConfirmNode) return scopedConfirmNode;
    }
    const xpathNode = getNodeByXpath(DATABANK_CONFIRM_XPATH);
    if (isNodeVisible(xpathNode) && (!activeDialogRoot || getDialogRoot(xpathNode) === activeDialogRoot)) return xpathNode;
    return null;
  }

  function getVisibleConfirmNode(dialogRoot) {
    const dialogConfirmNode = getVisibleDialogConfirmNode(dialogRoot);
    if (dialogConfirmNode) return dialogConfirmNode;
    if (dialogRoot) return null;
    const visibleControls = Array.from(document.querySelectorAll(CONFIRM_CONTROL_SELECTOR)).filter(
      (node) => isNodeVisible(node) && isConfirmControl(node)
    );
    return visibleControls.find((node) => isNodeInteractive(node)) || visibleControls[0] || null;
  }

  function describeConfirmState(node, dialogRoot) {
    return {
      dialogFound: Boolean(dialogRoot),
      buttonFound: Boolean(node),
      buttonText: node ? String(node.textContent || '').trim() : '',
      buttonTag: node ? String(node.tagName || '').toLowerCase() : '',
      buttonRole: node?.getAttribute?.('role') || '',
      disabled: Boolean(node && (node.disabled || node.readOnly || node.getAttribute?.('aria-disabled') === 'true')),
    };
  }

  async function waitForEnabledConfirmButton(textareaNode, textareaValue, timeoutMs, intervalMs) {
    timeoutMs = timeoutMs || 30000;
    intervalMs = intervalMs || 250;
    const deadline = Date.now() + timeoutMs;
    let lastDialogRoot = getDialogRoot(textareaNode);
    let lastState = describeConfirmState(null, lastDialogRoot);
    let stableConfirmNode = null;
    let stableInteractiveChecks = 0;

    while (Date.now() < deadline) {
      let liveTextareaNode = getVisibleTextareaNode();
      if (liveTextareaNode && String(liveTextareaNode.value || '') !== textareaValue) {
        inputTextarea(liveTextareaNode, textareaValue);
        liveTextareaNode = getVisibleTextareaNode() || liveTextareaNode;
      }
      const liveDialogRoot = getDialogRoot(liveTextareaNode);
      if (isNodeVisible(liveDialogRoot)) lastDialogRoot = liveDialogRoot;
      if (!isNodeVisible(lastDialogRoot)) lastDialogRoot = getVisibleDialogRoot();

      const confirmNode = getVisibleConfirmNode(lastDialogRoot);
      lastState = describeConfirmState(confirmNode, lastDialogRoot);
      if (confirmNode && isNodeInteractive(confirmNode)) {
        if (stableConfirmNode === confirmNode) stableInteractiveChecks += 1;
        else {
          stableConfirmNode = confirmNode;
          stableInteractiveChecks = 1;
        }
        if (stableInteractiveChecks >= 2) {
          return { confirmNode, dialogRoot: lastDialogRoot, state: lastState };
        }
      } else {
        stableConfirmNode = null;
        stableInteractiveChecks = 0;
      }
      await sleep(intervalMs);
    }

    console.warn('[Databank Automation] confirm button wait timed out', lastState);
    const reason = lastState.buttonFound
      ? '确认按钮可见但未启用'
      : '未找到当前导入弹窗中的确认按钮';
    throw new Error(reason + '，等待超时');
  }

  async function waitForLocator(resolveNode, label, timeoutMs, intervalMs) {
    timeoutMs = timeoutMs || 20000;
    intervalMs = intervalMs || 250;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const node = resolveNode();
      if (node) return node;
      await sleep(intervalMs);
    }
    throw new Error('等待页面元素超时: ' + label);
  }

  async function waitForImportDialogClosed(dialogRoot, timeoutMs, intervalMs) {
    if (!dialogRoot) return;
    timeoutMs = timeoutMs || 10000;
    intervalMs = intervalMs || 150;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isDialogRootActive(dialogRoot)) return;
      await sleep(intervalMs);
    }
    throw new Error('已点击确定，但导入弹窗未关闭');
  }

  async function sleep(ms) {
    const deadline = Date.now() + Math.max(0, Number(ms) || 0);
    while (Date.now() < deadline) {
      assertAutomationActive();
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())));
    }
    assertAutomationActive();
  }

  function clickNode(node) {
    assertAutomationActive();
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
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(node, value);
    else node.value = value;
    const InputEventConstructor = typeof InputEvent === 'function' ? InputEvent : Event;
    node.dispatchEvent(new InputEventConstructor('input', {
      bubbles: true,
      composed: true,
      data: value,
      inputType: 'insertText',
    }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function waitForTextareaValue(initialTextareaNode, value) {
    return await waitForLocator(() => {
      const textareaNode = getVisibleTextareaNode() || initialTextareaNode;
      if (!isNodeInteractive(textareaNode)) return null;
      if (String(textareaNode.value || '') !== value) inputTextarea(textareaNode, value);
      return String(textareaNode.value || '') === value ? textareaNode : null;
    }, '导入内容生效', 10000, 100);
  }

  function isAutomationPageReady() {
    return Boolean(getParamPageSignature());
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
    trail.push(await waitForParamPageInitialized());
    const triggerNode = await waitForLocator(
      () => getParamTriggerNode(),
      '参数粘贴入口', 30000, 300
    );
    clickNode(triggerNode);
    trail.push({ step: 'clicked_paste' });
    const initialTextareaNode = await waitForLocator(() => getVisibleTextareaNode(), '导入输入框');
    await sleep(PARAM_DIALOG_SETTLE_MS);
    inputTextarea(initialTextareaNode, jsonText);
    const textareaNode = await waitForTextareaValue(initialTextareaNode, jsonText);
    trail.push({ step: 'filled_textarea' });
    await sleep(PARAM_VALUE_SETTLE_MS);
    const confirmResult = await waitForEnabledConfirmButton(textareaNode, jsonText);
    const confirmNode = confirmResult.confirmNode;
    const importDialogRoot = confirmResult.dialogRoot || getDialogRoot(confirmNode) || getDialogRoot(textareaNode);
    trail.push({ step: 'confirm_button_ready', ...confirmResult.state });
    clickNode(confirmNode);
    trail.push({ step: 'clicked_confirm' });
    await waitForImportDialogClosed(importDialogRoot);
    trail.push({ step: 'dialog_closed' });
    await sleep(PARAM_COMPLETION_SETTLE_MS);
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

  function getAlimamaCandidateText(node) {
    return [
      node?.textContent,
      node?.getAttribute?.('aria-label'),
      node?.getAttribute?.('title'),
      node?.getAttribute?.('alt'),
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, '')
      .trim();
  }

  function findVisibleAlimamaControl() {
    const xpathNode = getNodeByXpath(CROWD_DIALOG_ALIMAMA_XPATH);
    if (isNodeInteractive(xpathNode)) return xpathNode;

    const visibleDialogRoots = Array.from(document.querySelectorAll(DIALOG_ROOT_SELECTORS))
      .filter(isNodeVisible);
    const searchRoots = visibleDialogRoots.length > 0 ? visibleDialogRoots : [document];
    const candidateSelector = [
      'label',
      '[role="radio"]',
      'button',
      '[role="button"]',
      '[aria-label*="阿里妈妈"]',
      '[title*="阿里妈妈"]',
      'img[alt*="阿里妈妈"]',
      'span',
      'div',
    ].join(', ');

    for (const root of searchRoots) {
      const candidates = Array.from(root.querySelectorAll(candidateSelector))
        .filter((node) => isNodeVisible(node) && getAlimamaCandidateText(node).includes('阿里妈妈'))
        .sort((left, right) => {
          const leftText = getAlimamaCandidateText(left);
          const rightText = getAlimamaCandidateText(right);
          const leftExact = leftText === '阿里妈妈' ? 0 : 1;
          const rightExact = rightText === '阿里妈妈' ? 0 : 1;
          return leftExact - rightExact || leftText.length - rightText.length;
        });

      for (const candidate of candidates) {
        const clickableAncestor = candidate.closest?.(
          'label, [role="radio"], button, [role="button"]'
        );
        if (isNodeInteractive(clickableAncestor)) return clickableAncestor;
        if (isNodeInteractive(candidate)) return candidate;
      }
    }

    return null;
  }

  async function waitForCrowdApplyDialogInitialized() {
    const deadline = Date.now() + CROWD_DIALOG_READY_TIMEOUT_MS;
    let firstVisibleAt = null;

    while (Date.now() < deadline) {
      const currentControl = findVisibleAlimamaControl();
      if (!isNodeInteractive(currentControl)) {
        firstVisibleAt = null;
        await sleep(CROWD_DIALOG_POLL_MS);
        continue;
      }

      const dialogRoot = getDialogRoot(currentControl)
        || currentControl.closest?.('[class*="dialog"], [class*="modal"]');
      if (isNodeVisible(dialogRoot) && hasVisibleLoadingIndicator(dialogRoot)) {
        firstVisibleAt = null;
        await sleep(CROWD_DIALOG_POLL_MS);
        continue;
      }

      if (firstVisibleAt === null) firstVisibleAt = Date.now();
      if (Date.now() - firstVisibleAt >= CROWD_DIALOG_FINAL_SETTLE_MS) {
        // The platform may replace the option node while repainting. Confirm the
        // current live control twice, but do not require it to be the same object.
        await sleep(200);
        const latestControl = findVisibleAlimamaControl();
        if (isNodeInteractive(latestControl)) {
          const latestDialogRoot = getDialogRoot(latestControl)
            || latestControl.closest?.('[class*="dialog"], [class*="modal"]');
          if (!isNodeVisible(latestDialogRoot) || !hasVisibleLoadingIndicator(latestDialogRoot)) {
            console.info('[Databank Automation] Alimama option is ready for click');
            return latestControl;
          }
        }
        firstVisibleAt = null;
      }

      await sleep(CROWD_DIALOG_POLL_MS);
    }

    throw new Error('等待可点击的阿里妈妈选项超时');
  }

  async function databankSelectAlimama() {
    // Click "阿里妈妈" radio in the apply dialog
    const label = await waitForCrowdApplyDialogInitialized();
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

  function findVisibleManualApplyControls() {
    const finalBtn = getNodeByXpath(CROWD_FINAL_APPLY_XPATH);
    const finalSpan = getNodeByXpath(CROWD_FINAL_APPLY_SPAN_XPATH);
    const finalSpanButton = finalSpan?.closest?.('button') || finalSpan;
    const dialogControls = Array.from(document.querySelectorAll(DIALOG_ROOT_SELECTORS))
      .filter((root) => isNodeVisible(root))
      .flatMap((root) => Array.from(root.querySelectorAll(CONFIRM_CONTROL_SELECTOR)))
      .filter((control) => {
        const text = String(control.textContent || '').replace(/\s+/g, '');
        return isNodeVisible(control) && (text === '应用' || text === '确定' || text === '确认');
      });
    return Array.from(new Set([
      ...(isNodeVisible(finalBtn) ? [finalBtn] : []),
      ...(isNodeVisible(finalSpanButton) ? [finalSpanButton] : []),
      ...dialogControls,
    ]));
  }

  async function databankConfirmApply() {
    // Detect the final dialog and stop. The human remains the only actor that
    // can click its 应用/确定 control.
    const control = await waitForLocator(
      () => findVisibleManualApplyControls().find((node) => isNodeInteractive(node)) || null,
      '应用确认按钮', 20000, 300
    );
    pendingManualApplyControl = control;
    return { step: 'confirm_dialog_found', stopped: true, message: '已保留应用确认页面，请稍后手动点击应用' };
  }

  async function waitForApplyDialogClosed(timeoutMs, intervalMs) {
    timeoutMs = timeoutMs || 20000;
    intervalMs = intervalMs || 250;
    const deadline = Date.now() + timeoutMs;
    let absentSince = null;
    while (Date.now() < deadline) {
      const controls = findVisibleManualApplyControls();
      if (controls.length > 0) absentSince = null;
      else if (absentSince === null) absentSince = Date.now();
      else if (Date.now() - absentSince >= 750) return;
      await sleep(intervalMs);
    }
    throw new Error('已点击应用，但确认弹窗未关闭');
  }

  async function databankAutoApply() {
    let control = await waitForLocator(
      () => findVisibleManualApplyControls().find((node) => isNodeInteractive(node)) || null,
      '应用确认按钮', 20000, 300
    );
    pendingManualApplyControl = control;
    await sleep(CROWD_CONFIRM_SETTLE_MS);
    control = findVisibleManualApplyControls().find((node) => isNodeInteractive(node)) || control;
    if (!isNodeInteractive(control)) throw new Error('应用按钮尚未启用，请稍后重试');
    clickNode(control);
    await waitForApplyDialogClosed();
    pendingManualApplyControl = null;
    return { step: 'auto_apply_submitted', message: '已自动点击应用并提交推送' };
  }

  async function waitForManualApplyConfirmation() {
    let controls = findVisibleManualApplyControls();
    if (pendingManualApplyControl && isNodeVisible(pendingManualApplyControl)) {
      controls = Array.from(new Set([pendingManualApplyControl, ...controls]));
    }
    if (controls.length === 0) {
      throw new Error('未检测到应用确认弹窗，请返回 DataBank 页面重试');
    }

    const deadline = Date.now() + 1800000;
    let absentSince = null;
    while (Date.now() < deadline) {
      controls = findVisibleManualApplyControls();
      if (controls.length > 0) {
        pendingManualApplyControl = controls[0];
        absentSince = null;
      } else if (absentSince === null) {
        absentSince = Date.now();
      } else if (Date.now() - absentSince >= 1500) {
        pendingManualApplyControl = null;
        return { step: 'manual_apply_confirmed', message: '已检测到人工确认完成' };
      }
      await sleep(500);
    }
    throw new Error('等待人工确认超时，请确认是否已在 DataBank 页面点击应用');
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

  async function runDatabankCrowdFlow(crowdName, autoApply) {
    const trail = [];
    console.info('[Databank Automation] starting crowd flow for:', crowdName);

    trail.push(await databankSearchCrowd(crowdName));
    trail.push(await databankMatchCrowd(crowdName));
    const matchResult = trail[trail.length - 1];
    trail.push(await databankApplyCrowd(matchResult));
    trail.push(await databankSelectAlimama());
    trail.push(await databankSelectDmp());
    if (autoApply) trail.push(await databankAutoApply());
    else trail.push(await databankConfirmApply());

    console.info('[Databank Automation] crowd flow complete, autoApply=', Boolean(autoApply));
    return { ok: true, trail, crowdName, autoApplied: Boolean(autoApply) };
  }

  // === Message handler ===
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'CANCEL_CDP_AUTOMATION') {
      const targetRunId = String(message.runId || '');
      if (!targetRunId || !window.__databankAutomationRunId || window.__databankAutomationRunId === targetRunId) {
        window.__databankAutomationCancelled = true;
      }
      sendResponse({ ok: true, cancelled: true });
      return false;
    }

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
      beginAutomationRun(message.runId);
      automateDatabank(String(message.jsonText || ''))
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[Databank Automation] param paste failed:', error);
          sendResponse({ ok: false, error: error?.message || '自动化执行失败' });
        })
        .finally(() => {
          window.__databankAutomationRunning = false;
          finishAutomationRun(message.runId);
        });
      return true;
    }

    if (message?.type === 'AUTOMATE_DATABANK_CROWD') {
      if (window.__databankAutomationRunning) {
        sendResponse({ ok: false, error: '已有自动化流程正在执行' });
        return false;
      }
      window.__databankAutomationRunning = true;
      beginAutomationRun(message.runId);
      const crowdName = String(message.crowdName || '').trim();
      if (!crowdName) {
        window.__databankAutomationRunning = false;
        finishAutomationRun(message.runId);
        sendResponse({ ok: false, error: '人群包名称不能为空' });
        return false;
      }
      runDatabankCrowdFlow(crowdName, message.autoApply === true)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[Databank Automation] crowd flow failed:', error);
          sendResponse({ ok: false, error: error?.message || '数据引擎自动化执行失败' });
        })
        .finally(() => {
          window.__databankAutomationRunning = false;
          finishAutomationRun(message.runId);
        });
      return true;
    }

    if (message?.type === 'AUTOMATE_DATABANK_WAIT_APPLY') {
      if (window.__databankAutomationRunning) {
        sendResponse({ ok: false, error: '已有自动化流程正在执行' });
        return false;
      }
      window.__databankAutomationRunning = true;
      beginAutomationRun(message.runId);
      waitForManualApplyConfirmation()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          console.error('[Databank Automation] manual apply wait failed:', error);
          sendResponse({ ok: false, error: error?.message || '等待人工确认失败' });
        })
        .finally(() => {
          window.__databankAutomationRunning = false;
          finishAutomationRun(message.runId);
        });
      return true;
    }

    if (message?.type === 'AUTOMATE_DATABANK_DATAHUB') {
      if (window.__databankAutomationRunning) {
        sendResponse({ ok: false, error: '已有自动化流程正在执行' });
        return false;
      }
      window.__databankAutomationRunning = true;
      beginAutomationRun(message.runId);
      const crowdName = String(message.crowdName || '').trim();
      if (!crowdName) {
        window.__databankAutomationRunning = false;
        finishAutomationRun(message.runId);
        sendResponse({ ok: false, error: '人群包名称不能为空' });
        return false;
      }
      runDatabankDataHubFlow(crowdName)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[Databank Automation] dataHub flow failed:', error);
          sendResponse({ ok: false, error: error?.message || 'DataHub状态检查失败' });
        })
        .finally(() => {
          window.__databankAutomationRunning = false;
          finishAutomationRun(message.runId);
        });
      return true;
    }
  });
}
