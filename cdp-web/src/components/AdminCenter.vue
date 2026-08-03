<template>
  <main class="admin-center">
    <header class="admin-hero">
      <div>
        <p class="admin-eyebrow">SYSTEM / CONTROL ROOM</p>
        <h1>
          {{ canManageAccounts ? '把入口和规则，' : '把字典和规则，' }}
          <em>交给可控的秩序。</em>
        </h1>
        <p class="admin-lede">
          这里管理邀请、登录账号和配置管理员。每次发放都可追踪，每次变化都可撤回。
        </p>
      </div>
      <button class="admin-refresh" type="button" :disabled="loading" @click="loadData">
        <span class="admin-refresh-dot" :class="{ spinning: loading }"></span>
        {{ loading ? '同步中' : '刷新数据' }}
      </button>
    </header>

    <transition name="admin-toast">
      <div v-if="message" class="admin-message" :class="{ error: messageType === 'error' }">
        <span aria-hidden="true">{{ messageType === 'error' ? '!' : '✓' }}</span>
        {{ message }}
      </div>
    </transition>

    <div v-if="canManageAccounts" class="admin-panels">
      <section class="admin-panel invite-panel">
        <div class="admin-panel-head">
          <div>
            <p class="admin-panel-index">01 / INVITATIONS</p>
            <h2>发放邀请</h2>
          </div>
          <span class="admin-panel-count">{{ invites.length }} 条记录</span>
        </div>

        <form class="invite-form" @submit.prevent="createInvite">
          <label>
            <span>授予角色</span>
            <select v-model="inviteForm.role" :disabled="busy">
              <option value="user">普通用户</option>
              <option value="config_admin">配置管理员</option>
              <option value="super_admin">超级管理员</option>
            </select>
          </label>
          <label>
            <span>有效期</span>
            <select v-model.number="inviteForm.expiresDays" :disabled="busy">
              <option :value="1">1 天</option>
              <option :value="7">7 天</option>
              <option :value="14">14 天</option>
              <option :value="30">30 天</option>
            </select>
          </label>
          <button class="admin-primary-button" type="submit" :disabled="busy">
            <span>＋</span>{{ busy ? '生成中…' : '生成一次性邀请' }}
          </button>
        </form>

        <div v-if="createdInvite" class="invite-created">
          <div class="invite-created-head">
            <span class="invite-created-signal"></span>
            <div>
              <strong>邀请已生成，仅显示一次</strong>
              <p>复制下面的链接发给受邀成员；使用后链接会立即失效。</p>
            </div>
          </div>
          <div class="invite-link-row">
            <code>{{ inviteUrl(createdInvite) }}</code>
            <button type="button" @click="copyInvite(createdInvite)">复制链接</button>
          </div>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>角色</th>
                <th>状态</th>
                <th>有效期</th>
                <th>创建时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invite in invites" :key="invite.id">
                <td><span class="role-chip">{{ roleLabel(invite.role) }}</span></td>
                <td>
                  <span class="status-chip" :class="`is-${invite.status}`">
                    <i></i>{{ statusLabel(invite.status) }}
                  </span>
                </td>
                <td>{{ formatDate(invite.expiresAt) }}</td>
                <td>{{ formatDate(invite.createdAt) }}</td>
                <td class="admin-table-action">
                  <button
                    v-if="invite.status === 'active'"
                    type="button"
                    @click="revokeInvite(invite)"
                  >作废</button>
                  <span v-else-if="invite.usedBy" class="muted-action">已注册</span>
                </td>
              </tr>
              <tr v-if="!invites.length">
                <td colspan="5" class="admin-empty">还没有发放过邀请</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-panel users-panel">
        <div class="admin-panel-head">
          <div>
            <p class="admin-panel-index">02 / ACCESS</p>
            <h2>系统账号</h2>
          </div>
          <span class="admin-panel-count">{{ users.length }} 位成员</span>
        </div>
        <p class="admin-panel-note">角色决定可以进入哪些管理区域；停用账号会立即阻断后续请求。</p>

        <div class="account-toolbar">
          <input
            v-model.trim="userQuery"
            type="search"
            placeholder="搜索名称或登录账号"
            aria-label="搜索系统账号"
          />
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table users-table">
            <thead>
              <tr>
                <th>成员</th>
                <th>角色</th>
                <th>状态</th>
                <th>数据</th>
                <th>最近登录</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredUsers" :key="user.id">
                <td>
                  <div class="user-cell">
                    <span class="user-avatar">{{ userInitial(user) }}</span>
                    <span>
                      <strong>{{ user.displayName || user.username }}</strong>
                      <small>{{ user.username }}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <select
                    :value="user.role"
                    :disabled="user.id === currentUserId || busyUserId === user.id"
                    @change="changeRole(user, $event)"
                  >
                    <option value="user">普通用户</option>
                    <option value="config_admin">配置管理员</option>
                    <option value="super_admin">超级管理员</option>
                  </select>
                </td>
                <td>
                  <button
                    class="user-status-toggle"
                    :class="{ enabled: user.enabled }"
                    type="button"
                    :disabled="user.id === currentUserId || busyUserId === user.id"
                    @click="toggleUser(user)"
                  >
                    <span></span>{{ user.enabled ? '启用中' : '已停用' }}
                  </button>
                </td>
                <td>
                  <span class="account-data-count">
                    {{ user.dataCounts?.solutions || 0 }} 方案 · {{ user.dataCounts?.tasks || 0 }} 任务
                  </span>
                </td>
                <td class="last-login">{{ formatDate(user.lastLoginAt) || '尚未登录' }}</td>
                <td class="admin-table-action">
                  <button type="button" @click="openUserManager(user)">管理</button>
                </td>
              </tr>
              <tr v-if="!filteredUsers.length">
                <td colspan="6" class="admin-empty">
                  {{ users.length ? '没有匹配的系统账号' : '还没有系统账号' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-panel audit-panel">
        <div class="admin-panel-head">
          <div>
            <p class="admin-panel-index">03 / AUDIT TRAIL</p>
            <h2>管理员操作记录</h2>
          </div>
          <span class="admin-panel-count">最近 {{ auditLogs.length }} 条</span>
        </div>
        <p class="admin-panel-note">账号修改、密码重置、强制退出和数据审计都会留下记录。</p>

        <div class="admin-table-wrap audit-table-wrap">
          <table class="admin-table audit-table">
            <thead>
              <tr>
                <th>操作</th>
                <th>操作者</th>
                <th>目标</th>
                <th>时间</th>
                <th v-if="canDeleteAuditLogs"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in auditLogs" :key="entry.id">
                <td><span class="audit-action">{{ auditActionLabel(entry.action) }}</span></td>
                <td>{{ entry.actorDisplayName || entry.actorUsername || '未知账号' }}</td>
                <td>{{ entry.targetDisplayName || entry.targetUsername || '系统' }}</td>
                <td class="last-login">{{ formatDate(entry.createdAt) }}</td>
                <td v-if="canDeleteAuditLogs" class="admin-table-action">
                  <button type="button" class="audit-delete-button" @click="deleteAuditLog(entry)">
                    删除
                  </button>
                </td>
              </tr>
              <tr v-if="!auditLogs.length">
                <td :colspan="canDeleteAuditLogs ? 5 : 4" class="admin-empty">还没有管理员操作记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="managedUser"
        class="account-dialog-backdrop"
        role="presentation"
        @click.self="closeUserManager"
      >
        <section
          class="account-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-dialog-title"
        >
          <header class="account-dialog-head">
            <div class="account-dialog-identity">
              <span class="user-avatar account-dialog-avatar">{{ userInitial(managedUser) }}</span>
              <span>
                <p class="admin-panel-index">ACCOUNT / {{ managedUser.id.slice(-8).toUpperCase() }}</p>
                <h2 id="account-dialog-title">{{ managedUser.displayName || managedUser.username }}</h2>
                <small>{{ managedUser.username }}</small>
              </span>
            </div>
            <button class="account-dialog-close" type="button" aria-label="关闭账号管理" @click="closeUserManager">×</button>
          </header>

          <div class="account-dialog-scroll">
            <section class="account-dialog-section">
              <div class="account-section-head">
                <div>
                  <span>01</span>
                  <h3>账号资料</h3>
                </div>
                <small>登录账号和显示名称均可修改</small>
              </div>

              <form class="account-profile-form" @submit.prevent="saveManagedUser">
                <label>
                  <span>显示名称</span>
                  <input v-model.trim="accountForm.displayName" maxlength="80" required />
                </label>
                <label>
                  <span>登录账号</span>
                  <input v-model.trim="accountForm.username" maxlength="80" required autocomplete="off" />
                </label>
                <label>
                  <span>角色</span>
                  <select
                    v-model="accountForm.role"
                    :disabled="managedUser.id === currentUserId"
                  >
                    <option value="user">普通用户</option>
                    <option value="config_admin">配置管理员</option>
                    <option value="super_admin">超级管理员</option>
                  </select>
                </label>
                <label>
                  <span>账号状态</span>
                  <select
                    v-model="accountForm.enabled"
                    :disabled="managedUser.id === currentUserId"
                  >
                    <option :value="true">启用</option>
                    <option :value="false">停用</option>
                  </select>
                </label>
                <button class="admin-primary-button account-save" type="submit" :disabled="busyUserId === managedUser.id">
                  保存账号资料
                </button>
              </form>

              <div class="account-meta-grid">
                <span><small>创建时间</small><strong>{{ formatDate(managedUser.createdAt) }}</strong></span>
                <span><small>最近登录</small><strong>{{ formatDate(managedUser.lastLoginAt) || '尚未登录' }}</strong></span>
                <span><small>密码更新</small><strong>{{ formatDate(managedUser.passwordChangedAt) || '历史密码' }}</strong></span>
              </div>
            </section>

            <section class="account-dialog-section">
              <div class="account-section-head">
                <div>
                  <span>02</span>
                  <h3>登录安全</h3>
                </div>
                <small>密码只可重置，原密码永不展示</small>
              </div>

              <div class="account-security-grid">
                <label>
                  <span>设置新密码</span>
                  <input
                    v-model="accountForm.password"
                    type="password"
                    minlength="8"
                    autocomplete="new-password"
                    placeholder="至少 8 位"
                  />
                </label>
                <button
                  class="account-secondary-button"
                  type="button"
                  :disabled="securityBusy || accountForm.password.length < 8"
                  @click="resetManagedPassword(false)"
                >重置为输入密码</button>
                <button
                  class="account-secondary-button"
                  type="button"
                  :disabled="securityBusy"
                  @click="resetManagedPassword(true)"
                >生成临时密码</button>
                <button
                  class="account-danger-button"
                  type="button"
                  :disabled="securityBusy || managedUser.id === currentUserId"
                  @click="revokeManagedSessions"
                >强制退出全部登录</button>
              </div>

              <div v-if="temporaryPassword" class="temporary-password">
                <div>
                  <strong>临时密码仅显示一次</strong>
                  <code>{{ temporaryPassword }}</code>
                </div>
                <button type="button" @click="copyTemporaryPassword">复制</button>
              </div>
            </section>

            <section class="account-dialog-section">
              <div class="account-section-head">
                <div>
                  <span>03</span>
                  <h3>用户数据审计</h3>
                </div>
                <small>只读查看，不会混入管理员自己的数据</small>
              </div>

              <div v-if="accountDataLoading" class="account-data-loading">正在读取该账号的数据索引…</div>
              <template v-else-if="managedUserData">
                <div class="account-stat-grid">
                  <span><strong>{{ managedUserData.counts?.solutions || 0 }}</strong><small>私人方案</small></span>
                  <span><strong>{{ managedUserData.counts?.folders || 0 }}</strong><small>私人文件夹</small></span>
                  <span><strong>{{ managedUserData.counts?.tasks || 0 }}</strong><small>任务记录</small></span>
                </div>

                <div class="account-data-groups">
                  <details>
                    <summary>方案列表 <span>{{ managedUserData.solutions?.length || 0 }}</span></summary>
                    <ul>
                      <li v-for="solution in managedUserData.solutions" :key="solution.id">
                        <strong>{{ solution.name || '未命名方案' }}</strong>
                        <small>{{ solution.status === 'published' ? '已发布' : '草稿' }} · {{ formatDate(solution.updatedAt) }}</small>
                      </li>
                      <li v-if="!managedUserData.solutions?.length" class="account-data-empty">没有私人方案</li>
                    </ul>
                  </details>
                  <details>
                    <summary>文件夹列表 <span>{{ flattenedManagedFolders.length }}</span></summary>
                    <ul>
                      <li v-for="folder in flattenedManagedFolders" :key="folder.id">
                        <strong>{{ folder.path }}</strong>
                        <small>{{ formatDate(folder.updatedAt) }}</small>
                      </li>
                      <li v-if="!flattenedManagedFolders.length" class="account-data-empty">没有私人文件夹</li>
                    </ul>
                  </details>
                  <details>
                    <summary>任务记录 <span>{{ managedUserData.tasks?.length || 0 }}</span></summary>
                    <ul>
                      <li v-for="task in managedUserData.tasks" :key="task.id">
                        <strong>{{ task.name || '未命名任务' }}</strong>
                        <small>{{ task.status }} · {{ formatDate(task.updatedAt) }}</small>
                      </li>
                      <li v-if="!managedUserData.tasks?.length" class="account-data-empty">没有任务记录</li>
                    </ul>
                  </details>
                </div>
              </template>
            </section>
          </div>
        </section>
      </div>
    </Teleport>

    <section class="admin-panel dimension-panel">
      <div class="admin-panel-head dimension-head">
        <div>
          <p class="admin-panel-index">04 / DICTIONARIES</p>
          <h2>维表配置</h2>
        </div>
        <span class="admin-panel-count">{{ dimensions.length }} 类维表</span>
      </div>

      <div class="config-release">
        <div class="config-release-status">
          <span class="config-version">V{{ configStatus.currentVersion || 0 }}</span>
          <span class="config-release-copy">
            <strong>{{ configStatus.pendingChanges || 0 }} 项待发布</strong>
            <small>保存只进入草稿，发布后工作台会自动同步新配置。</small>
          </span>
        </div>
        <div class="config-release-actions">
          <label class="config-note-field">
            <input
              v-model.trim="publishNote"
              aria-label="发布说明"
              placeholder="选填，用于记录本次变更"
            />
          </label>
          <div class="config-release-buttons">
            <button
              class="config-discard"
              type="button"
              :disabled="!configStatus.pendingChanges || publishing"
              @click="discardConfig"
            >放弃草稿</button>
            <button
              class="admin-primary-button"
              type="button"
              :disabled="!configStatus.pendingChanges || publishing"
              @click="publishConfig"
            >
              {{ publishing ? '发布中…' : '发布配置' }}
            </button>
          </div>
        </div>
      </div>

      <div class="dimension-layout">
        <aside class="dimension-sidebar" aria-label="维表类型">
          <button
            v-for="item in dimensions"
            :key="item.file"
            class="dimension-type"
            :class="{ active: item.file === selectedDimensionFile }"
            type="button"
            @click="selectDimension(item.file)"
          >
            <span>
              <strong>{{ dimensionDisplayName(item.file) }}</strong>
              <small>{{ item.active.toLocaleString() }} 条启用</small>
            </span>
            <i aria-hidden="true">↗</i>
          </button>
          <p v-if="!dimensions.length" class="dimension-loading">正在读取维表…</p>
        </aside>

        <div class="dimension-content">
          <div class="dimension-toolbar">
            <div>
              <p class="dimension-file">{{ selectedDimensionFile || '选择维表' }}</p>
              <p class="dimension-description">
                支持筛选、编辑、停用与删除；删除会先进入待发布，发布后从工作台选项中移除。
              </p>
            </div>
            <button class="admin-primary-button dimension-add" type="button" @click="openCreateRow">
              <span>＋</span>新增记录
            </button>
          </div>

          <div class="dimension-filters">
            <input
              v-model.trim="dimensionQuery"
              type="search"
              placeholder="搜索名称、ID 或包名…"
              @keyup.enter="applyDimensionFilters"
            />
            <select v-model="dimensionPackage" @change="applyDimensionFilters">
              <option value="">全部适用包</option>
              <option v-for="name in dimensionPackages" :key="name" :value="name">{{ name }}</option>
            </select>
            <button type="button" @click="applyDimensionFilters">查询</button>
          </div>

          <div v-if="dimensionEditorOpen" class="dimension-editor">
            <div class="dimension-editor-head">
              <strong>{{ editingRow ? '编辑维表记录' : '新增维表记录' }}</strong>
              <button type="button" @click="closeDimensionEditor">关闭</button>
            </div>
            <div class="dimension-fields">
              <label v-for="column in dimensionColumns" :key="column">
                <span>{{ column }}</span>
                <input v-model="dimensionFormData[column]" :placeholder="column" />
              </label>
            </div>
            <div class="dimension-editor-actions">
              <button type="button" @click="closeDimensionEditor">取消</button>
              <button class="admin-primary-button" type="button" :disabled="dimensionSaving" @click="saveDimensionRow">
                {{ dimensionSaving ? '保存中…' : '保存记录' }}
              </button>
            </div>
          </div>

          <div class="admin-table-wrap dimension-table-wrap">
            <table class="admin-table dimension-table">
              <thead>
                <tr>
                  <th
                    v-for="(column, index) in dimensionColumns"
                    :key="column"
                    scope="col"
                    :class="{ 'dimension-key-header': column === '适用的包' }"
                  >
                    <span class="dimension-header-cell">
                      <span class="dimension-header-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                      <span class="dimension-header-label">{{ column }}</span>
                    </span>
                  </th>
                  <th scope="col" class="dimension-status-header">
                    <span class="dimension-header-cell">
                      <span class="dimension-header-index" aria-hidden="true">{{ String(dimensionColumns.length + 1).padStart(2, '0') }}</span>
                      <span class="dimension-header-label">状态</span>
                    </span>
                  </th>
                  <th scope="col" class="dimension-action-header">
                    <span class="dimension-header-cell">
                      <span class="dimension-header-index" aria-hidden="true">{{ String(dimensionColumns.length + 2).padStart(2, '0') }}</span>
                      <span class="dimension-header-label">操作</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in dimensionRows" :key="row.id" :class="{ 'dimension-row-deleted': row.deleted }">
                  <td v-for="column in dimensionColumns" :key="column">
                    <span class="dimension-cell" :title="row.data[column]">{{ row.data[column] || '—' }}</span>
                  </td>
                  <td>
                    <span v-if="row.deleted" class="draft-chip dimension-delete-chip">待删除</span>
                    <span v-else-if="row.hasChanges" class="draft-chip">待发布</span>
                    <button
                      v-if="!row.deleted"
                      class="user-status-toggle"
                      :class="{ enabled: row.enabled }"
                      type="button"
                      @click="toggleDimensionRow(row)"
                    >
                      <span></span>{{ row.enabled ? '启用中' : '已停用' }}
                    </button>
                    <span v-else class="dimension-delete-status">发布后移除</span>
                  </td>
                  <td class="admin-table-action">
                    <button type="button" :disabled="row.deleted" @click="openEditRow(row)">编辑</button>
                    <button
                      v-if="canDeleteDimensions && !row.deleted"
                      class="dimension-delete-button"
                      type="button"
                      @click="deleteDimensionRow(row)"
                    >
                      删除
                    </button>
                  </td>
                </tr>
                <tr v-if="!dimensionRows.length">
                  <td :colspan="dimensionColumns.length + 2" class="admin-empty">
                    {{ dimensionLoading ? '正在加载…' : '没有匹配的维表记录' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="dimension-pagination">
            <div class="dimension-pagination-summary">
              <span>共 {{ dimensionTotal.toLocaleString() }} 条</span>
              <label>
                <span>每页</span>
                <select v-model.number="dimensionPageSize" @change="changeDimensionPageSize">
                  <option v-for="size in DIMENSION_PAGE_SIZES" :key="size" :value="size">
                    {{ size }} 条
                  </option>
                </select>
              </label>
              <span>共 {{ dimensionTotalPages }} 页</span>
            </div>
            <div class="dimension-pagination-nav">
              <button type="button" :disabled="dimensionPage <= 1" @click="changeDimensionPage(-1)">上一页</button>
              <span>第 {{ dimensionTotalPages ? dimensionPage : 0 }} / {{ dimensionTotalPages }} 页</span>
              <button type="button" :disabled="dimensionPage >= dimensionTotalPages" @click="changeDimensionPage(1)">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { request } from '../utils/apiClient.js'
import { adoptConfigVersion } from '../utils/configVersion.js'

const props = defineProps({
  currentUserId: {
    type: String,
    default: '',
  },
  currentUserRole: {
    type: String,
    default: 'user',
  },
})
const emit = defineEmits(['current-user-updated'])

const ROLE_LABELS = {
  super_admin: '超级管理员',
  config_admin: '配置管理员',
  user: '普通用户',
}
const DIMENSION_PAGE_SIZES = [20, 30, 50, 100]

const STATUS_LABELS = {
  active: '可使用',
  used: '已使用',
  expired: '已过期',
  revoked: '已作废',
}

const users = ref([])
const invites = ref([])
const auditLogs = ref([])
const dimensions = ref([])
const configStatus = ref({ currentVersion: 0, pendingChanges: 0 })
const publishNote = ref('')
const publishing = ref(false)
const selectedDimensionFile = ref('')
const dimensionRows = ref([])
const dimensionColumns = ref([])
const dimensionPackages = ref([])
const dimensionQuery = ref('')
const dimensionPackage = ref('')
const dimensionPage = ref(1)
const dimensionPageSize = ref(30)
const dimensionTotal = ref(0)
const dimensionLoading = ref(false)
const dimensionEditorOpen = ref(false)
const editingRow = ref(null)
const dimensionFormData = reactive({})
const dimensionSaving = ref(false)
const loading = ref(false)
const busy = ref(false)
const busyUserId = ref('')
const userQuery = ref('')
const managedUser = ref(null)
const managedUserData = ref(null)
const accountDataLoading = ref(false)
const securityBusy = ref(false)
const temporaryPassword = ref('')
const dimensionTotalPages = computed(() => (
  dimensionTotal.value > 0
    ? Math.ceil(dimensionTotal.value / dimensionPageSize.value)
    : 0
))
const accountForm = reactive({
  username: '',
  displayName: '',
  role: 'user',
  enabled: true,
  password: '',
})
const message = ref('')
const messageType = ref('success')
const createdInvite = ref(null)
const inviteForm = reactive({ role: 'user', expiresDays: 7 })

let messageTimer = null

const canManageAccounts = computed(() => props.currentUserRole === 'super_admin')
const canDeleteDimensions = computed(() => props.currentUserRole === 'super_admin')
const canDeleteAuditLogs = computed(() => props.currentUserRole === 'super_admin')
const filteredUsers = computed(() => {
  const query = userQuery.value.toLowerCase()
  if (!query) return users.value
  return users.value.filter((user) =>
    [user.username, user.displayName, roleLabel(user.role)]
      .some((value) => String(value || '').toLowerCase().includes(query)),
  )
})
const flattenedManagedFolders = computed(() => flattenFolders(managedUserData.value?.folders || []))

function showMessage(text, type = 'success') {
  message.value = text
  messageType.value = type
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = ''
  }, 3600)
}

function roleLabel(role) {
  return ROLE_LABELS[role] || '普通用户'
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

function auditActionLabel(action) {
  return {
    USER_UPDATED: '修改账号',
    USER_PASSWORD_RESET: '重置密码',
    USER_SESSIONS_REVOKED: '强制退出',
    USER_DATA_VIEWED: '查看用户数据',
    INVITE_CREATED: '创建邀请',
    INVITE_REVOKED: '撤销邀请',
    AUDIT_LOG_DELETED: '删除操作记录',
  }[action] || action
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

function userInitial(user) {
  return String(user.displayName || user.username || 'U').trim().slice(0, 1).toUpperCase()
}

function inviteUrl(invite) {
  return new URL(invite.registerPath, window.location.origin).toString()
}

function flattenFolders(folders, parentPath = '') {
  return folders.flatMap((folder) => {
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name
    return [
      { ...folder, path },
      ...flattenFolders(folder.children || [], path),
    ]
  })
}

async function loadData() {
  loading.value = true
  try {
    const [dimensionList, nextConfigStatus] = await Promise.all([
      request('/api/admin/dimensions', { cache: 'no-store' }),
      request('/api/admin/config/status', { cache: 'no-store' }),
    ])
    dimensions.value = dimensionList || []
    configStatus.value = nextConfigStatus || { currentVersion: 0, pendingChanges: 0 }
    if (!selectedDimensionFile.value || !dimensions.value.some((item) => item.file === selectedDimensionFile.value)) {
      selectedDimensionFile.value = dimensions.value[0]?.file || ''
    }
    await loadDimensionRows()
    if (canManageAccounts.value) {
      const [nextUsers, nextInvites, nextAuditLogs] = await Promise.all([
        request('/api/admin/users', { cache: 'no-store' }),
        request('/api/admin/invites', { cache: 'no-store' }),
        request('/api/admin/audit-logs', {
          params: { limit: 60 },
          cache: 'no-store',
        }),
      ])
      users.value = nextUsers || []
      invites.value = nextInvites || []
      auditLogs.value = nextAuditLogs || []
    }
  } catch (error) {
    showMessage(error.message || '管理数据加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function refreshConfigSummary() {
  const [dimensionList, nextConfigStatus] = await Promise.all([
    request('/api/admin/dimensions', { cache: 'no-store' }),
    request('/api/admin/config/status', { cache: 'no-store' }),
  ])
  dimensions.value = dimensionList || []
  configStatus.value = nextConfigStatus || { currentVersion: 0, pendingChanges: 0 }
}

function dimensionDisplayName(file) {
  return String(file || '').replace('维表.csv', '')
}

async function loadDimensionRows() {
  if (!selectedDimensionFile.value) return
  dimensionLoading.value = true
  try {
    const result = await request(`/api/admin/dimensions/${encodeURIComponent(selectedDimensionFile.value)}`, {
      params: {
        page: dimensionPage.value,
        pageSize: dimensionPageSize.value,
        q: dimensionQuery.value,
        package: dimensionPackage.value,
      },
      cache: 'no-store',
    })
    dimensionRows.value = result.rows || []
    dimensionColumns.value = result.columns || []
    dimensionPackages.value = result.packages || []
    dimensionTotal.value = result.total || 0
  } catch (error) {
    showMessage(error.message || '维表加载失败', 'error')
  } finally {
    dimensionLoading.value = false
  }
}

function selectDimension(file) {
  selectedDimensionFile.value = file
  dimensionPage.value = 1
  dimensionQuery.value = ''
  dimensionPackage.value = ''
  closeDimensionEditor()
  loadDimensionRows()
}

function changeDimensionPage(delta) {
  const maxPage = Math.max(1, dimensionTotalPages.value)
  dimensionPage.value = Math.min(maxPage, Math.max(1, dimensionPage.value + delta))
  loadDimensionRows()
}

function changeDimensionPageSize() {
  dimensionPage.value = 1
  loadDimensionRows()
}

function applyDimensionFilters() {
  dimensionPage.value = 1
  loadDimensionRows()
}

function openCreateRow() {
  editingRow.value = null
  Object.keys(dimensionFormData).forEach((key) => delete dimensionFormData[key])
  dimensionColumns.value.forEach((column) => {
    dimensionFormData[column] = ''
  })
  dimensionEditorOpen.value = true
}

function openEditRow(row) {
  if (!row || row.deleted) return
  editingRow.value = row
  Object.keys(dimensionFormData).forEach((key) => delete dimensionFormData[key])
  dimensionColumns.value.forEach((column) => {
    dimensionFormData[column] = row.data?.[column] || ''
  })
  dimensionEditorOpen.value = true
}

function closeDimensionEditor() {
  dimensionEditorOpen.value = false
  editingRow.value = null
}

async function saveDimensionRow() {
  dimensionSaving.value = true
  try {
    const path = editingRow.value
      ? `/api/admin/dimensions/${encodeURIComponent(selectedDimensionFile.value)}/${editingRow.value.id}`
      : `/api/admin/dimensions/${encodeURIComponent(selectedDimensionFile.value)}`
    const saved = await request(path, {
      method: editingRow.value ? 'PUT' : 'POST',
      body: JSON.stringify({ data: { ...dimensionFormData } }),
    })
    showMessage(editingRow.value ? '维表记录已更新' : '维表记录已新增')
    closeDimensionEditor()
    await Promise.all([loadDimensionRows(), refreshConfigSummary()])
    if (!editingRow.value && saved?.id) {
      dimensionPage.value = 1
    }
  } catch (error) {
    showMessage(error.message || '维表记录保存失败', 'error')
  } finally {
    dimensionSaving.value = false
  }
}

async function toggleDimensionRow(row) {
  if (!row || row.deleted) return
  try {
    const updated = await request(
      `/api/admin/dimensions/${encodeURIComponent(selectedDimensionFile.value)}/${row.id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !row.enabled }),
      },
    )
    dimensionRows.value = dimensionRows.value.map((item) => item.id === updated.id ? updated : item)
    await refreshConfigSummary()
    showMessage(updated.enabled ? '已加入启用草稿' : '已加入停用草稿')
  } catch (error) {
    showMessage(error.message || '维表状态更新失败', 'error')
  }
}

async function deleteDimensionRow(row) {
  if (!canDeleteDimensions.value || !row || row.deleted) return
  const name = row.data?.[dimensionColumns.value.find((column) => column !== 'id')] || row.id
  if (!window.confirm(`确定删除维表记录“${name}”吗？删除会先进入待发布，发布后从工作台移除。`)) return
  try {
    const deleted = await request(
      `/api/admin/dimensions/${encodeURIComponent(selectedDimensionFile.value)}/${row.id}`,
      { method: 'DELETE' },
    )
    if (deleted?.removed) {
      dimensionRows.value = dimensionRows.value.filter((item) => item.id !== row.id)
    } else {
      dimensionRows.value = dimensionRows.value.map((item) => item.id === deleted.id ? deleted : item)
    }
    await refreshConfigSummary()
    showMessage(deleted?.removed ? '未发布记录已删除' : '已加入删除草稿')
  } catch (error) {
    showMessage(error.message || '维表记录删除失败', 'error')
  }
}

async function publishConfig() {
  if (!configStatus.value.pendingChanges) return
  publishing.value = true
  try {
    const version = await request('/api/admin/config/publish', {
      method: 'POST',
      body: JSON.stringify({ note: publishNote.value }),
    })
    adoptConfigVersion(version, { notify: true })
    publishNote.value = ''
    await Promise.all([loadDimensionRows(), refreshConfigSummary()])
    showMessage(`配置 V${version.version} 已发布并同步，共 ${version.changeCount} 项修改`)
  } catch (error) {
    showMessage(error.message || '配置发布失败', 'error')
  } finally {
    publishing.value = false
  }
}

async function discardConfig() {
  if (!configStatus.value.pendingChanges) return
  if (!window.confirm('确定放弃全部待发布维表修改吗？')) return
  publishing.value = true
  try {
    const result = await request('/api/admin/config/discard', { method: 'POST' })
    closeDimensionEditor()
    await Promise.all([loadDimensionRows(), refreshConfigSummary()])
    showMessage(`已放弃 ${result.discarded} 项草稿修改`)
  } catch (error) {
    showMessage(error.message || '放弃草稿失败', 'error')
  } finally {
    publishing.value = false
  }
}

async function createInvite() {
  busy.value = true
  try {
    const invite = await request('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({
        role: inviteForm.role,
        expiresDays: inviteForm.expiresDays,
      }),
    })
    createdInvite.value = invite
    invites.value = [invite, ...invites.value]
    showMessage('一次性邀请已生成')
  } catch (error) {
    showMessage(error.message || '邀请码生成失败', 'error')
  } finally {
    busy.value = false
  }
}

async function copyInvite(invite) {
  try {
    await navigator.clipboard.writeText(inviteUrl(invite))
    showMessage('邀请链接已复制')
  } catch {
    showMessage('复制失败，请手动复制链接', 'error')
  }
}

async function revokeInvite(invite) {
  if (!window.confirm('作废后这个邀请链接将无法注册，确定继续吗？')) return
  busy.value = true
  try {
    const updated = await request(`/api/admin/invites/${invite.id}/revoke`, {
      method: 'POST',
    })
    invites.value = invites.value.map((item) => item.id === updated.id ? updated : item)
    if (createdInvite.value?.id === updated.id) createdInvite.value = null
    showMessage('邀请链接已作废')
  } catch (error) {
    showMessage(error.message || '邀请作废失败', 'error')
  } finally {
    busy.value = false
  }
}

async function updateUser(user, payload) {
  busyUserId.value = user.id
  try {
    const updated = await request(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    users.value = users.value.map((item) => item.id === updated.id ? updated : item)
    if (updated.id === props.currentUserId) emit('current-user-updated', updated)
    if (managedUser.value?.id === updated.id) managedUser.value = updated
    showMessage('账号设置已更新')
    return updated
  } catch (error) {
    showMessage(error.message || '账号设置更新失败', 'error')
    return null
  } finally {
    busyUserId.value = ''
  }
}

function toggleUser(user) {
  return updateUser(user, { enabled: !user.enabled, role: user.role })
}

function changeRole(user, event) {
  return updateUser(user, { enabled: user.enabled, role: event.target.value })
}

async function loadAuditLogs() {
  if (!canManageAccounts.value) return
  try {
    auditLogs.value = await request('/api/admin/audit-logs', {
      params: { limit: 60 },
      cache: 'no-store',
    })
  } catch (error) {
    showMessage(error.message || '操作记录加载失败', 'error')
  }
}

async function deleteAuditLog(entry) {
  if (!canDeleteAuditLogs.value || !entry?.id) return
  const actionLabel = auditActionLabel(entry.action)
  const targetLabel = entry.targetDisplayName || entry.targetUsername || '系统'
  if (!window.confirm(`确定删除“${actionLabel} · ${targetLabel}”这条操作记录吗？删除后不可恢复。`)) return
  try {
    await request(`/api/admin/audit-logs/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
    })
    await loadAuditLogs()
    showMessage('操作记录已删除')
  } catch (error) {
    showMessage(error.message || '操作记录删除失败', 'error')
  }
}

async function openUserManager(user) {
  managedUser.value = { ...user }
  accountForm.username = user.username
  accountForm.displayName = user.displayName || user.username
  accountForm.role = user.role
  accountForm.enabled = user.enabled
  accountForm.password = ''
  temporaryPassword.value = ''
  managedUserData.value = null
  accountDataLoading.value = true
  try {
    managedUserData.value = await request(`/api/admin/users/${user.id}/data`, {
      cache: 'no-store',
    })
    await loadAuditLogs()
  } catch (error) {
    showMessage(error.message || '用户数据审计加载失败', 'error')
  } finally {
    accountDataLoading.value = false
  }
}

function closeUserManager() {
  managedUser.value = null
  managedUserData.value = null
  accountForm.password = ''
  temporaryPassword.value = ''
}

async function saveManagedUser() {
  if (!managedUser.value) return
  const updated = await updateUser(managedUser.value, {
    username: accountForm.username,
    displayName: accountForm.displayName,
    role: accountForm.role,
    enabled: accountForm.enabled,
  })
  if (!updated) return
  accountForm.username = updated.username
  accountForm.displayName = updated.displayName
  accountForm.role = updated.role
  accountForm.enabled = updated.enabled
  await loadAuditLogs()
}

async function resetManagedPassword(generate) {
  if (!managedUser.value) return
  const actionCopy = generate ? '生成新的临时密码' : '重置为输入的新密码'
  if (!window.confirm(`${actionCopy}后，该账号当前所有登录都会失效。确定继续吗？`)) return
  securityBusy.value = true
  try {
    const result = await request(`/api/admin/users/${managedUser.value.id}/password`, {
      method: 'POST',
      body: JSON.stringify({
        generate,
        password: generate ? undefined : accountForm.password,
      }),
    })
    const counts = managedUser.value.dataCounts
    managedUser.value = { ...result.user, dataCounts: counts }
    users.value = users.value.map((item) =>
      item.id === result.user.id ? { ...result.user, dataCounts: item.dataCounts } : item
    )
    accountForm.password = ''
    temporaryPassword.value = result.temporaryPassword || ''
    showMessage(generate ? '临时密码已生成，请立即复制' : '密码已重置，旧登录已失效')
    if (managedUser.value.id !== props.currentUserId) await loadAuditLogs()
  } catch (error) {
    showMessage(error.message || '密码重置失败', 'error')
  } finally {
    securityBusy.value = false
  }
}

async function revokeManagedSessions() {
  if (!managedUser.value) return
  if (!window.confirm('确定强制退出该账号的全部登录吗？')) return
  securityBusy.value = true
  try {
    const updated = await request(`/api/admin/users/${managedUser.value.id}/sessions/revoke`, {
      method: 'POST',
    })
    managedUser.value = { ...updated, dataCounts: managedUser.value.dataCounts }
    users.value = users.value.map((item) =>
      item.id === updated.id ? { ...updated, dataCounts: item.dataCounts } : item
    )
    await loadAuditLogs()
    showMessage('该账号的全部登录已失效')
  } catch (error) {
    showMessage(error.message || '强制退出失败', 'error')
  } finally {
    securityBusy.value = false
  }
}

async function copyTemporaryPassword() {
  try {
    await navigator.clipboard.writeText(temporaryPassword.value)
    showMessage('临时密码已复制')
  } catch {
    showMessage('复制失败，请手动复制', 'error')
  }
}

onMounted(loadData)
</script>

<style scoped>
.admin-center {
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-color: var(--ui-text-tertiary) transparent;
  scrollbar-width: thin;
  padding: clamp(28px, 4vw, 62px) clamp(20px, 5vw, 80px) 80px;
  color: var(--ui-ink);
  background: var(--ui-canvas);
}

.admin-center::-webkit-scrollbar {
  width: 10px;
}

.admin-center::-webkit-scrollbar-track {
  background: transparent;
}

.admin-center::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-tertiary) 58%, transparent);
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.admin-center::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-secondary) 78%, transparent);
  border: 3px solid transparent;
  background-clip: padding-box;
}

