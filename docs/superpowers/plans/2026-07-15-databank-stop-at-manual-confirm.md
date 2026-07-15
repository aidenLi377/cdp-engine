# DataBank Stop at Manual Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End the web-driven DataBank automation as soon as the final confirmation dialog is detected, while clearly telling the user that the remaining “应用” click is manual.

**Architecture:** Keep the extension protocol backward-compatible and change only the frontend orchestration. `executeDatabank` returns immediately after validating `confirm_dialog_found`; the shared task runner uses DataBank-specific completion copy and persists a completed task at 100% without calling the manual-wait or DataHub phases.

**Tech Stack:** Vue 3 Composition API, Node.js built-in test runner, Vite.

## Global Constraints

- “自动流程已完成” means only that the confirmation dialog is open; it does not mean DataBank has applied the package.
- Completion message must be exactly `确认弹窗已打开，请前往 DataBank 页面人工点击“应用”`.
- Do not send `CDP_AUTOMATE_DATABANK_WAIT_APPLY` or `CDP_AUTOMATE_DATABANK_DATAHUB` from the DataBank web flow.
- Keep the DataBank tab and confirmation dialog open.
- Do not change DMP collection, DataBank parameter paste, extension compatibility handlers, authentication, or solution-library behavior.

---

### Task 1: Cut off the DataBank web workflow at the confirmation dialog

**Files:**
- Modify: `cdp-web/src/components/TaskCenter.dmpParity.test.mjs`
- Modify: `cdp-web/src/components/TaskCenter.vue:288,566-585,630-634`

**Interfaces:**
- Consumes: the existing extension response `{ ok: boolean, trail?: Array<{ step: string }> }` from `CDP_AUTOMATE_DATABANK_CROWD`.
- Produces: `executeDatabank(crowdName)` resolving with the phase-one response after `confirm_dialog_found`; a completed task with phase label `自动流程已完成`, progress `100`, and the required manual-action message.

- [x] **Step 1: Replace the old ordering contract with a failing cutoff contract**

Update the DataBank test in `TaskCenter.dmpParity.test.mjs` so it isolates the function body and asserts the two later calls are absent:

```javascript
test('DataBank flow stops after opening the manual confirmation dialog', () => {
  const start = source.indexOf('async function executeDatabank')
  const end = source.indexOf('async function executeDmp', start)
  const databankFlow = source.slice(start, end)

  assert.match(databankFlow, /sendToExtension\('CDP_AUTOMATE_DATABANK_CROWD'/)
  assert.match(databankFlow, /confirm_dialog_found/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_WAIT_APPLY/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_DATAHUB/)
  assert.match(source, /自动流程已完成/)
  assert.match(source, /确认弹窗已打开，请前往 DataBank 页面人工点击“应用”/)
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test cdp-web/src/components/TaskCenter.dmpParity.test.mjs
```

Expected: FAIL because `executeDatabank` still contains `CDP_AUTOMATE_DATABANK_WAIT_APPLY` and `CDP_AUTOMATE_DATABANK_DATAHUB`, and the new completion copy is absent.

- [x] **Step 3: Implement the minimal frontend cutoff**

Change `databankPhases` so the last phase represents automation completion:

```javascript
const databankPhases = ['已发起任务', '正在打开页面', '正在搜索人群包', '正在精准匹配', '已匹配成功', '正在选择渠道', '正在选择平台', '等待人工确认', '自动流程已完成']
```

After the existing `confirm_dialog_found` validation, end `executeDatabank` immediately:

```javascript
  return phase1
```

Delete the calls and progress updates for `CDP_AUTOMATE_DATABANK_WAIT_APPLY` and `CDP_AUTOMATE_DATABANK_DATAHUB` from this function only.

In `executeViaExtension`, use type-specific completion metadata:

```javascript
    const finalPhase = phases.value.length - 1
    const completionLabel = type === 'databank' ? '自动流程已完成' : '任务执行完成'
    const completionMessage = type === 'databank'
      ? '确认弹窗已打开，请前往 DataBank 页面人工点击“应用”'
      : '任务执行完成'
    updateProgress(finalPhase, completionMessage)
```

Persist the same label and message:

```javascript
    if (backendTask?.id) {
      apiPut(`${API}/${backendTask.id}/progress`, {
        status: 'completed',
        phase: finalPhase,
        phaseLabel: completionLabel,
        progress: 100,
        message: completionMessage,
        result: hasResults ? result.results : result,
        crowdCount: crowdCount.value,
      }).catch(() => {})
    }
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test cdp-web/src/components/TaskCenter.dmpParity.test.mjs
```

Expected: all tests in the file PASS.

- [x] **Step 5: Run frontend regression tests and production build**

Run:

```powershell
node --test src/**/*.test.mjs
npm run build
```

Working directory: `cdp-web`.

Expected: all frontend tests PASS and Vite build exits with code 0. The existing bundle-size warning is allowed.

### Task 2: Verify project-wide compatibility and scope

**Files:**
- Verify only: `chrome-extension/databank-automation/`
- Verify only: `cdp_backend/`
- Verify only: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged\`

**Interfaces:**
- Consumes: existing test commands for frontend, backend, built-in extension, and merged extension.
- Produces: evidence that the frontend cutoff did not alter extension capabilities or unrelated project behavior.

- [x] **Step 1: Run built-in extension tests**

Run:

```powershell
node --test chrome-extension/databank-automation/*.test.mjs
```

Expected: all built-in extension tests PASS.

- [x] **Step 2: Run backend tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -v
```

Expected: all backend tests PASS. Existing non-failing `ResourceWarning` output is allowed.

- [x] **Step 3: Run merged-extension tests without editing the external directory**

Run:

```powershell
node --test tests/*.test.mjs
```

Working directory: `E:\插件开发\DMP\DMP-Plugin\DMP_PluginV2.1-CDP-Merged`.

Expected: all merged-extension tests PASS.

- [x] **Step 4: Check syntax, diff scope, and whitespace**

Run:

```powershell
node --check cdp-web/src/components/TaskCenter.dmpParity.test.mjs
git diff --check
git diff -- cdp-web/src/components/TaskCenter.vue cdp-web/src/components/TaskCenter.dmpParity.test.mjs
```

Expected: syntax and whitespace checks exit 0; the functional diff is limited to the DataBank frontend flow and its contract test.

- [x] **Step 5: Leave the focused implementation uncommitted for coordinated launch**

The user is developing another feature in the same local workspace and wants both changes integrated before launch. Do not stage or commit the implementation in this task; preserve the working tree for the coordinated integration.
