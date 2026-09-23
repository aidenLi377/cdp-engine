if (typeof importScripts === 'function') importScripts('dmp-result-core.js');

const ALLOWED_ORIGINS = new Set([
  'https://duruo377.top',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

// URL constants
const DATABANK_PARAM_URL = 'https://databank.tmall.com/#/userDefinedAnalyses';
const DATABANK_CROWD_URL = 'https://databank.tmall.com/#/customAnalysis';
const DATABANK_DATAHUB_URL = 'https://databank.tmall.com/#/dataHub';
const DATABANK_CUSTOM_CROWD_LIST_URL = 'https://databank.tmall.com/api/paasapi';
const DMP_CROWD_URL = 'https://dmp.taobao.com/index_new.html#!/crowds-new/list?spm=';

// Message types from frontend (via bridge)
const MSG_DATABANK_PARAM = 'CDP_AUTOMATE_DATABANK';
const MSG_DATABANK_REALTIME_COUNT = 'CDP_QUERY_DATABANK_REALTIME_COUNT';
const MSG_DATABANK_CREATE_API = 'CDP_CREATE_DATABANK_CROWD_API';
const MSG_DATABANK_COUNT = 'CDP_QUERY_DATABANK_CROWD_COUNT';
const MSG_DATABANK_DEPENDENCIES = 'CDP_CHECK_DATABANK_CUSTOM_DEPENDENCIES';
const MSG_DATABANK_CROWD = 'CDP_AUTOMATE_DATABANK_CROWD';
const MSG_DATABANK_WAIT_APPLY = 'CDP_AUTOMATE_DATABANK_WAIT_APPLY';
const MSG_DATABANK_DATAHUB = 'CDP_AUTOMATE_DATABANK_DATAHUB';
const MSG_DMP = 'CDP_AUTOMATE_DMP';
const MSG_DMP_WAIT_PORTRAIT = 'CDP_AUTOMATE_DMP_WAIT_PORTRAIT';
const MSG_DMP_EXTRACT = 'CDP_AUTOMATE_DMP_EXTRACT';
const MSG_DMP_DIRECT_EXTRACT = 'CDP_DMP_DIRECT_EXTRACT';
const MSG_DMP_CAPTURE_ANALYSIS_CONTEXT = 'DMP_CAPTURE_ANALYSIS_CONTEXT';
const MSG_CANCEL_TASK = 'CDP_CANCEL_TASK';
const MSG_DMP_GET_SETTINGS = 'CDP_DMP_GET_SETTINGS';
const MSG_DMP_UPDATE_SETTINGS = 'CDP_DMP_UPDATE_SETTINGS';

const DMP_RESULT_COLUMNS = [
  '所属大类', '标签类型', '标签名称', '特征明细', '人群占比',
  '覆盖人数', 'Rebase', 'Rebase后人数', 'CTR', 'PPC',
];

// Message types to content scripts
const CONTENT_PING = 'PING_AUTOMATION_READY';
const CONTENT_PING_CROWD = 'PING_CROWD_READY';
const CONTENT_PING_DATAHUB = 'PING_DATAHUB_READY';
const CONTENT_PING_DMP = 'PING_DMP_READY';
const CONTENT_CMD_DATABANK = 'AUTOMATE_DATABANK';
const CONTENT_CMD_DATABANK_REALTIME_COUNT = 'QUERY_DATABANK_REALTIME_COUNT';
const CONTENT_CMD_DATABANK_CREATE_API = 'CREATE_DATABANK_CROWD_API';
const CONTENT_CMD_DATABANK_COUNT = 'QUERY_DATABANK_CROWD_COUNT';
const CONTENT_CMD_DATABANK_CROWD = 'AUTOMATE_DATABANK_CROWD';
const CONTENT_CMD_DATABANK_WAIT_APPLY = 'AUTOMATE_DATABANK_WAIT_APPLY';
const CONTENT_CMD_DATABANK_DATAHUB = 'AUTOMATE_DATABANK_DATAHUB';
const CONTENT_CMD_DMP = 'AUTOMATE_DMP';
const CONTENT_CMD_DMP_WAIT_PORTRAIT = 'AUTOMATE_DMP_WAIT_PORTRAIT';
const CONTENT_CMD_DMP_EXTRACT = 'AUTOMATE_DMP_EXTRACT';
const CONTENT_CMD_CANCEL = 'CANCEL_CDP_AUTOMATION';

let dmpTabId = null; // Track DMP tab for two-phase flow
let databankTabId = null; // Track DataBank tab across phases
let dmpRunId = null;
let databankRunId = null;
const trackedTabsByRun = new Map();
const cancelledRunIds = new Set();
const TASK_TAB_KEYS = {
  dmp: 'cdpTaskDmpTabId',
  databank: 'cdpTaskDatabankTabId',
};
const TASK_RUN_KEYS = {
  dmp: 'cdpTaskDmpRunId',
  databank: 'cdpTaskDatabankRunId',
};
const taskStorage = chrome.storage?.session || chrome.storage?.local || null;
const DATABANK_REQUEST_CONTEXT_KEY = 'cdpDatabankRequestContext';
let databankRequestContext = null;
const DMP_AUTH_CONTEXT_KEY = 'cdpDmpDirectAuthContext';
const DMP_ANALYSIS_CONTEXT_KEY = 'cdpDmpAnalysisContext';
const DMP_AUTH_MAX_AGE_MS = 30 * 60 * 1000;
let dmpAuthContext = null;
let dmpAnalysisContext = null;
const taskStateReady = (async () => {
  if (!taskStorage) return;
  try {
    const state = await taskStorage.get([
      ...Object.values(TASK_TAB_KEYS),
      ...Object.values(TASK_RUN_KEYS),
    ]);
    dmpTabId = Number.isInteger(state[TASK_TAB_KEYS.dmp]) ? state[TASK_TAB_KEYS.dmp] : null;
    databankTabId = Number.isInteger(state[TASK_TAB_KEYS.databank]) ? state[TASK_TAB_KEYS.databank] : null;
    dmpRunId = typeof state[TASK_RUN_KEYS.dmp] === 'string' ? state[TASK_RUN_KEYS.dmp] : null;
    databankRunId = typeof state[TASK_RUN_KEYS.databank] === 'string' ? state[TASK_RUN_KEYS.databank] : null;
    if (dmpTabId && dmpRunId) registerRunTab(dmpRunId, dmpTabId);
    if (databankTabId && databankRunId) registerRunTab(databankRunId, databankTabId);
  } catch (error) {
    log('info', 'task state restore skipped', error?.message || error);
  }
})();

const databankRequestContextReady = (async () => {
  if (!taskStorage) return;
  try {
    const stored = await taskStorage.get([DATABANK_REQUEST_CONTEXT_KEY]);
    const context = stored?.[DATABANK_REQUEST_CONTEXT_KEY];
    if (context && typeof context === 'object') databankRequestContext = context;
  } catch (error) {
    log('info', 'databank request context restore skipped', error?.message || error);
  }
})();

const dmpContextReady = (async () => {
  if (!chrome.storage?.session) return;
  try {
    const stored = await chrome.storage.session.get([
      DMP_AUTH_CONTEXT_KEY,
      DMP_ANALYSIS_CONTEXT_KEY,
    ]);
    if (!dmpAuthContext && stored?.[DMP_AUTH_CONTEXT_KEY]) {
      dmpAuthContext = stored[DMP_AUTH_CONTEXT_KEY];
    }
    if (!dmpAnalysisContext && stored?.[DMP_ANALYSIS_CONTEXT_KEY]) {
      dmpAnalysisContext = stored[DMP_ANALYSIS_CONTEXT_KEY];
    }
  } catch (error) {
    log('info', 'DMP session context restore skipped', error?.message || error);
  }
})();

function storeDmpAuthContextFromUrl(inputUrl) {
  let url;
  try { url = new URL(inputUrl); } catch { return false; }
  if (url.origin !== 'https://dmp.taobao.com') return false;
  const params = Object.fromEntries(
    ['_tb_token_', '_csrf', 'csrfId', 'spm']
      .map((key) => [key, url.searchParams.get(key) || ''])
      .filter(([, value]) => value),
  );
  if (!params._tb_token_ || !params._csrf || !params.csrfId) return false;
  dmpAuthContext = { params, capturedAt: Date.now() };
  chrome.storage?.session?.set({ [DMP_AUTH_CONTEXT_KEY]: dmpAuthContext }).catch(() => null);
  return true;
}

function captureDmpAuthContext(details) {
  if (details?.initiator !== 'https://dmp.taobao.com' || !Number.isInteger(details?.tabId) || details.tabId < 0) return;
  let url;
  try { url = new URL(details.url); } catch { return; }
  if (url.origin !== 'https://dmp.taobao.com' || url.pathname !== '/api_2/crowd/') return;
  storeDmpAuthContextFromUrl(url.toString());
}

function isFreshDmpContext(context) {
  return Boolean(context && Date.now() - Number(context.capturedAt) <= DMP_AUTH_MAX_AGE_MS);
}

function captureDmpAnalysisContext(message, sender, sendResponse) {
  let senderUrl;
  let analysisUrl;
  try {
    senderUrl = new URL(sender?.tab?.url || '');
    analysisUrl = new URL(String(message?.url || ''), senderUrl.origin);
  } catch {
    sendResponse({ ok: false, error: '画像请求上下文无效' });
    return;
  }
  const isAnalysisPath = /\/api_2\/analysis\/(?:tag\/)?\d+/.test(analysisUrl.pathname);
  if (senderUrl.origin !== 'https://dmp.taobao.com' || analysisUrl.origin !== senderUrl.origin || !isAnalysisPath) {
    sendResponse({ ok: false, error: '画像请求来源无效' });
    return;
  }
  const payload = message?.payload;
  if (!payload || typeof payload !== 'object' || !payload.crowdId) {
    sendResponse({ ok: false, error: '画像请求载荷无效' });
    return;
  }

  dmpAnalysisContext = {
    url: analysisUrl.toString(),
    payload: JSON.parse(JSON.stringify(payload)),
    tabId: sender.tab.id,
    capturedAt: Date.now(),
  };
  storeDmpAuthContextFromUrl(analysisUrl.toString());
  chrome.storage?.session?.set({ [DMP_ANALYSIS_CONTEXT_KEY]: dmpAnalysisContext }).catch(() => null);
  sendResponse({ ok: true });
}

function applyDmpAuthParams(url, context, includeSpm = false) {
  if (!context || Date.now() - Number(context.capturedAt) > DMP_AUTH_MAX_AGE_MS) return;
  for (const key of ['_tb_token_', '_csrf', 'csrfId', ...(includeSpm ? ['spm'] : [])]) {
    const value = context.params?.[key];
    if (value) url.searchParams.set(key, value);
  }
}

if (chrome.webRequest?.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    captureDmpAuthContext,
    { urls: ['https://dmp.taobao.com/api_2/crowd/*'] },
  );
}

function captureDatabankRequestContext(details) {
  const requestHeaders = Array.isArray(details?.requestHeaders) ? details.requestHeaders : [];
  const normalizedHeaders = {};
  for (const header of requestHeaders) {
    const name = String(header?.name || '').toLowerCase();
    if (!['x-csrf-token', 'x-requested-with', 'bx-v'].includes(name)) continue;
    const value = String(header?.value || '').trim();
    if (value) normalizedHeaders[name] = value;
  }
  if (!normalizedHeaders['x-csrf-token']) return;
  databankRequestContext = {
    headers: normalizedHeaders,
    capturedAt: Date.now(),
  };
  if (taskStorage) {
    taskStorage.set({ [DATABANK_REQUEST_CONTEXT_KEY]: databankRequestContext }).catch(() => null);
  }
}

if (chrome.webRequest?.onBeforeSendHeaders) {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    captureDatabankRequestContext,
    { urls: ['https://databank.tmall.com/api/paasapi*'] },
    ['requestHeaders'],
  );
}

