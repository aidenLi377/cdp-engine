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
const DATABANK_CONTEXT_WARMUP_NAME = '未命名';
const DATABANK_CONTEXT_WARMUP_JSON = JSON.stringify({
  crowdName: DATABANK_CONTEXT_WARMUP_NAME,
  list: [{
    selectionLv1: ['FULL_LINK', 'FULL_LINK'],
    selectionLv3: {
      cate: 'ALL',
      types: ['15187#|#D_ROYALTY'],
      dateType: 'RELATIVE_RANGE',
      dateValue: '30',
    },
    fromPoolId: 1,
  }],
  compute: '(0)',
});
const DMP_CROWD_URL = 'https://dmp.taobao.com/index_new.html#!/crowds-new/list?spm=';

// Message types from frontend (via bridge)
const MSG_DATABANK_REALTIME_COUNT = 'CDP_QUERY_DATABANK_REALTIME_COUNT';
const MSG_DATABANK_CREATE_API = 'CDP_CREATE_DATABANK_CROWD_API';
const MSG_DATABANK_CONTEXT = 'CDP_PREPARE_DATABANK_API_CONTEXT';
const MSG_DATABANK_SESSION_RELEASE = 'CDP_RELEASE_DATABANK_API_SESSION';
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
const CONTENT_CMD_DATABANK_CONTEXT = 'PREPARE_DATABANK_API_CONTEXT';
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
const DATABANK_REQUEST_CONTEXTS_KEY = 'cdpDatabankRequestContexts';
const DATABANK_CREATE_GUARDS_KEY = 'cdpDatabankCreateGuards';
const DATABANK_CROWD_QUERY_TIMEOUT_MS = 20000;
let databankRequestContext = null;
const databankRequestContexts = new Map();
let databankContextWarmupPromise = null;
const databankApiSessions = new Map();
const databankCreateGuards = new Map();
const DMP_AUTH_CONTEXT_KEY = 'cdpDmpDirectAuthContext';
const DMP_ANALYSIS_CONTEXT_KEY = 'cdpDmpAnalysisContext';
const DMP_CONTEXT_WAIT_INTERVAL_MS = 500;
const DMP_AUTH_CAPTURE_TIMEOUT_MS = 45 * 1000;
const DMP_ANALYSIS_CAPTURE_TIMEOUT_MS = 90 * 1000;
let dmpAuthContext = null;
let dmpAnalysisContext = null;
let dmpContextWarmupPromise = null;
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
    const stored = await taskStorage.get([
      DATABANK_REQUEST_CONTEXT_KEY,
      DATABANK_REQUEST_CONTEXTS_KEY,
    ]);
    const storedContexts = stored?.[DATABANK_REQUEST_CONTEXTS_KEY];
    if (storedContexts && typeof storedContexts === 'object') {
      for (const [accountKey, context] of Object.entries(storedContexts)) {
        if (!String(accountKey || '').trim() || !context || typeof context !== 'object') continue;
        if (!String(context?.headers?.['x-csrf-token'] || '').trim()) continue;
        databankRequestContexts.set(accountKey, context);
      }
    }
    const context = stored?.[DATABANK_REQUEST_CONTEXT_KEY];
    if (context && typeof context === 'object') {
      databankRequestContext = context;
      const accountKey = String(context?.accountKey || '').trim();
      if (accountKey && String(context?.headers?.['x-csrf-token'] || '').trim()) {
        databankRequestContexts.set(accountKey, context);
      }
    }
  } catch (error) {
    log('info', 'databank request context restore skipped', error?.message || error);
  }
})();

