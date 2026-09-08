<template>
  <el-config-provider :locale="zhCn">
    <div v-if="authState === 'checking'" class="auth-checking-screen" aria-label="正在检查登录状态">
      <span class="auth-checking-mark"><i></i><i></i><i></i></span>
    </div>

    <RegisterView
      v-else-if="authState === 'guest' && inviteToken"
      :token="inviteToken"
      @authenticated="handleAuthenticated"
      @cancel="cancelInviteRegistration"
    />

    <LoginView v-else-if="authState === 'guest'" @authenticated="handleAuthenticated" />

    <div v-else class="cdp-engine-container">
      <transition name="fade-slide">
        <div v-if="!backendOnline" class="offline-banner">
          暂时无法连接服务
        </div>
      </transition>

      <header class="app-shell-header">
        <div class="app-shell-title">
          <div class="display-feature-title">X-Data</div>
        </div>

        <nav class="app-shell-nav" aria-label="主导航">
          <el-radio-group
            v-model="appMode"
            size="small"
            class="intercom-radio-group app-mode-switcher"
            :class="`is-${appMode}`"
            aria-label="切换工作区域"
          >
            <el-radio-button
              value="workbench"
              data-tutorial-target="open-workbench"
              @click="handleWorkbenchTutorialClick"
            >数据引擎人群圈包</el-radio-button>
            <el-radio-button
              value="solutions"
              data-tutorial-target="open-solution-center"
              @click="handleSolutionCenterTutorialClick"
            >数据引擎取数模板</el-radio-button>
            <el-radio-button
              value="task-center"
              data-tutorial-target="open-task-center"
              @click="handleTaskCenterTutorialClick"
            >达摩盘取数</el-radio-button>
          </el-radio-group>
          <button
            v-if="canAccessAdmin"
            class="app-admin-link"
            :class="{ active: appMode === 'admin' }"
            type="button"
            @click="appMode = 'admin'"
          >
            系统管理
          </button>
        </nav>

        <div class="app-shell-account">
          <button
            class="app-tutorial-link"
            :class="{ active: appMode === 'tutorials', 'is-complete': tutorialsComplete }"
            type="button"
            :title="tutorialsComplete ? '打开新手教程（已全部完成）' : '打开新手教程'"
            :aria-label="tutorialsComplete ? '打开新手教程，全部 7 项已完成' : `打开新手教程，已完成 ${tutorialMilestoneCount}/${TUTORIAL_MILESTONE_TOTAL}`"
            @click="openTutorialCenter"
          >
            <el-icon><Reading /></el-icon>
            <template v-if="!tutorialsComplete">
              <span>教程</span>
              <small>{{ tutorialMilestoneCount }}/{{ TUTORIAL_MILESTONE_TOTAL }}</small>
            </template>
          </button>
          <button
            class="app-announcement-link"
            :class="{ active: appMode === 'announcements' }"
            type="button"
            title="查看更新公告"
            aria-label="查看更新公告"
            @click="openAnnouncementCenter()"
          >
            <span class="app-announcement-icon">
              <el-icon><Bell /></el-icon>
              <i
                v-if="announcementUnreadCount > 0"
                class="app-announcement-unread-dot"
                aria-hidden="true"
              ></i>
            </span>
            <span>公告</span>
          </button>
          <button
            class="app-feedback-link"
            type="button"
            title="提交用户反馈"
            aria-label="提交用户反馈"
            @click="feedbackOpen = true"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span>反馈</span>
          </button>
          <button class="app-shell-profile" type="button" title="修改个人资料" @click="profileOpen = true">
            <span class="app-shell-avatar">
              <img v-if="currentUser?.avatarUrl" :src="currentUser.avatarUrl" alt="" />
              <template v-else>{{ userInitial }}</template>
            </span>
            <span class="app-shell-user">{{ currentUser?.displayName || currentUser?.username }}</span>
          </button>
          <button class="app-shell-logout" type="button" @click="logout">退出</button>
        </div>
      </header>

      <main class="app-shell-main">
        <KeepAlive>
          <NormalMode
            v-if="appMode === 'workbench'"
            :session-owner-id="currentUser?.id"
          />
          <SolutionCenter
            v-else-if="appMode === 'solutions'"
            :current-user-role="currentUser?.role"
            :session-owner-id="currentUser?.id"
          />
          <TaskCenter
            v-else-if="appMode === 'task-center'"
            :session-owner-id="currentUser?.id"
          />
          <AdminCenter
            v-else-if="appMode === 'admin'"
            :current-user-id="currentUser?.id"
            :current-user-role="currentUser?.role"
            :is-system-owner="Boolean(currentUser?.isSystemOwner)"
            @current-user-updated="handleCurrentUserUpdated"
          />
          <TutorialCenter
            v-else-if="appMode === 'tutorials'"
            :initial-tutorial-id="tutorialCenterInitialId"
            :focus-start-token="tutorialCenterFocusToken"
            :celebration-token="tutorialCenterCelebrationToken"
            @close="closeTutorialCenter"
            @start-tutorial="handleStartTutorial"
          />
          <AnnouncementCenter
            v-else-if="appMode === 'announcements'"
            :initial-id="selectedAnnouncementId"
            @close="closeAnnouncementCenter"
            @read-updated="handleAnnouncementRead"
          />
        </KeepAlive>
      </main>

      <ProfileDialog
        v-if="profileOpen"
        :user="currentUser"
        @close="profileOpen = false"
        @updated="handleProfileUpdated"
      />
      <FeedbackDrawer :open="feedbackOpen" @close="feedbackOpen = false" />
      <TutorialWelcomeDialog
        :open="tutorialWelcomeOpen"
        :progress-items="tutorialProgressItems"
        @dismiss="dismissTutorialWelcome"
        @experience="handleTutorialWelcomeExperience"
      />
      <GuidedTutorialOverlay />
    </div>
  </el-config-provider>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { Bell, ChatDotRound, Reading } from '@element-plus/icons-vue'