function normalizeDmpSettings(stored) {
  const conditionCache = stored?.dmpConditionCache || {};
  const readyTagIds = Object.entries(conditionCache)
    .filter(([, options]) => Array.isArray(options) && options.length > 0)
    .map(([tagId]) => String(tagId));
  const columnVisibility = Object.fromEntries(
    DMP_RESULT_COLUMNS.map((column) => [column, stored?.columnVisibility?.[column] !== false]),
  );
  const rebaseExcludedTagIds = [...new Set(
    (Array.isArray(stored?.rebaseExcludedTagIds) ? stored.rebaseExcludedTagIds : []).map(String),
  )];
  return { readyTagIds, columnVisibility, rebaseExcludedTagIds };
}

async function readDmpSettings() {
  const stored = await chrome.storage.local.get([
    'dmpConditionCache',
    'columnVisibility',
    'rebaseExcludedTagIds',
  ]);
  return normalizeDmpSettings(stored);
}

async function updateDmpSettings(message) {
  const stored = await chrome.storage.local.get(['columnVisibility']);
  const patch = {};
  if (message.columnVisibility && typeof message.columnVisibility === 'object') {
    const writableVisibility = {};
    for (const column of DMP_RESULT_COLUMNS) {
      if (typeof message.columnVisibility[column] === 'boolean') writableVisibility[column] = message.columnVisibility[column];
    }
    patch.columnVisibility = { ...(stored.columnVisibility || {}), ...writableVisibility };
  }
  if (Array.isArray(message.rebaseExcludedTagIds)) {
    patch.rebaseExcludedTagIds = [...new Set(message.rebaseExcludedTagIds.map(String))];
  }
  if (Object.keys(patch).length > 0) await chrome.storage.local.set(patch);
  return readDmpSettings();
}

