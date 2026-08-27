<template>
  <section class="feedback-admin-panel">
    <header class="feedback-admin-head">
      <div>
        <p>USER FEEDBACK / INBOX</p>
        <h2>用户反馈</h2>
      </div>
      <div class="feedback-admin-tools">
        <div class="feedback-admin-tabs">
          <button v-for="tab in tabs" :key="tab.value" type="button" :class="{ active: filter === tab.value }" @click="filter = tab.value">
            {{ tab.label }} <span>{{ countByStatus(tab.value) }}</span>
          </button>
        </div>
        <button class="feedback-admin-refresh" type="button" :disabled="loading" @click="loadFeedback">
          {{ loading ? '读取中…' : '刷新' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="feedback-admin-empty">正在读取用户反馈…</div>
    <div v-else-if="!filteredItems.length" class="feedback-admin-empty">当前筛选下还没有反馈</div>
    <div v-else class="feedback-admin-list">
      <article v-for="item in filteredItems" :key="item.id" :class="`feedback-${item.status}`">
        <div class="feedback-admin-meta">
          <span class="feedback-admin-avatar">{{ userInitial(item) }}</span>
          <div>
            <strong>{{ item.creatorDisplayName || item.creatorUsername || '已注销用户' }}</strong>
            <small>@{{ item.creatorUsername || 'unknown' }} · {{ formatDate(item.createdAt) }}</small>
          </div>
          <span class="feedback-category">{{ categoryLabel(item.category) }}</span>
          <select :value="item.status" :disabled="busyId === item.id" @change="updateStatus(item, $event.target.value)">
            <option value="new">待处理</option>
            <option value="reviewing">处理中</option>
            <option value="resolved">已完成</option>
          </select>
        </div>
        <p class="feedback-admin-message">{{ item.message }}</p>
        <div v-if="item.attachments?.length" class="feedback-admin-images">
          <a v-for="image in item.attachments" :key="image.id" :href="attachmentUrl(image.id)" target="_blank" rel="noopener">
            <img :src="attachmentUrl(image.id)" :alt="image.originalName" loading="lazy" />
          </a>
        </div>
        <footer>
          <span>{{ item.pagePath || '未记录页面' }}</span>
          <span>{{ item.viewport || '未记录视窗' }}</span>
        </footer>
      </article>
    </div>
    <p v-if="errorMessage" class="feedback-admin-error">{{ errorMessage }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { request } from '../utils/apiClient.js'

const items = ref([])
const loading = ref(false)
const filter = ref('all')
const busyId = ref('')
const errorMessage = ref('')
const tabs = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '待处理' },
  { value: 'reviewing', label: '处理中' },
  { value: 'resolved', label: '已完成' },
]
const filteredItems = computed(() => filter.value === 'all' ? items.value : items.value.filter((item) => item.status === filter.value))

function countByStatus(status) {
  return status === 'all' ? items.value.length : items.value.filter((item) => item.status === status).length
}
function userInitial(item) {
  return String(item.creatorDisplayName || item.creatorUsername || 'U').trim().slice(0, 1).toUpperCase()
}
function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
function categoryLabel(category) {
  return { suggestion: '功能建议', bug: '问题反馈', question: '使用疑问', other: '其他' }[category] || '反馈'
}
function attachmentUrl(id) {
  return `/api/admin/feedback/attachments/${encodeURIComponent(id)}`
}

async function loadFeedback() {
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await request('/api/admin/feedback', { cache: 'no-store' })
  } catch (error) {
    errorMessage.value = error.message || '用户反馈读取失败'
  } finally {
    loading.value = false
  }
}

