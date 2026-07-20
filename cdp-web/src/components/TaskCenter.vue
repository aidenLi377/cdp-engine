<template>
  <div class="task-center-page">
    <!-- 左栏：控制台 -->
    <aside class="tc-control-panel">
      <!-- 扩展状态 -->
      <div class="tc-ext-status" :class="{ connected: extConnected }">
        <div class="tc-ext-dot"></div>
        <span class="tc-ext-label">{{ extConnected ? '扩展已连接' : '扩展未连接' }}</span>
        <span class="tc-ext-hint" v-if="!extConnected">请加载扩展</span>
      </div>

      <!-- 测试任务（上下排列） -->
      <div class="tc-test-row">
        <div class="tc-test-col">
          <div class="tc-test-label">数据引擎</div>
          <div class="tc-test-controls">
            <el-input v-model="databankCrowd" placeholder="人群包名称" size="default" class="tc-input-sm" clearable />
            <el-button v-if="taskRunning !== 'databank'" class="tc-btn-sm" :disabled="!canRunDatabank" @click="runDatabank">运行</el-button>
            <el-button v-else class="tc-btn-sm is-cancel" @click="cancelTask">取消</el-button>
          </div>
        </div>
        <div class="tc-test-col">
          <div class="tc-test-label">达摩盘</div>
          <div class="tc-test-controls">
            <el-input v-model="dmpCrowd" placeholder="人群包名称" size="default" class="tc-input-sm" clearable />
            <el-button v-if="taskRunning !== 'dmp'" class="tc-btn-sm is-dmp" :disabled="!canRunDmp" @click="runDmp">运行</el-button>
            <el-button v-else class="tc-btn-sm is-cancel" @click="cancelTask">取消</el-button>
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
      <section class="tc-tags-card">
        <div class="tc-tags-head">
          <span class="tc-tags-title">🎛️ 特征大盘</span>
          <span class="tc-tags-count">{{ selectedTags.length }} 个</span>
        </div>
        <div class="tc-tags-search">
          <input v-model="tagSearch" placeholder="搜索标签…" class="tc-tags-search-input" />
        </div>
        <div class="tc-tags-body">
          <template v-for="group in filteredTagGroups" :key="group.mainCategory">
            <div class="tc-tag-main" v-if="group.categories.some(category => category.tags.length)">
              <div class="tc-tag-main-header">📂 {{ group.mainCategory }}</div>
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
                      :class="{ checked: selectedTags.includes(tag.tagId), disabled: !isTagSelectable(tag), needCond: tag.needCondition, ready: tag.needCondition && isConditionalTagReady(tag, dmpSettings.readyTagIds) }"
                      :title="tag.annotation || (!isTagSelectable(tag) ? '请先在 DMP 页面配置该标签的下钻条件' : '')"
                    >
                      <input class="tc-tag-checkbox" type="checkbox" :value="tag.tagId" :disabled="!isTagSelectable(tag)" v-model="selectedTags" />
                      <span class="tc-tag-name">{{ tag.tagName }}</span>
                      <span class="tc-tag-condition" v-if="tag.needCondition">
                        {{ isConditionalTagReady(tag, dmpSettings.readyTagIds) ? '✅(已就绪)' : '⚙️' }}
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
    </aside>

    <!-- 右栏：监控台 -->
    <main class="tc-monitor-panel">
      <!-- 任务完成摘要栏 -->
      <section class="tc-done-bar" v-if="activeTask && activeTask.status === 'completed' && activeTask.hasResults">
        <span class="tc-done-icon">&#10003;</span>
        <span class="tc-done-name">{{ activeTask.name }}</span>
        <span class="tc-done-meta" v-if="taskResults && taskResults.length">覆盖 <strong>{{ (crowdCount || 0).toLocaleString() }}</strong> 人 · {{ taskResults.length }} 行</span>
        <el-button size="small" class="tc-done-retry" text @click="activeTask = null; taskResults = null; crowdCount = null">关闭</el-button>
      </section>

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

      <section class="tc-empty-monitor" v-else-if="!activeTask && taskHistory.length === 0">
        <div class="tc-empty-icon">&#9674;</div>
        <div class="tc-empty-title">等待任务发起</div>
        <div class="tc-empty-desc">输入人群包名称并点击运行，任务进度将在此处实时展示。</div>
      </section>

      <!-- 任务记录 -->
      <section class="tc-history-card" :class="{ expanded: expandedHistory !== -1 }">
        <div class="tc-history-header">
          <span class="tc-history-title">任务记录</span>
          <el-button size="small" text class="tc-history-clear" @click="clearHistory" v-if="taskHistory.length > 0">清空</el-button>
        </div>
        <div class="tc-history-list" v-if="taskHistory.length > 0">
          <div v-for="(task, idx) in taskHistory" :key="idx" class="tc-history-item" :class="{ expanded: expandedHistory === idx }" @click="expandedHistory = expandedHistory === idx ? -1 : idx">
            <div class="tc-history-item-main">
              <div class="tc-history-status-dot" :class="task.status"></div>
              <div class="tc-history-item-info">
                <div class="tc-history-item-name">{{ task.name }}</div>
                <div class="tc-history-item-time">{{ task.time }}</div>
              </div>
              <div class="tc-history-item-badge" :class="task.status">{{ statusLabel(task.status) }}</div>
              <el-button size="small" class="tc-history-delete" text @click.stop="deleteHistoryItem(idx)">✕</el-button>
            </div>
            <div class="tc-history-item-detail" v-if="expandedHistory === idx">
              <div class="tc-history-results" v-if="task.status === 'completed' && task.results && task.results.length">
                <div class="tc-history-results-head">
                  <span class="tc-history-results-title">透视结果</span>
                  <span class="tc-history-results-total">覆盖 {{ task.crowdCount ? task.crowdCount.toLocaleString() : '—' }} 人</span>
                  <span class="tc-history-results-rows">{{ task.results.length }} 行</span>
                  <el-button size="small" class="tc-btn-copy" @click.stop="copyResultsFrom(task.results)">复制</el-button>
                  <el-button size="small" class="tc-btn-csv" @click.stop="exportCsvFrom(task.results)">导出</el-button>
                </div>
                <div class="tc-history-table-wrap">
                  <table class="tc-results-table">
                    <thead><tr><th v-for="key in historyColumns(task.results)" :key="key">{{ key }}</th></tr></thead>
                    <tbody>
                      <tr v-for="(row, ri) in normalizeResultRows(task.results)" :key="ri" :class="['tc-row-cat-' + catClass(row['所属大类'])]">
                        <td v-for="key in historyColumns(task.results)" :key="key">
                          <span v-if="key === '所属大类'" :class="['tc-cat-tag', catClass(row[key])]">{{ row[key] }}</span>
                          <span v-else-if="key === '标签类型'" class="tc-subcat-tag" :style="subcatStyle(row)">{{ row[key] }}</span>
                          <div v-else-if="(key === '人群占比' || key === 'Rebase') && row[key] !== '-' && String(row[key]).includes('%')" class="tc-heat-bar" :class="{ pink: key === '人群占比', blue: key === 'Rebase' }">
                            <div class="tc-heat-fill" :style="{ width: Math.min(parseFloat(row[key]) || 0, 100) + '%' }"></div>
                            <span class="tc-heat-val">{{ formatPercentageForDisplay(row[key]) }}</span>
                          </div>
                          <span v-else-if="key === '标签名称'" :class="['tc-tag-name-cell', tagNameClass(row, task.results)]">{{ row[key] }}</span>
                          <span v-else-if="(key === '覆盖人数' || key === 'Rebase后人数') && row[key] !== '-'" class="tc-count-cell">{{ Number(row[key]).toLocaleString('zh-CN') }}</span>
                          <span v-else :class="{ 'tc-warn': String(row[key]).includes('⚠️') || String(row[key]).includes('❌') }">{{ row[key] }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tc-history-empty" v-else><span>暂无任务记录</span></div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
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
import { fetchWithTimeout } from '../utils/apiClient.js'

const API = '/api/tasks'

// -- persistence --
function loadPersisted(k, def) { try { const v = localStorage.getItem('cdp_task_' + k); return v ? JSON.parse(v) : def } catch { return def } }
function savePersisted(k, val) { try { localStorage.setItem('cdp_task_' + k, JSON.stringify(val)) } catch { /* */ } }

const databankCrowd = ref(loadPersisted('databankCrowd', ''))
const dmpCrowd = ref(loadPersisted('dmpCrowd', ''))
const selectedTags = ref(loadPersisted('selectedTags', ['160571', '114555', '114554', '213510', '150663']))
const tagSearch = ref('')

watch(databankCrowd, (v) => savePersisted('databankCrowd', v))
watch(dmpCrowd, (v) => savePersisted('dmpCrowd', v))
watch(selectedTags, (v) => savePersisted('selectedTags', v), { deep: true })

const extConnected = ref(false)
const taskRunning = ref(null)
const activeTask = ref(null)
const taskCancelled = ref(false)
const taskResults = ref(null)
const crowdCount = ref(null)
const taskHistory = ref([])
const expandedHistory = ref(-1)
const dmpSettings = ref(normalizeDmpSettings())
const dmpSettingsSyncing = ref(false)
const dmpSettingsLoaded = ref(false)

const databankPhases = ['已发起任务', '正在打开页面', '正在搜索人群包', '正在精准匹配', '已匹配成功', '正在选择渠道', '正在选择平台', '等待人工确认', '自动流程已完成']
const dmpPhases = ['已发起任务', '正在打开页面', '正在搜索人群包', '正在精准匹配', '已匹配成功', '正在判断人群数据是否同步好', '正在等待入口', '已进入透视', '正在获取数据', '已完成']
const phases = ref(dmpPhases)

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

const canRunDatabank = computed(() => extConnected.value && databankCrowd.value.trim() && taskRunning.value === null && selectedTags.value.length > 0)
const canRunDmp = computed(() => extConnected.value && dmpCrowd.value.trim() && taskRunning.value === null && selectedTags.value.length > 0)

function phaseLabel(s) { return { running: '执行中', completed: '已完成', failed: '执行失败' }[s] || s }
function statusLabel(s) { return { completed: '已完成', failed: '失败', cancelled: '已取消', running: '进行中' }[s] || s }

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

function clearResults() { taskResults.value = null; crowdCount.value = null }

// -- API --
async function apiPost(path, body) {
  const res = await fetchWithTimeout(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '请求失败')
  return res.json()
}
async function apiPut(path, body) {
  const res = await fetchWithTimeout(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error('更新失败')
  return res.json()
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
    }
  } catch { /* */ }
}
async function deleteHistoryItem(idx) {
  const task = taskHistory.value[idx]
  if (!task) return
  if (task.id) { try { await fetchWithTimeout(`${API}/${task.id}`, { method: 'DELETE' }) } catch { /* */ } }
  taskHistory.value.splice(idx, 1)
  if (expandedHistory.value === idx) expandedHistory.value = -1
}