.admin-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  max-width: 1380px;
  margin: 0 auto 34px;
}

.admin-eyebrow,
.admin-panel-index {
  margin: 0 0 14px;
  color: var(--ui-accent);
  font: 700 10px/1.2 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.16em;
}

.admin-hero h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 58px);
  font-weight: 430;
  line-height: 1.08;
  letter-spacing: -0.06em;
}

.admin-hero h1 em {
  color: var(--ui-text-secondary);
  font-family: "STSong", "Songti SC", serif;
  font-style: normal;
  font-weight: 400;
}

.admin-lede {
  max-width: 590px;
  margin: 18px 0 0;
  color: var(--ui-text-secondary);
  font-size: 13px;
  line-height: 1.75;
}

.admin-refresh {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  flex: 0 0 auto;
  padding: 9px 13px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 12px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 999px;
  cursor: pointer;
}

.admin-refresh:hover { color: var(--ui-ink); border-color: var(--ui-ink); }
.admin-refresh:disabled { cursor: wait; opacity: 0.55; }

.admin-refresh-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-success);
}

.admin-refresh-dot.spinning {
  background: var(--ui-accent);
  animation: admin-pulse 720ms ease-in-out infinite alternate;
}

.admin-message {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 1380px;
  margin: 0 auto 18px;
  padding: 10px 13px;
  color: var(--ui-success);
  font-size: 12px;
  background: color-mix(in srgb, var(--ui-success) 8%, var(--ui-fill));
  border: 1px solid color-mix(in srgb, var(--ui-success) 24%, transparent);
  border-radius: var(--ui-radius-control);
}

