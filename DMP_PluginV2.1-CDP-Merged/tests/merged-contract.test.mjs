import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(currentDir, '..')
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8')
const manifest = JSON.parse(read('manifest.json'))

test('merged manifest preserves DMP Copilot and adds CDP task execution surfaces', () => {
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.version, '2.1.0')
  assert.equal(manifest.background.service_worker, 'background.js')
  for (const permission of ['storage', 'clipboardWrite', 'tabs', 'scripting']) {
    assert.ok(manifest.permissions.includes(permission), `missing permission: ${permission}`)
  }
  assert.ok(manifest.host_permissions.includes('https://databank.tmall.com/*'))
  assert.ok(manifest.host_permissions.includes('*://dmp.taobao.com/*'))
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1:5173/*'))

  const scripts = manifest.content_scripts.flatMap((entry) => entry.js)
  for (const expected of [
    'bridge.js',
    'databank-automation.js',
    'hook.js',
    'content.js',
    'cdp-dmp-automation.js',
  ]) {
    assert.ok(scripts.includes(expected), `missing content script: ${expected}`)
  }
  assert.equal(scripts.filter((name) => name === 'hook.js').length, 1)
})

test('original DMP Copilot capabilities remain present', () => {
  const content = read('content.js')
  const panel = read('panel.html')
  for (const marker of [
    'DMP_PAYLOAD_INTERCEPTED',
    'initColumnSelector',
    'initRebaseSelector',
    'checkOnboarding',
    'dmpPresets',
    'DMP_MODEL_',
    'DMP_洞察数据_',
  ]) {
    assert.match(content, new RegExp(marker))
  }
  assert.match(panel, /DMP 美妆洞察 Copilot/)
  assert.match(panel, /right-panel/)
})

test('CDP message bridge and automation handlers use renamed collision-free files', () => {
  const bridge = read('bridge.js')
  const background = read('background.js')
  const databank = read('databank-automation.js')
  const dmpAutomation = read('cdp-dmp-automation.js')

  assert.match(bridge, /CDP_AUTOMATE_DATABANK/)
  assert.match(bridge, /CDP_AUTOMATE_DMP_EXTRACT/)
  assert.match(background, /databank-automation\.js/)
  assert.match(background, /cdp-dmp-automation\.js/)
  assert.doesNotMatch(background, /\['content\.js'\]/)
  assert.doesNotMatch(background, /dmp-content\.js/)
  assert.match(databank, /__databankAutomationContentScriptLoaded/)
  assert.match(dmpAutomation, /__dmpAutomationContentScriptLoaded/)
  assert.match(dmpAutomation, /AUTOMATE_DMP_WAIT_PORTRAIT/)
  assert.match(dmpAutomation, /AUTOMATE_DMP_EXTRACT/)
})

test('merged extension shares DMP settings and loads the result core before automation', () => {
  const bridge = read('bridge.js')
  const background = read('background.js')
  const dmpAutomation = read('cdp-dmp-automation.js')
  const dmpScripts = manifest.content_scripts
    .filter((entry) => entry.matches.some((match) => match.includes('dmp.taobao.com')))
    .flatMap((entry) => entry.js)

  assert.ok(dmpScripts.includes('dmp-result-core.js'))
  assert.ok(dmpScripts.indexOf('dmp-result-core.js') < dmpScripts.indexOf('cdp-dmp-automation.js'))
  assert.match(bridge, /CDP_DMP_GET_SETTINGS/)
  assert.match(bridge, /CDP_DMP_UPDATE_SETTINGS/)
  assert.match(background, /dmpConditionCache/)
  assert.match(background, /rebaseExcludedTagIds/)
  assert.match(dmpAutomation, /DmpResultCore/)
  assert.match(dmpAutomation, /dmpConditionCache/)
  assert.match(dmpAutomation, /rebaseExcludedTagIds/)
})

test('long-running task tab state survives service worker suspension', () => {
  const background = read('background.js')
  assert.match(background, /chrome\.storage\?\.session/)
  assert.match(background, /cdpTaskDmpTabId/)
  assert.match(background, /cdpTaskDatabankTabId/)
  assert.match(background, /chrome\.tabs\.onRemoved/)
})
