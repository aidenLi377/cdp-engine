<template>
  <el-config-provider :locale="zhCn">
    <div class="cdp-app-shell">
      <transition name="fade-slide">
        <div v-if="!backendOnline" class="offline-banner">
          后端服务连接失败，请检查服务是否已启动
          <el-button size="small" text @click="checkHealth" class="shell-link-btn">重试</el-button>
        </div>
      </transition>

      <header class="cdp-topbar">
        <div class="cdp-topbar-brand">
          <div class="cdp-brand-mark"></div>
          <div>
            <p class="cdp-topbar-eyebrow">CDP Audience Studio</p>
            <h1 class="cdp-topbar-title">人群配置工作台</h1>
          </div>
        </div>

        <div class="cdp-topbar-actions">
          <span class="cdp-status-pill" :class="{ offline: !backendOnline }">
            {{ backendOnline ? '服务正常' : '服务离线' }}
          </span>
          <el-radio-group v-model="appMode" size="small" class="cdp-mode-switch">
            <el-radio-button label="normal">可视化配置</el-radio-button>
            <el-radio-button label="batch">批量车间</el-radio-button>
          </el-radio-group>
        </div>
      </header>

      <main class="cdp-shell-body">
        <div class="cdp-shell-content">
          <NormalMode v-if="appMode === 'normal'" />
          <BatchMode v-else-if="appMode === 'batch'" />
        </div>
      </main>
    </div>
  </el-config-provider>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import NormalMode from './components/NormalMode.vue'
import BatchMode from './components/BatchMode.vue'

const appMode = ref('normal')
const backendOnline = ref(true)
let healthTimer = null

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

onMounted(() => {
  startHealthLoop()
})

onBeforeUnmount(() => {
  clearInterval(healthTimer)
})
</script>