.admin-message.error { color: var(--ui-danger); background: color-mix(in srgb, var(--ui-danger) 7%, var(--ui-fill)); }
.admin-message > span { font: 700 11px/1 "SF Mono", monospace; }

.admin-panels {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 18px;
  max-width: 1380px;
  margin: 0 auto;
}

.admin-panel {
  min-width: 0;
  padding: clamp(18px, 2.3vw, 30px);
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 18px;
}

.admin-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 24px;
}

.admin-panel-index { margin-bottom: 9px; }
.admin-panel h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.04em;
}

.admin-panel-count {
  padding: 5px 8px;
  color: var(--ui-text-tertiary);
  font: 10px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  border: 1px solid var(--ui-divider);
  border-radius: 999px;
}

.invite-form {
  display: grid;
  grid-template-columns: 1fr 0.78fr auto;
  align-items: end;
  gap: 10px;
  margin-bottom: 19px;
}

.invite-form label > span {
  display: block;
  margin-bottom: 7px;
  color: var(--ui-text-secondary);
  font-size: 11px;
}

.invite-form select,
.users-table select {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 12px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: var(--ui-radius-control);
  outline: none;
}

.invite-form select:focus,
.users-table select:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.admin-primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 152px;
  height: 38px;
  padding: 0 13px;
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
  background: var(--ui-ink);
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}

