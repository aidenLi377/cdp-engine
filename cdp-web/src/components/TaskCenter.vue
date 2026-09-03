<template>
  <div
    ref="taskCenterPageRef"
    class="task-center-page"
    :style="{ '--task-control-width': `${taskControlWidth}px` }"
  >
    <!-- 左栏：控制台 -->
    <aside class="tc-control-panel">
      <!-- 扩展状态 -->
      <div class="tc-ext-status" :class="[extensionState, { connected: extConnected }]">
        <div class="tc-ext-dot"></div>
        <span class="tc-ext-label">{{ extensionStatusLabel }}</span>
        <span class="tc-ext-hint">{{ extensionStatusHint }}</span>
        <span v-if="extensionVersion && extConnected" class="tc-ext-version">V{{ extensionVersion }}</span>
        <div class="tc-ext-actions">
          <button
            v-if="!extConnected"
            type="button"
            :disabled="installingExtension"
            @click="downloadExtension"
          >{{ installingExtension ? '下载中…' : '安装扩展' }}</button>
          <button
            type="button"
            :disabled="extensionCheckBusy"
            @click="checkExtension(true)"
          >{{ extensionCheckBusy ? '检测中…' : '重新检测' }}</button>
        </div>
      </div>

      <!-- 测试任务（上下排列） -->
      <div class="tc-section-heading">
        <span class="tc-section-marker" aria-hidden="true"></span>
        <span>任务执行</span>
      </div>
      <div class="tc-test-row">
        <div class="tc-test-col">
          <div class="tc-test-head">
            <div class="tc-test-label">数据引擎</div>
            <label class="tc-auto-apply" title="开启后将自动点击最终应用按钮并提交推送">
              <span>自动应用</span>
              <el-switch v-model="databankAutoApply" size="small" :disabled="taskRunning !== null" />
            </label>
          </div>
          <div class="tc-test-controls">
            <el-input v-if="!databankBatchMode" v-model="databankCrowd" placeholder="人群包名称" size="default" class="tc-input-sm" clearable />
            <span v-else class="tc-batch-summary" aria-live="polite">已准备 {{ databankBatch.items.length }} 个</span>
            <TaskBatchPopover
              v-model="databankBatchDraft"
              task-label="数据引擎"
              :run-hint="databankAutoApply ? '自动应用已开启，运行后将逐个提交推送' : '将逐个打开确认页面，批量完成后手动应用'"
              :disabled="taskRunning !== null"
              @run="runBatchDraft('databank', $event)"
            />
            <el-button v-if="taskRunning !== 'databank'" class="tc-btn-sm" :disabled="!canRunDatabank" @click="runDatabank()">运行</el-button>
            <el-button v-else class="tc-btn-sm is-cancel" :loading="cancelling" :disabled="cancelling" @click="cancelTask">{{ cancelling ? '终止中' : '终止' }}</el-button>
          </div>
        </div>
        <div class="tc-test-col">
          <div class="tc-test-head">
            <div class="tc-test-label">达摩盘</div>
          </div>
          <div class="tc-test-controls">
            <el-input v-if="!dmpBatchMode" v-model="dmpCrowd" placeholder="人群包名称" size="default" class="tc-input-sm" clearable />
            <span v-else class="tc-batch-summary" aria-live="polite">已准备 {{ dmpBatch.items.length }} 个</span>
            <TaskBatchPopover
              v-model="dmpBatchDraft"
              task-label="达摩盘"
              run-hint="将按照名单顺序逐个采集"
              :disabled="taskRunning !== null"
              :minimum-items="isDmpTutorialActive ? 2 : 1"
              tutorial-key="dmp-batch"
              @open="handleDmpBatchOpen"
              @run="runBatchDraft('dmp', $event)"
            />
            <el-button v-if="taskRunning !== 'dmp'" class="tc-btn-sm is-dmp" :disabled="!canRunDmp" @click="runDmp()">运行</el-button>
            <el-button v-else class="tc-btn-sm is-cancel" :loading="cancelling" :disabled="cancelling" @click="cancelTask">{{ cancelling ? '终止中' : '终止' }}</el-button>
          </div>
        </div>
      </div>

      <div class="tc-dmp-tools">
        <span class="tc-dmp-tools-label">DMP 设置</span>
        <el-popover placement="bottom-start" :width="230" trigger="click" popper-class="tc-settings-popper">
          <template #reference>
            <button type="button" class="tc-settings-btn" :disabled="!extConnected || dmpSettingsSyncing">显示字段</button>
          </template>
          <div class="tc-settings-panel">
            <div class="tc-settings-title">结果显示字段</div>
            <label v-for="column in DMP_RESULT_COLUMNS" :key="column" class="tc-settings-option">
              <input
                type="checkbox"
                :checked="dmpSettings.columnVisibility[column] !== false"
                @change="toggleResultColumn(column, $event.target.checked)"
              />
              <span>{{ column }}</span>
            </label>
          </div>
        </el-popover>
        <el-popover placement="bottom-start" :width="280" trigger="click" popper-class="tc-settings-popper">
          <template #reference>
            <button type="button" class="tc-settings-btn" :disabled="!extConnected || dmpSettingsSyncing">Rebase</button>
          </template>
          <div class="tc-settings-panel tc-rebase-panel">
            <div class="tc-settings-title-row">
              <span class="tc-settings-title">参与 Rebase 的标签</span>
              <button type="button" class="tc-settings-all" @click="toggleAllRebase">
                {{ allRebaseEnabled ? '全部停用' : '全部启用' }}
              </button>
            </div>
            <label v-for="tag in allDmpTags" :key="tag.tagId" class="tc-settings-option">
              <input
                type="checkbox"
                :checked="isRebaseEnabled(tag.tagId)"
                @change="toggleRebaseTag(tag.tagId, $event.target.checked)"
              />
              <span>{{ tag.tagName }}</span>
              <small>{{ tag.mainCategory }}</small>
            </label>
          </div>
        </el-popover>
        <span class="tc-settings-state" v-if="dmpSettingsSyncing">同步中…</span>
      </div>

      <!-- 标签选择 -->
      <section class="tc-tags-card" data-tutorial-target="dmp-feature-tags">
        <div class="tc-tags-head">
          <span class="tc-tags-title">特征大盘</span>
          <span class="tc-tags-count">已选 {{ selectedTags.length }}</span>
        </div>
        <div class="tc-tags-search">
          <input v-model="tagSearch" placeholder="搜索标签…" class="tc-tags-search-input" />
        </div>
        <div class="tc-tags-body">
          <template v-for="group in filteredTagGroups" :key="group.mainCategory">
            <div class="tc-tag-main" v-if="group.categories.some(category => category.tags.length)">
              <div class="tc-tag-main-header">{{ group.mainCategory }}</div>
              <div class="tc-tag-main-body">
                <div
                  v-for="category in group.categories"
                  :key="category.category"
                  v-show="category.tags.length"
                  class="tc-tag-category"
                >
                  <div class="tc-tag-category-name">{{ category.category }}</div>
                  <div class="tc-tag-options">
                    <label
                      v-for="tag in category.tags"
                      :key="tag.tagId"
                      class="tc-feature-option"
                      :data-tutorial-target="isDmpTutorialActive && DMP_TUTORIAL_TAG_IDS.includes(String(tag.tagId)) ? `dmp-tag-${tag.tagId}` : undefined"
                      :class="{ checked: selectedTags.includes(tag.tagId), disabled: !isTagSelectable(tag), needCond: tag.needCondition, ready: tag.needCondition && isConditionalTagReady(tag, dmpSettings.readyTagIds) }"
                      :title="tag.annotation || (!isTagSelectable(tag) ? '请先在 DMP 页面配置该标签的下钻条件' : '')"
                    >
                      <input class="tc-tag-checkbox" type="checkbox" :value="tag.tagId" :disabled="!isTagSelectable(tag)" v-model="selectedTags" />
                      <span class="tc-tag-name">{{ tag.tagName }}</span>
                      <span class="tc-tag-condition" v-if="tag.needCondition">
                        {{ isConditionalTagReady(tag, dmpSettings.readyTagIds) ? '已就绪' : '需配置' }}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div class="tc-tags-empty" v-if="!hasFilteredTags">无匹配标签</div>
        </div>
      </section>

      <div
        class="panel-resize-handle panel-resize-handle--right"
        :aria-valuenow="taskControlWidth"
        aria-valuemin="300"
        aria-valuemax="560"
        aria-label="调整任务控制栏宽度"
        aria-orientation="vertical"
        role="separator"
        tabindex="0"
        @pointerdown="startTaskControlResize"
        @keydown="onTaskControlResizeKeydown"
      ></div>
    </aside>

    <!-- 右栏：监控台 -->
    <main class="tc-monitor-panel" data-tutorial-target="dmp-batch-progress">
      <transition name="tc-toast">
        <section
          v-if="completionToastVisible && activeTask && activeTask.hasResults"
          class="tc-completion-toast"
          role="status"
          aria-live="polite"
          tabindex="0"
          @mouseenter="pauseCompletionToast('hover')"
          @mouseleave="resumeCompletionToast('hover')"
          @focusin="pauseCompletionToast('focus')"
          @focusout="resumeCompletionToast('focus')"
        >
          <span class="tc-toast-check">&#10003;</span>
          <span class="tc-toast-copy">
            <strong>采集完成</strong>
            <span>{{ activeTask.crowdName || activeTask.name }}</span>
          </span>
          <span class="tc-toast-meta" v-if="taskResults && taskResults.length">
            覆盖 {{ (crowdCount || 0).toLocaleString() }} 人 · {{ taskResults.length }} 行
          </span>
          <button type="button" class="tc-toast-close" aria-label="关闭成功提示" @click="closeCompletionToast">×</button>
        </section>
      </transition>

      <nav class="tc-monitor-tabs" aria-label="达摩盘取数视图">
        <button type="button" :class="{ active: monitorView === 'result' }" @click="monitorView = 'result'">本次结果</button>
        <button type="button" :class="{ active: monitorView === 'history' }" @click="monitorView = 'history'">
          任务记录 <span>{{ taskHistory.length }}</span>
        </button>
        <button
          type="button"
          data-tutorial-target="dmp-horizontal-comparison"
          :class="{ active: monitorView === 'comparison' }"
          @click="openComparisonView"
        >
          横向对比 <span>{{ selectedComparisonTaskKeys.length }}</span>
        </button>
      </nav>

      <section v-if="monitorView === 'result'" class="tc-result-view">
        <!-- 任务失败栏 -->
        <section class="tc-fail-bar" v-if="activeTask && activeTask.status === 'failed'">
          <span class="tc-fail-icon">&#10007;</span>
          <span class="tc-fail-name">{{ activeTask.name }}</span>
          <span class="tc-fail-msg">{{ activeTask.message }}</span>
          <el-button size="small" class="tc-retry-btn" @click="retryTask">重试</el-button>
        </section>

        <!-- 进行中进度卡片 -->
        <section class="tc-progress-card" v-if="activeTask && (activeTask.status === 'running' || activeTask.status === 'pending')">
          <div class="tc-progress-header">
            <div class="tc-progress-name">{{ activeTask.name }}</div>
            <div class="tc-progress-batch" v-if="activeTask.batchTotal">{{ activeTask.batchIndex }}/{{ activeTask.batchTotal }}</div>
            <div class="tc-progress-phase" :class="activeTask.status">{{ phaseLabel(activeTask.status) }}</div>
          </div>
          <div class="tc-phase-bar">
            <div v-for="(phase, idx) in phases" :key="idx" class="tc-phase-step"
              :class="{ done: idx < activeTask.phaseIndex, current: idx === activeTask.phaseIndex, pending: idx > activeTask.phaseIndex, failed: activeTask.status === 'failed' && idx === activeTask.phaseIndex }">
              <div class="tc-phase-dot"><span v-if="idx < activeTask.phaseIndex">&#10003;</span><span v-else-if="activeTask.status === 'failed' && idx === activeTask.phaseIndex">&#10005;</span><span v-else>{{ idx + 1 }}</span></div>
              <div class="tc-phase-line" v-if="idx < phases.length - 1"></div>
              <div class="tc-phase-text">{{ phase }}</div>
            </div>
          </div>
          <div class="tc-progress-meter"><div class="tc-progress-fill" :style="{ width: activeTask.progress + '%' }"></div></div>
          <div class="tc-progress-desc">
            <span class="tc-progress-pct">{{ activeTask.progress }}%</span>
            <span class="tc-progress-msg">{{ activeTask.message }}</span>
          </div>
        </section>

        <!-- 提取结果 -->
        <section class="tc-results-card" v-if="taskResults && taskResults.length">
          <div class="tc-results-header">
            <span class="tc-results-title">透视结果</span>
            <span class="tc-results-total">覆盖 <strong>{{ crowdCount ? crowdCount.toLocaleString() : '—' }}</strong> 人</span>
            <span class="tc-results-count">{{ taskResults.length }} 行</span>
            <el-button size="small" class="tc-btn-copy" @click="copyResults">复制</el-button>
            <el-button size="small" class="tc-btn-csv" @click="exportCsv">导出 CSV</el-button>
            <el-button size="small" class="tc-results-close" text @click="clearResults">✕</el-button>
          </div>
          <div class="tc-results-table-wrap">
            <table class="tc-results-table">
              <thead><tr><th v-for="key in resultColumns" :key="key">{{ key }}</th></tr></thead>
              <tbody>
                <tr v-for="(row, ri) in normalizedTaskResults" :key="ri" :style="{ animationDelay: ri * 20 + 'ms' }" class="tc-row-enter" :class="['tc-row-cat-' + catClass(row['所属大类'])]">
                  <td v-for="key in resultColumns" :key="key">
                    <span v-if="key === '所属大类'" :class="['tc-cat-tag', catClass(row[key])]">{{ row[key] }}</span>
                    <span v-else-if="key === '标签类型'" class="tc-subcat-tag" :style="subcatStyle(row)">{{ row[key] }}</span>
                    <div v-else-if="(key === '人群占比' || key === 'Rebase') && row[key] !== '-' && String(row[key]).includes('%')" class="tc-heat-bar" :class="{ pink: key === '人群占比', blue: key === 'Rebase' }">
                      <div class="tc-heat-fill" :style="{ width: Math.min(parseFloat(row[key]) || 0, 100) + '%' }"></div>
                      <span class="tc-heat-val">{{ formatPercentageForDisplay(row[key]) }}</span>
                    </div>
                    <span v-else-if="key === '标签名称'" :class="['tc-tag-name-cell', tagNameClass(row)]">{{ row[key] }}</span>
                    <span v-else-if="(key === '覆盖人数' || key === 'Rebase后人数') && row[key] !== '-'" class="tc-count-cell">{{ Number(row[key]).toLocaleString('zh-CN') }}</span>
                    <span v-else :class="{ 'tc-warn': String(row[key]).includes('⚠️') || String(row[key]).includes('❌') }">{{ row[key] }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="tc-empty-monitor" v-else-if="!activeTask">
          <div class="tc-empty-icon">&#9674;</div>
          <div class="tc-empty-title">等待任务发起</div>
          <div class="tc-empty-desc">输入人群包名称并点击运行，任务进度将在此处实时展示。</div>
          <button v-if="taskHistory.length" type="button" class="tc-empty-history" @click="monitorView = 'history'">查看已有任务记录</button>
        </section>
      </section>

      <DmpComparisonWorkspace
        v-else
        :tasks="taskHistory"
        :mode="monitorView"
        v-model:selected-keys="selectedComparisonTaskKeys"
        v-model:selected-metrics="comparisonMetrics"
        v-model:history-query="historyQuery"
        v-model:history-collapsed="comparisonHistoryCollapsed"
        v-model:label-orders="comparisonLabelOrders"
        @request-comparison="openComparisonFromHistory"
        @view-task="viewHistoryTask"
        @delete-task="deleteHistoryItem"
        @clear-history="clearHistory"
      />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import DmpComparisonWorkspace from './DmpComparisonWorkspace.vue'
import TaskBatchPopover from './TaskBatchPopover.vue'
import tagDictionary from '../data/dmp_tags_dictionary.json'
import {
  DMP_RESULT_COLUMNS,
  formatPercentageForDisplay,
  isConditionalTagReady,
  normalizeDmpSettings,
  normalizeResultRow,
  orderResultRowsByDictionary,
  orderTagIdsByDictionary,
  visibleResultColumns,
} from '../utils/dmpResults.js'
import {
  DMP_COMPARISON_METRICS,
  compareTagNameStructures,
} from '../utils/dmpComparison.js'
import { fetchWithTimeout } from '../utils/apiClient.js'
import { parseCrowdBatch } from '../utils/crowdBatch.js'
import { readSessionWorkspace, writeSessionWorkspace } from '../utils/sessionWorkspace.js'
import { createTaskProgressPersistence } from '../utils/taskProgressPersistence.js'
import { usePanelResize } from '../composables/usePanelResize'
import { useGuidedTutorial } from '../composables/useGuidedTutorial.js'
import {
  DMP_BATCH_TUTORIAL_ID,
  DMP_BATCH_TUTORIAL_TAGS,
} from '../utils/guidedTutorialConfig.js'

const API = '/api/tasks'
const BATCH_EXECUTION_GAP_MS = 2500
const EXPECTED_EXTENSION_VERSION = '2.2.1'
const TASK_SESSION_KEY = 'task-center.v1'
const COMPLETION_TOAST_DURATION_MS = 4000
const MONITOR_VIEWS = new Set(['result', 'history', 'comparison'])

const props = defineProps({
  sessionOwnerId: { type: String, default: '' },
})

const {
  state: guidedTutorialState,
  currentStep: guidedTutorialStep,
  completeStep: completeGuidedTutorialStep,
  isStep: isGuidedTutorialStep,
  updateContext: updateGuidedTutorialContext,
} = useGuidedTutorial()
const DMP_TUTORIAL_TAG_IDS = DMP_BATCH_TUTORIAL_TAGS.map((tag) => String(tag.tagId))
const isDmpTutorialActive = computed(() => (
  guidedTutorialState.active && guidedTutorialState.taskId === DMP_BATCH_TUTORIAL_ID
))

const taskCenterPageRef = ref(null)
const TASK_MIN_MONITOR_WIDTH = 620

const {
  width: taskControlWidth,
  startResize: startTaskControlResize,
  onResizeKeydown: onTaskControlResizeKeydown,
} = usePanelResize({
  panelId: 'task-control',
  ownerId: props.sessionOwnerId,
  defaultWidth: 380,
  minWidth: 300,
  maxWidth: 560,
  edge: 'right',
  applyWidth: width => taskCenterPageRef.value?.style.setProperty('--task-control-width', `${width}px`),
  getDynamicMaxWidth: () =>
    (taskCenterPageRef.value?.clientWidth || window.innerWidth) - TASK_MIN_MONITOR_WIDTH,
})

const taskSessionState = readSessionWorkspace(TASK_SESSION_KEY, props.sessionOwnerId) || {}

// -- persistence --
function taskStorageKey(key) { return `cdp_task_${props.sessionOwnerId || 'anonymous'}_${key}` }
function loadPersisted(k, def) {
  try {
    const scoped = localStorage.getItem(taskStorageKey(k))
    return JSON.parse(scoped || JSON.stringify(def))
  } catch { return def }
}
function savePersisted(k, val) {
  try { localStorage.setItem(taskStorageKey(k), JSON.stringify(val)) } catch { /* */ }
}

const databankCrowd = ref(loadPersisted('databankCrowd', ''))
const dmpCrowd = ref(loadPersisted('dmpCrowd', ''))
const databankBatchMode = ref(false)
const dmpBatchMode = ref(false)
const databankBatchText = ref(String(taskSessionState.databankBatchText || ''))
const dmpBatchText = ref(String(taskSessionState.dmpBatchText || ''))
const databankBatchDraft = ref(String(taskSessionState.databankBatchDraft ?? databankBatchText.value))
const dmpBatchDraft = ref(String(taskSessionState.dmpBatchDraft ?? dmpBatchText.value))
const databankAutoApply = ref(false)
databankAutoApply.value = taskSessionState.databankAutoApply === true
const selectedTags = ref(taskSessionState.selectedTags || loadPersisted('selectedTags', ['160571', '114555', '114554', '213510', '150663']))
const tagSearch = ref(String(taskSessionState.tagSearch || ''))
const monitorView = ref(MONITOR_VIEWS.has(taskSessionState.monitorView) ? taskSessionState.monitorView : 'result')
const historyQuery = ref(String(taskSessionState.historyQuery || ''))
const selectedComparisonTaskKeys = ref(Array.isArray(taskSessionState.selectedComparisonTaskKeys) ? taskSessionState.selectedComparisonTaskKeys.map(String) : [])
const comparisonHistoryCollapsed = ref(taskSessionState.comparisonHistoryCollapsed === true)
const comparisonLabelOrders = ref(
  taskSessionState.comparisonLabelOrders
    && typeof taskSessionState.comparisonLabelOrders === 'object'
    && !Array.isArray(taskSessionState.comparisonLabelOrders)
    ? Object.fromEntries(
      Object.entries(taskSessionState.comparisonLabelOrders)
        .filter(([, order]) => Array.isArray(order))
        .map(([fingerprint, order]) => [fingerprint, order.map(String)]),
    )
    : {},
)
const comparisonMetrics = ref(
  DMP_COMPARISON_METRICS.filter((metric) => taskSessionState.comparisonMetrics?.includes(metric)).length
    ? DMP_COMPARISON_METRICS.filter((metric) => taskSessionState.comparisonMetrics.includes(metric))
    : ['覆盖人数'],
)

watch(databankCrowd, (v) => savePersisted('databankCrowd', v))
watch(dmpCrowd, (v) => savePersisted('dmpCrowd', v))
watch(selectedTags, (v) => savePersisted('selectedTags', v), { deep: true })
watch(
  [
    databankBatchMode,
    dmpBatchMode,
    databankBatchText,
    dmpBatchText,
    databankBatchDraft,
    dmpBatchDraft,
    databankAutoApply,
    selectedTags,
    tagSearch,
    monitorView,
    historyQuery,
    selectedComparisonTaskKeys,
    comparisonHistoryCollapsed,
    comparisonLabelOrders,
    comparisonMetrics,
  ],
  persistTaskSession,
  { deep: true },
)

const extConnected = ref(false)
const extensionState = ref('checking')
const extensionVersion = ref('')
const extensionCheckBusy = ref(false)
const installingExtension = ref(false)
let extensionEverConnected = false
let extensionTimer = null
let taskSessionPersistenceDisabled = false
const taskRunning = ref(null)
const activeTask = ref(null)
const cancelling = ref(false)
const taskResults = ref(null)
const crowdCount = ref(null)
const taskHistory = ref([])
const expandedHistory = ref(-1)
const completionToastVisible = ref(false)
let activeRunContext = null
let runSequence = 0
let completionToastTimer = null
const dmpSettings = ref(normalizeDmpSettings())
const dmpSettingsSyncing = ref(false)
const dmpSettingsLoaded = ref(false)

const databankManualPhases = ['已发起任务', '正在打开页面', '正在搜索人群包', '正在精准匹配', '已匹配成功', '正在选择渠道', '正在选择平台', '正在保留确认页面', '确认页面已保留']
const databankAutoPhases = ['已发起任务', '正在打开页面', '正在搜索人群包', '正在精准匹配', '已匹配成功', '正在选择渠道', '正在选择平台', '正在自动应用', '推送已提交']
const dmpPhases = ['已发起任务', '正在打开页面', '正在搜索人群包', '正在精准匹配', '已匹配成功', '正在判断人群数据是否同步好', '正在等待入口', '已进入透视', '正在获取数据', '已完成']
const phases = ref(dmpPhases)

const databankBatch = computed(() => parseCrowdBatch(databankBatchText.value))
const dmpBatch = computed(() => parseCrowdBatch(dmpBatchText.value))
const databankCrowdNames = computed(() => (
  databankBatchMode.value ? databankBatch.value.items : [databankCrowd.value.trim()].filter(Boolean)
))
const dmpCrowdNames = computed(() => (
  dmpBatchMode.value ? dmpBatch.value.items : [dmpCrowd.value.trim()].filter(Boolean)
))

let dmpTutorialPrepared = false

function prepareDmpTutorialWorkspace() {
  dmpTutorialPrepared = true
  selectedTags.value = selectedTags.value.filter((tagId) => !DMP_TUTORIAL_TAG_IDS.includes(String(tagId)))
  tagSearch.value = ''
  dmpCrowd.value = ''
  dmpBatchMode.value = false
  dmpBatchText.value = ''
  dmpBatchDraft.value = ''
  selectedComparisonTaskKeys.value = []
  comparisonMetrics.value = ['覆盖人数']
  monitorView.value = 'result'
  updateGuidedTutorialContext({
    selectedTagIds: [...selectedTags.value].map(String),
    audienceNames: [],
    audienceCount: 0,
    batchStatus: 'idle',
    batchCompletedCount: 0,
    batchFailedNames: [],
    batchError: '',
    comparisonSelectedCount: 0,
    comparisonMetrics: [],
    labelOrderFirst: '',
    labelOrderDraftFirst: '',
    labelOrderAutoMoved: false,
    audienceOrder: [],
    audienceOrderChanged: false,
    comparisonCopied: false,
  })
}

function syncDmpTutorialTags() {
  if (!isDmpTutorialActive.value) return
  const selected = [...selectedTags.value].map(String)
  updateGuidedTutorialContext({ selectedTagIds: selected })
  if (
    isGuidedTutorialStep('select-dmp-tags')
    && DMP_TUTORIAL_TAG_IDS.every((tagId) => selected.includes(tagId))
  ) {
    completeGuidedTutorialStep('select-dmp-tags')
  }
}

function syncDmpTutorialDraft() {
  if (!isDmpTutorialActive.value) return
  const names = parseCrowdBatch(dmpBatchDraft.value).items
  updateGuidedTutorialContext({ audienceNames: [...names], audienceCount: names.length })
  if (isGuidedTutorialStep('input-dmp-crowds') && names.length >= 2) {
    completeGuidedTutorialStep('input-dmp-crowds')
  }
}

function syncDmpTutorialComparisonSelection() {
  if (!isDmpTutorialActive.value) return
  const selectedCount = selectedComparisonTaskKeys.value.length
  updateGuidedTutorialContext({ comparisonSelectedCount: selectedCount })
  if (
    isGuidedTutorialStep('select-comparison-crowds')
    && selectedCount >= 2
    && selectedCount === Number(guidedTutorialState.context.audienceCount)
  ) {
    comparisonMetrics.value = []
    completeGuidedTutorialStep('select-comparison-crowds')
  }
}

function syncDmpTutorialMetrics() {
  if (!isDmpTutorialActive.value) return
  updateGuidedTutorialContext({ comparisonMetrics: [...comparisonMetrics.value] })
  if (
    isGuidedTutorialStep('select-comparison-metrics')
    && comparisonMetrics.value.includes('人群占比')
    && comparisonMetrics.value.includes('Rebase')
  ) {
    completeGuidedTutorialStep('select-comparison-metrics')
  }
}

watch(
  [() => guidedTutorialState.active, () => guidedTutorialState.taskId, guidedTutorialStep],
  ([active, taskId, step]) => {
    if (!active || taskId !== DMP_BATCH_TUTORIAL_ID) {
      dmpTutorialPrepared = false
      return
    }
    if (step?.id === 'select-dmp-tags' && !dmpTutorialPrepared) prepareDmpTutorialWorkspace()
  },
  { immediate: true },
)
watch(selectedTags, syncDmpTutorialTags, { deep: true })
watch(dmpBatchDraft, syncDmpTutorialDraft)
watch(selectedComparisonTaskKeys, syncDmpTutorialComparisonSelection, { deep: true })
watch(comparisonMetrics, syncDmpTutorialMetrics, { deep: true })

const tagGroups = computed(() => {
  const map = {}
  for (const tag of tagDictionary) {
    const mainCategory = tag.mainCategory || '其他'
    const category = tag.category || '其他'
    if (!map[mainCategory]) map[mainCategory] = {}
    if (!map[mainCategory][category]) map[mainCategory][category] = []
    map[mainCategory][category].push(tag)
  }
  return Object.entries(map).map(([mainCategory, categories]) => ({
    mainCategory,
    categories: Object.entries(categories).map(([category, tags]) => ({ category, tags })),
  }))
})

const filteredTagGroups = computed(() => {
  const q = tagSearch.value.trim().toLowerCase()
  if (!q) return tagGroups.value
  return tagGroups.value.map(g => ({
    ...g,
    categories: g.categories.map(category => ({
      ...category,
      tags: category.tags.filter(tag => (
        tag.tagName.toLowerCase().includes(q)
        || (tag.category || '').toLowerCase().includes(q)
        || (tag.mainCategory || '').toLowerCase().includes(q)
      )),
    })),
  }))
})

const hasFilteredTags = computed(() => filteredTagGroups.value.some(
  (group) => group.categories.some((category) => category.tags.length > 0),
))

const allDmpTags = computed(() => {
  const seen = new Set()
  return tagDictionary.filter((tag) => {
    const tagId = String(tag.tagId)
    if (seen.has(tagId)) return false
    seen.add(tagId)
    return true
  })
})

const allRebaseEnabled = computed(() => allDmpTags.value.every((tag) => isRebaseEnabled(tag.tagId)))

const canRunDatabank = computed(() => extConnected.value && databankCrowdNames.value.length > 0 && taskRunning.value === null)
const canRunDmp = computed(() => extConnected.value && dmpCrowdNames.value.length > 0 && taskRunning.value === null)
const extensionStatusLabel = computed(() => ({
  checking: '正在检测扩展',
  connected: '扩展已连接',
  'not-installed': '未检测到扩展',
  disconnected: '扩展连接已中断',
  'version-mismatch': '扩展版本不兼容',
  'permission-error': '扩展包下载失败',
}[extensionState.value] || '扩展未连接'))
const extensionStatusHint = computed(() => {
  if (extensionState.value === 'connected') return '任务执行器可用'
  if (extensionState.value === 'checking') return '请稍候'
  if (extensionState.value === 'version-mismatch') return `需要 V${EXPECTED_EXTENSION_VERSION} 或更高兼容版本`
  if (extensionState.value === 'permission-error') return '请确认登录状态和服务连接'
  return '安装或启用后重新检测'
})

function isCompatibleExtensionVersion(version) {
  if (!version) return true
  const actual = String(version).split('.').slice(0, 3).map(Number)
  const expected = EXPECTED_EXTENSION_VERSION.split('.').slice(0, 3).map(Number)
  while (actual.length < 3) actual.push(0)
  while (expected.length < 3) expected.push(0)
  if (actual.some(Number.isNaN) || expected.some(Number.isNaN)) return true
  if (actual[0] !== expected[0]) return false
  for (let index = 1; index < 3; index += 1) {
    if (actual[index] > expected[index]) return true
    if (actual[index] < expected[index]) return false
  }
  return true
}

function persistTaskSession() {
  if (taskSessionPersistenceDisabled || !props.sessionOwnerId) return
  writeSessionWorkspace(TASK_SESSION_KEY, props.sessionOwnerId, {
    databankBatchMode: databankBatchMode.value,
    dmpBatchMode: dmpBatchMode.value,
    databankBatchText: databankBatchText.value,
    dmpBatchText: dmpBatchText.value,
    databankBatchDraft: databankBatchDraft.value,
    dmpBatchDraft: dmpBatchDraft.value,
    databankAutoApply: databankAutoApply.value,
    selectedTags: [...selectedTags.value],
    tagSearch: tagSearch.value,
    monitorView: monitorView.value,
    historyQuery: historyQuery.value,
    selectedComparisonTaskKeys: [...selectedComparisonTaskKeys.value],
    comparisonHistoryCollapsed: comparisonHistoryCollapsed.value,
    comparisonLabelOrders: Object.fromEntries(
      Object.entries(comparisonLabelOrders.value).map(([fingerprint, order]) => [fingerprint, [...order]]),
    ),
    comparisonMetrics: [...comparisonMetrics.value],
  })
}

function disableTaskSessionPersistence() {
  taskSessionPersistenceDisabled = true
}

async function downloadExtension() {
  if (installingExtension.value) return
  installingExtension.value = true
  try {
    const response = await fetchWithTimeout('/api/extension/download', { cache: 'no-store' })
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('cdp:auth-required'))
    }
    if (!response.ok) {
      let message = '扩展安装包下载失败'
      try {
        const data = await response.json()
        message = data?.message || message
      } catch { /* keep the safe fallback */ }
      throw new Error(message)
    }

    const blobUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `DMP_PluginV${EXPECTED_EXTENSION_VERSION}-CDP-Merged.zip`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    ElMessage.success('扩展包已下载，请解压并在浏览器扩展管理页加载后重新检测')
  } catch (error) {
    extensionState.value = 'permission-error'
    ElMessage.error(error.message || '扩展安装包下载失败')
  } finally {
    installingExtension.value = false
  }
}