import LoginView from './components/LoginView.vue'
import RegisterView from './components/RegisterView.vue'
import ProfileDialog from './components/ProfileDialog.vue'
import FeedbackDrawer from './components/FeedbackDrawer.vue'
import GuidedTutorialOverlay from './components/GuidedTutorialOverlay.vue'
import TutorialWelcomeDialog from './components/TutorialWelcomeDialog.vue'
import {
  completeGuidedTutorialStep,
  isGuidedTutorialStep,
  startGuidedTutorial,
} from './composables/useGuidedTutorial.js'
import { fetchWithTimeout, request } from './utils/apiClient.js'
import {
  refreshConfigVersion,
  resetConfigVersionState,
} from './utils/configVersion.js'
import {
  clearSessionWorkspace,
  readSessionWorkspace,
  writeSessionWorkspace,
} from './utils/sessionWorkspace.js'
import {
  TUTORIAL_MILESTONE_TOTAL,
  becameAllTutorialsComplete,
  countCompletedMilestones,
} from './utils/tutorialCatalog.js'
import {
  TUTORIAL_PROGRESS_EVENT,
  fetchTutorialProgress,
} from './utils/tutorialProgress.js'

const NormalMode = defineAsyncComponent(() => import('./components/NormalMode.vue'))
const SolutionCenter = defineAsyncComponent(() => import('./components/SolutionCenter.vue'))
const TaskCenter = defineAsyncComponent(() => import('./components/TaskCenter.vue'))
const AdminCenter = defineAsyncComponent(() => import('./components/AdminCenter.vue'))
const TutorialCenter = defineAsyncComponent(() => import('./components/TutorialCenter.vue'))
const AnnouncementCenter = defineAsyncComponent(() => import('./components/AnnouncementCenter.vue'))

const HEALTH_FAILURE_THRESHOLD = 3
const APP_MODE_SESSION_KEY = 'app-mode.v1'
const STANDARD_APP_MODES = new Set(['workbench', 'solutions', 'task-center', 'tutorials', 'announcements'])

const appMode = ref('workbench')
const backendOnline = ref(true)
const authState = ref('checking')
const currentUser = ref(null)
const profileOpen = ref(false)
const feedbackOpen = ref(false)
const announcementUnreadCount = ref(0)
const tutorialProgressItems = ref([])
const tutorialWelcomeOpen = ref(false)
const tutorialCenterInitialId = ref('')
const tutorialCenterFocusToken = ref(0)
const tutorialCenterCelebrationToken = ref(0)
const selectedAnnouncementId = ref('')
const announcementReturnMode = ref('workbench')
const tutorialReturnMode = ref('workbench')
const inviteToken = ref(new URLSearchParams(window.location.search).get('invite') || '')
let healthTimer = null
let sessionTimer = null
let healthCheckInFlight = false
let sessionCheckInFlight = false
let configVersionCheckInFlight = false
let announcementCheckInFlight = false
let announcementStateRevision = 0
let isDisposed = false
let consecutiveBackendFailures = 0
let tutorialWelcomeTimer = null

const TUTORIAL_WELCOME_VERSION = 'login-v2'