.admin-primary-button:hover:not(:disabled) { background: #2c2c2e; }
.admin-primary-button:disabled { cursor: wait; opacity: 0.55; }
.admin-primary-button > span { color: var(--ui-accent); font-size: 16px; }

.invite-created {
  margin: 0 0 21px;
  padding: 14px;
  background: color-mix(in srgb, var(--ui-accent) 7%, var(--ui-fill));
  border: 1px solid color-mix(in srgb, var(--ui-accent) 25%, transparent);
  border-radius: 12px;
}

.invite-created-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.invite-created-signal {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--ui-accent);
}

.invite-created-head strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.invite-created-head p {
  margin: 4px 0 0;
  color: var(--ui-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.invite-link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.invite-link-row code {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  padding: 9px 10px;
  color: var(--ui-text-secondary);
  font: 10px/1.3 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: 7px;
}

.invite-link-row button,
.admin-table-action button {
  padding: 4px 0;
  color: var(--ui-accent);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
}

.invite-link-row button:hover,
.admin-table-action button:hover { text-decoration: underline; }

.admin-table-wrap { overflow-x: auto; }
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.admin-table th {
  padding: 0 10px 10px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.admin-table td {
  padding: 12px 10px;
  color: var(--ui-text-secondary);
  border-top: 1px solid var(--ui-divider);
  white-space: nowrap;
}

.admin-table th:first-child,
.admin-table td:first-child { padding-left: 0; }
.admin-table th:last-child,
.admin-table td:last-child { padding-right: 0; }

.role-chip {
  display: inline-flex;
  padding: 5px 7px;
  color: var(--ui-text-secondary);
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: 5px;
  font-size: 10px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
}

.status-chip i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ui-text-tertiary);
}

.status-chip.is-active { color: var(--ui-success); }
.status-chip.is-active i { background: var(--ui-success); }
.status-chip.is-used { color: var(--ui-text-secondary); }
.status-chip.is-expired,
.status-chip.is-revoked { color: var(--ui-text-tertiary); }

.muted-action {
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.admin-empty {
  padding: 28px 0 !important;
  color: var(--ui-text-tertiary) !important;
  text-align: center;
}

.admin-panel-note {
  margin: -10px 0 18px;
  color: var(--ui-text-secondary);
  font-size: 11px;
  line-height: 1.6;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  color: #fff;
  background: var(--ui-ink);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 650;
}

.user-cell strong,
.user-cell small { display: block; }
.user-cell strong { color: var(--ui-ink); font-size: 11px; font-weight: 600; }
.user-cell small { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 10px; }

.users-table select { width: 106px; height: 30px; padding: 0 7px; font-size: 10px; }
.users-table { min-width: 610px; }

.user-status-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 10px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.user-status-toggle span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ui-text-tertiary);
}