function prepareBatchRun(type, text) {
  if (taskRunning.value !== null) return
  if (type === 'databank') {
    databankBatchText.value = text
    databankBatchDraft.value = text
    databankBatchMode.value = true
  } else {
    dmpBatchText.value = text
    dmpBatchDraft.value = text
    dmpBatchMode.value = true
  }
}

function handleDmpBatchOpen() {
  if (isGuidedTutorialStep('open-dmp-batch')) {
    completeGuidedTutorialStep('open-dmp-batch')
  }
}

async function runBatchDraft(type, text) {
  if (taskRunning.value !== null) return
  prepareBatchRun(type, text)
  if (type === 'dmp' && isGuidedTutorialStep('confirm-dmp-batch')) {
    const names = parseCrowdBatch(text).items
    if (names.length < 2) {
      updateGuidedTutorialContext({ batchError: '批量教程至少需要 2 个人群包名称。' })
      return
    }
    updateGuidedTutorialContext({
      audienceNames: [...names],
      audienceCount: names.length,
      batchStatus: 'idle',
      batchCompletedCount: 0,
      batchFailedNames: [],
      batchError: '',
    })
    completeGuidedTutorialStep('confirm-dmp-batch')
    return
  }
  try {
    if (type === 'databank') await runDatabank()
    else await runDmp()
  } finally {
    if (type === 'databank') databankBatchMode.value = false
    else dmpBatchMode.value = false
  }
}

