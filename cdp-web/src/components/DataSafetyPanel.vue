<template>
  <section class="data-safety-panel">
    <header class="data-safety-head">
      <div>
        <p>DATA SAFETY / LIVE</p>
        <h2>生产数据保护</h2>
        <span>数据库与版本目录分离；发布前创建备份，发布后校验完整性与核心数据量。</span>
      </div>
      <div class="data-safety-actions">
        <button class="secondary" type="button" :disabled="loading || backingUp" @click="loadStatus">
          <el-icon><RefreshRight /></el-icon>{{ loading ? '检查中…' : '重新检查' }}
        </button>
        <button class="primary" type="button" :disabled="loading || backingUp" @click="makeBackup">
          <el-icon><Lock /></el-icon>{{ backingUp ? '备份中…' : '立即备份' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="data-safety-loading">正在读取数据库保护状态…</div>
    <template v-else-if="snapshot">
      <div class="data-safety-overview">
        <article class="database-card" :class="{ healthy: snapshot.database?.healthy }">
          <el-icon><CircleCheckFilled v-if="snapshot.database?.healthy" /><WarningFilled v-else /></el-icon>
          <div class="database-card-copy">
            <small>生产数据库</small>
            <strong>{{ snapshot.database?.healthy ? '运行正常' : '需要检查' }}</strong>
            <span>SQLite quick_check：{{ snapshot.database?.quickCheck || '未知' }}</span>
          </div>
          <dl>
            <div>
              <dt>数据库路径</dt>
              <dd><code :title="snapshot.database?.path">{{ snapshot.database?.path || '未配置' }}</code></dd>
            </div>
            <div>
              <dt>最近写入</dt>
              <dd>{{ snapshot.database?.modifiedAt ? formatDate(snapshot.database.modifiedAt) : '未知' }}</dd>
            </div>
            <div>
              <dt>文件大小</dt>
              <dd>{{ formatBytes(snapshot.database?.byteSize) }}</dd>
            </div>
          </dl>
        </article>

        <article v-for="item in countCards" :key="item.key" class="data-count-card">
          <span class="data-count-icon" :class="item.key" aria-hidden="true">
            <el-icon><component :is="item.icon" /></el-icon>
          </span>
          <div>
            <small>{{ item.label }}</small>
            <strong>{{ formatNumber(snapshot.counts?.[item.key] || 0) }}</strong>
            <span>当前数据库记录</span>
          </div>
        </article>
      </div>

      <div class="data-safety-details">
        <section class="release-protection-card">
          <header>
            <div>
              <p>RELEASE PROTECTION</p>
              <h3>发布保护</h3>
            </div>
            <span class="verified-chip"><i></i>已启用</span>
          </header>
          <ol>
            <li>
              <span>01</span>
              <div><strong>发布前创建完整备份</strong><small>部署开始前自动执行 SQLite 在线备份，并验证备份文件可读取。</small></div>
              <b>已配置</b>
            </li>
            <li>
              <span>02</span>
              <div><strong>发布后执行完整性检查</strong><small>新版本启动后再次执行 quick_check，异常时阻止继续发布。</small></div>
              <b>已配置</b>
            </li>
            <li>
              <span>03</span>
              <div><strong>核心数据量防回退</strong><small>用户、方案、文件夹和任务记录发布前后逐项核对。</small></div>
              <b>已配置</b>
            </li>
          </ol>
        </section>

        <section class="backup-card">
          <header>
            <div><p>BACKUP STORAGE</p><h3>备份存储</h3></div>
          </header>
          <div class="backup-total">
            <strong>{{ formatNumber(snapshot.backup?.count || 0) }}</strong>
            <span>份可用备份</span>
          </div>
          <dl>
            <div><dt>最近备份</dt><dd>{{ snapshot.backup?.latestAt ? formatDate(snapshot.backup.latestAt) : '尚未生成' }}</dd></div>
            <div><dt>备份文件</dt><dd><code :title="snapshot.backup?.latestName">{{ snapshot.backup?.latestName || '—' }}</code></dd></div>
            <div><dt>文件大小</dt><dd>{{ formatBytes(snapshot.backup?.latestByteSize) }}</dd></div>
            <div><dt>存储目录</dt><dd><code :title="snapshot.backup?.directory">{{ snapshot.backup?.directory || '未配置' }}</code></dd></div>
          </dl>
          <p class="backup-note"><i></i>手动备份同样会执行完整性校验，校验失败的文件不会保留。</p>
        </section>
      </div>

      <footer class="data-safety-foot">
        <span>最后检查：{{ snapshot.checkedAt ? formatDate(snapshot.checkedAt) : '未知' }}</span>
        <span><i></i>个人方案数据保存在共享数据库中，不随版本目录替换</span>
      </footer>
    </template>
    <p v-if="errorMessage" class="data-safety-error">{{ errorMessage }}</p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  CircleCheckFilled,
  Collection,
  FolderOpened,
  Lock,
  RefreshRight,
  Tickets,
  User,
  WarningFilled,
} from '@element-plus/icons-vue'
import { request } from '../utils/apiClient.js'

const snapshot = ref(null)
const loading = ref(false)
const backingUp = ref(false)
const errorMessage = ref('')
const countCards = computed(() => [
  { key: 'users', label: '用户', icon: User },
  { key: 'solutions', label: '个人与公共方案', icon: Collection },
  { key: 'folders', label: '方案文件夹', icon: FolderOpened },
  { key: 'tasks', label: '任务记录', icon: Tickets },
])

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0))
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function loadStatus() {
  loading.value = true
  errorMessage.value = ''
  try {
    snapshot.value = await request('/api/admin/data-safety', { cache: 'no-store' })
  } catch (error) {
    errorMessage.value = error.message || '数据保护状态读取失败'
  } finally {
    loading.value = false
  }
}