function normalizeRunId(runId) {
  return String(runId || '').trim();
}

function registerRunTab(runId, tabId) {
  const normalizedRunId = normalizeRunId(runId);
  if (!normalizedRunId || !Number.isInteger(tabId)) return;
  const tabs = trackedTabsByRun.get(normalizedRunId) || new Set();
  tabs.add(tabId);
  trackedTabsByRun.set(normalizedRunId, tabs);
}

function unregisterRunTab(runId, tabId) {
  const normalizedRunId = normalizeRunId(runId);
  const tabs = trackedTabsByRun.get(normalizedRunId);
  if (!tabs) return;
  tabs.delete(tabId);
  if (tabs.size === 0) trackedTabsByRun.delete(normalizedRunId);
}

function assertRunNotCancelled(runId) {
  const normalizedRunId = normalizeRunId(runId);
  if (normalizedRunId && cancelledRunIds.has(normalizedRunId)) {
    const error = new Error('任务已终止');
    error.name = 'AbortError';
    throw error;
  }
}

async function setTaskTabId(kind, tabId, runId = null) {
  const normalizedRunId = tabId == null ? null : normalizeRunId(runId) || null;
  if (kind === 'dmp') {
    dmpTabId = tabId;
    dmpRunId = normalizedRunId;
  }
  if (kind === 'databank') {
    databankTabId = tabId;
    databankRunId = normalizedRunId;
  }
  if (!taskStorage) return;
  const key = TASK_TAB_KEYS[kind];
  const runKey = TASK_RUN_KEYS[kind];
  try {
    if (tabId == null) await taskStorage.remove([key, runKey]);
    else await taskStorage.set({ [key]: tabId, [runKey]: normalizedRunId });
  } catch (error) {
    log('info', 'task state persist skipped', error?.message || error);
  }
}

async function cancelRun(runId) {
  const normalizedRunId = normalizeRunId(runId);
  if (normalizedRunId) cancelledRunIds.add(normalizedRunId);
  const tabIds = new Set(normalizedRunId ? (trackedTabsByRun.get(normalizedRunId) || []) : []);

  if ((!normalizedRunId || dmpRunId === normalizedRunId) && dmpTabId) tabIds.add(dmpTabId);
  if ((!normalizedRunId || databankRunId === normalizedRunId) && databankTabId) tabIds.add(databankTabId);

  let closedTabs = 0;
  for (const tabId of tabIds) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: CONTENT_CMD_CANCEL, runId: normalizedRunId });
    } catch (error) {
      // Closing the task tab remains the hard-stop fallback if the content script is unavailable.
    }
    try {
      await chrome.tabs.remove(tabId);
      closedTabs += 1;
    } catch (error) {
      log('info', 'task tab close skipped', { tabId, error: error?.message || error });
    }
    unregisterRunTab(normalizedRunId, tabId);
  }

  if (!normalizedRunId || dmpRunId === normalizedRunId) await setTaskTabId('dmp', null);
  if (!normalizedRunId || databankRunId === normalizedRunId) await setTaskTabId('databank', null);

  return { ok: true, cancelled: true, closedTabs };
}

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
async function runDatabankParam(senderTab, jsonText, autoCalculate, executionMode, crowdName, runId, sendResponse) {
  let tab = null;
  try {
    await taskStateReady;
    assertRunNotCancelled(runId);
    tab = await createTab(DATABANK_PARAM_URL);
    registerRunTab(runId, tab.id);
    await setTaskTabId('databank', tab.id, runId);
    await focusTab(tab);
    await waitForTabComplete(tab.id);
    assertRunNotCancelled(runId);
    await ensureScriptInjected(tab.id, ['databank-automation.js']);
    await waitForReady(tab.id, CONTENT_PING);
    assertRunNotCancelled(runId);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK,
      jsonText: jsonText,
      autoCalculate: autoCalculate === true,
      executionMode,
      crowdName,
      runId,
    });
    assertRunNotCancelled(runId);
    log('info', 'databank param flow done', result);
    unregisterRunTab(runId, tab.id);
    if (!runId || databankRunId === normalizeRunId(runId)) await setTaskTabId('databank', null);
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'databank param flow failed', error.message);
    if (tab?.id) {
      unregisterRunTab(runId, tab.id);
      if (error?.name === 'AbortError') {
        try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
      }
    }
    if (!runId || databankRunId === normalizeRunId(runId)) await setTaskTabId('databank', null);
    sendResponse({
      ok: false,
      cancelled: error?.name === 'AbortError',
      error: error?.message || '参数粘贴流程执行失败',
    });
  }
}

async function findOpenDatabankTab() {
  const tabs = await chrome.tabs.query({ url: 'https://databank.tmall.com/*' });
  const candidates = (Array.isArray(tabs) ? tabs : []).filter((tab) => Number.isInteger(tab?.id));
  return candidates.find((tab) => tab.active && tab.status === 'complete')
    || candidates.find((tab) => tab.status === 'complete')
    || candidates[0]
    || null;
}

