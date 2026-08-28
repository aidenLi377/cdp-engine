<template>
  <section class="announcement-admin">
    <aside class="announcement-admin__list">
      <header>
        <div>
          <p>CONTENT STUDIO</p>
          <h2>公告与教程</h2>
        </div>
        <button type="button" class="announcement-admin__new" @click="startNew">
          <el-icon><Plus /></el-icon>
          新建内容
        </button>
      </header>

      <div class="announcement-admin__kind-filters">
        <button v-for="option in kindFilters" :key="option.value" type="button" :class="{ active: kindFilter === option.value }" @click="kindFilter = option.value">
          {{ option.label }} <span>{{ countKind(option.value) }}</span>
        </button>
      </div>

      <div class="announcement-admin__filters">
        <button v-for="option in filters" :key="option.value" type="button" :class="{ active: filter === option.value }" @click="filter = option.value">
          {{ option.label }} <span>{{ countStatus(option.value) }}</span>
        </button>
      </div>

      <div v-if="loading" class="announcement-admin__empty">正在读取公告…</div>
      <div v-else-if="!filteredItems.length" class="announcement-admin__empty">当前筛选下还没有内容</div>
      <nav v-else>
        <button
          v-for="item in filteredItems"
          :key="item.id"
          type="button"
          :class="{ active: item.id === selectedId }"
          @click="selectItem(item)"
        >
          <span class="announcement-admin__item-version">{{ item.kind === 'tutorial' ? 'GUIDE' : `V${item.version}` }}</span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.status === 'published' ? `已发布 · ${item.readCount || 0} 人已读` : `草稿 · ${formatDate(item.updatedAt)}` }}</small>
          <i :class="item.status"></i>
        </button>
      </nav>
    </aside>

    <main class="announcement-admin__workspace">
      <header class="announcement-admin__workspace-head">
        <div>
          <p>{{ selectedItem?.status === 'published' ? 'PUBLISHED CONTENT' : isNew ? 'NEW CONTENT' : 'DRAFT CONTENT' }}</p>
          <h2>{{ isNew ? '创建公告或教程' : form.title || '未命名内容' }}</h2>
          <span v-if="selectedItem?.status === 'published'">已发布内容保持只读；撤回后可继续修改。</span>
          <span v-else>保存为草稿后，可由具备发布权限的管理人员正式发布。</span>
        </div>
        <div class="announcement-admin__view-switch">
          <button type="button" :class="{ active: viewMode === 'edit' }" @click="viewMode = 'edit'">
            <el-icon><EditPen /></el-icon>编辑
          </button>
          <button type="button" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">
            <el-icon><View /></el-icon>预览
          </button>
        </div>
      </header>

      <div v-if="viewMode === 'preview'" class="announcement-admin__preview">
        <AnnouncementArticle :announcement="previewAnnouncement" />
      </div>

      <form v-else class="announcement-admin__editor" @submit.prevent="saveDraft">
        <fieldset :disabled="readOnly || busy">
          <section class="announcement-admin__section">
            <div class="announcement-admin__section-title">
              <span>01</span>
              <div><h3>基础资料</h3><p>选择内容类型，并填写列表与详情页所需信息</p></div>
            </div>
            <div class="announcement-admin__field-grid">
              <div class="announcement-admin__kind-picker announcement-admin__field--full">
                <span>内容类型</span>
                <div>
                  <button type="button" :class="{ active: form.kind === 'announcement' }" @click="form.kind = 'announcement'">
                    <strong>更新公告</strong><small>说明版本变化与新增功能</small>
                  </button>
                  <button type="button" :class="{ active: form.kind === 'tutorial' }" @click="form.kind = 'tutorial'">
                    <strong>新手教程</strong><small>提供操作指南与学习内容</small>
                  </button>
                </div>
              </div>
              <label v-if="form.kind === 'announcement'" class="announcement-admin__field announcement-admin__field--version">
                <span>版本号</span>
                <input v-model.trim="form.version" maxlength="40" placeholder="例如 2.3.0" />
              </label>
              <label class="announcement-admin__field" :class="{ 'announcement-admin__field--full': form.kind === 'tutorial' }">
                <span>{{ form.kind === 'tutorial' ? '教程标题' : '公告标题' }}</span>
                <input v-model.trim="form.title" maxlength="160" :placeholder="form.kind === 'tutorial' ? '例如：三分钟完成第一个人群方案' : '用一句话说明本次更新'" />
              </label>
              <label class="announcement-admin__field announcement-admin__field--full">
                <span>内容摘要</span>
                <textarea v-model.trim="form.summary" maxlength="800" rows="3" placeholder="简要说明这篇内容能帮助用户了解什么"></textarea>
              </label>
            </div>
          </section>

          <section v-if="form.kind === 'announcement'" class="announcement-admin__section">
            <div class="announcement-admin__section-title">
              <span>02</span>
              <div><h3>本次亮点</h3><p>提炼版本变化，完整公告最多支持五项</p></div>
              <button v-if="form.highlights.length < 5" type="button" @click="form.highlights.push('')"><el-icon><Plus /></el-icon>添加亮点</button>
            </div>
            <div class="announcement-admin__highlight-list">
              <label v-for="(_, index) in form.highlights" :key="index">
                <span>{{ String(index + 1).padStart(2, '0') }}</span>
                <input v-model.trim="form.highlights[index]" maxlength="120" :placeholder="`第 ${index + 1} 项更新亮点`" />
                <button type="button" aria-label="删除亮点" @click="form.highlights.splice(index, 1)"><el-icon><Close /></el-icon></button>
              </label>
              <button v-if="!form.highlights.length" type="button" class="announcement-admin__inline-add" @click="form.highlights.push('')">＋ 添加第一项更新亮点</button>
            </div>
          </section>

          <section class="announcement-admin__section announcement-admin__section--blocks">
            <div class="announcement-admin__section-title">
              <span>{{ form.kind === 'announcement' ? '03' : '02' }}</span>
              <div><h3>在线内容</h3><p>像在线文档一样，按阅读顺序穿插文字、图片与视频</p></div>
            </div>

            <div class="announcement-admin__block-tools">
              <button type="button" @click="addBlock('heading')"><el-icon><Document /></el-icon>小标题</button>
              <button type="button" @click="addBlock('paragraph')"><el-icon><EditPen /></el-icon>正文</button>
              <button type="button" @click="addBlock('list')"><el-icon><Tickets /></el-icon>列表</button>
              <button type="button" :disabled="uploading" @click="openImagePicker"><el-icon><Picture /></el-icon>{{ uploading ? '上传中…' : '上传图片' }}</button>
              <button type="button" :disabled="uploading" @click="openVideoPicker"><el-icon><VideoPlay /></el-icon>{{ uploading ? '上传中…' : '上传视频' }}</button>
              <input ref="imageInput" class="announcement-admin__file-input" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadAsset($event, 'image')" />
              <input ref="videoInput" class="announcement-admin__file-input" type="file" accept="video/mp4,video/webm" @change="uploadAsset($event, 'video')" />
            </div>

            <div v-if="!form.content.length" class="announcement-admin__block-empty">
              <el-icon><Document /></el-icon>
              <strong>从一段文字、图片或视频开始</strong>
              <span>发布前至少需要添加一个正文区块</span>
            </div>

            <div v-else class="announcement-admin__blocks">
              <article v-for="(block, index) in form.content" :key="block.key" class="announcement-admin__block">
                <div class="announcement-admin__block-index">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <small>{{ blockTypeLabel(block.type) }}</small>
                </div>
                <div class="announcement-admin__block-body">
                  <input v-if="block.type === 'heading'" v-model.trim="block.text" maxlength="120" placeholder="输入小标题" />
                  <textarea v-else-if="block.type === 'paragraph'" v-model.trim="block.text" maxlength="4000" rows="5" placeholder="输入公告正文，可分段添加多个正文区块"></textarea>
                  <textarea v-else-if="block.type === 'list'" v-model="block.listText" rows="5" placeholder="每行一项，最多 12 项"></textarea>
                  <div v-else-if="block.type === 'image'" class="announcement-admin__image-block">
                    <img :src="assetUrl(block.assetId)" :alt="block.alt || '公告图片预览'" />
                    <div>
                      <label><span>图片说明</span><input v-model.trim="block.alt" maxlength="180" placeholder="用于无障碍阅读" /></label>
                      <label><span>图片注释</span><input v-model.trim="block.caption" maxlength="240" placeholder="显示在图片下方，可不填" /></label>
                    </div>
                  </div>
                  <div v-else-if="block.type === 'video'" class="announcement-admin__image-block announcement-admin__video-block">
                    <video :src="assetUrl(block.assetId)" controls preload="metadata"></video>
                    <div>
                      <label><span>视频说明</span><input v-model.trim="block.alt" maxlength="180" placeholder="用于无障碍阅读" /></label>
                      <label><span>视频注释</span><input v-model.trim="block.caption" maxlength="240" placeholder="显示在视频下方，可不填" /></label>
                    </div>
                  </div>
                </div>
                <div class="announcement-admin__block-actions">
                  <button type="button" :disabled="index === 0" aria-label="上移" @click="moveBlock(index, -1)"><el-icon><Top /></el-icon></button>
                  <button type="button" :disabled="index === form.content.length - 1" aria-label="下移" @click="moveBlock(index, 1)"><el-icon><Bottom /></el-icon></button>
                  <button type="button" aria-label="删除区块" @click="form.content.splice(index, 1)"><el-icon><Delete /></el-icon></button>
                </div>
              </article>
            </div>
          </section>
        </fieldset>
      </form>

      <footer class="announcement-admin__footer">
        <p v-if="errorMessage" class="announcement-admin__error">{{ errorMessage }}</p>
        <p v-else-if="successMessage" class="announcement-admin__success">{{ successMessage }}</p>
        <span v-else>{{ readOnly ? `${selectedItem.readCount || 0} 位用户已阅读` : '图片不超过 8 MB；视频支持 MP4、WebM，不超过 100 MB' }}</span>
        <div>
          <button v-if="selectedItem && isSystemOwner && selectedItem.status === 'draft'" type="button" class="announcement-admin__danger" :disabled="busy" @click="removeDraft">删除草稿</button>
          <button v-if="selectedItem && isSystemOwner && selectedItem.status === 'published'" type="button" class="announcement-admin__secondary" :disabled="busy" @click="unpublish">撤回公告</button>
          <button v-if="!readOnly" type="button" class="announcement-admin__secondary" :disabled="busy" @click="saveDraft">{{ busy ? '保存中…' : '保存草稿' }}</button>
          <button v-if="selectedItem && isSystemOwner && selectedItem.status === 'draft'" type="button" class="announcement-admin__primary" :disabled="busy" @click="publish">正式发布</button>
        </div>
      </footer>
    </main>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Bottom, Close, Delete, Document, EditPen, Picture, Plus, Tickets, Top, VideoPlay, View } from '@element-plus/icons-vue'