.user-status-toggle.enabled { color: var(--ui-success); }
.user-status-toggle.enabled span { background: var(--ui-success); }
.user-status-toggle:disabled { cursor: not-allowed; opacity: 0.45; }
.last-login { color: var(--ui-text-tertiary) !important; }

.account-toolbar {
  display: flex;
  justify-content: flex-end;
  margin: -7px 0 14px;
}

.account-toolbar input {
  width: min(240px, 100%);
  height: 32px;
  padding: 0 10px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 11px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: var(--ui-radius-control);
  outline: none;
}

.account-toolbar input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.account-data-count {
  color: var(--ui-text-tertiary);
  font: 10px/1.4 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.admin-table-action button {
  color: var(--ui-ink);
}

.audit-panel {
  grid-column: 1 / -1;
}

.audit-action {
  display: inline-flex;
  padding: 4px 6px;
  color: var(--ui-text-secondary);
  font-size: 10px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: 5px;
}

.audit-table td {
  white-space: nowrap;
}

.audit-delete-button {
  color: var(--ui-danger) !important;
}

.audit-delete-button:hover {
  color: var(--ui-danger) !important;
}

.account-dialog-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 17, 17, 0.24);
  backdrop-filter: blur(8px);
}

.account-dialog {
  display: flex;
  flex-direction: column;
  width: min(820px, 100%);
  max-height: min(900px, calc(100vh - 48px));
  color: var(--ui-ink);
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 22px;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.account-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px 26px 20px;
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-divider);
}

