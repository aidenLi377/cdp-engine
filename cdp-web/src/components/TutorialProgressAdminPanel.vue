<template>
  <section class="tutorial-progress-admin">
    <header class="tutorial-progress-head">
      <div>
        <p>LEARNING / PROGRESS</p>
        <h2>新手教程进度</h2>
        <span>逐项勾选即保存，用户当前在线时也会自动同步。</span>
      </div>
      <div class="tutorial-progress-summary" aria-label="教程进度概览">
        <span><strong>{{ users.length }}</strong>个账号</span>
        <span><strong>{{ completedUserCount }}</strong>人全部完成</span>
        <button type="button" :disabled="loading" @click="loadProgress">
          {{ loading ? '同步中…' : '刷新进度' }}
        </button>
      </div>
    </header>

    <div class="tutorial-progress-layout">
      <aside class="tutorial-user-directory" aria-label="教程进度用户列表">
        <label class="tutorial-user-search">
          <Search aria-hidden="true" />
          <input v-model.trim="query" type="search" placeholder="搜索姓名或登录账号" />
        </label>
        <div class="tutorial-user-list" role="listbox">
          <button
            v-for="user in filteredUsers"
            :key="user.id"
            type="button"
            class="tutorial-user-row"
            :class="{ active: selectedUserId === user.id }"
            :aria-selected="selectedUserId === user.id"
            @click="selectedUserId = user.id"
          >
            <span class="tutorial-user-avatar">{{ userInitial(user) }}</span>
            <span class="tutorial-user-copy">
              <strong>{{ user.displayName || user.username }}</strong>
              <small>{{ user.username }} · {{ roleLabel(user.role) }}</small>
              <i><b :style="{ width: `${progressPercent(user.id)}%` }"></b></i>
            </span>
            <span class="tutorial-user-score">{{ milestoneCount(user.id) }}/{{ TUTORIAL_MILESTONE_TOTAL }}</span>
          </button>
          <p v-if="!filteredUsers.length">{{ users.length ? '没有匹配的账号' : '还没有系统账号' }}</p>
        </div>
      </aside>

      <section v-if="selectedUser" class="tutorial-progress-detail" aria-labelledby="tutorial-progress-user-title">
        <header class="tutorial-progress-person">
          <div class="tutorial-progress-identity">
            <span class="tutorial-user-avatar is-large">{{ userInitial(selectedUser) }}</span>
            <div>
              <p>USER / LEARNING</p>
              <h3 id="tutorial-progress-user-title">{{ selectedUser.displayName || selectedUser.username }}</h3>
              <small>{{ selectedUser.username }} · 共 {{ TUTORIAL_CATALOG.length }} 门课程、{{ TUTORIAL_MILESTONE_TOTAL }} 项打卡</small>
            </div>
          </div>
          <div class="tutorial-progress-total" :class="{ complete: selectedMilestones >= TUTORIAL_MILESTONE_TOTAL }">
            <strong>{{ selectedMilestones }}</strong><span>/ {{ TUTORIAL_MILESTONE_TOTAL }}</span>
            <small>{{ selectedMilestones >= TUTORIAL_MILESTONE_TOTAL ? '已全部掌握' : `还差 ${TUTORIAL_MILESTONE_TOTAL - selectedMilestones} 项` }}</small>
          </div>
        </header>

        <div class="tutorial-progress-notice">
          <span></span>
          <p><strong>勾选即完成，取消即撤销</strong>管理员校正不受课程解锁顺序限制；保存后用户端无需重新登录。</p>
          <i v-if="saving">正在保存…</i>
          <i v-else-if="savedAt">已保存 {{ formatTime(savedAt) }}</i>
        </div>

        <div v-if="loading && !progressLoaded" class="tutorial-progress-empty">正在读取教程进度…</div>
        <div v-else class="tutorial-course-list">
          <label
            v-for="tutorial in TUTORIAL_CATALOG"
            :key="tutorial.id"
            class="tutorial-course-row"
            :class="{ checked: isCompleted(tutorial.id) }"
          >
            <input
              type="checkbox"
              :checked="isCompleted(tutorial.id)"
              :disabled="saving"
              @change="setTutorialStatus(tutorial.id, $event.target.checked)"
            />
            <span class="tutorial-course-check"><Check v-if="isCompleted(tutorial.id)" aria-hidden="true" /></span>
            <span class="tutorial-course-index">{{ tutorial.sequence }}</span>
            <span class="tutorial-course-copy">
              <strong>{{ tutorial.title }}</strong>
              <small>{{ tutorial.businessProblem }}</small>
              <i>{{ tutorial.capability }}</i>
            </span>
            <span v-if="tutorialWeight(tutorial.id) > 1" class="tutorial-course-weight">计 {{ tutorialWeight(tutorial.id) }} 项</span>
            <span class="tutorial-course-state">{{ isCompleted(tutorial.id) ? '已完成' : '未完成' }}</span>
          </label>
        </div>

        <p v-if="errorMessage" class="tutorial-progress-error">{{ errorMessage }}</p>
      </section>
      <div v-else class="tutorial-progress-empty">请选择一个账号查看教程进度</div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Check, Search } from '@element-plus/icons-vue'