const databankCreateGuardsReady = (async () => {
  if (!taskStorage) return;
  try {
    const stored = await taskStorage.get([DATABANK_CREATE_GUARDS_KEY]);
    const guards = stored?.[DATABANK_CREATE_GUARDS_KEY];
    if (!guards || typeof guards !== 'object') return;
    for (const [key, guard] of Object.entries(guards)) {
      if (!guard || typeof guard !== 'object') continue;
      databankCreateGuards.set(key, {
        ...guard,
        state: guard?.state === 'confirmed' ? 'confirmed' : 'uncertain',
        promise: null,
      });
    }
  } catch (error) {
    log('info', 'databank create guards restore skipped', error?.message || error);
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

function buildDmpAuthFingerprint(params = {}) {
  const source = ['_tb_token_', '_csrf', 'csrfId']
    .map((key) => `${key}:${String(params?.[key] || '')}`)
    .join('|');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `dmp:${(hash >>> 0).toString(16)}`;
}

function storeDmpAuthContextFromUrl(inputUrl, tabId = null) {
  let url;
  try { url = new URL(inputUrl); } catch { return false; }
  if (url.origin !== 'https://dmp.taobao.com') return false;
  const params = Object.fromEntries(
    ['_tb_token_', '_csrf', 'csrfId', 'spm']
      .map((key) => [key, url.searchParams.get(key) || ''])
      .filter(([, value]) => value),
  );
  if (!params._tb_token_ || !params._csrf || !params.csrfId) return false;
  dmpAuthContext = {
    params,
    capturedAt: Date.now(),
    tabId: Number.isInteger(tabId) ? tabId : null,
    authFingerprint: buildDmpAuthFingerprint(params),
  };
  chrome.storage?.session?.set({ [DMP_AUTH_CONTEXT_KEY]: dmpAuthContext }).catch(() => null);
  return true;
}

function clearDmpDirectContexts() {
  dmpAuthContext = null;
  dmpAnalysisContext = null;
  chrome.storage?.session?.remove([
    DMP_AUTH_CONTEXT_KEY,
    DMP_ANALYSIS_CONTEXT_KEY,
  ]).catch(() => null);
}

function captureDmpAuthContext(details) {
  if (details?.initiator !== 'https://dmp.taobao.com' || !Number.isInteger(details?.tabId) || details.tabId < 0) return;
  let url;
  try { url = new URL(details.url); } catch { return; }
  if (url.origin !== 'https://dmp.taobao.com' || url.pathname !== '/api_2/crowd/') return;
  storeDmpAuthContextFromUrl(url.toString(), details.tabId);
}

function isFreshDmpContext(context) {
  // These values belong to the current logged-in browser session. Time alone
  // does not make them invalid; explicit authentication failures and account
  // changes do. Keeping the historical name avoids a wide compatibility
  // refactor while changing the validity rule to evidence-based invalidation.
  return Boolean(context && Number.isFinite(Number(context.capturedAt)));
}

function isUsableDmpAnalysisContext(context) {
  if (!context?.url || !context?.payload || !context.payload.crowdId) return false;
  if (!isFreshDmpContext(context) || !isFreshDmpContext(dmpAuthContext)) return false;
  if (!Number.isInteger(context.tabId) || context.tabId !== dmpAuthContext?.tabId) return false;
  if (!context.authFingerprint || context.authFingerprint !== dmpAuthContext?.authFingerprint) return false;
  try {
    const url = new URL(context.url);
    return url.origin === 'https://dmp.taobao.com'
      && /\/api_2\/analysis\/(?:tag\/)?\d+/.test(url.pathname);
  } catch {
    return false;
  }
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

  if (!storeDmpAuthContextFromUrl(analysisUrl.toString(), sender.tab.id)) {
    sendResponse({ ok: false, error: '画像请求缺少有效的账号安全信息' });
    return;
  }
  dmpAnalysisContext = {
    url: analysisUrl.toString(),
    payload: JSON.parse(JSON.stringify(payload)),
    tabId: sender.tab.id,
    capturedAt: Date.now(),
    authFingerprint: dmpAuthContext.authFingerprint,
  };
  chrome.storage?.session?.set({ [DMP_ANALYSIS_CONTEXT_KEY]: dmpAnalysisContext }).catch(() => null);
  sendResponse({ ok: true });
}

function applyDmpAuthParams(url, context, includeSpm = false) {
  if (!isFreshDmpContext(context)) return;
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
  const previousToken = String(databankRequestContext?.headers?.['x-csrf-token'] || '');
  const nextToken = String(normalizedHeaders['x-csrf-token'] || '');
  const sameBoundContext = Number(databankRequestContext?.tabId) === Number(details?.tabId)
    && previousToken
    && previousToken === nextToken;
  storeDatabankRequestContext(normalizedHeaders, {
    tabId: details?.tabId,
    accountKey: sameBoundContext ? databankRequestContext?.accountKey : '',
    accountSource: sameBoundContext ? databankRequestContext?.accountSource : '',
  });
}

function storeDatabankRequestContext(headers, metadata = {}) {
  const normalizedHeaders = {};
  for (const [rawName, rawValue] of Object.entries(headers || {})) {
    const name = String(rawName || '').toLowerCase();
    if (!['x-csrf-token', 'x-requested-with', 'bx-v'].includes(name)) continue;
    const value = String(rawValue || '').trim();
    if (value) normalizedHeaders[name] = value;
  }
  if (!normalizedHeaders['x-csrf-token']) return false;
  databankRequestContext = {
    headers: normalizedHeaders,
    capturedAt: Date.now(),
    tabId: Number.isInteger(metadata?.tabId) ? metadata.tabId : null,
    accountKey: String(metadata?.accountKey || '').trim(),
    accountSource: String(metadata?.accountSource || '').trim(),
  };
  if (databankRequestContext.accountKey) {
    databankRequestContexts.set(databankRequestContext.accountKey, databankRequestContext);
  }
  if (taskStorage) {
    taskStorage.set({
      [DATABANK_REQUEST_CONTEXT_KEY]: databankRequestContext,
      [DATABANK_REQUEST_CONTEXTS_KEY]: Object.fromEntries(databankRequestContexts),
    }).catch(() => null);
  }
  return true;
}

function clearDatabankRequestContext(options = {}) {
  const accountKey = String(options.accountKey || databankRequestContext?.accountKey || '').trim();
  if (options.invalidateAccount === true && accountKey) {
    databankRequestContexts.delete(accountKey);
  }
  databankRequestContext = null;
  if (taskStorage) {
    taskStorage.set({
      [DATABANK_REQUEST_CONTEXTS_KEY]: Object.fromEntries(databankRequestContexts),
    }).then(() => taskStorage.remove(DATABANK_REQUEST_CONTEXT_KEY)).catch(() => null);
  }
}

function hasDatabankRequestContext(options = {}) {
  const hasToken = Boolean(String(databankRequestContext?.headers?.['x-csrf-token'] || '').trim());
  if (!hasToken) return false;
  if (options.allowUnbound !== true) {
    if (!Number.isInteger(databankRequestContext?.tabId)) return false;
    if (!String(databankRequestContext?.accountKey || '').trim()) return false;
  }
  return Number.isFinite(Number(databankRequestContext?.capturedAt));
}

function pruneDatabankApiSessions() {
  for (const [runId, session] of databankApiSessions.entries()) {
    if (!session || !Number.isInteger(session.tabId) || !String(session.accountKey || '').trim()) {
      databankApiSessions.delete(runId);
    }
  }
}

function releaseDatabankApiSession(runId) {
  const normalizedRunId = normalizeRunId(runId);
  if (normalizedRunId) databankApiSessions.delete(normalizedRunId);
}

async function getDatabankTabById(tabId) {
  if (!Number.isInteger(tabId)) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab?.url || '');
    if (url.origin !== 'https://databank.tmall.com') return null;
    return tab;
  } catch (_error) {
    return null;
  }
}

async function findDatabankSessionTab() {
  const capturedTab = await getDatabankTabById(databankRequestContext?.tabId);
  return capturedTab || await findOpenDatabankTab();
}

function activateCachedDatabankContext(accountKey, tabId) {
  const normalizedAccountKey = String(accountKey || '').trim();
  const cached = normalizedAccountKey ? databankRequestContexts.get(normalizedAccountKey) : null;
  if (!cached || !String(cached?.headers?.['x-csrf-token'] || '').trim()) return false;
  return storeDatabankRequestContext(cached.headers, {
    tabId,
    accountKey: normalizedAccountKey,
    accountSource: cached.accountSource || 'account_cache',
  });
}

async function bindDatabankApiSession(runId, preferredTab = null) {
  const normalizedRunId = normalizeRunId(runId);
  if (!normalizedRunId) return null;
  if (!hasDatabankRequestContext()) return null;
  pruneDatabankApiSessions();
  const tab = await getDatabankTabById(preferredTab?.id)
    || await findDatabankSessionTab();
  if (!tab?.id) return null;
  if (Number(databankRequestContext?.tabId) !== Number(tab.id)) return null;
  await ensureScriptInjected(tab.id, ['databank-automation.js']);
  const session = {
    runId: normalizedRunId,
    tabId: tab.id,
    headers: { ...(databankRequestContext?.headers || {}) },
    contextCapturedAt: Number(databankRequestContext?.capturedAt || 0),
    accountKey: String(databankRequestContext?.accountKey || ''),
    createdAt: Date.now(),
    refreshAttempted: false,
    refreshPromise: null,
  };
  databankApiSessions.set(normalizedRunId, session);
  return session;
}

function serializeDatabankCreateGuards() {
  return Object.fromEntries([...databankCreateGuards.entries()].map(([key, guard]) => [key, {
    state: guard?.state === 'confirmed' ? 'confirmed' : 'uncertain',
    crowdName: String(guard?.crowdName || ''),
    accountKey: String(guard?.accountKey || ''),
    createdAt: Number(guard?.createdAt || Date.now()),
    lastCheckedAt: Number(guard?.lastCheckedAt || 0),
  }]));
}

async function persistDatabankCreateGuards() {
  if (!taskStorage) {
    throw createDatabankApiError(
      '插件无法保存建包保护状态，已停止创建以避免产生副本',
      'DATABANK_CREATE_GUARD_UNAVAILABLE',
    );
  }
  const serialized = serializeDatabankCreateGuards();
  if (Object.keys(serialized).length === 0) {
    await taskStorage.remove(DATABANK_CREATE_GUARDS_KEY);
    return;
  }
  await taskStorage.set({ [DATABANK_CREATE_GUARDS_KEY]: serialized });
}

function databankCreateGuardKey(accountKey, crowdName) {
  return `${String(accountKey || '').trim()}\n${normalizeCustomCrowdName(crowdName)}`;
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
  releaseDatabankApiSession(normalizedRunId);
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

async function findOpenDatabankTab() {
  const tabs = await chrome.tabs.query({ url: 'https://databank.tmall.com/*' });
  const candidates = (Array.isArray(tabs) ? tabs : []).filter((tab) => Number.isInteger(tab?.id));
  return candidates.find((tab) => tab.active && tab.status === 'complete')
    || candidates.find((tab) => tab.status === 'complete')
    || candidates[0]
    || null;
}

function isDatabankParamUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.origin === 'https://databank.tmall.com'
      && url.hash.startsWith('#/userDefinedAnalyses');
  } catch {
    return false;
  }
}

