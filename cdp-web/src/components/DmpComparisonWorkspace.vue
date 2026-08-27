<template>
  <section
    class="dc-workspace"
    :class="[`is-${mode}`, { 'history-collapsed': mode === 'comparison' && historyCollapsed }]"
  >
    <button
      v-if="mode === 'comparison'"
      type="button"
      class="dc-history-toggle"
      :aria-expanded="!historyCollapsed"
      aria-controls="dmp-task-history"
      :aria-label="historyCollapsed ? '展开任务记录' : '隐藏任务记录'"
      :title="historyCollapsed ? '展开任务记录' : '隐藏任务记录，为横向对比留出更多空间'"
      @click="$emit('update:historyCollapsed', !historyCollapsed)"
    >
      <svg :class="{ reversed: historyCollapsed }" viewBox="0 0 20 20" aria-hidden="true">
        <path d="m12.5 5-5 5 5 5"></path>
      </svg>
    </button>

    <aside
      id="dmp-task-history"
      class="dc-history-rail"
      :aria-hidden="mode === 'comparison' && historyCollapsed"
    >
      <div class="dc-history-head">
        <div>
          <strong>任务记录</strong>
          <span>{{ tasks.length }}</span>
        </div>
        <button v-if="tasks.length" type="button" class="dc-quiet-action" @click="$emit('clear-history')">清空</button>
      </div>

      <label class="dc-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>
        <input
          :value="historyQuery"
          type="search"
          placeholder="搜索任务名称…"
          @input="$emit('update:historyQuery', $event.target.value)"
        />
      </label>

      <div v-if="mode === 'history' && filteredEntries.length" class="dc-history-columns" aria-hidden="true">
        <span>人群包</span>
        <span>采集时间</span>
        <span>数据量</span>
        <span>状态</span>
        <span>横向对比</span>
        <span></span>
      </div>

      <div v-if="filteredEntries.length" class="dc-history-list">
        <article
          v-for="entry in filteredEntries"
          :key="entry.key"
          class="dc-history-row"
          :class="{
            selected: selectedOrder(entry.key) > 0,
            incompatible: isIncompatible(entry),
          }"
        >
          <button type="button" class="dc-history-open" @click="$emit('view-task', entry.task)">
            <span class="dc-status-dot" :class="entry.task.status" aria-hidden="true"></span>
            <span class="dc-history-copy">
              <strong :title="taskDisplayName(entry.task)">{{ taskDisplayName(entry.task) }}</strong>
              <span>
                {{ entry.task.time || '—' }}
                <i v-if="hasResults(entry.task)">· {{ entry.task.results.length }} 行</i>
              </span>
            </span>
          </button>

          <span v-if="mode === 'history'" class="dc-history-time">{{ entry.task.time || '—' }}</span>
          <span v-if="mode === 'history'" class="dc-history-size">
            {{ hasResults(entry.task) ? `${entry.task.results.length} 行` : '—' }}
          </span>

          <button
            v-if="isIncompatible(entry)"
            type="button"
            class="dc-compatibility"
            @click="showCompatibility(entry)"
          >标签不一致</button>
          <span v-else class="dc-task-status" :class="entry.task.status">{{ statusLabel(entry.task.status) }}</span>

          <button
            type="button"
            class="dc-selector"
            :class="{ selected: selectedOrder(entry.key) > 0 }"
            :disabled="!isSelectable(entry.task) && selectedOrder(entry.key) === 0"
            :aria-pressed="selectedOrder(entry.key) > 0"
            :aria-label="selectionLabel(entry)"
            :title="selectionHint(entry)"
            @click="toggleTask(entry)"
          >
            <span v-if="selectedOrder(entry.key) > 0">{{ selectedOrder(entry.key) }}</span>
          </button>

          <button
            type="button"
            class="dc-delete"
            :aria-label="`删除 ${taskDisplayName(entry.task)}`"
            title="删除任务记录"
            @click="$emit('delete-task', entry.index)"
          >×</button>
        </article>
      </div>

      <div v-else class="dc-history-empty">
        <span>{{ tasks.length ? '没有匹配的任务' : '暂无任务记录' }}</span>
      </div>
    </aside>

    <section v-if="mode === 'comparison'" class="dc-comparison-canvas">
      <template v-if="selectedEntries.length">
        <header class="dc-comparison-head">
          <div>
            <p>横向对比</p>
            <h2>已选择 {{ selectedEntries.length }} 个人群包</h2>
          </div>
          <button type="button" class="dc-quiet-action" @click="clearSelection">清空</button>
        </header>

        <div class="dc-package-strip" aria-label="已选择的人群包，拖动可调整顺序">
          <button
            v-for="(entry, index) in selectedEntries"
            :key="entry.key"
            type="button"
            class="dc-package-chip"
            draggable="true"
            :title="`${taskDisplayName(entry.task)}；拖动可调整列顺序`"
            @dragstart="startDrag(entry.key, $event)"
            @dragover.prevent
            @drop="dropBefore(entry.key)"
          >
            <span>{{ index + 1 }}</span>
            <strong>{{ taskDisplayName(entry.task) }}</strong>
            <i aria-hidden="true" @click.stop="removeTask(entry.key)">×</i>
          </button>
        </div>

        <div class="dc-field-toolbar">
          <div class="dc-field-group">
            <span class="dc-fixed-field dc-label-field" :class="{ active: labelOrderDrawerOpen }">
              <button
                ref="labelOrderTrigger"
                type="button"
                class="dc-label-order-trigger"
                :disabled="!labelOrderAvailable"
                :aria-expanded="labelOrderDrawerOpen"
                aria-controls="dmp-label-order-panel"
                :title="labelOrderAvailable ? '调整标签顺序' : '至少需要两个标签名称才能调整顺序'"
                aria-label="调整标签顺序"
                @click="openLabelOrderDrawer"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="5" cy="4" r="1"></circle><circle cx="11" cy="4" r="1"></circle>
                  <circle cx="5" cy="8" r="1"></circle><circle cx="11" cy="8" r="1"></circle>
                  <circle cx="5" cy="12" r="1"></circle><circle cx="11" cy="12" r="1"></circle>
                </svg>
              </button>
              <span>标签名称</span>
              <svg class="dc-lock-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="9" width="10" height="8" rx="2"></rect><path d="M7 9V7a3 3 0 0 1 6 0v2"></path></svg>
            </span>
            <span class="dc-fixed-field">
              特征明细
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="9" width="10" height="8" rx="2"></rect><path d="M7 9V7a3 3 0 0 1 6 0v2"></path></svg>
            </span>
            <button
              v-for="metric in DMP_COMPARISON_METRICS"
              :key="metric"
              type="button"
              class="dc-metric"
              :class="{ selected: selectedMetrics.includes(metric) }"
              :aria-pressed="selectedMetrics.includes(metric)"
              @click="toggleMetric(metric)"
            >
              {{ metric === 'Rebase' ? 'Rabase 人群占比' : metric }}
              <span v-if="selectedMetrics.includes(metric)" aria-hidden="true">✓</span>
            </button>
          </div>
          <div class="dc-export-actions">
            <button type="button" class="dc-primary" @click="copyComparison">复制表格</button>
            <button type="button" class="dc-secondary" @click="exportComparison">导出 CSV</button>
          </div>
        </div>

        <div class="dc-table-wrap">
          <table class="dc-table" :class="{ 'has-multiple-metrics': selectedMetrics.length > 1 }">
            <thead>
              <tr>
                <th class="dc-sticky dc-label-column" :rowspan="selectedMetrics.length > 1 ? 2 : 1">标签名称</th>
                <th class="dc-sticky dc-detail-column" :rowspan="selectedMetrics.length > 1 ? 2 : 1">特征明细</th>
                <th
                  v-for="entry in selectedEntries"
                  :key="entry.key"
                  class="dc-package-column"
                  :colspan="selectedMetrics.length > 1 ? selectedMetrics.length : 1"
                >
                  <span :title="taskDisplayName(entry.task)">{{ taskDisplayName(entry.task) }}</span>
                  <small v-if="selectedMetrics.length === 1">{{ selectedMetrics[0] }}</small>
                </th>
              </tr>
              <tr v-if="selectedMetrics.length > 1">
                <template v-for="entry in selectedEntries" :key="`${entry.key}-metrics`">
                  <th v-for="metric in selectedMetrics" :key="`${entry.key}-${metric}`" class="dc-metric-column">{{ metric }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparisonMatrix.rows" :key="row.identity">
                <td class="dc-sticky dc-label-column">{{ row.labelName }}</td>
                <td class="dc-sticky dc-detail-column">{{ row.featureDetail || '—' }}</td>
                <template v-for="task in comparisonMatrix.tasks" :key="`${row.identity}-${task.key}`">
                  <td
                    v-for="metric in selectedMetrics"
                    :key="`${row.identity}-${task.key}-${metric}`"
                    class="dc-value"
                    :class="{ missing: row.values?.[task.key]?.[metric] == null || row.values?.[task.key]?.[metric] === '—' }"
                  >{{ formatValue(metric, row.values?.[task.key]?.[metric]) }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="dc-selection-tray">
          <strong>已选 {{ selectedEntries.length }} 个</strong>
          <div class="dc-tray-packages">
            <span v-for="(entry, index) in selectedEntries" :key="`${entry.key}-tray`">
              <i>{{ index + 1 }}</i>{{ taskDisplayName(entry.task) }}
            </span>
          </div>
          <span class="dc-reorder-hint">
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="6" r="1"></circle><circle cx="14" cy="6" r="1"></circle><circle cx="6" cy="14" r="1"></circle><circle cx="14" cy="14" r="1"></circle></svg>
            拖动调整列顺序
          </span>
        </footer>
      </template>

      <div v-else class="dc-comparison-empty">
        <span class="dc-empty-mark" aria-hidden="true">↔</span>
        <h2>选择需要横向对比的人群包</h2>
        <p>在左侧任务记录末尾点击圆形选择框。第一个人群包将作为标签结构基准。</p>
        <small>只有标签名称及其数量完全一致的人群包才能加入。</small>
      </div>
    </section>

    <transition name="dc-label-drawer">
      <aside
        v-if="labelOrderDrawerOpen"
        id="dmp-label-order-panel"
        ref="labelOrderDrawerRef"
        class="dc-label-order-drawer"
        role="dialog"
        aria-modal="false"
        aria-labelledby="dmp-label-order-title"
        tabindex="-1"
        @keydown.esc="cancelLabelOrder"
      >
        <header class="dc-label-order-head">
          <div>
            <h3 id="dmp-label-order-title">调整标签顺序</h3>
            <p>拖动整组标签，统一调整表格、复制与导出顺序</p>
          </div>
          <button type="button" aria-label="关闭标签排序" @click="cancelLabelOrder">×</button>
        </header>

        <div class="dc-label-order-list">
          <article
            v-for="(labelName, index) in draftLabelOrder"
            :key="labelName"
            class="dc-label-order-item"
            :class="{
              dragging: draggedLabelName === labelName,
              'drag-over': dragOverLabelName === labelName && draggedLabelName !== labelName,
            }"
            @dragenter.prevent="dragOverLabelName = labelName"
            @dragover.prevent
            @drop.prevent="dropLabelBefore(labelName)"
          >
            <button
              type="button"
              class="dc-label-drag-handle"
              draggable="true"
              :aria-label="`拖动标签 ${labelName}`"
              :title="`拖动 ${labelName}`"
              @dragstart="startLabelDrag(labelName, $event)"
              @dragend="endLabelDrag"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="5" cy="4" r="1"></circle><circle cx="11" cy="4" r="1"></circle>
                <circle cx="5" cy="8" r="1"></circle><circle cx="11" cy="8" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle><circle cx="11" cy="12" r="1"></circle>
              </svg>
            </button>
            <span class="dc-label-order-number">{{ index + 1 }}</span>
            <strong>{{ labelName }}</strong>
            <span class="dc-label-order-count">{{ labelCounts.get(labelName) || 0 }}项</span>
            <span class="dc-label-order-moves">
              <button
                type="button"
                :disabled="index === 0"
                :aria-label="`上移 ${labelName}`"
                title="上移"
                @click="moveDraftLabel(labelName, -1)"
              ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4"></path></svg></button>
              <button
                type="button"
                :disabled="index === draftLabelOrder.length - 1"
                :aria-label="`下移 ${labelName}`"
                title="下移"
                @click="moveDraftLabel(labelName, 1)"
              ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"></path></svg></button>
            </span>
          </article>
        </div>

        <footer class="dc-label-order-footer">
          <button type="button" class="dc-secondary dc-label-order-reset" @click="restoreDefaultLabelOrder">恢复默认</button>
          <span></span>
          <button type="button" class="dc-secondary" @click="cancelLabelOrder">取消</button>
          <button type="button" class="dc-primary" @click="applyLabelOrder">应用排序</button>
        </footer>
      </aside>
    </transition>
  </section>
</template>

<script setup>
import { computed, h, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DMP_COMPARISON_METRICS,
  buildDefaultLabelOrder,
  buildDmpComparisonMatrix,
  buildLabelStructureFingerprint,
  buildTagNameFrequency,
  compareTagNameStructures,
  comparisonToCsv,
  comparisonToTsv,
  reconcileLabelOrder,
} from '../utils/dmpComparison.js'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  selectedKeys: { type: Array, default: () => [] },
  selectedMetrics: { type: Array, default: () => ['覆盖人数'] },
  historyQuery: { type: String, default: '' },
  historyCollapsed: { type: Boolean, default: false },
  labelOrders: { type: Object, default: () => ({}) },
  mode: { type: String, default: 'history' },
})