async function clearHistory() {
  try { await Promise.all(taskHistory.value.map(t => fetchWithTimeout(`${API}/${t.id}`, { method: 'DELETE' }).catch(() => {}))) } catch { /* */ }
  taskHistory.value = []; expandedHistory.value = -1
}

// -- Extension --
let extRequestId = 0
function sendToExtension(msgType, payload) {
  return new Promise((resolve, reject) => {
    const requestId = ++extRequestId
    const settingsMessage = msgType === 'CDP_DMP_GET_SETTINGS' || msgType === 'CDP_DMP_UPDATE_SETTINGS'
    const timeoutMs = settingsMessage ? 10000 : msgType === 'CDP_AUTOMATE_DATABANK_WAIT_APPLY' ? 2100000 : msgType === 'CDP_AUTOMATE_DATABANK_DATAHUB' ? 420000 : msgType === 'CDP_AUTOMATE_DMP_WAIT_PORTRAIT' ? 2100000 : 300000
    const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('插件响应超时，请刷新页面后重试')) }, timeoutMs)
    const handler = (e) => {
      if (e.data?.source === 'databank-extension-bridge' && e.data?.requestId === requestId) {
        clearTimeout(timeout); window.removeEventListener('message', handler)
        if (e.data?.ok) resolve(e.data); else reject(new Error(e.data?.error || '扩展执行失败'))
      }
    }
    window.addEventListener('message', handler)
    window.postMessage({ source: 'cdp-web', type: msgType, requestId, ...payload }, window.location.origin)
  })
}