async function findOpenDatabankParamTab() {
  const tabs = await chrome.tabs.query({ url: 'https://databank.tmall.com/*' });
  const candidates = (Array.isArray(tabs) ? tabs : []).filter((tab) => {
    return Number.isInteger(tab?.id)
      && tab.status === 'complete'
      && isDatabankParamUrl(tab.url);
  });
  return candidates.find((tab) => tab.active) || candidates[0] || null;
}

async function restoreDatabankTabUrl(tabId, restoreUrl) {
  if (!Number.isInteger(tabId) || !restoreUrl) return;
  try {
    const current = await getDatabankTabById(tabId);
    if (!current?.id || String(current.url || '') === String(restoreUrl)) return;
    await chrome.tabs.update(tabId, { url: restoreUrl });
    await waitForTabComplete(tabId);
  } catch (error) {
    log('info', 'DataBank warm-up tab restore skipped', {
      tabId,
      error: error?.message || error,
    });
  }
}

async function inspectDatabankApiContext(tab, requestHeaders = databankRequestContext?.headers || {}) {
  if (!tab?.id) return { ready: false, source: 'missing_tab' };
  await ensureScriptInjected(tab.id, ['databank-automation.js']);
  let inspected = await sendMessageWithRetry(tab.id, {
    type: CONTENT_CMD_DATABANK_CONTEXT,
    requestHeaders,
  });
  const inspectedAccountKey = String(inspected?.accountKey || '').trim();
  const capturedUnboundHeaders = !String(databankRequestContext?.accountKey || '').trim()
    && Number(databankRequestContext?.tabId) === Number(tab.id)
    && String(databankRequestContext?.headers?.['x-csrf-token'] || '').trim()
    ? databankRequestContext.headers
    : null;
  if (!inspected?.ready && inspectedAccountKey && capturedUnboundHeaders) {
    storeDatabankRequestContext(capturedUnboundHeaders, {
      tabId: tab.id,
      accountKey: inspectedAccountKey,
      accountSource: inspected.accountSource || 'captured_request',
    });
  } else if (!inspected?.ready && inspectedAccountKey) {
    activateCachedDatabankContext(inspectedAccountKey, tab.id);
  }
  if (!inspected?.ready && inspectedAccountKey && hasDatabankRequestContext()) {
    inspected = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK_CONTEXT,
      requestHeaders: databankRequestContext?.headers || {},
    });
  }
  if (inspected?.ready && storeDatabankRequestContext(inspected.requestHeaders || {}, {
    tabId: tab.id,
    accountKey: inspected.accountKey,
    accountSource: inspected.accountSource,
  })) {
    return {
      ready: true,
      source: inspected.source || 'page',
      accountKey: inspected.accountKey,
      accountSource: inspected.accountSource,
    };
  }
  return {
    ready: false,
    source: inspected?.source || 'page_missing_context',
    accountKey: inspected?.accountKey || '',
    accountSource: inspected?.accountSource || '',
  };
}

async function waitForCapturedDatabankContext(startedAt, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasDatabankRequestContext({ allowUnbound: true }) && Number(databankRequestContext?.capturedAt || 0) >= startedAt) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return hasDatabankRequestContext({ allowUnbound: true })
    && Number(databankRequestContext?.capturedAt || 0) >= startedAt;
}