const emit = defineEmits([
  'update:selectedKeys',
  'update:selectedMetrics',
  'update:historyQuery',
  'update:historyCollapsed',
  'update:labelOrders',
  'request-comparison',
  'view-task',
  'delete-task',
  'clear-history',
])

const draggedKey = ref('')
const labelOrderDrawerOpen = ref(false)
const labelOrderTrigger = ref(null)
const labelOrderDrawerRef = ref(null)
const draftLabelOrder = ref([])
const draggedLabelName = ref('')
const dragOverLabelName = ref('')

function taskKey(task, index = 0) {
  return String(task?.comparisonKey || task?.id || task?.runId || `${task?.type || 'task'}:${task?.name || '未命名'}:${task?.createdAt || task?.time || index}`)
}

function taskDisplayName(task) {
  return String(task?.crowdName || task?.name || '未命名人群包').replace(/^达摩盘\s*[·・]\s*/, '')
}

function hasResults(task) {
  return Array.isArray(task?.results) && task.results.length > 0
}

function isSelectable(task) {
  return task?.status === 'completed' && task?.type === 'dmp' && hasResults(task)
}

function statusLabel(status) {
  return ({ completed: '已完成', failed: '失败', cancelled: '已取消', running: '进行中' })[status] || status || '未知'
}