function updateProgress(phaseIndex, message) {
  if (!activeTask.value || taskCancelled.value) return
  const p = phases.value
  const pct = Math.round(((phaseIndex + 1) / p.length) * 100)
  const crowdName = activeTask.value.crowdName
  const fullMsg = crowdName ? message.replace('人群包', `「${crowdName}」`) : message
  activeTask.value = { ...activeTask.value, phaseIndex, progress: pct, message: fullMsg, status: 'running' }
  if (activeTask.value.id) { apiPut(`${API}/${activeTask.value.id}/progress`, { status: 'running', phase: phaseIndex, phaseLabel: fullMsg, progress: pct, message: fullMsg }).catch(() => {}) }
}

function advancePhasesFromTrail(trail, trailToPhase) {
  if (!trail) return
  let lastPhase = 1
  for (const step of trail) {
    const phaseIdx = trailToPhase[step.step]
    if (phaseIdx !== undefined) {
      for (let p = lastPhase + 1; p <= phaseIdx; p++) updateProgress(p, phases.value[p])
      lastPhase = phaseIdx
    }
  }
}

async function executeDatabank(crowdName) {
  // Phase 1: search → match → apply → select channel → select platform → show confirm dialog
  const phase1 = await sendToExtension('CDP_AUTOMATE_DATABANK_CROWD', { crowdName })
  if (!phase1.ok) throw new Error(phase1.error || '数据引擎执行失败')
  advancePhasesFromTrail(phase1.trail, { 'searched': 2, 'matched': 3, 'clicked_apply': 4, 'selected_alimama': 5, 'selected_dmp': 6, 'confirm_dialog_found': 7 })
  if (!phase1.trail?.some((item) => item.step === 'confirm_dialog_found')) {
    throw new Error('未检测到应用确认弹窗，请返回 DataBank 页面重试')
  }

  return phase1
}

