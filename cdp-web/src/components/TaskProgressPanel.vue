<template>
  <div class="task-panel">
    <div class="task-panel-header">
      <span class="display-feature-title">RPA 任务</span>
      <el-button size="small" text @click="refresh">刷新</el-button>
    </div>

    <!-- Active task progress -->
    <div v-if="activeTask" class="task-card task-active">
      <div class="task-card-head">
        <span class="task-status" :class="activeTask.status">{{ statusText(activeTask.status) }}</span>
        <span class="display-body strong">{{ activeTask.crowdName }}</span>
      </div>
      <div v-if="activeTask.progress" class="task-progress">
        <el-progress
          :percentage="activeTask.progress.percent || 0"
          :stroke-width="6"
          :show-text="true"
        />
        <div class="task-detail">{{ activeTask.progress.detail }}</div>
      </div>
      <div v-if="activeTask.error" class="task-error">{{ activeTask.error }}</div>
      <div v-if="activeTask.status === 'completed'" class="task-actions">
        <el-button size="small" type="primary" @click="downloadResult(activeTask)">
          下载 Excel
        </el-button>
      </div>
    </div>

    <div v-else-if="tasks.length === 0" class="empty-state-sm display-body-light">
      暂无任务记录
    </div>

    <!-- History list -->
    <div v-if="tasks.length > 0" class="task-history">
      <div
        v-for="task in historyTasks"
        :key="task.taskId"
        class="task-card"
      >
        <div class="task-card-head">
          <span class="task-status" :class="task.status">{{ statusText(task.status) }}</span>
          <span class="display-body">{{ task.crowdName }}</span>
        </div>
        <div class="task-meta">
          <span>{{ formatTime(task.createdAt) }}</span>
          <span v-if="task.totalRows">{{ task.totalRows }} 行</span>
        </div>
        <div v-if="task.status === 'completed'" class="task-actions">
          <el-button size="small" text type="primary" @click="downloadResult(task)">
            下载
          </el-button>
        </div>
        <div v-if="task.error" class="task-error">{{ task.error }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const tasks = ref([])
let pollTimer = null

const activeTask = computed(() =>
  tasks.value.find(t => t.status === 'running' || t.status === 'pending') || null,
)

const historyTasks = computed(() =>
  tasks.value.filter(t => t.status !== 'running' && t.status !== 'pending'),
)

function statusText(status) {
  return { pending: '等待中', running: '执行中', completed: '已完成', failed: '失败' }[status] || status
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function refresh() {
  try {
    const resp = await fetch('/api/rpa/tasks')
    const data = await resp.json()
    tasks.value = data.tasks || []
  } catch {
    // silent
  }
}

function downloadResult(task) {
  const filename = task.excelFilename || `${task.taskId}.xlsx`
  const a = document.createElement('a')
  a.href = `/api/rpa/download/${filename}`
  a.download = filename
  a.click()
}

onMounted(() => {
  refresh()
  pollTimer = setInterval(refresh, 5000)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
})
</script>

<style scoped>
.task-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}
.task-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}
.task-card {
  border: 1px solid #eaeaea;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}
.task-active {
  border-color: #ff8d6d;
  background: #fff6f4;
}
.task-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.task-status {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.task-status.pending { background: #f0f0f0; color: #666; }
.task-status.running { background: #fff2e8; color: #ff6b4a; }
.task-status.completed { background: #f6ffed; color: #52c41a; }
.task-status.failed { background: #fff1f0; color: #ff4d4f; }

.task-progress { margin-top: 8px; }
.task-detail { font-size: 12px; color: #666; margin-top: 4px; }
.task-error { color: #ff4d4f; font-size: 12px; margin-top: 4px; }
.task-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
.task-actions { margin-top: 6px; }
</style>