const taskEntries = computed(() => props.tasks.map((task, index) => ({
  task,
  index,
  key: taskKey(task, index),
})))

const entryByKey = computed(() => new Map(taskEntries.value.map((entry) => [entry.key, entry])))

const selectedEntries = computed(() => props.selectedKeys
  .map((key) => entryByKey.value.get(String(key)))
  .filter((entry) => entry && isSelectable(entry.task)))

const filteredEntries = computed(() => {
  const query = props.historyQuery.trim().toLowerCase()
  if (!query) return taskEntries.value
  return taskEntries.value.filter((entry) => taskDisplayName(entry.task).toLowerCase().includes(query))
})

const baselineEntry = computed(() => selectedEntries.value[0] || null)
const baselineRows = computed(() => baselineEntry.value?.task?.results || [])
const labelStructureFingerprint = computed(() => (
  baselineRows.value.length ? buildLabelStructureFingerprint(baselineRows.value) : ''
))
const defaultLabelOrder = computed(() => buildDefaultLabelOrder(baselineRows.value))
const labelCounts = computed(() => buildTagNameFrequency(baselineRows.value).frequency)
const effectiveLabelOrder = computed(() => reconcileLabelOrder(
  props.labelOrders?.[labelStructureFingerprint.value],
  baselineRows.value,
))
const labelOrderAvailable = computed(() => effectiveLabelOrder.value.length > 1)
const displayLabelOrder = computed(() => (
  labelOrderDrawerOpen.value
    ? reconcileLabelOrder(draftLabelOrder.value, baselineRows.value)
    : effectiveLabelOrder.value
))

const compatibilityByKey = computed(() => {
  const result = new Map()
  if (!baselineEntry.value) return result
  for (const entry of taskEntries.value) {
    if (!isSelectable(entry.task) || entry.key === baselineEntry.value.key) continue
    result.set(entry.key, compareTagNameStructures(baselineEntry.value.task.results, entry.task.results))
  }
  return result
})