.account-dialog-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.account-dialog-avatar {
  width: 38px;
  height: 38px;
  font-size: 13px;
}

.account-dialog-identity .admin-panel-index {
  margin-bottom: 6px;
}

.account-dialog-identity h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 550;
  letter-spacing: -0.04em;
}

.account-dialog-identity small {
  display: block;
  margin-top: 5px;
  color: var(--ui-text-tertiary);
  font-size: 11px;
}

.account-dialog-close {
  width: 30px;
  height: 30px;
  color: var(--ui-text-tertiary);
  font-size: 23px;
  line-height: 1;
  background: transparent;
  border: 1px solid var(--ui-divider);
  border-radius: 50%;
  cursor: pointer;
}

.account-dialog-close:hover {
  color: var(--ui-ink);
  border-color: var(--ui-ink);
}

.account-dialog-scroll {
  min-height: 0;
  overflow-y: auto;
}

.account-dialog-section {
  padding: 24px 26px;
  border-bottom: 1px solid var(--ui-divider);
}

.account-dialog-section:last-child {
  border-bottom: 0;
}

.account-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.account-section-head > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.account-section-head span {
  color: var(--ui-accent);
  font: 700 10px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.account-section-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 550;
}

.account-section-head small {
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.account-profile-form,
.account-security-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.account-profile-form label,
.account-security-grid label {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.account-profile-form label > span,
.account-security-grid label > span {
  color: var(--ui-text-secondary);
  font-size: 10px;
}

.account-profile-form input,
.account-profile-form select,
.account-security-grid input {
  width: 100%;
  height: 36px;
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

.account-profile-form input:focus,
.account-profile-form select:focus,
.account-security-grid input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.account-save {
  align-self: end;
  min-width: 0;
}

.account-meta-grid,
.account-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-top: 16px;
}

.account-meta-grid span,
.account-stat-grid span {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-divider);
  border-radius: 9px;
}

.account-meta-grid small,
.account-stat-grid small {
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.account-meta-grid strong {
  overflow: hidden;
  color: var(--ui-text-secondary);
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-stat-grid strong {
  color: var(--ui-ink);
  font: 600 18px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.account-security-grid {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
}

.account-secondary-button,
.account-danger-button {
  height: 36px;
  padding: 0 12px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 10px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: var(--ui-radius-control);
  cursor: pointer;
  white-space: nowrap;
}

.account-secondary-button:hover:not(:disabled) {
  border-color: var(--ui-ink);
}

.account-danger-button {
  color: var(--ui-danger);
  border-color: color-mix(in srgb, var(--ui-danger) 32%, var(--ui-control-border));
}

.account-danger-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-danger) 7%, var(--ui-surface));
}

.account-secondary-button:disabled,
.account-danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.temporary-password {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 11px 12px;
  background: color-mix(in srgb, var(--ui-accent) 8%, var(--ui-fill));
  border: 1px solid color-mix(in srgb, var(--ui-accent) 25%, transparent);
  border-radius: 9px;
}

.temporary-password strong {
  display: block;
  margin-bottom: 6px;
  color: var(--ui-accent);
  font-size: 10px;
}

.temporary-password code {
  color: var(--ui-ink);
  font: 12px/1.2 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.temporary-password button {
  padding: 4px 0;
  color: var(--ui-accent);
  font: inherit;
  font-size: 10px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.account-data-loading {
  padding: 28px 0;
  color: var(--ui-text-tertiary);
  font-size: 11px;
  text-align: center;
}

.account-data-groups {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.account-data-groups details {
  background: var(--ui-surface);
  border: 1px solid var(--ui-divider);
  border-radius: 9px;
}

.account-data-groups summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px;
  color: var(--ui-text-secondary);
  font-size: 11px;
  cursor: pointer;
  list-style: none;
}

.account-data-groups summary::-webkit-details-marker { display: none; }
.account-data-groups summary span {
  color: var(--ui-text-tertiary);
  font: 10px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.account-data-groups ul {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0 12px 12px;
  list-style: none;
}

.account-data-groups li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--ui-divider);
}

.account-data-groups li strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-ink);
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-data-groups li small {
  flex: 0 0 auto;
  color: var(--ui-text-tertiary);
  font-size: 9px;
}

.account-data-empty {
  display: block !important;
  color: var(--ui-text-tertiary);
  font-size: 10px;
  text-align: center;
}

.draft-chip {
  display: inline-flex;
  margin-right: 7px;
  padding: 3px 5px;
  color: var(--ui-accent);
  font-size: 9px;
  background: color-mix(in srgb, var(--ui-accent) 9%, var(--ui-fill));
  border: 1px solid color-mix(in srgb, var(--ui-accent) 24%, transparent);
  border-radius: 5px;
}

.dimension-row-deleted td {
  color: var(--ui-text-tertiary);
  background: color-mix(in srgb, var(--ui-danger, #ff3b30) 4%, transparent);
}

.dimension-delete-chip {
  color: var(--ui-danger, #ff3b30);
  background: color-mix(in srgb, var(--ui-danger, #ff3b30) 9%, var(--ui-fill));
  border-color: color-mix(in srgb, var(--ui-danger, #ff3b30) 24%, transparent);
}

.dimension-delete-status {
  color: var(--ui-danger, #ff3b30);
  font-size: 10px;
}

.dimension-delete-button {
  margin-left: 10px;
  color: var(--ui-danger, #ff3b30) !important;
}

.admin-table-action button:disabled {
  color: var(--ui-text-tertiary) !important;
  cursor: not-allowed;
  opacity: 0.5;
  text-decoration: none !important;
}

.dimension-panel {
  max-width: 1380px;
  margin: 18px auto 0;
}

.dimension-head { margin-bottom: 20px; }

.config-release {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 18px;
  padding: 13px 14px;
  background: color-mix(in srgb, var(--ui-accent) 6%, var(--ui-surface));
  border: 1px solid color-mix(in srgb, var(--ui-accent) 20%, var(--ui-control-border));
  border-radius: 12px;
}

.config-release-status,
.config-release-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-release-status {
  align-items: center;
  min-width: 0;
}

.config-release-copy { min-width: 0; }

.config-version {
  display: grid;
  place-items: center;
  min-width: 38px;
  height: 27px;
  padding: 0 6px;
  color: var(--ui-accent);
  font: 700 10px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  background: var(--ui-fill);
  border: 1px solid color-mix(in srgb, var(--ui-accent) 28%, transparent);
  border-radius: 7px;
}

.config-release-status strong,
.config-release-status small { display: block; }
.config-release-status strong { color: var(--ui-ink); font-size: 11px; font-weight: 600; }
.config-release-status small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 10px; }

.config-release-actions { flex: 0 1 430px; }

.config-note-field {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 170px;
}

.config-release-actions input {
  width: min(220px, 22vw);
  height: 34px;
  padding: 0 9px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 10px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-control-border);
  border-radius: 7px;
  outline: none;
}

.config-release-actions input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.config-release-buttons {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.config-release-actions .admin-primary-button { min-width: 90px; height: 34px; }

.config-discard {
  height: 34px;
  padding: 0 10px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 10px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-control-border);
  border-radius: 7px;
  cursor: pointer;
}

.config-discard:hover:not(:disabled) { color: var(--ui-danger); }
.config-discard:disabled { cursor: not-allowed; opacity: 0.35; }

.dimension-layout {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 22px;
}

.dimension-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 15px;
  border-right: 1px solid var(--ui-divider);
}

.dimension-type {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 10px 9px;
  color: var(--ui-text-secondary);
  font: inherit;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
}

.dimension-type:hover {
  color: var(--ui-ink);
  background: var(--ui-surface);
  border-color: var(--ui-control-border);
}

.dimension-type.active {
  color: var(--ui-ink);
  background: var(--ui-surface);
  border-color: var(--ui-ink);
}

.dimension-type strong,
.dimension-type small { display: block; }
.dimension-type strong { font-size: 12px; font-weight: 600; }
.dimension-type small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 10px; }
.dimension-type i { color: var(--ui-accent); font-size: 14px; font-style: normal; }
.dimension-loading { color: var(--ui-text-tertiary); font-size: 11px; }

.dimension-content { min-width: 0; }

.dimension-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
}

.dimension-file {
  margin: 0;
  color: var(--ui-ink);
  font: 12px/1.2 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.dimension-description {
  margin: 7px 0 0;
  color: var(--ui-text-secondary);
  font-size: 11px;
}

.dimension-add { min-width: 112px; }

.dimension-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px auto;
  gap: 8px;
  margin-bottom: 15px;
}

.dimension-filters input,
.dimension-filters select {
  width: 100%;
  height: 35px;
  padding: 0 10px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 11px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: var(--ui-radius-control);
  outline: none;
  box-sizing: border-box;
}

.dimension-filters input:focus,
.dimension-filters select:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.dimension-filters > button {
  height: 35px;
  padding: 0 14px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 11px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-control-border);
  border-radius: 999px;
  cursor: pointer;
}

.dimension-filters > button:hover { border-color: var(--ui-ink); }

.dimension-editor {
  margin-bottom: 16px;
  padding: 15px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: 12px;
}

.dimension-editor-head,
.dimension-editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dimension-editor-head {
  margin-bottom: 13px;
  font-size: 12px;
}

.dimension-editor-head button,
.dimension-editor-actions > button:first-child {
  padding: 0;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 11px;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.dimension-editor-head button:hover,
.dimension-editor-actions > button:first-child:hover { color: var(--ui-ink); }

.dimension-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.dimension-fields label > span {
  display: block;
  margin-bottom: 6px;
  color: var(--ui-text-secondary);
  font-size: 10px;
}

.dimension-fields input {
  width: 100%;
  height: 33px;
  padding: 0 9px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 11px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-control-border);
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}

.dimension-fields input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-ring);
}

.dimension-editor-actions { justify-content: flex-end; }
.dimension-editor-actions .admin-primary-button { min-width: 92px; }

.dimension-table-wrap {
  position: relative;
  max-height: 450px;
  overflow: auto;
  background: var(--ui-surface);
  border: 1px solid var(--ui-divider);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(29, 29, 31, 0.055);
}

.dimension-table {
  min-width: 760px;
  border-collapse: separate;
  border-spacing: 0;
}

.dimension-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  min-width: 104px;
  height: 46px;
  padding: 0 12px;
  color: rgba(255, 255, 255, 0.72);
  font-family: "Avenir Next", "Segoe UI Variable", "PingFang SC", sans-serif;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  vertical-align: middle;
  background: #202124;
  border: 0;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
}

.dimension-table thead th + th {
  box-shadow: inset 1px 0 rgba(255, 255, 255, 0.075), 0 1px 0 rgba(0, 0, 0, 0.18);
}

.dimension-table thead th:first-child {
  padding-left: 14px;
  border-top-left-radius: 11px;
}

.dimension-table thead th:last-child {
  padding-right: 14px;
  border-top-right-radius: 11px;
}

.dimension-header-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  white-space: nowrap;
}

