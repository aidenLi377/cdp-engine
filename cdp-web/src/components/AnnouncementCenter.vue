<template>
  <div class="announcement-center">
    <aside class="announcement-center__rail" aria-label="公告与新手教程">
      <header>
        <p>PRODUCT LIBRARY</p>
        <h1>公告与教程</h1>
        <div class="announcement-center__tabs" role="tablist" aria-label="内容分类">
          <button
            v-for="option in kindOptions"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="activeKind === option.value"
            :class="{ active: activeKind === option.value }"
            @click="activateKind(option.value)"
          >
            {{ option.label }}
            <span>{{ countKind(option.value) }}</span>
          </button>
        </div>
      </header>

      <div v-if="loadingList" class="announcement-center__rail-empty">正在读取内容…</div>
      <div v-else-if="!hasRailItems" class="announcement-center__rail-empty">
        {{ activeKind === 'tutorial' ? '新手教程正在准备中' : '暂时还没有更新公告' }}
      </div>
      <nav v-else>
        <button
          v-if="activeKind === 'tutorial'"
          type="button"
          :class="{ active: selectedId === SOLUTION_REUSE_TUTORIAL_ID }"
          @click="selectBuiltInTutorial(SOLUTION_REUSE_TUTORIAL_ID)"
        >
          <span class="announcement-center__version">GUIDED TASK</span>
          <strong>方案制作 · 共同浏览本品与竞品</strong>
          <small>约 8–12 分钟 · 产出正式方案</small>
        </button>
        <button
          v-if="activeKind === 'tutorial'"
          type="button"
          :class="{ active: selectedId === CATEGORY_ITEM_TUTORIAL_ID }"
          @click="selectBuiltInTutorial(CATEGORY_ITEM_TUTORIAL_ID)"
        >
          <span class="announcement-center__version">GUIDED TASK</span>
          <strong>类目商品行为 · 7 个商品 ID 自动拆分</strong>
          <small>约 5 分钟 · 可实际操作</small>
        </button>
        <button
          v-if="activeKind === 'tutorial'"
          type="button"
          :class="{ active: selectedId === DMP_BATCH_TUTORIAL_ID }"
          @click="selectBuiltInTutorial(DMP_BATCH_TUTORIAL_ID)"
        >
          <span class="announcement-center__version">GUIDED TASK</span>
          <strong>达摩盘 · 批量取画像与横向对比</strong>
          <small>约 1–2 分钟 · 可实际操作</small>
        </button>
        <button
          v-for="item in filteredItems"
          :key="item.id"
          type="button"
          :class="{ active: item.id === selectedId }"
          @click="selectAnnouncement(item.id)"
        >
          <span class="announcement-center__version">{{ itemLabel(item) }}</span>
          <strong>{{ item.title }}</strong>
          <small>{{ formatDate(item.publishedAt) }}</small>
        </button>
      </nav>
    </aside>

    <main class="announcement-center__main">
      <div class="announcement-center__toolbar">
        <span class="announcement-center__ack"><i></i> 已同步阅读状态</span>
        <button type="button" @click="emit('close')">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </button>
      </div>

      <div v-if="selectedId === CATEGORY_ITEM_TUTORIAL_ID" class="announcement-center__scroll">
        <TutorialTaskDetail @start="emit('start-tutorial', CATEGORY_ITEM_TUTORIAL_ID)" />
      </div>
      <div v-else-if="selectedId === SOLUTION_REUSE_TUTORIAL_ID" class="announcement-center__scroll">
        <SolutionReuseTutorialDetail @start="emit('start-tutorial', SOLUTION_REUSE_TUTORIAL_ID)" />
      </div>
      <div v-else-if="selectedId === DMP_BATCH_TUTORIAL_ID" class="announcement-center__scroll">
        <DmpBatchTutorialDetail @start="emit('start-tutorial', DMP_BATCH_TUTORIAL_ID)" />
      </div>
      <div v-else-if="loadingDetail" class="announcement-center__state">
        <span class="announcement-center__loader"></span>
        正在打开内容…
      </div>
      <div v-else-if="errorMessage" class="announcement-center__state announcement-center__state--error">
        <strong>内容暂时无法显示</strong>
        <span>{{ errorMessage }}</span>
        <button type="button" @click="reload">重新读取</button>
      </div>
      <div v-else-if="!detail" class="announcement-center__state">
        <strong>{{ activeKind === 'tutorial' ? '新手教程正在准备中' : '暂时还没有更新公告' }}</strong>
        <span>{{ activeKind === 'tutorial' ? '后续会在这里提供完整的图文与视频操作指南。' : '新版本发布后，会在这里保留完整说明。' }}</span>
      </div>
      <div v-else class="announcement-center__scroll">
        <AnnouncementArticle :announcement="detail" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { ArrowLeft } from '@element-plus/icons-vue'