const comparisonTasks = computed(() => selectedEntries.value.map((entry) => ({
  ...entry.task,
  comparisonKey: entry.key,
})))

const comparisonMatrix = computed(() => buildDmpComparisonMatrix(
  comparisonTasks.value,
  props.selectedMetrics,
  displayLabelOrder.value,
))

const appliedComparisonMatrix = computed(() => buildDmpComparisonMatrix(
  comparisonTasks.value,
  props.selectedMetrics,
  effectiveLabelOrder.value,
))

watch(labelStructureFingerprint, () => {
  labelOrderDrawerOpen.value = false
  draftLabelOrder.value = []
  draggedLabelName.value = ''
  dragOverLabelName.value = ''
})

function selectedOrder(key) {
  const index = props.selectedKeys.indexOf(String(key))
  return index >= 0 ? index + 1 : 0
}

function isIncompatible(entry) {
  return isSelectable(entry.task)
    && selectedOrder(entry.key) === 0
    && compatibilityByKey.value.get(entry.key)?.compatible === false
}

function selectionLabel(entry) {
  const order = selectedOrder(entry.key)
  if (order) return `移除第 ${order} 个对比人群包：${taskDisplayName(entry.task)}`
  return `选择人群包进行横向对比：${taskDisplayName(entry.task)}`
}

function selectionHint(entry) {
  if (!isSelectable(entry.task)) return '只有已完成且包含达摩盘结果的任务可以对比'
  if (isIncompatible(entry)) return '标签名称或标签数量与基准人群包不一致'
  const order = selectedOrder(entry.key)
  return order ? `已选为第 ${order} 列，点击移除` : '加入横向对比'
}

function toggleTask(entry) {
  const currentOrder = selectedOrder(entry.key)
  if (currentOrder) {
    removeTask(entry.key)
    return
  }
  if (!isSelectable(entry.task)) {
    ElMessage.warning('只有已完成且包含达摩盘结果的任务可以加入横向对比')
    return
  }
  const compatibility = compatibilityByKey.value.get(entry.key)
  if (compatibility && !compatibility.compatible) {
    showCompatibility(entry)
    return
  }
  emit('update:selectedKeys', [...props.selectedKeys, entry.key])
  emit('request-comparison')
}

function removeTask(key) {
  emit('update:selectedKeys', props.selectedKeys.filter((item) => String(item) !== String(key)))
}

function clearSelection() {
  emit('update:selectedKeys', [])
}

function differenceNodes(compatibility) {
  const items = compatibility?.differences || []
  const children = [
    h('p', { class: 'dc-dialog-summary' }, compatibility?.reason || '标签结构不一致'),
    h('p', { class: 'dc-dialog-counts' }, `基准 ${compatibility?.baseRowCount || 0} 行；当前 ${compatibility?.candidateRowCount || 0} 行`),
  ]
  if (items.length) {
    children.push(h('ul', { class: 'dc-dialog-list' }, items.slice(0, 12).map((item) => (
      h('li', { key: item.labelName }, `${item.labelName}：基准 ${item.baseCount}，当前 ${item.candidateCount}`)
    ))))
    if (items.length > 12) children.push(h('p', `另有 ${items.length - 12} 项差异`))
  }
  return h('div', { class: 'dc-dialog-content' }, children)
}

function showCompatibility(entry) {
  const compatibility = compatibilityByKey.value.get(entry.key)
  if (!compatibility) return
  ElMessageBox.alert(differenceNodes(compatibility), '无法加入横向对比', {
    confirmButtonText: '知道了',
    customClass: 'dc-compatibility-dialog',
  })
}

async function focusLabelOrderTrigger() {
  await nextTick()
  labelOrderTrigger.value?.focus?.()
}

async function openLabelOrderDrawer() {
  if (!labelOrderAvailable.value) {
    ElMessage.info('当前标签名称不足两个，无需调整顺序')
    return
  }
  draftLabelOrder.value = [...effectiveLabelOrder.value]
  labelOrderDrawerOpen.value = true
  await nextTick()
  labelOrderDrawerRef.value?.focus?.()
}

function restoreDefaultLabelOrder() {
  draftLabelOrder.value = [...defaultLabelOrder.value]
}

function cancelLabelOrder() {
  labelOrderDrawerOpen.value = false
  draftLabelOrder.value = []
  endLabelDrag()
  focusLabelOrderTrigger()
}

function applyLabelOrder() {
  const fingerprint = labelStructureFingerprint.value
  if (!fingerprint) return
  const normalizedOrder = reconcileLabelOrder(draftLabelOrder.value, baselineRows.value)
  const nextOrders = { ...props.labelOrders }
  if (normalizedOrder.join('\u0000') === defaultLabelOrder.value.join('\u0000')) {
    delete nextOrders[fingerprint]
  } else {
    nextOrders[fingerprint] = normalizedOrder
  }
  emit('update:labelOrders', nextOrders)
  labelOrderDrawerOpen.value = false
  draftLabelOrder.value = []
  endLabelDrag()
  ElMessage.success('标签顺序已应用，复制与导出将使用当前顺序')
  focusLabelOrderTrigger()
}

function moveDraftLabel(labelName, direction) {
  const next = [...draftLabelOrder.value]
  const sourceIndex = next.indexOf(labelName)
  const targetIndex = sourceIndex + direction
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= next.length) return
  next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, labelName)
  draftLabelOrder.value = next
}

function startLabelDrag(labelName, event) {
  draggedLabelName.value = labelName
  dragOverLabelName.value = labelName
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', labelName)
  }
}

function endLabelDrag() {
  draggedLabelName.value = ''
  dragOverLabelName.value = ''
}