import { request } from '../utils/apiClient.js'
import {
  TUTORIAL_CATALOG,
  TUTORIAL_MILESTONE_TOTAL,
  TUTORIAL_MILESTONE_WEIGHTS,
  countCompletedMilestones,
} from '../utils/tutorialCatalog.js'
import { TUTORIAL_PROGRESS_EVENT } from '../utils/tutorialProgress.js'

const props = defineProps({
  users: { type: Array, default: () => [] },
  currentUserId: { type: String, default: '' },
})

const progressRows = ref([])
const selectedUserId = ref('')
const query = ref('')
const loading = ref(false)
const saving = ref(false)
const progressLoaded = ref(false)
const errorMessage = ref('')
const savedAt = ref('')

const progressByUser = computed(() => {
  const groups = new Map()
  for (const row of progressRows.value) {
    if (!groups.has(row.userId)) groups.set(row.userId, [])
    groups.get(row.userId).push(row)
  }
  return groups
})
const filteredUsers = computed(() => {
  const normalized = query.value.toLowerCase()
  if (!normalized) return props.users
  return props.users.filter((user) => [user.displayName, user.username, roleLabel(user.role)]
    .some((value) => String(value || '').toLowerCase().includes(normalized)))
})
const selectedUser = computed(() => props.users.find((user) => user.id === selectedUserId.value) || null)
const selectedItems = computed(() => progressByUser.value.get(selectedUserId.value) || [])
const selectedCompletedIds = computed(() => new Set(selectedItems.value.map((item) => item.tutorialId)))
const selectedMilestones = computed(() => countCompletedMilestones(selectedItems.value))
const completedUserCount = computed(() => props.users.filter(
  (user) => milestoneCount(user.id) >= TUTORIAL_MILESTONE_TOTAL,
).length)

watch(
  () => props.users,
  (users) => {
    if (!users.some((user) => user.id === selectedUserId.value)) {
      selectedUserId.value = users[0]?.id || ''
    }
  },
  { immediate: true },
)

function roleLabel(role) {
  return { super_admin: '超级管理员', config_admin: '配置管理员', user: '普通用户' }[role] || '普通用户'
}

function userInitial(user) {
  return String(user?.displayName || user?.username || 'U').trim().slice(0, 1).toUpperCase()
}

function tutorialWeight(tutorialId) {
  return TUTORIAL_MILESTONE_WEIGHTS[tutorialId] || 1
}

function milestoneCount(userId) {
  return countCompletedMilestones(progressByUser.value.get(userId) || [])
}

function progressPercent(userId) {
  return Math.min(100, Math.round((milestoneCount(userId) / TUTORIAL_MILESTONE_TOTAL) * 100))
}

function isCompleted(tutorialId) {
  return selectedCompletedIds.value.has(tutorialId)
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)
}

function replaceUserProgress(userId, items) {
  progressRows.value = [
    ...progressRows.value.filter((item) => item.userId !== userId),
    ...items.map((item) => ({ ...item, userId })),
  ]
}

async function loadProgress() {
  loading.value = true
  errorMessage.value = ''
  try {
    const rows = await request('/api/admin/tutorial-progress', { cache: 'no-store' })
    progressRows.value = Array.isArray(rows) ? rows : []
    progressLoaded.value = true
  } catch (error) {
    errorMessage.value = error.message || '教程进度读取失败'
  } finally {
    loading.value = false
  }
}

