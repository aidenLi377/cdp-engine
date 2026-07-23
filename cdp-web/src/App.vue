<template>
  <el-config-provider :locale="zhCn">
    <div v-if="authState === 'checking'" class="auth-checking-screen" aria-label="正在检查登录状态">
      <span class="auth-checking-mark"><i></i><i></i><i></i></span>
    </div>

    <LoginView v-else-if="authState === 'guest'" @authenticated="handleAuthenticated" />

    <div v-else class="cdp-engine-container">
      <transition name="fade-slide">
        <div v-if="!backendOnline" class="offline-banner">
          暂时无法连接服务
        </div>
      </transition>

      <header class="app-shell-header">
        <div class="app-shell-title">
          <div class="display-feature-title">圈选工作台</div>
        </div>

        <nav class="app-shell-nav" aria-label="主导航">
          <el-radio-group
            v-model="appMode"
            size="small"
            class="intercom-radio-group app-mode-switcher"
            :class="`is-${appMode}`"
            aria-label="切换工作区域"
          >
            <el-radio-button value="workbench">工作台</el-radio-button>
            <el-radio-button value="solutions">方案中心</el-radio-button>
            <el-radio-button value="task-center">任务中台</el-radio-button>
          </el-radio-group>
        </nav>

        <div class="app-shell-account">
          <span class="app-shell-avatar">{{ userInitial }}</span>
          <span class="app-shell-user">{{ currentUser?.displayName || currentUser?.username }}</span>
          <button class="app-shell-logout" type="button" @click="logout">退出</button>
        </div>
      </header>

      <main class="app-shell-main">
        <NormalMode v-if="appMode === 'workbench'" />
        <SolutionCenter v-else-if="appMode === 'solutions'" />
        <TaskCenter v-else-if="appMode === 'task-center'" />
      </main>
    </div>
  </el-config-provider>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, onMounted, onBeforeUnmount } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import LoginView from './components/LoginView.vue'
import { fetchWithTimeout } from './utils/apiClient.js'

const NormalMode = defineAsyncComponent(() => import('./components/NormalMode.vue'))
const SolutionCenter = defineAsyncComponent(() => import('./components/SolutionCenter.vue'))
const TaskCenter = defineAsyncComponent(() => import('./components/TaskCenter.vue'))

const HEALTH_FAILURE_THRESHOLD = 3

const appMode = ref('workbench')
const backendOnline = ref(true)
const authState = ref('checking')
const currentUser = ref(null)
let healthTimer = null
let sessionTimer = null
let healthCheckInFlight = false
let sessionCheckInFlight = false
let isDisposed = false
let consecutiveBackendFailures = 0

const userInitial = computed(() => {
  const label = currentUser.value?.displayName || currentUser.value?.username || 'U'
  return String(label).trim().slice(0, 1).toUpperCase()
})

function markBackendSuccess() {
  consecutiveBackendFailures = 0
  backendOnline.value = true
}

function markBackendFailure() {
  consecutiveBackendFailures += 1
  if (consecutiveBackendFailures >= HEALTH_FAILURE_THRESHOLD) {
    backendOnline.value = false
  }
}

const checkHealth = async () => {
  if (healthCheckInFlight) return
  healthCheckInFlight = true
  try {
    const res = await fetchWithTimeout('/api/health', { cache: 'no-store' })
    if (res.ok) markBackendSuccess()
    else markBackendFailure()
  } catch {
    markBackendFailure()
  } finally {
    healthCheckInFlight = false
  }
}

function stopAuthenticatedLoops() {
  clearInterval(healthTimer)
  clearInterval(sessionTimer)
  healthTimer = null
  sessionTimer = null
}

function startAuthenticatedLoops() {
  stopAuthenticatedLoops()
  if (document.hidden || authState.value !== 'authenticated') return
  checkHealth()
  healthTimer = setInterval(checkHealth, 30000)
  sessionTimer = setInterval(checkSession, 60000)
}

async function checkSession() {
  if (sessionCheckInFlight) return
  sessionCheckInFlight = true
  try {
    const response = await fetchWithTimeout('/api/auth/me', { cache: 'no-store' })
    markBackendSuccess()
    if (response.status === 401) {
      currentUser.value = null
      authState.value = 'guest'
      stopAuthenticatedLoops()
      return
    }
    if (!response.ok) throw new Error(`Session check failed with status ${response.status}`)
    const data = await response.json()
    currentUser.value = data.user
    authState.value = 'authenticated'
  } catch {
    markBackendFailure()
    if (authState.value === 'checking') {
      currentUser.value = null
      authState.value = 'guest'
    }
  } finally {
    sessionCheckInFlight = false
  }
}

function handleAuthenticated(user) {
  markBackendSuccess()
  currentUser.value = user
  authState.value = 'authenticated'
  startAuthenticatedLoops()
}

function handleAuthRequired() {
  currentUser.value = null
  authState.value = 'guest'
  stopAuthenticatedLoops()
}

async function handleVisibilityChange() {
  if (document.hidden) {
    stopAuthenticatedLoops()
    return
  }
  if (authState.value !== 'authenticated') return

  await checkSession()
  if (!isDisposed && authState.value === 'authenticated') startAuthenticatedLoops()
}

async function logout() {
  try {
    await fetchWithTimeout('/api/auth/logout', { method: 'POST' })
  } finally {
    stopAuthenticatedLoops()
    currentUser.value = null
    authState.value = 'guest'
    appMode.value = 'workbench'
  }
}

onMounted(async () => {
  window.addEventListener('cdp:auth-required', handleAuthRequired)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  await checkSession()
  if (!isDisposed && authState.value === 'authenticated') startAuthenticatedLoops()
})

onBeforeUnmount(() => {
  isDisposed = true
  window.removeEventListener('cdp:auth-required', handleAuthRequired)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopAuthenticatedLoops()
})
</script>

<style scoped>
.auth-checking-screen {
  display: grid;
  place-items: center;
  width: 100vw;
  height: 100vh;
  background: var(--ui-fill);
}

.auth-checking-mark {
  display: flex;
  gap: 5px;
}

.auth-checking-mark i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ui-ink);
  animation: auth-dot 900ms ease-in-out infinite alternate;
}

.auth-checking-mark i:nth-child(2) { background: var(--ui-accent); animation-delay: 150ms; }
.auth-checking-mark i:nth-child(3) { opacity: 0.25; animation-delay: 300ms; }

.app-shell-account {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid;
  border-left-color: var(--ui-divider);
}

.app-shell-avatar {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  color: #fff;
  font-size: 11px;
  font-weight: 650;
  background: var(--ui-ink);
  border-radius: 50%;
}

.app-shell-user {
  max-width: 96px;
  overflow: hidden;
  color: var(--ui-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-shell-logout {
  padding: 4px 0 4px 4px;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 11px;
  background: none;
  border: 0;
  cursor: pointer;
  transition: color 180ms ease;
}

.app-shell-logout:hover { color: var(--ui-accent); }

@keyframes auth-dot {
  from { transform: translateY(2px); opacity: 0.35; }
  to { transform: translateY(-2px); opacity: 1; }
}
</style>