async function runDatabankRealtimeCount(jsonText, crowdName, runId, sendResponse) {
  try {
    await databankRequestContextReady;
    assertRunNotCancelled(runId);
    const tab = await findOpenDatabankTab();
    if (!tab?.id) {
      throw createDatabankApiError(
        '请先打开并登录数据银行，接口取数不会自动打开新页面',
        'DATABANK_LOGIN_REQUIRED',
      );
    }
    await ensureScriptInjected(tab.id, ['databank-automation.js']);
    assertRunNotCancelled(runId);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK_REALTIME_COUNT,
      jsonText,
      crowdName,
      requestHeaders: databankRequestContext?.headers || {},
      runId,
    });
    assertRunNotCancelled(runId);
    sendResponse(result);
  } catch (error) {
    sendResponse({
      ok: false,
      cancelled: error?.name === 'AbortError',
      code: error?.code || 'DATABANK_REALTIME_COUNT_FAILED',
      error: error?.message || '接口取数失败',
    });
  }
}

async function runDatabankDirectCreate(jsonText, crowdName, runId, sendResponse) {
  try {
    await databankRequestContextReady;
    assertRunNotCancelled(runId);
    const tab = await findOpenDatabankTab();
    if (!tab?.id) {
      throw createDatabankApiError(
        '请先打开并登录数据银行，接口建包不会自动打开新页面',
        'DATABANK_LOGIN_REQUIRED',
      );
    }
    await ensureScriptInjected(tab.id, ['databank-automation.js']);
    assertRunNotCancelled(runId);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK_CREATE_API,
      jsonText,
      crowdName,
      requestHeaders: databankRequestContext?.headers || {},
      runId,
    });
    assertRunNotCancelled(runId);
    sendResponse(result);
  } catch (error) {
    sendResponse({
      ok: false,
      cancelled: error?.name === 'AbortError',
      code: error?.code || 'DATABANK_DIRECT_API_FAILED',
      error: error?.message || '接口创建人群失败',
    });
  }
}

function createDatabankApiError(message, code) {
  const error = new Error(message);
  error.code = code || 'DATABANK_API_ERROR';
  return error;
}

function buildCustomCrowdSearchUrl(crowdName) {
  const url = new URL(DATABANK_CUSTOM_CROWD_LIST_URL);
  url.searchParams.set('path', '/api/v1/custom/list');
  url.searchParams.set('source', 'CUSTOM');
  url.searchParams.set('page', '1');
  url.searchParams.set('pageSize', '10');
  url.searchParams.set('qualityReportOpened', 'all');
  url.searchParams.set('keyword', crowdName);
  url.searchParams.set('type', '4');
  url.searchParams.set('category2NotEqualList', 'scene_crowd');
  return url.toString();
}

async function fetchCustomCrowdExactMatches(crowdName) {
  const response = await fetch(buildCustomCrowdSearchUrl(crowdName), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) {
    throw createDatabankApiError('数据银行登录已失效，请重新登录后再试', 'DATABANK_LOGIN_REQUIRED');
  }
  if (!response.ok) {
    throw createDatabankApiError(`数据银行查询失败（HTTP ${response.status}）`);
  }
  const payload = await response.json();
  if (Number(payload?.errCode || 0) !== 0) {
    throw createDatabankApiError(payload?.errMsg || '数据银行查询失败');
  }
  const expectedName = String(crowdName || '').trim();
  return (Array.isArray(payload?.data?.list) ? payload.data.list : [])
    .filter((item) => String(item?.name || '').trim() === expectedName);
}

function hasNumericCrowdCount(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
    && Number.isFinite(Number(value));
}

function sortCrowdsNewestFirst(items) {
  return [...items].sort((left, right) => {
    const rightTime = Number(right?.gmtUpdateReal || right?.gmtModified || right?.gmtCreate || 0);
    const leftTime = Number(left?.gmtUpdateReal || left?.gmtModified || left?.gmtCreate || 0);
    return rightTime - leftTime;
  });
}

function summarizeCustomCrowd(item) {
  const countReady = hasNumericCrowdCount(item?.count);
  return {
    crowdId: item?.id ?? null,
    crowdBaseId: item?.baseId ?? null,
    crowdName: String(item?.name || '').trim(),
    crowdStatus: String(item?.status || '').trim(),
    crowdCount: countReady ? Number(item.count) : null,
    countReady,
    canSelectOrLookalike: item?.canSelectOrLookalike ?? null,
  };
}

async function runDatabankCrowdCountQuery(crowdName, sendResponse) {
  try {
    const exactMatches = sortCrowdsNewestFirst(await fetchCustomCrowdExactMatches(crowdName));
    const crowd = exactMatches[0] || null;
    const summary = crowd ? summarizeCustomCrowd(crowd) : {};
    sendResponse({
      ok: true,
      crowdFound: !!crowd,
      exactMatchCount: exactMatches.length,
      ...summary,
    });
  } catch (error) {
    sendResponse({
      ok: false,
      code: error?.code || 'DATABANK_API_ERROR',
      error: error?.message || '查询人群包人数失败',
    });
  }
}

async function runDatabankCustomDependencyCheck(crowdNames, sendResponse) {
  try {
    const results = [];
    for (const crowdName of crowdNames) {
      const exactMatches = sortCrowdsNewestFirst(await fetchCustomCrowdExactMatches(crowdName));
      if (exactMatches.length === 0) {
        results.push({
          crowdName,
          state: 'missing',
          ready: false,
          message: '未找到同名自定义人群',
          exactMatchCount: 0,
        });
        continue;
      }
      if (exactMatches.length > 1) {
        results.push({
          crowdName,
          state: 'ambiguous',
          ready: false,
          message: `找到 ${exactMatches.length} 个同名自定义人群`,
          exactMatchCount: exactMatches.length,
        });
        continue;
      }
      const summary = summarizeCustomCrowd(exactMatches[0]);
      const selectable = summary.canSelectOrLookalike === null
        || summary.canSelectOrLookalike === undefined
        || Number(summary.canSelectOrLookalike) !== 0;
      const ready = summary.crowdStatus === 'CREATED' && summary.countReady && selectable;
      results.push({
        ...summary,
        state: ready ? 'ready' : 'waiting',
        ready,
        message: ready ? '已计算完成' : '仍在计算中',
        exactMatchCount: 1,
      });
    }
    sendResponse({
      ok: true,
      ready: results.every((item) => item.ready),
      results,
    });
  } catch (error) {
    sendResponse({
      ok: false,
      code: error?.code || 'DATABANK_API_ERROR',
      error: error?.message || '检查自定义人群状态失败',
    });
  }
}

