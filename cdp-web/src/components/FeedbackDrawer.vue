<template>
  <el-drawer
    :model-value="open"
    class="feedback-drawer"
    direction="rtl"
    size="390px"
    :with-header="false"
    :append-to-body="true"
    @close="$emit('close')"
  >
    <div class="feedback-shell">
      <header class="feedback-head">
        <div>
          <p>USER FEEDBACK</p>
          <h2>告诉我们，哪里可以更好</h2>
          <span>反馈会进入系统管理，由具备处理权限的管理人员跟进。</span>
        </div>
        <button type="button" aria-label="关闭反馈" title="关闭" @click="$emit('close')">
          <el-icon><Close /></el-icon>
        </button>
      </header>

      <form class="feedback-form" @submit.prevent="submitFeedback">
        <fieldset>
          <legend>反馈类型</legend>
          <div class="feedback-type-grid">
            <label v-for="item in categories" :key="item.value" :class="{ active: category === item.value }">
              <input v-model="category" type="radio" :value="item.value" />
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </label>
          </div>
        </fieldset>

        <label class="feedback-copy-field">
          <span>具体内容</span>
          <textarea
            v-model="message"
            maxlength="2000"
            rows="7"
            placeholder="描述你遇到的问题、期待的效果，或者任何建议…"
          ></textarea>
          <small>{{ message.length }} / 2000</small>
        </label>

        <section class="feedback-upload-section">
          <div class="feedback-upload-title">
            <div>
              <strong>添加截图</strong>
              <span>最多 3 张，单张不超过 5 MB</span>
            </div>
            <button type="button" :disabled="images.length >= 3 || submitting" @click="openPicker">
              <el-icon><Picture /></el-icon>上传图片
            </button>
          </div>
          <input
            ref="fileInput"
            class="feedback-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            @change="handleFiles"
          />
          <div v-if="images.length" class="feedback-previews">
            <figure v-for="(image, index) in images" :key="image.url">
              <img :src="image.url" :alt="`反馈截图 ${index + 1}`" />
              <button type="button" :aria-label="`移除截图 ${index + 1}`" @click="removeImage(index)">
                <el-icon><Close /></el-icon>
              </button>
            </figure>
          </div>
          <div v-else class="feedback-upload-empty">
            <el-icon><PictureFilled /></el-icon>
            <span>截图能帮助我们更快定位问题</span>
          </div>
        </section>

        <p v-if="errorMessage" class="feedback-error" role="alert">{{ errorMessage }}</p>
        <p v-if="submitted" class="feedback-success" role="status">
          <el-icon><CircleCheckFilled /></el-icon> 已收到，谢谢你的反馈。
        </p>

        <footer class="feedback-actions">
          <span>图片会私密保存，仅具备反馈处理权限的人员可查看</span>
          <button type="submit" :disabled="submitting || !message.trim() || submitted">
            {{ submitting ? '正在提交…' : submitted ? '已提交' : '提交反馈' }}
          </button>
        </footer>
      </form>
    </div>
  </el-drawer>
</template>

<script setup>
import { markRaw, onBeforeUnmount, ref, watch } from 'vue'
import {
  ChatLineRound,
  CircleCheckFilled,
  Close,
  Picture,
  PictureFilled,
  QuestionFilled,
  Tools,
} from '@element-plus/icons-vue'
import { fetchWithTimeout } from '../utils/apiClient.js'

defineProps({ open: { type: Boolean, default: false } })
defineEmits(['close'])

const categories = [
  { value: 'suggestion', label: '功能建议', icon: markRaw(ChatLineRound) },
  { value: 'bug', label: '问题反馈', icon: markRaw(Tools) },
  { value: 'question', label: '使用疑问', icon: markRaw(QuestionFilled) },
]
const category = ref('suggestion')
const message = ref('')
const images = ref([])
const fileInput = ref(null)
const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref('')

function openPicker() {
  fileInput.value?.click()
}