async function executeDmp(crowdName) {
  const settingsReady = await loadDmpSettings(true)
  if (!settingsReady) throw new Error('无法同步 DMP 设置，请重新加载新版合并插件')
  if (selectedTags.value.length === 0) throw new Error('请选择至少一个已就绪的标签')

  // Phase 1: search → match on crowd list page
  const phase1 = await sendToExtension('CDP_AUTOMATE_DMP', { crowdName })
  if (!phase1.ok) throw new Error(phase1.error || '搜索匹配失败')
  advancePhasesFromTrail(phase1.trail, { 'searched': 2, 'matched': 3, 'row_expanded': 4 })
  if (!phase1.crowdId) throw new Error('搜索匹配完成但未能提取人群ID（crowdId），无法进入透视')

  // Phase 2: wait for portrait entry to appear (up to 30 min, updates progress)
  updateProgress(5, '正在判断人群数据是否同步好…')

  const phase2 = await sendToExtension('CDP_AUTOMATE_DMP_WAIT_PORTRAIT', { phase1Result: JSON.parse(JSON.stringify(phase1)) })
  if (!phase2.ok) throw new Error(phase2.error || '等待画像透视入口超时')
  updateProgress(6, phases.value[6]); await new Promise(r => setTimeout(r, 500))

  // Phase 3: navigate to portrait page → extract data
  updateProgress(7, phases.value[7])

  const phase3 = await sendToExtension('CDP_AUTOMATE_DMP_EXTRACT', { phase1Result: JSON.parse(JSON.stringify(phase1)), selectedTags: orderedSelectedTagIds.value })
  if (!phase3.ok) throw new Error(phase3.error || '数据提取失败')
  advancePhasesFromTrail(phase3.trail, { 'entered_portrait': 7, 'payload_intercepted': 8, 'data_extracted': 8 })
  return phase3
}