// Run DataBank crowd search/match/push flow (Phase 1)
async function runDatabankCrowd(senderTab, crowdName, autoApply, runId, sendResponse) {
  let tab = null;
  try {
    await taskStateReady;
    assertRunNotCancelled(runId);
    tab = await createTab(DATABANK_CROWD_URL);
    registerRunTab(runId, tab.id);
    await setTaskTabId('databank', tab.id, runId);
    await waitForTabComplete(tab.id);
    assertRunNotCancelled(runId);
    await ensureScriptInjected(tab.id, ['databank-automation.js']);
    await focusTab(tab);
    await waitForReady(tab.id, CONTENT_PING_CROWD);
    assertRunNotCancelled(runId);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK_CROWD,
      crowdName: crowdName,
      autoApply: autoApply === true,
      runId,
    });
    assertRunNotCancelled(runId);
    log('info', 'databank crowd flow done', result);
    const autoApplySubmitted = autoApply && result?.ok && Array.isArray(result.trail)
      && result.trail.some((entry) => entry?.step === 'auto_apply_submitted');
    if (autoApplySubmitted) {
      await setTaskTabId('databank', null);
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore cleanup failure */ }
      unregisterRunTab(runId, tab.id);
      if (senderTab?.id) {
        try { await focusTab(senderTab); } catch (e) { /* ignore */ }
      }
    }
    // Manual mode intentionally keeps every completed tab so the human can apply later.
    sendResponse(result);
    unregisterRunTab(runId, tab.id);
  } catch (error) {
    log('error', 'databank crowd flow failed', error.message);
    await setTaskTabId('databank', null);
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
      unregisterRunTab(runId, tab.id);
    }
    sendResponse({
      ok: false,
      cancelled: error?.name === 'AbortError',
      error: error?.message || '数据引擎人群流程执行失败',
    });
  }
}

// Wait on the retained crowd tab until the human closes the final apply dialog.
async function runDatabankWaitApply(senderTab, runId, sendResponse) {
  try {
    await taskStateReady;
    assertRunNotCancelled(runId);
    if (!databankTabId) throw new Error('没有活跃的数据引擎推送任务');
    const tab = await chrome.tabs.get(databankTabId);
    await focusTab(tab);
    const result = await sendMessageWithRetry(databankTabId, {
      type: CONTENT_CMD_DATABANK_WAIT_APPLY,
      runId,
    });
    assertRunNotCancelled(runId);
    log('info', 'databank manual apply confirmed', result);
    sendResponse(result);
  } catch (error) {
    log('error', 'databank manual apply wait failed', error.message);
    sendResponse({ ok: false, error: error?.message || '等待人工确认失败' });
  }
}

// Run DataBank dataHub status check (Phase 2) — open NEW tab for dataHub, poll until "已应用"
async function runDatabankDataHubCheck(senderTab, crowdName, runId, sendResponse) {
  let tab = null;
  try {
    assertRunNotCancelled(runId);
    // Open a fresh tab for dataHub — don't reuse the crowd tab so the dialog stays open
    tab = await createTab(DATABANK_DATAHUB_URL);
    registerRunTab(runId, tab.id);
    await waitForTabComplete(tab.id, 60);
    assertRunNotCancelled(runId);
    await new Promise((r) => setTimeout(r, 2000));
    assertRunNotCancelled(runId);
    await ensureScriptInjected(tab.id, ['databank-automation.js']);
    await waitForReady(tab.id, CONTENT_PING_DATAHUB, 60);

    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK_DATAHUB,
      crowdName: crowdName,
      runId,
    });
    assertRunNotCancelled(runId);
    log('info', 'databank dataHub check done', result);
    // Clean up the dataHub tab
    try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
    unregisterRunTab(runId, tab.id);
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'databank dataHub check failed', error.message);
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
      unregisterRunTab(runId, tab.id);
    }
    sendResponse({ ok: false, cancelled: error?.name === 'AbortError', error: error?.message || 'DataHub状态检查失败' });
  }
}

// Run DMP portrait entry wait (Phase 2) — same tab, polls for 画像透视
async function runDmpWaitPortrait(senderTab, phase1Result, runId, sendResponse) {
  try {
    await taskStateReady;
    assertRunNotCancelled(runId);
    if (!dmpTabId) throw new Error('没有活跃的 DMP 任务');
    if (runId && dmpRunId && dmpRunId !== runId) throw new Error('DMP 任务运行标识不匹配');
    log('info', 'dmp phase 2: waiting for portrait entry on tab', dmpTabId);
    await waitForReady(dmpTabId, CONTENT_PING_DMP, 10);
    const result = await sendMessageWithRetry(dmpTabId, {
      type: CONTENT_CMD_DMP_WAIT_PORTRAIT,
      phase1Result,
      runId,
    });
    assertRunNotCancelled(runId);
    log('info', 'dmp phase 2 done', result);
    sendResponse(result);
  } catch (error) {
    log('error', 'dmp phase 2 failed', error.message);
    sendResponse({ ok: false, error: error?.message || '等待画像透视入口失败' });
  }
}

// Run DMP crowd search/match/portrait flow (Phase 1)
async function runDmp(senderTab, crowdName, runId, sendResponse) {
  let tab = null;
  try {
    await taskStateReady;
    assertRunNotCancelled(runId);
    tab = await createTab(DMP_CROWD_URL);
    registerRunTab(runId, tab.id);
    await setTaskTabId('dmp', tab.id, runId);
    await waitForTabComplete(tab.id);
    assertRunNotCancelled(runId);
    await ensureScriptInjected(tab.id, ['dmp-result-core.js', 'cdp-dmp-automation.js']);
    await focusTab(tab);
    await waitForReady(tab.id, CONTENT_PING_DMP, 120);
    assertRunNotCancelled(runId);
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DMP,
      crowdName: crowdName,
      runId,
    });
    assertRunNotCancelled(runId);
    log('info', 'dmp phase 1 done', result);
    // Keep DMP active while its list refreshes; backgrounding the page can pause
    // the site's readiness updates before the portrait entry is rendered.
    sendResponse(result);
  } catch (error) {
    log('error', 'dmp phase 1 failed', error.message);
    await setTaskTabId('dmp', null);
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
      unregisterRunTab(runId, tab.id);
    }
    sendResponse({ ok: false, cancelled: error?.name === 'AbortError', error: error?.message || '达摩盘流程执行失败' });
  }
}