function tutorialWelcomeStorageKey(userId) {
  return `xdata:tutorial-welcome:${TUTORIAL_WELCOME_VERSION}:${String(userId || '')}`
}

function hasDismissedTutorialWelcome(userId) {
  if (!userId) return true
  try {
    return window.sessionStorage.getItem(tutorialWelcomeStorageKey(userId)) === 'read'
  } catch {
    return false
  }
}

function rememberTutorialWelcomeRead(userId) {
  if (!userId) return
  try {
    window.sessionStorage.setItem(tutorialWelcomeStorageKey(userId), 'read')
  } catch {
    // 浏览器禁用本地存储时，仍允许用户在当前登录期间关闭提示。
  }
}

const userInitial = computed(() => {
  const label = currentUser.value?.displayName || currentUser.value?.username || 'U'
  return String(label).trim().slice(0, 1).toUpperCase()
})

const canAccessAdmin = computed(() =>
  ['super_admin', 'config_admin'].includes(currentUser.value?.role),
)

const tutorialMilestoneCount = computed(() =>
  countCompletedMilestones(tutorialProgressItems.value),
)
const tutorialsComplete = computed(() =>
  tutorialMilestoneCount.value >= TUTORIAL_MILESTONE_TOTAL,
)

function canUseAppMode(mode, user = currentUser.value) {
  if (STANDARD_APP_MODES.has(mode)) return true
  return mode === 'admin' && ['super_admin', 'config_admin'].includes(user?.role)
}

function restoreAppMode(user) {
  const stored = readSessionWorkspace(APP_MODE_SESSION_KEY, user?.id)
  appMode.value = canUseAppMode(stored?.mode, user) ? stored.mode : 'workbench'
}

function clearWorkspaceSession() {
  window.dispatchEvent(new CustomEvent('cdp:workspace-session-clearing'))
  clearSessionWorkspace()
  appMode.value = 'workbench'
}

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
    if (res.ok) {
      markBackendSuccess()
      void checkConfigVersion()
    }
    else markBackendFailure()
  } catch {
    markBackendFailure()
  } finally {
    healthCheckInFlight = false
  }
}

async function checkConfigVersion() {
  if (configVersionCheckInFlight || authState.value !== 'authenticated') return
  configVersionCheckInFlight = true
  try {
    await refreshConfigVersion()
  } catch {
    // Health and session checks remain the source of connection state.
  } finally {
    configVersionCheckInFlight = false
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
    const previousUserId = currentUser.value?.id
    const previousAuthState = authState.value
    const response = await fetchWithTimeout('/api/auth/me', { cache: 'no-store' })
    markBackendSuccess()
    if (response.status === 401) {
      handleAuthRequired()
      return
    }
    if (!response.ok) throw new Error(`Session check failed with status ${response.status}`)
    const data = await response.json()
    currentUser.value = data.user
    authState.value = 'authenticated'
    if (previousAuthState !== 'authenticated' || previousUserId !== data.user?.id) {
      restoreAppMode(data.user)
      void refreshAnnouncementState()
      void refreshTutorialProgress({ offerWelcome: true })
    }
  } catch {
    markBackendFailure()
    if (authState.value === 'checking') {
      currentUser.value = null
      authState.value = 'guest'
      clearWorkspaceSession()
    }
  } finally {
    sessionCheckInFlight = false
  }
}

function handleAuthenticated(user) {
  markBackendSuccess()
  clearTimeout(tutorialWelcomeTimer)
  tutorialWelcomeOpen.value = false
  try { window.sessionStorage.removeItem(tutorialWelcomeStorageKey(user.id)) } catch { /* Session-only fallback. */ }
  currentUser.value = user
  authState.value = 'authenticated'
  restoreAppMode(user)
  void refreshAnnouncementState()
  void refreshTutorialProgress({ offerWelcome: true })
  if (inviteToken.value) {
    window.history.replaceState({}, '', window.location.pathname)
    inviteToken.value = ''
  }
  startAuthenticatedLoops()
}

function handleCurrentUserUpdated(user) {
  if (currentUser.value?.id !== user?.id) return
  currentUser.value = { ...currentUser.value, ...user }
}

function handleProfileUpdated(user) {
  currentUser.value = user
  profileOpen.value = false
}