import AnnouncementArticle from './AnnouncementArticle.vue'
import { request } from '../utils/apiClient.js'

const props = defineProps({
  isSystemOwner: {
    type: Boolean,
    default: false,
  },
})

const items = ref([])
const loading = ref(false)
const busy = ref(false)
const uploading = ref(false)
const selectedId = ref('')
const isNew = ref(true)
const filter = ref('all')
const kindFilter = ref('all')
const viewMode = ref('edit')
const errorMessage = ref('')
const successMessage = ref('')
const imageInput = ref(null)
const videoInput = ref(null)
const kindFilters = [
  { value: 'all', label: '全部内容' },
  { value: 'announcement', label: '更新公告' },
  { value: 'tutorial', label: '新手教程' },
]
const filters = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
]

const form = reactive(emptyForm())
const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) || null)
const filteredItems = computed(() => items.value.filter((item) => {
  const kindMatches = kindFilter.value === 'all' || (item.kind || 'announcement') === kindFilter.value
  const statusMatches = filter.value === 'all' || item.status === filter.value
  return kindMatches && statusMatches
}))
const readOnly = computed(() => selectedItem.value?.status === 'published')
const previewAnnouncement = computed(() => ({
  ...selectedItem.value,
  kind: form.kind,
  version: form.version || '—',
  title: form.title || (form.kind === 'tutorial' ? '未命名新手教程' : '未命名更新公告'),
  summary: form.summary,
  highlights: form.highlights.filter(Boolean),
  content: normalizedContent(),
  updatedAt: selectedItem.value?.updatedAt || new Date().toISOString(),
}))