async function runDatabankContextWarmup(options = {}) {
  if (databankContextWarmupPromise) return databankContextWarmupPromise;
  databankContextWarmupPromise = (async () => {
    // Never create or close a hidden page. Automatic preparation may only
    // reuse an official parameter page that the user already has open.
    let tab = await getDatabankTabById(options?.tab?.id)
      || await findOpenDatabankParamTab()
      || await findOpenDatabankTab();
    if (!tab?.id) {
      throw createDatabankApiError(
        '未找到已打开的数据引擎圈人页面；系统不会在后台自动打开或关闭页面',
        'DATABANK_PAGE_REQUIRED',
      );
    }
    let restoreUrl = '';
    let completed = false;
    if (!isDatabankParamUrl(tab.url)) {
      restoreUrl = String(tab.url || '').trim();
      await chrome.tabs.update(tab.id, { url: DATABANK_PARAM_URL });
      await waitForTabComplete(tab.id);
      tab = await getDatabankTabById(tab.id);
      if (!tab?.id || !isDatabankParamUrl(tab.url)) {
        throw createDatabankApiError(
          '已找到数据银行页面，但无法在后台进入圈人参数页',
          'DATABANK_PAGE_REQUIRED',
        );
      }
    }
    try {
    await ensureScriptInjected(tab.id, ['databank-automation.js']);
    const inspected = options?.inspected || await inspectDatabankApiContext(tab, {})
      .catch(() => ({ ready: false }));
    if (inspected.ready || hasDatabankRequestContext()) {
      completed = true;
      return {
        ready: true,
        source: inspected.source || 'open_page_security_context',
        warmedUp: false,
        tabId: tab.id,
        restoreUrl,
      };
    }

    await waitForReady(tab.id, CONTENT_PING);
    const startedAt = Date.now();
    const result = await sendMessageWithRetry(tab.id, {
      type: CONTENT_CMD_DATABANK,
      jsonText: DATABANK_CONTEXT_WARMUP_JSON,
      autoCalculate: true,
      executionMode: 'context_warmup',
      crowdName: DATABANK_CONTEXT_WARMUP_NAME,
      precheckedNoMatch: true,
      runId: `context-warmup-${startedAt}`,
    });
    if (!result?.ok) {
      throw createDatabankApiError(
        result?.error || '数据银行接口环境自动准备失败',
        result?.code || 'DATABANK_AUTOMATION_FAILED',
      );
    }
    const captured = await waitForCapturedDatabankContext(startedAt);
    if (!captured) {
      throw createDatabankApiError(
        '未捕获到真实的数据银行接口安全信息',
        'DATABANK_REQUEST_CONTEXT_REQUIRED',
      );
    }
    const inspectedAccountKey = String(inspected?.accountKey || '').trim();
    if (inspectedAccountKey) {
      storeDatabankRequestContext(databankRequestContext?.headers || {}, {
        tabId: tab.id,
        accountKey: inspectedAccountKey,
        accountSource: inspected.accountSource || 'cookie_session',
      });
    }
    const bound = hasDatabankRequestContext()
      ? { ready: true }
      : await inspectDatabankApiContext(tab, databankRequestContext?.headers || {});
    if (!bound.ready) {
      throw createDatabankApiError(
        '已取得接口安全信息，但未能绑定当前数据银行账号',
        'DATABANK_REQUEST_CONTEXT_REQUIRED',
      );
    }
    completed = true;
    return {
      ready: true,
      source: 'lightweight_page_initialization',
      warmedUp: true,
      usedCurrentTask: false,
      warmupResult: null,
      tabId: tab.id,
      restoreUrl,
    };
    } finally {
      if (!completed && restoreUrl) {
        await restoreDatabankTabUrl(tab?.id, restoreUrl);
      }
    }
  })();
  try {
    return await databankContextWarmupPromise;
  } finally {
    databankContextWarmupPromise = null;
  }
}

async function runDatabankApiContextCheck(openSetup, autoWarmup, runId, sendResponse, warmupOptions = {}) {
  try {
    await databankRequestContextReady;
    pruneDatabankApiSessions();
    const normalizedRunId = normalizeRunId(runId);
    const existingSession = normalizedRunId ? databankApiSessions.get(normalizedRunId) : null;
    if (existingSession) {
      const lockedTab = await getDatabankTabById(existingSession.tabId);
      const sessionMatches = lockedTab?.id
        && hasDatabankRequestContext()
        && Number(databankRequestContext?.tabId) === Number(existingSession.tabId)
        && String(databankRequestContext?.accountKey || '') === String(existingSession.accountKey || '')
        && String(databankRequestContext?.headers?.['x-csrf-token'] || '') === String(existingSession.headers?.['x-csrf-token'] || '');
      if (sessionMatches) {
        sendResponse({
          ok: true,
          ready: true,
          source: 'batch_session',
          hasOpenTab: true,
          sessionReady: true,
          sessionReused: true,
          accountKey: existingSession.accountKey,
          accountSource: databankRequestContext?.accountSource || '',
        });
        return;
      }
      databankApiSessions.delete(normalizedRunId);
    }
    let tab = await findDatabankSessionTab();
    tab = tab || await findOpenDatabankTab();
    let openedSetup = false;
    let inspected = null;
    if (tab?.id) {
      inspected = await inspectDatabankApiContext(tab, {}).catch((error) => ({
        ready: false,
        source: 'inspection_failed',
        error: error?.message || '页面安全上下文读取失败',
      }));
      if (inspected.ready === true) {
        const session = await bindDatabankApiSession(runId, tab);
        sendResponse({
          ok: true,
          ready: true,
          source: inspected.source,
          hasOpenTab: true,
          openedSetup: false,
          sessionReady: Boolean(session),
          sessionReused: false,
          accountKey: String(session?.accountKey || inspected.accountKey || ''),
          accountSource: inspected.accountSource || '',
        });
        return;
      }
    }

    if (autoWarmup) {
      try {
        const warmed = await runDatabankContextWarmup({
          ...warmupOptions,
          tab,
          inspected,
        });
        tab = await findDatabankSessionTab();
        const session = warmed.ready === true
          ? await bindDatabankApiSession(runId, tab)
          : null;
        if (warmed.restoreUrl) {
          await restoreDatabankTabUrl(warmed.tabId || tab?.id, warmed.restoreUrl);
        }
        sendResponse({
          ok: true,
          ready: warmed.ready === true && Boolean(tab?.id),
          source: warmed.source,
          warmedUp: warmed.warmedUp === true,
          usedCurrentTask: warmed.usedCurrentTask === true,
          warmupResult: warmed.warmupResult || null,
          hasOpenTab: Boolean(tab?.id),
          openedSetup: false,
          sessionReady: Boolean(session),
          sessionReused: false,
          accountKey: String(session?.accountKey || databankRequestContext?.accountKey || ''),
          accountSource: databankRequestContext?.accountSource || '',
        });
      } catch (error) {
        sendResponse({
          ok: true,
          ready: false,
          source: 'automated_warmup_failed',
          autoWarmupAttempted: true,
          hasOpenTab: Boolean(tab?.id),
          openedSetup: false,
          code: error?.code || '',
          error: error?.message || '数据银行接口环境自动准备失败',
        });
      }
      return;
    }

    if (!tab?.id && openSetup) {
      tab = await createTab(DATABANK_PARAM_URL);
      openedSetup = true;
      await waitForTabComplete(tab.id);
    }
    if (!tab?.id) {
      sendResponse({ ok: true, ready: false, hasOpenTab: false, openedSetup: false });
      return;
    }
    if (openSetup) await focusTab(tab);

    const finalInspection = await inspectDatabankApiContext(tab, {}).catch((error) => ({
      ready: false,
      source: 'inspection_failed',
      error: error?.message || '页面安全上下文读取失败',
    }));
    const session = finalInspection.ready === true
      ? await bindDatabankApiSession(runId, tab)
      : null;
    sendResponse({
      ok: true,
      ready: finalInspection.ready === true,
      source: finalInspection.source,
      hasOpenTab: true,
      openedSetup,
      sessionReady: Boolean(session),
      sessionReused: false,
      error: finalInspection.error || '',
      accountKey: String(session?.accountKey || finalInspection.accountKey || ''),
      accountSource: finalInspection.accountSource || '',
    });
  } catch (error) {
    sendResponse({ ok: false, ready: false, error: error?.message || '接口环境检查失败' });
  }
}