async function refreshAnnouncementState() {
  if (announcementCheckInFlight || authState.value !== 'authenticated') return
  announcementCheckInFlight = true
  const requestedRevision = announcementStateRevision
  try {
    const items = await request('/api/announcements', { params: { limit: 100 }, cache: 'no-store' })
    if (requestedRevision === announcementStateRevision) {
      announcementUnreadCount.value = items.filter(
        (item) => (item.kind || 'announcement') === 'announcement' && !item.readAt,
      ).length
    }
  } catch {
    // 公告读取失败不应阻断用户进入核心工作区。
  } finally {
    announcementCheckInFlight = false
  }
}

function scheduleTutorialWelcome() {
  clearTimeout(tutorialWelcomeTimer)
  const userId = currentUser.value?.id
  if (
    !userId
    || hasDismissedTutorialWelcome(userId)
    || tutorialMilestoneCount.value >= TUTORIAL_MILESTONE_TOTAL
  ) return

  tutorialWelcomeTimer = window.setTimeout(() => {
    if (
      authState.value === 'authenticated'
      && currentUser.value?.id === userId
      && !hasDismissedTutorialWelcome(userId)
    ) {
      tutorialWelcomeOpen.value = true
      rememberTutorialWelcomeRead(userId)
    }
  }, 420)
}

async function refreshTutorialProgress({ offerWelcome = false } = {}) {
  if (authState.value !== 'authenticated') return
  const requestedUserId = currentUser.value?.id
  try {
    const items = await fetchTutorialProgress()
    if (authState.value !== 'authenticated' || currentUser.value?.id !== requestedUserId) return
    tutorialProgressItems.value = items
    if (offerWelcome) scheduleTutorialWelcome()
  } catch {
    // 学习进度读取失败不应阻断用户进入核心工作区。
  }
}

function handleTutorialProgressChanged(event) {
  const item = event.detail
  if (!item?.tutorialId) {
    void refreshTutorialProgress()
    return
  }
  const nextItems = [
    item,
    ...tutorialProgressItems.value.filter((entry) => entry.tutorialId !== item.tutorialId),
  ]
  const shouldCelebrate = becameAllTutorialsComplete(tutorialProgressItems.value, nextItems)
  tutorialProgressItems.value = nextItems
  if (!shouldCelebrate) return

  tutorialWelcomeOpen.value = false
  tutorialCenterInitialId.value = ''
  if (appMode.value !== 'tutorials') tutorialReturnMode.value = appMode.value
  tutorialCenterCelebrationToken.value += 1
  appMode.value = 'tutorials'
}

function openTutorialCenter() {
  tutorialWelcomeOpen.value = false
  if (appMode.value !== 'tutorials') tutorialReturnMode.value = appMode.value
  appMode.value = 'tutorials'
}

function dismissTutorialWelcome() {
  rememberTutorialWelcomeRead(currentUser.value?.id)
  tutorialWelcomeOpen.value = false
}

function handleTutorialWelcomeExperience() {
  tutorialWelcomeOpen.value = false
  tutorialCenterInitialId.value = ''
  openTutorialCenter()
}

function closeTutorialCenter() {
  const nextMode = canUseAppMode(tutorialReturnMode.value) && tutorialReturnMode.value !== 'tutorials'
    ? tutorialReturnMode.value
    : 'workbench'
  appMode.value = nextMode
}

function openAnnouncementCenter(id = '') {
  if (appMode.value !== 'announcements') announcementReturnMode.value = appMode.value
  selectedAnnouncementId.value = typeof id === 'string' ? id : ''
  appMode.value = 'announcements'
}

function closeAnnouncementCenter() {
  const nextMode = canUseAppMode(announcementReturnMode.value) && announcementReturnMode.value !== 'announcements'
    ? announcementReturnMode.value
    : 'workbench'
  appMode.value = nextMode
}

function handleStartTutorial(taskId) {
  if (!startGuidedTutorial(taskId)) return
  tutorialCenterInitialId.value = ''
  selectedAnnouncementId.value = ''
  appMode.value = 'workbench'
}

function handleTaskCenterTutorialClick() {
  if (isGuidedTutorialStep('open-task-center')) {
    completeGuidedTutorialStep('open-task-center')
  }
}

function handleSolutionCenterTutorialClick() {
  const stepId = [
    'open-solution-center',
    'pull-open-center-own',
    'pull-open-center-competitor',
  ].find((id) => isGuidedTutorialStep(id))
  if (stepId) completeGuidedTutorialStep(stepId)
}

function handleWorkbenchTutorialClick() {
  const stepId = [
    'open-workbench-after-publish',
    'parameter-open-workbench',
    'pull-open-workbench-competitor',
    'pull-open-workbench-group',
  ].find((id) => isGuidedTutorialStep(id))
  if (stepId) completeGuidedTutorialStep(stepId)
}

