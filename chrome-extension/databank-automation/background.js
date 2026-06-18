const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

// URL constants
const DATABANK_PARAM_URL = 'https://databank.tmall.com/#/userDefinedAnalyses';
const DATABANK_CROWD_URL = 'https://databank.tmall.com/#/customAnalysis';
const DATABANK_DATAHUB_URL = 'https://databank.tmall.com/#/dataHub';
const DMP_CROWD_URL = 'https://dmp.taobao.com/index_new.html#!/crowds-new/list?spm=';

// Message types from frontend (via bridge)
const MSG_DATABANK_PARAM = 'CDP_AUTOMATE_DATABANK';
const MSG_DATABANK_CROWD = 'CDP_AUTOMATE_DATABANK_CROWD';
const MSG_DATABANK_DATAHUB = 'CDP_AUTOMATE_DATABANK_DATAHUB';
const MSG_DMP = 'CDP_AUTOMATE_DMP';
const MSG_DMP_WAIT_PORTRAIT = 'CDP_AUTOMATE_DMP_WAIT_PORTRAIT';
const MSG_DMP_EXTRACT = 'CDP_AUTOMATE_DMP_EXTRACT';

// Message types to content scripts
const CONTENT_PING = 'PING_AUTOMATION_READY';
const CONTENT_PING_CROWD = 'PING_CROWD_READY';
const CONTENT_PING_DATAHUB = 'PING_DATAHUB_READY';
const CONTENT_PING_DMP = 'PING_DMP_READY';
const CONTENT_CMD_DATABANK = 'AUTOMATE_DATABANK';
const CONTENT_CMD_DATABANK_CROWD = 'AUTOMATE_DATABANK_CROWD';
const CONTENT_CMD_DATABANK_DATAHUB = 'AUTOMATE_DATABANK_DATAHUB';
const CONTENT_CMD_DMP = 'AUTOMATE_DMP';
const CONTENT_CMD_DMP_WAIT_PORTRAIT = 'AUTOMATE_DMP_WAIT_PORTRAIT';
const CONTENT_CMD_DMP_EXTRACT = 'AUTOMATE_DMP_EXTRACT';

let dmpTabId = null; // Track DMP tab for two-phase flow
let databankTabId = null; // Track DataBank tab across phases

function log(level, msg, extra) {
  const fn = level === 'error' ? console.error : console.info;
  fn(`[Task Executor][bg] ${msg}`, extra !== undefined ? extra : '');
}

async function focusTab(tab) {
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
}

async function createTab(url) {
  const created = await chrome.tabs.create({ url, active: false });
  log('info', 'created tab', { tabId: created.id, url });
  return created;
}

async function waitForTabComplete(tabId, retries) {
  retries = retries || 40;
  for (let i = 0; i < retries; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.status === 'complete') return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('页面加载超时');
}

async function ensureScriptInjected(tabId, files) {
  log('info', 'injecting scripts', files);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: files,
    });
    log('info', 'scripts injected');
  } catch (e) {
    // content script may already be injected via manifest — that's fine
    log('info', 'script injection skipped (may already be loaded)', e.message);
  }
}

async function waitForReady(tabId, pingType, retries) {
  retries = retries || 60;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: pingType });
      if (response?.ok && response?.ready) return;
    } catch (e) { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('页面未就绪，请稍后重试');
}

async function sendMessageWithRetry(tabId, message, retries) {
  retries = retries || 10;
  let lastError = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastError || new Error('页面脚本未就绪');
}

// Run DataBank parameter paste flow
async function runDatabankParam(senderTab, jsonText, sendResponse) {
  let tab = null;
  try {
    tab = await createTab(DATABANK_PARAM_URL);
    await waitForTabComplete(tab.id);
    await ensureScriptInjected(tab.id, ['content.js']);
    await focusTab(tab);
    await waitForReady(tab.id, CONTENT_PING);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK,
      jsonText: jsonText,
    });
    log('info', 'databank param flow done', result);
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'databank param flow failed', error.message);
    sendResponse({ ok: false, error: error?.message || '参数粘贴流程执行失败' });
  }
}

