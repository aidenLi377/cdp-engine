import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./TaskCenter.vue', import.meta.url), 'utf8')
const globalStyles = fs.readFileSync(new URL('../styles/cdp-global.css', import.meta.url), 'utf8')

test('task center synchronizes shared DMP settings through the extension', () => {
  assert.match(source, /CDP_DMP_GET_SETTINGS/)
  assert.match(source, /CDP_DMP_UPDATE_SETTINGS/)
  assert.match(source, /loadDmpSettings/)
  assert.match(source, /saveDmpSettings/)
})

test('task center exposes field visibility and per-tag Rebase controls', () => {
  assert.match(source, />显示字段</)
  assert.match(source, />Rebase</)
  assert.match(source, /rebaseExcludedTagIds/)
  assert.match(source, /DMP_RESULT_COLUMNS/)
})

test('task center enables only ready multi-condition tags with plain status copy', () => {
  assert.match(source, /isConditionalTagReady/)
  assert.match(source, /已就绪/)
  assert.match(source, /\? '已就绪' : '需配置'/)
  assert.doesNotMatch(source, /✅|⚙️/)
  assert.doesNotMatch(source, /:disabled="tag\.needCondition"/)
})

test('DMP flow continues from search matching into portrait extraction', () => {
  const start = source.indexOf('async function executeDmp')
  const end = source.indexOf('async function executeViaExtension', start)
  const dmpFlow = source.slice(start, end)
  const crowdIdCheckAt = dmpFlow.indexOf('!phase1.crowdId')
  const portraitWaitAt = dmpFlow.indexOf('CDP_AUTOMATE_DMP_WAIT_PORTRAIT')
  const extractAt = dmpFlow.indexOf('CDP_AUTOMATE_DMP_EXTRACT')

  assert.ok(crowdIdCheckAt >= 0)
  assert.ok(portraitWaitAt > crowdIdCheckAt)
  assert.ok(extractAt > portraitWaitAt)
  assert.doesNotMatch(dmpFlow, /searchOnly/)
})