function dropLabelBefore(targetLabelName) {
  const sourceLabelName = draggedLabelName.value
  if (!sourceLabelName || sourceLabelName === targetLabelName) {
    endLabelDrag()
    return
  }
  const next = [...draftLabelOrder.value]
  const sourceIndex = next.indexOf(sourceLabelName)
  const targetIndex = next.indexOf(targetLabelName)
  if (sourceIndex < 0 || targetIndex < 0) {
    endLabelDrag()
    return
  }
  next.splice(sourceIndex, 1)
  const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  next.splice(insertionIndex, 0, sourceLabelName)
  draftLabelOrder.value = next
  endLabelDrag()
}

function toggleMetric(metric) {
  if (props.selectedMetrics.includes(metric)) {
    if (props.selectedMetrics.length === 1) {
      ElMessage.warning('横向对比至少需要保留一个指标')
      return
    }
    emit('update:selectedMetrics', props.selectedMetrics.filter((item) => item !== metric))
    return
  }
  emit('update:selectedMetrics', DMP_COMPARISON_METRICS.filter((item) => (
    item === metric || props.selectedMetrics.includes(item)
  )))
}

function startDrag(key, event) {
  draggedKey.value = key
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
  }
}

function dropBefore(targetKey) {
  const sourceKey = draggedKey.value
  draggedKey.value = ''
  if (!sourceKey || sourceKey === targetKey) return
  const next = [...props.selectedKeys]
  const sourceIndex = next.indexOf(sourceKey)
  const targetIndex = next.indexOf(targetKey)
  if (sourceIndex < 0 || targetIndex < 0) return
  next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, sourceKey)
  emit('update:selectedKeys', next)
}

