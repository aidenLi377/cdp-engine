<template>
  <el-config-provider :locale="zhCn">
    <div class="cdp-engine-container">
      <transition name="fade-slide">
        <div v-if="!backendOnline" class="offline-banner">
          后端服务连接失败，请检查服务器是否已启动
          <el-button size="small" text @click="checkHealth" style="color:#fff;text-decoration:underline">重试</el-button>
        </div>
      </transition>

      <header class="app-shell-header">
        <div class="app-shell-title">
          <div class="display-feature-title">CDP 圈选工作台</div>
          <div class="display-body-light">可视化搭建、方案管理与矩阵装配</div>
        </div>

        <div class="app-shell-visual-nav">
          <nav class="app-shell-nav" aria-label="主功能导航">
            <el-radio-group v-model="appMode" size="small" class="intercom-radio-group">
              <el-radio-button label="visual">可视化点选</el-radio-button>
              <el-radio-button label="batch">矩阵装配车间</el-radio-button>
            </el-radio-group>
          </nav>

          <nav
            v-if="appMode === 'visual'"
            class="app-shell-subnav"
            aria-label="可视化点选子导航"
          >
            <span class="app-shell-subnav-label">子页面</span>
            <el-radio-group v-model="visualSection" size="small" class="intercom-radio-group">
              <el-radio-button label="workbench">工作台</el-radio-button>
              <el-radio-button label="solutions">方案中心</el-radio-button>
            </el-radio-group>
          </nav>
        </div>
      </header>

      <main class="app-shell-main">
        <template v-if="appMode === 'visual'">
          <NormalMode v-if="visualSection === 'workbench'" />
          <SolutionCenter v-else-if="visualSection === 'solutions'" />
        </template>
        <BatchMode v-else-if="appMode === 'batch'" />
      </main>
    </div>
  </el-config-provider>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import NormalMode from './components/NormalMode.vue'
import BatchMode from './components/BatchMode.vue'
import SolutionCenter from './components/SolutionCenter.vue'

const appMode = ref('visual')
const visualSection = ref('workbench')
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