function openComparisonView() {
  monitorView.value = 'comparison'
  if (!isGuidedTutorialStep('open-dmp-comparison')) return
  selectedComparisonTaskKeys.value = []
  comparisonHistoryCollapsed.value = false
  completeGuidedTutorialStep('open-dmp-comparison')
}

function phaseLabel(s) { return { running: '执行中', completed: '已完成', failed: '执行失败' }[s] || s }
function statusLabel(s) { return { completed: '已完成', failed: '失败', cancelled: '已取消', running: '进行中' }[s] || s }

function historyTaskKey(task, index = 0) {
  return String(task?.comparisonKey || task?.id || task?.runId || `${task?.type || 'task'}:${task?.name || '未命名'}:${task?.createdAt || task?.time || index}`)
}

function isComparisonReadyTask(task) {
  return task?.status === 'completed' && task?.type === 'dmp' && Array.isArray(task?.results) && task.results.length > 0
}

function reconcileComparisonSelection() {
  const taskMap = new Map(taskHistory.value.map((task, index) => [historyTaskKey(task, index), task]))
  const nextKeys = []
  let baselineTask = null
  for (const key of selectedComparisonTaskKeys.value) {
    const task = taskMap.get(String(key))
    if (!isComparisonReadyTask(task)) continue
    if (!baselineTask) {
      baselineTask = task
      nextKeys.push(String(key))
      continue
    }
    if (compareTagNameStructures(baselineTask.results, task.results).compatible) nextKeys.push(String(key))
  }
  if (nextKeys.join('\u0000') !== selectedComparisonTaskKeys.value.join('\u0000')) {
    selectedComparisonTaskKeys.value = nextKeys
  }
}

function openComparisonFromHistory() {
  comparisonHistoryCollapsed.value = false
  monitorView.value = 'comparison'
}

let completionToastRemaining = COMPLETION_TOAST_DURATION_MS
let completionToastDeadline = 0
const completionToastPauseReasons = new Set()

function scheduleCompletionToast(duration = completionToastRemaining) {
  clearTimeout(completionToastTimer)
  completionToastRemaining = Math.max(0, duration)
  if (!completionToastVisible.value || completionToastPauseReasons.size > 0) return
  completionToastDeadline = Date.now() + completionToastRemaining
  completionToastTimer = setTimeout(closeCompletionToast, completionToastRemaining)
}

function showCompletionToast() {
  completionToastVisible.value = true
  completionToastRemaining = COMPLETION_TOAST_DURATION_MS
  completionToastPauseReasons.clear()
  scheduleCompletionToast()
}

function closeCompletionToast() {
  clearTimeout(completionToastTimer)
  completionToastTimer = null
  completionToastVisible.value = false
  completionToastRemaining = COMPLETION_TOAST_DURATION_MS
  completionToastPauseReasons.clear()
}

function pauseCompletionToast(reason) {
  if (!completionToastVisible.value) return
  if (completionToastPauseReasons.size === 0) {
    completionToastRemaining = Math.max(0, completionToastDeadline - Date.now())
    clearTimeout(completionToastTimer)
    completionToastTimer = null
  }
  completionToastPauseReasons.add(reason)
}

function resumeCompletionToast(reason) {
  completionToastPauseReasons.delete(reason)
  if (completionToastPauseReasons.size === 0 && completionToastVisible.value) {
    scheduleCompletionToast(completionToastRemaining || COMPLETION_TOAST_DURATION_MS)
  }
}

function viewHistoryTask(task) {
  closeCompletionToast()
  monitorView.value = 'result'
  phases.value = task?.type === 'databank'
    ? (task?.autoApply ? databankAutoPhases : databankManualPhases)
    : dmpPhases
  if (Array.isArray(task?.results) && task.results.length) {
    activeTask.value = null
    taskResults.value = normalizeResultRows(task.results)
    crowdCount.value = task.crowdCount || null
    return
  }
  taskResults.value = null
  crowdCount.value = null
  activeTask.value = {
    ...task,
    phaseIndex: task?.phaseIndex ?? task?.phase ?? 0,
    progress: task?.progress ?? 0,
    hasResults: false,
  }
  if (task?.status === 'completed') ElMessage.info(task?.message || '该任务没有可展示的透视结果')
}