// Run DataBank crowd search/match/push flow (Phase 1)
async function runDatabankCrowd(senderTab, crowdName, sendResponse) {
  let tab = null;
  try {
    tab = await createTab(DATABANK_CROWD_URL);
    databankTabId = tab.id;
    await waitForTabComplete(tab.id);
    await ensureScriptInjected(tab.id, ['content.js']);
    await focusTab(tab);
    await waitForReady(tab.id, CONTENT_PING_CROWD);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK_CROWD,
      crowdName: crowdName,
    });
    log('info', 'databank crowd flow done', result);
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'databank crowd flow failed', error.message);
    databankTabId = null;
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
    }
    sendResponse({ ok: false, error: error?.message || '数据引擎人群流程执行失败' });
  }
}

// Run DataBank dataHub status check (Phase 2) — open NEW tab for dataHub, poll until "已应用"
async function runDatabankDataHubCheck(senderTab, crowdName, sendResponse) {
  let tab = null;
  try {
    // Open a fresh tab for dataHub — don't reuse the crowd tab so the dialog stays open
    tab = await createTab(DATABANK_DATAHUB_URL);
    await waitForTabComplete(tab.id, 60);
    await new Promise((r) => setTimeout(r, 2000));
    await ensureScriptInjected(tab.id, ['content.js']);
    await waitForReady(tab.id, CONTENT_PING_DATAHUB, 60);

    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK_DATAHUB,
      crowdName: crowdName,
    });
    log('info', 'databank dataHub check done', result);
    // Clean up the dataHub tab
    try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'databank dataHub check failed', error.message);
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
    }
    sendResponse({ ok: false, error: error?.message || 'DataHub状态检查失败' });
  }
}

// Run DMP portrait entry wait (Phase 2) — same tab, polls for 画像透视
async function runDmpWaitPortrait(senderTab, sendResponse) {
  try {
    if (!dmpTabId) throw new Error('没有活跃的 DMP 任务');
    log('info', 'dmp phase 2: waiting for portrait entry on tab', dmpTabId);
    await waitForReady(dmpTabId, CONTENT_PING_DMP, 10);
    const result = await sendMessageWithRetry(dmpTabId, {
      type: CONTENT_CMD_DMP_WAIT_PORTRAIT,
    });
    log('info', 'dmp phase 2 done', result);
    sendResponse(result);
  } catch (error) {
    log('error', 'dmp phase 2 failed', error.message);
    sendResponse({ ok: false, error: error?.message || '等待画像透视入口失败' });
  }
}

// Run DMP crowd search/match/portrait flow (Phase 1)
async function runDmp(senderTab, crowdName, sendResponse) {
  let tab = null;
  try {
    tab = await createTab(DMP_CROWD_URL);
    dmpTabId = tab.id;
    await waitForTabComplete(tab.id);
    await ensureScriptInjected(tab.id, ['dmp-content.js']);
    await focusTab(tab);
    await waitForReady(tab.id, CONTENT_PING_DMP, 120);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DMP,
      crowdName: crowdName,
    });
    log('info', 'dmp phase 1 done', result);
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'dmp phase 1 failed', error.message);
    dmpTabId = null;
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
    }
    sendResponse({ ok: false, error: error?.message || '达摩盘流程执行失败' });
  }
}