async function makeBackup() {
  backingUp.value = true
  errorMessage.value = ''
  try {
    await request('/api/admin/data-safety/backup', { method: 'POST' })
    await loadStatus()
  } catch (error) {
    errorMessage.value = error.message || '数据库备份失败'
  } finally {
    backingUp.value = false
  }
}

onMounted(loadStatus)
</script>

<style scoped>
.data-safety-panel { --safety-green: #28a95b; --safety-orange: #ff6b4a; overflow: hidden; color: var(--ui-ink); background: #fff; border: 1px solid var(--ui-divider); border-radius: 17px; }
.data-safety-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 25px 28px 22px; border-bottom: 1px solid var(--ui-divider); }
.data-safety-head p, .release-protection-card header p, .backup-card header p { margin: 0 0 7px; color: var(--safety-orange); font: 700 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .15em; }
.data-safety-head h2 { margin: 0; font-size: 23px; font-weight: 650; letter-spacing: -.04em; }
.data-safety-head > div > span { display: block; max-width: 680px; margin-top: 8px; color: var(--ui-text-secondary); font-size: 11px; line-height: 1.6; }
.data-safety-actions { display: flex; flex: 0 0 auto; gap: 8px; }
.data-safety-actions button { display: inline-flex; height: 34px; align-items: center; gap: 6px; padding: 0 13px; font: inherit; font-size: 10px; font-weight: 650; border-radius: 9px; cursor: pointer; }
.data-safety-actions button.secondary { color: var(--ui-ink); background: #fff; border: 1px solid var(--ui-control-border); }
.data-safety-actions button.primary { color: #fff; background: var(--ui-ink); border: 1px solid var(--ui-ink); }
.data-safety-actions button:disabled { opacity: .48; cursor: not-allowed; }
.data-safety-loading { padding: 48px 28px; color: var(--ui-text-tertiary); font-size: 11px; text-align: center; }
.data-safety-overview { display: grid; grid-template-columns: minmax(480px, 2.65fr) repeat(4, minmax(132px, 1fr)); gap: 12px; padding: 22px 28px; background: #fff; }
.database-card, .data-count-card { min-width: 0; min-height: 142px; box-sizing: border-box; background: #fff; border: 1px solid var(--ui-divider); border-radius: 13px; }
.database-card { display: grid; grid-template-columns: 38px minmax(0, 1fr); align-content: center; align-items: center; gap: 13px; padding: 17px 18px 15px; border-color: color-mix(in srgb, var(--safety-orange) 45%, var(--ui-divider)); }
.database-card.healthy { border-color: color-mix(in srgb, var(--safety-green) 55%, var(--ui-divider)); box-shadow: inset 3px 0 0 var(--safety-green); }
.database-card > .el-icon { width: 34px; height: 34px; color: var(--safety-orange); font-size: 30px; }
.database-card.healthy > .el-icon { color: var(--safety-green); }
.database-card-copy small, .database-card-copy strong, .database-card-copy span { display: block; }
.database-card-copy small { color: var(--ui-text-tertiary); font-size: 9px; }
.database-card-copy strong { margin-top: 5px; color: var(--safety-orange); font-size: 16px; font-weight: 650; }
.database-card.healthy .database-card-copy strong { color: var(--safety-green); }
.database-card-copy span { margin-top: 7px; color: var(--ui-text-secondary); font-size: 9px; }
.database-card dl { display: grid; grid-column: 1 / -1; grid-template-columns: minmax(190px, 1.7fr) minmax(120px, .95fr) 72px; gap: 12px; min-width: 0; margin: 1px 0 0; padding-top: 12px; border-top: 1px solid var(--ui-divider); }
.database-card dl > div { min-width: 0; font-size: 8px; }
.database-card dt { margin-bottom: 5px; color: var(--ui-text-tertiary); }
.database-card dd { min-width: 0; margin: 0; color: var(--ui-text-secondary); line-height: 1.45; }
.database-card code { display: block; overflow: visible; font: 8px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; white-space: normal; }
.backup-card code { display: block; overflow: hidden; font: 8px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.data-count-card { display: grid; grid-template-columns: 38px minmax(0, 1fr); align-content: center; align-items: center; gap: 12px; padding: 18px; }
.data-count-icon { position: relative; display: grid; width: 36px; height: 36px; place-items: center; color: var(--ui-ink); background: #fff; border: 1px solid var(--ui-control-border); border-radius: 10px; }
.data-count-icon::after { position: absolute; top: -2px; right: -2px; width: 6px; height: 6px; content: ""; background: var(--safety-orange); border: 2px solid #fff; border-radius: 50%; }
.data-count-icon .el-icon { font-size: 17px; }
.data-count-card small, .data-count-card strong, .data-count-card div > span { display: block; }
.data-count-card small { color: var(--ui-text-secondary); font-size: 10px; line-height: 1.35; }
.data-count-card strong { margin-top: 8px; font: 650 23px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.data-count-card div > span { margin-top: 8px; color: var(--ui-text-tertiary); font-size: 8px; }
.data-safety-details { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(270px, .8fr); gap: 14px; padding: 0 28px 22px; }
.release-protection-card, .backup-card { overflow: hidden; background: #fff; border: 1px solid var(--ui-divider); border-radius: 13px; }
.release-protection-card > header, .backup-card > header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 15px; border-bottom: 1px solid var(--ui-divider); }
.release-protection-card h3, .backup-card h3 { margin: 0; font-size: 14px; font-weight: 650; }
.verified-chip { display: inline-flex; align-items: center; gap: 6px; color: var(--safety-green); font-size: 9px; }
.verified-chip i, .backup-note i, .data-safety-foot i { width: 6px; height: 6px; background: var(--safety-green); border-radius: 50%; }
.release-protection-card ol { margin: 0; padding: 0; list-style: none; }
.release-protection-card li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 66px; padding: 0 20px; border-top: 1px solid var(--ui-divider); }
.release-protection-card li:first-child { border-top: 0; }
.release-protection-card li > span { color: var(--safety-orange); font: 700 8px/1 ui-monospace, monospace; }
.release-protection-card li strong, .release-protection-card li small { display: block; }
.release-protection-card li strong { font-size: 10px; font-weight: 650; }
.release-protection-card li small { margin-top: 5px; color: var(--ui-text-tertiary); font-size: 8px; line-height: 1.5; }
.release-protection-card li b { color: var(--safety-green); font-size: 8px; font-weight: 550; }
.backup-card { padding-bottom: 16px; }
.backup-total { padding: 18px 20px 15px; }
.backup-total strong { display: block; font: 650 29px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.backup-total span { display: block; margin-top: 7px; color: var(--ui-text-tertiary); font-size: 9px; }
.backup-card dl { margin: 0; padding: 0 20px; }
.backup-card dl > div { display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 8px; padding: 7px 0; border-top: 1px solid var(--ui-divider); font-size: 8px; }
.backup-card dt { color: var(--ui-text-tertiary); }
.backup-card dd { min-width: 0; margin: 0; color: var(--ui-text-secondary); text-align: right; }
.backup-note { display: flex; align-items: flex-start; gap: 7px; margin: 14px 20px 0; padding: 10px; color: var(--ui-text-secondary); font-size: 8px; line-height: 1.5; background: #fff; border: 1px solid var(--ui-divider); border-left-color: var(--safety-orange); border-radius: 8px; }
.backup-note i { flex: 0 0 auto; margin-top: 3px; }
.data-safety-foot { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 28px; color: var(--ui-text-tertiary); font-size: 8px; background: #fff; border-top: 1px solid var(--ui-divider); }
.data-safety-foot span { display: inline-flex; align-items: center; gap: 7px; }
.data-safety-error { margin: 0; padding: 10px 28px; color: #b42318; font-size: 10px; background: #fff1f0; }
@media (max-width: 1200px) { .data-safety-overview { grid-template-columns: repeat(4, 1fr); } .database-card { grid-column: 1 / -1; } }
@media (max-width: 820px) { .data-safety-head { align-items: stretch; flex-direction: column; } .data-safety-actions { align-self: flex-start; } .data-safety-overview { grid-template-columns: repeat(2, 1fr); padding: 18px; } .database-card { grid-template-columns: 38px minmax(0, 1fr); } .database-card dl { grid-template-columns: 1fr 1fr; } .database-card dl > div:first-child { grid-column: 1 / -1; } .data-safety-details { grid-template-columns: 1fr; padding: 0 18px 18px; } .data-safety-foot { align-items: flex-start; flex-direction: column; padding: 12px 18px; } }
@media (max-width: 520px) { .data-safety-actions { width: 100%; } .data-safety-actions button { flex: 1; justify-content: center; } .data-safety-overview { grid-template-columns: 1fr; } .database-card { grid-column: auto; } }
</style>