async function resolveDatabankApiOperationContext(runId) {
  const normalizedRunId = normalizeRunId(runId);
  pruneDatabankApiSessions();
  const existingSession = normalizedRunId ? databankApiSessions.get(normalizedRunId) : null;
  if (existingSession) {
    const lockedTab = await getDatabankTabById(existingSession.tabId);
    const contextStillMatches = hasDatabankRequestContext()
      && Number(databankRequestContext?.tabId) === Number(existingSession.tabId)
      && String(databankRequestContext?.accountKey || '') === String(existingSession.accountKey || '')
      && String(databankRequestContext?.headers?.['x-csrf-token'] || '') === String(existingSession.headers?.['x-csrf-token'] || '');
    if (lockedTab?.id && contextStillMatches) {
      return { tab: lockedTab, session: existingSession, reusedForBatch: true };
    }
    databankApiSessions.delete(normalizedRunId);
    throw createDatabankApiError(
      lockedTab?.id
        ? '数据银行账号或接口安全信息已变化，请重新开始任务'
        : '本批次锁定的数据银行页面已关闭，请重新开始任务',
      'DATABANK_REQUEST_CONTEXT_REQUIRED',
    );
  }

  if (!hasDatabankRequestContext()) {
    throw createDatabankApiError(
      '数据银行接口环境尚未初始化，请重新准备后再试',
      'DATABANK_REQUEST_CONTEXT_REQUIRED',
    );
  }
  const tab = await findDatabankSessionTab();
  if (!tab?.id) {
    throw createDatabankApiError(
      '请先打开并登录数据银行，接口任务不会自动打开新页面',
      'DATABANK_LOGIN_REQUIRED',
    );
  }
  const session = normalizedRunId
    ? await bindDatabankApiSession(normalizedRunId, tab)
    : null;
  if (!session) await ensureScriptInjected(tab.id, ['databank-automation.js']);
  return { tab, session, reusedForBatch: false };
}

async function refreshDatabankApiSessionOnce(runId, operationContext, warmupOptions = {}) {
  const normalizedRunId = normalizeRunId(runId);
  const session = normalizedRunId ? databankApiSessions.get(normalizedRunId) : null;
  if (!session) return null;
  if (session.refreshPromise) return await session.refreshPromise;
  if (session.refreshAttempted) return null;
  session.refreshAttempted = true;
  session.refreshPromise = (async () => {
    clearDatabankRequestContext({
      invalidateAccount: true,
      accountKey: session.accountKey,
    });
    const lockedTab = await getDatabankTabById(operationContext?.tab?.id || session.tabId);
    if (!lockedTab?.id) {
      throw createDatabankApiError(
        '本批次锁定的数据银行页面已关闭，请重新开始任务',
        'DATABANK_REQUEST_CONTEXT_REQUIRED',
      );
    }

    const inspected = await inspectDatabankApiContext(lockedTab, {})
      .catch(() => ({ ready: false }));
    if (inspected.ready !== true) {
      await runDatabankContextWarmup({
        ...warmupOptions,
        tab: lockedTab,
        inspected,
      });
    }
    if (!hasDatabankRequestContext()) {
      throw createDatabankApiError(
        '数据银行接口环境自动恢复失败，请在官方页面计算一次人数后重试',
        'DATABANK_REQUEST_CONTEXT_REQUIRED',
      );
    }
    session.headers = { ...(databankRequestContext?.headers || {}) };
    session.contextCapturedAt = Number(databankRequestContext?.capturedAt || 0);
    session.accountKey = String(databankRequestContext?.accountKey || '');
    return {
      tab: lockedTab,
      session,
      reusedForBatch: true,
      contextRefreshed: true,
    };
  })();
  try {
    return await session.refreshPromise;
  } finally {
    session.refreshPromise = null;
  }
}

async function sendDatabankApiOperation(commandType, payload, runId, initialContext = null, options = {}) {
  let operationContext = initialContext || await resolveDatabankApiOperationContext(runId);
  const send = async () => await sendMessageWithRetry(operationContext.tab.id, {
    type: commandType,
    ...payload,
    requestHeaders: operationContext.session?.headers || databankRequestContext?.headers || {},
    runId,
  });
  let result = await send();
  let contextRefreshed = false;
  if (result?.code === 'DATABANK_REQUEST_CONTEXT_REQUIRED' && options?.allowPageWarmup !== false) {
    const refreshed = await refreshDatabankApiSessionOnce(runId, operationContext, {
      jsonText: payload?.jsonText,
      crowdName: payload?.crowdName,
      executionMode: commandType === CONTENT_CMD_DATABANK_REALTIME_COUNT
        ? 'calculate_only'
        : 'create_and_count',
      precheckedNoMatch: payload?.precheckedNoMatch === true,
    })
      .catch(() => null);
    if (refreshed) {
      operationContext = refreshed;
      contextRefreshed = true;
      result = await send();
    }
  }
  if (['DATABANK_REQUEST_CONTEXT_REQUIRED', 'DATABANK_LOGIN_REQUIRED', 'DATABANK_CAPTCHA_REQUIRED'].includes(result?.code)) {
    clearDatabankRequestContext({ invalidateAccount: true });
  }
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    reusedBatchContext: operationContext.reusedForBatch === true,
    contextRefreshed,
  };
}

