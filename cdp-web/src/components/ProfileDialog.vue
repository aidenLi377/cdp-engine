<template>
  <Teleport to="body">
    <div class="profile-backdrop" @click.self="emit('close')">
      <section
        class="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
      >
        <header class="profile-dialog-head">
          <div>
            <p>PERSONAL / IDENTITY</p>
            <h2 id="profile-dialog-title">个人资料</h2>
            <span>更新你在系统里的名称、登录凭据和头像。</span>
          </div>
          <button type="button" aria-label="关闭个人资料" @click="emit('close')">×</button>
        </header>

        <form class="profile-form" @submit.prevent="saveProfile">
          <section class="profile-avatar-section">
            <div class="profile-avatar-preview">
              <img v-if="form.avatarUrl" :src="form.avatarUrl" alt="头像预览" />
              <span v-else>{{ userInitial }}</span>
            </div>
            <div class="profile-avatar-copy">
              <strong>你的头像</strong>
              <p>支持 PNG、JPG、WebP；图片会自动裁成方形并压缩。</p>
              <div>
                <button type="button" @click="avatarInput?.click()">选择图片</button>
                <button v-if="form.avatarUrl" type="button" class="quiet" @click="form.avatarUrl = ''">
                  移除头像
                </button>
              </div>
              <input
                ref="avatarInput"
                class="profile-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change="handleAvatarFile"
              />
            </div>
          </section>

          <section class="profile-fields">
            <div class="profile-section-title">
              <span>01</span>
              <div>
                <strong>基础资料</strong>
                <small>{{ roleLabel }}</small>
              </div>
            </div>
            <div class="profile-field-grid">
              <label>
                <span>显示名称</span>
                <input v-model.trim="form.displayName" maxlength="80" required autocomplete="name" />
              </label>
              <label>
                <span>登录账号</span>
                <input v-model.trim="form.username" maxlength="80" required autocomplete="username" />
              </label>
            </div>
          </section>

          <section class="profile-fields">
            <div class="profile-section-title">
              <span>02</span>
              <div>
                <strong>修改密码</strong>
                <small>不修改时留空即可</small>
              </div>
            </div>
            <div class="profile-field-grid password-grid">
              <label>
                <span>当前密码</span>
                <input
                  v-model="form.currentPassword"
                  type="password"
                  autocomplete="current-password"
                  :required="Boolean(form.newPassword)"
                />
              </label>
              <label>
                <span>新密码</span>
                <input
                  v-model="form.newPassword"
                  type="password"
                  minlength="8"
                  autocomplete="new-password"
                  placeholder="至少 8 位"
                />
              </label>
              <label>
                <span>确认新密码</span>
                <input
                  v-model="form.confirmPassword"
                  type="password"
                  minlength="8"
                  autocomplete="new-password"
                />
              </label>
            </div>
            <p class="profile-security-note">修改密码后，其他设备上的登录会立即失效，本设备会继续保持登录。</p>
          </section>

          <p v-if="feedback" class="profile-feedback" :class="{ error: feedbackType === 'error' }">
            {{ feedback }}
          </p>

          <footer class="profile-actions">
            <button type="button" class="profile-cancel" @click="emit('close')">取消</button>
            <button type="submit" class="profile-save" :disabled="saving">
              {{ saving ? '正在保存…' : '保存个人资料' }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { request } from '../utils/apiClient.js'

const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
})
const emit = defineEmits(['close', 'updated'])

const avatarInput = ref(null)
const saving = ref(false)
const feedback = ref('')
const feedbackType = ref('success')
const form = reactive({
  username: props.user.username || '',
  displayName: props.user.displayName || props.user.username || '',
  avatarUrl: props.user.avatarUrl || '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const userInitial = computed(() =>
  String(form.displayName || form.username || 'U').trim().slice(0, 1).toUpperCase(),
)
const roleLabel = computed(() => ({
  super_admin: '超级管理员',
  config_admin: '配置管理员',
  user: '普通用户',
}[props.user.role] || '普通用户'))

function showFeedback(text, type = 'error') {
  feedback.value = text
  feedbackType.value = type
}

function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const size = 384
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
        const sourceX = (image.naturalWidth - sourceSize) / 2
        const sourceY = (image.naturalHeight - sourceSize) / 2
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          size,
          size,
        )
        resolve(canvas.toDataURL('image/webp', 0.84))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('无法读取这张图片'))
    }
    image.src = objectUrl
  })
}

async function handleAvatarFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    showFeedback('请选择 PNG、JPG 或 WebP 图片')
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    showFeedback('原图不能超过 8 MB')
    return
  }
  try {
    form.avatarUrl = await compressAvatar(file)
    showFeedback('头像已准备好，保存后生效', 'success')
  } catch (error) {
    showFeedback(error.message || '头像处理失败')
  }
}

