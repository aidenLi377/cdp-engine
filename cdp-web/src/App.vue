<template>
  <el-config-provider :locale="zhCn">
    <div v-if="authState === 'checking'" class="auth-checking-screen" aria-label="正在检查登录状态">
      <span class="auth-checking-mark"><i></i><i></i><i></i></span>
    </div>

    <LoginView v-else-if="authState === 'guest'" @authenticated="handleAuthenticated" />

    <div v-else class="cdp-engine-container">
      <transition name="fade-slide">
        <div v-if="!backendOnline" class="offline-banner">
          后端服务连接失败，请检查服务器是否已启动
          <el-button size="small" text @click="checkHealth" style="color:#fff;text-decoration:underline">重试</el-button>
        </div>
      </transition>

      <header class="app-shell-header">
        <div class="app-shell-title">
          <div class="display-feature-title">圈选工作台</div>
          <div class="display-body-light">可视化搭建、方案管理与任务调度</div>
        </div>

        <nav class="app-shell-nav" aria-label="主导航">
          <el-radio-group v-model="appMode" size="small" class="intercom-radio-group">
            <el-radio-button label="workbench">工作台</el-radio-button>
            <el-radio-button label="solutions">方案中心</el-radio-button>
            <el-radio-button label="task-center">任务中台</el-radio-button>
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
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import LoginView from './components/LoginView.vue'
import NormalMode from './components/NormalMode.vue'
import SolutionCenter from './components/SolutionCenter.vue'
import TaskCenter from './components/TaskCenter.vue'

const appMode = ref('workbench')
const backendOnline = ref(true)
const authState = ref('checking')
const currentUser = ref(null)
let healthTimer = null
let sessionTimer = null

const userInitial = computed(() => {
  const label = currentUser.value?.displayName || currentUser.value?.username || 'U'
  return String(label).trim().slice(0, 1).toUpperCase()
})

const checkHealth = async () => {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })
    backendOnline.value = res.ok
  } catch {
    backendOnline.value = false
  }
}

function startHealthLoop() {
  checkHealth()
  healthTimer = setInterval(checkHealth, 30000)
}

async function checkSession() {
  try {
    const response = await fetch('/api/auth/me')
    if (!response.ok) {
      currentUser.value = null
      authState.value = 'guest'
      return
    }
    const data = await response.json()
    currentUser.value = data.user
    authState.value = 'authenticated'
  } catch {
    currentUser.value = null
    authState.value = 'guest'
  }
}

function handleAuthenticated(user) {
  currentUser.value = user
  authState.value = 'authenticated'
}

function handleAuthRequired() {
  currentUser.value = null
  authState.value = 'guest'
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } finally {
    currentUser.value = null
    authState.value = 'guest'
    appMode.value = 'workbench'
  }
}

onMounted(() => {
  window.addEventListener('cdp:auth-required', handleAuthRequired)
  startHealthLoop()
  checkSession()
  sessionTimer = setInterval(() => {
    if (authState.value === 'authenticated') checkSession()
  }, 60000)
})

onBeforeUnmount(() => {
  window.removeEventListener('cdp:auth-required', handleAuthRequired)
  clearInterval(healthTimer)
  clearInterval(sessionTimer)
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