async function executeViaExtension(crowdName, type) {
  phases.value = type === 'databank' ? databankPhases : dmpPhases
  const taskMeta = { name: `${type === 'databank' ? '数据引擎' : '达摩盘'} · ${crowdName}`, type, crowdName, tagIds: orderedSelectedTagIds.value }
  let backendTask = null; try { backendTask = await apiPost(API, taskMeta) } catch { /* */ }

  activeTask.value = { id: backendTask?.id || null, ...taskMeta, tagCount: selectedTags.value.length, status: 'running', phaseIndex: 0, progress: 0, message: '任务已发起，正在连接...', hasResults: false }

  try {
    updateProgress(0, phases.value[0]); await new Promise(r => setTimeout(r, 800))
    updateProgress(1, phases.value[1])

    let result
    if (type === 'databank') { result = await executeDatabank(crowdName) }
    else { result = await executeDmp(crowdName) }

    const finalPhase = phases.value.length - 1
    const completionLabel = type === 'databank' ? '自动流程已完成' : '任务执行完成'
    const completionMessage = type === 'databank'
      ? '确认弹窗已打开，请前往 DataBank 页面人工点击“应用”'
      : '任务执行完成'
    updateProgress(finalPhase, completionMessage)
    const hasResults = result?.results && result.results.length > 0
    const orderedResults = hasResults ? normalizeResultRows(result.results) : null
    activeTask.value = { ...activeTask.value, status: 'completed', hasResults }
    if (hasResults) { taskResults.value = orderedResults; crowdCount.value = result.crowdCount || null }
    if (backendTask?.id) { apiPut(`${API}/${backendTask.id}/progress`, { status: 'completed', phase: finalPhase, phaseLabel: completionLabel, progress: 100, message: completionMessage, result: hasResults ? orderedResults : result, crowdCount: crowdCount.value }).catch(() => {}) }
  } catch (err) {
    if (taskCancelled.value) { taskRunning.value = null; return }
    if (activeTask.value) {
      const friendlyMsg = userError(err.message || '执行失败')
      activeTask.value = { ...activeTask.value, status: 'failed', message: friendlyMsg }
      if (backendTask?.id) { apiPut(`${API}/${backendTask.id}/progress`, { status: 'failed', phase: activeTask.value.phaseIndex, phaseLabel: friendlyMsg, progress: activeTask.value.progress, message: friendlyMsg }).catch(() => {}) }
    }
  }

  const task = activeTask.value
  if (task) {
    taskHistory.value.unshift({ ...task, time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }), results: taskResults.value ? [...taskResults.value] : null, crowdCount: crowdCount.value })
    if (taskHistory.value.length > 50) taskHistory.value.length = 50
  }
  expandedHistory.value = -1 // collapse all history on new entry
  taskRunning.value = null
}

function cancelTask() {
  taskCancelled.value = true
  window.postMessage({ source: 'cdp-web', type: 'CDP_AUTOMATE_DATABANK_CROWD', requestId: 'cancel_' + Date.now(), crowdName: '__CANCEL__' }, window.location.origin)
  const task = activeTask.value
  if (task) { taskHistory.value.unshift({ ...task, status: 'cancelled', message: '用户取消', time: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }), results: null, crowdCount: null }) }
  activeTask.value = null; taskRunning.value = null; taskResults.value = null; crowdCount.value = null; expandedHistory.value = -1
}

async function runDatabank() {
  if (!extConnected.value) { ElMessage.error('任务执行器未连接，请先安装或启用 Chrome 扩展'); return }
  if (!canRunDatabank.value) return
  const n = databankCrowd.value.trim()
  taskRunning.value = 'databank'; taskCancelled.value = false
  await executeViaExtension(n, 'databank')
}

async function runDmp() {
  if (!extConnected.value) { ElMessage.error('任务执行器未连接，请先安装或启用 Chrome 扩展'); return }
  if (!canRunDmp.value) return
  const n = dmpCrowd.value.trim()
  taskRunning.value = 'dmp'; taskCancelled.value = false
  await executeViaExtension(n, 'dmp')
}

function retryTask() {
  const task = activeTask.value; if (!task) return
  if (task.type === 'databank') { databankCrowd.value = task.crowdName; runDatabank() }
  else { dmpCrowd.value = task.crowdName; runDmp() }
}