watch(
  () => `${activeTask.value?.runId || activeTask.value?.id || ''}:${activeTask.value?.status || ''}:${activeTask.value?.hasResults ? 'results' : 'empty'}`,
  () => {
    if (activeTask.value?.status === 'completed' && activeTask.value?.hasResults) showCompletionToast()
    else if (activeTask.value?.status === 'running' || activeTask.value?.status === 'pending') closeCompletionToast()
  },
)

function userError(msg) {
  const map = {
    '未拦截到API凭证': '达摩盘页面未能正常加载，请确认已登录达摩盘',
    '未找到匹配的人群包': '未找到匹配的人群包，请检查名称是否输入正确',
    '找不到搜索输入框': '达摩盘页面加载不完整，请重试',
    '人群包名称不能为空': '请输入人群包名称',
    '插件响应超时': '插件响应超时，请刷新页面后重试',
    '插件通信失败': '插件未连接，请确认已加载扩展',
  }
  for (const [k, v] of Object.entries(map)) { if (msg.includes(k)) return v }
  return msg
}

const normalizedTaskResults = computed(() => normalizeResultRows(taskResults.value))
const resultColumns = computed(() => visibleResultColumns(normalizedTaskResults.value, dmpSettings.value.columnVisibility))
const orderedSelectedTagIds = computed(() => orderTagIdsByDictionary(selectedTags.value, tagDictionary))

function normalizeResultRows(results) {
  const normalizedRows = Array.isArray(results) ? results.map(normalizeResultRow) : []
  return orderResultRowsByDictionary(normalizedRows, tagDictionary)
}

function historyColumns(results) {
  return visibleResultColumns(normalizeResultRows(results), dmpSettings.value.columnVisibility)
}

function isTagSelectable(tag) {
  return isConditionalTagReady(tag, dmpSettings.value.readyTagIds)
}

function isRebaseEnabled(tagId) {
  return !dmpSettings.value.rebaseExcludedTagIds.includes(String(tagId))
}

function applyDmpSettings(settings, notifyRemoved = false) {
  dmpSettings.value = normalizeDmpSettings(settings)
  dmpSettingsLoaded.value = true
  const readyIds = dmpSettings.value.readyTagIds
  const blockedIds = new Set(
    tagDictionary
      .filter((tag) => tag.needCondition && !isConditionalTagReady(tag, readyIds))
      .map((tag) => String(tag.tagId)),
  )
  const removed = selectedTags.value.filter((tagId) => blockedIds.has(String(tagId)))
  if (removed.length > 0) {
    selectedTags.value = selectedTags.value.filter((tagId) => !blockedIds.has(String(tagId)))
    if (notifyRemoved) ElMessage.warning('部分多条件标签尚未就绪，已从本次选择中移除')
  }
}

async function loadDmpSettings(silent = false) {
  if (!extConnected.value) return false
  try {
    const response = await sendToExtension('CDP_DMP_GET_SETTINGS', {})
    if (!response.settings) throw new Error('当前扩展版本不支持共享 DMP 设置')
    applyDmpSettings(response.settings, !silent)
    return true
  } catch (error) {
    dmpSettingsLoaded.value = false
    if (!silent) ElMessage.error(userError(error.message || '插件设置同步失败，请刷新后重试'))
    return false
  }
}

async function saveDmpSettings(patch, previousSettings) {
  dmpSettingsSyncing.value = true
  try {
    const response = await sendToExtension('CDP_DMP_UPDATE_SETTINGS', patch)
    if (!response.settings) throw new Error('插件未返回最新设置')
    applyDmpSettings(response.settings)
    return true
  } catch (error) {
    dmpSettings.value = previousSettings
    ElMessage.error(userError(error.message || '设置保存失败，请重试'))
    return false
  } finally {
    dmpSettingsSyncing.value = false
  }
}

function toggleResultColumn(column, checked) {
  const previous = normalizeDmpSettings(dmpSettings.value)
  const columnVisibility = { ...dmpSettings.value.columnVisibility, [column]: checked }
  dmpSettings.value = { ...dmpSettings.value, columnVisibility }
  saveDmpSettings({ columnVisibility }, previous)
}

function toggleRebaseTag(tagId, enabled) {
  const previous = normalizeDmpSettings(dmpSettings.value)
  const excluded = new Set(dmpSettings.value.rebaseExcludedTagIds)
  if (enabled) excluded.delete(String(tagId))
  else excluded.add(String(tagId))
  const rebaseExcludedTagIds = [...excluded]
  dmpSettings.value = { ...dmpSettings.value, rebaseExcludedTagIds }
  saveDmpSettings({ rebaseExcludedTagIds }, previous)
}

function toggleAllRebase() {
  const previous = normalizeDmpSettings(dmpSettings.value)
  const rebaseExcludedTagIds = allRebaseEnabled.value ? allDmpTags.value.map((tag) => String(tag.tagId)) : []
  dmpSettings.value = { ...dmpSettings.value, rebaseExcludedTagIds }
  saveDmpSettings({ rebaseExcludedTagIds }, previous)
}

function catClass(cat) {
  if (cat === '用户特征') return 'cat-user'
  if (cat === '品类特征') return 'cat-product'
  if (cat === '私域特征') return 'cat-private'
  if (cat === '消费特征') return 'cat-consume'
  return 'cat-default'
}

// Build shade index map from a results array
function buildSubcatIndexMap(results) {
  const map = {}; const seen = {}
  if (!results?.length) return map
  for (const row of results) {
    const key = (row['所属大类'] || '') + '::' + (row['标签类型'] || '')
    if (!(key in seen)) { seen[key] = Object.keys(seen).length }
    map[key] = seen[key] % 4
  }
  return map
}

function tagNameClass(row, results) {
  const mc = row['所属大类'] || ''
  const sc = row['标签类型'] || ''
  const map = buildSubcatIndexMap(results || taskResults.value)
  const idx = map[mc + '::' + sc] || 0
  return 'cat-' + catClass(mc) + '-' + idx
}

function subcatStyle(row) {
  const colors = { '用户特征': { text: '#0958D9', border: '#91D5FF' }, '品类特征': { text: '#D4380D', border: '#FFBB96' }, '私域特征': { text: '#531DAB', border: '#D3ADF7' }, '消费特征': { text: '#389E0D', border: '#B7EB8F' } }
  const c = colors[row['所属大类']] || { text: '#595959', border: '#D9D9D9' }
  return { color: c.text, borderColor: c.border }
}

function copyResults() { copyResultsFrom(taskResults.value) }
function copyResultsFrom(results) {
  if (!results?.length) return
  const rows = normalizeResultRows(results)
  const keys = visibleResultColumns(rows, dmpSettings.value.columnVisibility)
  const tsv = keys.join('\t') + '\n' + rows.map(r => keys.map(k => r[k] ?? '-').join('\t')).join('\n')
  navigator.clipboard.writeText(tsv).catch(() => {})
}