// Run DMP extract (Phase 2) — navigate tab to portrait page, then extract
async function runDmpExtract(senderTab, phase1Result, selectedTags, runId, sendResponse) {
  try {
    await taskStateReady;
    assertRunNotCancelled(runId);
    const tabId = dmpTabId;
    if (!tabId) throw new Error('没有活跃的 DMP 任务');
    if (runId && dmpRunId && dmpRunId !== runId) throw new Error('DMP 任务运行标识不匹配');
    const crowdId = phase1Result.crowdId;
    if (!crowdId) throw new Error('缺少 crowdId，无法进入透视');

    // Navigate the tab directly to the portrait URL (background-driven, reliable)
    const portraitUrl = 'https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId=' + crowdId;
    log('info', 'navigating tab to portrait page', { tabId, portraitUrl });
    await chrome.tabs.update(tabId, { url: portraitUrl });
    await waitForTabComplete(tabId, 120);
    assertRunNotCancelled(runId);
    // Extra wait for SPA to render after page load
    await new Promise((r) => setTimeout(r, 2000));
    assertRunNotCancelled(runId);
    await waitForReady(tabId, CONTENT_PING_DMP, 60);

    const result = await sendMessageWithRetry(tabId, {
      type: CONTENT_CMD_DMP_EXTRACT,
      phase1Result: phase1Result,
      selectedTags: selectedTags,
      runId,
    });
    assertRunNotCancelled(runId);
    log('info', 'dmp phase 2 done', result);
    await setTaskTabId('dmp', null);
    unregisterRunTab(runId, tabId);
    if (senderTab?.id) {
      try { await focusTab(senderTab); } catch (e) { /* ignore */ }
    }
    sendResponse(result);
  } catch (error) {
    log('error', 'dmp phase 2 failed', error.message);
    if (dmpTabId) {
      try { await chrome.tabs.remove(dmpTabId); } catch (e) { /* ignore */ }
      unregisterRunTab(runId, dmpTabId);
    }
    await setTaskTabId('dmp', null);
    sendResponse({ ok: false, cancelled: error?.name === 'AbortError', error: error?.message || '达摩盘数据提取失败' });
  }
}

function buildDmpWarningRow(tagInfo, tagId, detail) {
  return {
    '所属大类': tagInfo?.mainCategory || '未知大类',
    '标签类型': tagInfo?.category || '未知类型',
    '标签名称': `${tagInfo?.tagName || tagId} ❌`,
    '特征明细': detail,
    '人群占比': '-',
    'CTR': '-',
    'PPC': '-',
    _dictTagId: String(tagId),
  };
}

function buildDmpTagUrl(templateUrl, tagId) {
  const url = new URL(templateUrl);
  const id = String(tagId);
  if (/\/tag\/\d+/.test(url.pathname)) url.pathname = url.pathname.replace(/\/tag\/\d+/, `/tag/${id}`);
  else if (/\/analysis\/\d+/.test(url.pathname)) url.pathname = url.pathname.replace(/\/analysis\/\d+/, `/analysis/${id}`);
  else throw new Error('画像请求模板缺少标签路径');
  if (url.searchParams.has('tagId')) url.searchParams.set('tagId', id);
  url.searchParams.set('bizCode', 'dmp');
  applyDmpAuthParams(url, dmpAuthContext);
  return url;
}

async function fetchDmpJsonInCapturedPage(requestUrl, requestInit, requestLabel) {
  const tabId = Number(dmpAnalysisContext?.tabId);
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error('画像请求页面不可用，请重新打开任意画像透视并点击一个普通标签');
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error('已激活的达摩盘页面已关闭，请重新打开任意画像透视并点击一个普通标签');
  }
  let tabOrigin = '';
  try { tabOrigin = new URL(tab?.url || '').origin; } catch { /* handled below */ }
  if (tabOrigin !== 'https://dmp.taobao.com') {
    throw new Error('已激活的达摩盘页面已离开，请重新进入画像透视并点击一个普通标签');
  }

  let injectionResults;
  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (url, init) => {
        try {
          const response = await window.fetch(url, {
            ...(init || {}),
            credentials: 'include',
            cache: 'no-store',
          });
          return {
            requestCompleted: true,
            status: response.status,
            ok: response.ok,
            url: response.url,
            redirected: response.redirected,
            contentType: response.headers.get('content-type') || '',
            text: await response.text(),
          };
        } catch (error) {
          return {
            requestCompleted: false,
            error: error?.message || String(error),
          };
        }
      },
      args: [String(requestUrl), requestInit || {}],
    });
  } catch (error) {
    throw new Error(`${requestLabel}无法在达摩盘页面内执行：${error?.message || error}`);
  }

  const pageResponse = injectionResults?.[0]?.result;
  if (!pageResponse?.requestCompleted) {
    throw new Error(`${requestLabel}请求失败：${pageResponse?.error || '达摩盘页面没有返回结果'}`);
  }
  if (pageResponse.status === 401 || pageResponse.status === 403) {
    throw new Error(`${requestLabel}未通过登录验证，请重新登录并激活画像透视`);
  }
  if (!pageResponse.ok) {
    throw new Error(`${requestLabel}接口返回 HTTP ${pageResponse.status}`);
  }

  const responseText = String(pageResponse.text || '');
  if (!responseText.trim()) {
    throw new Error(`${requestLabel}返回空内容，请刷新画像透视页并重新点击一个普通标签`);
  }
  try {
    return JSON.parse(responseText);
  } catch {
    const contentType = pageResponse.contentType || '未知';
    let responsePath = '';
    try {
      const finalUrl = new URL(pageResponse.url || requestUrl);
      responsePath = `，目标 ${finalUrl.origin}${finalUrl.pathname}`;
    } catch { /* diagnostics only */ }
    throw new Error(`${requestLabel}未返回 JSON（HTTP ${pageResponse.status}，类型 ${contentType}${responsePath}）`);
  }
}