async function checkExtension() {
  try {
    const wasConnected = extConnected.value
    const ok = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 1200)
      const h = (e) => { if (e.data?.source === 'databank-extension-bridge' && e.data?.ok) { clearTimeout(t); resolve(true) } }
      window.addEventListener('message', h, { once: false })
      window.postMessage({ source: 'cdp-web', type: 'CDP_AUTOMATE_DATABANK', requestId: 'ping', jsonText: '{}' }, window.location.origin)
      setTimeout(() => { window.removeEventListener('message', h); clearTimeout(t); resolve(false) }, 1300)
    })
    extConnected.value = ok
    if (ok && (!wasConnected || !dmpSettingsLoaded.value)) await loadDmpSettings(true)
  } catch { extConnected.value = false }
}

onMounted(async () => { loadHistory(); await checkExtension(); setInterval(checkExtension, 15000) })
</script>

<style scoped>
/* ============================================================ */
/*  Task Center — Precision Control Room                         */
/* ============================================================ */

.task-center-page {
  flex: 1; display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  height: 100%; min-height: 0; overflow: hidden;
  background: var(--ui-canvas);
}

/* ---- 左栏 ---- */
.tc-control-panel {
  display: flex; flex-direction: column; gap: 6px;
  padding: 18px 18px 14px;
  background: var(--ui-fill);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-right: 1px solid var(--ui-divider);
  overflow: hidden;
}

