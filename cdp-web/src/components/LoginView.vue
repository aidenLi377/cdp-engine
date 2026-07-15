<template>
  <main class="login-shell">
    <div class="login-atmosphere" aria-hidden="true">
      <span class="login-orbit orbit-one"></span>
      <span class="login-orbit orbit-two"></span>
      <span class="login-node node-one"></span>
      <span class="login-node node-two"></span>
      <span class="login-node node-three"></span>
    </div>

    <section class="login-story" aria-label="CDP 圈选工作台">
      <div class="login-brand-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="login-story-copy">
        <p class="login-kicker">CUSTOMER DATA PLATFORM</p>
        <h1>把复杂的人群策略，<br><em>变成清晰的行动。</em></h1>
        <p class="login-intro">可视化搭建、方案沉淀与任务执行，在同一个工作台自然衔接。</p>
      </div>
      <div class="login-story-foot">
        <span>CDP WORKBENCH</span>
        <span class="login-story-line"></span>
        <span>2026</span>
      </div>
    </section>

    <section class="login-entry">
      <form class="login-form" @submit.prevent="submitLogin">
        <header class="login-form-head">
          <span class="login-step">01 / SIGN IN</span>
          <h2>欢迎回来</h2>
          <p>登录后继续进入你的圈选工作台。</p>
        </header>

        <label class="login-field">
          <span>账号</span>
          <input
            ref="usernameInput"
            v-model.trim="form.username"
            name="username"
            autocomplete="username"
            placeholder="请输入账号"
            :disabled="loading"
          />
        </label>

        <label class="login-field">
          <span>密码</span>
          <div class="login-password-wrap">
            <input
              v-model="form.password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入密码"
              :disabled="loading"
            />
            <button
              class="login-password-toggle"
              type="button"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </label>

        <transition name="login-error">
          <div v-if="errorMessage" class="login-error" role="alert">
            <span aria-hidden="true">!</span>
            {{ errorMessage }}
          </div>
        </transition>

        <button class="login-submit" type="submit" :disabled="loading">
          <span>{{ loading ? '正在验证…' : '进入工作台' }}</span>
          <span class="login-submit-arrow" aria-hidden="true">↗</span>
        </button>

        <p class="login-assurance">
          <span class="login-assurance-dot"></span>
          账号由管理员统一创建，登录状态仅用于工作台访问。
        </p>
      </form>
    </section>
  </main>
</template>

<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'

const emit = defineEmits(['authenticated'])

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const showPassword = ref(false)
const errorMessage = ref('')
const usernameInput = ref(null)

async function submitLogin() {
  errorMessage.value = ''
  if (!form.username || !form.password) {
    errorMessage.value = '请输入账号和密码'
    return
  }

  loading.value = true
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(data?.message || '登录失败，请稍后重试')
    }
    form.password = ''
    emit('authenticated', data.user)
  } catch (error) {
    errorMessage.value = error.message || '暂时无法连接服务，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => nextTick(() => usernameInput.value?.focus()))
</script>

<style scoped>
.login-shell {
  --login-ink: #171715;
  --login-muted: #8c8982;
  --login-paper: #f3f0e9;
  --login-accent: #ff6b4a;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(420px, 0.82fr);
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: var(--login-ink);
  background:
    radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.92), transparent 34%),
    linear-gradient(135deg, #f8f6f1 0%, var(--login-paper) 58%, #ece8df 100%);
  font-family: "PingFang SC", "Microsoft YaHei", ui-sans-serif, sans-serif;
}

.login-shell::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.22;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.08'/%3E%3C/svg%3E");
}

.login-atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login-orbit {
  position: absolute;
  border: 1px solid rgba(23, 23, 21, 0.08);
  border-radius: 50%;
  animation: login-orbit-drift 12s ease-in-out infinite alternate;
}

.orbit-one { width: 34vw; height: 34vw; left: -8vw; top: 13vh; }
.orbit-two { width: 18vw; height: 18vw; left: 37vw; bottom: -7vw; animation-delay: -4s; }

.login-node {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--login-accent);
  box-shadow: 0 0 0 7px rgba(255, 107, 74, 0.08);
  animation: login-node-pulse 3.6s ease-in-out infinite;
}

.node-one { left: 20%; top: 27%; }
.node-two { left: 45%; top: 72%; animation-delay: -1.2s; }
.node-three { left: 8%; top: 69%; animation-delay: -2.4s; }

.login-story,
.login-entry {
  position: relative;
  z-index: 1;
}

.login-story {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(34px, 5vw, 72px);
  border-right: 1px solid rgba(23, 23, 21, 0.08);
  animation: login-reveal 760ms var(--ease-out-expo, ease) both;
}

.login-brand-mark {
  display: inline-grid;
  grid-template-columns: repeat(3, 7px);
  align-self: flex-start;
  gap: 4px;
  padding: 9px;
  border: 1px solid rgba(23, 23, 21, 0.14);
  border-radius: 50%;
}

.login-brand-mark span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--login-ink);
}

.login-brand-mark span:nth-child(2) { background: var(--login-accent); }
.login-brand-mark span:nth-child(3) { opacity: 0.28; }

.login-story-copy { max-width: 720px; }

.login-kicker,
.login-step,
.login-story-foot {
  font-family: "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.16em;
}

.login-kicker {
  margin: 0 0 26px;
  color: var(--login-accent);
  font-size: 11px;
  font-weight: 700;
}

