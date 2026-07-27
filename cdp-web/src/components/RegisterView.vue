<template>
  <main class="register-shell">
    <section class="register-story" aria-label="邀请注册">
      <div class="register-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="register-story-copy">
        <p class="register-kicker">PRIVATE INVITATION</p>
        <h1>加入这套<br><em>清晰的工作流。</em></h1>
        <p class="register-intro">
          这是一个一次性邀请。完成注册后，邀请链接立即失效。
        </p>
      </div>
      <div class="register-story-foot">
        <span>CDP WORKBENCH</span>
        <span class="register-story-line"></span>
        <span>INVITE ONLY</span>
      </div>
    </section>

    <section class="register-entry">
      <form v-if="inviteState === 'ready'" class="register-form" @submit.prevent="submitRegister">
        <header class="register-form-head">
          <span class="register-step">02 / CREATE ACCOUNT</span>
          <h2>创建账号</h2>
          <p>
            该邀请将授予
            <strong>{{ roleLabel(inviteRole) }}</strong>
            权限
            <span v-if="expiresAt">，有效期至 {{ formatDate(expiresAt) }}</span>。
          </p>
        </header>

        <label class="register-field">
          <span>显示名称</span>
          <input
            v-model.trim="form.displayName"
            name="displayName"
            autocomplete="name"
            placeholder="例如：张三"
            :disabled="loading"
          />
        </label>

        <label class="register-field">
          <span>登录账号</span>
          <input
            ref="usernameInput"
            v-model.trim="form.username"
            name="username"
            autocomplete="username"
            placeholder="请输入登录账号"
            :disabled="loading"
          />
        </label>

        <label class="register-field">
          <span>设置密码</span>
          <input
            v-model="form.password"
            name="password"
            type="password"
            autocomplete="new-password"
            placeholder="至少 8 位"
            :disabled="loading"
          />
        </label>

        <label class="register-field">
          <span>确认密码</span>
          <input
            v-model="form.passwordConfirm"
            name="passwordConfirm"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入密码"
            :disabled="loading"
          />
        </label>

        <transition name="register-error">
          <div v-if="errorMessage" class="register-error" role="alert">
            <span aria-hidden="true">!</span>
            {{ errorMessage }}
          </div>
        </transition>

        <button class="register-submit" type="submit" :disabled="loading">
          <span>{{ loading ? '正在创建…' : '完成注册' }}</span>
          <span class="register-submit-arrow" aria-hidden="true">↗</span>
        </button>

        <button class="register-back" type="button" :disabled="loading" @click="cancel">
          返回登录
        </button>
      </form>

      <div v-else class="register-invalid" role="alert">
        <span class="register-invalid-mark" aria-hidden="true">!</span>
        <p class="register-step">INVITATION UNAVAILABLE</p>
        <h2>邀请链接不可用</h2>
        <p>{{ errorMessage || '链接可能已使用、过期或被管理员作废。' }}</p>
        <button class="register-back register-invalid-back" type="button" @click="cancel">
          返回登录
        </button>
      </div>
    </section>
  </main>
</template>

<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { request } from '../utils/apiClient.js'

const props = defineProps({
  token: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['authenticated', 'cancel'])

const form = reactive({
  displayName: '',
  username: '',
  password: '',
  passwordConfirm: '',
})
const inviteState = ref('checking')
const inviteRole = ref('user')
const expiresAt = ref('')
const loading = ref(false)
const errorMessage = ref('')
const usernameInput = ref(null)

const ROLE_LABELS = {
  super_admin: '超级管理员',
  config_admin: '配置管理员',
  user: '普通用户',
}

function roleLabel(role) {
  return ROLE_LABELS[role] || '普通用户'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

async function loadInvite() {
  inviteState.value = 'checking'
  try {
    const data = await request('/api/auth/invite', {
      params: { token: props.token },
      cache: 'no-store',
    })
    inviteRole.value = data.role || 'user'
    expiresAt.value = data.expiresAt || ''
    inviteState.value = 'ready'
    await nextTick()
    usernameInput.value?.focus()
  } catch (error) {
    errorMessage.value = error.message || '邀请链接不可用'
    inviteState.value = 'invalid'
  }
}

async function submitRegister() {
  errorMessage.value = ''
  if (!form.username || !form.password || !form.passwordConfirm) {
    errorMessage.value = '请完整填写注册信息'
    return
  }
  if (form.password.length < 8) {
    errorMessage.value = '密码至少需要 8 位'
    return
  }
  if (form.password !== form.passwordConfirm) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }

  loading.value = true
  try {
    const data = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        token: props.token,
        username: form.username,
        password: form.password,
        displayName: form.displayName,
      }),
    })
    emit('authenticated', data.user)
  } catch (error) {
    errorMessage.value = error.message || '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function cancel() {
  emit('cancel')
}

onMounted(loadInvite)
</script>

<style scoped>
.register-shell {
  --register-ink: var(--ui-ink);
  --register-muted: var(--ui-text-secondary);
  --register-accent: var(--ui-accent);
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(420px, 0.82fr);
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: var(--register-ink);
  background: var(--ui-canvas);
  font-family: "SF Pro Display", "SF Pro Text", "PingFang SC",
    "Segoe UI Variable", "Microsoft YaHei", sans-serif;
}

.register-story,
.register-entry {
  position: relative;
  z-index: 1;
}

.register-story {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(34px, 5vw, 72px);
  border-right: 1px solid var(--ui-divider);
  animation: register-reveal 760ms var(--ease-out-expo, ease) both;
}