.tc-ext-status {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 10px; border-radius: 8px; font-size: 11px;
  background: rgba(255,59,48,0.04); border: 1px solid rgba(255,59,48,0.10);
  transition: all 0.35s ease; flex-shrink: 0;
}
.tc-ext-status.connected { background: rgba(52,199,89,0.03); border-color: rgba(52,199,89,0.10); }
.tc-ext-dot { width: 7px; height: 7px; border-radius: 50%; background: #ff3b30; box-shadow: 0 0 0 2px rgba(255,59,48,0.10); flex-shrink: 0; transition: all 0.3s ease; }
.tc-ext-status.connected .tc-ext-dot { background: #34c759; box-shadow: 0 0 0 2px rgba(52,199,89,0.10), 0 0 8px rgba(52,199,89,0.20); }
.tc-ext-label { font-weight: 500; color: #171717; }
.tc-ext-hint { color: #ff3b30; }

.tc-test-row { display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; }
.tc-test-col { background: var(--ui-surface); border: 1px solid var(--ui-divider); border-radius: 10px; padding: 7px 10px; transition: border-color 0.25s ease; }
.tc-test-col:focus-within { border-color: var(--ui-accent); }
.tc-test-label { font-size: 10px; font-weight: 600; color: #a1a1a6; margin-bottom: 4px; letter-spacing: 0.04em; }
.tc-test-controls { display: flex; gap: 6px; align-items: center; }
.tc-input-sm { flex: 1; min-width: 0; }
.tc-input-sm :deep(.el-input__wrapper) { background: rgba(0,0,0,0.015); border: 1px solid rgba(0,0,0,0.05); border-radius: 8px; box-shadow: none !important; padding: 0 10px; height: 32px; font-size: 12px; }
.tc-input-sm :deep(.el-input__wrapper:hover) { border-color: rgba(0,0,0,0.10); }
.tc-input-sm :deep(.el-input__wrapper.is-focus) { background: var(--ui-surface); border-color: var(--ui-accent); box-shadow: 0 0 0 3px var(--ui-accent-ring) !important; }
.tc-input-sm :deep(.el-input__inner) { font-size: 12px; }

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
.tc-btn-sm:disabled { background: var(--ui-surface) !important; color: var(--ui-text-secondary) !important; border: 1px solid var(--ui-control-border) !important; opacity: 1; box-shadow: none !important; transform: none !important; }
.tc-btn-sm.is-cancel { background: #ff3b30 !important; }
.tc-btn-sm.is-cancel:hover { background: #ff544a !important; }

.tc-dmp-tools { display: flex; align-items: center; gap: 5px; padding: 2px 1px; flex-shrink: 0; }
.tc-dmp-tools-label { margin-right: auto; font-size: 10px; font-weight: 600; color: #a1a1a6; letter-spacing: 0.04em; }
.tc-settings-btn { height: 26px; padding: 0 9px; border: 1px solid rgba(0,0,0,0.06); border-radius: 7px; background: rgba(255,255,255,0.72); color: #4b4b4f; font-size: 10px; cursor: pointer; transition: all 0.18s ease; }
.tc-settings-btn:hover:not(:disabled) { color: var(--ui-accent); border-color: var(--ui-control-border); background: var(--ui-surface); }
.tc-settings-btn:disabled { background: var(--ui-surface); color: var(--ui-text-secondary); border-color: var(--ui-control-border); opacity: 1; box-shadow: none; transform: none; cursor: not-allowed; }
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
.tc-tags-card { flex: 1; min-height: 0; display: flex; flex-direction: column; background: rgba(255,255,255,0.74); border: 1px solid rgba(0,0,0,0.05); border-radius: 14px; overflow: hidden; }
.tc-tags-head { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-bottom: 1px solid var(--ui-divider); background: var(--ui-surface); flex-shrink: 0; }
.tc-tags-title { font-size: 12px; font-weight: 550; color: #171717; }
.tc-tags-count { font-family: "SF Mono", "Cascadia Code", ui-monospace; font-size: 10px; color: var(--ui-accent); font-weight: 600; }
.tc-tags-search { padding: 6px 10px; flex-shrink: 0; }
.tc-tags-search-input { width: 100%; padding: 6px 10px; border: 1px solid rgba(0,0,0,0.06); border-radius: 8px; font-size: 11px; outline: none; background: rgba(0,0,0,0.015); color: #333; transition: border-color 0.2s ease; box-sizing: border-box; }
.tc-tags-search-input:focus { border-color: var(--ui-accent); background: var(--ui-surface); box-shadow: 0 0 0 3px var(--ui-accent-ring); }
.tc-tags-search-input::placeholder { color: #c0c0c0; }
.tc-tags-body { flex: 1; overflow-y: auto; padding: 6px 12px 12px; }
.tc-tag-main { margin-bottom: 15px; }
.tc-tag-main:last-child { margin-bottom: 0; }
.tc-tag-main-header { padding: 10px 14px; border-left: 4px solid #171717; border-radius: 0 6px 6px 0; background: #f8f9fa; color: #333; font-size: 13px; font-weight: 600; transition: background 0.2s ease; }
.tc-tag-main-header:hover { background: #f1f3f5; }
.tc-tag-main-body { padding-left: 10px; }
.tc-tag-category { margin-top: 10px; }
.tc-tag-category-name { margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px dashed #eee; color: #888; font-size: 12px; font-weight: 700; }
.tc-tag-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: 11px; }
.tc-feature-option { display: inline-flex; align-items: center; min-width: 0; padding: 3px 6px; border-radius: 4px; color: #444; cursor: pointer; transition: background 0.2s ease; user-select: none; }
.tc-feature-option:hover:not(.disabled) { background: #f4f5f7; }
.tc-feature-option.checked { background: transparent; }
.tc-feature-option.disabled { background: transparent; color: #ff4d6d; cursor: not-allowed; opacity: 1; }
.tc-feature-option.disabled.needCond:hover { background: transparent; transform: none; }
.tc-feature-option.needCond:not(.ready) { color: #ff4d6d; }
.tc-feature-option.needCond.ready { color: #28a745; }
.tc-tag-checkbox { width: 13px; height: 13px; margin: 0; accent-color: #171717; cursor: pointer; flex-shrink: 0; }
.tc-tag-checkbox:disabled { cursor: not-allowed; opacity: 0.62; }
.tc-tag-name { min-width: 0; margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 450; color: inherit; }
.tc-tag-condition { margin-left: 4px; white-space: nowrap; font-size: 9px; font-weight: 600; }
.tc-tags-empty { text-align: center; padding: 20px 0; color: rgba(0,0,0,0.15); font-size: 12px; }

/* ---- 右栏 ---- */
.tc-monitor-panel { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 18px 24px; overflow-y: auto; background: var(--ui-canvas); }

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
.tc-progress-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
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
.tc-history-card { flex: 1 1 0; min-height: 120px; display: flex; flex-direction: column; background: rgba(255,255,255,0.60); border: 1px solid rgba(0,0,0,0.03); border-radius: 14px; padding: 12px 16px; overflow: hidden; transition: all 0.3s ease; }
.tc-history-card.expanded { background: rgba(255,255,255,0.76); }
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
  .tc-control-panel { border-right: none; border-bottom: 1px solid rgba(0,0,0,0.06); }
}
</style>