function emptyForm() {
  return {
    kind: 'announcement',
    version: '',
    title: '',
    summary: '',
    highlights: ['', '', ''],
    content: [],
  }
}

function replaceForm(item = null) {
  const next = item || emptyForm()
  form.kind = next.kind || 'announcement'
  form.version = next.version || ''
  form.title = next.title || ''
  form.summary = next.summary || ''
  form.highlights.splice(0, form.highlights.length, ...((next.highlights?.length ? next.highlights : ['', '', ''])))
  form.content.splice(0, form.content.length, ...((next.content || []).map((block) => hydrateBlock(block))))
}

function hydrateBlock(block) {
  return {
    ...block,
    key: crypto.randomUUID(),
    listText: block.type === 'list' ? (block.items || []).join('\n') : undefined,
  }
}

function normalizedContent() {
  return form.content.map(({ key, listText, ...block }) => block.type === 'list'
    ? { ...block, items: String(listText || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }
    : block)
}

function countStatus(status) {
  const kindItems = kindFilter.value === 'all' ? items.value : items.value.filter((item) => (item.kind || 'announcement') === kindFilter.value)
  return status === 'all' ? kindItems.length : kindItems.filter((item) => item.status === status).length
}

function countKind(kind) {
  return kind === 'all' ? items.value.length : items.value.filter((item) => (item.kind || 'announcement') === kind).length
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function assetUrl(assetId) {
  return `/api/announcement-assets/${encodeURIComponent(assetId)}`
}

function blockTypeLabel(type) {
  return { heading: '小标题', paragraph: '正文', list: '列表', image: '图片', video: '视频' }[type] || type
}

function clearMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function startNew() {
  selectedId.value = ''
  isNew.value = true
  viewMode.value = 'edit'
  replaceForm()
  clearMessages()
}

function selectItem(item) {
  selectedId.value = item.id
  isNew.value = false
  replaceForm(item)
  clearMessages()
}

function addBlock(type) {
  const template = {
    heading: { type, text: '' },
    paragraph: { type, text: '' },
    list: { type, items: [], listText: '' },
  }[type]
  form.content.push(hydrateBlock(template))
}

function moveBlock(index, direction) {
  const target = index + direction
  if (target < 0 || target >= form.content.length) return
  const [block] = form.content.splice(index, 1)
  form.content.splice(target, 0, block)
}

function openImagePicker() {
  imageInput.value?.click()
}

function openVideoPicker() {
  videoInput.value?.click()
}

async function uploadAsset(event, type) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploading.value = true
  clearMessages()
  try {
    const body = new FormData()
    body.append('file', file)
    const asset = await request('/api/admin/announcements/assets', { method: 'POST', body })
    form.content.push(hydrateBlock({
      type,
      assetId: asset.id,
      alt: '',
      caption: '',
    }))
    successMessage.value = `${type === 'video' ? '视频' : '图片'}已上传并添加到正文末尾`
  } catch (error) {
    errorMessage.value = error.message || `${type === 'video' ? '视频' : '图片'}上传失败`
  } finally {
    uploading.value = false
  }
}

function payload() {
  return {
    kind: form.kind,
    version: form.version,
    title: form.title,
    summary: form.summary,
    highlights: form.highlights.map((item) => item.trim()).filter(Boolean),
    content: normalizedContent(),
  }
}

async function loadItems(preferredId = selectedId.value) {
  loading.value = true
  clearMessages()
  try {
    items.value = await request('/api/admin/announcements', { params: { limit: 100 }, cache: 'no-store' })
    const next = items.value.find((item) => item.id === preferredId) || items.value[0]
    if (next) selectItem(next)
    else startNew()
  } catch (error) {
    errorMessage.value = error.message || '公告列表读取失败'
  } finally {
    loading.value = false
  }
}

async function saveDraft() {
  if (readOnly.value || busy.value) return null
  busy.value = true
  clearMessages()
  try {
    const item = isNew.value
      ? await request('/api/admin/announcements', { method: 'POST', body: JSON.stringify(payload()) })
      : await request(`/api/admin/announcements/${encodeURIComponent(selectedId.value)}`, { method: 'PATCH', body: JSON.stringify(payload()) })
    const existingIndex = items.value.findIndex((entry) => entry.id === item.id)
    if (existingIndex >= 0) items.value.splice(existingIndex, 1, item)
    else items.value.unshift(item)
    selectedId.value = item.id
    isNew.value = false
    replaceForm(item)
    successMessage.value = '草稿已保存'
    notifyChanged()
    return item
  } catch (error) {
    errorMessage.value = error.message || '公告草稿保存失败'
    return null
  } finally {
    busy.value = false
  }
}

async function publish() {
  if (!props.isSystemOwner || busy.value) return
  let draft = selectedItem.value
  if (!draft || hasUnsavedChanges(draft)) draft = await saveDraft()
  if (!draft) return
  busy.value = true
  clearMessages()
  try {
    const item = await request(`/api/admin/announcements/${encodeURIComponent(draft.id)}/publish`, { method: 'POST' })
    updateItem(item)
    selectItem(item)
    successMessage.value = '公告已正式发布，用户端现已可见'
    notifyChanged()
  } catch (error) {
    errorMessage.value = error.message || '公告发布失败'
  } finally {
    busy.value = false
  }
}

async function unpublish() {
  if (!props.isSystemOwner || !selectedItem.value || busy.value) return
  if (!window.confirm('撤回后用户将暂时看不到这条公告，确定继续吗？')) return
  busy.value = true
  clearMessages()
  try {
    const item = await request(`/api/admin/announcements/${encodeURIComponent(selectedItem.value.id)}/unpublish`, { method: 'POST' })
    updateItem(item)
    selectItem(item)
    successMessage.value = '公告已撤回，可以继续编辑'
    notifyChanged()
  } catch (error) {
    errorMessage.value = error.message || '公告撤回失败'
  } finally {
    busy.value = false
  }
}

async function removeDraft() {
  if (!props.isSystemOwner || !selectedItem.value || busy.value) return
  if (!window.confirm(`确定删除“${selectedItem.value.title}”草稿吗？此操作无法恢复。`)) return
  busy.value = true
  clearMessages()
  try {
    const removedId = selectedItem.value.id
    await request(`/api/admin/announcements/${encodeURIComponent(removedId)}`, { method: 'DELETE' })
    items.value = items.value.filter((item) => item.id !== removedId)
    startNew()
    successMessage.value = '草稿已删除'
    notifyChanged()
  } catch (error) {
    errorMessage.value = error.message || '草稿删除失败'
  } finally {
    busy.value = false
  }
}

function updateItem(item) {
  const index = items.value.findIndex((entry) => entry.id === item.id)
  if (index >= 0) items.value.splice(index, 1, item)
  else items.value.unshift(item)
}

function hasUnsavedChanges(item) {
  return JSON.stringify(payload()) !== JSON.stringify({
    kind: item.kind || 'announcement',
    version: item.version,
    title: item.title,
    summary: item.summary,
    highlights: item.highlights,
    content: item.content,
  })
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent('cdp:announcements-changed'))
}