function exportCsv() { exportCsvFrom(taskResults.value) }
function exportCsvFrom(results) {
  if (!results?.length) return
  const rows = normalizeResultRows(results)
  const keys = DMP_RESULT_COLUMNS
  const csv = keys.join(',') + '\n' + rows.map(r => keys.map(k => {
    const val = r[k] ?? '-'
    return '"' + String(val).replace(/"/g, '""') + '"'
  }).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `dmp_results_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url)
}

function clearResults() {
  closeCompletionToast()
  activeTask.value = null
  taskResults.value = null
  crowdCount.value = null
}

// -- API --
async function apiPost(path, body) {
  const res = await fetchWithTimeout(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '请求失败')
  return res.json()
}
async function apiPut(path, body) {
  const res = await fetchWithTimeout(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.message || data?.error || `更新失败（${res.status}）`)
  }
  return res.json()
}

const taskProgressPersistence = createTaskProgressPersistence({
  write: (taskId, payload) => apiPut(`${API}/${taskId}/progress`, payload),
})

async function createBackendTaskWithRetry(taskMeta, run) {
  let lastError = null
  for (const delayMs of [0, 500]) {
    if (delayMs > 0) await waitForAbortableDelay(delayMs, run.controller.signal)
    ensureRunActive(run)
    try {
      return await apiPost(API, taskMeta)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('无法创建任务记录')
}

function enqueueProgressUpdate(taskId, payload) {
  if (!taskId) return
  void taskProgressPersistence.enqueue(taskId, payload).catch((error) => {
    console.warn('[Task Center] progress update failed:', error?.message || error)
  })
}

async function saveTerminalTask(taskId, payload, failureMessage) {
  try {
    return await taskProgressPersistence.save(taskId, payload)
  } catch (error) {
    const persistenceError = new Error(`${failureMessage}：${error?.message || '服务器未确认保存'}`)
    persistenceError.code = 'TASK_TERMINAL_SAVE_FAILED'
    throw persistenceError
  }
}

async function loadHistory() {
  try {
    const res = await fetchWithTimeout(API)
    if (res.ok) {
      const tasks = await res.json()
      taskHistory.value = tasks.map(t => ({
        ...t,
        time: new Date(t.createdAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        results: t.result || t.results || null,
        crowdCount: t.crowdCount || null,
      }))
      reconcileComparisonSelection()
    }
  } catch { /* */ }
}
async function deleteHistoryItem(idx) {
  const task = taskHistory.value[idx]
  if (!task) return
  const key = historyTaskKey(task, idx)
  if (task.id) { try { await fetchWithTimeout(`${API}/${task.id}`, { method: 'DELETE' }) } catch { /* */ } }
  taskHistory.value.splice(idx, 1)
  selectedComparisonTaskKeys.value = selectedComparisonTaskKeys.value.filter((item) => item !== key)
  if (expandedHistory.value === idx) expandedHistory.value = -1
}

async function clearHistory() {
  try { await Promise.all(taskHistory.value.map(t => fetchWithTimeout(`${API}/${t.id}`, { method: 'DELETE' }).catch(() => {}))) } catch { /* */ }
  taskHistory.value = []; expandedHistory.value = -1
  selectedComparisonTaskKeys.value = []
}

// -- Extension --
let extRequestId = 0
function cancellationError() {
  const error = new Error('任务已终止')
  error.name = 'AbortError'
  return error
}

function createRunContext(type) {
  const run = {
    id: `run_${Date.now()}_${++runSequence}`,
    type,
    cancelled: false,
    cancelling: false,
    controller: new AbortController(),
  }
  activeRunContext = run
  return run
}

function isRunActive(run) {
  return Boolean(run && activeRunContext === run && !run.cancelled && !run.controller.signal.aborted)
}

function ensureRunActive(run) {
  if (!isRunActive(run)) throw cancellationError()
}

function waitForAbortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.reject(cancellationError())
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(cleanupAndResolve, ms)
    function cleanupAndResolve() {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }
    function handleAbort() {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', handleAbort)
      reject(cancellationError())
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function sendToExtension(msgType, payload = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const signal = options.signal
    if (signal?.aborted) {
      reject(cancellationError())
      return
    }
    const requestId = ++extRequestId
    const settingsMessage = msgType === 'CDP_DMP_GET_SETTINGS' || msgType === 'CDP_DMP_UPDATE_SETTINGS'
    const timeoutMs = options.timeoutMs ?? (settingsMessage ? 10000 : msgType === 'CDP_AUTOMATE_DATABANK_WAIT_APPLY' ? 2100000 : msgType === 'CDP_AUTOMATE_DATABANK_DATAHUB' ? 420000 : msgType === 'CDP_AUTOMATE_DMP_WAIT_PORTRAIT' ? 2100000 : 300000)
    const cleanup = () => {
      clearTimeout(timeout)
      window.removeEventListener('message', handler)
      signal?.removeEventListener('abort', handleAbort)
    }
    const handleAbort = () => {
      cleanup()
      reject(cancellationError())
    }
    const handler = (e) => {
      if (e.data?.source === 'databank-extension-bridge' && e.data?.requestId === requestId) {
        cleanup()
        if (e.data?.ok) resolve(e.data); else reject(new Error(e.data?.error || '扩展执行失败'))
      }
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('插件响应超时，请刷新页面后重试'))
    }, timeoutMs)
    window.addEventListener('message', handler)
    signal?.addEventListener('abort', handleAbort, { once: true })
    window.postMessage({ source: 'cdp-web', type: msgType, requestId, ...payload }, window.location.origin)
  })
}

function updateProgress(phaseIndex, message, run = activeRunContext) {
  if (!isRunActive(run) || !activeTask.value || activeTask.value.runId !== run.id) return
  const p = phases.value
  const pct = Math.round(((phaseIndex + 1) / p.length) * 100)
  const crowdName = activeTask.value.crowdName
  const fullMsg = crowdName ? message.replace('人群包', `「${crowdName}」`) : message
  activeTask.value = { ...activeTask.value, phaseIndex, progress: pct, message: fullMsg, status: 'running' }
  enqueueProgressUpdate(activeTask.value.id, { status: 'running', phase: phaseIndex, phaseLabel: fullMsg, progress: pct, message: fullMsg })
}

function advancePhasesFromTrail(trail, trailToPhase, run) {
  if (!trail) return
  let lastPhase = 1
  for (const step of trail) {
    const phaseIdx = trailToPhase[step.step]
    if (phaseIdx !== undefined) {
      for (let p = lastPhase + 1; p <= phaseIdx; p++) updateProgress(p, phases.value[p], run)
      lastPhase = phaseIdx
    }
  }
}

async function executeDatabank(crowdName, autoApply, run) {
  // Phase 1: search → match → apply → select channel → select platform → show confirm dialog
  const phase1 = await sendToExtension('CDP_AUTOMATE_DATABANK_CROWD', { crowdName, autoApply, runId: run.id }, { signal: run.controller.signal })
  ensureRunActive(run)
  if (!phase1.ok) throw new Error(phase1.error || '数据引擎执行失败')
  advancePhasesFromTrail(phase1.trail, {
    'searched': 2,
    'matched': 3,
    'clicked_apply': 4,
    'selected_alimama': 5,
    'selected_dmp': 6,
    'confirm_dialog_found': 7,
    'auto_apply_submitted': 7,
  }, run)
  const expectedStep = autoApply ? 'auto_apply_submitted' : 'confirm_dialog_found'
  if (!phase1.trail?.some((item) => item.step === expectedStep)) {
    throw new Error(autoApply ? '未能自动点击应用，请返回 DataBank 页面检查' : '未检测到应用确认弹窗，请返回 DataBank 页面重试')
  }

  return phase1
}

async function executeDmp(crowdName, run) {
  const settingsReady = await loadDmpSettings(true)
  ensureRunActive(run)
  if (!settingsReady) throw new Error('无法同步 DMP 设置，请重新加载新版合并插件')
  if (selectedTags.value.length === 0) throw new Error('请选择至少一个已就绪的标签')

  // Phase 1: search → match on crowd list page
  const phase1 = await sendToExtension('CDP_AUTOMATE_DMP', { crowdName, runId: run.id }, { signal: run.controller.signal })
  ensureRunActive(run)
  if (!phase1.ok) throw new Error(phase1.error || '搜索匹配失败')
  advancePhasesFromTrail(phase1.trail, { 'searched': 2, 'matched': 3, 'row_expanded': 4 }, run)
  if (!phase1.crowdId) throw new Error('搜索匹配完成但未能提取人群ID（crowdId），无法进入透视')

  // Phase 2: wait for portrait entry to appear (up to 30 min, updates progress)
  updateProgress(5, '正在判断人群数据是否同步好…', run)

  const phase2 = await sendToExtension('CDP_AUTOMATE_DMP_WAIT_PORTRAIT', { phase1Result: JSON.parse(JSON.stringify(phase1)), runId: run.id }, { signal: run.controller.signal })
  ensureRunActive(run)
  if (!phase2.ok) throw new Error(phase2.error || '等待画像透视入口超时')
  updateProgress(6, phases.value[6], run); await waitForAbortableDelay(500, run.controller.signal)

  // Phase 3: navigate to portrait page → extract data
  updateProgress(7, phases.value[7], run)

  const phase3 = await sendToExtension('CDP_AUTOMATE_DMP_EXTRACT', { phase1Result: JSON.parse(JSON.stringify(phase1)), selectedTags: orderedSelectedTagIds.value, runId: run.id }, { signal: run.controller.signal })
  ensureRunActive(run)
  if (!phase3.ok) throw new Error(phase3.error || '数据提取失败')
  advancePhasesFromTrail(phase3.trail, { 'entered_portrait': 7, 'payload_intercepted': 8, 'data_extracted': 8 }, run)
  return phase3
}

async function executeViaExtension(crowdName, type, options = {}) {
  const run = options.run
  ensureRunActive(run)
  const autoApply = type === 'databank' && options.autoApply === true
  phases.value = type === 'databank' ? (autoApply ? databankAutoPhases : databankManualPhases) : dmpPhases
  const taskMeta = { name: `${type === 'databank' ? '数据引擎' : '达摩盘'} · ${crowdName}`, type, crowdName, tagIds: orderedSelectedTagIds.value }
  let backendTask = null
  try {
    backendTask = await createBackendTaskWithRetry(taskMeta, run)
  } catch (error) {
    if (error?.name === 'AbortError' || !isRunActive(run)) return { status: 'cancelled', task: null }
    const failedMessage = `任务记录创建失败，自动化未启动：${error?.message || '请检查服务连接'}`
    const failedTask = {
      id: null,
      runId: run.id,
      ...taskMeta,
      tagCount: selectedTags.value.length,
      batchIndex: options.batchIndex || null,
      batchTotal: options.batchTotal || null,
      status: 'failed',
      phaseIndex: 0,
      progress: 0,
      message: failedMessage,
      hasResults: false,
      recordCreationFailed: true,
    }
    activeTask.value = failedTask
    taskHistory.value.unshift({ ...failedTask, time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }), results: null, crowdCount: null })
    ElMessage.error(failedMessage)
    return { status: 'failed', task: failedTask }
  }
  if (!isRunActive(run)) {
    if (backendTask?.id) {
      await taskProgressPersistence.save(backendTask.id, { status: 'cancelled', phase: 0, phaseLabel: '已终止', progress: 0, message: '用户终止' }).catch(() => null)
    }
    return { status: 'cancelled', task: null }
  }

  taskResults.value = null
  crowdCount.value = null
  activeTask.value = {
    id: backendTask?.id || null,
    runId: run.id,
    ...taskMeta,
    tagCount: selectedTags.value.length,
    batchIndex: options.batchIndex || null,
    batchTotal: options.batchTotal || null,
    status: 'running',
    phaseIndex: 0,
    progress: 0,
    message: '任务已发起，正在连接...',
    hasResults: false,
  }
  let outcome = 'failed'

  try {
    updateProgress(0, phases.value[0], run); await waitForAbortableDelay(800, run.controller.signal)
    updateProgress(1, phases.value[1], run)

    let result
    if (type === 'databank') { result = await executeDatabank(crowdName, autoApply, run) }
    else { result = await executeDmp(crowdName, run) }
    ensureRunActive(run)

    const finalPhase = phases.value.length - 1
    const completionLabel = type === 'databank' ? (autoApply ? '推送已提交' : '确认页面已保留') : '任务执行完成'
    const completionMessage = type === 'databank'
      ? (autoApply ? '已自动点击“应用”，推送已提交至达摩盘' : '确认页面已保留，批量完成后请逐个点击“应用”')
      : '任务执行完成'
    updateProgress(finalPhase, completionMessage, run)
    const hasResults = result?.results && result.results.length > 0
    const orderedResults = hasResults ? normalizeResultRows(result.results) : null
    if (hasResults) { taskResults.value = orderedResults; crowdCount.value = result.crowdCount || null }
    activeTask.value = { ...activeTask.value, status: 'running', hasResults, message: '执行完成，正在保存任务结果…' }
    await saveTerminalTask(backendTask.id, {
      status: 'completed',
      phase: finalPhase,
      phaseLabel: completionLabel,
      progress: 100,
      message: completionMessage,
      result: hasResults ? orderedResults : result,
      crowdCount: crowdCount.value,
    }, '任务已经执行完成，但结果保存失败')
    ensureRunActive(run)
    activeTask.value = { ...activeTask.value, status: 'completed', message: completionMessage, hasResults }
    outcome = 'completed'
  } catch (err) {
    if (err?.name === 'AbortError' || !isRunActive(run)) {
      return { status: 'cancelled', task: null }
    }
    if (activeTask.value?.runId === run.id) {
      let friendlyMsg = err?.code === 'TASK_TERMINAL_SAVE_FAILED'
        ? `${err.message}。结果仍保留在当前页面，请先复制或导出后再重试`
        : userError(err.message || '执行失败')
      if (backendTask?.id && err?.code !== 'TASK_TERMINAL_SAVE_FAILED') {
        try {
          await taskProgressPersistence.save(backendTask.id, {
            status: 'failed',
            phase: activeTask.value.phaseIndex,
            phaseLabel: friendlyMsg,
            progress: activeTask.value.progress,
            message: friendlyMsg,
          })
        } catch (saveError) {
          friendlyMsg += `；失败状态未能保存：${saveError?.message || '服务器无响应'}`
        }
      }
      activeTask.value = {
        ...activeTask.value,
        status: 'failed',
        message: friendlyMsg,
        persistenceFailed: err?.code === 'TASK_TERMINAL_SAVE_FAILED',
      }
      if (err?.code === 'TASK_TERMINAL_SAVE_FAILED') ElMessage.error(friendlyMsg)
    }
  }

  const task = activeTask.value?.runId === run.id ? activeTask.value : null
  if (task) {
    taskHistory.value.unshift({ ...task, time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }), results: taskResults.value ? [...taskResults.value] : null, crowdCount: crowdCount.value })
  }
  expandedHistory.value = -1 // collapse all history on new entry
  return { status: outcome, task }
}

async function cancelTask() {
  const run = activeRunContext
  if (!run || cancelling.value) return
  cancelling.value = true
  run.cancelled = true
  run.cancelling = true
  run.controller.abort()
  const task = activeTask.value?.runId === run.id ? activeTask.value : null
  if (task) { taskHistory.value.unshift({ ...task, status: 'cancelled', message: '用户取消', time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }), results: null, crowdCount: null }) }
  activeTask.value = null
  closeCompletionToast()
  taskResults.value = null
  crowdCount.value = null
  expandedHistory.value = -1

  const backendCancellation = task?.id
    ? taskProgressPersistence.save(task.id, {
        status: 'cancelled',
        phase: task.phaseIndex || 0,
        phaseLabel: '已终止',
        progress: task.progress || 0,
        message: '用户终止',
      }).catch(() => null)
    : Promise.resolve(null)

  try {
    const [extensionResult] = await Promise.all([
      sendToExtension('CDP_CANCEL_TASK', { runId: run.id }, { timeoutMs: 12000 }),
      backendCancellation,
    ])
    if (!extensionResult?.cancelled) throw new Error('扩展未确认终止')
    ElMessage.success('当前任务已终止，后续队列不会继续执行')
  } catch (error) {
    await backendCancellation
    ElMessage.warning('前端队列已停止，但扩展未确认终止；请检查并关闭仍在运行的插件页面')
  } finally {
    if (activeRunContext === run) activeRunContext = null
    taskRunning.value = null
    cancelling.value = false
  }
}

async function runDatabank() {
  if (!extConnected.value) { ElMessage.error('任务执行器未连接，请先安装或启用 Chrome 扩展'); return }
  if (!canRunDatabank.value) return
  monitorView.value = 'result'
  const names = [...databankCrowdNames.value]
  taskRunning.value = 'databank'
  const run = createRunContext('databank')
  try {
    if (databankBatchMode.value) await executeBatch(names, 'databank', { autoApply: databankAutoApply.value }, run)
    else await executeViaExtension(names[0], 'databank', { autoApply: databankAutoApply.value, run })
  } finally {
    if (activeRunContext === run && !run.cancelling) {
      activeRunContext = null
      taskRunning.value = null
    }
  }
}

async function runDmp() {
  const names = [...dmpCrowdNames.value]
  if (!extConnected.value) {
    ElMessage.error('任务执行器未连接，请先安装或启用 Chrome 扩展')
    return { completed: 0, failed: names.length, completedNames: [], failedNames: names, error: '任务执行器未连接' }
  }
  if (!canRunDmp.value) return { completed: 0, failed: names.length, completedNames: [], failedNames: names }
  if (selectedTags.value.length === 0) {
    ElMessage.warning('请先在特征大盘中选择至少一个已就绪的标签')
    return { completed: 0, failed: names.length, completedNames: [], failedNames: names, error: '未选择画像标签' }
  }
  monitorView.value = 'result'
  taskRunning.value = 'dmp'
  const run = createRunContext('dmp')
  try {
    if (dmpBatchMode.value) return await executeBatch(names, 'dmp', {}, run)
    const outcome = await executeViaExtension(names[0], 'dmp', { run })
    return {
      completed: outcome.status === 'completed' ? 1 : 0,
      failed: outcome.status === 'failed' ? 1 : 0,
      completedNames: outcome.status === 'completed' ? names : [],
      failedNames: outcome.status === 'failed' ? names : [],
    }
  } finally {
    if (activeRunContext === run && !run.cancelling) {
      activeRunContext = null
      taskRunning.value = null
    }
  }
}

async function executeBatch(names, type, options = {}, run) {
  let completed = 0
  let failed = 0
  const completedNames = []
  const failedNames = []

  for (let index = 0; index < names.length; index += 1) {
    if (!isRunActive(run)) break
    const outcome = await executeViaExtension(names[index], type, {
      ...options,
      run,
      keepRunning: true,
      batchIndex: index + 1,
      batchTotal: names.length,
    })
    if (outcome.status === 'completed') {
      completed += 1
      completedNames.push(names[index])
      if (type === 'dmp' && isGuidedTutorialStep('wait-dmp-batch')) {
        updateGuidedTutorialContext({
          batchCompletedCount: Number(guidedTutorialState.context.batchCompletedCount || 0) + 1,
        })
      }
    } else if (outcome.status === 'failed') {
      failed += 1
      failedNames.push(names[index])
      if (type === 'dmp' && isGuidedTutorialStep('wait-dmp-batch')) {
        updateGuidedTutorialContext({
          batchFailedNames: [...guidedTutorialState.context.batchFailedNames, names[index]],
        })
      }
    }
    else if (outcome.status === 'cancelled') break

    if (outcome.task?.persistenceFailed) {
      ElMessage.error('批量执行已暂停：当前人群包采集完成，但服务器未确认保存。请先复制或导出当前结果后再重试')
      const remainingNames = names.slice(index + 1)
      return {
        completed,
        failed: failed + remainingNames.length,
        completedNames,
        failedNames: [...failedNames, ...remainingNames],
        error: '服务器未确认保存，批量执行已暂停',
      }
    }
    if (outcome.task?.recordCreationFailed) {
      ElMessage.error('批量执行已暂停：服务器无法创建任务记录，请恢复服务连接后重试')
      const remainingNames = names.slice(index + 1)
      return {
        completed,
        failed: failed + remainingNames.length,
        completedNames,
        failedNames: [...failedNames, ...remainingNames],
        error: '服务器无法创建任务记录，批量执行已暂停',
      }
    }

    if (isRunActive(run) && index < names.length - 1) {
      try {
        await waitForAbortableDelay(BATCH_EXECUTION_GAP_MS, run.controller.signal)
      } catch (error) {
        if (error?.name === 'AbortError') break
        throw error
      }
    }
  }

  if (!isRunActive(run)) {
    const processedNames = new Set([...completedNames, ...failedNames])
    const remainingNames = names.filter((name) => !processedNames.has(name))
    return {
      completed,
      failed,
      completedNames,
      failedNames,
      cancelledNames: remainingNames,
      cancelled: true,
    }
  }
  const summary = `批量执行完成：成功 ${completed} 个，失败 ${failed} 个`
  if (failed > 0) ElMessage.warning(summary)
  else ElMessage.success(summary)
  return { completed, failed, completedNames, failedNames }
}

async function retryTask() {
  const task = activeTask.value; if (!task) return
  if (task.type === 'databank') {
    databankBatchMode.value = false
    databankCrowd.value = task.crowdName
    await runDatabank()
  } else {
    dmpBatchMode.value = false
    dmpCrowd.value = task.crowdName
    await runDmp()
  }
}

async function runDmpTutorialBatch(event) {
  if (!isDmpTutorialActive.value || !isGuidedTutorialStep('wait-dmp-batch')) return
  const requestedNames = Array.isArray(event?.detail?.names)
    ? event.detail.names.map((name) => String(name).trim()).filter(Boolean)
    : []
  const names = requestedNames.length
    ? requestedNames
    : [...guidedTutorialState.context.audienceNames]
  const retrying = event?.detail?.retry === true
  const previousCompleted = retrying ? Number(guidedTutorialState.context.batchCompletedCount || 0) : 0

  if (names.length === 0) {
    updateGuidedTutorialContext({
      batchStatus: 'failed',
      batchFailedNames: [],
      batchError: '没有可执行的人群包名称，请返回修改名单。',
    })
    return
  }

  dmpBatchText.value = names.join('\n')
  dmpBatchDraft.value = dmpBatchText.value
  dmpBatchMode.value = true
  updateGuidedTutorialContext({
    batchStatus: 'running',
    batchFailedNames: [],
    batchError: '',
  })

  try {
    const summary = await runDmp()
    const failedNames = Array.isArray(summary?.failedNames) ? summary.failedNames : names
    const completedNow = Array.isArray(summary?.completedNames) ? summary.completedNames.length : 0
    const completedCount = Math.min(
      Number(guidedTutorialState.context.audienceCount || names.length),
      Math.max(
        Number(guidedTutorialState.context.batchCompletedCount || 0),
        previousCompleted + completedNow,
      ),
    )
    const targetCount = Number(guidedTutorialState.context.audienceCount || names.length)

    if (failedNames.length || summary?.cancelled || completedCount < targetCount) {
      updateGuidedTutorialContext({
        batchStatus: completedCount > 0 ? 'partial' : 'failed',
        batchCompletedCount: completedCount,
        batchFailedNames: [...failedNames],
        batchError: summary?.error
          || (summary?.cancelled ? '批量任务已终止，可修改名单后重新开始。' : `有 ${failedNames.length} 个人群包取数失败。`),
      })
      return
    }

    updateGuidedTutorialContext({
      batchStatus: 'completed',
      batchCompletedCount: completedCount,
      batchFailedNames: [],
      batchError: '',
    })
    completeGuidedTutorialStep('wait-dmp-batch')
  } finally {
    dmpBatchMode.value = false
  }
}

function editDmpTutorialBatch() {
  if (!isDmpTutorialActive.value) return
  const names = Array.isArray(guidedTutorialState.context.audienceNames)
    ? guidedTutorialState.context.audienceNames
    : []
  dmpBatchText.value = names.join('\n')
  dmpBatchDraft.value = dmpBatchText.value
  dmpBatchMode.value = false
  updateGuidedTutorialContext({
    batchStatus: 'idle',
    batchCompletedCount: 0,
    batchFailedNames: [],
    batchError: '',
  })
}

async function checkExtension(manual = false) {
  if (extensionCheckBusy.value) return
  extensionCheckBusy.value = true
  if (!extConnected.value) extensionState.value = 'checking'
  try {
    const wasConnected = extConnected.value
    const requestId = `ping_${Date.now()}_${++extRequestId}`
    const result = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 1200)
      const h = (e) => {
        if (
          e.data?.source === 'databank-extension-bridge'
          && e.data?.requestId === requestId
          && e.data?.ok
        ) {
          clearTimeout(t)
          resolve(e.data)
        }
      }
      window.addEventListener('message', h, { once: false })
      window.postMessage({ source: 'cdp-web', type: 'CDP_AUTOMATE_DATABANK', requestId, jsonText: '{}' }, window.location.origin)
      setTimeout(() => { window.removeEventListener('message', h); clearTimeout(t); resolve(null) }, 1300)
    })
    extensionVersion.value = String(result?.version || '')
    if (result && isCompatibleExtensionVersion(extensionVersion.value)) {
      extConnected.value = true
      extensionEverConnected = true
      extensionState.value = 'connected'
      if (!wasConnected || !dmpSettingsLoaded.value) await loadDmpSettings(true)
      if (manual) ElMessage.success('扩展连接正常')
      return
    }

    extConnected.value = false
    if (result) {
      extensionState.value = 'version-mismatch'
      if (manual) ElMessage.warning(`当前扩展版本 V${extensionVersion.value || '未知'} 不兼容，请重新下载安装`)
    } else {
      extensionState.value = extensionEverConnected ? 'disconnected' : 'not-installed'
      if (manual) ElMessage.warning('暂未检测到扩展，请确认已安装并启用')
    }
  } catch {
    extConnected.value = false
    extensionState.value = extensionEverConnected ? 'disconnected' : 'not-installed'
    if (manual) ElMessage.warning('扩展检测失败，请稍后重试')
  } finally {
    extensionCheckBusy.value = false
  }
}

onMounted(async () => {
  window.addEventListener('cdp:workspace-session-clearing', disableTaskSessionPersistence)
  window.addEventListener('cdp:tutorial-run-dmp-batch', runDmpTutorialBatch)
  window.addEventListener('cdp:tutorial-edit-dmp-batch', editDmpTutorialBatch)
  window.addEventListener('beforeunload', persistTaskSession)
  loadHistory()
  await checkExtension()
  extensionTimer = setInterval(checkExtension, 15000)
})

onBeforeUnmount(() => {
  clearInterval(extensionTimer)
  extensionTimer = null
  clearTimeout(completionToastTimer)
  completionToastTimer = null
  persistTaskSession()
  window.removeEventListener('beforeunload', persistTaskSession)
  window.removeEventListener('cdp:workspace-session-clearing', disableTaskSessionPersistence)
  window.removeEventListener('cdp:tutorial-run-dmp-batch', runDmpTutorialBatch)
  window.removeEventListener('cdp:tutorial-edit-dmp-batch', editDmpTutorialBatch)
})
</script>

<style scoped>
/* ============================================================ */
/*  Task Center — Precision Control Room                         */
/* ============================================================ */

.task-center-page {
  flex: 1; display: grid;
  grid-template-columns: var(--task-control-width, 380px) minmax(0, 1fr);
  height: 100%; min-height: 0; overflow: hidden;
  background: var(--ui-canvas);
}

/* ---- 左栏 ---- */
.tc-control-panel {
  position: relative;
  display: flex; flex-direction: column; gap: 0;
  padding: 18px 18px 14px;
  background: #fff;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-right: 1px solid var(--ui-divider);
  overflow: hidden;
}

.tc-ext-status {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  margin-bottom: 16px; padding: 2px 1px; border: 0; border-radius: 0; font-size: 11px;
  background: transparent;
  transition: all 0.35s ease; flex-shrink: 0;
}
.tc-ext-status.connected { background: transparent; border-color: transparent; }
.tc-ext-dot { width: 7px; height: 7px; border-radius: 50%; background: #ff3b30; box-shadow: none; flex-shrink: 0; transition: all 0.3s ease; }
.tc-ext-status.connected .tc-ext-dot { background: #34c759; box-shadow: none; }
.tc-ext-label { font-weight: 500; color: #171717; }
.tc-ext-hint { min-width: 72px; flex: 1 1 auto; color: #ff3b30; }
.tc-ext-status.connected .tc-ext-hint { color: #6e6e73; }
.tc-ext-version { color: #86868b; font: 9px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace; }
.tc-ext-actions { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; }
.tc-ext-actions button {
  height: 24px; padding: 0 8px; color: #1d1d1f; font: inherit; font-size: 9px;
  background: #fff; border: 1px solid #d2d2d7; border-radius: 999px; cursor: pointer;
}
.tc-ext-actions button:hover:not(:disabled) { border-color: #86868b; background: #f5f5f7; }
.tc-ext-actions button:disabled { cursor: wait; opacity: 0.55; }
.tc-ext-status.checking .tc-ext-dot { background: #ff9f0a; animation: tc-ext-pulse 850ms ease-in-out infinite alternate; }
.tc-ext-status.version-mismatch .tc-ext-dot { background: #ff9f0a; }

@keyframes tc-ext-pulse { to { opacity: 0.35; } }

.tc-section-heading { display: flex; align-items: center; gap: 7px; margin: 0 1px 11px; color: #1d1d1f; font-size: 11px; font-weight: 650; letter-spacing: -0.01em; }
.tc-section-marker { width: 2px; height: 13px; border-radius: 1px; background: #1d1d1f; flex: 0 0 auto; }
.tc-test-row { position: relative; display: flex; flex-direction: column; gap: 14px; margin-bottom: 15px; padding: 0 0 18px 9px; flex-shrink: 0; }
.tc-test-row::after { position: absolute; right: 4%; bottom: 0; left: 9px; height: 1px; background: linear-gradient(90deg, rgba(29,29,31,0.16), rgba(29,29,31,0.04) 72%, transparent); content: ""; }
.tc-test-col { background: transparent; border: 0; border-radius: 0; padding: 0 1px; }
.tc-test-col:focus-within { border-color: transparent; }
.tc-test-head { min-height: 22px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.tc-test-label { font-size: 10px; font-weight: 600; color: #a1a1a6; letter-spacing: 0.04em; }
.tc-auto-apply { display: inline-flex; align-items: center; gap: 6px; color: #6e6e73; font-size: 10px; cursor: pointer; }
.tc-auto-apply :deep(.el-switch) { --el-switch-on-color: #1d1d1f; --el-switch-off-color: #d1d1d6; height: 18px; }
.tc-test-controls { display: flex; gap: 6px; align-items: center; }
.tc-input-sm { flex: 1; min-width: 0; }
.tc-input-sm :deep(.el-input__wrapper) { background: #fff; border: 0; border-radius: 0; box-shadow: none !important; padding: 0 6px; height: 32px; font-size: 12px; }
.tc-input-sm :deep(.el-input__wrapper:hover) { background: #fff; }
.tc-input-sm :deep(.el-input__wrapper.is-focus) { background: #fff; border-color: transparent; box-shadow: inset 0 -1px 0 #1d1d1f !important; }
.tc-input-sm :deep(.el-input__inner) { font-size: 12px; }
.tc-batch-summary { display: inline-flex; align-items: center; flex: 1; min-width: 0; height: 32px; padding: 0 6px; overflow: hidden; color: #1d1d1f; font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }

.tc-btn-sm { height: 32px !important; padding: 0 14px !important; border-radius: 8px !important; border: none !important; background: #1d1d1f !important; color: #fff !important; font-size: 12px !important; font-weight: 500 !important; flex-shrink: 0; transition: all 0.22s ease !important; }
.tc-btn-sm:hover:not(:disabled) { background: #333336 !important; transform: translateY(-1px); }
.tc-btn-sm.is-dmp {
  color: #ffffff !important;
  background: var(--ui-ink) !important;
  border-color: var(--ui-ink) !important;
  box-shadow: none !important;
}
.tc-btn-sm.is-dmp:hover:not(:disabled) {
  color: #ffffff !important;
  background: var(--ui-ink) !important;
  border-color: var(--ui-ink) !important;
  box-shadow: none !important;
}
.tc-btn-sm:disabled { background: #fff !important; color: var(--ui-text-secondary) !important; border: 0 !important; opacity: 1; box-shadow: none !important; transform: none !important; }
.tc-btn-sm.is-cancel { background: #ff3b30 !important; }
.tc-btn-sm.is-cancel:hover { background: #ff544a !important; }

.tc-dmp-tools { display: flex; align-items: center; justify-content: flex-start; gap: 6px; margin-bottom: 18px; padding: 0 1px; flex-shrink: 0; }
.tc-dmp-tools-label { display: inline-flex; align-items: center; gap: 7px; margin-right: 2px; color: #1d1d1f; font-size: 11px; font-weight: 650; letter-spacing: -0.01em; }
.tc-dmp-tools-label::before { width: 2px; height: 13px; border-radius: 1px; background: #1d1d1f; content: ""; flex: 0 0 auto; }
.tc-settings-btn { min-width: 48px; height: 24px; padding: 0 7px; border: 1px solid #1d1d1f; border-radius: 3px; background: #fff; color: #1d1d1f; font-size: 9px; font-weight: 550; letter-spacing: 0.01em; cursor: pointer; transition: color 0.16s ease, background 0.16s ease, transform 0.16s ease; }
.tc-settings-btn:hover:not(:disabled) { color: #fff; background: #1d1d1f; transform: translateY(-1px); }
.tc-settings-btn:active:not(:disabled) { transform: scale(0.96); }
.tc-settings-btn:disabled { background: #fff; color: #1d1d1f; border-color: #1d1d1f; opacity: 1; box-shadow: none; transform: none; cursor: not-allowed; }
.tc-settings-state { font-size: 9px; color: #a1a1a6; }
.tc-settings-panel { display: flex; flex-direction: column; gap: 2px; max-height: 340px; overflow-y: auto; padding: 2px; }
.tc-settings-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; position: sticky; top: 0; z-index: 1; padding-bottom: 5px; background: #fff; }
.tc-settings-title { padding: 3px 6px 6px; color: #171717; font-size: 11px; font-weight: 600; }
.tc-settings-all { border: 0; background: transparent; color: var(--ui-accent); font-size: 10px; cursor: pointer; }
.tc-settings-option { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: center; gap: 6px; min-height: 26px; padding: 3px 7px; border-radius: 7px; color: #444; font-size: 11px; cursor: pointer; }
.tc-settings-option:hover { background: var(--ui-fill); }
.tc-settings-option input { accent-color: var(--ui-accent); }
.tc-settings-option small { color: #a1a1a6; font-size: 9px; }
.tc-rebase-panel { max-height: 390px; }

/* 标签 */
.tc-tags-card { flex: 1; min-height: 0; display: flex; flex-direction: column; background: transparent; border: 0; border-radius: 0; overflow: hidden; }
.tc-tags-head { display: flex; align-items: center; justify-content: space-between; padding: 0 3px 8px 1px; border: 0; background: transparent; flex-shrink: 0; }
.tc-tags-title { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 650; color: #1d1d1f; letter-spacing: -0.01em; }
.tc-tags-title::before { width: 2px; height: 13px; border-radius: 1px; background: #1d1d1f; content: ""; flex: 0 0 auto; }
.tc-tags-count { font-family: inherit; font-size: 10px; color: #86868b; font-weight: 500; }
.tc-tags-search { padding: 0 0 10px; flex-shrink: 0; }
.tc-tags-search-input { width: 100%; height: 32px; padding: 0 6px; border: 0; border-radius: 0; font-size: 11px; outline: none; background: #fff; color: #1d1d1f; transition: color 0.2s ease, box-shadow 0.18s ease; box-sizing: border-box; }
.tc-tags-search-input:focus { border-color: transparent; background: #fff; box-shadow: inset 0 -1px 0 #1d1d1f; }
.tc-tags-search-input::placeholder { color: #c0c0c0; }
.tc-tags-body { flex: 1; overflow-y: auto; padding: 0 2px 12px; scrollbar-width: thin; scrollbar-color: #c7c7cc transparent; }
.tc-tag-main { margin-bottom: 18px; }
.tc-tag-main:last-child { margin-bottom: 0; }
.tc-tag-main-header { padding: 8px 2px 6px; border: 0; border-radius: 0; background: transparent; color: #1d1d1f; font-size: 12px; font-weight: 650; letter-spacing: -0.01em; }
.tc-tag-main-header:hover { background: transparent; }
.tc-tag-main-body { padding-left: 0; }
.tc-tag-category { margin-top: 10px; }
.tc-tag-category-name { margin-bottom: 4px; padding: 0 3px; border: 0; color: #86868b; font-size: 10px; font-weight: 550; letter-spacing: 0.03em; }
.tc-tag-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 6px; font-size: 11px; }
.tc-feature-option { display: inline-flex; align-items: center; min-width: 0; min-height: 27px; padding: 3px 6px; border-radius: 7px; color: #3a3a3c; cursor: pointer; transition: background 0.18s ease, color 0.18s ease; user-select: none; }
.tc-feature-option:hover:not(.disabled) { background: transparent; color: #000; }
.tc-feature-option.checked { background: transparent; color: #000; font-weight: 550; }
.tc-feature-option.disabled { background: transparent; color: #a1a1a6; cursor: not-allowed; opacity: 1; }
.tc-feature-option.disabled.needCond:hover { background: transparent; transform: none; }
.tc-feature-option.needCond:not(.ready) { color: #86868b; }
.tc-feature-option.needCond.ready { color: #1d1d1f; }
.tc-tag-checkbox { width: 12px; height: 12px; margin: 0; accent-color: #171717; cursor: pointer; flex-shrink: 0; }
.tc-tag-checkbox:disabled { cursor: not-allowed; opacity: 0.62; }
.tc-tag-name { min-width: 0; margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 450; color: inherit; }
.tc-tag-condition { margin-left: 4px; white-space: nowrap; color: #86868b; font-size: 8px; font-weight: 500; }
.tc-tags-empty { text-align: center; padding: 20px 0; color: rgba(0,0,0,0.15); font-size: 12px; }

/* ---- 右栏 ---- */
.tc-monitor-panel { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; gap: 0; padding: 0 18px 14px; overflow: hidden; background: var(--ui-canvas); }

.tc-monitor-tabs {
  display: flex;
  align-items: flex-end;
  gap: 34px;
  min-height: 58px;
  padding: 0 390px 0 10px;
  border-bottom: 1px solid #e6e9ef;
  flex: 0 0 auto;
}
.tc-monitor-tabs button {
  position: relative;
  height: 58px;
  padding: 0 0 2px;
  border: 0;
  background: transparent;
  color: #6e6e73;
  font-size: 12px;
  font-weight: 520;
  cursor: pointer;
}
.tc-monitor-tabs button:hover { color: #1d1d1f; }
.tc-monitor-tabs button.active { color: #1d1d1f; font-weight: 650; }
.tc-monitor-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: #1d1d1f;
  content: "";
}
.tc-monitor-tabs span { margin-left: 3px; color: #8e8e93; font-size: 10px; font-weight: 500; }

.tc-result-view { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 12px; padding: 16px 0 0; }

.tc-completion-toast {
  position: absolute;
  z-index: 30;
  top: 10px;
  right: 22px;
  display: grid;
  grid-template-columns: 24px minmax(120px, auto) auto 22px;
  align-items: center;
  gap: 9px;
  min-width: 360px;
  max-width: min(560px, calc(100% - 48px));
  min-height: 42px;
  padding: 7px 9px 7px 11px;
  border: 1px solid rgba(31, 38, 49, 0.08);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 28px rgba(25, 31, 40, 0.12);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}
.tc-toast-check { display: inline-grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #30b85a; color: #fff; font-size: 11px; font-weight: 700; }
.tc-toast-copy { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
.tc-toast-copy strong { color: #1d1d1f; font-size: 10px; font-weight: 650; }
.tc-toast-copy > span { max-width: 230px; overflow: hidden; color: #6e6e73; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.tc-toast-meta { color: #555960; font-size: 10px; white-space: nowrap; }
.tc-toast-close { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #a0a4ab; font-size: 15px; cursor: pointer; }
.tc-toast-close:hover { background: #f4f6f8; color: #1d1d1f; }
.tc-toast-enter-active,
.tc-toast-leave-active { transition: opacity 180ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
.tc-toast-enter-from,
.tc-toast-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }

.tc-empty-history { margin-top: 7px; padding: 7px 11px; border: 1px solid #d8dce3; border-radius: 8px; background: #fff; color: #1d1d1f; font-size: 10px; cursor: pointer; }
.tc-empty-history:hover { border-color: #8e939b; }

/* 完成摘要栏 */
.tc-done-bar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(52,199,89,0.05); border: 1px solid rgba(52,199,89,0.12); border-radius: 12px; flex-shrink: 0; }
.tc-done-icon { font-size: 16px; color: #34c759; font-weight: 700; }
.tc-done-name { font-size: 13px; font-weight: 550; color: #171717; }
.tc-done-meta { font-size: 12px; color: #86868b; flex: 1; }
.tc-done-meta strong { color: #171717; }
.tc-done-retry { font-size: 11px !important; color: #a1a1a6 !important; }

/* 失败栏 */
.tc-fail-bar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(255,59,48,0.04); border: 1px solid rgba(255,59,48,0.12); border-radius: 12px; flex-shrink: 0; }
.tc-fail-icon { font-size: 16px; color: #ff3b30; font-weight: 700; }
.tc-fail-name { font-size: 13px; font-weight: 550; color: #171717; }
.tc-fail-msg { font-size: 12px; color: #86868b; flex: 1; }
.tc-retry-btn { height: 28px !important; padding: 0 14px !important; border-radius: 8px !important; background: #ff3b30 !important; color: #fff !important; font-size: 11px !important; font-weight: 500 !important; border: none !important; flex-shrink: 0; }
.tc-retry-btn:hover { background: #ff544a !important; }

/* 进度卡片 */
.tc-progress-card { background: rgba(255,255,255,0.76); backdrop-filter: blur(14px) saturate(160%); -webkit-backdrop-filter: blur(14px) saturate(160%); border: 1px solid rgba(0,0,0,0.05); border-radius: 14px; padding: 16px 20px; flex-shrink: 0; }
.tc-progress-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.tc-progress-name { flex: 1; min-width: 0; }
.tc-progress-batch { padding: 2px 7px; border-radius: 20px; background: rgba(0,0,0,0.035); color: #6e6e73; font: 600 9px/1.4 "SF Mono", "Cascadia Code", ui-monospace; flex-shrink: 0; }
.tc-progress-name { font-size: 14px; font-weight: 500; color: #171717; }
.tc-progress-phase { font-size: 10px; font-weight: 600; padding: 3px 10px; border-radius: 20px; flex-shrink: 0; }
.tc-progress-phase.running { background: rgba(255,149,0,0.07); color: #ff9500; }
.tc-progress-phase.completed { background: rgba(52,199,89,0.07); color: #208a43; }
.tc-progress-phase.failed { background: rgba(255,59,48,0.07); color: #d32f2f; }

.tc-phase-bar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.tc-phase-step { display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1; position: relative; min-width: 0; }
.tc-phase-dot { width: 20px; height: 20px; border-radius: 50%; background: rgba(0,0,0,0.03); border: 2px solid rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; color: rgba(0,0,0,0.12); transition: all 0.3s ease; position: relative; z-index: 1; flex-shrink: 0; }
.tc-phase-step.done .tc-phase-dot { background: var(--ui-success); border-color: var(--ui-success); color: #ffffff; }
.tc-phase-step.current .tc-phase-dot { color: var(--ui-accent); background: var(--ui-surface); border-color: var(--ui-accent); box-shadow: 0 0 0 3px var(--ui-accent-ring); animation: phasePulse 1.6s ease-in-out infinite; }
@keyframes phasePulse { 0%,100% { box-shadow: 0 0 0 3px var(--ui-accent-ring); } 50% { box-shadow: 0 0 0 6px var(--ui-accent-ring); } }
.tc-phase-line { position: absolute; top: 10px; left: calc(50% + 3px); right: calc(-50% + 17px); height: 1px; background: rgba(0,0,0,0.04); z-index: 0; }
.tc-phase-step.done .tc-phase-line { background: #1d1d1f; }
.tc-phase-text { font-size: 8px; color: rgba(0,0,0,0.12); white-space: nowrap; text-align: center; font-weight: 500; }
.tc-phase-step.done .tc-phase-text, .tc-phase-step.current .tc-phase-text { color: rgba(0,0,0,0.35); }

.tc-progress-meter { height: 3px; background: rgba(0,0,0,0.03); border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
.tc-progress-fill { height: 100%; background: var(--ui-ink); border-radius: 2px; transition: width 0.5s cubic-bezier(0.16, 1, 0.30, 1); }
.tc-progress-desc { display: flex; align-items: center; gap: 10px; }
.tc-progress-pct { font-family: "SF Mono", "Cascadia Code", ui-monospace; font-size: 15px; font-weight: 500; color: #171717; }
.tc-progress-msg { font-size: 11px; color: #86868b; }

/* 结果卡片 — 可拖拽调整高度 */
.tc-results-card { background: rgba(255,255,255,0.76); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(0,0,0,0.05); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 320px; height: 460px; max-height: 85vh; resize: vertical; }
.tc-results-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-surface); flex-shrink: 0; }
.tc-results-title { font-size: 12px; font-weight: 550; color: #171717; }
.tc-results-total { font-size: 11px; color: #555; flex: 1; }
.tc-results-total strong { color: #171717; font-weight: 600; }
.tc-results-count { font-family: "SF Mono", "Cascadia Code", ui-monospace; font-size: 10px; color: var(--ui-accent); }
.tc-results-close { font-size: 12px !important; color: #a1a1a6 !important; min-width: 24px !important; padding: 0 !important; }
.tc-results-table-wrap { flex: 1; overflow: auto; padding: 0 14px; }
.tc-results-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10px; }
.tc-results-table thead { position: sticky; top: 0; z-index: 4; }
.tc-results-table th { background: var(--ui-surface, #fff); background-clip: padding-box; color: #333333; font-weight: 600; padding: 7px 6px; border-bottom: 2px solid #d9d9d9; white-space: nowrap; font-size: 10px; text-align: left; }
.tc-results-table td { padding: 3px 5px; border-bottom: 1px solid #f0f0f0; border-right: 1px solid #f0f0f0; color: #555; font-size: 10px; vertical-align: middle; }
.tc-results-table td:first-child { border-left: 1px solid #f0f0f0; }
.tc-results-table tr:first-child td { border-top: 1px solid #f0f0f0; }

.tc-row-enter { animation: rowReveal 0.35s cubic-bezier(0.16, 1, 0.30, 1) both; }
@keyframes rowReveal { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* 标签名称 — 按子分类着色，同大类不同深浅 */
.tc-tag-name-cell {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-weight: 500; font-size: 10px; white-space: nowrap;
}

/* 用户特征子分类 */
.tc-tag-name-cell.cat-user-0 { color: #0958D9; background: rgba(9,88,217,0.07); border-left: 2px solid #69B1FF; }
.tc-tag-name-cell.cat-user-1 { color: #1677CC; background: rgba(22,119,204,0.06); border-left: 2px solid #91CAFF; }
.tc-tag-name-cell.cat-user-2 { color: #2E62B3; background: rgba(46,98,179,0.06); border-left: 2px solid #B8D9FF; }
.tc-tag-name-cell.cat-user-3 { color: #0958D9; background: rgba(9,88,217,0.03); border-left: 2px solid #D6E8FF; }

/* 品类特征子分类 */
.tc-tag-name-cell.cat-product-0 { color: #D4380D; background: rgba(212,56,13,0.07); border-left: 2px solid #FF9C6E; }
.tc-tag-name-cell.cat-product-1 { color: #C41D08; background: rgba(196,29,8,0.06); border-left: 2px solid #FFBB96; }
.tc-tag-name-cell.cat-product-2 { color: #A81700; background: rgba(168,23,0,0.06); border-left: 2px solid #FFD8BF; }
.tc-tag-name-cell.cat-product-3 { color: #D4380D; background: rgba(212,56,13,0.03); border-left: 2px solid #FFECE0; }

/* 私域特征子分类 */
.tc-tag-name-cell.cat-private-0 { color: #531DAB; background: rgba(83,29,171,0.07); border-left: 2px solid #B37FEB; }
.tc-tag-name-cell.cat-private-1 { color: #722ED1; background: rgba(114,46,209,0.06); border-left: 2px solid #D3ADF7; }
.tc-tag-name-cell.cat-private-2 { color: #391085; background: rgba(57,16,133,0.06); border-left: 2px solid #EFDBFF; }
.tc-tag-name-cell.cat-private-3 { color: #531DAB; background: rgba(83,29,171,0.03); border-left: 2px solid #F9F0FF; }

/* 消费特征子分类 */
.tc-tag-name-cell.cat-consume-0 { color: #237804; background: rgba(35,120,4,0.07); border-left: 2px solid #73D13D; }
.tc-tag-name-cell.cat-consume-1 { color: #389E0D; background: rgba(56,158,13,0.06); border-left: 2px solid #95DE64; }
.tc-tag-name-cell.cat-consume-2 { color: #135200; background: rgba(19,82,0,0.06); border-left: 2px solid #B7EB8F; }
.tc-tag-name-cell.cat-consume-3 { color: #389E0D; background: rgba(56,158,12,0.03); border-left: 2px solid #D9F7BE; }

/* 默认 */
.tc-tag-name-cell.cat-default-0 { color: #595959; background: rgba(0,0,0,0.05); border-left: 2px solid #BFBFBF; }
.tc-tag-name-cell.cat-default-1 { color: #434343; background: rgba(0,0,0,0.03); border-left: 2px solid #D9D9D9; }

/* 分类标签 */
.tc-cat-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 600; white-space: nowrap; }
.tc-subcat-inline { font-weight: 400; opacity: 0.7; }
.tc-cat-tag.cat-user { background: #E6F4FF; color: #0958D9; border: 1px solid #91D5FF; }
.tc-cat-tag.cat-product { background: #FFF2E8; color: #D4380D; border: 1px solid #FFBB96; }
.tc-cat-tag.cat-private { background: #F9F0FF; color: #531DAB; border: 1px solid #D3ADF7; }
.tc-cat-tag.cat-consume { background: #F6FFED; color: #389E0D; border: 1px solid #B7EB8F; }
.tc-cat-tag.cat-default { background: #F5F5F5; color: #595959; border: 1px solid #D9D9D9; }
.tc-subcat-tag { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9px; background: #fff; border: 1px dashed; white-space: nowrap; }

.tc-heat-bar { position: relative; min-width: 55px; background: #f4f5f7; border-radius: 3px; overflow: hidden; padding: 2px 5px; height: 16px; display: flex; align-items: center; }
.tc-heat-fill { position: absolute; left: 0; top: 0; bottom: 0; transition: width 0.6s cubic-bezier(0.16, 1, 0.30, 1); }
.tc-heat-bar.pink .tc-heat-fill { background: rgba(255, 138, 152, 0.22); border-right: 2px solid rgba(255, 138, 152, 0.7); }
.tc-heat-bar.blue .tc-heat-fill { background: rgba(54, 193, 250, 0.22); border-right: 2px solid rgba(54, 193, 250, 0.7); }
.tc-heat-val { position: relative; z-index: 2; font-weight: 600; font-size: 9px; color: #444; }
.tc-warn { color: #FF4D6D; font-weight: bold; }
.tc-count-cell { color: #444; font-weight: 600; font-variant-numeric: tabular-nums; }
.tc-btn-copy, .tc-btn-csv { height: 26px !important; font-size: 10px !important; border-radius: 6px !important; padding: 0 10px !important; }
.tc-btn-copy { background: rgba(0,0,0,0.03) !important; color: #555 !important; border: 1px solid rgba(0,0,0,0.06) !important; }
.tc-btn-csv { color: var(--ui-ink) !important; background: var(--ui-surface) !important; border-color: var(--ui-control-border) !important; }

/* 空状态 */
.tc-empty-monitor { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.tc-empty-icon { font-size: 36px; color: rgba(0,0,0,0.04); }
.tc-empty-title { font-size: 14px; font-weight: 500; color: rgba(0,0,0,0.20); }
.tc-empty-desc { font-size: 11px; color: rgba(0,0,0,0.12); text-align: center; line-height: 1.5; }

/* 任务记录 */
.tc-history-card { flex: 1 1 0; min-height: 120px; display: flex; flex-direction: column; background: transparent; border: 0; border-radius: 0; padding: 12px 16px; overflow: hidden; transition: none; }
.tc-history-card.expanded { background: transparent; }
.tc-history-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-shrink: 0; }
.tc-history-title { font-size: 13px; font-weight: 550; color: #171717; }
.tc-history-clear { font-size: 10px !important; color: #a1a1a6 !important; }
.tc-history-clear:hover { color: #ff3b30 !important; }

.tc-history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
.tc-history-item { background: rgba(255,255,255,0.50); border: 1px solid rgba(0,0,0,0.025); border-radius: 10px; padding: 8px 10px; cursor: pointer; transition: all 0.22s ease; }
.tc-history-item:hover { background: rgba(255,255,255,0.85); border-color: rgba(0,0,0,0.06); }
.tc-history-item.expanded { background: rgba(255,255,255,0.90); border-color: rgba(0,0,0,0.06); }
.tc-history-item-main { display: flex; align-items: center; gap: 9px; }
.tc-history-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: #a1a1a6; }
.tc-history-status-dot.completed { background: var(--ui-success); }
.tc-history-status-dot.failed { background: var(--ui-danger); }
.tc-history-status-dot.running { background: var(--ui-warning); }
.tc-history-status-dot.cancelled { background: #a1a1a6; }

.tc-history-item-info { flex: 1; min-width: 0; }
.tc-history-item-name { font-size: 12px; font-weight: 500; color: #171717; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-history-item-time { font-size: 10px; color: #a1a1a6; margin-top: 1px; }
.tc-history-item-badge { font-size: 9px; font-weight: 600; padding: 2px 7px; border-radius: 20px; flex-shrink: 0; }
.tc-history-item-badge.completed { background: rgba(52,199,89,0.06); color: #208a43; }
.tc-history-item-badge.failed { background: rgba(255,59,48,0.06); color: #d32f2f; }
.tc-history-item-badge.running { background: rgba(255,149,0,0.06); color: #b87300; }
.tc-history-item-badge.cancelled { background: rgba(0,0,0,0.03); color: #a1a1a6; }
.tc-history-delete { font-size: 11px !important; color: #a1a1a6 !important; opacity: 0; transition: opacity 0.2s ease; min-width: 20px !important; padding: 0 !important; }
.tc-history-item:hover .tc-history-delete { opacity: 1; }
.tc-history-delete:hover { color: #ff3b30 !important; }

.tc-history-item-detail { margin-top: 7px; padding-top: 7px; border-top: 1px solid rgba(0,0,0,0.025); cursor: default; }
.tc-history-results { margin-top: 0; border: 1px solid rgba(0,0,0,0.04); border-radius: 8px; overflow: hidden; cursor: default; }
.tc-history-results-head { display: flex; align-items: center; gap: 8px; padding: 5px 9px; background: #fafafa; font-size: 10px; color: #555; }
.tc-history-results-head .tc-btn-copy,
.tc-history-results-head .tc-btn-csv { cursor: pointer; }
.tc-history-results-title { font-weight: 550; color: #171717; }
.tc-history-results-rows { font-family: "SF Mono", "Cascadia Code", ui-monospace; font-size: 9px; color: var(--ui-accent); margin-left: auto; }
.tc-history-table-wrap { min-height: 260px; height: 360px; max-height: 70vh; overflow: auto; padding: 0 8px 4px; resize: vertical; }

.tc-history-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(0,0,0,0.10); font-size: 11px; }

.task-center-page button,
.task-center-page .el-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.task-center-page button:disabled,
.task-center-page .el-button.is-disabled {
  background: var(--ui-surface) !important;
  color: var(--ui-text-secondary) !important;
  border: 1px solid var(--ui-control-border) !important;
  opacity: 1;
  box-shadow: none !important;
  transform: none !important;
}

@media (max-width: 1120px) {
  .task-center-page { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .tc-control-panel { border-right: 0; border-bottom: 0; }
  .panel-resize-handle { display: none; }
  .tc-monitor-tabs { padding-right: 10px; }
  .tc-completion-toast { top: 64px; }
}
</style>
