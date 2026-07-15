# DataBank Manual Apply Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the final DataBank apply action manual while preventing DataHub verification from starting before the human closes the confirmation dialog.

**Architecture:** Add a dedicated wait message between the existing crowd-selection phase and DataHub phase. The content script stores the visible final action control, waits for all relevant controls to remain absent for 1.5 seconds, and never clicks them; the background and bridge only relay the message, while TaskCenter controls progress and sequencing.

**Tech Stack:** Vue 3, Chrome Extension Manifest V3, JavaScript, Node test runner.

## Global Constraints

- The final DataBank “应用/确定” control remains human-operated.
- The wait timeout is 30 minutes.
- DataHub verification starts only after `manual_apply_confirmed`.
- Do not change DMP extraction, Rebase, field display, login, or solution isolation.

---

### Task 1: Content-script manual confirmation watcher

**Files:**
- Modify: `chrome-extension/databank-automation/content.js`
- Test: `chrome-extension/databank-automation/content.test.mjs`

**Interfaces:**
- Consumes: `AUTOMATE_DATABANK_WAIT_APPLY` runtime message.
- Produces: `{ ok: true, step: 'manual_apply_confirmed' }` only after the dialog action controls remain absent for 1.5 seconds.

- [ ] **Step 1: Write the failing test**

Create a harness where the final `应用` button starts visible, assert that the existing crowd flow does not click it, then hide the button and assert the wait message resolves with `manual_apply_confirmed`.

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test chrome-extension/databank-automation/content.test.mjs`

Expected: FAIL because `AUTOMATE_DATABANK_WAIT_APPLY` is not handled.

- [ ] **Step 3: Implement the watcher**

Add:

```js
const CONTENT_CMD_DATABANK_WAIT_APPLY = 'AUTOMATE_DATABANK_WAIT_APPLY'

async function waitForManualApplyConfirmation() {
  // Observe; never click. Require a stable 1500 ms absence window.
  return { step: 'manual_apply_confirmed' }
}
```

Register it in the existing runtime listener and keep the current final-button detection behavior.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `node --test chrome-extension/databank-automation/content.test.mjs`

Expected: PASS.

### Task 2: Background and bridge message relay

**Files:**
- Modify: `chrome-extension/databank-automation/background.js`
- Modify: `chrome-extension/databank-automation/bridge.js`
- Test: `chrome-extension/databank-automation/background.test.mjs`
- Test: `chrome-extension/databank-automation/bridge.test.mjs`

**Interfaces:**
- Consumes: `CDP_AUTOMATE_DATABANK_WAIT_APPLY` from the webpage.
- Produces: forwards `AUTOMATE_DATABANK_WAIT_APPLY` to the retained DataBank tab and relays the response.

- [ ] **Step 1: Write failing relay tests**

Assert that the bridge accepts the new public message and that background sends the internal wait message to `databankTabId` without switching focus back to the webpage after the crowd phase.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `node --test chrome-extension/databank-automation/background.test.mjs chrome-extension/databank-automation/bridge.test.mjs`

Expected: FAIL because the new message is not allow-listed or handled.

- [ ] **Step 3: Implement minimal relay**

Add the public/internal constants, allow-list entries, and a `runDatabankWaitApply` handler. Remove the phase-one focus-back call; retain the existing focus-back after DataHub completes.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node --test chrome-extension/databank-automation/background.test.mjs chrome-extension/databank-automation/bridge.test.mjs`

Expected: PASS.

### Task 3: Web sequencing and progress state

**Files:**
- Modify: `cdp-web/src/components/TaskCenter.vue`
- Test: `cdp-web/src/components/TaskCenter.dmpParity.test.mjs`

**Interfaces:**
- Consumes: `confirm_dialog_found` and `manual_apply_confirmed` extension responses.
- Produces: visible `等待人工确认` progress and delayed DataHub request.

- [ ] **Step 1: Write the failing source contract test**

Assert that `executeDatabank` sends `CDP_AUTOMATE_DATABANK_WAIT_APPLY` after phase one and before `CDP_AUTOMATE_DATABANK_DATAHUB`, and removes the simulated-user comment.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test src/components/TaskCenter.dmpParity.test.mjs`

Expected: FAIL because the wait message is absent.

- [ ] **Step 3: Implement sequencing**

```js
updateProgress(7, '等待人工在 DataBank 页面点击应用…')
const manual = await sendToExtension('CDP_AUTOMATE_DATABANK_WAIT_APPLY', {})
if (!manual.ok) throw new Error(manual.error || '等待人工确认失败')
updateProgress(8, '人工确认完成，正在监控推送状态…')
```

Give the new wait message a 30-minute webpage timeout.

- [ ] **Step 4: Run frontend tests and build**

Run: `node --test src/**/*.test.mjs && npm run build`

Expected: all tests and type checking pass.

### Task 4: Sync independent merged extension and verify scope

**Files:**
- Modify: `E:/插件开发/DMP/DMP-Plugin/DMP_PluginV2.1-CDP-Merged/databank-automation.js`
- Modify: `E:/插件开发/DMP/DMP-Plugin/DMP_PluginV2.1-CDP-Merged/background.js`
- Modify: `E:/插件开发/DMP/DMP-Plugin/DMP_PluginV2.1-CDP-Merged/bridge.js`
- Test: `E:/插件开发/DMP/DMP-Plugin/DMP_PluginV2.1-CDP-Merged/tests/*.test.mjs`

**Interfaces:**
- Produces the same manual confirmation gate as the built-in extension.

- [ ] **Step 1: Sync only the three changed extension surfaces**

Keep `databank-automation.js` and `bridge.js` byte-identical to their built-in counterparts; preserve merged background session persistence.

- [ ] **Step 2: Run all verification**

Run the backend, frontend, built-in extension, and merged extension test suites; run frontend production build, JavaScript syntax checks, `git diff --check`, and original-plugin SHA-256 checks.

Expected: all checks pass and original plugin hashes remain unchanged.