function formatValue(metric, value) {
  if (value == null || value === '' || value === '-') return '—'
  if (metric === '覆盖人数' || metric === 'Rebase后人数') {
    const number = Number(String(value).replace(/,/g, ''))
    return Number.isFinite(number) ? number.toLocaleString('zh-CN') : value
  }
  if ((metric === '人群占比' || metric === 'Rebase') && String(value).endsWith('%')) {
    const percentage = Number.parseFloat(value)
    return Number.isFinite(percentage) ? `${percentage.toFixed(2)}%` : value
  }
  return value
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function copyComparison() {
  try {
    await copyText(comparisonToTsv(appliedComparisonMatrix.value))
    ElMessage.success('横向对比表已复制，可直接粘贴到 Excel')
  } catch {
    ElMessage.error('复制失败，请检查浏览器剪贴板权限')
  }
}

function exportComparison() {
  const csv = comparisonToCsv(appliedComparisonMatrix.value)
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const metricLabel = props.selectedMetrics.join('-')
  link.href = url
  link.download = `达摩盘横向对比_${selectedEntries.value.length}个人群包_${metricLabel}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  ElMessage.success('横向对比 CSV 已导出')
}
</script>

<style scoped>
.dc-workspace {
  --dc-ink: #1d1d1f;
  --dc-muted: #6e6e73;
  --dc-faint: #8e8e93;
  --dc-line: #e6e9ef;
  --dc-fill: #f7f9fc;
  position: relative;
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--dc-line);
  border-radius: 14px;
  background: #fff;
  color: var(--dc-ink);
  transition: grid-template-columns 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.dc-workspace.is-history { grid-template-columns: minmax(0, 1fr); }
.dc-workspace.history-collapsed { grid-template-columns: 0 minmax(0, 1fr); }

button,
input { font: inherit; }

button:focus-visible,
input:focus-visible { outline: 2px solid #1d1d1f; outline-offset: 2px; }

.dc-history-rail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 16px 12px 12px;
  border-right: 1px solid var(--dc-line);
  background: #fff;
  opacity: 1;
  visibility: visible;
  transition:
    padding 180ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 160ms ease,
    opacity 120ms ease,
    visibility 0s linear;
}

.history-collapsed .dc-history-rail {
  padding-right: 0;
  padding-left: 0;
  border-right-color: transparent;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition-delay: 0s, 0s, 0s, 120ms;
}

.dc-workspace.is-history .dc-history-rail { border-right: 0; }

.dc-history-toggle {
  position: absolute;
  z-index: 14;
  top: 18px;
  left: 292px;
  display: inline-grid;
  width: 28px;
  height: 38px;
  padding: 0;
  place-items: center;
  border: 1px solid #dfe2e8;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 5px 16px rgba(31, 35, 43, 0.08);
  color: var(--dc-muted);
  cursor: pointer;
  transform: translateX(-50%);
  transition:
    left 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.dc-history-toggle:hover {
  border-color: #aeb4bf;
  box-shadow: 0 7px 20px rgba(31, 35, 43, 0.12);
  color: var(--dc-ink);
}

.dc-history-toggle svg {
  width: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
  transition: transform 180ms ease;
}

.dc-history-toggle svg.reversed { transform: rotate(180deg); }
.history-collapsed .dc-history-toggle { left: 12px; transform: none; }
.history-collapsed .dc-comparison-head { padding-left: 34px; }

.dc-history-head,
.dc-comparison-head,
.dc-field-toolbar,
.dc-selection-tray {
  display: flex;
  align-items: center;
}

.dc-history-head { justify-content: space-between; min-height: 28px; padding: 0 4px; }
.dc-history-head > div { display: flex; align-items: baseline; gap: 7px; }
.dc-history-head strong { font-size: 13px; font-weight: 650; letter-spacing: -0.01em; }
.dc-history-head span { color: var(--dc-muted); font-size: 11px; }
.dc-quiet-action { padding: 5px 3px; border: 0; background: transparent; color: var(--dc-muted); font-size: 10px; cursor: pointer; }
.dc-quiet-action:hover { color: var(--dc-ink); }

.dc-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  margin: 10px 4px 12px;
  padding: 0 10px;
  border: 1px solid var(--dc-line);
  border-radius: 9px;
  background: #fff;
  color: var(--dc-faint);
}

.dc-search:focus-within { border-color: #aeb4bf; box-shadow: 0 0 0 3px rgba(29, 29, 31, 0.05); }
.dc-search svg { width: 15px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.7; }
.dc-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--dc-ink); font-size: 11px; }
.dc-search input::placeholder { color: #b1b5bd; }

.dc-history-columns,
.dc-workspace.is-history .dc-history-row {
  grid-template-columns:
    minmax(280px, 1.6fr)
    minmax(96px, 0.55fr)
    minmax(72px, 0.4fr)
    minmax(84px, 0.45fr)
    minmax(96px, 0.5fr)
    28px;
  column-gap: 10px;
}
.dc-history-columns {
  display: grid;
  align-items: center;
  min-height: 34px;
  margin: 0 4px;
  padding: 0 6px;
  border-bottom: 1px solid #e7e9ee;
  color: #8a8f98;
  font-size: 9px;
  font-weight: 560;
  letter-spacing: 0.01em;
}
.dc-history-columns > span:not(:first-child) { text-align: center; }
.dc-history-list { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #cfd3da transparent; }
.dc-history-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 30px 24px;
  align-items: center;
  gap: 6px;
  min-height: 62px;
  padding: 6px 2px 6px 6px;
  border-bottom: 1px solid #eef0f4;
  transition: background 160ms ease;
}
.dc-workspace.is-history .dc-history-row {
  min-height: 68px;
  padding: 0 6px;
}
.dc-history-row:hover { background: #fafbfd; }
.dc-history-row.selected { background: #f7f9fc; }
.dc-workspace.is-history .dc-history-row.selected { background: #fff; }
.dc-workspace.is-history .dc-history-row.selected:hover { background: #fafbfd; }
.dc-history-row.incompatible { background: #fffdf9; }
.dc-history-open { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.dc-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #b5b8be; flex: 0 0 auto; }
.dc-status-dot.completed { background: #30b85a; }
.dc-status-dot.running { background: #0a84ff; }
.dc-status-dot.failed { background: #ff453a; }
.dc-history-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.dc-history-copy strong { overflow: hidden; color: var(--dc-ink); font-size: 11px; font-weight: 560; text-overflow: ellipsis; white-space: nowrap; }
.dc-history-copy > span { color: var(--dc-faint); font-size: 9px; }
.dc-workspace.is-history .dc-history-copy > span { display: none; }
.dc-history-copy i { font-style: normal; }
.dc-history-time,
.dc-history-size {
  color: var(--dc-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}
.dc-task-status,
.dc-compatibility { padding: 3px 6px; border: 0; border-radius: 999px; font-size: 8px; white-space: nowrap; }
.dc-workspace.is-history .dc-task-status,
.dc-workspace.is-history .dc-compatibility,
.dc-workspace.is-history .dc-selector { justify-self: center; }
.dc-workspace.is-history .dc-delete { justify-self: end; }
.dc-task-status { color: var(--dc-muted); background: var(--dc-fill); }
.dc-task-status.completed { color: #1f8d43; background: #eef9f1; }
.dc-task-status.running { color: #0572ce; background: #edf6ff; }
.dc-task-status.failed { color: #d4382f; background: #fff0ef; }
.dc-compatibility { color: #a65f00; background: #fff7e8; cursor: pointer; }
.dc-delete { width: 24px; height: 24px; padding: 0; border: 0; background: transparent; color: #b5b8be; font-size: 15px; opacity: 0; cursor: pointer; }
.dc-history-row:hover .dc-delete,
.dc-delete:focus-visible { opacity: 1; }
.dc-delete:hover { color: #ff453a; }
.dc-selector {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: 0 5px;
  padding: 0;
  border: 1px solid #bfc4cd;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}
.dc-selector:hover:not(:disabled) { border-color: var(--dc-ink); transform: scale(1.08); }
.dc-selector.selected { border-color: var(--dc-ink); background: var(--dc-ink); }
.dc-selector:disabled { border-color: #e0e3e8; background: transparent; cursor: not-allowed; }
.dc-history-empty { display: grid; flex: 1; place-items: center; color: #aaafb7; font-size: 11px; }

.dc-comparison-canvas { display: flex; min-width: 0; min-height: 0; flex-direction: column; padding: 18px 18px 14px; overflow: hidden; background: #fff; }
.dc-comparison-head { justify-content: space-between; min-height: 40px; }
.dc-comparison-head p { margin: 0 0 3px; color: var(--dc-muted); font-size: 9px; letter-spacing: 0.06em; }
.dc-comparison-head h2 { margin: 0; font-size: 14px; font-weight: 650; letter-spacing: -0.02em; }

.dc-package-strip { display: flex; gap: 7px; margin: 12px 0 10px; overflow-x: auto; padding-bottom: 2px; }
.dc-package-chip {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  min-width: 146px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid #eceef2;
  border-radius: 8px;
  background: var(--dc-fill);
  color: var(--dc-ink);
  cursor: grab;
}
.dc-package-chip:active { cursor: grabbing; }
.dc-package-chip > span,
.dc-selection-tray i { display: inline-grid; place-items: center; border-radius: 50%; background: var(--dc-ink); color: #fff; font-style: normal; font-size: 8px; font-weight: 700; }
.dc-package-chip > span { width: 17px; height: 17px; }
.dc-package-chip strong { overflow: hidden; font-size: 10px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.dc-package-chip > i { color: #9ca0a8; font-style: normal; font-size: 13px; cursor: pointer; }
.dc-package-chip > i:hover { color: var(--dc-ink); }

.dc-field-toolbar { justify-content: space-between; gap: 12px; padding: 10px 0 12px; border-top: 1px solid #f0f1f4; }
.dc-field-group { display: flex; min-width: 0; align-items: center; gap: 6px; overflow-x: auto; }
.dc-fixed-field,
.dc-metric { display: inline-flex; align-items: center; gap: 4px; height: 29px; padding: 0 10px; border-radius: 7px; white-space: nowrap; font-size: 9px; }
.dc-fixed-field { background: var(--dc-fill); color: #555960; }
.dc-fixed-field svg { width: 11px; fill: none; stroke: #888d95; stroke-width: 1.5; }
.dc-label-field {
  position: relative;
  padding-right: 8px;
  padding-left: 27px;
  box-shadow: inset 0 0 0 1px transparent;
  transition: box-shadow 160ms ease, background 160ms ease;
}
.dc-label-field.active { background: #fff; box-shadow: inset 0 0 0 1px #bfc4cd; }
.dc-label-order-trigger {
  position: absolute;
  inset: 2px auto 2px 2px;
  display: inline-grid;
  width: 23px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #8b9098;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.dc-label-order-trigger:hover:not(:disabled),
.dc-label-order-trigger[aria-expanded="true"] { background: #1d1d1f; color: #fff; }
.dc-label-order-trigger:disabled { color: #c7cbd2; cursor: not-allowed; }
.dc-label-order-trigger svg { width: 12px; fill: currentColor; stroke: none; }
.dc-label-field > .dc-lock-icon { flex: 0 0 auto; }
.dc-metric { border: 1px solid #dfe2e8; background: #fff; color: var(--dc-muted); cursor: pointer; }
.dc-metric:hover { border-color: #aeb4bf; color: var(--dc-ink); }
.dc-metric.selected { border-color: #aeb4bf; background: #fff; color: var(--dc-ink); font-weight: 600; }
.dc-metric.selected span { display: inline-grid; width: 14px; height: 14px; place-items: center; border-radius: 50%; background: var(--dc-ink); color: #fff; font-size: 8px; }
.dc-export-actions { display: flex; gap: 7px; flex: 0 0 auto; }
.dc-primary,
.dc-secondary { height: 31px; padding: 0 13px; border-radius: 8px; font-size: 10px; font-weight: 550; cursor: pointer; }
.dc-primary { border: 1px solid var(--dc-ink); background: var(--dc-ink); color: #fff; }
.dc-primary:hover { background: #333336; }
.dc-secondary { border: 1px solid #cfd3da; background: #fff; color: var(--dc-ink); }
.dc-secondary:hover { border-color: #8e939b; }

.dc-table-wrap { flex: 1; min-height: 220px; overflow: auto; border: 1px solid var(--dc-line); border-radius: 10px; scrollbar-width: thin; scrollbar-color: #cfd3da transparent; }
.dc-table { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; color: #45484e; font-size: 10px; }
.dc-table th,
.dc-table td { height: 42px; box-sizing: border-box; padding: 0 12px; border-right: 1px solid #edf0f4; border-bottom: 1px solid #edf0f4; background: #fff; white-space: nowrap; }
.dc-table thead { position: sticky; top: 0; z-index: 8; }
.dc-table th { height: 44px; color: var(--dc-ink); font-weight: 650; text-align: left; }
.dc-table thead tr:nth-child(2) th { height: 30px; color: var(--dc-muted); font-size: 9px; font-weight: 550; text-align: right; }
.dc-table tbody tr:hover td { background: #fafbfd; }
.dc-table .dc-sticky { position: sticky; z-index: 3; }
.dc-table th.dc-sticky { z-index: 10; }
.dc-label-column { left: 0; width: 132px; min-width: 132px; }
.dc-detail-column { left: 132px; width: 162px; min-width: 162px; box-shadow: 1px 0 0 #e8ebf0; }
.dc-package-column { min-width: 176px; text-align: center !important; }
.dc-package-column span { display: block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.dc-package-column small { display: block; margin-top: 4px; color: var(--dc-muted); font-size: 8px; font-weight: 500; }
.dc-metric-column { min-width: 112px; }
.dc-value { min-width: 112px; color: #34373c; font-variant-numeric: tabular-nums; text-align: right; }
.dc-value.missing { color: #aeb3bb; }

.dc-label-order-drawer {
  position: absolute;
  z-index: 40;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  width: min(360px, calc(100% - 44px));
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid #e3e6eb;
  background: #fff;
  box-shadow: -18px 0 42px rgba(27, 31, 39, 0.11);
  outline: 0;
}
.dc-label-order-head {
  display: flex;
  min-height: 78px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 19px 18px 15px;
  border-bottom: 1px solid #eef0f4;
}
.dc-label-order-head h3 { margin: 0 0 7px; color: var(--dc-ink); font-size: 14px; font-weight: 650; letter-spacing: -0.02em; }
.dc-label-order-head p { margin: 0; color: var(--dc-muted); font-size: 9px; line-height: 1.5; }
.dc-label-order-head > button {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #8e939b;
  font-size: 18px;
  cursor: pointer;
}
.dc-label-order-head > button:hover { background: var(--dc-fill); color: var(--dc-ink); }
.dc-label-order-list { flex: 1; min-height: 0; padding: 12px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #cfd3da transparent; }
.dc-label-order-item {
  position: relative;
  display: grid;
  grid-template-columns: 26px 20px minmax(0, 1fr) auto 46px;
  min-height: 54px;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  padding: 0 8px 0 6px;
  border: 1px solid #e6e9ef;
  border-radius: 10px;
  background: #fff;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease, opacity 150ms ease;
}
.dc-label-order-item:hover { border-color: #c7cbd2; }
.dc-label-order-item.dragging { border-color: #b8bdc6; box-shadow: 0 10px 24px rgba(31, 35, 43, 0.12); opacity: 0.72; transform: translateY(-1px); }
.dc-label-order-item.drag-over::before {
  position: absolute;
  top: -5px;
  right: 4px;
  left: 4px;
  height: 2px;
  border-radius: 2px;
  background: var(--dc-ink);
  content: '';
}
.dc-label-drag-handle {
  display: inline-grid;
  width: 26px;
  height: 36px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8f949c;
  cursor: grab;
}
.dc-label-drag-handle:hover { background: var(--dc-fill); color: var(--dc-ink); }
.dc-label-drag-handle:active { cursor: grabbing; }
.dc-label-drag-handle svg { width: 13px; fill: currentColor; }
.dc-label-order-number { display: inline-grid; width: 19px; height: 19px; place-items: center; border-radius: 50%; background: var(--dc-ink); color: #fff; font-size: 8px; font-weight: 700; }
.dc-label-order-item strong { overflow: hidden; color: var(--dc-ink); font-size: 10px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.dc-label-order-count { padding: 3px 6px; border: 1px solid #e2e5ea; border-radius: 999px; color: var(--dc-muted); font-size: 8px; white-space: nowrap; }
.dc-label-order-moves { display: flex; justify-content: flex-end; opacity: 0; transition: opacity 140ms ease; }
.dc-label-order-item:hover .dc-label-order-moves,
.dc-label-order-item:focus-within .dc-label-order-moves { opacity: 1; }
.dc-label-order-moves button { display: inline-grid; width: 22px; height: 26px; padding: 0; place-items: center; border: 0; border-radius: 5px; background: transparent; color: #737880; cursor: pointer; }
.dc-label-order-moves button:hover:not(:disabled) { background: var(--dc-fill); color: var(--dc-ink); }
.dc-label-order-moves button:disabled { color: #d5d8de; cursor: not-allowed; }
.dc-label-order-moves svg { width: 12px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
.dc-label-order-footer {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 12px 14px;
  border-top: 1px solid #e6e9ef;
  background: #fff;
}
.dc-label-order-footer .dc-primary,
.dc-label-order-footer .dc-secondary { height: 32px; }
.dc-label-order-reset { border-color: transparent; color: var(--dc-muted); }
.dc-label-order-reset:hover { border-color: transparent; color: var(--dc-ink); }

.dc-label-drawer-enter-active,
.dc-label-drawer-leave-active { transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease; }
.dc-label-drawer-enter-from,
.dc-label-drawer-leave-to { opacity: 0; transform: translateX(18px); }

.dc-selection-tray { gap: 12px; min-height: 42px; margin-top: 10px; padding: 0 12px; border: 1px solid #eceef2; border-radius: 10px; background: #fff; box-shadow: 0 9px 26px rgba(32, 38, 50, 0.07); }
.dc-selection-tray > strong { flex: 0 0 auto; font-size: 10px; }
.dc-tray-packages { display: flex; min-width: 0; flex: 1; gap: 6px; overflow: hidden; }
.dc-tray-packages span { display: flex; min-width: 0; max-width: 220px; align-items: center; gap: 5px; padding: 4px 7px; border-radius: 6px; background: var(--dc-fill); color: #555960; font-size: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-selection-tray i { width: 14px; height: 14px; flex: 0 0 auto; }
.dc-reorder-hint { display: inline-flex; align-items: center; gap: 5px; color: var(--dc-muted); font-size: 9px; white-space: nowrap; }
.dc-reorder-hint svg { width: 14px; fill: currentColor; }

.dc-comparison-empty { display: grid; min-width: 0; min-height: 0; place-items: center; background: #fff; text-align: center; }
.dc-comparison-empty h2 { margin: 14px 0 7px; color: var(--dc-ink); font-size: 16px; font-weight: 620; letter-spacing: -0.02em; }
.dc-comparison-empty p { max-width: 410px; margin: 0 auto 7px; color: var(--dc-muted); font-size: 11px; line-height: 1.6; }
.dc-comparison-empty small { color: #9a9fa8; font-size: 9px; }
.dc-empty-mark { display: inline-grid; width: 46px; height: 46px; place-items: center; border: 1px solid #dfe2e8; border-radius: 50%; color: var(--dc-ink); font-size: 14px; font-weight: 650; }

@media (prefers-reduced-motion: reduce) {
  .dc-workspace,
  .dc-history-rail,
  .dc-history-toggle,
  .dc-history-toggle svg,
  .dc-label-field,
  .dc-label-order-trigger,
  .dc-label-order-item,
  .dc-label-order-moves,
  .dc-history-row,
  .dc-selector { transition: none; }
}
</style>

<style>
.dc-compatibility-dialog .dc-dialog-summary { margin: 0 0 8px; color: #1d1d1f; font-weight: 600; }
.dc-compatibility-dialog .dc-dialog-counts { margin: 0 0 10px; color: #6e6e73; font-size: 12px; }
.dc-compatibility-dialog .dc-dialog-list { max-height: 240px; margin: 0; padding-left: 18px; overflow-y: auto; color: #4b4e54; font-size: 12px; line-height: 1.8; }
.dc-compatibility-dialog .el-button--primary { border-color: #1d1d1f !important; background: #1d1d1f !important; color: #fff !important; }
.dc-compatibility-dialog .el-button--primary:hover { border-color: #333336 !important; background: #333336 !important; }
</style>