async function runDatabankRealtimeCount(jsonText, crowdName, runId, sendResponse, options = {}) {
  try {
    await databankRequestContextReady;
    assertRunNotCancelled(runId);
    const result = await sendDatabankApiOperation(CONTENT_CMD_DATABANK_REALTIME_COUNT, {
      jsonText,
      crowdName,
      precheckedNoMatch: options?.precheckedNoMatch === true,
    }, runId, null, options);
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

async function runDatabankDirectCreate(jsonText, crowdName, runId, sendResponse, options = {}) {
  try {
    await databankRequestContextReady;
    await databankCreateGuardsReady;
    assertRunNotCancelled(runId);
    const operationContext = await resolveDatabankApiOperationContext(runId);
    const accountKey = String(operationContext?.session?.accountKey || databankRequestContext?.accountKey || '').trim();
    if (!accountKey) {
      throw createDatabankApiError(
        '无法确认当前数据银行账号，已停止创建以避免误用接口安全信息',
        'DATABANK_REQUEST_CONTEXT_REQUIRED',
      );
    }
    const guardKey = databankCreateGuardKey(accountKey, crowdName);
    const existingGuard = databankCreateGuards.get(guardKey);
    if (existingGuard?.promise) {
      sendResponse(await existingGuard.promise);
      return;
    }
    if (existingGuard) {
      existingGuard.lastCheckedAt = Date.now();
      const matches = sortCrowdsNewestFirst(await fetchCustomCrowdExactMatches(crowdName));
      const crowd = matches[0] || null;
      if (crowd) {
        databankCreateGuards.delete(guardKey);
        await persistDatabankCreateGuards();
        sendResponse({
          ok: true,
          directCreate: true,
          crowdCreated: false,
          crowdReused: true,
          crowdFound: true,
          exactMatchCount: matches.length,
          ...summarizeCustomCrowd(crowd),
          message: '上次创建结果已核验：同名人群包已经存在，已跳过再次创建',
        });
        return;
      }
      await persistDatabankCreateGuards();
      throw createDatabankApiError(
        '上次创建请求的结果仍待平台确认；为避免产生“_副本”，本次不会再次创建，请稍后重试查询',
        'DATABANK_CREATE_CONFIRMATION_PENDING',
      );
    }

    const guard = {
      state: 'creating',
      crowdName: String(crowdName || '').trim(),
      accountKey,
      createdAt: Date.now(),
      lastCheckedAt: 0,
      promise: null,
    };
    databankCreateGuards.set(guardKey, guard);
    await persistDatabankCreateGuards();
    guard.promise = (async () => {
      const result = await sendDatabankApiOperation(CONTENT_CMD_DATABANK_CREATE_API, {
        jsonText,
        crowdName,
        precheckedNoMatch: options?.precheckedNoMatch === true,
      }, runId, operationContext, options);
      if (result?.ok === true) {
        guard.state = 'confirmed';
        guard.promise = null;
        guard.lastCheckedAt = Date.now();
        databankCreateGuards.set(guardKey, guard);
        await persistDatabankCreateGuards();
        return result;
      }
      const knownSafeFailure = result?.cancelled === true || [
        'DATABANK_LOGIN_REQUIRED',
        'DATABANK_CAPTCHA_REQUIRED',
        'DATABANK_CREATE_PREFLIGHT_FAILED',
        'DATABANK_CREATE_VALIDATION_FAILED',
        'DATABANK_REQUEST_CONTEXT_REQUIRED',
      ].includes(result?.code);
      if (knownSafeFailure) {
        databankCreateGuards.delete(guardKey);
      } else {
        guard.state = 'uncertain';
        guard.promise = null;
      }
      await persistDatabankCreateGuards();
      return result;
    })().catch(async (error) => {
      if (error?.name === 'AbortError' || error?.code === 'DATABANK_REQUEST_CONTEXT_REQUIRED') {
        databankCreateGuards.delete(guardKey);
      } else {
        guard.state = 'uncertain';
        guard.promise = null;
        databankCreateGuards.set(guardKey, guard);
      }
      await persistDatabankCreateGuards();
      throw error;
    });
    const result = await guard.promise;
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

function normalizeCustomCrowdName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function buildCustomCrowdSearchUrl(crowdName, page = 1, pageSize = 20) {
  const url = new URL(DATABANK_CUSTOM_CROWD_LIST_URL);
  url.searchParams.set('path', '/api/v1/custom/list');
  url.searchParams.set('source', 'CUSTOM');
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('qualityReportOpened', 'all');
  url.searchParams.set('keyword', crowdName);
  url.searchParams.set('type', '4');
  url.searchParams.set('category2NotEqualList', 'scene_crowd');
  return url.toString();
}

async function fetchDatabankCrowdList(url) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), DATABANK_CROWD_QUERY_TIMEOUT_MS)
    : null;
  try {
    return await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createDatabankApiError('检查同名人群包超时，请稍后重试', 'DATABANK_API_TIMEOUT');
    }
    throw error;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

async function fetchCustomCrowdExactMatches(crowdName) {
  const expectedName = normalizeCustomCrowdName(crowdName);
  if (!expectedName) throw createDatabankApiError('查询人群包前缺少名称');
  const response = await fetchDatabankCrowdList(buildCustomCrowdSearchUrl(expectedName));
  if (response.status === 401 || response.status === 403) {
    throw createDatabankApiError('数据银行登录已失效，请重新登录后再试', 'DATABANK_LOGIN_REQUIRED');
  }
  if (!response.ok) throw createDatabankApiError(`数据银行查询失败（HTTP ${response.status}）`);
  const payload = await response.json();
  if (Number(payload?.errCode || 0) !== 0) {
    throw createDatabankApiError(payload?.errMsg || '数据银行查询失败');
  }
  return (Array.isArray(payload?.data?.list) ? payload.data.list : [])
    .filter((item) => normalizeCustomCrowdName(item?.name) === expectedName);
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
    brandId: item?.brandId ?? null,
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
    const checkDependency = async (crowdName) => {
      const exactMatches = sortCrowdsNewestFirst(await fetchCustomCrowdExactMatches(crowdName));
      if (exactMatches.length === 0) {
        return {
          crowdName,
          state: 'missing',
          ready: false,
          message: '未找到同名自定义人群',
          exactMatchCount: 0,
        };
      }
      if (exactMatches.length > 1) {
        return {
          crowdName,
          state: 'ambiguous',
          ready: false,
          message: `找到 ${exactMatches.length} 个同名自定义人群`,
          exactMatchCount: exactMatches.length,
        };
      }
      const summary = summarizeCustomCrowd(exactMatches[0]);
      const selectable = summary.canSelectOrLookalike === null
        || summary.canSelectOrLookalike === undefined
        || Number(summary.canSelectOrLookalike) !== 0;
      const ready = summary.crowdStatus === 'CREATED' && summary.countReady && selectable;
      return {
        ...summary,
        state: ready ? 'ready' : 'waiting',
        ready,
        message: ready ? '已计算完成' : '仍在计算中',
        exactMatchCount: 1,
      };
    };
    const results = new Array(crowdNames.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < crowdNames.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await checkDependency(crowdNames[index]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(3, crowdNames.length) }, () => worker()),
    );
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

function isUsableDmpTab(tab) {
  try {
    return Number.isInteger(tab?.id)
      && new URL(tab.url || '').origin === 'https://dmp.taobao.com';
  } catch {
    return false;
  }
}

async function acquireDmpRequestTab(runId) {
  const capturedTabId = Number(dmpAnalysisContext?.tabId);
  if (Number.isInteger(capturedTabId) && capturedTabId >= 0) {
    try {
      const capturedTab = await chrome.tabs.get(capturedTabId);
      if (isUsableDmpTab(capturedTab)) {
        if (capturedTab.status !== 'complete') await waitForTabComplete(capturedTabId, 120);
        return { tabId: capturedTabId, temporary: false };
      }
    } catch { /* the original portrait tab may have been closed */ }
  }

  try {
    const existingTabs = await chrome.tabs.query({ url: 'https://dmp.taobao.com/*' });
    const existingTab = existingTabs.find((tab) => isUsableDmpTab(tab) && tab.status === 'complete');
    if (existingTab) return { tabId: existingTab.id, temporary: false };
  } catch { /* report the missing page below */ }

  assertRunNotCancelled(runId);
  const error = new Error('请先打开并登录达摩盘任意页面后重试；系统不会自动创建或关闭后台标签页');
  error.code = 'DMP_PAGE_REQUIRED';
  throw error;
}

async function releaseDmpRequestTab(requestTab, runId) {
  if (!requestTab || !Number.isInteger(requestTab.tabId)) return;
  if (requestTab.temporary) {
    try { await chrome.tabs.remove(requestTab.tabId); } catch { /* already closed */ }
    unregisterRunTab(runId, requestTab.tabId);
    return;
  }
  if (!requestTab.restoreUrl || requestTab.restoreUrl === requestTab.automationUrl) return;
  try {
    const currentTab = await chrome.tabs.get(requestTab.tabId);
    // Do not overwrite a page the user navigated while the task was running.
    if (!isUsableDmpTab(currentTab)) return;
    if (requestTab.automationUrl && currentTab.url !== requestTab.automationUrl) return;
    await chrome.tabs.update(requestTab.tabId, { url: requestTab.restoreUrl });
  } catch { /* the user may have closed the reused tab */ }
}

async function fetchDmpJsonInPage(tabId, requestUrl, requestInit, requestLabel) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error('达摩盘取数页面不可用');

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
    clearDmpDirectContexts();
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

async function waitForFreshDmpAuthContext(runId, tabId) {
  const attempts = Math.ceil(DMP_AUTH_CAPTURE_TIMEOUT_MS / DMP_CONTEXT_WAIT_INTERVAL_MS);
  for (let index = 0; index < attempts; index += 1) {
    assertRunNotCancelled(runId);
    if (isFreshDmpContext(dmpAuthContext) && Number(dmpAuthContext?.tabId) === Number(tabId)) {
      return dmpAuthContext;
    }
    await new Promise((resolve) => setTimeout(resolve, DMP_CONTEXT_WAIT_INTERVAL_MS));
  }
  throw new Error('未能自动取得达摩盘登录安全信息，请确认达摩盘已登录后重试');
}

async function searchDmpCrowdExact(tabId, crowdName) {
  const searchUrl = new URL('https://dmp.taobao.com/api_2/crowd/');
  searchUrl.searchParams.set('bizCode', 'dmp');
  searchUrl.searchParams.set('currentPage', '1');
  searchUrl.searchParams.set('crowdName', crowdName);
  searchUrl.searchParams.set('pageSize', '20');
  searchUrl.searchParams.set('listType', '7');
  applyDmpAuthParams(searchUrl, dmpAuthContext, true);
  const searchJson = await fetchDmpJsonInPage(tabId, searchUrl.toString(), {
    method: 'GET', credentials: 'include', cache: 'no-store',
  }, '人群搜索');
  if (searchJson?.info?.ok !== true || Number(searchJson?.info?.code) !== 0) {
    throw new Error(`人群搜索接口未通过（code: ${searchJson?.info?.code ?? '未知'}），可能需要重新登录达摩盘`);
  }
  const crowd = (Array.isArray(searchJson?.data?.list) ? searchJson.data.list : [])
    .find((item) => String(item?.crowdName || '').trim() === crowdName);
  if (!crowd) throw new Error('未找到名称完全一致的人群包');
  const crowdId = Number(crowd.crowdId);
  if (!Number.isSafeInteger(crowdId) || crowdId <= 0) throw new Error('搜索结果缺少有效 crowdId');
  if (!crowd.selectTagOptionSet || typeof crowd.selectTagOptionSet !== 'object') {
    throw new Error('搜索结果缺少人群标签表达式');
  }
  return { crowd, crowdId };
}

async function waitForDmpAnalysisContext(tabId, crowdId, runId) {
  const attempts = Math.ceil(DMP_ANALYSIS_CAPTURE_TIMEOUT_MS / DMP_CONTEXT_WAIT_INTERVAL_MS);
  for (let index = 0; index < attempts; index += 1) {
    assertRunNotCancelled(runId);
    if (
      isUsableDmpAnalysisContext(dmpAnalysisContext)
      && Number(dmpAnalysisContext.tabId) === Number(tabId)
      && String(dmpAnalysisContext.payload.crowdId) === String(crowdId)
    ) {
      return dmpAnalysisContext;
    }
    await new Promise((resolve) => setTimeout(resolve, DMP_CONTEXT_WAIT_INTERVAL_MS));
  }
  throw new Error('达摩盘透视页已打开，但未产生真实画像请求，请刷新达摩盘登录状态后重试');
}

async function performDmpContextWarmup(crowdName, runId) {
  let requestTab = null;
  let handedOff = false;
  try {
    assertRunNotCancelled(runId);
    const existingTabs = await chrome.tabs.query({ url: 'https://dmp.taobao.com/*' });
    const existingTab = existingTabs.find((tab) => isUsableDmpTab(tab));
    if (!existingTab?.id) {
      const error = new Error('请先打开并登录达摩盘任意页面后重试；系统不会自动创建或关闭后台标签页');
      error.code = 'DMP_PAGE_REQUIRED';
      throw error;
    }

    const originalUrl = existingTab.url;
    requestTab = {
      tabId: existingTab.id,
      temporary: false,
      restoreUrl: originalUrl,
      automationUrl: originalUrl,
    };
    if (!isFreshDmpContext(dmpAuthContext)) {
      const warmupUrl = new URL(DMP_CROWD_URL);
      warmupUrl.searchParams.set('cdpWarmup', String(Date.now()));
      requestTab.automationUrl = warmupUrl.toString();
      await chrome.tabs.update(existingTab.id, { url: requestTab.automationUrl });
    }
    await waitForTabComplete(existingTab.id, 120);
    assertRunNotCancelled(runId);

    const loadedTab = await chrome.tabs.get(existingTab.id);
    if (!isUsableDmpTab(loadedTab)) {
      throw new Error('达摩盘登录状态已失效，请重新登录达摩盘后重试');
    }
    await waitForFreshDmpAuthContext(runId, existingTab.id);

    // A real analysis payload is reusable. If only the auth information was
    // stale, refreshing the official crowd list is enough; do not reopen a
    // portrait page unnecessarily.
    if (isUsableDmpAnalysisContext(dmpAnalysisContext)) {
      handedOff = true;
      return { source: 'auth_refreshed', warmedUp: false, requestTab };
    }

    const { crowdId } = await searchDmpCrowdExact(existingTab.id, crowdName);
    assertRunNotCancelled(runId);
    const portraitUrl = `https://dmp.taobao.com/index_new.html#!/insight-new/perspective?crowdId=${encodeURIComponent(crowdId)}`;
    requestTab.automationUrl = portraitUrl;
    await chrome.tabs.update(existingTab.id, { url: portraitUrl });
    await waitForTabComplete(existingTab.id, 120);
    assertRunNotCancelled(runId);
    await waitForDmpAnalysisContext(existingTab.id, crowdId, runId);
    handedOff = true;
    return { source: 'auto_portrait', warmedUp: true, crowdId, requestTab };
  } finally {
    if (requestTab && !handedOff) await releaseDmpRequestTab(requestTab, runId);
  }
}

async function ensureDmpDirectContext(crowdName, runId, batchId = '', batchIndex = 0) {
  await dmpContextReady;
  if (isUsableDmpAnalysisContext(dmpAnalysisContext) && isFreshDmpContext(dmpAuthContext)) {
    return {
      source: batchId && batchIndex > 1 ? 'batch_cached' : 'cached',
      warmedUp: false,
      reusedForBatch: Boolean(batchId && batchIndex > 1),
    };
  }

  // Batch and single tasks can start at nearly the same time. Only one
  // official-page warm-up is allowed; the others reuse the captured context.
  if (!dmpContextWarmupPromise) {
    dmpContextWarmupPromise = performDmpContextWarmup(crowdName, runId)
      .finally(() => { dmpContextWarmupPromise = null; });
  }
  const result = await dmpContextWarmupPromise;
  assertRunNotCancelled(runId);
  if (!isUsableDmpAnalysisContext(dmpAnalysisContext) || !isFreshDmpContext(dmpAuthContext)) {
    throw new Error('达摩盘接口环境自动初始化未完成，请确认已登录后重试');
  }
  return result;
}

// Production DMP extraction path. It preserves the page-driven result contract
// while replacing page navigation with authenticated crowd and tag API calls.
async function runDmpDirectExtract(crowdName, selectedTags, runId, batchId, batchIndex, sendResponse) {
  let requestTab = null;
  try {
    assertRunNotCancelled(runId);
    if (!globalThis.DmpResultCore) throw new Error('DMP计算核心未加载');
    const tagIds = [...new Set((Array.isArray(selectedTags) ? selectedTags : [])
      .map((tagId) => String(tagId || '').trim())
      .filter(Boolean))];
    if (tagIds.length === 0) throw new Error('请至少选择一个画像标签');
    const contextPreparation = await ensureDmpDirectContext(crowdName, runId, batchId, batchIndex);

    const trail = [{
      step: 'analysis_context_ready',
      source: contextPreparation.source,
      warmedUp: contextPreparation.warmedUp === true,
      reusedForBatch: contextPreparation.reusedForBatch === true,
      batchId: batchId || null,
      batchIndex: batchIndex || null,
    }];
    requestTab = contextPreparation.requestTab || await acquireDmpRequestTab(runId);
    const dictionaryResponse = await fetch(chrome.runtime.getURL('dmp_tags_dictionary.json'));
    const dictionary = await dictionaryResponse.json();
    const dictionaryById = new Map(dictionary.map((tag) => [String(tag.tagId), tag]));

    const { crowd, crowdId } = await searchDmpCrowdExact(requestTab.tabId, crowdName);
    assertRunNotCancelled(runId);
    trail.push({ step: 'searched' });
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
        const tagJson = await fetchDmpJsonInPage(requestTab.tabId, request.url, {
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
    await releaseDmpRequestTab(requestTab, runId);
    requestTab = null;
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
    await releaseDmpRequestTab(requestTab, runId);
    sendResponse({
      ok: false,
      cancelled: error?.name === 'AbortError',
      code: error?.code || 'DMP_DIRECT_EXTRACT_FAILED',
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
  if (![MSG_DATABANK_REALTIME_COUNT, MSG_DATABANK_CREATE_API, MSG_DATABANK_CONTEXT, MSG_DATABANK_SESSION_RELEASE, MSG_DATABANK_COUNT, MSG_DATABANK_DEPENDENCIES, MSG_DATABANK_CROWD, MSG_DATABANK_WAIT_APPLY, MSG_DATABANK_DATAHUB, MSG_DMP, MSG_DMP_WAIT_PORTRAIT, MSG_DMP_EXTRACT, MSG_DMP_DIRECT_EXTRACT, MSG_CANCEL_TASK, MSG_DMP_GET_SETTINGS, MSG_DMP_UPDATE_SETTINGS].includes(msgType)) return;

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

  if (msgType === MSG_DATABANK_CONTEXT) {
    runDatabankApiContextCheck(
      message.openSetup === true,
      message.autoWarmup === true,
      runId,
      sendResponse,
      {
        jsonText: String(message.jsonText || ''),
        crowdName: String(message.crowdName || ''),
        executionMode: String(message.executionMode || ''),
        precheckedNoMatch: message.precheckedNoMatch === true,
      },
    );
    return true;
  }

  if (msgType === MSG_DATABANK_SESSION_RELEASE) {
    releaseDatabankApiSession(runId);
    sendResponse({ ok: true, released: true });
    return true;
  }

  if (msgType === MSG_DATABANK_REALTIME_COUNT) {
    const jsonText = String(message.jsonText || '').trim();
    const crowdName = String(message.crowdName || '').trim();
    if (!jsonText) {
      sendResponse({ ok: false, error: 'jsonText 不能为空' });
      return;
    }
    runDatabankRealtimeCount(jsonText, crowdName, runId, sendResponse, {
      precheckedNoMatch: message.precheckedNoMatch === true,
      allowPageWarmup: message.allowPageWarmup !== false,
    });
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
    runDatabankDirectCreate(jsonText, crowdName, runId, sendResponse, {
      precheckedNoMatch: message.precheckedNoMatch === true,
      allowPageWarmup: message.allowPageWarmup !== false,
    });
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
    const batchId = String(message.batchId || '').trim();
    const batchIndex = Math.max(0, Number.parseInt(message.batchIndex, 10) || 0);
    runDmpDirectExtract(crowdName, selectedTags, runId, batchId, batchIndex, sendResponse);
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
    for (const [runId, session] of databankApiSessions.entries()) {
      if (session?.tabId === tabId) databankApiSessions.delete(runId);
    }
  })();
});