async function updateStatus(item, status) {
  busyId.value = item.id
  try {
    const updated = await request(`/api/admin/feedback/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    items.value = items.value.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry)
    window.dispatchEvent(new CustomEvent('cdp:feedback-status-updated', { detail: updated }))
  } catch (error) {
    errorMessage.value = error.message || '反馈状态更新失败'
  } finally {
    busyId.value = ''
  }
}

onMounted(() => {
  window.addEventListener('cdp:feedback-submitted', loadFeedback)
  loadFeedback()
})
onBeforeUnmount(() => window.removeEventListener('cdp:feedback-submitted', loadFeedback))
</script>

<style scoped>
.feedback-admin-panel { grid-column: 1 / -1; overflow: hidden; background: #fff; border: 1px solid var(--ui-divider); border-radius: 18px; }
.feedback-admin-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; padding: 22px 24px 17px; border-bottom: 1px solid var(--ui-divider); }
.feedback-admin-head p { margin: 0 0 7px; color: var(--ui-accent); font: 700 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; }
.feedback-admin-head h2 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -.03em; }
.feedback-admin-tools { display: flex; align-items: center; gap: 8px; }
.feedback-admin-tabs { display: inline-flex; gap: 4px; padding: 3px; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 9px; }
.feedback-admin-tabs button { height: 27px; padding: 0 9px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: transparent; border: 0; border-radius: 7px; cursor: pointer; }
.feedback-admin-tabs button.active { color: #fff; background: var(--ui-ink); }
.feedback-admin-tabs span { margin-left: 3px; opacity: .7; }
.feedback-admin-refresh { height: 33px; padding: 0 10px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 8px; cursor: pointer; }
.feedback-admin-refresh:disabled { cursor: wait; opacity: .55; }
.feedback-admin-list { display: grid; gap: 0; }
.feedback-admin-list article { position: relative; padding: 19px 24px; background: #fff; border-top: 1px solid var(--ui-divider); }
.feedback-admin-list article:first-child { border-top: 0; }
.feedback-admin-list article::before { position: absolute; top: 19px; bottom: 19px; left: 0; width: 2px; content: ""; background: transparent; }
.feedback-admin-list article.feedback-new::before { background: var(--ui-accent); }
.feedback-admin-meta { display: flex; align-items: center; gap: 9px; }
.feedback-admin-avatar { display: grid; place-items: center; width: 31px; height: 31px; color: #fff; font-size: 11px; font-weight: 700; background: var(--ui-ink); border-radius: 50%; }
.feedback-admin-meta div { min-width: 0; margin-right: auto; }
.feedback-admin-meta strong, .feedback-admin-meta small { display: block; }
.feedback-admin-meta strong { font-size: 11px; }
.feedback-admin-meta small { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 9px; }
.feedback-category { padding: 4px 7px; color: var(--ui-accent); font-size: 9px; background: #fff; border: 1px solid color-mix(in srgb, var(--ui-accent) 38%, var(--ui-divider)); border-radius: 999px; }
.feedback-admin-meta select { height: 28px; padding: 0 25px 0 8px; color: var(--ui-ink); font: inherit; font-size: 9px; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 7px; }
.feedback-admin-message { margin: 14px 0 0 40px; color: var(--ui-ink); font-size: 12px; line-height: 1.7; white-space: pre-wrap; }
.feedback-admin-images { display: flex; gap: 8px; margin: 13px 0 0 40px; }
.feedback-admin-images a { display: block; width: 112px; height: 78px; overflow: hidden; background: #fff; border: 1px solid var(--ui-divider); border-radius: 9px; }
.feedback-admin-images img { width: 100%; height: 100%; object-fit: cover; transition: transform 180ms ease; }
.feedback-admin-images a:hover img { transform: scale(1.035); }
.feedback-admin-list footer { display: flex; gap: 13px; margin: 13px 0 0 40px; color: var(--ui-text-tertiary); font: 9px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
.feedback-admin-empty { padding: 42px 24px; color: var(--ui-text-tertiary); font-size: 11px; text-align: center; }
.feedback-admin-error { margin: 0; padding: 10px 24px; color: #b42318; font-size: 10px; background: #fff1f0; }
@media (max-width: 760px) { .feedback-admin-head { align-items: flex-start; flex-direction: column; } .feedback-admin-tools { align-items: flex-start; flex-direction: column; } .feedback-admin-meta { flex-wrap: wrap; } .feedback-admin-message, .feedback-admin-images, .feedback-admin-list footer { margin-left: 0; } }
</style>