import AnnouncementArticle from './AnnouncementArticle.vue'
import DmpBatchTutorialDetail from './DmpBatchTutorialDetail.vue'
import SolutionReuseTutorialDetail from './SolutionReuseTutorialDetail.vue'
import TutorialTaskDetail from './TutorialTaskDetail.vue'
import { request } from '../utils/apiClient.js'
import {
  CATEGORY_ITEM_TUTORIAL_ID,
  DMP_BATCH_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_ID,
} from '../utils/guidedTutorialConfig.js'

const props = defineProps({
  initialId: {
    type: String,
    default: '',
  },
})
const emit = defineEmits(['close', 'read-updated', 'start-tutorial'])
const BUILTIN_TUTORIAL_IDS = new Set([
  SOLUTION_REUSE_TUTORIAL_ID,
  CATEGORY_ITEM_TUTORIAL_ID,
  DMP_BATCH_TUTORIAL_ID,
])

const kindOptions = [
  { value: 'announcement', label: '更新公告' },
  { value: 'tutorial', label: '新手教程' },
]
const items = ref([])
const detail = ref(null)
const selectedId = ref('')
const activeKind = ref('announcement')
const loadingList = ref(false)
const loadingDetail = ref(false)
const errorMessage = ref('')
let detailRequestId = 0
let enterInFlight = null
let activationCount = 0

const filteredItems = computed(() => items.value.filter((item) => (item.kind || 'announcement') === activeKind.value))
const hasRailItems = computed(() => activeKind.value === 'tutorial' || filteredItems.value.length > 0)

function countKind(kind) {
  const remoteCount = items.value.filter((item) => (item.kind || 'announcement') === kind).length
  return kind === 'tutorial' ? remoteCount + BUILTIN_TUTORIAL_IDS.size : remoteCount
}