function loadBitmap(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

async function prepareImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('图片仅支持 PNG、JPG 或 WebP')
  }
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  const output = blob
    ? new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'screenshot'}.webp`, { type: 'image/webp' })
    : file
  if (output.size > 5 * 1024 * 1024) throw new Error('单张图片不能超过 5 MB')
  return output
}

async function handleFiles(event) {
  errorMessage.value = ''
  const slots = 3 - images.value.length
  const selected = Array.from(event.target.files || []).slice(0, slots)
  try {
    for (const file of selected) {
      const prepared = await prepareImage(file)
      images.value.push({ file: prepared, url: URL.createObjectURL(prepared) })
    }
  } catch (error) {
    errorMessage.value = error.message || '图片处理失败'
  } finally {
    event.target.value = ''
  }
}

function removeImage(index) {
  const [removed] = images.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
}

async function submitFeedback() {
  if (!message.value.trim()) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const body = new FormData()
    body.append('category', category.value)
    body.append('message', message.value.trim())
    body.append('pagePath', `${window.location.pathname}${window.location.search}`)
    body.append('viewport', `${window.innerWidth}x${window.innerHeight}`)
    images.value.forEach((image) => body.append('images', image.file, image.file.name))
    const response = await fetchWithTimeout('/api/feedback', { method: 'POST', body })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message || '反馈提交失败')
    submitted.value = true
    window.dispatchEvent(new CustomEvent('cdp:feedback-submitted', { detail: payload }))
  } catch (error) {
    errorMessage.value = error.message || '反馈提交失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}

function reset() {
  images.value.forEach((image) => URL.revokeObjectURL(image.url))
  images.value = []
  category.value = 'suggestion'
  message.value = ''
  submitted.value = false
  errorMessage.value = ''
}

watch(() => submitted.value, (value) => {
  if (!value) return
  window.setTimeout(() => reset(), 2400)
})
onBeforeUnmount(reset)
</script>

<style scoped>
.feedback-shell { min-height: 100%; padding: 24px; color: var(--ui-ink); background: #fff; }
.feedback-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 22px; border-bottom: 1px solid var(--ui-divider); }
.feedback-head p { margin: 0 0 8px; color: var(--ui-accent); font: 700 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.15em; }
.feedback-head h2 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -0.04em; }
.feedback-head span { display: block; margin-top: 8px; color: var(--ui-text-tertiary); font-size: 11px; }
.feedback-head button { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 auto; padding: 0; color: var(--ui-text-secondary); background: #fff; border: 1px solid var(--ui-control-border); border-radius: 50%; cursor: pointer; }
.feedback-form { display: grid; gap: 22px; padding-top: 22px; }
.feedback-form fieldset { padding: 0; border: 0; }
.feedback-form legend, .feedback-copy-field > span { display: block; margin-bottom: 9px; font-size: 11px; font-weight: 650; }
.feedback-type-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.feedback-type-grid label { position: relative; display: grid; min-height: 66px; place-items: center; gap: 4px; color: var(--ui-text-secondary); font-size: 11px; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 10px; cursor: pointer; }
.feedback-type-grid label.active { color: var(--ui-ink); background: #fff; border-color: var(--ui-ink); box-shadow: inset 0 -2px 0 var(--ui-accent); }
.feedback-type-grid input { position: absolute; opacity: 0; pointer-events: none; }
.feedback-copy-field { position: relative; }
.feedback-copy-field textarea { width: 100%; min-height: 148px; padding: 13px 14px 28px; resize: vertical; color: var(--ui-ink); font: inherit; font-size: 12px; line-height: 1.65; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 11px; outline: none; box-sizing: border-box; }
.feedback-copy-field textarea:focus { border-color: var(--ui-ink); box-shadow: 0 0 0 3px rgba(29, 29, 31, 0.07); }
.feedback-copy-field small { position: absolute; right: 11px; bottom: 9px; color: var(--ui-text-tertiary); font-size: 9px; }
.feedback-upload-section { padding: 13px; background: #fff; border: 1px dashed var(--ui-control-border); border-radius: 12px; }
.feedback-upload-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.feedback-upload-title strong, .feedback-upload-title span { display: block; }
.feedback-upload-title strong { font-size: 11px; }
.feedback-upload-title span { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 9px; }
.feedback-upload-title button { display: inline-flex; height: 28px; align-items: center; gap: 5px; padding: 0 9px; color: #fff; font: inherit; font-size: 10px; background: var(--ui-ink); border: 0; border-radius: 7px; cursor: pointer; }
.feedback-upload-title button:disabled { opacity: 0.4; cursor: not-allowed; }
.feedback-file-input { display: none; }
.feedback-upload-empty { display: flex; align-items: center; gap: 7px; margin-top: 15px; padding: 13px 0 2px; color: var(--ui-text-tertiary); font-size: 10px; border-top: 1px solid var(--ui-divider); }
.feedback-previews { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 13px; }
.feedback-previews figure { position: relative; height: 78px; margin: 0; overflow: hidden; background: #fff; border-radius: 8px; }
.feedback-previews img { width: 100%; height: 100%; object-fit: cover; }
.feedback-previews button { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 21px; height: 21px; padding: 0; color: #fff; background: rgba(0, 0, 0, 0.72); border: 0; border-radius: 50%; cursor: pointer; }
.feedback-error, .feedback-success { margin: -7px 0 0; padding: 9px 10px; font-size: 10px; border-radius: 8px; }
.feedback-error { color: #b42318; background: #fff1f0; }
.feedback-success { display: flex; align-items: center; gap: 6px; color: #137333; background: #edf7ef; }
.feedback-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 17px; border-top: 1px solid var(--ui-divider); }
.feedback-actions span { max-width: 150px; color: var(--ui-text-tertiary); font-size: 9px; line-height: 1.45; }
.feedback-actions button { min-width: 100px; height: 34px; color: #fff; font: inherit; font-size: 11px; font-weight: 650; background: var(--ui-ink); border: 0; border-radius: 8px; box-shadow: inset 3px 0 0 var(--ui-accent); cursor: pointer; }
.feedback-actions button:disabled { opacity: 0.45; cursor: not-allowed; }
@media (max-width: 520px) { .feedback-shell { padding: 20px; } .feedback-type-grid { gap: 5px; } }
</style>