// Production DMP extraction path. It preserves the page-driven result contract
// while replacing page navigation with authenticated crowd and tag API calls.
async function runDmpDirectExtract(crowdName, selectedTags, runId, sendResponse) {
  try {
    await dmpContextReady;
    assertRunNotCancelled(runId);
    if (!globalThis.DmpResultCore) throw new Error('DMP计算核心未加载');
    const tagIds = [...new Set((Array.isArray(selectedTags) ? selectedTags : [])
      .map((tagId) => String(tagId || '').trim())
      .filter(Boolean))];
    if (tagIds.length === 0) throw new Error('请至少选择一个画像标签');
    if (!isFreshDmpContext(dmpAnalysisContext)) {
      throw new Error('请先登录达摩盘，进入任意人群的画像透视并点击一个普通标签，等待图表加载后再运行');
    }
    if (!isFreshDmpContext(dmpAuthContext)) {
      storeDmpAuthContextFromUrl(dmpAnalysisContext.url);
    }
    if (!isFreshDmpContext(dmpAuthContext)) {
      throw new Error('达摩盘登录状态未捕获或已过期，请重新打开画像透视并点击一个普通标签');
    }

    const trail = [{ step: 'analysis_context_ready' }];
    const dictionaryResponse = await fetch(chrome.runtime.getURL('dmp_tags_dictionary.json'));
    const dictionary = await dictionaryResponse.json();
    const dictionaryById = new Map(dictionary.map((tag) => [String(tag.tagId), tag]));

    const searchUrl = new URL('https://dmp.taobao.com/api_2/crowd/');
    searchUrl.searchParams.set('bizCode', 'dmp');
    searchUrl.searchParams.set('currentPage', '1');
    searchUrl.searchParams.set('crowdName', crowdName);
    searchUrl.searchParams.set('pageSize', '20');
    searchUrl.searchParams.set('listType', '7');
    applyDmpAuthParams(searchUrl, dmpAuthContext, true);
    const searchJson = await fetchDmpJsonInCapturedPage(searchUrl.toString(), {
      method: 'GET', credentials: 'include', cache: 'no-store',
    }, '人群搜索');
    assertRunNotCancelled(runId);
    if (searchJson?.info?.ok !== true || Number(searchJson?.info?.code) !== 0) {
      throw new Error(`人群搜索接口未通过（code: ${searchJson?.info?.code ?? '未知'}），可能需要重新激活登录状态`);
    }
    trail.push({ step: 'searched' });
    const crowd = (Array.isArray(searchJson?.data?.list) ? searchJson.data.list : [])
      .find((item) => String(item?.crowdName || '').trim() === crowdName);
    if (!crowd) throw new Error('未找到名称完全一致的人群包');
    const crowdId = Number(crowd.crowdId);
    if (!Number.isSafeInteger(crowdId) || crowdId <= 0) throw new Error('搜索结果缺少有效 crowdId');
    if (!crowd.selectTagOptionSet || typeof crowd.selectTagOptionSet !== 'object') {
      throw new Error('搜索结果缺少人群标签表达式');
    }
    trail.push({ step: 'matched', crowdId });

    const crowdSelection = JSON.parse(JSON.stringify(crowd.selectTagOptionSet));
    crowdSelection.name = crowd.crowdName;
    crowdSelection.id = crowdId;
    crowdSelection.storageType = crowd.storageType;
    const payload = JSON.parse(JSON.stringify(dmpAnalysisContext.payload));
    payload.crowdId = crowdId;
    payload.selectTagOptionSet = {
      operator: 1,
      selectTagOptionSet: [crowdSelection, { operator: 1, selectTagOptionSet: [] }],
      selects: [],
    };

    const stored = await chrome.storage.local.get(['dmpConditionCache', 'rebaseExcludedTagIds']);
    const rawRows = [];
    for (const tagId of tagIds) {
      assertRunNotCancelled(runId);
      const tagInfo = dictionaryById.get(tagId) || {};
      let request;
      try {
        request = globalThis.DmpResultCore.buildRequest(
          { url: buildDmpTagUrl(dmpAnalysisContext.url, tagId).toString(), payload },
          tagId,
          tagInfo,
          stored.dmpConditionCache || {},
        );
      } catch (error) {
        rawRows.push(buildDmpWarningRow(tagInfo, tagId, `⚠️ 提取失败: ${error?.message || error}`));
        trail.push({ step: 'tag_failed', tagId });
        continue;
      }
      if (!request.ok) {
        rawRows.push(buildDmpWarningRow(tagInfo, tagId, '⚠️ 未配置下钻条件'));
        trail.push({ step: 'tag_skipped', tagId });
        continue;
      }

      try {
        const tagJson = await fetchDmpJsonInCapturedPage(request.url, {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/json;charset=UTF-8' },
          body: JSON.stringify(request.body),
        }, '标签透视');
        assertRunNotCancelled(runId);
        if (tagJson?.info?.ok !== true || Number(tagJson?.info?.code) !== 0) {
          throw new Error(`标签透视接口未通过（code: ${tagJson?.info?.code ?? '未知'}）`);
        }
        if (Array.isArray(tagJson?.data?.chartDataFull)) {
          rawRows.push(...tagJson.data.chartDataFull.map((item) => ({
            '所属大类': tagInfo.mainCategory || '未知大类',
            '标签类型': tagInfo.category || '未知类型',
            '标签名称': item.tagName || '-',
            '特征明细': item.optionName || '-',
            '人群占比': `${Number.parseFloat(item.rate || 0) * 100}%`,
            'CTR': item.ctrIndex || '-',
            'PPC': item.ppcIndex || '-',
            _dictTagId: String(tagId),
          })));
        }
        trail.push({ step: 'tag_extracted', tagId });
      } catch (error) {
        rawRows.push(buildDmpWarningRow(tagInfo, tagId, `⚠️ 提取失败: ${error?.message || error}`));
        trail.push({ step: 'tag_failed', tagId });
      }
    }

    const crowdCount = Number(crowd.coverage) || 0;
    const results = globalThis.DmpResultCore.finalizeRows(
      rawRows, crowdCount, stored.rebaseExcludedTagIds || [],
    );
    trail.push({ step: 'data_extracted', tagCount: tagIds.length, resultCount: results.length });
    sendResponse({
      ok: true,
      trail,
      crowdId,
      crowdName,
      crowdCount: crowdCount || null,
      extracted: true,
      results,
    });
  } catch (error) {
    sendResponse({
      ok: false,
      cancelled: error?.name === 'AbortError',
      error: error?.message || '达摩盘接口取数失败',
    });
  }
}

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msgType = message?.type;
  if (msgType === MSG_DMP_CAPTURE_ANALYSIS_CONTEXT) {
    captureDmpAnalysisContext(message, sender, sendResponse);
    return false;
  }
  if (![MSG_DATABANK_PARAM, MSG_DATABANK_REALTIME_COUNT, MSG_DATABANK_CREATE_API, MSG_DATABANK_COUNT, MSG_DATABANK_DEPENDENCIES, MSG_DATABANK_CROWD, MSG_DATABANK_WAIT_APPLY, MSG_DATABANK_DATAHUB, MSG_DMP, MSG_DMP_WAIT_PORTRAIT, MSG_DMP_EXTRACT, MSG_DMP_DIRECT_EXTRACT, MSG_CANCEL_TASK, MSG_DMP_GET_SETTINGS, MSG_DMP_UPDATE_SETTINGS].includes(msgType)) return;

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
  const runId = normalizeRunId(message.runId);

  if (msgType === MSG_DMP_GET_SETTINGS || msgType === MSG_DMP_UPDATE_SETTINGS) {
    const operation = msgType === MSG_DMP_GET_SETTINGS ? readDmpSettings() : updateDmpSettings(message);
    operation
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'DMP设置同步失败' }));
    return true;
  }

  if (msgType === MSG_CANCEL_TASK) {
    cancelRun(runId)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, cancelled: false, error: error?.message || '终止任务失败' }));
    return true;
  }

  if (msgType === MSG_DATABANK_PARAM) {
    const jsonText = String(message.jsonText || '').trim();
    if (!jsonText) {
      sendResponse({ ok: false, error: 'jsonText 不能为空' });
      return;
    }
    const executionMode = String(message.executionMode || '');
    const crowdName = String(message.crowdName || '').trim();
    if ((executionMode === 'create_only' || executionMode === 'create_and_count') && !crowdName) {
      sendResponse({ ok: false, error: '创建人群时人群包名称不能为空' });
      return;
    }
    runDatabankParam(
      senderTab,
      jsonText,
      message.autoCalculate === true,
      executionMode,
      crowdName,
      runId,
      sendResponse,
    );
    return true;
  }

  if (msgType === MSG_DATABANK_REALTIME_COUNT) {
    const jsonText = String(message.jsonText || '').trim();
    const crowdName = String(message.crowdName || '').trim();
    if (!jsonText) {
      sendResponse({ ok: false, error: 'jsonText 不能为空' });
      return;
    }
    runDatabankRealtimeCount(jsonText, crowdName, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_CREATE_API) {
    const jsonText = String(message.jsonText || '').trim();
    const crowdName = String(message.crowdName || '').trim();
    if (!jsonText) {
      sendResponse({ ok: false, error: 'jsonText 不能为空' });
      return;
    }
    if (!crowdName) {
      sendResponse({ ok: false, error: '接口创建人群时人群包名称不能为空' });
      return;
    }
    runDatabankDirectCreate(jsonText, crowdName, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_COUNT) {
    const crowdName = String(message.crowdName || '').trim();
    if (!crowdName) {
      sendResponse({ ok: false, error: '查询人数时人群包名称不能为空' });
      return;
    }
    runDatabankCrowdCountQuery(crowdName, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_DEPENDENCIES) {
    const crowdNames = [...new Set((Array.isArray(message.crowdNames) ? message.crowdNames : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean))].slice(0, 100);
    if (crowdNames.length === 0) {
      sendResponse({ ok: false, error: '自定义人群名称不能为空' });
      return;
    }
    runDatabankCustomDependencyCheck(crowdNames, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_CROWD) {
    const crowdName = String(message.crowdName || '').trim();
    // Cancel signal — close any open DMP/DataBank tabs
    if (crowdName === '__CANCEL__') {
      cancelRun(runId)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, cancelled: false, error: error?.message || '终止任务失败' }));
      return true;
    }
    if (!crowdName) {
      sendResponse({ ok: false, error: '人群包名称不能为空' });
      return;
    }
    runDatabankCrowd(senderTab, crowdName, message.autoApply === true, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_DATAHUB) {
    const crowdName = String(message.crowdName || '').trim();
    if (!crowdName) {
      sendResponse({ ok: false, error: '人群包名称不能为空' });
      return;
    }
    runDatabankDataHubCheck(senderTab, crowdName, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DATABANK_WAIT_APPLY) {
    runDatabankWaitApply(senderTab, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DMP) {
    const crowdName = String(message.crowdName || '').trim();
    if (!crowdName) {
      sendResponse({ ok: false, error: '人群包名称不能为空' });
      return;
    }
    runDmp(senderTab, crowdName, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DMP_WAIT_PORTRAIT) {
    runDmpWaitPortrait(senderTab, message.phase1Result || {}, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DMP_EXTRACT) {
    const phase1Result = message.phase1Result || {};
    const selectedTags = message.selectedTags || [];
    runDmpExtract(senderTab, phase1Result, selectedTags, runId, sendResponse);
    return true;
  }

  if (msgType === MSG_DMP_DIRECT_EXTRACT) {
    const crowdName = String(message.crowdName || '').trim();
    if (!crowdName) {
      sendResponse({ ok: false, error: '人群包名称不能为空' });
      return;
    }
    const selectedTags = Array.isArray(message.selectedTags) ? message.selectedTags.map(String) : [];
    runDmpDirectExtract(crowdName, selectedTags, runId, sendResponse);
    return true;
  }
});

chrome.tabs.onRemoved?.addListener((tabId) => {
  (async () => {
    await taskStateReady;
    if (tabId === dmpTabId) await setTaskTabId('dmp', null);
    if (tabId === databankTabId) await setTaskTabId('databank', null);
    for (const [runId, tabs] of trackedTabsByRun.entries()) {
      if (tabs.has(tabId)) unregisterRunTab(runId, tabId);
    }
  })();
});