onMounted(() => loadItems())
</script>

<style scoped>
.announcement-admin {
  display: grid;
  min-height: 650px;
  grid-template-columns: 260px minmax(0, 1fr);
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--ui-divider);
  border-radius: 18px;
}

.announcement-admin__list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid var(--ui-divider);
}

.announcement-admin__list > header,
.announcement-admin__workspace-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 22px;
  border-bottom: 1px solid var(--ui-divider);
}

.announcement-admin__list header p,
.announcement-admin__workspace-head p {
  margin: 0 0 7px;
  color: var(--ui-accent);
  font: 700 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .15em;
}

.announcement-admin__list h2,
.announcement-admin__workspace-head h2 { margin: 0; font-size: 19px; font-weight: 630; letter-spacing: -.035em; }

.announcement-admin__new {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  color: #fff;
  font: inherit;
  font-size: 9px;
  background: var(--ui-ink);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.announcement-admin__filters {
  display: flex;
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ui-divider);
}

.announcement-admin__kind-filters {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  margin: 11px 12px 0;
  padding: 3px;
  background: #f6f6f4;
  border-radius: 8px;
}

.announcement-admin__kind-filters button {
  height: 28px;
  padding: 0 4px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 8px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.announcement-admin__kind-filters button.active { color: var(--ui-ink); background: #fff; box-shadow: 0 1px 4px rgb(20 20 20 / 7%); }
.announcement-admin__kind-filters span { margin-left: 2px; color: var(--ui-text-tertiary); font-size: 7px; }

.announcement-admin__filters button {
  flex: 1;
  height: 27px;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 9px;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
}

.announcement-admin__filters button.active { color: var(--ui-ink); background: #f7f7f5; border-color: var(--ui-divider); }
.announcement-admin__filters span { margin-left: 3px; opacity: .65; }

.announcement-admin__list nav { min-height: 0; overflow-y: auto; }
.announcement-admin__list nav button {
  position: relative;
  display: grid;
  width: 100%;
  gap: 6px;
  padding: 16px 27px 16px 18px;
  color: var(--ui-ink);
  font: inherit;
  text-align: left;
  background: #fff;
  border: 0;
  border-bottom: 1px solid var(--ui-divider);
  cursor: pointer;
}
.announcement-admin__list nav button:hover,
.announcement-admin__list nav button.active { background: #f8f8f6; }
.announcement-admin__list nav button.active::before { position: absolute; top: 12px; bottom: 12px; left: 0; width: 2px; content: ''; background: var(--ui-accent); }
.announcement-admin__item-version { color: var(--ui-accent); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.announcement-admin__list nav strong { overflow: hidden; font-size: 10px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.announcement-admin__list nav small { color: var(--ui-text-tertiary); font-size: 8px; }
.announcement-admin__list nav i { position: absolute; top: 50%; right: 14px; width: 6px; height: 6px; background: #c7c9cc; border-radius: 50%; transform: translateY(-50%); }
.announcement-admin__list nav i.published { background: #28b463; }
.announcement-admin__empty { padding: 42px 16px; color: var(--ui-text-tertiary); font-size: 9px; text-align: center; }

.announcement-admin__workspace { display: grid; min-width: 0; min-height: 0; grid-template-rows: auto minmax(0, 1fr) auto; }
.announcement-admin__workspace-head { padding: 20px 24px; }
.announcement-admin__workspace-head > div:first-child > span { display: block; margin-top: 7px; color: var(--ui-text-tertiary); font-size: 9px; }
.announcement-admin__view-switch { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid var(--ui-divider); border-radius: 9px; }
.announcement-admin__view-switch button { display: inline-flex; height: 27px; align-items: center; gap: 5px; padding: 0 9px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 0; border-radius: 6px; cursor: pointer; }
.announcement-admin__view-switch button.active { color: #fff; background: var(--ui-ink); }

.announcement-admin__editor,
.announcement-admin__preview { min-height: 0; overflow-y: auto; }
.announcement-admin__editor fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.announcement-admin__section { padding: 26px 28px 30px; border-bottom: 1px solid var(--ui-divider); }
.announcement-admin__section-title { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 20px; }
.announcement-admin__section-title > span { padding-top: 4px; color: var(--ui-accent); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.announcement-admin__section-title div { margin-right: auto; }
.announcement-admin__section-title h3 { margin: 0; font-size: 14px; font-weight: 620; }
.announcement-admin__section-title p { margin: 5px 0 0; color: var(--ui-text-tertiary); font-size: 9px; }
.announcement-admin__section-title > button { display: inline-flex; height: 28px; align-items: center; gap: 4px; padding: 0 9px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 7px; cursor: pointer; }

.announcement-admin__field-grid { display: grid; grid-template-columns: 145px 1fr; gap: 16px; }
.announcement-admin__field { display: grid; gap: 7px; }
.announcement-admin__field--full,
.announcement-admin__popup-toggle { grid-column: 1 / -1; }
.announcement-admin__kind-picker { display: grid; gap: 7px; }
.announcement-admin__kind-picker > span { color: var(--ui-text-secondary); font-size: 9px; }
.announcement-admin__kind-picker > div { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.announcement-admin__kind-picker button { display: grid; gap: 4px; padding: 12px 14px; color: var(--ui-text-secondary); font: inherit; text-align: left; background: #fff; border: 1px solid var(--ui-divider); border-radius: 9px; cursor: pointer; }
.announcement-admin__kind-picker button.active { color: var(--ui-ink); border-color: var(--ui-ink); box-shadow: inset 3px 0 0 var(--ui-accent); }
.announcement-admin__kind-picker strong { font-size: 10px; font-weight: 620; }
.announcement-admin__kind-picker small { color: var(--ui-text-tertiary); font-size: 8px; }
.announcement-admin__field > span { color: var(--ui-text-secondary); font-size: 9px; }
.announcement-admin input:not([type='checkbox']),
.announcement-admin textarea { width: 100%; box-sizing: border-box; color: var(--ui-ink); font: inherit; font-size: 10px; line-height: 1.7; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 8px; outline: 0; }
.announcement-admin input:not([type='checkbox']) { height: 36px; padding: 0 11px; }
.announcement-admin textarea { min-height: 76px; padding: 9px 11px; resize: vertical; }
.announcement-admin input:focus,
.announcement-admin textarea:focus { border-color: var(--ui-ink); box-shadow: 0 0 0 2px rgb(26 26 26 / 5%); }
.announcement-admin__popup-toggle { display: flex; align-items: flex-start; gap: 10px; padding: 12px 13px; border: 1px solid var(--ui-divider); border-radius: 9px; }
.announcement-admin__popup-toggle input { margin-top: 2px; accent-color: var(--ui-accent); }
.announcement-admin__popup-toggle strong,
.announcement-admin__popup-toggle small { display: block; }
.announcement-admin__popup-toggle strong { font-size: 10px; font-weight: 600; }
.announcement-admin__popup-toggle small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 8px; }

.announcement-admin__highlight-list { display: grid; gap: 7px; }
.announcement-admin__highlight-list label { display: grid; grid-template-columns: 34px minmax(0, 1fr) 30px; align-items: center; overflow: hidden; border: 1px solid var(--ui-divider); border-radius: 8px; }
.announcement-admin__highlight-list label > span { color: var(--ui-accent); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
.announcement-admin__highlight-list label input { border-width: 0 0 0 1px !important; border-radius: 0 !important; }
.announcement-admin__highlight-list label button,
.announcement-admin__block-actions button { display: grid; place-items: center; width: 30px; height: 30px; color: var(--ui-text-tertiary); background: #fff; border: 0; cursor: pointer; }
.announcement-admin__inline-add { height: 36px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 1px dashed var(--ui-control-border); border-radius: 8px; cursor: pointer; }

.announcement-admin__block-tools { display: flex; flex-wrap: wrap; gap: 7px; margin: -4px 0 18px 34px; }
.announcement-admin__block-tools button { display: inline-flex; height: 31px; align-items: center; gap: 5px; padding: 0 10px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 7px; cursor: pointer; }
.announcement-admin__block-tools button:hover { color: var(--ui-accent); border-color: color-mix(in srgb, var(--ui-accent) 45%, var(--ui-divider)); }
.announcement-admin__file-input { display: none; }
.announcement-admin__block-empty { display: grid; justify-items: center; gap: 7px; margin-left: 34px; padding: 38px; color: var(--ui-text-tertiary); background: #fff; border: 1px dashed var(--ui-control-border); border-radius: 10px; }
.announcement-admin__block-empty .el-icon { font-size: 20px; }
.announcement-admin__block-empty strong { color: var(--ui-text-secondary); font-size: 10px; }
.announcement-admin__block-empty span { font-size: 8px; }
.announcement-admin__blocks { display: grid; gap: 9px; margin-left: 34px; }
.announcement-admin__block { display: grid; grid-template-columns: 54px minmax(0, 1fr) 31px; gap: 9px; align-items: start; padding: 11px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 10px; }
.announcement-admin__block-index { padding-top: 6px; }
.announcement-admin__block-index span,
.announcement-admin__block-index small { display: block; }
.announcement-admin__block-index span { color: var(--ui-accent); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.announcement-admin__block-index small { margin-top: 6px; color: var(--ui-text-tertiary); font-size: 8px; }
.announcement-admin__block-actions { display: grid; gap: 2px; }
.announcement-admin__block-actions button { border: 1px solid transparent; border-radius: 6px; }
.announcement-admin__block-actions button:hover:not(:disabled) { color: var(--ui-ink); border-color: var(--ui-divider); }
.announcement-admin__block-actions button:disabled { cursor: default; opacity: .25; }
.announcement-admin__image-block { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 12px; }
.announcement-admin__image-block img { width: 160px; height: 108px; object-fit: contain; background: #f8f8f6; border: 1px solid var(--ui-divider); border-radius: 8px; }
.announcement-admin__video-block video { width: 160px; height: 108px; object-fit: contain; background: #111; border: 1px solid var(--ui-divider); border-radius: 8px; }
.announcement-admin__image-block > div { display: grid; gap: 8px; }
.announcement-admin__image-block label { display: grid; gap: 4px; }
.announcement-admin__image-block label span { color: var(--ui-text-tertiary); font-size: 8px; }

.announcement-admin__preview { padding: 0 38px; }
.announcement-admin__footer { display: flex; min-height: 62px; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 22px; background: #fff; border-top: 1px solid var(--ui-divider); }
.announcement-admin__footer > span,
.announcement-admin__footer > p { margin: 0; color: var(--ui-text-tertiary); font-size: 8px; }
.announcement-admin__footer > div { display: flex; gap: 7px; }
.announcement-admin__footer button { height: 34px; padding: 0 12px; font: inherit; font-size: 9px; border-radius: 8px; cursor: pointer; }
.announcement-admin__secondary { color: var(--ui-text-secondary); background: #fff; border: 1px solid var(--ui-control-border); }
.announcement-admin__primary { color: #fff; background: var(--ui-ink); border: 1px solid var(--ui-ink); }
.announcement-admin__danger { color: #b42318; background: #fff; border: 1px solid #f1c8c5; }
.announcement-admin__footer button:disabled { cursor: wait; opacity: .5; }
.announcement-admin__error { color: #b42318 !important; }
.announcement-admin__success { color: #168a4f !important; }

@media (max-width: 920px) {
  .announcement-admin { grid-template-columns: 220px minmax(0, 1fr); }
  .announcement-admin__field-grid { grid-template-columns: 1fr; }
  .announcement-admin__field--full,
  .announcement-admin__popup-toggle { grid-column: auto; }
  .announcement-admin__kind-picker > div { grid-template-columns: 1fr; }
  .announcement-admin__image-block { grid-template-columns: 1fr; }
}
</style>