async function setTutorialStatus(tutorialId, checked) {
  const userId = selectedUserId.value
  if (!userId || saving.value) return
  const previousItems = [...selectedItems.value]
  const nextIds = new Set(previousItems.map((item) => item.tutorialId))
  if (checked) nextIds.add(tutorialId)
  else nextIds.delete(tutorialId)

  const now = new Date().toISOString()
  replaceUserProgress(userId, [...nextIds].map((id) => {
    const existing = previousItems.find((item) => item.tutorialId === id)
    return existing || { tutorialId: id, completedAt: now, updatedAt: now }
  }))
  saving.value = true
  errorMessage.value = ''
  try {
    const result = await request(`/api/admin/users/${encodeURIComponent(userId)}/tutorial-progress`, {
      method: 'PUT',
      body: JSON.stringify({ completedTutorialIds: [...nextIds] }),
    })
    replaceUserProgress(userId, result.items || [])
    savedAt.value = new Date().toISOString()
    if (userId === props.currentUserId) {
      window.dispatchEvent(new CustomEvent(TUTORIAL_PROGRESS_EVENT))
    }
  } catch (error) {
    replaceUserProgress(userId, previousItems)
    errorMessage.value = error.message || '教程进度保存失败，已恢复修改前状态'
  } finally {
    saving.value = false
  }
}

onMounted(loadProgress)
</script>