.dimension-header-index {
  min-width: 16px;
  color: rgba(255, 255, 255, 0.34);
  font: 600 9px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.08em;
}

.dimension-key-header {
  min-width: 132px !important;
}

.dimension-key-header .dimension-header-index {
  color: #ff7657;
}

.dimension-key-header .dimension-header-label {
  color: #ffffff;
}

.dimension-status-header {
  min-width: 118px !important;
}

.dimension-action-header {
  min-width: 92px !important;
}

.dimension-action-header .dimension-header-cell {
  justify-content: flex-end;
}

.dimension-table tbody td {
  padding: 13px 12px;
  vertical-align: middle;
  border-top: 0;
  border-bottom: 1px solid var(--ui-divider);
  transition: color 140ms ease, background 140ms ease;
}

.dimension-table tbody tr:not(.dimension-row-deleted):hover td {
  color: var(--ui-ink);
  background: color-mix(in srgb, var(--ui-accent) 2.5%, var(--ui-surface));
}

.dimension-table tbody tr:last-child td {
  border-bottom: 0;
}

.dimension-table tbody td:first-child {
  padding-left: 14px;
}

.dimension-table tbody td:last-child {
  padding-right: 14px;
}

.dimension-table td.admin-table-action {
  min-width: 92px;
  text-align: right;
}

