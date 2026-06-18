if (!window.__dmpAutomationContentScriptLoaded) {
  window.__dmpAutomationContentScriptLoaded = true;
  window.__dmpAutomationRunning = false;
  console.info('[DMP Automation][content] script initialized');

  const DMP_SEARCH_XPATH = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div[1]/div[4]/div/input';
  const DMP_FIRST_NAME_XPATH = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[2]/div[2]/div[1]/div[2]/table/tbody/tr[1]/td[2]/span';

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
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('等待页面元素超时: ' + label);
  }

  async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
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

    // Wait for page DOM
    await waitForLocator(() => isPageDomReady(), '页面DOM就绪', 60000, 500);

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

    // Wait for results table
    await waitForLocator(() => {
      const table = document.querySelector('table tbody');
      if (!table) return null;
      const rows = table.querySelectorAll('tr');
      return rows.length > 0 ? rows : null;
    }, '搜索结果列表', 20000, 500);
    trail.push({ step: 'searched', crowdName });

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
    return { ok: true, phase: 1, trail, crowdId, rowIndex: rowMatch };
  }

  // ============= Phase 2: Wait for Portrait Entry =============

  async function phase2WaitPortrait() {
    console.info('[DMP Automation] Phase 2: waiting for 画像透视 entry...');
    await waitForLocator(
      () => {
        // Search by text content — the button always has "画像透视" text, works regardless of row position
        const spans = Array.from(document.querySelectorAll('span, a')).filter(
          (n) => isVisible(n) && (n.textContent || '').trim() === '画像透视'
        );
        return spans.length > 0 ? true : null;
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

    // Extract data for each tag using intercepted credentials (same approach as DMP Plugin)
    console.info('[DMP Automation] extracting data for', tagIds.length, 'tags');
    const rawResults = [];
    for (const tagId of tagIds) {
      try {
        const tagData = await fetchTagDataFull(payload, tagId);
        if (tagData) rawResults.push(...tagData);
      } catch (e) {
        const tagInfo = tagsDict.find((t) => String(t.tagId) === String(tagId)) || {};
        rawResults.push({
          '所属大类': tagInfo.mainCategory || '未知',
          '标签类型': tagInfo.category || '未知',
          '标签名称': (tagInfo.tagName || tagId) + ' ❌',
          '特征明细': '⚠️ 提取失败: ' + e.message,
          '人群占比': '-', 'Rebase': '-', '点击TGI': '-', '转化TGI': '-',
        });
      }
    }

    // Apply Rebase normalization (same logic as DMP Plugin)
    const finalResults = applyRebase(rawResults);
    trail.push({ step: 'data_extracted', tagCount: tagIds.length, resultCount: finalResults.length });

    // Extract crowd count after data is done — page has fully settled by now
    let crowdCount = null;
    try {
      const COUNT_XPATH = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div/div[1]/div[3]/div[2]/strong';
      const countNode = await waitForLocator(() => {
        const n = document.evaluate(COUNT_XPATH, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (n && n.textContent && n.textContent.trim()) return n;
        const all = document.querySelectorAll('strong');
        for (const s of all) {
          const num = parseInt((s.textContent || '').replace(/,/g, '').replace(/\s/g, ''), 10);
          if (!isNaN(num) && num > 100) return s;
        }
        return null;
      }, '覆盖人数元素', 20000, 500);
      if (countNode) {
        crowdCount = parseInt((countNode.textContent || '').replace(/,/g, '').replace(/\s/g, ''), 10) || null;
        console.log('[DMP Automation] crowdCount:', crowdCount);
        if (crowdCount) trail.push({ step: 'crowd_count', count: crowdCount });
      }
    } catch (e) {
      console.warn('[DMP Automation] crowdCount not found:', e.message);
    }

    return { ok: true, phase: 2, trail, crowdId, crowdCount: crowdCount || null, extracted: true, results: finalResults };
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

  async function fetchTagDataFull(payload, tagId) {
    const tagInfo = tagsDict.find((t) => String(t.tagId) === String(tagId)) || {};
    const mainCat = tagInfo.mainCategory || '未知大类';
    const subCat = tagInfo.category || '未知类型';

    const reqBody = JSON.parse(JSON.stringify(payload.payload));
    delete reqBody.multiGroupOptions;

    let url = payload.url;
    if (/\/tag\/\d+/.test(url)) url = url.replace(/\/tag\/\d+/, `/tag/${tagId}`);
    if (/tagId=\d+/.test(url)) url = url.replace(/tagId=\d+/, `tagId=${tagId}`);
    if (/\/analysis\/\d+/.test(url)) url = url.replace(/\/analysis\/\d+/, `/analysis/${tagId}`);
    if (reqBody.tagId !== undefined) reqBody.tagId = parseInt(tagId);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify(reqBody),
    });
    const json = await resp.json();
    if (json?.data?.chartDataFull) {
      return json.data.chartDataFull.map((it) => ({
        '所属大类': mainCat,
        '标签类型': subCat,
        '标签名称': it.tagName || '-',
        '特征明细': it.optionName || '-',
        '人群占比': it.rate ? (parseFloat(it.rate) * 100).toFixed(2) + '%' : '-',
        '点击TGI': it.ctrIndex || '-',
        '转化TGI': it.ppcIndex || '-',
      }));
    }
    return null;
  }

  // Rebase normalization — identical to DMP Plugin logic
  function applyRebase(rawResults) {
    const sumMap = {};
    rawResults.forEach((item) => {
      const tagName = item['标签名称'];
      if (!sumMap[tagName]) sumMap[tagName] = 0;
      if (item['人群占比'] !== '-' && !item['特征明细'].includes('⚠️') && !item['特征明细'].includes('❌')) {
        sumMap[tagName] += parseFloat(item['人群占比'].replace('%', ''));
      }
    });

    return rawResults.map((item) => {
      const tagName = item['标签名称'];
      const totalSum = sumMap[tagName] || 0;
      let rebaseVal = '-';

      if (item['人群占比'] !== '-' && !item['特征明细'].includes('⚠️') && !item['特征明细'].includes('❌')) {
        const currentVal = parseFloat(item['人群占比'].replace('%', ''));
        if (totalSum > 100.1) {
          rebaseVal = item['人群占比']; // multi-select: keep original
        } else {
          if (totalSum > 0) {
            rebaseVal = ((currentVal / totalSum) * 100).toFixed(2) + '%';
          } else {
            rebaseVal = '0.00%';
          }
        }
      }

      return {
        '所属大类': item['所属大类'],
        '标签类型': item['标签类型'],
        '标签名称': item['标签名称'],
        '特征明细': item['特征明细'],
        '人群占比': item['人群占比'],
        'Rebase': rebaseVal,
        '点击TGI': item['点击TGI'],
        '转化TGI': item['转化TGI'],
      };
    });
  }

  // ============= Main automation entry points =============

  async function runDmpPhase1(crowdName) {
    console.info('[DMP Automation] Phase 1: search + match for:', crowdName);
    return await phase1SearchAndMatch(crowdName);
  }

  async function runDmpPhase2WaitPortrait() {
    console.info('[DMP Automation] Phase 2: wait for portrait entry');
    return await phase2WaitPortrait();
  }

  async function runDmpPhase3Extract(phase1Result, selectedTags) {
    console.info('[DMP Automation] Phase 3: enter portrait + extract');
    return await phase2EnterAndExtract(phase1Result, selectedTags);
  }

  // ============= Message handler =============
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
      const crowdName = String(message.crowdName || '').trim();
      if (!crowdName) {
        window.__dmpAutomationRunning = false;
        sendResponse({ ok: false, error: '人群包名称不能为空' });
        return false;
      }

      runDmpPhase1(crowdName)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[DMP Automation] phase 1 failed:', error);
          sendResponse({ ok: false, error: error?.message || '达摩盘搜索匹配失败' });
        })
        .finally(() => { window.__dmpAutomationRunning = false; });
      return true;
    }

    // Phase 2: wait for portrait entry on crowd list page
    if (message?.type === 'AUTOMATE_DMP_WAIT_PORTRAIT') {
      if (window.__dmpAutomationRunning) {
        sendResponse({ ok: false, error: '已有 DMP 流程正在执行' });
        return false;
      }
      window.__dmpAutomationRunning = true;

      runDmpPhase2WaitPortrait()
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[DMP Automation] phase 2 wait failed:', error);
          sendResponse({ ok: false, error: error?.message || '等待画像透视入口超时' });
        })
        .finally(() => { window.__dmpAutomationRunning = false; });
      return true;
    }

    // Phase 3: enter portrait + extract data on portrait page
    if (message?.type === 'AUTOMATE_DMP_EXTRACT') {
      if (window.__dmpAutomationRunning) {
        sendResponse({ ok: false, error: '已有 DMP 流程正在执行' });
        return false;
      }
      window.__dmpAutomationRunning = true;
      const phase1Result = message.phase1Result || {};
      const selectedTags = message.selectedTags || [];

      runDmpPhase3Extract(phase1Result, selectedTags)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error('[DMP Automation] phase 3 failed:', error);
          sendResponse({ ok: false, error: error?.message || '达摩盘数据提取失败' });
        })
        .finally(() => { window.__dmpAutomationRunning = false; });
      return true;
    }
  });
}