<style scoped>
.tutorial-progress-admin { overflow: hidden; background: #fff; border: 1px solid var(--ui-divider); border-radius: 18px; animation: tutorial-admin-enter .22s ease-out both; }
.tutorial-progress-head { display: flex; min-height: 86px; box-sizing: border-box; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 20px 24px 17px; border-bottom: 1px solid var(--ui-divider); }
.tutorial-progress-head p, .tutorial-progress-identity p { margin: 0 0 6px; color: var(--ui-accent); font: 700 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; }
.tutorial-progress-head h2 { margin: 0; font-size: 20px; font-weight: 660; letter-spacing: -.035em; }
.tutorial-progress-head > div > span { display: block; margin-top: 6px; color: var(--ui-text-secondary); font-size: 10px; }
.tutorial-progress-summary { display: flex; align-items: center; gap: 8px; }
.tutorial-progress-summary > span { display: inline-flex; height: 34px; align-items: baseline; gap: 4px; padding: 0 11px; color: var(--ui-text-secondary); font-size: 9px; line-height: 34px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 9px; }
.tutorial-progress-summary strong { color: var(--ui-ink); font-size: 14px; }
.tutorial-progress-summary button { height: 34px; padding: 0 12px; color: #fff; font: inherit; font-size: 9px; font-weight: 650; background: var(--ui-ink); border: 0; border-radius: 9px; cursor: pointer; }
.tutorial-progress-summary button:disabled { cursor: wait; opacity: .55; }
.tutorial-progress-layout { display: grid; min-height: 570px; grid-template-columns: 280px minmax(0, 1fr); }
.tutorial-user-directory { min-width: 0; background: #fbfbfc; border-right: 1px solid var(--ui-divider); }
.tutorial-user-search { display: flex; height: 36px; align-items: center; gap: 8px; margin: 16px; padding: 0 10px; color: var(--ui-text-tertiary); background: #fff; border: 1px solid var(--ui-control-border); border-radius: 9px; }
.tutorial-user-search svg { width: 14px; }
.tutorial-user-search input { width: 100%; color: var(--ui-ink); font: inherit; font-size: 10px; background: transparent; border: 0; outline: 0; }
.tutorial-user-list { max-height: 590px; overflow-y: auto; padding: 0 8px 12px; }
.tutorial-user-list > p, .tutorial-progress-empty { display: grid; min-height: 180px; place-items: center; margin: 0; color: var(--ui-text-tertiary); font-size: 10px; }
.tutorial-user-row { display: grid; width: 100%; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 11px 10px; color: var(--ui-ink); font: inherit; text-align: left; background: transparent; border: 0; border-radius: 11px; cursor: pointer; }
.tutorial-user-row:hover { background: #f2f4f7; }
.tutorial-user-row.active { background: #fff; box-shadow: inset 3px 0 0 var(--ui-accent), 0 5px 18px rgba(20, 27, 38, .06); }
.tutorial-user-avatar { display: grid; width: 32px; height: 32px; place-items: center; color: #fff; font-size: 11px; font-weight: 700; background: var(--ui-ink); border-radius: 50%; }
.tutorial-user-avatar.is-large { width: 42px; height: 42px; font-size: 15px; }
.tutorial-user-copy { min-width: 0; }
.tutorial-user-copy strong, .tutorial-user-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tutorial-user-copy strong { font-size: 11px; font-weight: 650; }
.tutorial-user-copy small { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 8px; }
.tutorial-user-copy i { display: block; height: 3px; margin-top: 7px; overflow: hidden; background: #e8ebef; border-radius: 999px; }
.tutorial-user-copy i b { display: block; height: 100%; background: var(--ui-accent); border-radius: inherit; transition: width .24s ease; }
.tutorial-user-score { min-width: 34px; color: var(--ui-text-secondary); font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.tutorial-progress-detail { min-width: 0; padding: 22px 26px 28px; }
.tutorial-progress-person { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--ui-divider); }
.tutorial-progress-identity { display: flex; min-width: 0; align-items: center; gap: 12px; }
.tutorial-progress-identity h3 { margin: 0; font-size: 18px; font-weight: 660; letter-spacing: -.03em; }
.tutorial-progress-identity small { display: block; margin-top: 4px; color: var(--ui-text-secondary); font-size: 9px; }
.tutorial-progress-total { display: grid; min-width: 104px; grid-template-columns: auto auto; align-items: baseline; justify-content: end; column-gap: 3px; color: var(--ui-ink); }
.tutorial-progress-total strong { font-size: 28px; line-height: 1; letter-spacing: -.06em; }
.tutorial-progress-total > span { color: var(--ui-text-tertiary); font-size: 11px; }
.tutorial-progress-total small { grid-column: 1 / -1; margin-top: 5px; color: var(--ui-accent); font-size: 8px; text-align: right; }
.tutorial-progress-total.complete small { color: #18794e; }
.tutorial-progress-notice { display: flex; min-height: 42px; align-items: center; gap: 10px; margin: 14px 0; padding: 0 12px; background: #f7f8fa; border: 1px solid #eceef1; border-radius: 10px; }
.tutorial-progress-notice > span { width: 7px; height: 7px; flex: 0 0 7px; background: #28a86b; border-radius: 50%; box-shadow: 0 0 0 4px rgba(40, 168, 107, .1); }
.tutorial-progress-notice p { min-width: 0; margin: 0 auto 0 0; color: var(--ui-text-secondary); font-size: 9px; line-height: 1.45; }
.tutorial-progress-notice p strong { margin-right: 7px; color: var(--ui-ink); }
.tutorial-progress-notice i { flex-shrink: 0; color: #18794e; font-size: 8px; font-style: normal; }
.tutorial-course-list { display: grid; gap: 8px; }
.tutorial-course-row { display: grid; min-height: 66px; box-sizing: border-box; grid-template-columns: 24px 30px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 10px 13px; background: #fff; border: 1px solid #e4e7eb; border-radius: 11px; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease; }
.tutorial-course-row:hover { border-color: #bfc5cd; transform: translateY(-1px); }
.tutorial-course-row.checked { background: #f6fbf8; border-color: #bfe4d0; }
.tutorial-course-row input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.tutorial-course-check { display: grid; width: 22px; height: 22px; box-sizing: border-box; place-items: center; color: #fff; background: #fff; border: 1px solid #c9ced6; border-radius: 7px; }
.tutorial-course-check svg { width: 14px; }
.tutorial-course-row.checked .tutorial-course-check { background: #202124; border-color: #202124; }
.tutorial-course-index { color: #9aa2ad; font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.tutorial-course-copy { min-width: 0; }
.tutorial-course-copy strong, .tutorial-course-copy small, .tutorial-course-copy i { display: block; }
.tutorial-course-copy strong { font-size: 11px; font-weight: 650; }
.tutorial-course-copy small { overflow: hidden; margin-top: 3px; color: var(--ui-text-secondary); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.tutorial-course-copy i { margin-top: 5px; color: #8c96a5; font-size: 8px; font-style: normal; }
.tutorial-course-weight { padding: 4px 7px; color: #176fc2; font-size: 8px; font-weight: 650; background: #edf6ff; border-radius: 999px; }
.tutorial-course-state { min-width: 44px; color: #929ba7; font-size: 9px; text-align: right; }
.tutorial-course-row.checked .tutorial-course-state { color: #18794e; font-weight: 650; }
.tutorial-progress-error { margin: 12px 0 0; padding: 9px 11px; color: #b42318; font-size: 9px; background: #fff1f0; border-radius: 8px; }
@keyframes tutorial-admin-enter { from { opacity: 0; transform: translateY(6px); } }
@media (max-width: 900px) { .tutorial-progress-layout { grid-template-columns: 220px minmax(0, 1fr); } .tutorial-course-row { grid-template-columns: 24px 26px minmax(0, 1fr) auto; } .tutorial-course-weight { display: none; } }
@media (max-width: 720px) { .tutorial-progress-head { align-items: flex-start; flex-direction: column; } .tutorial-progress-summary { flex-wrap: wrap; } .tutorial-progress-layout { grid-template-columns: 1fr; } .tutorial-user-directory { border-right: 0; border-bottom: 1px solid var(--ui-divider); } .tutorial-user-list { max-height: 230px; } .tutorial-progress-person { align-items: flex-start; } .tutorial-course-copy small { white-space: normal; } }
</style>