.dimension-table td { max-width: 230px; }
.dimension-cell {
  display: block;
  overflow: hidden;
  max-width: 220px;
  text-overflow: ellipsis;
}

.dimension-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.dimension-pagination-summary,
.dimension-pagination-nav {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.dimension-pagination-summary label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dimension-pagination-summary select {
  height: 26px;
  padding: 0 22px 0 8px;
  color: var(--ui-text-secondary);
  font: inherit;
  background: var(--ui-fill);
  border: 1px solid var(--ui-control-border);
  border-radius: 6px;
  outline: none;
}

.dimension-pagination-summary select:focus {
  border-color: var(--ui-ink);
}

.dimension-pagination button {
  padding: 4px 0;
  color: var(--ui-text-secondary);
  font: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.dimension-pagination button:hover:not(:disabled) { color: var(--ui-ink); }
.dimension-pagination button:disabled { cursor: not-allowed; opacity: 0.35; }

.admin-toast-enter-active,
.admin-toast-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.admin-toast-enter-from,
.admin-toast-leave-to { opacity: 0; transform: translateY(-5px); }

@keyframes admin-pulse {
  from { transform: scale(0.8); opacity: 0.45; }
  to { transform: scale(1.1); opacity: 1; }
}

@media (max-width: 1200px) {
  .admin-panels { grid-template-columns: 1fr; }
  .config-release { align-items: center; flex-direction: column; }
  .config-release-actions { width: 100%; justify-content: center; }
  .config-note-field { width: auto; flex: 1; }
  .config-release-actions input { width: 100%; }
}

@media (max-width: 700px) {
  .admin-hero { align-items: flex-start; flex-direction: column; }
  .admin-refresh { align-self: flex-start; }
  .invite-form { grid-template-columns: 1fr 0.75fr; }
  .admin-primary-button { grid-column: 1 / -1; }
  .dimension-layout { grid-template-columns: 1fr; }
  .dimension-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding-right: 0;
    padding-bottom: 11px;
    border-right: 0;
    border-bottom: 1px solid var(--ui-divider);
  }
  .config-release-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .config-note-field { width: 100%; }
  .config-release-buttons { justify-content: flex-end; }
  .dimension-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .dimension-toolbar { align-items: flex-start; flex-direction: column; }
  .dimension-add { align-self: flex-start; }
  .config-release-actions { align-items: stretch; flex-wrap: wrap; }
  .account-dialog-backdrop { padding: 12px; }
  .account-dialog { max-height: calc(100vh - 24px); border-radius: 17px; }
  .account-dialog-head,
  .account-dialog-section { padding: 19px; }
  .account-section-head { align-items: flex-start; flex-direction: column; gap: 7px; }
  .account-profile-form,
  .account-security-grid { grid-template-columns: 1fr; }
  .account-save { grid-column: auto; }
  .account-security-grid button { width: 100%; }
}

@media (max-width: 520px) {
  .admin-center { padding: 26px 15px 50px; }
  .admin-hero h1 { font-size: 32px; }
  .invite-form { grid-template-columns: 1fr; }
  .admin-primary-button { grid-column: auto; }
  .dimension-filters { grid-template-columns: 1fr; }
  .dimension-fields { grid-template-columns: 1fr; }
  .config-release-actions input { width: 100%; flex-basis: 100%; }
  .invite-link-row { align-items: stretch; flex-direction: column; }
  .invite-link-row button { align-self: flex-start; }
  .account-meta-grid,
  .account-stat-grid { grid-template-columns: 1fr; }
  .account-toolbar { justify-content: stretch; }
  .account-toolbar input { width: 100%; }
  .temporary-password { align-items: flex-start; flex-direction: column; }
}
</style>