// Run DMP extract (Phase 2) — navigate tab to portrait page, then extract
async function runDmpExtract(senderTab, phase1Result, selectedTags, sendResponse) {
  try {
    const tabId = dmpTabId;
    if (!tabId) throw new Error('没有活跃的 DMP 任务');
    const crowdId = phase1Result.crowdId;
    if (!crowdId) throw new Error('缺少 crowdId，无法进入透视');

    // Navigate the tab directly to the portrait URL (background-driven, reliable)
    const portraitUrl = 'https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId=' + crowdId;
    log('info', 'navigating tab to portrait page', { tabId, portraitUrl });
    await chrome.tabs.update(tabId, { url: portraitUrl });
    await waitForTabComplete(tabId, 120);
    // Extra wait for SPA to render after page load
    await new Promise((r) => setTimeout(r, 2000));
    await waitForReady(tabId, CONTENT_PING_DMP, 60);

    const result = await sendMessageWithRetry(tabId, {
      type: CONTENT_CMD_DMP_EXTRACT,
      phase1Result: phase1Result,
      selectedTags: selectedTags,
    });
    log('info', 'dmp phase 2 done', result);
    dmpTabId = null;
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'dmp phase 2 failed', error.message);
    if (dmpTabId) {
      try { await chrome.tabs.remove(dmpTabId); } catch (e) { /* ignore */ }
    }
    dmpTabId = null;
    sendResponse({ ok: false, error: error?.message || '达摩盘数据提取失败' });
  }
}

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msgType = message?.type;
  if (![MSG_DATABANK_PARAM, MSG_DATABANK_CROWD, MSG_DATABANK_DATAHUB, MSG_DMP, MSG_DMP_WAIT_PORTRAIT, MSG_DMP_EXTRACT].includes(msgType)) return;

  const senderUrl = message.pageUrl || sender.tab?.url || '';
  const senderOrigin = (function() {
    try { return new URL(senderUrl).origin; } catch (e) { return ''; }
  })();

  if (!ALLOWED_ORIGINS.has(senderOrigin)) {
    log('error', 'origin rejected', senderOrigin);
    sendResponse({ ok: false, error: '消息来源未被允许' });
    return;
  }

  const senderTab = sender?.tab?.id ? { id: sender.tab.id, windowId: sender.tab.windowId } : null;

  if (msgType === MSG_DATABANK_PARAM) {
    const jsonText = String(message.jsonText || '').trim();
    if (!jsonText) {
      sendResponse({ ok: false, error: 'jsonText 不能为空' });
      return;
    }
    runDatabankParam(senderTab, jsonText, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_CROWD) {
    const crowdName = String(message.crowdName || '').trim();
    // Cancel signal — close any open DMP/DataBank tabs
    if (crowdName === '__CANCEL__') {
      if (dmpTabId) {
        try { chrome.tabs.remove(dmpTabId); } catch (e) { /* ignore */ }
        dmpTabId = null;
      }
      if (databankTabId) {
        try { chrome.tabs.remove(databankTabId); } catch (e) { /* ignore */ }
        databankTabId = null;
      }
      sendResponse({ ok: true, cancelled: true });
      return;
    }
    if (!crowdName) {
      sendResponse({ ok: false, error: '人群包名称不能为空' });
      return;
    }
    runDatabankCrowd(senderTab, crowdName, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_DATAHUB) {
    const crowdName = String(message.crowdName || '').trim();
    if (!crowdName) {
      sendResponse({ ok: false, error: '人群包名称不能为空' });
      return;
    }
    runDatabankDataHubCheck(senderTab, crowdName, sendResponse);
    return true;
  }

  if (msgType === MSG_DMP) {
    const crowdName = String(message.crowdName || '').trim();
    if (!crowdName) {
      sendResponse({ ok: false, error: '人群包名称不能为空' });
      return;
    }
    runDmp(senderTab, crowdName, sendResponse);
    return true;
  }

  if (msgType === MSG_DMP_WAIT_PORTRAIT) {
    runDmpWaitPortrait(senderTab, sendResponse);
    return true;
  }

  if (msgType === MSG_DMP_EXTRACT) {
    const phase1Result = message.phase1Result || {};
    const selectedTags = message.selectedTags || [];
    runDmpExtract(senderTab, phase1Result, selectedTags, sendResponse);
    return true;
  }
});
