(function() {
  'use strict';
  console.log('[CDP Bridge] loaded on', window.location.href);

  var VALID_TYPES = [
    'CDP_AUTOMATE_DATABANK',
    'CDP_AUTOMATE_DATABANK_CROWD',
    'CDP_AUTOMATE_DATABANK_WAIT_APPLY',
    'CDP_AUTOMATE_DATABANK_DATAHUB',
    'CDP_AUTOMATE_DMP',
    'CDP_AUTOMATE_DMP_WAIT_PORTRAIT',
    'CDP_AUTOMATE_DMP_EXTRACT',
    'CDP_DMP_GET_SETTINGS',
    'CDP_DMP_UPDATE_SETTINGS',
  ];
  var RESPONSE_SOURCE = 'databank-extension-bridge';

  function safeRespond(payload, data) {
    try {
      var msg = JSON.parse(JSON.stringify({
        source: RESPONSE_SOURCE,
        requestId: payload.requestId,
        ok: !!data.ok,
        error: data.error || '',
        step: data.step || '',
        trail: data.trail || [],
        crowdId: data.crowdId || null,
        crowdCount: data.crowdCount || null,
        results: data.results || null,
        settings: data.settings || null,
      }));
      window.postMessage(msg, window.location.origin);
    } catch (e) {
      console.error('[CDP Bridge] respond error', e);
    }
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    var p = event.data || {};
    if (p.source !== 'cdp-web') return;
    if (VALID_TYPES.indexOf(p.type) === -1) return;

    console.log('[CDP Bridge] received', p.type, p.requestId);

    // Ping: respond immediately
    if (typeof p.requestId === 'string' && p.requestId.indexOf('ping') === 0) {
      safeRespond(p, { ok: true, ready: true });
      return;
    }

    // Build extension message
    var extMsg = { type: p.type, requestId: p.requestId, pageUrl: window.location.href };

    if (p.type === 'CDP_AUTOMATE_DATABANK') {
      extMsg.jsonText = p.jsonText || '';
      if (!extMsg.jsonText.trim()) { safeRespond(p, { ok: false, error: 'jsonText 不能为空' }); return; }
    } else if (p.type === 'CDP_AUTOMATE_DATABANK_CROWD' || p.type === 'CDP_AUTOMATE_DATABANK_DATAHUB' || p.type === 'CDP_AUTOMATE_DMP') {
      extMsg.crowdName = p.crowdName || '';
      if (!extMsg.crowdName.trim()) { safeRespond(p, { ok: false, error: '人群包名称不能为空' }); return; }
    } else if (p.type === 'CDP_AUTOMATE_DATABANK_WAIT_APPLY' || p.type === 'CDP_AUTOMATE_DMP_WAIT_PORTRAIT') {
      // No payload needed — just forward to background
    } else if (p.type === 'CDP_AUTOMATE_DMP_EXTRACT') {
      extMsg.phase1Result = p.phase1Result || {};
      extMsg.selectedTags = p.selectedTags || [];
    } else if (p.type === 'CDP_DMP_UPDATE_SETTINGS') {
      if (p.columnVisibility && typeof p.columnVisibility === 'object') {
        extMsg.columnVisibility = p.columnVisibility;
      }
      if (Array.isArray(p.rebaseExcludedTagIds)) {
        extMsg.rebaseExcludedTagIds = p.rebaseExcludedTagIds;
      }
    }

    // Check extension API availability
    var runtime = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime
      : (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime
      : null;

    if (!runtime) {
      console.error('[CDP Bridge] chrome.runtime / browser.runtime unavailable — is the extension loaded?');
      safeRespond(p, { ok: false, error: '扩展API不可用：请确认扩展已加载并刷新页面。若使用夸克浏览器，请尝试在Chrome中测试。' });
      return;
    }

    // Send to background with timeout — SPA flows need generous headroom for tab creation, page load, and DOM waits
    var timeoutMs;
    if (p.type === 'CDP_AUTOMATE_DATABANK_WAIT_APPLY') {
      timeoutMs = 2100000; // 35min — human confirmation wait (up to 30min polling)
    } else if (p.type === 'CDP_AUTOMATE_DATABANK_DATAHUB') {
      timeoutMs = 420000;  // 7min — dataHub polling
    } else if (p.type === 'CDP_AUTOMATE_DMP_WAIT_PORTRAIT') {
      timeoutMs = 2100000; // 35min — portrait entry wait (up to 30min polling)
    } else if (p.type === 'CDP_AUTOMATE_DMP') {
      timeoutMs = 300000;  // 5min — DMP phase 1: search + match
    } else if (p.type === 'CDP_AUTOMATE_DMP_EXTRACT') {
      timeoutMs = 300000;  // 5min — portrait page navigation + tag extraction
    } else if (p.type === 'CDP_AUTOMATE_DATABANK_CROWD') {
      timeoutMs = 180000;  // 3min — tab open + SPA load + search + match + dialog
    } else {
      timeoutMs = 60000;   // 1min — parameter paste flow
    }
    var sent = false;
    var timer = setTimeout(function() {
      if (!sent) { sent = true; console.log('[CDP Bridge] timeout after ' + timeoutMs + 'ms'); safeRespond(p, { ok: false, error: '插件响应超时，请刷新页面后重试' }); }
    }, timeoutMs);

    try {
      runtime.sendMessage(extMsg, function(response) {
        if (sent) return;
        sent = true;
        clearTimeout(timer);
        var err = runtime.lastError;
        if (err) {
          console.error('[CDP Bridge] sendMessage error', err.message);
          safeRespond(p, { ok: false, error: err.message || '插件通信失败' });
        } else {
          console.log('[CDP Bridge] response', response);
          safeRespond(p, response || { ok: false, error: '插件未返回结果' });
        }
      });
    } catch (e) {
      if (!sent) { sent = true; clearTimeout(timer); safeRespond(p, { ok: false, error: e.message }); }
    }
  });
})();