async function saveProfile() {
  feedback.value = ''
  if (form.newPassword && form.newPassword.length < 8) {
    showFeedback('新密码至少需要 8 位')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    showFeedback('两次输入的新密码不一致')
    return
  }
  if (form.newPassword && !form.currentPassword) {
    showFeedback('修改密码前请输入当前密码')
    return
  }

  saving.value = true
  try {
    const result = await request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        username: form.username,
        displayName: form.displayName,
        avatarUrl: form.avatarUrl,
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    })
    emit('updated', result.user)
  } catch (error) {
    showFeedback(error.message || '个人资料保存失败')
  } finally {
    saving.value = false
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape' && !saving.value) emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.profile-backdrop {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 17, 17, 0.28);
  backdrop-filter: blur(10px);
}

.profile-dialog {
  width: min(720px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  color: var(--ui-ink);
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 22px;
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.22);
}

.profile-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px 21px;
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-divider);
}

.profile-dialog-head p {
  margin: 0 0 8px;
  color: var(--ui-accent);
  font: 700 9px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.14em;
}

.profile-dialog-head h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 560;
  letter-spacing: -0.045em;
}

.profile-dialog-head span {
  display: block;
  margin-top: 7px;
  color: var(--ui-text-secondary);
  font-size: 11px;
}

.profile-dialog-head > button {
  width: 31px;
  height: 31px;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 23px;
  line-height: 1;
  background: transparent;
  border: 1px solid var(--ui-divider);
  border-radius: 50%;
  cursor: pointer;
}

.profile-form { padding: 0 26px 24px; }

.profile-avatar-section {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 24px 0;
  border-bottom: 1px solid var(--ui-divider);
}

.profile-avatar-preview {
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  flex: 0 0 auto;
  overflow: hidden;
  color: #fff;
  font-size: 24px;
  font-weight: 650;
  background: var(--ui-ink);
  border: 4px solid var(--ui-surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--ui-divider);
}

.profile-avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
.profile-avatar-copy strong { font-size: 13px; }
.profile-avatar-copy p { margin: 6px 0 10px; color: var(--ui-text-tertiary); font-size: 10px; }
.profile-avatar-copy > div { display: flex; gap: 8px; }

.profile-avatar-copy button {
  height: 30px;
  padding: 0 10px;
  color: #fff;
  font: inherit;
  font-size: 10px;
  background: var(--ui-ink);
  border: 1px solid var(--ui-ink);
  border-radius: 7px;
  cursor: pointer;
}

.profile-avatar-copy button.quiet {
  color: var(--ui-text-secondary);
  background: transparent;
  border-color: var(--ui-divider);
}

.profile-file-input { display: none; }
.profile-fields { padding: 22px 0; border-bottom: 1px solid var(--ui-divider); }
.profile-section-title { display: flex; align-items: baseline; gap: 11px; margin-bottom: 16px; }
.profile-section-title > span { color: var(--ui-accent); font: 700 10px/1 ui-monospace, monospace; }
.profile-section-title strong { display: block; font-size: 15px; font-weight: 560; }
.profile-section-title small { display: block; margin-top: 4px; color: var(--ui-text-tertiary); font-size: 9px; }

.profile-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.password-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.profile-field-grid label { display: flex; flex-direction: column; gap: 7px; }
.profile-field-grid label > span { color: var(--ui-text-secondary); font-size: 10px; }

.profile-field-grid input {
  width: 100%;
  height: 37px;
  box-sizing: border-box;
  padding: 0 10px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 11px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: var(--ui-radius-control);
  outline: none;
}

.profile-field-grid input:focus { border-color: var(--ui-accent); box-shadow: 0 0 0 3px var(--ui-accent-ring); }
.profile-security-note { margin: 11px 0 0; color: var(--ui-text-tertiary); font-size: 9px; }

.profile-feedback {
  margin: 16px 0 0;
  padding: 9px 11px;
  color: var(--ui-success);
  font-size: 10px;
  background: color-mix(in srgb, var(--ui-success) 7%, var(--ui-fill));
  border-radius: 7px;
}

.profile-feedback.error { color: var(--ui-danger); background: color-mix(in srgb, var(--ui-danger) 6%, var(--ui-fill)); }
.profile-actions { display: flex; justify-content: flex-end; gap: 9px; padding-top: 22px; }

.profile-actions button {
  height: 36px;
  padding: 0 15px;
  font: inherit;
  font-size: 10px;
  border-radius: var(--ui-radius-control);
  cursor: pointer;
}

.profile-cancel { color: var(--ui-text-secondary); background: transparent; border: 1px solid var(--ui-divider); }
.profile-save { color: #fff; background: var(--ui-ink); border: 1px solid var(--ui-ink); }
.profile-save:disabled { cursor: wait; opacity: 0.55; }

@media (max-width: 640px) {
  .profile-backdrop { padding: 12px; }
  .profile-dialog { max-height: calc(100vh - 24px); border-radius: 17px; }
  .profile-dialog-head, .profile-form { padding-right: 19px; padding-left: 19px; }
  .profile-field-grid, .password-grid { grid-template-columns: 1fr; }
  .profile-avatar-section { align-items: flex-start; }
}
</style>
