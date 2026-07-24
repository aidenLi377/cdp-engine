if (!window.__dmpAutomationContentScriptLoaded) {
  window.__dmpAutomationContentScriptLoaded = true;
  window.__dmpAutomationRunning = false;
  window.__dmpAutomationRunId = null;
  window.__dmpAutomationCancelled = false;
  console.info('[DMP Automation][content] script initialized');

  const dmpResultCore = globalThis.DmpResultCore;
  let activeCrowdName = '';
  let expandedCrowdRow = null;

  window.addEventListener('DMP_PAYLOAD_INTERCEPTED', async (event) => {
    const options = event?.detail?.payload?.multiGroupOptions;
    if (!Array.isArray(options) || options.length === 0) return;
    const tagId = options[0]?.tagId;
    if (tagId === undefined || tagId === null) return;
    try {
      const stored = await chrome.storage.local.get(['dmpConditionCache']);
      const conditionCache = { ...(stored.dmpConditionCache || {}) };
      conditionCache[String(tagId)] = JSON.parse(JSON.stringify(options));
      await chrome.storage.local.set({ dmpConditionCache: conditionCache });
    } catch (error) {
      console.warn('[DMP Automation] failed to persist condition cache:', error?.message || error);
    }
  });

  const DMP_SEARCH_XPATH = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div[1]/div[4]/div/input';
  const DMP_FIRST_NAME_XPATH = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[1]/td[2]/span';
  const DMP_INITIAL_LIST_STABLE_CHECKS = 4;
  const DMP_INITIAL_LIST_POLL_MS = 500;
  const DMP_INITIAL_LIST_SETTLE_MS = 2000;
  const DMP_INITIAL_LIST_TIMEOUT_MS = 90000;

  function beginAutomationRun(runId) {
    window.__dmpAutomationRunId = String(runId || '');
    window.__dmpAutomationCancelled = false;
  }

  function finishAutomationRun(runId) {
    if (window.__dmpAutomationRunId === String(runId || '')) {
      window.__dmpAutomationRunId = null;
    }
  }

  function cancellationError() {
    const error = new Error('任务已终止');
    error.name = 'AbortError';
    return error;
  }

  function assertAutomationActive() {
    if (window.__dmpAutomationCancelled) throw cancellationError();
  }

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

  function isVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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

  async function waitForLocator(resolveNode, label, timeoutMs, intervalMs) {
    timeoutMs = timeoutMs || 20000;
    intervalMs = intervalMs || 250;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const node = resolveNode();
      if (node) {
        console.info('[DMP Automation][content] locator ready:', label);
        return node;
      }
      await sleep(intervalMs);
    }
    throw new Error('等待页面元素超时: ' + label);
  }

  async function sleep(ms) {
    const deadline = Date.now() + Math.max(0, Number(ms) || 0);
    while (Date.now() < deadline) {
      assertAutomationActive();
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())));
    }
    assertAutomationActive();
  }

  function isOnCrowdListPage() {
    return window.location.href.includes('crowds-new/list');
  }

  function isOnPortraitPage() {
    return window.location.href.includes('insight-new/perspective');
  }

  function isPageDomReady() {
    // Check for any visible meaningful content
    const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(isVisible);
    if (inputs.length > 0) return true;
    const table = document.querySelector('table');
    if (isVisible(table)) return true;
    // On portrait page, look for chart containers or data panels
    const charts = document.querySelectorAll('canvas, svg, .chart, [class*="chart"], [class*="insight"], [class*="perspective"], [class*="analysis"]');
    for (const el of Array.from(charts)) {
      if (isVisible(el)) return true;
    }
    // Fallback: check if body has reasonable content
    if (document.body && document.body.textContent && document.body.textContent.length > 200) return true;
    return false;
  }

  function isCrowdListLoading() {
    const selectors = [
      '.next-loading-mask',
      '.next-loading-indicator',
      '.next-loading-tip',
      '.ant-spin-spinning',
      '.el-loading-mask',
      '[aria-busy="true"]',
    ];
    return selectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some(isVisible)
    );
  }

  function getInitialCrowdListSignature() {
    if (document.readyState !== 'complete' || isCrowdListLoading()) return '';
    const tbody = document.querySelector('table tbody');
    if (!tbody) return '';
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(
      (row) => row.querySelectorAll('td').length > 0
    );
    if (rows.length === 0) return '';
    return rows
      .map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 250))
      .join('|');
  }

  async function waitForCrowdListInitialized() {
    const deadline = Date.now() + DMP_INITIAL_LIST_TIMEOUT_MS;
    let previousSignature = '';
    let stableChecks = 0;

    while (Date.now() < deadline) {
      const signature = getInitialCrowdListSignature();
      if (!signature) {
        previousSignature = '';
        stableChecks = 0;
        await sleep(DMP_INITIAL_LIST_POLL_MS);
        continue;
      }

      if (signature === previousSignature) stableChecks += 1;
      else stableChecks = 1;
      previousSignature = signature;

      if (stableChecks >= DMP_INITIAL_LIST_STABLE_CHECKS) {
        // Leave a final buffer for late SPA initialization requests to finish.
        await sleep(DMP_INITIAL_LIST_SETTLE_MS);
        if (getInitialCrowdListSignature() === signature) {
          console.info('[DMP Automation] initial crowd list is fully settled');
          return true;
        }
        previousSignature = '';
        stableChecks = 0;
        continue;
      }

      await sleep(DMP_INITIAL_LIST_POLL_MS);
    }

    throw new Error('等待达摩盘人群列表初始化完成超时');
  }

  function findCrowdRowByName(targetName) {
    const table = document.querySelector('table tbody');
    if (!table) return -1;
    const rows = table.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      for (const cell of cells) {
        if ((cell.textContent || '').trim() === targetName) return i;
      }
    }
    return -1;
  }

  // XPath for crowd ID cell (from requirements doc)
  const DMP_FIRST_ID_XPATH = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[1]/td[2]/div[1]';

  function extractCrowdId(text) {
    if (!text) return null;
    // Format: "ID：52343402" → extract "52343402"
    const m = text.match(/(\d{5,12})/);
    return m ? m[1] : null;
  }

  function getCrowdIdFromRow(rowIndex) {
    const table = document.querySelector('table tbody');
    if (!table) return null;
    const rows = table.querySelectorAll('tr');
    if (rowIndex >= rows.length) return null;
    const row = rows[rowIndex];

    // Method 1: look for divs in the row containing a number (with optional prefix like "ID：")
    const divs = row.querySelectorAll('td div');
    for (const div of divs) {
      const id = extractCrowdId(div.textContent);
      if (id) return id;
    }

    // Method 2: look for links with crowdId in href
    const links = row.querySelectorAll('a[href*="crowdId"]');
    for (const link of links) {
      const m = (link.href || '').match(/crowdId=(\d+)/);
      if (m) return m[1];
    }

    // Method 3: search entire row text for a 5-12 digit number
    const rowText = (row.textContent || '');
    const matches = rowText.match(/\d{5,12}/g);
    if (matches) return matches[0];

    return null;
  }

  // Click the matched row to expand it and reveal sub-rows (画像透视 entry)
  function clickRowToExpand(rowIndex) {
    const table = document.querySelector('table tbody');
    if (!table) return false;
    const rows = table.querySelectorAll('tr');
    if (rowIndex >= rows.length) return false;
    // Click the name cell to expand
    const nameCell = rows[rowIndex].querySelector('td');
    if (nameCell) {
      clickNode(nameCell);
      expandedCrowdRow = rows[rowIndex];
      return true;
    }
    return false;
  }

  function findPortraitLinkInRow(rowIndex) {
    const table = document.querySelector('table tbody');
    if (!table) return null;
    const rows = table.querySelectorAll('tr');
    const start = Math.max(0, rowIndex - 1);
    const end = Math.min(rows.length, rowIndex + 3);
    for (let i = start; i < end; i++) {
      const links = rows[i].querySelectorAll('a');
      for (const link of links) {
        if ((link.textContent || '').trim().includes('画像透视')) return link;
      }
    }
    return null;
  }

  function findPortraitLinkGlobally() {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (isVisible(link) && (link.textContent || '').trim().includes('画像透视')) return link;
    }
    return null;
  }

  // ============= Phase 1: Search + Match + Find Portrait =============

  async function phase1SearchAndMatch(crowdName) {
    const trail = [];
    activeCrowdName = crowdName;

    // The search input renders before the SPA finishes its default list request.
    // Wait for the full list to settle so the late initialization response cannot overwrite our search.
    await waitForCrowdListInitialized();

    // Find search input
    const searchInput = await waitForLocator(() => {
      const xpathNode = getNodeByXpath(DMP_SEARCH_XPATH);
      if (isVisible(xpathNode) && !xpathNode.readOnly && !xpathNode.disabled) return xpathNode;
      const inputs = Array.from(document.querySelectorAll('input')).filter(
        (n) => isVisible(n) && !n.readOnly && !n.disabled
      );
      return inputs[0] || null;
    }, '搜索输入框', 30000, 400);

    // Type search query
    console.info('[DMP Automation] searching crowd:', crowdName);
    searchInput.value = '';
    searchInput.focus();
    searchInput.value = crowdName;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    trail.push({ step: 'searched', crowdName });

    // Wait for results table
    await waitForLocator(() => {
      const table = document.querySelector('table tbody');
      if (!table) return null;
      const rows = table.querySelectorAll('tr');
      return rows.length > 0 ? rows : null;
    }, '搜索结果列表', 20000, 500);
    // Match exact crowd name
    const rowMatch = await (async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const idx = findCrowdRowByName(crowdName);
        if (idx >= 0) return idx;
        const nameNode = getNodeByXpath(DMP_FIRST_NAME_XPATH);
        if (nameNode && (nameNode.textContent || '').trim() === crowdName) return 0;
        await sleep(500);
      }
      return -1;
    })();

    if (rowMatch < 0) {
      throw new Error('未找到匹配的人群包: ' + crowdName);
    }

    // Extract crowdId immediately from the matched row
    const crowdId = getCrowdIdFromRow(rowMatch);
    trail.push({ step: 'matched', crowdId, rowIndex: rowMatch });

    // Click row to expand — needed for portrait entry to appear later
    clickRowToExpand(rowMatch);
    trail.push({ step: 'row_expanded' });

    console.info('[DMP Automation] phase 1 complete, crowdId:', crowdId);
    return { ok: true, phase: 1, trail, crowdId, crowdName, rowIndex: rowMatch };
  }

  // ============= Phase 2: Wait for Portrait Entry =============

  async function phase2WaitPortrait(phase1Result = {}) {
    console.info('[DMP Automation] Phase 2: waiting for 画像透视 entry...');
    const targetName = String(phase1Result.crowdName || activeCrowdName || '').trim();
    const initialRowIndex = Number.isInteger(Number(phase1Result.rowIndex))
      ? Number(phase1Result.rowIndex)
      : -1;
    await waitForLocator(
      () => {
        // Search by text content — the button always has "画像透视" text, works regardless of row position
        const spans = Array.from(document.querySelectorAll('span, a')).filter(
          (n) => isVisible(n) && (n.textContent || '').trim() === '画像透视'
        );
        if (spans.length > 0) return true;

        const rowIndex = targetName ? findCrowdRowByName(targetName) : initialRowIndex;
        if (rowIndex < 0) return null;
        const table = document.querySelector('table tbody');
        const currentRow = table?.querySelectorAll('tr')?.[rowIndex] || null;
        if (currentRow && currentRow !== expandedCrowdRow) clickRowToExpand(rowIndex);
        const portraitLink = findPortraitLinkInRow(rowIndex);
        return isVisible(portraitLink) ? true : null;
      },
      '画像透视入口', 1800000, 10000
    );
    console.info('[DMP Automation] portrait entry found');
    return { ok: true, step: 'portrait_found' };
  }

  // ============= Phase 3: Enter Portrait + Extract Data =============
  let tagsDict = []; // loaded lazily

  async function loadTagsDict() {
    if (tagsDict.length > 0) return tagsDict;
    try {
      const resp = await fetch(chrome.runtime.getURL('dmp_tags_dictionary.json'));
      tagsDict = await resp.json();
    } catch (e) {
      console.warn('[DMP Automation] failed to load tags dictionary:', e.message);
    }
    return tagsDict;
  }

  async function phase2EnterAndExtract(result, selectedTags) {
    const trail = [];
    const crowdId = result.crowdId;

    if (!crowdId) {
      throw new Error('缺少 crowdId');
    }

    // Background already navigated the tab to the portrait page.
    // Wait for DOM to be fully ready.
    await waitForLocator(
      () => isOnPortraitPage() && isPageDomReady(),
      '画像透视页面就绪',
      90000,
      500
    );
    trail.push({ step: 'entered_portrait', crowdId });

    // Wait for hook.js to intercept an API payload
    console.info('[DMP Automation] waiting for API payload interception...');
    const payload = await waitForInterceptedPayload(15000);
    if (!payload) {
      trail.push({ step: 'no_payload', message: '未拦截到透视API请求，请确认页面已登录' });
      return { ok: false, phase: 2, trail, crowdId, extracted: false, error: '未拦截到API凭证' };
    }
    trail.push({ step: 'payload_intercepted' });

    // Load tags dictionary for category info
    await loadTagsDict();
    const tagIds = (selectedTags && selectedTags.length > 0) ? selectedTags : ['160571', '114555', '114554'];
    if (!dmpResultCore) throw new Error('DMP计算核心未加载，请重新加载扩展后重试');

    const stored = await chrome.storage.local.get(['dmpConditionCache', 'rebaseExcludedTagIds']);
    const conditionCache = stored.dmpConditionCache || {};
    const rebaseExcludedTagIds = Array.isArray(stored.rebaseExcludedTagIds)
      ? stored.rebaseExcludedTagIds.map(String)
      : [];

    // The original plugin calculates row coverage from this number, so it must
    // be captured before the tag requests and result normalization.
    const crowdCount = await readCoverageCount();
    if (crowdCount) trail.push({ step: 'crowd_count', count: crowdCount });

    // Extract data for each tag using intercepted credentials (same approach as DMP Plugin)
    console.info('[DMP Automation] extracting data for', tagIds.length, 'tags');
    const rawResults = [];
    for (const tagId of tagIds) {
      const tagInfo = tagsDict.find((tag) => String(tag.tagId) === String(tagId)) || {};
      const request = dmpResultCore.buildRequest(payload, tagId, tagInfo, conditionCache);
      if (!request.ok) {
        rawResults.push(buildWarningRow(tagInfo, tagId, '⚠️ 未配置下钻条件'));
        continue;
      }
      try {
        const tagData = await fetchTagDataFull(request, tagInfo, tagId);
        if (tagData) rawResults.push(...tagData);
      } catch (e) {
        rawResults.push(buildWarningRow(tagInfo, tagId, '⚠️ 提取失败: ' + e.message));
      }
    }

    const finalResults = dmpResultCore.finalizeRows(rawResults, crowdCount, rebaseExcludedTagIds);
    trail.push({ step: 'data_extracted', tagCount: tagIds.length, resultCount: finalResults.length });

    return { ok: true, phase: 2, trail, crowdId, crowdCount: crowdCount || null, extracted: true, results: finalResults };
  }

  function buildWarningRow(tagInfo, tagId, detail) {
    return {
      '所属大类': tagInfo.mainCategory || '未知大类',
      '标签类型': tagInfo.category || '未知类型',
      '标签名称': (tagInfo.tagName || tagId) + ' ❌',
      '特征明细': detail,
      '人群占比': '-',
      'CTR': '-',
      'PPC': '-',
      '_dictTagId': String(tagId),
    };
  }

  async function readCoverageCount() {
    try {
      const countXpath = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div/div[1]/div[3]/div[2]/strong';
      const countNode = await waitForLocator(() => {
        const node = document.evaluate(countXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return node?.textContent?.trim() ? node : null;
      }, '覆盖人数元素', 20000, 500);
      const count = Number.parseInt(String(countNode.textContent || '').replace(/[^\d.]/g, ''), 10);
      if (Number.isFinite(count) && count > 0) {
        console.info('[DMP Automation] crowdCount:', count);
        return count;
      }
    } catch (error) {
      console.warn('[DMP Automation] crowdCount not found:', error?.message || error);
    }
    return null;
  }

  async function waitForInterceptedPayload(timeoutMs) {
    if (window.__DMP_PAYLOAD__) return window.__DMP_PAYLOAD__;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      const handler = (e) => {
        clearTimeout(timeout);
        window.removeEventListener('DMP_PAYLOAD_INTERCEPTED', handler);
        resolve(e.detail);
      };
      window.addEventListener('DMP_PAYLOAD_INTERCEPTED', handler);
    });
  }

  async function fetchTagDataFull(request, tagInfo, tagId) {
    const mainCat = tagInfo.mainCategory || '未知大类';
    const subCat = tagInfo.category || '未知类型';

    const resp = await fetch(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify(request.body),
    });
    const json = await resp.json();
    if (json?.data?.chartDataFull) {
      return json.data.chartDataFull.map((it) => ({
        '所属大类': mainCat,
        '标签类型': subCat,
        '标签名称': it.tagName || '-',
        '特征明细': it.optionName || '-',
        '人群占比': `${Number.parseFloat(it.rate || 0) * 100}%`,
        'CTR': it.ctrIndex || '-',
        'PPC': it.ppcIndex || '-',
        '_dictTagId': String(tagId),
      }));
    }
    return null;
  }

  // ============= Main automation entry points =============

  async function runDmpPhase1(crowdName) {
    console.info('[DMP Automation] Phase 1: search + match for:', crowdName);
    return await phase1SearchAndMatch(crowdName);
  }

  async function runDmpPhase2WaitPortrait(phase1Result) {
    console.info('[DMP Automation] Phase 2: wait for portrait entry');
    return await phase2WaitPortrait(phase1Result);
  }

  async function runDmpPhase3Extract(phase1Result, selectedTags) {
    console.info('[DMP Automation] Phase 3: enter portrait + extract');
    return await phase2EnterAndExtract(phase1Result, selectedTags);
  }

  // ============= Message handler =============
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'CANCEL_CDP_AUTOMATION') {
      const targetRunId = String(message.runId || '');
      if (!targetRunId || !window.__dmpAutomationRunId || window.__dmpAutomationRunId === targetRunId) {
        window.__dmpAutomationCancelled = true;
      }
      sendResponse({ ok: true, cancelled: true });
      return false;
    }

    if (message?.type === 'PING_DMP_READY') {
      const onCrowd = isOnCrowdListPage();
      const onPortrait = isOnPortraitPage();
      const domReady = isPageDomReady();
      sendResponse({ ok: true, ready: (onCrowd || onPortrait) && domReady, onCrowd, onPortrait, domReady });
      return false;
    }

    // Phase 1: search + match on crowd list page
    if (message?.type === 'AUTOMATE_DMP') {
      if (window.__dmpAutomationRunning) {
        sendResponse({ ok: false, error: '已有 DMP 流程正在执行' });
        return false;
      }
      window.__dmpAutomationRunning = true;
      beginAutomationRun(message.runId);
      const crowdName = String(message.crowdName || '').trim();
      if (!crowdName) {
        window.__dmpAutomationRunning = false;
        finishAutomationRun(message.runId);
        sendResponse({ ok: false, error: '人群包名称不能为空' });
        return false;
      }

      runDmpPhase1(crowdName)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[DMP Automation] phase 1 failed:', error);
          sendResponse({ ok: false, error: error?.message || '达摩盘搜索匹配失败' });
        })
        .finally(() => {
          window.__dmpAutomationRunning = false;
          finishAutomationRun(message.runId);
        });
      return true;
    }

    // Phase 2: wait for portrait entry on crowd list page
    if (message?.type === 'AUTOMATE_DMP_WAIT_PORTRAIT') {
      if (window.__dmpAutomationRunning) {
        sendResponse({ ok: false, error: '已有 DMP 流程正在执行' });
        return false;
      }
      window.__dmpAutomationRunning = true;
      beginAutomationRun(message.runId);

      runDmpPhase2WaitPortrait(message.phase1Result || {})
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[DMP Automation] phase 2 wait failed:', error);
          sendResponse({ ok: false, error: error?.message || '等待画像透视入口超时' });
        })
        .finally(() => {
          window.__dmpAutomationRunning = false;
          finishAutomationRun(message.runId);
        });
      return true;
    }

    // Phase 3: enter portrait + extract data on portrait page
    if (message?.type === 'AUTOMATE_DMP_EXTRACT') {
      if (window.__dmpAutomationRunning) {
        sendResponse({ ok: false, error: '已有 DMP 流程正在执行' });
        return false;
      }
      window.__dmpAutomationRunning = true;
      beginAutomationRun(message.runId);
      const phase1Result = message.phase1Result || {};
      const selectedTags = message.selectedTags || [];

      runDmpPhase3Extract(phase1Result, selectedTags)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[DMP Automation] phase 3 failed:', error);
          sendResponse({ ok: false, error: error?.message || '达摩盘数据提取失败' });
        })
        .finally(() => {
          window.__dmpAutomationRunning = false;
          finishAutomationRun(message.runId);
        });
      return true;
    }
  });
}