function handleAnnouncementRead(state) {
  announcementStateRevision += 1
  if (Number.isInteger(state?.unreadCount)) {
    announcementUnreadCount.value = Math.max(0, state.unreadCount)
    return
  }
  void refreshAnnouncementState()
}

function cancelInviteRegistration() {
  window.history.replaceState({}, '', window.location.pathname)
  inviteToken.value = ''
}

function handleAuthRequired() {
  clearTimeout(tutorialWelcomeTimer)
  tutorialWelcomeOpen.value = false
  tutorialCenterInitialId.value = ''
  tutorialCenterCelebrationToken.value = 0
  profileOpen.value = false
  feedbackOpen.value = false
  announcementUnreadCount.value = 0
  tutorialProgressItems.value = []
  currentUser.value = null
  authState.value = 'guest'
  clearWorkspaceSession()
  resetConfigVersionState()
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
    clearTimeout(tutorialWelcomeTimer)
    tutorialWelcomeOpen.value = false
    tutorialCenterInitialId.value = ''
    tutorialCenterCelebrationToken.value = 0
    profileOpen.value = false
    feedbackOpen.value = false
    announcementUnreadCount.value = 0
    tutorialProgressItems.value = []
    stopAuthenticatedLoops()
    resetConfigVersionState()
    clearWorkspaceSession()
    currentUser.value = null
    authState.value = 'guest'
    inviteToken.value = ''
  }
}

watch(appMode, (mode) => {
  if (authState.value !== 'authenticated' || !currentUser.value?.id) return
  const safeMode = canUseAppMode(mode) ? mode : 'workbench'
  if (safeMode !== mode) {
    appMode.value = safeMode
    return
  }
  writeSessionWorkspace(APP_MODE_SESSION_KEY, currentUser.value.id, { mode: safeMode })
})

onMounted(async () => {
  window.addEventListener('cdp:auth-required', handleAuthRequired)
  window.addEventListener('cdp:announcements-changed', refreshAnnouncementState)
  window.addEventListener(TUTORIAL_PROGRESS_EVENT, handleTutorialProgressChanged)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  await checkSession()
  if (!isDisposed && authState.value === 'authenticated') startAuthenticatedLoops()
})

onBeforeUnmount(() => {
  isDisposed = true
  clearTimeout(tutorialWelcomeTimer)
  window.removeEventListener('cdp:auth-required', handleAuthRequired)
  window.removeEventListener('cdp:announcements-changed', refreshAnnouncementState)
  window.removeEventListener(TUTORIAL_PROGRESS_EVENT, handleTutorialProgressChanged)
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

.app-feedback-link,
.app-tutorial-link,
.app-announcement-link {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 11px;
  background: #fff;
  border: 1px solid var(--ui-divider);
  border-radius: 999px;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.app-feedback-link:hover,
.app-tutorial-link:hover,
.app-tutorial-link.active,
.app-announcement-link:hover,
.app-announcement-link.active {
  color: #fff;
  background: var(--ui-ink);
  border-color: var(--ui-ink);
  transform: translateY(-1px);
}

.app-feedback-link:focus-visible,
.app-tutorial-link:focus-visible,
.app-announcement-link:focus-visible {
  outline: 2px solid var(--ui-accent-ring);
  outline-offset: 2px;
}

.app-tutorial-link small {
  min-width: 27px;
  padding: 3px 5px;
  color: #176fc2;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  background: #eaf4ff;
  border-radius: 999px;
}

.app-tutorial-link.is-complete {
  width: 28px;
  justify-content: center;
  padding: 0;
}

.app-tutorial-link:hover small,
.app-tutorial-link.active small {
  color: #10243d;
  background: #fff;
}

.app-announcement-icon {
  position: relative;
  display: inline-flex;
}

.app-announcement-unread-dot {
  position: absolute;
  top: -4px;
  right: -5px;
  width: 6px;
  height: 6px;
  background: var(--ui-accent);
  border: 1px solid #fff;
  border-radius: 50%;
}

.app-shell-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 2px 2px;
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: background 180ms ease;
}

.app-shell-profile:hover { background: var(--ui-fill); }

.app-admin-link {
  height: 30px;
  margin-left: 8px;
  padding: 0 12px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 1px solid var(--ui-divider);
  border-radius: 999px;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
}

.app-admin-link:hover,
.app-admin-link.active {
  color: var(--ui-ink);
  background: var(--ui-fill);
  border-color: var(--ui-ink);
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
  overflow: hidden;
}

.app-shell-avatar img { width: 100%; height: 100%; object-fit: cover; }

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