.register-mark {
  display: inline-grid;
  grid-template-columns: repeat(3, 7px);
  align-self: flex-start;
  gap: 4px;
  padding: 9px;
  border: 1px solid rgba(23, 23, 21, 0.14);
  border-radius: 50%;
}

.register-mark span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--register-ink);
}

.register-mark span:nth-child(2) { background: var(--register-accent); }
.register-mark span:nth-child(3) { opacity: 0.28; }

.register-story-copy { max-width: 720px; }

.register-kicker,
.register-step,
.register-story-foot {
  font-family: "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.16em;
}

.register-kicker {
  margin: 0 0 26px;
  color: var(--register-accent);
  font-size: 11px;
  font-weight: 700;
}

.register-story h1 {
  margin: 0;
  font-size: clamp(42px, 5.2vw, 76px);
  font-weight: 350;
  line-height: 1.08;
  letter-spacing: -0.055em;
}

.register-story h1 em {
  color: var(--register-muted);
  font-family: "STSong", "Songti SC", serif;
  font-weight: 400;
  font-style: normal;
}

.register-intro {
  max-width: 440px;
  margin: 30px 0 0;
  color: var(--ui-text-secondary);
  font-size: 15px;
  line-height: 1.8;
}

.register-story-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--ui-text-tertiary);
  font-size: 9px;
}

.register-story-line {
  width: 64px;
  height: 1px;
  background: var(--ui-divider);
}

.register-entry {
  display: grid;
  place-items: center;
  padding: clamp(28px, 6vw, 96px);
  background: var(--ui-fill);
}

.register-form,
.register-invalid {
  width: min(100%, 390px);
  animation: register-form-enter 700ms 120ms var(--ease-out-expo, ease) both;
}

.register-form-head { margin-bottom: 32px; }

.register-step {
  display: block;
  margin-bottom: 16px;
  color: var(--register-accent);
  font-size: 10px;
  font-weight: 700;
}

.register-form-head h2,
.register-invalid h2 {
  margin: 0 0 10px;
  font-size: 34px;
  font-weight: 450;
  letter-spacing: -0.04em;
}

.register-form-head p,
.register-invalid p {
  margin: 0;
  color: var(--register-muted);
  font-size: 13px;
  line-height: 1.7;
}

.register-form-head strong {
  color: var(--register-ink);
  font-weight: 600;
}

.register-field {
  display: block;
  margin-bottom: 19px;
}

.register-field > span {
  display: block;
  margin-bottom: 8px;
  color: var(--ui-text-secondary);
  font-size: 12px;
  font-weight: 550;
}

.register-field input {
  width: 100%;
  height: 46px;
  padding: 0 12px;
  color: var(--register-ink);
  font: inherit;
  font-size: 14px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: var(--ui-radius-control);
  outline: none;
  box-sizing: border-box;
  transition: border-color 220ms ease, box-shadow 220ms ease;
}

.register-field input::placeholder { color: var(--ui-text-tertiary); }
.register-field input:focus {
  border-color: var(--register-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}
.register-field input:disabled { opacity: 0.55; }

.register-error {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 2px 0 15px;
  color: var(--ui-danger);
  font-size: 12px;
}

.register-error > span {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(255, 59, 48, 0.32);
  border-radius: 50%;
  font: 700 10px/1 "SF Mono", monospace;
}

.register-submit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 56px;
  margin-top: 18px;
  padding: 0 20px 0 24px;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 550;
  letter-spacing: 0.04em;
  background: var(--register-ink);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 240ms ease, background 240ms ease, box-shadow 240ms ease;
}

.register-submit:hover:not(:disabled) {
  background: #2c2c2e;
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.register-submit:disabled { cursor: wait; opacity: 0.7; }
.register-submit-arrow { color: var(--register-accent); font-size: 20px; }

.register-back {
  display: block;
  margin: 16px auto 0;
  padding: 4px;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.register-back:hover { color: var(--register-ink); }
.register-back:disabled { cursor: wait; opacity: 0.5; }

.register-invalid-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 28px;
  color: var(--ui-danger);
  border: 1px solid rgba(255, 59, 48, 0.32);
  border-radius: 50%;
  font: 700 16px/1 "SF Mono", monospace;
}

.register-invalid-back {
  margin-top: 28px;
  margin-left: 0;
  padding-left: 0;
}

.register-error-enter-active,
.register-error-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.register-error-enter-from,
.register-error-leave-to { opacity: 0; transform: translateY(-4px); }

@keyframes register-reveal {
  from { opacity: 0; transform: translateX(-18px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes register-form-enter {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 900px) {
  .register-shell { grid-template-columns: 1fr; overflow-y: auto; }
  .register-story {
    min-height: 38vh;
    padding: 30px;
    border-right: 0;
    border-bottom: 1px solid var(--ui-divider);
  }
  .register-story-copy { margin: 44px 0 34px; }
  .register-story h1 { font-size: clamp(36px, 9vw, 56px); }
  .register-intro { display: none; }
  .register-entry { min-height: 62vh; padding: 46px 28px 60px; }
}

@media (max-width: 520px) {
  .register-story { min-height: 32vh; }
  .register-story h1 { font-size: 35px; }
  .register-story h1 br { display: none; }
  .register-story-foot { display: none; }
  .register-entry { place-items: start stretch; }
  .register-form,
  .register-invalid { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .register-story,
  .register-form,
  .register-invalid { animation: none !important; }
}
</style>