test('DataBank flow supports explicit auto apply while preserving manual confirmation pages by default', () => {
  const start = source.indexOf('async function executeDatabank')
  const end = source.indexOf('async function executeDmp', start)
  const databankFlow = source.slice(start, end)

  assert.match(databankFlow, /sendToExtension\('CDP_AUTOMATE_DATABANK_CROWD'/)
  assert.match(databankFlow, /confirm_dialog_found/)
  assert.match(databankFlow, /auto_apply_submitted/)
  assert.match(databankFlow, /autoApply/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_WAIT_APPLY/)
  assert.doesNotMatch(databankFlow, /CDP_AUTOMATE_DATABANK_DATAHUB/)
  assert.match(source, /const databankAutoApply = ref\(false\)/)
  assert.match(source, /确认页面已保留，批量完成后请逐个点击“应用”/)
  assert.match(source, /已自动点击“应用”，推送已提交至达摩盘/)
})

test('task center keeps single run actions and moves batch creation into a review drawer', () => {
  assert.match(source, /@click="runDatabank">运行<\/el-button>/)
  assert.match(source, /@click="runDmp">运行<\/el-button>/)
  assert.match(source, /@click="openBatchComposer\('databank'\)">批量<\/button>/)
  assert.match(source, /@click="openBatchComposer\('dmp'\)">批量<\/button>/)
  assert.match(source, /<el-drawer[\s\S]*class="tc-batch-drawer"/)
  assert.match(source, /批量任务[\s\S]*输入名单[\s\S]*检测结果[\s\S]*确认执行/)
  assert.match(source, /@click="submitBatchComposer"\s*>\s*继续确认\s*<\/el-button>/)
  assert.match(source, /parseCrowdBatch/)
  assert.match(source, /目前检测到 \$\{count\} 个人群包，是否批量执行/)
  assert.match(source, /keepRunning: true/)
  assert.match(source, /BATCH_EXECUTION_GAP_MS/)
  assert.match(source, /输入人群包名称并点击运行，任务进度将在此处实时展示。/)
  assert.doesNotMatch(source, /@click="run(?:Databank|Dmp)">测试<\/el-button>/)
})

test('batch execution has no frontend item cap and keeps one history record per crowd package', () => {
  assert.doesNotMatch(source, /MAX_BATCH|batchLimit|批量上限/)
  assert.doesNotMatch(source, /taskHistory\.value\.length > 50/)
  assert.match(source, /taskHistory\.value\.unshift/)
  assert.match(source, /失败 \$\{failed\} 个/)
})

test('DataBank and DMP launch groups use borderless white controls', () => {
  assert.match(source, /\.tc-test-col\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s)
  assert.match(source, /\.tc-input-sm :deep\(\.el-input__wrapper\)\s*\{[^}]*background:\s*#fff;[^}]*border:\s*0;/s)
  assert.match(source, /\.tc-mode-btn\s*\{[^}]*border:\s*0;/s)
  assert.match(source, /\.tc-batch-panel\s*\{[^}]*border:\s*0;[^}]*background:\s*#fff;/s)
  assert.match(globalStyles, /#app \.tc-test-col,[\s\S]*?#app \.tc-tags-card\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*0\s*!important;/)
  assert.match(globalStyles, /#app \.tc-input-sm \.el-input__wrapper,[\s\S]*?#app \.tc-tags-search-input:focus\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*0\s*!important;/)
})

test('task center uses compact section markers and focus-only input underlines', () => {
  assert.match(source, /class="tc-section-heading"[\s\S]*?class="tc-section-marker"[\s\S]*?任务执行/)
  assert.match(source, /\.tc-control-panel\s*\{[^}]*border-right:\s*1px solid var\(--ui-divider\);/s)
  assert.match(source, /\.tc-section-marker\s*\{[^}]*width:\s*2px;[^}]*height:\s*13px;[^}]*background:\s*#1d1d1f;/s)
  assert.match(source, /\.tc-dmp-tools-label::before\s*\{[^}]*height:\s*13px;[^}]*background:\s*#1d1d1f;/s)
  assert.match(source, /\.tc-tags-title::before\s*\{[^}]*height:\s*13px;[^}]*background:\s*#1d1d1f;/s)
  assert.match(source, /\.tc-ext-status\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s)
  assert.match(source, /\.tc-input-sm :deep\(\.el-input__wrapper\.is-focus\)\s*\{[^}]*box-shadow:\s*inset 0 -1px 0 #1d1d1f !important;/s)
  assert.match(source, /\.tc-tags-search-input:focus\s*\{[^}]*box-shadow:\s*inset 0 -1px 0 #1d1d1f;/s)
  assert.match(globalStyles, /#app \.tc-control-panel\s*\{[^}]*border-right:\s*1px solid var\(--ui-divider\) !important;/s)
  assert.match(globalStyles, /#app \.tc-input-sm \.el-input__wrapper\.is-focus,[\s\S]*?#app \.tc-tags-search-input:focus\s*\{[^}]*box-shadow:\s*inset 0 -1px 0 #1d1d1f !important;/s)
})

test('DMP settings use small rectangular black and white buttons', () => {
  assert.match(source, /\.tc-settings-btn\s*\{[^}]*min-width:\s*48px;[^}]*height:\s*24px;[^}]*border:\s*1px solid #1d1d1f;[^}]*border-radius:\s*3px;/s)
  assert.match(source, /\.tc-settings-btn:hover:not\(:disabled\)\s*\{[^}]*color:\s*#fff;[^}]*background:\s*#1d1d1f;/s)
  assert.match(globalStyles, /#app \.tc-settings-btn\s*\{[^}]*height:\s*24px !important;[^}]*border:\s*1px solid #1d1d1f !important;[^}]*border-radius:\s*3px !important;/s)
  assert.match(globalStyles, /#app \.tc-settings-btn:hover:not\(:disabled\)\s*\{[^}]*color:\s*#ffffff !important;[^}]*background:\s*#1d1d1f !important;/s)
})

test('task center centers every native and Element Plus button and keeps disabled surfaces white', () => {
  assert.match(
    source,
    /\.task-center-page button,\s*\.task-center-page \.el-button\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*line-height:\s*1;/s,
  )

  assert.match(
    source,
    /\.task-center-page button:disabled,\s*\.task-center-page \.el-button\.is-disabled\s*\{[^}]*background:\s*var\(--ui-surface\)\s*!important;[^}]*color:\s*var\(--ui-text-secondary\)\s*!important;[^}]*border:\s*1px solid var\(--ui-control-border\)\s*!important;[^}]*opacity:\s*1;/s,
  )
})

test('task center mirrors the plugin tag tree and two-column checkbox layout', () => {
  assert.match(source, /tc-tag-main-header[^>]*>\{\{ group\.mainCategory \}\}/)
  assert.doesNotMatch(source, /🎛️|📂/)
  assert.match(source, /v-for="category in group\.categories"/)
  assert.match(source, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(source, /class="tc-tag-checkbox"/)
  assert.doesNotMatch(source, /class="tc-tag-check"/)
})

test('task center stabilizes tag requests and results using dictionary order', () => {
  assert.match(source, /orderTagIdsByDictionary/)
  assert.match(source, /orderResultRowsByDictionary/)
  assert.match(source, /selectedTags:\s*orderedSelectedTagIds\.value/)
  assert.match(source, /tagIds:\s*orderedSelectedTagIds\.value/)
})

test('perspective table header visually matches the plugin while masking scrolled rows', () => {
  assert.match(
    source,
    /\.tc-results-table thead\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*4;/s,
  )
  assert.match(
    source,
    /\.tc-results-table th\s*\{[^}]*background:\s*var\(--ui-surface, #fff\);[^}]*background-clip:\s*padding-box;[^}]*color:\s*#333333;/s,
  )
})

test('history result omits the redundant metadata row', () => {
  assert.doesNotMatch(source, /class="tc-history-meta-bar"/)
})

test('task history removes the large outer frame but keeps item boundaries', () => {
  assert.match(source, /\.tc-history-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*border-radius:\s*0;/s)
  assert.match(source, /\.tc-history-item\s*\{[^}]*border:\s*1px solid/s)
  assert.match(globalStyles, /#app \.tc-history-card,[\s\S]*?#app \.tc-history-card\.expanded\s*\{[^}]*background:\s*transparent !important;[^}]*border:\s*0 !important;[^}]*border-radius:\s*0 !important;/s)
})

test('feature panel uses borderless black and white hierarchy', () => {
  assert.match(
    source,
    /\.tc-tags-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  )
  assert.match(
    source,
    /\.tc-tag-main-header\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s,
  )
  assert.match(
    source,
    /\.tc-tag-checkbox\s*\{[^}]*accent-color:\s*#171717;/s,
  )
})