.login-story h1 {
  margin: 0;
  font-size: clamp(42px, 5.2vw, 76px);
  font-weight: 350;
  line-height: 1.08;
  letter-spacing: -0.055em;
}

.login-story h1 em {
  color: var(--login-muted);
  font-family: "STSong", "Songti SC", serif;
  font-weight: 400;
  font-style: normal;
}

.login-intro {
  max-width: 460px;
  margin: 30px 0 0;
  color: #77736c;
  font-size: 15px;
  line-height: 1.8;
}

.login-story-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #9a968f;
  font-size: 9px;
}

.login-story-line {
  width: 64px;
  height: 1px;
  background: rgba(23, 23, 21, 0.15);
}

.login-entry {
  display: grid;
  place-items: center;
  padding: clamp(28px, 6vw, 96px);
  background: rgba(255, 255, 255, 0.48);
  backdrop-filter: blur(26px) saturate(125%);
  -webkit-backdrop-filter: blur(26px) saturate(125%);
}

.login-form {
  width: min(100%, 390px);
  animation: login-form-enter 700ms 120ms var(--ease-out-expo, ease) both;
}

.login-form-head { margin-bottom: 48px; }

.login-step {
  display: block;
  margin-bottom: 19px;
  color: var(--login-accent);
  font-size: 10px;
  font-weight: 700;
}

.login-form-head h2 {
  margin: 0 0 10px;
  font-size: 34px;
  font-weight: 450;
  letter-spacing: -0.04em;
}

.login-form-head p {
  margin: 0;
  color: var(--login-muted);
  font-size: 13px;
}

.login-field {
  display: block;
  margin-bottom: 28px;
}

.login-field > span {
  display: block;
  margin-bottom: 10px;
  color: #67635d;
  font-size: 12px;
  font-weight: 550;
}

.login-field input {
  width: 100%;
  height: 48px;
  padding: 0;
  color: var(--login-ink);
  font: inherit;
  font-size: 15px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(23, 23, 21, 0.18);
  border-radius: 0;
  outline: none;
  box-sizing: border-box;
  transition: border-color 220ms ease, box-shadow 220ms ease;
}

.login-field input::placeholder { color: #b5b1aa; }
.login-field input:focus { border-color: var(--login-accent); box-shadow: 0 1px 0 var(--login-accent); }
.login-field input:disabled { opacity: 0.55; }

.login-password-wrap { position: relative; }
.login-password-wrap input { padding-right: 52px; }

.login-password-toggle {
  position: absolute;
  right: 0;
  top: 0;
  height: 48px;
  padding: 0;
  color: #8f8b84;
  font: inherit;
  font-size: 11px;
  background: none;
  border: none;
  cursor: pointer;
}

.login-error {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: -8px 0 20px;
  color: #c74730;
  font-size: 12px;
}

.login-error span {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(199, 71, 48, 0.35);
  border-radius: 50%;
  font: 700 10px/1 "SF Mono", monospace;
}

.login-submit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 58px;
  margin-top: 36px;
  padding: 0 20px 0 24px;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 550;
  letter-spacing: 0.04em;
  background: var(--login-ink);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  box-shadow: 0 16px 30px rgba(23, 23, 21, 0.14);
  transition: transform 240ms ease, background 240ms ease, box-shadow 240ms ease;
}

.login-submit:hover:not(:disabled) {
  background: #2c2b28;
  transform: translateY(-2px);
  box-shadow: 0 19px 36px rgba(23, 23, 21, 0.19);
}

.login-submit:disabled { cursor: wait; opacity: 0.7; }
.login-submit-arrow { color: var(--login-accent); font-size: 20px; }

.login-assurance {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 0;
  color: #9b978f;
  font-size: 10px;
  line-height: 1.6;
}

.login-assurance-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #4aa367;
  box-shadow: 0 0 0 4px rgba(74, 163, 103, 0.09);
}

.login-error-enter-active,
.login-error-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.login-error-enter-from,
.login-error-leave-to { opacity: 0; transform: translateY(-4px); }

@keyframes login-reveal {
  from { opacity: 0; transform: translateX(-18px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes login-form-enter {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes login-orbit-drift {
  from { transform: translate3d(0, 0, 0) rotate(0deg); }
  to { transform: translate3d(12px, -8px, 0) rotate(3deg); }
}

@keyframes login-node-pulse {
  0%, 100% { transform: scale(0.82); opacity: 0.55; }
  50% { transform: scale(1); opacity: 1; }
}

@media (max-width: 900px) {
  .login-shell { grid-template-columns: 1fr; overflow-y: auto; }
  .login-story { min-height: 38vh; padding: 30px; border-right: 0; border-bottom: 1px solid rgba(23, 23, 21, 0.08); }
  .login-story-copy { margin: 44px 0 34px; }
  .login-story h1 { font-size: clamp(36px, 9vw, 56px); }
  .login-intro { display: none; }
  .login-entry { min-height: 62vh; padding: 46px 28px 60px; }
  .login-form-head { margin-bottom: 36px; }
}

@media (max-width: 520px) {
  .login-story { min-height: 32vh; }
  .login-story h1 { font-size: 35px; }
  .login-story h1 br { display: none; }
  .login-story-foot { display: none; }
  .login-entry { place-items: start stretch; }
  .login-form { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .login-story,
  .login-form,
  .login-orbit,
  .login-node { animation: none !important; }
}
</style>