function itemLabel(item) {
  return (item.kind || 'announcement') === 'tutorial' ? 'GUIDE' : `V${item.version}`
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

async function markAnnouncementRead(id) {
  const previous = items.value.find((item) => item.id === id)
  if (!previous || previous.readAt) return

  const optimisticReadAt = new Date().toISOString()
  items.value = items.value.map((item) => item.id === id ? { ...item, readAt: optimisticReadAt } : item)
  emit('read-updated', {
    id,
    readAt: optimisticReadAt,
    unreadCount: items.value.filter((item) => !item.readAt).length,
  })

  try {
    const state = await request(`/api/announcements/${encodeURIComponent(id)}/read`, { method: 'POST' })
    items.value = items.value.map((item) => item.id === id ? { ...item, readAt: state.readAt } : item)
  } catch {
    items.value = items.value.map((item) => item.id === id ? previous : item)
    emit('read-updated', {
      id,
      readAt: null,
      unreadCount: items.value.filter((item) => !item.readAt).length,
    })
  }
}

async function loadItems(preferredId = '') {
  loadingList.value = true
  errorMessage.value = ''
  try {
    items.value = await request('/api/announcements', { params: { limit: 100 }, cache: 'no-store' })
    const preferredBuiltIn = BUILTIN_TUTORIAL_IDS.has(preferredId)
    const preferred = preferredId ? items.value.find((item) => item.id === preferredId) : null
    if (preferredBuiltIn) activeKind.value = 'tutorial'
    else if (preferred) activeKind.value = preferred.kind || 'announcement'
    const nextId = (preferredBuiltIn ? preferredId : '')
      || preferred?.id
      || (filteredItems.value.some((item) => item.id === selectedId.value) ? selectedId.value : '')
      || (activeKind.value === 'tutorial' ? CATEGORY_ITEM_TUTORIAL_ID : '')
      || filteredItems.value[0]?.id
      || ''
    if (nextId) await selectAnnouncement(nextId)
    else {
      selectedId.value = ''
      detail.value = null
    }
  } catch (error) {
    errorMessage.value = error.message || '公告与教程读取失败'
  } finally {
    loadingList.value = false
  }
}

async function selectAnnouncement(id) {
  if (!id) return
  if (BUILTIN_TUTORIAL_IDS.has(id)) {
    selectBuiltInTutorial(id)
    return
  }
  selectedId.value = id
  const requestId = ++detailRequestId
  loadingDetail.value = true
  errorMessage.value = ''
  try {
    const nextDetail = await request(`/api/announcements/${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (requestId !== detailRequestId) return
    detail.value = nextDetail
    void markAnnouncementRead(id)
  } catch (error) {
    if (requestId === detailRequestId) errorMessage.value = error.message || '正文读取失败'
  } finally {
    if (requestId === detailRequestId) loadingDetail.value = false
  }
}

function selectBuiltInTutorial(id = CATEGORY_ITEM_TUTORIAL_ID) {
  detailRequestId += 1
  selectedId.value = BUILTIN_TUTORIAL_IDS.has(id) ? id : CATEGORY_ITEM_TUTORIAL_ID
  detail.value = null
  loadingDetail.value = false
  errorMessage.value = ''
}

function activateKind(kind) {
  if (activeKind.value === kind) return
  activeKind.value = kind
  if (kind === 'tutorial') {
    selectBuiltInTutorial()
    return
  }
  const first = filteredItems.value[0]
  if (first) void selectAnnouncement(first.id)
  else {
    selectedId.value = ''
    detail.value = null
  }
}

function enter(preferredId = props.initialId) {
  if (enterInFlight) return enterInFlight
  enterInFlight = loadItems(preferredId).finally(() => {
    enterInFlight = null
  })
  return enterInFlight
}

function reload() {
  return enter(selectedId.value || props.initialId)
}

watch(() => props.initialId, (id) => {
  if (id && id !== selectedId.value) void loadItems(id)
})

onMounted(() => enter(props.initialId))
onActivated(() => {
  activationCount += 1
  if (activationCount > 1) void enter(props.initialId)
})
</script>

<style scoped>
.announcement-center { display: grid; width: 100%; height: 100%; min-height: 0; grid-template-columns: 304px minmax(0, 1fr); background: #fff; }
.announcement-center__rail { display: flex; min-height: 0; flex-direction: column; border-right: 1px solid var(--ui-divider); }
.announcement-center__rail header { padding: 27px 28px 18px; border-bottom: 1px solid var(--ui-divider); }
.announcement-center__rail header > p { margin: 0 0 8px; color: var(--ui-accent); font: 700 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .17em; }
.announcement-center__rail header h1 { margin: 0; font-size: 20px; font-weight: 620; letter-spacing: -.04em; }
.announcement-center__tabs { display: flex; gap: 22px; margin-top: 18px; border-bottom: 1px solid var(--ui-divider); }
.announcement-center__tabs button { position: relative; display: inline-flex; height: 35px; appearance: none; align-items: center; gap: 6px; padding: 0 1px; color: var(--ui-text-tertiary); font: inherit; font-size: 10px; background: transparent; border: 0; border-radius: 0; cursor: pointer; transition: color 150ms ease; }
.announcement-center__tabs button::after { position: absolute; right: 50%; bottom: -1px; left: 50%; height: 2px; content: ''; background: var(--ui-accent); border-radius: 2px 2px 0 0; transition: right 160ms ease, left 160ms ease; }
.announcement-center__tabs button:hover { color: var(--ui-ink); }
.announcement-center__tabs button.active { color: var(--ui-ink); font-weight: 620; }
.announcement-center__tabs button.active::after { right: 0; left: 0; }
.announcement-center__tabs button:focus-visible { outline: 2px solid color-mix(in srgb, var(--ui-accent) 45%, transparent); outline-offset: 3px; }
.announcement-center__tabs span { min-width: 12px; color: var(--ui-text-tertiary); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
.announcement-center__rail nav { min-height: 0; overflow-y: auto; padding: 10px 0 24px; }
.announcement-center__rail nav button { position: relative; display: grid; width: 100%; gap: 7px; padding: 17px 28px; color: var(--ui-ink); font: inherit; text-align: left; background: #fff; border: 0; border-bottom: 1px solid var(--ui-divider); cursor: pointer; }
.announcement-center__rail nav button::before { position: absolute; top: 14px; bottom: 14px; left: 0; width: 2px; content: ''; background: transparent; }
.announcement-center__rail nav button:hover { background: #fafaf9; }
.announcement-center__rail nav button.active { background: #f7f7f5; }
.announcement-center__rail nav button.active::before { background: var(--ui-accent); }
.announcement-center__version { color: var(--ui-accent); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
.announcement-center__rail nav strong { overflow: hidden; font-size: 11px; font-weight: 590; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.announcement-center__rail nav small { color: var(--ui-text-tertiary); font-size: 9px; }
.announcement-center__rail-empty { padding: 36px 20px; color: var(--ui-text-tertiary); font-size: 10px; text-align: center; }
.announcement-center__main { position: relative; min-width: 0; min-height: 0; background: #fff; }
.announcement-center__toolbar { position: absolute; z-index: 2; top: 28px; right: 52px; display: flex; align-items: center; gap: 12px; }
.announcement-center__toolbar > button,
.announcement-center__state button { display: inline-flex; height: 30px; align-items: center; gap: 6px; padding: 0 10px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 8px; cursor: pointer; }
.announcement-center__ack { display: inline-flex; align-items: center; gap: 6px; color: var(--ui-text-tertiary); font-size: 9px; }
.announcement-center__ack i { width: 6px; height: 6px; background: #28b463; border-radius: 50%; }
.announcement-center__scroll { height: 100%; overflow-y: auto; padding: 0 52px; }
.announcement-center__state { display: grid; height: 100%; place-content: center; justify-items: center; gap: 10px; color: var(--ui-text-tertiary); font-size: 11px; }
.announcement-center__state strong { color: var(--ui-ink); font-size: 16px; }
.announcement-center__state--error strong { color: #b42318; }
.announcement-center__loader { width: 20px; height: 20px; border: 2px solid var(--ui-divider); border-top-color: var(--ui-accent); border-radius: 50%; animation: announcement-spin .8s linear infinite; }
@keyframes announcement-spin { to { transform: rotate(360deg); } }

@media (max-width: 760px) {
  .announcement-center { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .announcement-center__rail { max-height: 250px; border-right: 0; border-bottom: 1px solid var(--ui-divider); }
  .announcement-center__rail header { padding: 14px; }
  .announcement-center__rail nav { display: flex; overflow-x: auto; padding: 0; }
  .announcement-center__rail nav button { min-width: 200px; border-right: 1px solid var(--ui-divider); }
  .announcement-center__toolbar { top: 18px; right: 18px; }
  .announcement-center__ack { display: none; }
  .announcement-center__scroll { padding: 0 18px; }
}
</style>
