<template>
  <main ref="adminCenterRoot" class="admin-center">
    <div class="admin-shell">
      <aside class="admin-navigation" aria-label="系统管理导航">
        <div class="admin-navigation-title">
          <span>SYS</span>
          <div>
            <strong>系统管理</strong>
            <small>安全与配置控制台</small>
          </div>
        </div>
        <nav>
          <button
            v-for="item in navigationItems"
            :key="item.id"
            type="button"
            :class="{ active: activeSection === item.id }"
            :aria-current="activeSection === item.id ? 'page' : undefined"
            @click="activeSection = item.id"
          >
            <span>{{ item.index }}</span>
            {{ item.label }}
            <i v-if="item.badge">{{ item.badge }}</i>
          </button>
        </nav>
        <div class="admin-navigation-foot">
          <i :class="{ healthy: databaseHealthy }"></i>
          <span>
            <strong>{{ databaseHealthy ? '系统运行正常' : '等待状态检查' }}</strong>
            <small>配置版本 v{{ configStatus.currentVersion || 0 }}</small>
          </span>
        </div>
      </aside>

      <div class="admin-workspace">
    <header class="admin-hero">
      <div>
        <p class="admin-eyebrow">SYSTEM / {{ String(activeNavigationIndex).padStart(2, '0') }}</p>
        <h1>{{ activeNavigationItem?.label || '系统管理' }}</h1>
        <p class="admin-lede">{{ activeNavigationItem?.description }}</p>
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

    <div
      v-if="canManageAccounts && ['users', 'invites', 'plans'].includes(activeSection)"
      class="admin-panels single-panel"
    >

      <section v-if="activeSection === 'invites'" class="admin-panel invite-panel">
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
              <option v-if="isSystemOwner" value="super_admin">超级管理员</option>
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

      <section v-if="activeSection === 'users'" class="admin-management-surface account-management-surface">
        <aside class="management-directory account-directory" aria-label="系统账号列表">
          <div class="directory-search">
            <Search aria-hidden="true" />
            <input v-model.trim="userQuery" type="search" placeholder="搜索姓名或登录账号" aria-label="搜索系统账号" />
          </div>

          <div class="directory-list" role="listbox" aria-label="选择要管理的系统账号">
            <button
              v-for="user in filteredUsers"
              :key="user.id"
              type="button"
              class="directory-user"
              :class="{ active: managedUser?.id === user.id }"
              :aria-selected="managedUser?.id === user.id"
              @click="selectAccountUser(user)"
            >
              <span class="user-avatar directory-avatar">
                <img v-if="user.avatarUrl" :src="user.avatarUrl" alt="" />
                <template v-else>{{ userInitial(user) }}</template>
              </span>
              <span class="directory-user-copy">
                <strong>{{ user.displayName || user.username }}</strong>
                <small>{{ user.username }}</small>
              </span>
              <span class="directory-user-role">{{ roleLabel(user.role) }}</span>
              <span class="directory-user-status" :class="{ enabled: user.enabled }">
                <i></i>{{ user.enabled ? '已启用' : '已停用' }}
              </span>
            </button>
            <p v-if="!filteredUsers.length" class="directory-empty">{{ users.length ? '没有匹配的系统账号' : '还没有系统账号' }}</p>
          </div>

          <footer class="directory-footer">
            <span>共 {{ filteredUsers.length }} 个账号</span>
            <small>账号创建请使用邀请管理</small>
          </footer>
        </aside>

        <section v-if="managedUser" class="management-detail account-settings" aria-labelledby="account-settings-title">
          <header class="management-detail-head">
            <div class="management-identity">
              <span class="user-avatar management-avatar">
                <img v-if="managedUser.avatarUrl" :src="managedUser.avatarUrl" alt="" />
                <template v-else>{{ userInitial(managedUser) }}</template>
              </span>
              <div>
                <p class="admin-panel-index">ACCOUNT / SETTINGS</p>
                <h2 id="account-settings-title">{{ managedUser.displayName || managedUser.username }}的账号设置</h2>
                <small>{{ managedUser.username }} · {{ roleLabel(managedUser.role) }}</small>
              </div>
            </div>
            <span class="account-live-status" :class="{ enabled: managedUser.enabled }"><i></i>{{ managedUser.enabled ? '账号正常' : '账号停用' }}</span>
          </header>

          <form class="account-settings-form" @submit.prevent="saveManagedUser">
            <section class="settings-block">
              <div class="settings-block-title">
                <span>01</span>
                <div><h3>账号资料</h3><small>维护显示名称、登录账号和账号状态</small></div>
              </div>
              <div class="settings-fields">
                <label><span>显示名称</span><input v-model.trim="accountForm.displayName" maxlength="80" required /></label>
                <label><span>登录账号</span><input v-model.trim="accountForm.username" :disabled="managedUser.isSystemOwner" maxlength="80" required autocomplete="off" /></label>
                <label class="settings-status-field">
                  <span>账号状态</span>
                  <select v-model="accountForm.enabled" :disabled="managedUser.id === currentUserId || managedUser.isSystemOwner">
                    <option :value="true">启用</option><option :value="false">停用</option>
                  </select>
                </label>
              </div>
            </section>

            <section class="settings-block permission-settings-block">
              <div class="settings-block-title">
                <span>02</span>
                <div><h3>权限范围</h3><small>权限随角色统一生效，不对单个账号单独拆分</small></div>
              </div>
              <div class="role-options" role="radiogroup" aria-label="账号角色">
                <label v-for="role in availableRoleOptions" :key="role.value" :class="{ active: accountForm.role === role.value }">
                  <input v-model="accountForm.role" type="radio" name="account-role" :value="role.value" :disabled="!canChangeUserRole(managedUser)" />
                  <span><strong>{{ role.label }}</strong><small>{{ role.description }}</small></span>
                </label>
              </div>
              <div class="permission-list">
                <div v-for="permission in permissionRows" :key="permission.key" class="permission-row">
                  <component :is="permission.icon" aria-hidden="true" />
                  <span><strong>{{ permission.label }}</strong><small>{{ permission.description }}</small></span>
                  <span
                    class="permission-access"
                    :class="{ active: selectedRolePermissions.includes(permission.key) }"
                    role="img"
                    :aria-label="`${permission.label}${selectedRolePermissions.includes(permission.key) ? '可访问' : '不可访问'}`"
                  >
                    <Check v-if="selectedRolePermissions.includes(permission.key)" aria-hidden="true" />
                    <Close v-else aria-hidden="true" />
                    {{ selectedRolePermissions.includes(permission.key) ? '可访问' : '不可访问' }}
                  </span>
                </div>
              </div>
            </section>

            <section class="settings-block security-settings-block">
              <div class="settings-block-title">
                <span>03</span>
                <div><h3>登录安全</h3><small>重置密码后旧登录会失效，原密码始终不可见</small></div>
              </div>
              <div class="security-summary">
                <div><small>最近登录</small><strong>{{ formatDate(managedUser.lastLoginAt) || '尚未登录' }}</strong></div>
                <div><small>密码更新时间</small><strong>{{ formatDate(managedUser.passwordChangedAt) || '历史密码' }}</strong></div>
                <div><small>账号创建时间</small><strong>{{ formatDate(managedUser.createdAt) }}</strong></div>
              </div>
              <div class="security-actions">
                <label><span>设置新密码</span><input v-model="accountForm.password" type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 位" /></label>
                <button type="button" :disabled="securityBusy || accountForm.password.length < 8 || isProtectedSystemOwner(managedUser)" @click="resetManagedPassword(false)">重置密码</button>
                <button type="button" :disabled="securityBusy || isProtectedSystemOwner(managedUser)" @click="resetManagedPassword(true)">生成临时密码</button>
                <button class="danger" type="button" :disabled="securityBusy || managedUser.id === currentUserId || isProtectedSystemOwner(managedUser)" @click="revokeManagedSessions">强制退出全部设备</button>
              </div>
              <div v-if="temporaryPassword" class="temporary-password">
                <div><strong>临时密码仅显示一次</strong><code>{{ temporaryPassword }}</code></div>
                <button type="button" @click="copyTemporaryPassword">复制</button>
              </div>
            </section>

            <div v-if="managedUser.id !== currentUserId && !managedUser.isSystemOwner" class="inline-delete-zone">
              <div><strong>注销账号</strong><p>将永久删除该账号及其私人方案、文件夹和任务，公共方案不受影响。</p></div>
              <button type="button" :disabled="deletingAccount" @click="deleteManagedUser">{{ deletingAccount ? '正在注销…' : '注销账号' }}</button>
            </div>

            <footer class="account-settings-footer">
              <button type="button" @click="resetAccountForm">取消修改</button>
              <button class="primary" type="submit" :disabled="busyUserId === managedUser.id">{{ busyUserId === managedUser.id ? '保存中…' : '保存账号设置' }}</button>
            </footer>
          </form>
        </section>
        <div v-else class="management-detail-empty">请选择一个系统账号</div>
      </section>

      <section v-if="activeSection === 'plans'" class="admin-management-surface plan-management-surface">
        <aside class="management-directory plan-user-directory" aria-label="用户方案数据账号列表">
          <div class="directory-search">
            <Search aria-hidden="true" />
            <input v-model.trim="userQuery" type="search" placeholder="搜索用户名称或账号" aria-label="搜索用户方案数据" />
          </div>
          <div class="directory-column-head"><span>用户</span><span>方案 / 文件夹 / 任务</span></div>
          <div class="directory-list" role="listbox" aria-label="选择要查看方案数据的用户">
            <button
              v-for="user in pagedPlanUsers"
              :key="user.id"
              type="button"
              class="directory-user plan-directory-user"
              :class="{ active: managedUser?.id === user.id }"
              :aria-selected="managedUser?.id === user.id"
              @click="selectPlanUser(user)"
            >
              <span class="user-avatar directory-avatar"><img v-if="user.avatarUrl" :src="user.avatarUrl" alt="" /><template v-else>{{ userInitial(user) }}</template></span>
              <span class="directory-user-copy"><strong>{{ user.displayName || user.username }}</strong><small>{{ user.username }}</small></span>
              <span class="plan-user-counts">{{ user.dataCounts?.solutions || 0 }} / {{ user.dataCounts?.folders || 0 }} / {{ user.dataCounts?.tasks || 0 }}</span>
            </button>
            <p v-if="!filteredUsers.length" class="directory-empty">{{ users.length ? '没有匹配的用户' : '还没有用户数据' }}</p>
          </div>
          <footer class="directory-footer plan-directory-footer">
            <span>共 {{ filteredUsers.length }} 位用户</span>
            <div v-if="planUserTotalPages > 1" class="directory-pagination">
              <button type="button" :disabled="planUserPage <= 1" @click="planUserPage -= 1">‹</button>
              <button v-for="page in planUserTotalPages" :key="page" type="button" :class="{ active: planUserPage === page }" @click="planUserPage = page">{{ page }}</button>
              <button type="button" :disabled="planUserPage >= planUserTotalPages" @click="planUserPage += 1">›</button>
            </div>
          </footer>
        </aside>

        <section v-if="managedUser" class="management-detail plan-data-detail" aria-labelledby="plan-data-title">
          <header class="plan-data-head">
            <div class="management-identity">
              <span class="user-avatar management-avatar"><img v-if="managedUser.avatarUrl" :src="managedUser.avatarUrl" alt="" /><template v-else>{{ userInitial(managedUser) }}</template></span>
              <div><p class="admin-panel-index">USER / DATA</p><h2 id="plan-data-title">{{ managedUser.displayName || managedUser.username }}的方案数据</h2><small>{{ managedUser.username }}</small></div>
            </div>
            <div class="plan-count-summary">
              <span><strong>{{ managedUserData?.counts?.solutions || 0 }}</strong>个方案</span>
              <span><strong>{{ managedUserData?.counts?.folders || 0 }}</strong>个文件夹</span>
              <span><strong>{{ managedUserData?.counts?.tasks || 0 }}</strong>条任务</span>
            </div>
          </header>

          <nav class="plan-data-tabs" aria-label="用户数据分类">
            <button v-for="tab in planDataTabs" :key="tab.id" type="button" :class="{ active: activePlanTab === tab.id }" @click="activePlanTab = tab.id">{{ tab.label }}<span>{{ tab.count }}</span></button>
          </nav>

          <div v-if="accountDataLoading" class="plan-data-loading"><span></span>正在读取该用户的数据索引…</div>
          <template v-else-if="managedUserData">
            <div v-if="activePlanTab === 'solutions'" class="plan-solution-view">
              <div class="plan-table-head"><span>方案名称</span><span>版本</span><span>状态</span><span>最近更新</span><span>操作</span></div>
              <section v-for="group in managedSolutionGroups" :key="group.id" class="plan-folder-group">
                <button class="plan-folder-head" type="button" :aria-expanded="isPlanGroupOpen(group.id)" @click="togglePlanGroup(group.id)">
                  <ArrowDown :class="{ collapsed: !isPlanGroupOpen(group.id) }" aria-hidden="true" />
                  <Folder aria-hidden="true" />
                  <strong>{{ group.name }}</strong><small>{{ group.solutions.length }} 个方案</small>
                </button>
                <div v-if="isPlanGroupOpen(group.id)" class="plan-folder-rows">
                  <article v-for="solution in group.solutions" :key="solution.id" class="plan-solution-row">
                    <div><Document aria-hidden="true" /><span><strong>{{ solution.name || '未命名方案' }}</strong><small>{{ solution.nodes?.length || 0 }} 个组件条件</small></span></div>
                    <span>V{{ solution._version || 1 }}</span>
                    <span class="plan-status" :class="{ published: solution.status === 'published' }">{{ solution.status === 'published' ? '已发布' : '草稿' }}</span>
                    <time>{{ formatDate(solution.updatedAt) || '—' }}</time>
                    <div class="plan-row-actions"><button type="button" @click="openSolutionPreview(solution)">查看详情</button><button type="button" :disabled="Boolean(solution.promotion)" @click="openSolutionPreview(solution)">{{ solution.promotion ? '已复制到公共库' : '复制到公共方案库' }}</button></div>
                  </article>
                </div>
              </section>
              <p v-if="!managedSolutionGroups.length" class="plan-data-empty">该用户还没有个人方案</p>
              <footer v-else class="plan-data-total">共 {{ managedUserData.solutions?.length || 0 }} 个方案</footer>
            </div>

            <div v-else-if="activePlanTab === 'folders'" class="plan-simple-list">
              <article v-for="folder in flattenedManagedFolders" :key="folder.id"><Folder aria-hidden="true" /><span><strong>{{ folder.path }}</strong><small>私人方案文件夹</small></span><time>{{ formatDate(folder.updatedAt) || '—' }}</time></article>
              <p v-if="!flattenedManagedFolders.length" class="plan-data-empty">该用户还没有私人文件夹</p>
            </div>

            <div v-else class="plan-simple-list task-data-list">
              <article v-for="task in managedUserData.tasks" :key="task.id"><Operation aria-hidden="true" /><span><strong>{{ task.name || '未命名任务' }}</strong><small>{{ task.phaseLabel || task.type || '任务记录' }}</small></span><span class="task-status">{{ task.status }}</span><time>{{ formatDate(task.updatedAt) || '—' }}</time></article>
              <p v-if="!managedUserData.tasks?.length" class="plan-data-empty">该用户还没有任务记录</p>
            </div>
          </template>
        </section>
        <div v-else class="management-detail-empty">请选择一个用户查看方案数据</div>
      </section>

    </div>

    <Teleport to="body">
      <div
        v-if="previewedSolution"
        class="solution-preview-backdrop"
        role="presentation"
        @click.self="closeSolutionPreview"
      >
        <section
          class="solution-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="solution-preview-title"
        >
          <header class="solution-preview-head">
            <div>
              <p class="admin-panel-index">SOLUTION / REVIEW</p>
              <h2 id="solution-preview-title">{{ previewedSolution.name || '未命名方案' }}</h2>
              <div class="solution-preview-chips">
                <span>{{ previewedSolution.status === 'published' ? '个人已发布' : '个人草稿' }}</span>
                <span>V{{ previewedSolution._version || 1 }}</span>
                <span>{{ previewedSolution.nodes?.length || 0 }} 个节点</span>
                <span>{{ managedUser?.displayName || managedUser?.username }}</span>
              </div>
            </div>
            <button type="button" aria-label="关闭方案详情" @click="closeSolutionPreview">×</button>
          </header>

          <div class="solution-preview-scroll">
            <section class="solution-review-section">
              <div class="solution-review-title">
                <span>01</span>
                <div>
                  <h3>方案概述</h3>
                  <small>与工作台右侧摘要一致，只展示实际生效的组件条件</small>
                </div>
              </div>
              <div v-if="solutionPreviewLoading" class="solution-overview-loading">
                <span></span>
                正在生成与工作台一致的组件概述…
              </div>
              <div v-else-if="previewNodes.length" class="solution-overview-list">
                <article v-for="(node, index) in previewNodes" :key="node.id || index" class="summary-node">
                  <header class="summary-node-head">
                    <span class="summary-idx">{{ index + 1 }}</span>
                    <span class="solution-overview-node-name">{{ getNodeSummaryDisplayName(node, index) }}</span>
                    <span v-if="index > 0" class="summary-op">{{ solutionOperatorLabel(node.operator) }}</span>
                  </header>
                  <div class="summary-rows">
                    <div v-for="item in solutionOverviewRows(node)" :key="item.key" class="summary-row">
                      <span class="summary-label">{{ item.label }}</span>
                      <span class="summary-val" :title="item.value">{{ item.value }}</span>
                    </div>
                    <p v-if="!solutionOverviewRows(node).length" class="solution-overview-empty">
                      {{ node._hydrationError ? '组件说明暂时无法读取' : '当前组件没有已配置的有效条件' }}
                    </p>
                  </div>
                </article>
                <div v-if="previewNodes.length > 1" class="summary-compute">
                  <span>运算链：</span>
                  <strong>{{ solutionComputeChain(previewNodes) }}</strong>
                </div>
              </div>
              <p v-else class="solution-review-empty">这个方案还没有配置任何组件。</p>
            </section>

            <section class="solution-review-section">
              <div class="solution-review-title">
                <span>02</span>
                <div>
                  <h3>自定义字段绑定</h3>
                  <small>确认使用方案时可以修改什么，以及它会写入哪个组件字段</small>
                </div>
              </div>
              <div v-if="previewedSolution.customFields?.length" class="solution-custom-field-list">
                <article
                  v-for="(field, index) in previewedSolution.customFields"
                  :key="field.id || index"
                  class="solution-custom-field"
                >
                  <header>
                    <div>
                      <strong>{{ field.name || field.label || field.displayName || `自定义字段 ${index + 1}` }}</strong>
                      <small>{{ field.type || '未标注字段类型' }}</small>
                    </div>
                    <span>{{ solutionFieldBindings(field).length }} 处绑定</span>
                  </header>
                  <ul v-if="solutionFieldBindings(field).length">
                    <li v-for="(binding, bindingIndex) in solutionFieldBindings(field)" :key="`${field.id || index}-${bindingIndex}`">
                      <span class="solution-binding-node">
                        <small>{{ binding.packageType }}</small>
                        <strong>{{ binding.nodeLabel }}</strong>
                      </span>
                      <span class="solution-binding-arrow" aria-hidden="true">→</span>
                      <span class="solution-binding-field">
                        <strong>{{ binding.fieldLabel }}</strong>
                        <small v-if="binding.fieldLabel !== binding.fieldKey">{{ binding.fieldKey }}</small>
                      </span>
                    </li>
                  </ul>
                  <p v-else>这个自定义字段尚未绑定组件字段</p>
                </article>
              </div>
              <p v-else class="solution-review-empty">这个方案没有配置自定义字段。</p>
            </section>
          </div>

          <footer class="solution-promotion-bar">
            <div v-if="previewedSolution.promotion" class="solution-promotion-complete">
              <span>✓</span>
              <div>
                <strong>当前版本已经迁移</strong>
                <small>
                  {{ previewedSolution.promotion.publicName || previewedSolution.name }}
                  · {{ promotionLocationLabel(previewedSolution.promotion.folderId) }}
                </small>
              </div>
            </div>
            <template v-else>
              <label>
                <span>迁移到公共方案库</span>
                <select v-model="promotionDestination" :disabled="publicFoldersLoading">
                  <option value="" disabled>{{ publicFoldersLoading ? '正在读取公共文件夹…' : '请选择目标文件夹' }}</option>
                  <option value="__root__">公共方案库 / 根目录</option>
                  <option v-for="folder in flattenedPublicFolders" :key="folder.id" :value="folder.id">
                    公共方案库 / {{ folder.path }}
                  </option>
                </select>
              </label>
              <div>
                <small>迁移将复制当前 V{{ previewedSolution._version || 1 }}，不会修改用户原件。</small>
                <button
                  type="button"
                  :disabled="!promotionDestination || promotingSolutionId === previewedSolution.id"
                  @click="promoteManagedSolution(previewedSolution)"
                >{{ promotingSolutionId === previewedSolution.id ? '迁移中…' : '确认迁移到所选文件夹' }}</button>
              </div>
            </template>
          </footer>
        </section>
      </div>
    </Teleport>

    <div v-if="isSystemOwner && activeSection === 'safety'" class="admin-section-stack">
      <DataSafetyPanel />
    </div>

    <section
      v-if="['config', 'releases'].includes(activeSection)"
      class="admin-panel dimension-panel"
      :class="{ 'release-history-panel': activeSection === 'releases' }"
    >
      <template v-if="activeSection === 'config'">
      <div class="admin-panel-head dimension-head">
        <div>
          <p class="admin-panel-index">03 / DICTIONARIES</p>
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
            <div class="dimension-toolbar-actions">
              <button
                v-if="canImportDimensions"
                class="dimension-import-trigger"
                type="button"
                @click="openDimensionImport"
              >
                <Upload aria-hidden="true" />
                批量导入
              </button>
              <button class="admin-primary-button dimension-add" type="button" @click="openCreateRow">
                <span>＋</span>新增记录
              </button>
            </div>
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
      </template>

      <section v-if="activeSection === 'releases'" class="config-audit-panel" aria-labelledby="config-audit-title">
        <div class="config-audit-head">
          <div>
            <p class="admin-panel-index">04 / CONFIG CHANGELOG</p>
            <h3 id="config-audit-title">配置修改记录</h3>
            <p>按管理员操作留档，展开可查看维表、记录以及每个字段的旧值与新值。</p>
          </div>
          <div class="config-audit-tools">
            <div class="config-audit-scope" aria-label="配置修改记录范围">
              <button
                type="button"
                :class="{ active: configAuditScope === 'all' }"
                @click="setConfigAuditScope('all')"
              >全部</button>
              <button
                type="button"
                :class="{ active: configAuditScope === 'current' }"
                @click="setConfigAuditScope('current')"
              >当前维表</button>
            </div>
            <button
              class="config-audit-refresh"
              type="button"
              :disabled="configAuditLoading"
              @click="loadConfigAuditLogs()"
            >{{ configAuditLoading ? '读取中…' : '刷新记录' }}</button>
          </div>
        </div>

        <div class="config-audit-summary">
          <span>{{ configAuditTotal.toLocaleString() }} 条留档</span>
          <span>当前显示最近 {{ configAuditLogs.length }} 条</span>
          <span>记录只读，不提供删除入口</span>
        </div>

        <div class="config-audit-list" :class="{ loading: configAuditLoading }">
          <article
            v-for="(entry, index) in configAuditLogs"
            :key="entry.id"
            class="config-audit-entry"
            :class="{ expanded: expandedConfigAuditId === entry.id }"
          >
            <button class="config-audit-entry-button" type="button" @click="toggleConfigAudit(entry)">
              <span class="config-audit-sequence">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="config-audit-action" :class="configAuditActionClass(entry.action)">
                {{ configAuditActionLabel(entry.action) }}
              </span>
              <span class="config-audit-identity">
                <strong>{{ dimensionAuditName(entry.dimensionFile) }}</strong>
                <small>
                  {{ entry.rowName || entry.details?.summary || '配置批次' }}
                  <template v-if="entry.rowId"> · {{ entry.rowId }}</template>
                </small>
              </span>
              <span class="config-audit-actor">
                <strong>{{ entry.actorDisplayName || entry.actorUsername || '未知管理员' }}</strong>
                <small>{{ formatDate(entry.createdAt) }}</small>
              </span>
              <span class="config-audit-count">{{ configAuditChangeCount(entry) }} 项差异</span>
              <span class="config-audit-chevron" aria-hidden="true">⌄</span>
            </button>

            <div v-if="expandedConfigAuditId === entry.id" class="config-audit-detail">
              <div class="config-audit-detail-intro">
                <p>{{ entry.details?.summary || configAuditActionLabel(entry.action) }}</p>
                <small v-if="entry.details?.note">发布说明：{{ entry.details.note }}</small>
                <small v-if="entry.action === 'DIMENSION_ROWS_IMPORTED'">
                  导入 {{ entry.details?.total || 0 }} 条，其中新增 {{ entry.details?.created || 0 }} 条、更新 {{ entry.details?.updated || 0 }} 条
                  <template v-if="entry.details?.skipped">，自动跳过 {{ entry.details.skipped }} 条重复记录</template>
                </small>
              </div>

              <div v-if="configAuditGroups(entry).length" class="config-audit-groups">
                <section
                  v-for="group in configAuditGroups(entry)"
                  :key="`${entry.id}-${group.dimensionFile}`"
                  class="config-audit-group"
                >
                  <header>
                    <strong>{{ dimensionAuditName(group.dimensionFile) }}</strong>
                    <span>{{ group.rows.length }} 条记录</span>
                  </header>

                  <div
                    v-for="row in group.rows"
                    :key="`${entry.id}-${group.dimensionFile}-${row.rowId}`"
                    class="config-audit-row"
                  >
                    <div class="config-audit-row-head">
                      <span class="config-audit-operation" :class="row.operation">
                        {{ configAuditOperationLabel(row.operation) }}
                      </span>
                      <strong>{{ row.rowName || row.rowId || '未命名记录' }}</strong>
                      <code v-if="row.rowId">{{ row.rowId }}</code>
                    </div>

                    <div v-if="row.changes?.length" class="config-audit-diff-table">
                      <div class="config-audit-diff-head" aria-hidden="true">
                        <span>字段</span><span>变更</span><span>修改前</span><span>修改后</span>
                      </div>
                      <div
                        v-for="(change, changeIndex) in row.changes"
                        :key="`${change.field}-${changeIndex}`"
                        class="config-audit-diff-row"
                      >
                        <strong>{{ change.field }}</strong>
                        <span class="config-audit-kind" :class="change.kind">
                          {{ configAuditChangeLabel(change.kind) }}
                        </span>
                        <code class="before" :title="formatConfigAuditValue(change.before)">
                          {{ formatConfigAuditValue(change.before) }}
                        </code>
                        <code class="after" :title="formatConfigAuditValue(change.after)">
                          {{ formatConfigAuditValue(change.after) }}
                        </code>
                      </div>
                    </div>
                    <p v-else class="config-audit-no-diff">该记录没有字段值差异。</p>
                  </div>
                </section>
              </div>
              <p v-else class="config-audit-no-diff">本次为批量管理动作，逐条字段变化已保留在关联记录中。</p>
            </div>
          </article>

          <p v-if="!configAuditLogs.length && !configAuditLoading" class="config-audit-empty">
            还没有配置修改记录。下一次保存、启停、删除、发布或放弃草稿后会自动出现。
          </p>
        </div>
      </section>
    </section>

    <div v-if="canManageAccounts && activeSection === 'logs'" class="admin-section-stack">
    <section class="admin-panel audit-panel admin-audit-bottom">
      <header class="admin-audit-head">
        <div>
          <p class="admin-panel-index">05 / AUDIT TRAIL</p>
          <h2>管理操作记录</h2>
          <p class="admin-panel-note">账号修改、密码重置、强制退出和数据审计都会留下记录。</p>
        </div>
        <div class="admin-audit-controls">
          <span class="admin-panel-count">最近 {{ auditLogs.length }} 条</span>
          <button
            class="admin-audit-toggle"
            type="button"
            :aria-expanded="auditPanelExpanded"
            aria-controls="admin-audit-records"
            @click="auditPanelExpanded = !auditPanelExpanded"
          >
            {{ auditPanelExpanded ? '收起记录' : '展开记录' }}
            <span :class="{ expanded: auditPanelExpanded }" aria-hidden="true">⌄</span>
          </button>
        </div>
      </header>

      <Transition name="admin-audit-reveal">
        <div v-if="auditPanelExpanded" id="admin-audit-records" class="admin-audit-body">
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
                  <td :colspan="canDeleteAuditLogs ? 5 : 4" class="admin-empty">还没有管理操作记录</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Transition>
    </section>
    </div>

    <div v-if="canManageAccounts && activeSection === 'announcements'" class="admin-section-stack">
      <AnnouncementAdminPanel :is-system-owner="isSystemOwner" />
    </div>

    <div v-if="isSystemOwner && activeSection === 'feedback'" class="admin-section-stack">
      <FeedbackAdminPanel />
    </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="dimensionImportOpen"
        class="dimension-import-backdrop"
        @click.self="closeDimensionImport"
      >
        <section
          class="dimension-import-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dimension-import-title"
        >
          <header class="dimension-import-head">
            <div>
              <p class="admin-panel-index">BATCH / XLSX</p>
              <h2 id="dimension-import-title">批量导入{{ dimensionDisplayName(selectedDimensionFile) }}维表</h2>
              <p>先核对表头、数据格式和影响范围，确认后才会写入待发布草稿。</p>
            </div>
            <button type="button" aria-label="关闭批量导入" :disabled="dimensionImportBusy" @click="closeDimensionImport">×</button>
          </header>

          <div v-if="dimensionImportComplete" class="dimension-import-complete">
            <span aria-hidden="true">✓</span>
            <p class="admin-panel-index">IMPORT READY</p>
            <h3>{{ dimensionImportComplete.rowCount.toLocaleString() }} 行数据已导入草稿</h3>
            <p>
              新增 {{ dimensionImportComplete.created.toLocaleString() }} 行，自动跳过
              {{ (dimensionImportComplete.skipped || 0).toLocaleString() }} 行重复数据；尚未影响工作台线上配置。
            </p>
            <div>
              <button class="admin-primary-button" type="button" @click="closeDimensionImport">返回维表</button>
            </div>
          </div>

          <template v-else>
            <div class="dimension-import-body">
              <section class="dimension-import-target">
                <div>
                  <small>目标维表</small>
                  <strong>{{ selectedDimensionFile }}</strong>
                </div>
                <p><span></span>导入后进入待发布，需通过“发布配置”才会同步到工作台。</p>
              </section>

              <section class="dimension-import-schema" aria-label="Excel 表头要求">
                <div>
                  <strong>表头必须完全一致</strong>
                  <small>名称与列顺序都不能增删或调整</small>
                </div>
                <ol>
                  <li v-for="(column, index) in dimensionImportExpectedColumns" :key="column">
                    <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ column }}
                  </li>
                </ol>
              </section>

              <input
                ref="dimensionImportFileInput"
                class="dimension-import-file-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                @change="handleDimensionImportFile"
              />
              <button
                class="dimension-import-dropzone"
                :class="{ dragging: dimensionImportDragging, loading: dimensionImportBusy }"
                type="button"
                :disabled="dimensionImportBusy"
                @click="chooseDimensionImportFile"
                @dragenter.prevent="dimensionImportDragging = true"
                @dragover.prevent="dimensionImportDragging = true"
                @dragleave.prevent="dimensionImportDragging = false"
                @drop.prevent="dropDimensionImportFile"
              >
                <span class="dimension-import-file-mark" aria-hidden="true">XLSX</span>
                <span>
                  <strong>{{ dimensionImportBusy ? '正在核对文件…' : (dimensionImportFileName || '选择或拖入 Excel 文件') }}</strong>
                  <small>{{ dimensionImportFileName ? '点击可重新选择文件' : '读取第一个工作表 · 最多 20,000 行、10 MB' }}</small>
                </span>
                <i>{{ dimensionImportBusy ? '核对中' : '选择文件' }}</i>
              </button>

              <template v-if="dimensionImportPreview">
                <section class="dimension-import-review" :class="{ invalid: !dimensionImportPreview.valid }">
                  <header>
                    <div>
                      <p class="admin-panel-index">PRE-FLIGHT CHECK</p>
                      <h3>
                        {{ !dimensionImportPreview.valid
                          ? `发现 ${dimensionImportPreview.errorCount || 1} 个问题`
                          : dimensionImportPreview.created > 0
                            ? '数据核对通过'
                            : '没有可导入的新记录' }}
                      </h3>
                    </div>
                    <span :class="{ passed: dimensionImportPreview.valid && dimensionImportPreview.created > 0, empty: dimensionImportPreview.valid && !dimensionImportPreview.created }">
                      {{ !dimensionImportPreview.valid ? '暂不可导入' : dimensionImportPreview.created > 0 ? '可以导入' : '全部跳过' }}
                    </span>
                  </header>

                  <div class="dimension-import-metrics">
                    <article>
                      <small>数据行数</small>
                      <strong>{{ dimensionImportPreview.rowCount.toLocaleString() }}</strong>
                      <span>行</span>
                    </article>
                    <article>
                      <small>表头列数</small>
                      <strong>{{ dimensionImportPreview.columnCount.toLocaleString() }}</strong>
                      <span>列</span>
                    </article>
                    <article>
                      <small>可导入新记录</small>
                      <strong>{{ (dimensionImportPreview.created || 0).toLocaleString() }}</strong>
                      <span>行</span>
                    </article>
                    <article>
                      <small>数据库已存在</small>
                      <strong>{{ (dimensionImportPreview.existing || 0).toLocaleString() }}</strong>
                      <span>行</span>
                    </article>
                  </div>

                  <ul class="dimension-import-checks">
                    <li v-for="check in dimensionImportChecks" :key="check.label" :class="{ passed: check.passed, warning: check.warning }">
                      <span>{{ check.warning ? '↷' : check.passed ? '✓' : '!' }}</span>
                      <div><strong>{{ check.label }}</strong><small>{{ check.detail }}</small></div>
                    </li>
                  </ul>

                  <div v-if="dimensionImportPreview.valid" class="dimension-import-impact">
                    <span></span>
                    <p>
                      本次只导入 <strong>{{ (dimensionImportPreview.created || 0).toLocaleString() }}</strong> 条新记录；
                      数据库已存在 <strong>{{ (dimensionImportPreview.existing || 0).toLocaleString() }}</strong> 条、文件内重复
                      <strong>{{ (dimensionImportPreview.duplicateInFile || 0).toLocaleString() }}</strong> 条，全部自动跳过且不会覆盖原值。
                    </p>
                  </div>

                  <section v-if="dimensionImportSkippedRows.length" class="dimension-import-skipped">
                    <header>
                      <div>
                        <strong>已跳过的记录</strong>
                        <small>逐条核对哪些信息已经存在或在文件内重复</small>
                      </div>
                      <span>{{ dimensionImportSkippedRows.length.toLocaleString() }} 条</span>
                    </header>
                    <div class="dimension-import-skipped-table">
                      <div class="dimension-import-skipped-head">
                        <span>Excel 行</span><span>跳过原因</span><span>适用的包</span><span>名称</span><span>标识信息</span>
                      </div>
                      <div
                        v-for="row in pagedDimensionImportSkippedRows"
                        :key="`${row.reasonType}-${row.row}-${row.displayName}`"
                        class="dimension-import-skipped-row"
                      >
                        <span class="dimension-import-row-number">{{ row.row }}</span>
                        <span class="dimension-import-skip-reason" :class="row.reasonType">
                          {{ row.reasonType === 'existing' ? '数据库已存在' : `与第 ${row.duplicateOfRow} 行重复` }}
                        </span>
                        <span :title="row.packageName">{{ row.packageName || '—' }}</span>
                        <strong :title="row.displayName">{{ row.displayName || '—' }}</strong>
                        <span :title="dimensionImportReferenceDetail(row)">{{ dimensionImportReferenceDetail(row) }}</span>
                      </div>
                    </div>
                    <footer v-if="dimensionImportSkipTotalPages > 1">
                      <button type="button" :disabled="dimensionImportSkipPage <= 1" @click="dimensionImportSkipPage -= 1">上一页</button>
                      <span>第 {{ dimensionImportSkipPage }} / {{ dimensionImportSkipTotalPages }} 页</span>
                      <button type="button" :disabled="dimensionImportSkipPage >= dimensionImportSkipTotalPages" @click="dimensionImportSkipPage += 1">下一页</button>
                    </footer>
                  </section>

                  <div v-if="!dimensionImportPreview.valid" class="dimension-import-errors">
                    <p>请修正 Excel 后重新选择文件</p>
                    <ul>
                      <li v-for="(issue, index) in dimensionImportPreview.issues" :key="`${issue.row}-${issue.column}-${index}`">
                        <span>第 {{ issue.row }} 行 · {{ issue.column }}</span>
                        <strong>{{ issue.message }}</strong>
                      </li>
                    </ul>
                    <small v-if="dimensionImportPreview.errorCount > dimensionImportPreview.issues.length">
                      另有 {{ dimensionImportPreview.errorCount - dimensionImportPreview.issues.length }} 个问题未展开
                    </small>
                  </div>
                </section>
              </template>
            </div>

            <footer class="dimension-import-actions">
              <div>
                <strong>{{ dimensionImportPreview?.sheetName || '等待选择文件' }}</strong>
                <small v-if="dimensionImportPreview?.expiresAt">预检结果 30 分钟内有效</small>
                <small v-else-if="dimensionImportPreview?.valid && !dimensionImportPreview?.created">全部记录都将跳过，无需执行导入</small>
                <small v-else>确认前不会写入任何数据</small>
              </div>
              <button type="button" :disabled="dimensionImportBusy" @click="closeDimensionImport">取消</button>
              <button
                class="admin-primary-button"
                type="button"
                :disabled="!dimensionImportPreview?.valid || !dimensionImportPreview?.importId || !dimensionImportPreview?.created || dimensionImportBusy"
                @click="confirmDimensionImport"
              >
                {{ dimensionImportBusy ? '处理中…' : `确认导入 ${dimensionImportPreview?.created || 0} 条新记录` }}
              </button>
            </footer>
          </template>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  ArrowDown,
  Check,
  Collection,
  Close,
  Document,
  Folder,
  Monitor,
  Operation,
  Search,
  Setting,
  Upload,
} from '@element-plus/icons-vue'
import DataSafetyPanel from './DataSafetyPanel.vue'
import FeedbackAdminPanel from './FeedbackAdminPanel.vue'
import AnnouncementAdminPanel from './AnnouncementAdminPanel.vue'
import { useCdpShared } from '../composables/useCdpShared.js'
import { useSolutionRuntime } from '../composables/useSolutionRuntime.js'
import { request } from '../utils/apiClient.js'
import { adoptConfigVersion } from '../utils/configVersion.js'
import { getNodeSummaryDisplayName } from '../utils/solutionState.js'
import {
  configAuditActionLabel,
  configAuditOperationLabel,
  configAuditChangeLabel,
  configAuditGroups,
  configAuditChangeCount,
  formatConfigAuditValue,
} from '../utils/configAudit.js'

const props = defineProps({
  currentUserId: {
    type: String,
    default: '',
  },
  currentUserRole: {
    type: String,
    default: 'user',
  },
  isSystemOwner: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['current-user-updated'])
const { isVisible } = useCdpShared()
const { hydrateNodes } = useSolutionRuntime()

const ROLE_LABELS = {
  super_admin: '超级管理员',
  config_admin: '配置管理员',
  user: '普通用户',
}
const DIMENSION_PAGE_SIZES = [20, 30, 50, 100]
const DIMENSION_IMPORT_SKIP_PAGE_SIZE = 8
const PLAN_USER_PAGE_SIZE = 8
const ROLE_OPTIONS = [
  { value: 'user', label: '普通用户', description: '使用工作台、方案中心和任务中台' },
  { value: 'config_admin', label: '配置管理员', description: '在普通用户能力上维护维表与配置' },
  { value: 'super_admin', label: '超级管理员', description: '管理系统账号、用户数据与配置' },
]
const ROLE_PERMISSIONS = {
  user: ['workspace', 'plans', 'tasks'],
  config_admin: ['workspace', 'plans', 'tasks', 'dimensions'],
  super_admin: ['workspace', 'plans', 'tasks', 'system', 'dimensions'],
}
const PERMISSION_ROWS = [
  { key: 'workspace', label: '工作台', description: '访问任务执行与基础功能', icon: Monitor },
  { key: 'plans', label: '方案中心', description: '访问个人方案与公共方案', icon: Collection },
  { key: 'tasks', label: '任务中台', description: '访问任务执行、查看与管理任务', icon: Operation },
  { key: 'system', label: '系统管理', description: '管理账号、邀请、用户数据与日志', icon: Setting },
  { key: 'dimensions', label: '维表与配置', description: '维护维表并发布配置版本', icon: Document },
]

const STATUS_LABELS = {
  active: '可使用',
  used: '已使用',
  expired: '已过期',
  revoked: '已作废',
}

const users = ref([])
const invites = ref([])
const auditLogs = ref([])
const adminCenterRoot = ref(null)
const activeSection = ref(
  props.isSystemOwner
    ? 'safety'
    : props.currentUserRole === 'super_admin'
      ? 'users'
      : 'config',
)
const dataSafetySnapshot = ref(null)
const feedbackItems = ref([])
const auditPanelExpanded = ref(false)
const configAuditLogs = ref([])
const configAuditTotal = ref(0)
const configAuditLoading = ref(false)
const configAuditScope = ref('all')
const expandedConfigAuditId = ref('')
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
const dimensionImportOpen = ref(false)
const dimensionImportBusy = ref(false)
const dimensionImportDragging = ref(false)
const dimensionImportFileInput = ref(null)
const dimensionImportFileName = ref('')
const dimensionImportPreview = ref(null)
const dimensionImportComplete = ref(null)
const dimensionImportSkipPage = ref(1)
const loading = ref(false)
const busy = ref(false)
const busyUserId = ref('')
const userQuery = ref('')
const planUserPage = ref(1)
const activePlanTab = ref('solutions')
const collapsedPlanGroups = ref(new Set())
const managedUser = ref(null)
const managedUserData = ref(null)
const previewedSolution = ref(null)
const previewNodes = ref([])
const solutionPreviewLoading = ref(false)
const publicFolders = ref([])
const publicFoldersLoading = ref(false)
const promotionDestination = ref('')
const accountDataLoading = ref(false)
const securityBusy = ref(false)
const deletingAccount = ref(false)
const promotingSolutionId = ref('')
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
let solutionPreviewRequestId = 0
let userDataRequestId = 0

const canManageAccounts = computed(() => props.currentUserRole === 'super_admin')
const canDeleteDimensions = computed(() => props.currentUserRole === 'super_admin')
const canImportDimensions = computed(() => ['config_admin', 'super_admin'].includes(props.currentUserRole))
const canDeleteAuditLogs = computed(() => props.currentUserRole === 'super_admin')
const dimensionImportExpectedColumns = computed(() => {
  if (dimensionColumns.value.length) return dimensionColumns.value
  return dimensions.value.find((item) => item.file === selectedDimensionFile.value)?.requiredColumns || []
})
const dimensionImportSkippedRows = computed(() => {
  const preview = dimensionImportPreview.value
  if (!preview) return []
  return [
    ...(preview.existingRows || []).map((row) => ({ ...row, reasonType: 'existing' })),
    ...(preview.duplicateRows || []).map((row) => ({ ...row, reasonType: 'file' })),
  ].sort((left, right) => left.row - right.row)
})
const dimensionImportSkipTotalPages = computed(() => Math.ceil(
  dimensionImportSkippedRows.value.length / DIMENSION_IMPORT_SKIP_PAGE_SIZE,
))
const pagedDimensionImportSkippedRows = computed(() => {
  const start = (dimensionImportSkipPage.value - 1) * DIMENSION_IMPORT_SKIP_PAGE_SIZE
  return dimensionImportSkippedRows.value.slice(start, start + DIMENSION_IMPORT_SKIP_PAGE_SIZE)
})
const dimensionImportChecks = computed(() => {
  const preview = dimensionImportPreview.value
  if (!preview) return []
  const issueCodes = new Set((preview.issues || []).map((issue) => issue.code))
  const formatIssues = [...issueCodes].filter((code) => code !== 'HEADER_MISMATCH')
  const headersPassed = Boolean(preview.headersValid)
  const skipped = Number(preview.skipped || 0)
  return [
    {
      label: '表头与顺序',
      passed: headersPassed,
      detail: headersPassed ? `${preview.columnCount} 列完全匹配` : '名称或列顺序不一致',
    },
    {
      label: '数据格式',
      passed: headersPassed && formatIssues.length === 0,
      detail: !headersPassed ? '表头通过后继续核对' : (formatIssues.length ? '存在不支持的单元格格式' : '单元格格式可安全写入'),
    },
    {
      label: '重复数据处理',
      passed: headersPassed && skipped === 0,
      warning: headersPassed && skipped > 0,
      detail: skipped
        ? `已存在 ${preview.existing || 0} 条 · 文件内重复 ${preview.duplicateInFile || 0} 条`
        : '未发现数据库已有或文件内重复记录',
    },
    {
      label: '导入范围',
      passed: preview.rowCount > 0 && preview.rowCount <= 20000,
      detail: `${preview.rowCount.toLocaleString()} 行 · ${preview.columnCount.toLocaleString()} 列`,
    },
  ]
})
const databaseHealthy = computed(() => Boolean(dataSafetySnapshot.value?.database?.healthy))
const pendingFeedbackCount = computed(() => feedbackItems.value.filter((item) => item.status === 'new').length)
const navigationItems = computed(() => {
  const items = [
    ...(props.isSystemOwner ? [{
      id: 'safety',
      label: '数据安全',
      description: '检查生产数据库完整性、核对核心数据量，并创建经过校验的备份。',
    }] : []),
    ...(canManageAccounts.value ? [
      {
        id: 'users',
        label: '用户与权限',
        description: '维护登录账号、角色权限、账号状态和登录安全。',
      },
      {
        id: 'invites',
        label: '邀请管理',
        description: '生成一次性邀请、分配初始角色，并管理邀请有效期。',
      },
      {
        id: 'plans',
        label: '用户方案数据',
        description: '查看每位用户的个人方案、文件夹与任务记录，必要时复制到公共方案库。',
      },
    ] : []),
    {
      id: 'config',
      label: '维表与配置',
      description: '新增、编辑、启停维表记录，并安全发布工作台配置。',
      badge: configStatus.value.pendingChanges || '',
    },
    {
      id: 'releases',
      label: '配置发布记录',
      description: '审阅配置变更、发布批次及每个字段修改前后的差异。',
    },
    ...(canManageAccounts.value ? [{
      id: 'announcements',
      label: '公告与教程',
      description: '自由编排文字、图片与视频内容，并控制公告和教程的发布与撤回。',
    }] : []),
    ...(canManageAccounts.value ? [{
      id: 'logs',
      label: '操作日志',
      description: '追溯账号、权限、数据和配置管理中的关键操作。',
    }] : []),
    ...(props.isSystemOwner ? [{
      id: 'feedback',
      label: '用户反馈',
      description: '查看用户提交的问题、建议和图片附件，并更新处理状态。',
      badge: pendingFeedbackCount.value || '',
    }] : []),
  ]
  return items.map((item, index) => ({
    ...item,
    index: String(index + 1).padStart(2, '0'),
  }))
})
const activeNavigationItem = computed(() => navigationItems.value.find((item) => item.id === activeSection.value) || navigationItems.value[0])
const activeNavigationIndex = computed(() => navigationItems.value.findIndex((item) => item.id === activeSection.value) + 1)

watch(activeSection, (section) => {
  window.requestAnimationFrame(() => {
    adminCenterRoot.value?.scrollTo({ top: 0, behavior: 'auto' })
  })
  closeSolutionPreview()
  const current = users.value.find((user) => user.id === managedUser.value?.id) || users.value[0]
  if (!current) return
  if (section === 'users') selectAccountUser(current)
  if (section === 'plans') selectPlanUser(current)
})

const filteredUsers = computed(() => {
  const query = userQuery.value.toLowerCase()
  if (!query) return users.value
  return users.value.filter((user) =>
    [user.username, user.displayName, roleLabel(user.role)]
      .some((value) => String(value || '').toLowerCase().includes(query)),
  )
})
const flattenedManagedFolders = computed(() => flattenFolders(managedUserData.value?.folders || []))
const flattenedPublicFolders = computed(() => flattenFolders(publicFolders.value))
const planUserTotalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / PLAN_USER_PAGE_SIZE)))
const pagedPlanUsers = computed(() => {
  const start = (planUserPage.value - 1) * PLAN_USER_PAGE_SIZE
  return filteredUsers.value.slice(start, start + PLAN_USER_PAGE_SIZE)
})
const availableRoleOptions = computed(() => ROLE_OPTIONS.filter((role) => (
  role.value !== 'super_admin' || props.isSystemOwner || accountForm.role === 'super_admin'
)))
const permissionRows = computed(() => PERMISSION_ROWS)
const selectedRolePermissions = computed(() => ROLE_PERMISSIONS[accountForm.role] || ROLE_PERMISSIONS.user)
const planDataTabs = computed(() => [
  { id: 'solutions', label: '个人方案', count: managedUserData.value?.counts?.solutions || 0 },
  { id: 'folders', label: '方案文件夹', count: managedUserData.value?.counts?.folders || 0 },
  { id: 'tasks', label: '任务记录', count: managedUserData.value?.counts?.tasks || 0 },
])
const managedSolutionGroups = computed(() => {
  const solutions = Array.isArray(managedUserData.value?.solutions) ? managedUserData.value.solutions : []
  const folders = flattenedManagedFolders.value
  const folderIds = new Set(folders.map((folder) => folder.id))
  const groups = folders
    .map((folder) => ({
      id: folder.id,
      name: folder.path,
      solutions: solutions.filter((solution) => solution.folderId === folder.id),
    }))
    .filter((group) => group.solutions.length)
  const uncategorized = solutions.filter((solution) => !solution.folderId || !folderIds.has(solution.folderId))
  if (uncategorized.length) groups.push({ id: '__uncategorized__', name: '未分类', solutions: uncategorized })
  return groups
})

watch(userQuery, () => {
  planUserPage.value = 1
})

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

function syncFeedbackSummary(event) {
  const item = event?.detail
  if (!item?.id) return
  const exists = feedbackItems.value.some((entry) => entry.id === item.id)
  feedbackItems.value = exists
    ? feedbackItems.value.map((entry) => entry.id === item.id ? { ...entry, ...item } : entry)
    : [item, ...feedbackItems.value]
}

function canChangeUserRole(user) {
  if (!user || user.id === props.currentUserId || user.isSystemOwner) return false
  if (user.role === 'super_admin' && !props.isSystemOwner) return false
  return true
}

function isProtectedSystemOwner(user) {
  return Boolean(user?.isSystemOwner && !props.isSystemOwner)
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

function auditActionLabel(action) {
  return {
    USER_UPDATED: '修改账号',
    USER_PASSWORD_RESET: '重置密码',
    USER_SESSIONS_REVOKED: '强制退出',
    USER_DELETED: '注销账号',
    USER_SOLUTION_PROMOTED: '迁移公共方案',
    USER_DATA_VIEWED: '查看用户数据',
    INVITE_CREATED: '创建邀请',
    INVITE_REVOKED: '撤销邀请',
    DATABASE_BACKUP_CREATED: '创建数据库备份',
    AUDIT_LOG_DELETED: '删除操作记录',
    ANNOUNCEMENT_CREATED: '创建公告草稿',
    ANNOUNCEMENT_UPDATED: '修改公告草稿',
    ANNOUNCEMENT_ASSET_UPLOADED: '上传公告图片',
    ANNOUNCEMENT_PUBLISHED: '发布更新公告',
    ANNOUNCEMENT_UNPUBLISHED: '撤回更新公告',
    ANNOUNCEMENT_DELETED: '删除公告草稿',
    folder_share_created: '分享方案文件夹',
    folder_share_imported: '导入方案文件夹',
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

function solutionNodeLabel(node, index) {
  return node?.displayName || node?.name || node?.title || node?.packageType || node?.type || `节点 ${index + 1}`
}

function solutionOperatorLabel(operator) {
  if (operator === 'u') return '并集'
  if (operator === 'd') return '差集'
  return '交集'
}

function solutionOverviewRows(node) {
  const items = []
  ;(Array.isArray(node?.schema) ? node.schema : []).forEach((field) => {
    if (!isVisible(field, node)) return

    const key = field.key
    const value = node.formData?.[key]
    const mode = node.modeData?.[key]
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value) && value.length === 0) return

    let display = ''
    if (field.Widget_Type === '数值_切换') {
      if (mode === 'unlimited') return
      if (mode === 'min' && value?.min !== null && value?.min !== undefined) {
        display = `≥${value.min}`
      } else if (mode === 'range') {
        display = `${value?.min ?? '?'} - ${value?.max ?? '?'}`
      }
    } else if (field.Widget_Type === '日期_切换') {
      if (mode === 'recent' && value?.days) {
        display = `过去 ${value.days} 天`
      } else if (mode === 'range' && Array.isArray(value?.dateRange) && value.dateRange.length === 2) {
        display = `${value.dateRange[0]} ~ ${value.dateRange[1]}`
      }
    } else if (Array.isArray(value)) {
      display = value.slice(0, 6).join('、')
      if (value.length > 6) display += ` ...共${value.length}项`
    } else if (typeof value === 'object') {
      display = JSON.stringify(value)
    } else {
      display = String(value)
    }

    if (display) {
      items.push({
        key,
        label: field.Label || field.label || key,
        value: display,
      })
    }
  })
  return items
}

function solutionComputeChain(nodes) {
  return nodes.map((node, index) => (
    index === 0 ? '1' : `${solutionOperatorLabel(node.operator)} ${index + 1}`
  )).join(' ')
}

function solutionFieldBindings(customField) {
  const sourceNodes = previewedSolution.value?.nodes || []
  const nodes = previewNodes.value.length ? previewNodes.value : sourceNodes
  return (Array.isArray(customField?.bindings) ? customField.bindings : []).map((binding) => {
    const nodeIndex = nodes.findIndex((node) => String(node?.id) === String(binding?.nodeId))
    const sourceIndex = sourceNodes.findIndex((node) => String(node?.id) === String(binding?.nodeId))
    const index = nodeIndex >= 0 ? nodeIndex : sourceIndex
    const node = nodeIndex >= 0 ? nodes[nodeIndex] : sourceNodes[sourceIndex]
    const schemaField = (Array.isArray(node?.schema) ? node.schema : []).find(
      (field) => String(field?.key) === String(binding?.fieldKey),
    )
    return {
      nodeLabel: node ? getNodeSummaryDisplayName(node, Math.max(index, 0)) : '组件已不存在',
      packageType: node?.packageType || '未知组件',
      fieldKey: binding?.fieldKey || '未知字段',
      fieldLabel: schemaField?.Label || schemaField?.label || binding?.fieldLabel || binding?.fieldKey || '未知字段',
    }
  })
}

function promotionLocationLabel(folderId) {
  if (!folderId) return '公共方案库 / 根目录'
  const folder = flattenedPublicFolders.value.find((item) => item.id === folderId)
  return folder ? `公共方案库 / ${folder.path}` : '公共方案库 / 文件夹已调整'
}

function selectedPromotionLocationLabel() {
  if (promotionDestination.value === '__root__') return '公共方案库 / 根目录'
  return promotionLocationLabel(promotionDestination.value)
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
    await loadConfigAuditLogs({ silent: true })
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
      const preferredUser = users.value.find((user) => user.id === managedUser.value?.id) || users.value[0]
      if (preferredUser && activeSection.value === 'users') selectAccountUser(preferredUser)
      if (preferredUser && activeSection.value === 'plans') await selectPlanUser(preferredUser)
      if (props.isSystemOwner) {
        const [nextSafetySnapshot, nextFeedbackItems] = await Promise.all([
          request('/api/admin/data-safety', { cache: 'no-store' }),
          request('/api/admin/feedback', {
            params: { limit: 100 },
            cache: 'no-store',
          }),
        ])
        dataSafetySnapshot.value = nextSafetySnapshot || null
        feedbackItems.value = nextFeedbackItems || []
      }
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
  closeDimensionImport()
  selectedDimensionFile.value = file
  dimensionPage.value = 1
  dimensionQuery.value = ''
  dimensionPackage.value = ''
  closeDimensionEditor()
  loadDimensionRows()
  if (configAuditScope.value === 'current') loadConfigAuditLogs()
}

async function loadConfigAuditLogs({ silent = false } = {}) {
  configAuditLoading.value = true
  try {
    const result = await request('/api/admin/config/audit-logs', {
      params: {
        limit: 60,
        dimensionFile: configAuditScope.value === 'current' ? selectedDimensionFile.value : '',
      },
      cache: 'no-store',
    })
    configAuditLogs.value = result.items || []
    configAuditTotal.value = result.total || 0
    if (expandedConfigAuditId.value && !configAuditLogs.value.some((entry) => entry.id === expandedConfigAuditId.value)) {
      expandedConfigAuditId.value = ''
    }
  } catch (error) {
    if (!silent) showMessage(error.message || '配置修改记录加载失败', 'error')
  } finally {
    configAuditLoading.value = false
  }
}

function setConfigAuditScope(scope) {
  if (!['all', 'current'].includes(scope) || configAuditScope.value === scope) return
  configAuditScope.value = scope
  expandedConfigAuditId.value = ''
  loadConfigAuditLogs()
}

function toggleConfigAudit(entry) {
  expandedConfigAuditId.value = expandedConfigAuditId.value === entry.id ? '' : entry.id
}

function configAuditActionClass(action) {
  if (action === 'DIMENSION_ROW_CREATED') return 'created'
  if (action === 'DIMENSION_ROW_DELETED' || action === 'CONFIG_DRAFT_DISCARDED') return 'removed'
  if (action === 'CONFIG_PUBLISHED') return 'published'
  return 'changed'
}

function dimensionAuditName(file) {
  return file ? dimensionDisplayName(file) : '多维表配置'
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
    await Promise.all([
      loadDimensionRows(),
      refreshConfigSummary(),
      loadConfigAuditLogs({ silent: true }),
    ])
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
    await Promise.all([
      refreshConfigSummary(),
      loadConfigAuditLogs({ silent: true }),
    ])
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
    await Promise.all([
      refreshConfigSummary(),
      loadConfigAuditLogs({ silent: true }),
    ])
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
    await Promise.all([
      loadDimensionRows(),
      refreshConfigSummary(),
      loadConfigAuditLogs({ silent: true }),
    ])
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
    await Promise.all([
      loadDimensionRows(),
      refreshConfigSummary(),
      loadConfigAuditLogs({ silent: true }),
    ])
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

function syncAccountForm(user) {
  accountForm.username = user?.username || ''
  accountForm.displayName = user?.displayName || user?.username || ''
  accountForm.role = user?.role || 'user'
  accountForm.enabled = user?.enabled !== false
  accountForm.password = ''
}

function resetDimensionImport() {
  dimensionImportBusy.value = false
  dimensionImportDragging.value = false
  dimensionImportFileName.value = ''
  dimensionImportPreview.value = null
  dimensionImportComplete.value = null
  dimensionImportSkipPage.value = 1
  if (dimensionImportFileInput.value) dimensionImportFileInput.value.value = ''
}

function openDimensionImport() {
  if (!canImportDimensions.value || !selectedDimensionFile.value) return
  closeDimensionEditor()
  resetDimensionImport()
  dimensionImportOpen.value = true
}

function closeDimensionImport() {
  if (dimensionImportBusy.value) return
  dimensionImportOpen.value = false
  resetDimensionImport()
}

function chooseDimensionImportFile() {
  if (dimensionImportBusy.value) return
  dimensionImportFileInput.value?.click()
}

function handleDimensionImportFile(event) {
  const file = event?.target?.files?.[0]
  if (dimensionImportFileInput.value) dimensionImportFileInput.value.value = ''
  if (file) previewDimensionImport(file)
}

function dropDimensionImportFile(event) {
  dimensionImportDragging.value = false
  if (dimensionImportBusy.value) return
  const file = event?.dataTransfer?.files?.[0]
  if (file) previewDimensionImport(file)
}

function dimensionImportReferenceDetail(row) {
  return [row?.channel, row?.identity].filter(Boolean).join(' · ') || '—'
}

async function previewDimensionImport(file) {
  if (!file || !String(file.name || '').toLowerCase().endsWith('.xlsx')) {
    showMessage('请选择 .xlsx 格式的 Excel 文件', 'error')
    return
  }
  dimensionImportFileName.value = file.name
  dimensionImportPreview.value = null
  dimensionImportComplete.value = null
  dimensionImportSkipPage.value = 1
  dimensionImportBusy.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const preview = await request(
      `/api/admin/dimensions/${encodeURIComponent(selectedDimensionFile.value)}/import/preview`,
      {
        method: 'POST',
        body,
        timeoutMs: 60_000,
      },
    )
    dimensionImportPreview.value = preview
    if (!preview.valid) showMessage(`Excel 预检发现 ${preview.errorCount || 1} 个问题`, 'error')
  } catch (error) {
    dimensionImportPreview.value = null
    showMessage(error.message || 'Excel 文件核对失败', 'error')
  } finally {
    dimensionImportBusy.value = false
  }
}

async function confirmDimensionImport() {
  const preview = dimensionImportPreview.value
  if (!preview?.valid || !preview?.importId || !preview?.created || dimensionImportBusy.value) return
  dimensionImportBusy.value = true
  try {
    const result = await request(
      `/api/admin/dimensions/${encodeURIComponent(selectedDimensionFile.value)}/import/${encodeURIComponent(preview.importId)}/confirm`,
      { method: 'POST', timeoutMs: 60_000 },
    )
    dimensionImportComplete.value = result
    dimensionPage.value = 1
    await Promise.all([
      loadDimensionRows(),
      refreshConfigSummary(),
      loadConfigAuditLogs({ silent: true }),
    ])
    showMessage(`已导入 ${result.rowCount} 行，等待发布配置`)
  } catch (error) {
    showMessage(error.message || '批量导入失败', 'error')
    if (/重新|超过|变化/.test(error.message || '')) dimensionImportPreview.value = null
  } finally {
    dimensionImportBusy.value = false
  }
}

function selectAccountUser(user) {
  if (!user) return
  userDataRequestId += 1
  managedUser.value = { ...user }
  syncAccountForm(user)
  temporaryPassword.value = ''
  managedUserData.value = null
  accountDataLoading.value = false
  publicFoldersLoading.value = false
  activePlanTab.value = 'solutions'
  closeSolutionPreview()
}

async function selectPlanUser(user) {
  if (!user) return
  const requestId = ++userDataRequestId
  managedUser.value = { ...user }
  syncAccountForm(user)
  temporaryPassword.value = ''
  managedUserData.value = null
  previewedSolution.value = null
  previewNodes.value = []
  solutionPreviewLoading.value = false
  publicFolders.value = []
  promotionDestination.value = ''
  accountDataLoading.value = true
  publicFoldersLoading.value = true
  try {
    const [userData, publicFolderTree] = await Promise.all([
      request(`/api/admin/users/${user.id}/data`, { cache: 'no-store' }),
      request('/api/folders', { params: { scope: 'public' }, cache: 'no-store' }),
    ])
    if (requestId !== userDataRequestId || managedUser.value?.id !== user.id) return
    managedUserData.value = userData
    publicFolders.value = publicFolderTree
    await loadAuditLogs()
  } catch (error) {
    if (requestId !== userDataRequestId) return
    showMessage(error.message || '用户数据审计加载失败', 'error')
  } finally {
    if (requestId === userDataRequestId) {
      accountDataLoading.value = false
      publicFoldersLoading.value = false
    }
  }
}

async function openUserManager(user) {
  if (activeSection.value === 'plans') return selectPlanUser(user)
  selectAccountUser(user)
}

function resetAccountForm() {
  if (!managedUser.value) return
  syncAccountForm(managedUser.value)
  temporaryPassword.value = ''
}

function isPlanGroupOpen(groupId) {
  return !collapsedPlanGroups.value.has(groupId)
}

function togglePlanGroup(groupId) {
  const next = new Set(collapsedPlanGroups.value)
  if (next.has(groupId)) next.delete(groupId)
  else next.add(groupId)
  collapsedPlanGroups.value = next
}

function closeUserManager() {
  userDataRequestId += 1
  closeSolutionPreview()
  managedUser.value = null
  managedUserData.value = null
  publicFolders.value = []
  accountForm.password = ''
  temporaryPassword.value = ''
}

async function openSolutionPreview(solution) {
  const requestId = ++solutionPreviewRequestId
  previewedSolution.value = solution
  previewNodes.value = []
  solutionPreviewLoading.value = true
  promotionDestination.value = ''
  try {
    const hydrated = await hydrateNodes(solution?.nodes || [])
    if (requestId === solutionPreviewRequestId && previewedSolution.value?.id === solution?.id) {
      previewNodes.value = hydrated
    }
  } finally {
    if (requestId === solutionPreviewRequestId) solutionPreviewLoading.value = false
  }
}

function closeSolutionPreview() {
  solutionPreviewRequestId += 1
  previewedSolution.value = null
  previewNodes.value = []
  solutionPreviewLoading.value = false
  promotionDestination.value = ''
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

async function promoteManagedSolution(solution) {
  if (!managedUser.value || !solution || solution.promotion) return
  if (!promotionDestination.value) {
    showMessage('请先选择公共方案库中的目标文件夹', 'error')
    return
  }
  const folderId = promotionDestination.value === '__root__'
    ? null
    : promotionDestination.value
  const destinationLabel = selectedPromotionLocationLabel()
  if (!window.confirm(`确定把“${solution.name || '未命名方案'}”的当前 V${solution._version || 1} 复制到“${destinationLabel}”吗？用户的私人原件会保留。`)) return
  promotingSolutionId.value = solution.id
  try {
    const promoted = await request(
      `/api/admin/users/${managedUser.value.id}/solutions/${solution.id}/promote`,
      { method: 'POST', body: JSON.stringify({ folderId }) },
    )
    solution.promotion = {
      publicSolutionId: promoted.id,
      publicName: promoted.name,
      folderId: promoted.folderId || null,
      promotedAt: promoted.publishedAt,
    }
    await loadAuditLogs()
    showMessage(`当前版本已复制到${destinationLabel}，用户原件保持不变`)
  } catch (error) {
    showMessage(error.message || '方案迁移失败', 'error')
  } finally {
    promotingSolutionId.value = ''
  }
}

async function deleteManagedUser() {
  if (!managedUser.value || managedUser.value.id === props.currentUserId) return
  const username = managedUser.value.username
  const confirmation = window.prompt(
    `注销后将永久删除“${managedUser.value.displayName || username}”的账号和私人数据。请输入登录账号 ${username} 确认：`,
  )
  if (confirmation !== username) {
    if (confirmation !== null) showMessage('输入的登录账号不一致，已取消注销', 'error')
    return
  }
  deletingAccount.value = true
  try {
    const result = await request(`/api/admin/users/${managedUser.value.id}`, {
      method: 'DELETE',
    })
    users.value = users.value.filter((item) => item.id !== result.id)
    closeUserManager()
    const nextUser = users.value[0]
    if (nextUser && activeSection.value === 'plans') await selectPlanUser(nextUser)
    else if (nextUser) selectAccountUser(nextUser)
    await loadAuditLogs()
    showMessage(`账号已注销，并删除 ${result.deletedData?.solutions || 0} 个私人方案和 ${result.deletedData?.tasks || 0} 条任务`)
  } catch (error) {
    showMessage(error.message || '账号注销失败', 'error')
  } finally {
    deletingAccount.value = false
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

onMounted(() => {
  window.addEventListener('cdp:feedback-submitted', syncFeedbackSummary)
  window.addEventListener('cdp:feedback-status-updated', syncFeedbackSummary)
  loadData()
})
onBeforeUnmount(() => {
  window.removeEventListener('cdp:feedback-submitted', syncFeedbackSummary)
  window.removeEventListener('cdp:feedback-status-updated', syncFeedbackSummary)
})
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

.admin-panels.single-panel { grid-template-columns: minmax(0, 1fr); }

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
  overflow: hidden;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-cell strong,
.user-cell small { display: block; }
.user-cell strong { color: var(--ui-ink); font-size: 11px; font-weight: 600; }
.user-cell small { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 10px; }
.system-owner-badge {
  display: inline-flex;
  height: 18px;
  align-items: center;
  margin-left: 6px;
  padding: 0 6px;
  color: #fff;
  font-size: 8px;
  font-style: normal;
  font-weight: 700;
  vertical-align: 1px;
  background: var(--ui-ink);
  border-radius: 999px;
}

.users-table {
  min-width: 0;
  table-layout: fixed;
}
.users-table th,
.users-table td {
  padding-right: 6px;
  padding-left: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.users-table th:nth-child(1) { width: 23%; }
.users-table th:nth-child(2) { width: 20%; }
.users-table th:nth-child(3) { width: 14%; }
.users-table th:nth-child(4) { width: 17%; }
.users-table th:nth-child(5) { width: 19%; }
.users-table th:nth-child(6) { width: 7%; }
.users-table select { width: 100%; min-width: 0; height: 30px; padding: 0 7px; font-size: 10px; }
.users-table .user-cell > span:last-child { min-width: 0; }
.users-table .user-cell strong,
.users-table .user-cell small,
.users-table .account-data-count,
.users-table .last-login {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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

.admin-audit-bottom {
  max-width: 1380px;
  margin: 18px auto 0;
  padding: 0;
  overflow: hidden;
}

.admin-audit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: clamp(18px, 2.3vw, 30px);
}

.admin-audit-head .admin-panel-index { margin-bottom: 7px; }

.admin-audit-head .admin-panel-note {
  margin: 8px 0 0;
}

.admin-audit-controls {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
}

.admin-audit-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 104px;
  height: 34px;
  padding: 0 13px;
  color: var(--ui-fill);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  background: var(--ui-ink);
  border: 1px solid var(--ui-ink);
  border-radius: var(--ui-radius-control);
  cursor: pointer;
  transition: transform 160ms ease, opacity 160ms ease;
}

.admin-audit-toggle:hover { transform: translateY(-1px); }
.admin-audit-toggle:focus-visible { outline: 3px solid var(--ui-accent-ring); outline-offset: 2px; }

.admin-audit-toggle span {
  font-size: 15px;
  transition: transform 180ms ease;
}

.admin-audit-toggle span.expanded { transform: rotate(180deg); }

.admin-audit-body {
  padding: 0 clamp(18px, 2.3vw, 30px) clamp(18px, 2.3vw, 30px);
  border-top: 1px solid var(--ui-divider);
}

.admin-audit-body .audit-table-wrap {
  max-height: 520px;
  margin-top: 20px;
  overflow: auto;
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

.account-delete-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 18px;
  padding: 14px 15px;
  background: color-mix(in srgb, var(--ui-danger) 5%, var(--ui-surface));
  border: 1px solid color-mix(in srgb, var(--ui-danger) 22%, var(--ui-divider));
  border-radius: 11px;
}

.account-delete-zone strong {
  color: var(--ui-danger);
  font-size: 11px;
}

.account-delete-zone p {
  max-width: 570px;
  margin: 5px 0 0;
  color: var(--ui-text-secondary);
  font-size: 10px;
  line-height: 1.55;
}

.account-delete-button {
  height: 34px;
  flex: 0 0 auto;
  padding: 0 12px;
  color: #fff;
  font: inherit;
  font-size: 10px;
  background: var(--ui-danger);
  border: 0;
  border-radius: var(--ui-radius-control);
  cursor: pointer;
}

.account-delete-button:disabled { cursor: wait; opacity: 0.55; }

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

.account-data-groups .managed-solution-list {
  gap: 9px;
}

.account-data-groups .managed-solution-card {
  display: block;
  padding: 11px 0 0;
}

.managed-solution-head,
.managed-solution-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.managed-solution-head > div {
  min-width: 0;
}

.managed-solution-head strong,
.managed-solution-head small {
  display: block;
}

.managed-solution-head small {
  margin-top: 5px;
}

.solution-promoted-chip {
  flex: 0 0 auto;
  padding: 4px 7px;
  color: var(--ui-success);
  font-size: 9px;
  background: color-mix(in srgb, var(--ui-success) 8%, var(--ui-fill));
  border: 1px solid color-mix(in srgb, var(--ui-success) 25%, transparent);
  border-radius: 999px;
}

.managed-solution-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

.managed-solution-nodes span {
  max-width: 180px;
  overflow: hidden;
  padding: 4px 7px;
  color: var(--ui-text-secondary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 6px;
}

.managed-solution-empty {
  margin: 9px 0 0;
  color: var(--ui-text-tertiary);
  font-size: 9px;
}

.managed-solution-actions {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--ui-divider);
}

.managed-solution-actions button {
  height: 29px;
  flex: 0 0 auto;
  padding: 0 10px;
  color: #fff;
  font: inherit;
  font-size: 9px;
  background: var(--ui-ink);
  border: 0;
  border-radius: 7px;
  cursor: pointer;
}

.managed-solution-actions button:disabled {
  color: var(--ui-text-tertiary);
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  cursor: default;
}

.solution-preview-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(17, 17, 17, 0.34);
  backdrop-filter: blur(11px);
}

.solution-preview-dialog {
  display: flex;
  flex-direction: column;
  width: min(820px, 100%);
  max-height: calc(100vh - 44px);
  overflow: hidden;
  color: var(--ui-ink);
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 22px;
  box-shadow: 0 32px 110px rgba(0, 0, 0, 0.24);
}

.solution-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 27px 20px;
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-divider);
}

.solution-preview-head .admin-panel-index { margin-bottom: 8px; }
.solution-preview-head h2 { margin: 0; font-size: 25px; font-weight: 560; letter-spacing: -0.045em; }

.solution-preview-head > button {
  width: 31px;
  height: 31px;
  flex: 0 0 auto;
  color: var(--ui-text-tertiary);
  font: inherit;
  font-size: 23px;
  line-height: 1;
  background: transparent;
  border: 1px solid var(--ui-divider);
  border-radius: 50%;
  cursor: pointer;
}

.solution-preview-head > button:hover { color: var(--ui-ink); border-color: var(--ui-ink); }

.solution-preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 11px;
}

.solution-preview-chips span {
  padding: 4px 7px;
  color: var(--ui-text-secondary);
  font-size: 9px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 999px;
}

.solution-preview-scroll {
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.solution-review-section {
  padding: 24px 27px;
  border-bottom: 1px solid var(--ui-divider);
}

.solution-review-title {
  display: flex;
  align-items: baseline;
  gap: 11px;
  margin-bottom: 17px;
}

.solution-review-title > span {
  color: var(--ui-accent);
  font: 700 10px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.solution-review-title h3 { margin: 0; font-size: 16px; font-weight: 560; }
.solution-review-title small { display: block; margin-top: 4px; color: var(--ui-text-tertiary); font-size: 10px; }

.solution-review-empty { margin: 0; color: var(--ui-text-tertiary); font-size: 10px; }

.solution-overview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 112px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-divider);
  border-radius: 14px;
}

.solution-overview-loading span {
  width: 7px;
  height: 7px;
  background: var(--ui-accent);
  border-radius: 50%;
  animation: admin-pulse 0.8s ease-in-out infinite alternate;
}

.solution-overview-list { display: grid; gap: 12px; }

.solution-overview-list .summary-node {
  margin: 0;
  background: var(--ui-surface);
  border-color: var(--ui-divider);
}

.solution-overview-list .summary-node-head { margin-bottom: 10px; }

.solution-overview-node-name {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.solution-overview-list .summary-label { width: 112px; }
.solution-overview-list .summary-val { white-space: normal; overflow-wrap: anywhere; }

.solution-overview-empty {
  margin: 0;
  padding: 7px 0;
  color: var(--ui-text-tertiary);
  font-size: 10px;
}

.solution-overview-list .summary-compute {
  color: var(--ui-text-tertiary);
  font-size: 10px;
  background: var(--ui-surface);
  border-color: var(--ui-divider);
}

.solution-overview-list .summary-compute strong {
  color: var(--ui-accent);
  font: 600 10px/1.4 "SF Mono", "Cascadia Code", ui-monospace, monospace;
}

.solution-custom-field-list { display: grid; gap: 10px; }

.solution-custom-field {
  padding: 14px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-divider);
  border-radius: 12px;
}

.solution-custom-field > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.solution-custom-field > header strong,
.solution-custom-field > header small { display: block; }
.solution-custom-field > header strong { font-size: 11px; font-weight: 600; }
.solution-custom-field > header small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 9px; }

.solution-custom-field > header > span {
  flex: 0 0 auto;
  padding: 4px 7px;
  color: var(--ui-text-secondary);
  font: 9px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 999px;
}

.solution-custom-field ul {
  display: grid;
  gap: 7px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.solution-custom-field li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  padding: 9px 10px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 8px;
}

.solution-binding-node,
.solution-binding-field { min-width: 0; }
.solution-binding-node strong,
.solution-binding-node small,
.solution-binding-field strong,
.solution-binding-field small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.solution-binding-node strong,
.solution-binding-field strong { font-size: 10px; font-weight: 580; }
.solution-binding-node small,
.solution-binding-field small { margin-bottom: 3px; color: var(--ui-text-tertiary); font: 8px/1.3 "SF Mono", "Cascadia Code", ui-monospace, monospace; }

.solution-binding-arrow {
  color: var(--ui-accent);
  font-size: 14px;
  text-align: center;
}

.solution-custom-field > p {
  margin: 11px 0 0;
  color: var(--ui-text-tertiary);
  font-size: 9px;
}

.solution-promotion-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 17px 27px;
  background: var(--ui-surface);
  border-top: 1px solid var(--ui-divider);
  box-shadow: 0 -12px 35px rgba(0, 0, 0, 0.04);
}

.solution-promotion-bar > label { display: flex; flex: 1; flex-direction: column; gap: 7px; }
.solution-promotion-bar > label > span { color: var(--ui-text-secondary); font-size: 10px; }
.solution-promotion-bar select { width: 100%; height: 38px; padding: 0 10px; color: var(--ui-ink); font: inherit; font-size: 10px; background: var(--ui-fill); border: 1px solid var(--ui-control-border); border-radius: var(--ui-radius-control); outline: none; }
.solution-promotion-bar select:focus { border-color: var(--ui-accent); box-shadow: 0 0 0 3px var(--ui-accent-ring); }
.solution-promotion-bar > div:not(.solution-promotion-complete) { display: flex; align-items: flex-end; flex-direction: column; gap: 8px; }
.solution-promotion-bar > div > small { color: var(--ui-text-tertiary); font-size: 9px; }
.solution-promotion-bar button { height: 38px; padding: 0 15px; color: #fff; font: inherit; font-size: 10px; background: var(--ui-ink); border: 0; border-radius: var(--ui-radius-control); cursor: pointer; }
.solution-promotion-bar button:disabled { color: var(--ui-text-tertiary); background: var(--ui-fill); border: 1px solid var(--ui-divider); cursor: not-allowed; }

.solution-promotion-complete { display: flex; align-items: center; gap: 10px; }
.solution-promotion-complete > span { display: grid; place-items: center; width: 30px; height: 30px; color: #fff; font-size: 11px; background: var(--ui-success); border-radius: 50%; }
.solution-promotion-complete strong,
.solution-promotion-complete small { display: block; }
.solution-promotion-complete strong { font-size: 11px; }
.solution-promotion-complete small { margin-top: 5px; color: var(--ui-text-tertiary); font-size: 9px; }

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

.dimension-toolbar-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}

.dimension-import-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 38px;
  padding: 0 13px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 560;
  background: var(--ui-fill);
  border: 1px solid var(--ui-control-border);
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.dimension-import-trigger:hover {
  border-color: var(--ui-ink);
  box-shadow: inset 2px 0 0 var(--ui-accent);
}

.dimension-import-trigger svg {
  width: 14px;
  height: 14px;
  color: var(--ui-accent);
}

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

.dimension-import-backdrop {
  position: fixed;
  z-index: 1350;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 17, 17, 0.28);
  backdrop-filter: blur(10px);
}

.dimension-import-dialog {
  display: flex;
  flex-direction: column;
  width: min(840px, 100%);
  max-height: min(880px, calc(100vh - 48px));
  color: var(--ui-ink);
  background: var(--ui-fill);
  border: 1px solid var(--ui-divider);
  border-radius: 20px;
  box-shadow: 0 30px 100px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.dimension-import-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 23px 26px 20px;
  border-bottom: 1px solid var(--ui-divider);
}

.dimension-import-head .admin-panel-index { margin-bottom: 7px; }
.dimension-import-head h2 {
  margin: 0;
  font-size: 23px;
  font-weight: 560;
  letter-spacing: -0.04em;
}

.dimension-import-head p:last-child {
  margin: 7px 0 0;
  color: var(--ui-text-secondary);
  font-size: 10px;
  line-height: 1.6;
}

.dimension-import-head > button {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  padding: 0;
  color: var(--ui-text-tertiary);
  font: 22px/1 inherit;
  background: transparent;
  border: 1px solid var(--ui-divider);
  border-radius: 50%;
  cursor: pointer;
}

.dimension-import-head > button:hover:not(:disabled) { color: var(--ui-ink); border-color: var(--ui-ink); }
.dimension-import-head > button:disabled { opacity: 0.35; }

.dimension-import-body {
  min-height: 0;
  padding: 20px 26px 24px;
  overflow-y: auto;
}

.dimension-import-target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--ui-divider);
}

.dimension-import-target small,
.dimension-import-target strong { display: block; }
.dimension-import-target small { color: var(--ui-text-tertiary); font-size: 9px; }
.dimension-import-target strong { margin-top: 4px; font: 600 11px/1.4 "SF Mono", "Cascadia Code", ui-monospace, monospace; }
.dimension-import-target p {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--ui-text-secondary);
  font-size: 10px;
}
.dimension-import-target p span { width: 6px; height: 6px; flex: 0 0 auto; background: var(--ui-accent); border-radius: 50%; }

.dimension-import-schema {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 17px 0;
}

.dimension-import-schema strong,
.dimension-import-schema small { display: block; }
.dimension-import-schema strong { font-size: 11px; }
.dimension-import-schema small { margin-top: 5px; color: var(--ui-text-tertiary); font-size: 9px; }
.dimension-import-schema ol {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dimension-import-schema li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 27px;
  padding: 0 8px;
  color: var(--ui-text-secondary);
  font-size: 9px;
  border: 1px solid var(--ui-divider);
  border-radius: 7px;
}
.dimension-import-schema li span { color: var(--ui-accent); font: 700 8px/1 "SF Mono", monospace; }

.dimension-import-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}

.dimension-import-dropzone {
  display: grid;
  grid-template-columns: 47px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 14px;
  color: var(--ui-ink);
  font: inherit;
  text-align: left;
  background: var(--ui-fill);
  border: 1px dashed color-mix(in srgb, var(--ui-ink) 34%, var(--ui-divider));
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.dimension-import-dropzone:hover:not(:disabled),
.dimension-import-dropzone.dragging {
  border-color: var(--ui-accent);
  box-shadow: inset 3px 0 0 var(--ui-accent);
}

.dimension-import-dropzone.loading { cursor: wait; opacity: 0.68; }
.dimension-import-file-mark {
  display: grid;
  place-items: center;
  width: 47px;
  height: 39px;
  color: var(--ui-accent);
  font: 700 8px/1 "SF Mono", monospace;
  letter-spacing: 0.08em;
  border: 1px solid color-mix(in srgb, var(--ui-accent) 38%, var(--ui-divider));
  border-radius: 8px;
}
.dimension-import-dropzone strong,
.dimension-import-dropzone small { display: block; }
.dimension-import-dropzone strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.dimension-import-dropzone small { margin-top: 5px; color: var(--ui-text-tertiary); font-size: 9px; }
.dimension-import-dropzone i { color: var(--ui-text-secondary); font-size: 9px; font-style: normal; }

.dimension-import-review {
  margin-top: 17px;
  padding-top: 17px;
  border-top: 1px solid var(--ui-divider);
}
.dimension-import-review > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 15px;
}
.dimension-import-review > header .admin-panel-index { margin-bottom: 5px; }
.dimension-import-review h3 { margin: 0; font-size: 16px; font-weight: 590; }
.dimension-import-review > header > span {
  padding: 5px 8px;
  color: var(--ui-danger);
  font-size: 9px;
  border: 1px solid color-mix(in srgb, var(--ui-danger) 30%, var(--ui-divider));
  border-radius: 999px;
}
.dimension-import-review > header > span.passed { color: var(--ui-success); border-color: color-mix(in srgb, var(--ui-success) 32%, var(--ui-divider)); }
.dimension-import-review > header > span.empty {
  color: var(--ui-accent);
  border-color: color-mix(in srgb, var(--ui-accent) 38%, var(--ui-divider));
}

.dimension-import-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--ui-divider);
  border-radius: 11px;
  overflow: hidden;
}
.dimension-import-metrics article { position: relative; min-height: 76px; padding: 13px 14px; border-left: 1px solid var(--ui-divider); }
.dimension-import-metrics article:first-child { border-left: 0; }
.dimension-import-metrics small { display: block; color: var(--ui-text-tertiary); font-size: 9px; }
.dimension-import-metrics strong { display: inline-block; margin-top: 9px; font: 600 22px/1 "SF Mono", monospace; letter-spacing: -0.04em; }
.dimension-import-metrics span { margin-left: 4px; color: var(--ui-text-tertiary); font-size: 9px; }

.dimension-import-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 18px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.dimension-import-checks li { display: flex; align-items: flex-start; gap: 9px; min-width: 0; padding: 7px 0; }
.dimension-import-checks li > span {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: var(--ui-danger);
  font: 700 9px/1 monospace;
  border: 1px solid color-mix(in srgb, var(--ui-danger) 34%, var(--ui-divider));
  border-radius: 50%;
}
.dimension-import-checks li.passed > span { color: var(--ui-success); border-color: color-mix(in srgb, var(--ui-success) 38%, var(--ui-divider)); }
.dimension-import-checks li.warning > span {
  color: var(--ui-accent);
  border-color: color-mix(in srgb, var(--ui-accent) 42%, var(--ui-divider));
}
.dimension-import-checks strong,
.dimension-import-checks small { display: block; }
.dimension-import-checks strong { font-size: 10px; }
.dimension-import-checks small { margin-top: 4px; overflow: hidden; color: var(--ui-text-tertiary); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }

.dimension-import-impact {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 10px;
  padding: 10px 11px;
  border-top: 1px solid var(--ui-divider);
}
.dimension-import-impact > span { width: 6px; height: 6px; flex: 0 0 auto; background: var(--ui-success); border-radius: 50%; }
.dimension-import-impact p { margin: 0; color: var(--ui-text-secondary); font-size: 9px; line-height: 1.6; }
.dimension-import-impact strong { color: var(--ui-ink); }

.dimension-import-skipped {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-divider);
}

.dimension-import-skipped > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.dimension-import-skipped > header strong,
.dimension-import-skipped > header small { display: block; }
.dimension-import-skipped > header strong { font-size: 11px; font-weight: 620; }
.dimension-import-skipped > header small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 9px; }
.dimension-import-skipped > header > span {
  flex: 0 0 auto;
  padding: 4px 7px;
  color: var(--ui-accent);
  font: 650 9px/1 "SF Mono", monospace;
  border: 1px solid color-mix(in srgb, var(--ui-accent) 36%, var(--ui-divider));
  border-radius: 999px;
}

.dimension-import-skipped-table {
  overflow: hidden;
  border: 1px solid var(--ui-divider);
  border-radius: 10px;
}

.dimension-import-skipped-head,
.dimension-import-skipped-row {
  display: grid;
  grid-template-columns: 62px 128px minmax(110px, 0.9fr) minmax(130px, 1fr) minmax(130px, 1fr);
  align-items: center;
  min-width: 0;
}

.dimension-import-skipped-head {
  min-height: 32px;
  color: var(--ui-text-tertiary);
  font-size: 8px;
  letter-spacing: 0.02em;
  border-bottom: 1px solid var(--ui-divider);
}

.dimension-import-skipped-row {
  min-height: 39px;
  color: var(--ui-text-secondary);
  font-size: 9px;
  border-top: 1px solid var(--ui-divider);
}

.dimension-import-skipped-row:first-of-type { border-top: 0; }
.dimension-import-skipped-head > span,
.dimension-import-skipped-row > span,
.dimension-import-skipped-row > strong {
  min-width: 0;
  padding: 0 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dimension-import-skipped-row > strong { color: var(--ui-ink); font-weight: 560; }
.dimension-import-row-number { color: var(--ui-text-tertiary); font-family: "SF Mono", monospace; }
.dimension-import-skip-reason { color: var(--ui-accent); font-weight: 590; }
.dimension-import-skip-reason.file { color: var(--ui-text-secondary); }

.dimension-import-skipped > footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 9px;
  color: var(--ui-text-tertiary);
  font-size: 8px;
}

.dimension-import-skipped > footer button {
  padding: 4px 7px;
  color: var(--ui-text-secondary);
  font: inherit;
  background: transparent;
  border: 1px solid var(--ui-control-border);
  border-radius: 999px;
  cursor: pointer;
}

.dimension-import-skipped > footer button:hover:not(:disabled) { color: var(--ui-ink); border-color: var(--ui-ink); }
.dimension-import-skipped > footer button:disabled { cursor: not-allowed; opacity: 0.35; }

.dimension-import-errors {
  margin-top: 10px;
  padding: 12px;
  background: color-mix(in srgb, var(--ui-danger) 4%, var(--ui-fill));
  border: 1px solid color-mix(in srgb, var(--ui-danger) 22%, var(--ui-divider));
  border-radius: 10px;
}
.dimension-import-errors > p { margin: 0 0 8px; color: var(--ui-danger); font-size: 10px; font-weight: 600; }
.dimension-import-errors ul { display: grid; gap: 6px; max-height: 130px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.dimension-import-errors li { display: grid; grid-template-columns: 135px minmax(0, 1fr); gap: 9px; font-size: 9px; }
.dimension-import-errors li span { color: var(--ui-text-tertiary); }
.dimension-import-errors li strong { overflow: hidden; color: var(--ui-text-secondary); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.dimension-import-errors > small { display: block; margin-top: 8px; color: var(--ui-text-tertiary); font-size: 8px; }

.dimension-import-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 15px 26px;
  background: var(--ui-surface);
  border-top: 1px solid var(--ui-divider);
}
.dimension-import-actions > div { min-width: 0; }
.dimension-import-actions strong,
.dimension-import-actions small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dimension-import-actions strong { font-size: 10px; }
.dimension-import-actions small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 8px; }
.dimension-import-actions > button:not(.admin-primary-button) {
  height: 36px;
  padding: 0 12px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 10px;
  background: transparent;
  border: 1px solid var(--ui-control-border);
  border-radius: 999px;
  cursor: pointer;
}
.dimension-import-actions .admin-primary-button { min-width: 145px; height: 36px; }
.dimension-import-actions button:disabled { cursor: not-allowed; opacity: 0.4; }

.dimension-import-complete {
  display: grid;
  place-items: center;
  min-height: 420px;
  padding: 44px 28px;
  text-align: center;
}
.dimension-import-complete > span {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 20px;
  color: #fff;
  font-size: 20px;
  background: var(--ui-success);
  border-radius: 50%;
}
.dimension-import-complete .admin-panel-index { margin-bottom: 8px; }
.dimension-import-complete h3 { margin: 0; font-size: 22px; font-weight: 570; letter-spacing: -0.04em; }
.dimension-import-complete > p:last-of-type { max-width: 520px; margin: 12px 0 0; color: var(--ui-text-secondary); font-size: 11px; line-height: 1.7; }
.dimension-import-complete > div { margin-top: 24px; }

.config-audit-panel {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid var(--ui-divider);
}

.release-history-panel .config-audit-panel {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.config-audit-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.config-audit-head h3 {
  margin: 4px 0 0;
  color: var(--ui-ink);
  font: 600 20px/1.2 "Avenir Next", "Segoe UI Variable", "PingFang SC", sans-serif;
  letter-spacing: -0.02em;
}

.config-audit-head p:not(.admin-panel-index) {
  margin: 7px 0 0;
  color: var(--ui-text-secondary);
  font-size: 11px;
}

.config-audit-tools,
.config-audit-scope {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.config-audit-scope {
  gap: 2px;
  padding: 3px;
  background: var(--ui-fill);
  border: 1px solid var(--ui-control-border);
  border-radius: 9px;
}

.config-audit-scope button,
.config-audit-refresh {
  height: 29px;
  padding: 0 10px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 10px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.config-audit-scope button.active {
  color: var(--ui-ink);
  background: var(--ui-surface);
  box-shadow: 0 1px 4px rgba(29, 29, 31, 0.1);
}

.config-audit-refresh {
  border: 1px solid var(--ui-control-border);
  border-radius: 999px;
}

.config-audit-refresh:hover:not(:disabled) { color: var(--ui-ink); border-color: var(--ui-ink); }
.config-audit-refresh:disabled { cursor: wait; opacity: 0.5; }

.config-audit-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 17px 0 9px;
  color: var(--ui-text-tertiary);
  font: 9px/1.4 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.03em;
}

.config-audit-summary span + span::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 3px;
  margin: 0 16px 2px 0;
  background: var(--ui-text-tertiary);
  border-radius: 50%;
  opacity: 0.45;
}

.config-audit-list {
  overflow: hidden;
  background: var(--ui-surface);
  border: 1px solid var(--ui-control-border);
  border-radius: 14px;
  box-shadow: 0 14px 40px rgba(29, 29, 31, 0.045);
  transition: opacity 160ms ease;
}

.config-audit-list.loading { opacity: 0.58; }

.config-audit-entry + .config-audit-entry {
  border-top: 1px solid var(--ui-divider);
}

.config-audit-entry.expanded {
  background: color-mix(in srgb, var(--ui-fill) 66%, var(--ui-surface));
}

.config-audit-entry-button {
  display: grid;
  grid-template-columns: 28px 76px minmax(210px, 1fr) 170px 76px 18px;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 66px;
  padding: 10px 15px;
  color: var(--ui-ink);
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.config-audit-entry-button:hover { background: color-mix(in srgb, var(--ui-accent) 2.5%, transparent); }

.config-audit-sequence {
  color: var(--ui-text-tertiary);
  font: 600 9px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.08em;
}

.config-audit-action,
.config-audit-operation,
.config-audit-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  border: 1px solid;
  border-radius: 999px;
}

.config-audit-action {
  min-width: 64px;
  height: 24px;
  padding: 0 7px;
  font-size: 9px;
  font-weight: 650;
}

.config-audit-action.created,
.config-audit-operation.created,
.config-audit-kind.added {
  color: #18794e;
  background: #edf9f2;
  border-color: #b7e4c8;
}

.config-audit-action.changed,
.config-audit-operation.updated,
.config-audit-operation.status_changed,
.config-audit-kind.changed {
  color: #8a5a00;
  background: #fff8e8;
  border-color: #edd9a3;
}

.config-audit-action.removed,
.config-audit-operation.deleted,
.config-audit-kind.removed {
  color: #b42318;
  background: #fff1f0;
  border-color: #f3c1bc;
}

.config-audit-action.published {
  color: var(--ui-ink);
  background: #f0f0f2;
  border-color: #c9c9cf;
}

.config-audit-identity,
.config-audit-actor {
  min-width: 0;
}

.config-audit-identity strong,
.config-audit-identity small,
.config-audit-actor strong,
.config-audit-actor small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-audit-identity strong,
.config-audit-actor strong { font-size: 11px; font-weight: 600; }
.config-audit-identity small,
.config-audit-actor small { margin-top: 5px; color: var(--ui-text-tertiary); font-size: 9px; }

.config-audit-count {
  color: var(--ui-text-secondary);
  font: 9px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  text-align: right;
}

.config-audit-chevron {
  color: var(--ui-text-tertiary);
  font-size: 16px;
  text-align: center;
  transition: transform 160ms ease;
}

.config-audit-entry.expanded .config-audit-chevron { transform: rotate(180deg); }

.config-audit-detail {
  margin: 0 15px 15px 131px;
  padding: 15px;
  background: var(--ui-surface);
  border: 1px solid var(--ui-divider);
  border-radius: 11px;
  animation: config-audit-reveal 180ms ease-out;
}

.config-audit-detail-intro {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 7px 16px;
  margin-bottom: 12px;
}

.config-audit-detail-intro p {
  margin: 0;
  color: var(--ui-ink);
  font-size: 12px;
  font-weight: 600;
}

.config-audit-detail-intro small { color: var(--ui-text-tertiary); font-size: 10px; }
.config-audit-group + .config-audit-group { margin-top: 15px; }

.config-audit-group > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1px 8px;
}

.config-audit-group > header strong { color: var(--ui-ink); font-size: 11px; }
.config-audit-group > header span { color: var(--ui-text-tertiary); font-size: 9px; }

.config-audit-row {
  overflow: hidden;
  border: 1px solid var(--ui-divider);
  border-radius: 9px;
}

.config-audit-row + .config-audit-row { margin-top: 8px; }

.config-audit-row-head {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 6px 9px;
  background: var(--ui-fill);
  border-bottom: 1px solid var(--ui-divider);
}

.config-audit-operation {
  height: 20px;
  padding: 0 6px;
  font-size: 8px;
}

.config-audit-row-head strong { color: var(--ui-ink); font-size: 10px; }
.config-audit-row-head code { margin-left: auto; color: var(--ui-text-tertiary); font-size: 8px; }

.config-audit-diff-head,
.config-audit-diff-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) 58px minmax(170px, 1fr) minmax(170px, 1fr);
  align-items: stretch;
}

.config-audit-diff-head {
  color: var(--ui-text-tertiary);
  font: 8px/1 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--ui-divider);
}

.config-audit-diff-head span,
.config-audit-diff-row > * { padding: 8px 9px; }
.config-audit-diff-head span + span,
.config-audit-diff-row > * + * { border-left: 1px solid var(--ui-divider); }
.config-audit-diff-row + .config-audit-diff-row { border-top: 1px solid var(--ui-divider); }
.config-audit-diff-row strong { color: var(--ui-ink); font-size: 9px; font-weight: 600; }

.config-audit-kind {
  align-self: center;
  justify-self: center;
  height: 19px;
  padding: 0 5px !important;
  font-size: 8px;
}

.config-audit-diff-row code {
  overflow: hidden;
  color: var(--ui-text-secondary);
  font: 9px/1.45 "SF Mono", "Cascadia Code", ui-monospace, monospace;
  text-overflow: ellipsis;
  white-space: pre-wrap;
  word-break: break-word;
}

.config-audit-diff-row code.before { background: color-mix(in srgb, #fff1f0 38%, var(--ui-surface)); }
.config-audit-diff-row code.after { background: color-mix(in srgb, #edf9f2 42%, var(--ui-surface)); }

.config-audit-no-diff,
.config-audit-empty {
  margin: 0;
  padding: 17px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
  text-align: center;
}

@keyframes config-audit-reveal {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.admin-toast-enter-active,
.admin-toast-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.admin-toast-enter-from,
.admin-toast-leave-to { opacity: 0; transform: translateY(-5px); }

.admin-audit-reveal-enter-active,
.admin-audit-reveal-leave-active {
  max-height: 620px;
  overflow: hidden;
  transition: max-height 220ms ease, opacity 160ms ease;
}

.admin-management-surface {
  display: grid;
  grid-template-columns: minmax(315px, 360px) minmax(0, 1fr);
  min-height: 650px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--ui-divider);
  border-radius: 16px;
  animation: admin-view-enter 220ms ease-out both;
}

.management-directory {
  display: flex;
  min-width: 0;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid var(--ui-divider);
}

.directory-search {
  position: relative;
  padding: 18px 18px 14px;
}

.directory-search > svg {
  position: absolute;
  top: 29px;
  left: 31px;
  width: 14px;
  height: 14px;
  color: var(--ui-text-tertiary);
  pointer-events: none;
}

.directory-search input {
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  padding: 0 36px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 11px;
  background: #fff;
  border: 1px solid var(--ui-control-border);
  border-radius: 9px;
  outline: none;
}

.directory-search input:focus {
  border-color: var(--ui-ink);
  box-shadow: 0 0 0 3px rgba(17, 17, 17, 0.06);
}

.directory-column-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 0 20px 11px;
  color: var(--ui-text-tertiary);
  font-size: 9px;
}

.directory-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  border-top: 1px solid var(--ui-divider);
  scrollbar-width: thin;
}

.directory-user {
  position: relative;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 86px 62px;
  width: 100%;
  min-height: 66px;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  color: var(--ui-ink);
  font: inherit;
  text-align: left;
  background: #fff;
  border: 0;
  border-bottom: 1px solid var(--ui-divider);
  cursor: pointer;
  transition: background 150ms ease;
}

.directory-user::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: transparent;
  content: "";
}

.directory-user:hover { background: #fff; box-shadow: inset 0 0 0 1px var(--ui-divider); }
.directory-user.active { background: #fff; box-shadow: inset 0 0 0 1px var(--ui-ink); }
.directory-user.active::before { background: var(--ui-ink); }

.directory-avatar {
  width: 34px;
  height: 34px;
  font-size: 10px;
}

.directory-user-copy { min-width: 0; }
.directory-user-copy strong,
.directory-user-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.directory-user-copy strong { font-size: 11px; font-weight: 620; }
.directory-user-copy small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 9px; }
.directory-user-role { overflow: hidden; color: var(--ui-text-secondary); font-size: 9px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.directory-user-status { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; color: var(--ui-text-tertiary); font-size: 9px; white-space: nowrap; }
.directory-user-status i,
.account-live-status i { width: 6px; height: 6px; flex: 0 0 auto; background: #b6b6b3; border-radius: 50%; }
.directory-user-status.enabled,
.account-live-status.enabled { color: var(--ui-success); }
.directory-user-status.enabled i,
.account-live-status.enabled i { background: var(--ui-success); }

.directory-empty,
.management-detail-empty {
  margin: 0;
  color: var(--ui-text-tertiary);
  font-size: 11px;
  text-align: center;
}
.directory-empty { padding: 42px 20px; }
.management-detail-empty { display: grid; place-items: center; min-height: 650px; background: #fff; }

.directory-footer {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 18px;
  color: var(--ui-text-secondary);
  font-size: 9px;
  border-top: 1px solid var(--ui-divider);
}
.directory-footer small { color: var(--ui-text-tertiary); font-size: 8px; }

.management-detail {
  min-width: 0;
  background: #fff;
}

.management-detail-head,
.plan-data-head {
  display: flex;
  min-height: 88px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 17px 24px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--ui-divider);
}

.management-identity { display: flex; min-width: 0; align-items: center; gap: 12px; }
.management-avatar { width: 40px; height: 40px; flex: 0 0 auto; font-size: 12px; }
.management-identity > div { min-width: 0; }
.management-identity .admin-panel-index { margin-bottom: 5px; font-size: 7px; }
.management-identity h2 { margin: 0; overflow: hidden; font-size: 17px; font-weight: 650; letter-spacing: -.035em; text-overflow: ellipsis; white-space: nowrap; }
.management-identity small { display: block; margin-top: 4px; color: var(--ui-text-tertiary); font-size: 9px; }
.account-live-status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; padding: 6px 9px; color: var(--ui-text-tertiary); font-size: 9px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 999px; }

.account-settings-form { display: flex; min-height: 560px; flex-direction: column; }
.settings-block { padding: 20px 24px; border-bottom: 1px solid var(--ui-divider); }
.settings-block-title { display: flex; align-items: flex-start; gap: 11px; margin-bottom: 16px; }
.settings-block-title > span { padding-top: 3px; color: var(--ui-accent); font: 700 9px/1 "SF Mono", "Cascadia Code", monospace; }
.settings-block-title h3 { margin: 0; font-size: 13px; font-weight: 650; }
.settings-block-title small { display: block; margin-top: 4px; color: var(--ui-text-tertiary); font-size: 9px; }

.settings-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 150px; gap: 12px; }
.settings-fields label,
.security-actions label { display: flex; min-width: 0; flex-direction: column; gap: 7px; }
.settings-fields label > span,
.security-actions label > span { color: var(--ui-text-secondary); font-size: 9px; }
.settings-fields input,
.settings-fields select,
.security-actions input {
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  padding: 0 10px;
  color: var(--ui-ink);
  font: inherit;
  font-size: 10px;
  background: #fff;
  border: 1px solid var(--ui-control-border);
  border-radius: 8px;
  outline: none;
}
.settings-fields input:focus,
.settings-fields select:focus,
.security-actions input:focus { border-color: var(--ui-ink); box-shadow: 0 0 0 3px rgba(17, 17, 17, .06); }
.settings-fields input:disabled,
.settings-fields select:disabled { color: var(--ui-text-tertiary); cursor: not-allowed; }

.role-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; overflow: hidden; background: #fff; border: 1px solid var(--ui-ink); border-radius: 10px; }
.role-options label { display: flex; min-width: 0; min-height: 56px; align-items: flex-start; gap: 9px; padding: 11px 13px; color: var(--ui-ink); background: #fff; border-left: 1px solid var(--ui-ink); cursor: pointer; transition: color 150ms ease, background 150ms ease; }
.role-options label:first-child { border-left: 0; }
.role-options label:hover:not(.active) { box-shadow: inset 0 -2px 0 var(--ui-ink); }
.role-options label.active { color: #fff; background: var(--ui-ink); }
.role-options input { margin: 2px 0 0; accent-color: var(--ui-ink); }
.role-options label.active input { accent-color: #fff; }
.role-options strong,
.role-options small { display: block; }
.role-options strong { font-size: 10px; font-weight: 650; }
.role-options small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 8px; line-height: 1.45; }
.role-options label.active small { color: rgba(255, 255, 255, .66); }

.permission-list { display: grid; margin-top: 13px; background: #fff; border: 1px solid var(--ui-ink); border-radius: 10px; }
.permission-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; min-height: 45px; align-items: center; gap: 10px; padding: 7px 12px; background: #fff; border-top: 1px solid var(--ui-divider); }
.permission-row:first-child { border-top: 0; }
.permission-row > svg { width: 15px; height: 15px; color: var(--ui-text-secondary); }
.permission-row strong,
.permission-row small { display: block; }
.permission-row strong { font-size: 10px; font-weight: 600; }
.permission-row small { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 8px; }
.permission-access { display: inline-flex; min-width: 58px; align-items: center; justify-content: flex-end; gap: 5px; color: var(--ui-text-secondary); font-size: 8px; font-weight: 550; }
.permission-access svg { width: 13px; height: 13px; color: var(--ui-ink); }
.permission-access.active { color: var(--ui-ink); font-weight: 650; }
.permission-access:not(.active) svg { color: var(--ui-text-tertiary); }

.security-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; background: #fff; border: 1px solid var(--ui-ink); border-radius: 9px; }
.security-summary > div { min-width: 0; padding: 10px 12px; border-left: 1px solid var(--ui-divider); }
.security-summary > div:first-child { border-left: 0; }
.security-summary small,
.security-summary strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.security-summary small { color: var(--ui-text-tertiary); font-size: 8px; }
.security-summary strong { margin-top: 5px; color: var(--ui-text-secondary); font-size: 9px; font-weight: 550; }
.security-actions { display: grid; grid-template-columns: minmax(170px, 1fr) auto auto auto; align-items: end; gap: 8px; margin-top: 12px; }
.security-actions button { height: 36px; padding: 0 11px; color: var(--ui-ink); font: inherit; font-size: 9px; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 8px; cursor: pointer; white-space: nowrap; }
.security-actions button:hover:not(:disabled) { border-color: var(--ui-ink); }
.security-actions button.danger { color: var(--ui-danger); border-color: color-mix(in srgb, var(--ui-danger) 30%, var(--ui-control-border)); }
.security-actions button:disabled { cursor: not-allowed; opacity: .45; }

.inline-delete-zone { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 17px 24px 0; padding: 12px 14px; background: color-mix(in srgb, var(--ui-danger) 4%, #fff); border: 1px solid color-mix(in srgb, var(--ui-danger) 18%, var(--ui-divider)); border-radius: 9px; }
.inline-delete-zone strong { color: var(--ui-danger); font-size: 10px; }
.inline-delete-zone p { margin: 4px 0 0; color: var(--ui-text-tertiary); font-size: 8px; }
.inline-delete-zone button { height: 32px; flex: 0 0 auto; padding: 0 11px; color: var(--ui-danger); font: inherit; font-size: 9px; background: #fff; border: 1px solid color-mix(in srgb, var(--ui-danger) 30%, var(--ui-divider)); border-radius: 8px; cursor: pointer; }

.account-settings-footer { display: flex; align-items: center; justify-content: flex-end; gap: 9px; margin-top: auto; padding: 17px 24px; border-top: 1px solid var(--ui-divider); }
.account-settings-footer button { min-width: 92px; height: 36px; padding: 0 14px; color: var(--ui-text-secondary); font: inherit; font-size: 10px; background: #fff; border: 1px solid var(--ui-control-border); border-radius: 8px; cursor: pointer; }
.account-settings-footer button.primary { min-width: 120px; color: #fff; font-weight: 600; background: var(--ui-ink); border-color: var(--ui-ink); }
.account-settings-footer button:disabled { cursor: wait; opacity: .5; }

.plan-directory-user { grid-template-columns: 38px minmax(0, 1fr) auto; }
.plan-user-counts { color: var(--ui-text-secondary); font: 9px/1 "SF Mono", "Cascadia Code", monospace; white-space: nowrap; }
.plan-directory-footer { min-height: 62px; }
.directory-pagination { display: flex; align-items: center; gap: 4px; }
.directory-pagination button { width: 25px; height: 25px; padding: 0; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 7px; cursor: pointer; }
.directory-pagination button.active { color: #fff; background: var(--ui-ink); border-color: var(--ui-ink); }
.directory-pagination button:disabled { cursor: default; opacity: .35; }

.plan-data-head { min-height: 96px; }
.plan-count-summary { display: flex; flex: 0 0 auto; align-items: center; gap: 7px; }
.plan-count-summary span { padding: 7px 9px; color: var(--ui-text-tertiary); font-size: 8px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 8px; }
.plan-count-summary strong { margin-right: 3px; color: var(--ui-ink); font-size: 11px; }
.plan-data-tabs { display: flex; gap: 5px; padding: 11px 20px; border-bottom: 1px solid var(--ui-divider); }
.plan-data-tabs button { height: 32px; padding: 0 12px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: transparent; border: 0; border-radius: 8px; cursor: pointer; }
.plan-data-tabs button:hover { color: var(--ui-ink); background: #fff; box-shadow: inset 0 0 0 1px var(--ui-ink); }
.plan-data-tabs button.active { color: #fff; background: var(--ui-ink); }
.plan-data-tabs span { margin-left: 6px; opacity: .65; }

.plan-data-loading { display: flex; min-height: 420px; align-items: center; justify-content: center; gap: 9px; color: var(--ui-text-tertiary); font-size: 10px; }
.plan-data-loading span { width: 7px; height: 7px; background: var(--ui-accent); border-radius: 50%; animation: admin-pulse .8s ease-in-out infinite alternate; }
.plan-solution-view { padding: 0 20px 18px; }
.plan-table-head,
.plan-solution-row { display: grid; grid-template-columns: minmax(220px, 1.6fr) 58px 70px 130px minmax(205px, auto); align-items: center; gap: 12px; }
.plan-table-head { min-height: 42px; padding: 0 12px; color: var(--ui-text-tertiary); font-size: 8px; border-bottom: 1px solid var(--ui-divider); }
.plan-folder-group { border-bottom: 1px solid var(--ui-divider); }
.plan-folder-head { display: flex; width: 100%; min-height: 47px; align-items: center; gap: 9px; padding: 0 8px; color: var(--ui-ink); font: inherit; text-align: left; background: #fff; border: 0; cursor: pointer; }
.plan-folder-head:hover { background: #fafaf9; }
.plan-folder-head svg { width: 15px; height: 15px; color: var(--ui-text-secondary); }
.plan-folder-head svg:first-child { width: 13px; transition: transform 160ms ease; }
.plan-folder-head svg.collapsed { transform: rotate(-90deg); }
.plan-folder-head strong { font-size: 11px; font-weight: 650; }
.plan-folder-head small { color: var(--ui-text-tertiary); font-size: 8px; }
.plan-folder-rows { padding-left: 30px; }
.plan-solution-row { min-height: 58px; padding: 8px 10px; border-top: 1px solid var(--ui-divider); }
.plan-solution-row > div:first-child { display: flex; min-width: 0; align-items: center; gap: 9px; }
.plan-solution-row > div:first-child > svg { width: 15px; height: 15px; flex: 0 0 auto; color: var(--ui-text-tertiary); }
.plan-solution-row strong,
.plan-solution-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-solution-row strong { font-size: 10px; font-weight: 560; }
.plan-solution-row small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 8px; }
.plan-solution-row > span,
.plan-solution-row time { color: var(--ui-text-secondary); font-size: 9px; }
.plan-solution-row .plan-status { color: var(--ui-text-tertiary); }
.plan-solution-row .plan-status.published { color: var(--ui-success); font-weight: 600; }
.plan-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 5px; }
.plan-row-actions button { height: 27px; padding: 0 8px; color: var(--ui-text-secondary); font: inherit; font-size: 8px; background: #fff; border: 1px solid var(--ui-divider); border-radius: 7px; cursor: pointer; white-space: nowrap; }
.plan-row-actions button:first-child { color: var(--ui-ink); }
.plan-row-actions button:hover:not(:disabled) { border-color: var(--ui-ink); }
.plan-row-actions button:disabled { color: var(--ui-success); cursor: default; opacity: .7; }
.plan-data-total { padding: 15px 10px 0; color: var(--ui-text-secondary); font-size: 9px; }
.plan-data-empty { margin: 0; padding: 54px 20px; color: var(--ui-text-tertiary); font-size: 10px; text-align: center; }

.plan-simple-list { padding: 0 20px 18px; }
.plan-simple-list article { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; min-height: 58px; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--ui-divider); }
.plan-simple-list article > svg { width: 15px; height: 15px; color: var(--ui-text-tertiary); }
.plan-simple-list strong,
.plan-simple-list small { display: block; }
.plan-simple-list strong { font-size: 10px; font-weight: 600; }
.plan-simple-list small { margin-top: 4px; color: var(--ui-text-tertiary); font-size: 8px; }
.plan-simple-list time,
.task-status { color: var(--ui-text-secondary); font-size: 9px; }
.task-data-list article { grid-template-columns: 24px minmax(0, 1fr) 80px auto; }

.admin-audit-reveal-enter-from,
.admin-audit-reveal-leave-to {
  max-height: 0;
  opacity: 0;
}

@keyframes admin-pulse {
  from { transform: scale(0.8); opacity: 0.45; }
  to { transform: scale(1.1); opacity: 1; }
}

/* Functional system-management shell, organized by real administration tasks. */
.admin-center {
  padding: 0;
  background: #fff;
}

.admin-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: 100%;
}

.admin-navigation {
  position: sticky;
  top: 0;
  display: flex;
  height: 100%;
  min-height: 690px;
  flex-direction: column;
  align-self: start;
  padding: 24px 16px 20px;
  box-sizing: border-box;
  background: #fff;
  border-right: 1px solid var(--ui-divider);
}

.admin-navigation-title {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 7px 24px;
}

.admin-navigation-title > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: #fff;
  font: 700 9px/1 "SF Mono", "Cascadia Code", monospace;
  letter-spacing: .08em;
  background: var(--ui-ink);
  border-radius: 10px;
}

.admin-navigation-title strong,
.admin-navigation-title small { display: block; }
.admin-navigation-title strong { font-size: 13px; font-weight: 650; letter-spacing: -.02em; }
.admin-navigation-title small { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 9px; }

.admin-navigation nav { display: grid; gap: 5px; }
.admin-navigation nav button {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 42px;
  padding: 0 11px;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 520;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, transform 150ms ease;
}

.admin-navigation nav button:hover { color: var(--ui-ink); background: #f6f6f5; transform: translateX(2px); }
.admin-navigation nav button.active { color: var(--ui-ink); font-weight: 650; background: #f0f0ef; }
.admin-navigation nav button > span { color: #aaa9a6; font: 700 8px/1 "SF Mono", "Cascadia Code", monospace; letter-spacing: .06em; }
.admin-navigation nav button.active > span { color: var(--ui-accent); }
.admin-navigation nav button > i {
  display: grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  padding: 0 4px;
  color: #fff;
  font-size: 8px;
  font-style: normal;
  background: var(--ui-accent);
  border-radius: 999px;
}

.admin-navigation-foot {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: auto;
  padding: 14px 10px 0;
  border-top: 1px solid var(--ui-divider);
}
.admin-navigation-foot > i { width: 7px; height: 7px; flex: 0 0 auto; background: #c9c9c7; border-radius: 50%; box-shadow: 0 0 0 4px #f1f1ef; }
.admin-navigation-foot > i.healthy { background: var(--ui-success); box-shadow: 0 0 0 4px #e9f7ed; }
.admin-navigation-foot strong,
.admin-navigation-foot small { display: block; }
.admin-navigation-foot strong { font-size: 9px; font-weight: 600; }
.admin-navigation-foot small { margin-top: 3px; color: var(--ui-text-tertiary); font-size: 8px; }

.admin-workspace {
  min-width: 0;
  padding: 30px clamp(24px, 3vw, 48px) 60px;
  box-sizing: border-box;
}

.admin-hero,
.admin-message,
.admin-panels,
.dimension-panel,
.admin-audit-bottom,
.admin-dashboard,
.admin-section-stack {
  width: 100%;
  max-width: 1450px;
  box-sizing: border-box;
  margin-right: auto;
  margin-left: auto;
}

.admin-hero { align-items: center; margin-bottom: 24px; }
.admin-eyebrow { margin-bottom: 7px; font-size: 8px; }
.admin-hero h1 { font-size: clamp(27px, 3vw, 37px); font-weight: 650; letter-spacing: -.045em; }
.admin-lede { margin-top: 8px; font-size: 11px; line-height: 1.6; }
.admin-refresh { height: 32px; padding: 0 12px; font-size: 10px; background: #fff; }

.admin-dashboard { animation: admin-view-enter 240ms ease-out both; }
.admin-health-strip {
  display: grid;
  grid-template-columns: 1fr 1fr 1.25fr minmax(170px, .9fr);
  min-height: 70px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--ui-divider);
  border-radius: 13px;
}

.admin-health-strip > div {
  display: grid;
  grid-template-columns: 32px minmax(0, auto) 1fr;
  grid-template-rows: auto auto;
  align-content: center;
  column-gap: 10px;
  padding: 14px 18px;
  border-right: 1px solid var(--ui-divider);
}
.admin-health-strip small { align-self: end; color: var(--ui-text-tertiary); font-size: 8px; }
.admin-health-strip strong { align-self: start; margin-top: 3px; font-size: 10px; font-weight: 650; }
.admin-health-strip strong.healthy { color: var(--ui-success); }
.admin-health-strip time { align-self: center; justify-self: end; padding: 0 18px; color: var(--ui-text-tertiary); font-size: 9px; }
.health-icon { grid-row: 1 / 3; align-self: center; width: 28px; height: 28px; background: #f4f4f2; border: 1px solid #ececea; border-radius: 9px; }
.health-icon::before,
.health-icon::after { display: block; margin: auto; content: ""; }
.health-icon.database::before { width: 12px; height: 6px; margin-top: 7px; border: 1.5px solid var(--ui-success); border-radius: 50%; }
.health-icon.database::after { width: 12px; height: 7px; margin-top: -1px; border: 1.5px solid var(--ui-success); border-top: 0; border-radius: 0 0 7px 7px; }
.health-icon.release::before { width: 11px; height: 12px; margin-top: 7px; border: 1.5px solid var(--ui-ink); border-radius: 2px; }
.health-icon.release::after { width: 5px; height: 1px; margin-top: -8px; background: var(--ui-ink); box-shadow: 0 4px var(--ui-ink); }
.health-icon.link::before { width: 13px; height: 7px; margin-top: 9px; border: 1.5px solid var(--ui-accent); border-radius: 999px; transform: rotate(-28deg); }

.admin-dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.72fr) minmax(280px, .85fr); gap: 18px; margin-top: 18px; }
.admin-task-board,
.admin-permission-card,
.admin-recent-activity {
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--ui-divider);
  border-radius: 14px;
}
.admin-task-board > header,
.admin-recent-activity > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 19px 21px 16px;
  border-bottom: 1px solid var(--ui-divider);
}
.admin-task-board h2,
.admin-permission-card h2,
.admin-recent-activity h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -.035em; }
.admin-task-board .admin-panel-index,
.admin-permission-card .admin-panel-index,
.admin-recent-activity .admin-panel-index { margin-bottom: 5px; font-size: 7px; }
.admin-task-board > header > span { color: var(--ui-text-tertiary); font-size: 9px; }
.admin-task-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  width: 100%;
  min-height: 76px;
  align-items: center;
  gap: 12px;
  padding: 12px 21px;
  color: var(--ui-ink);
  font: inherit;
  text-align: left;
  background: #fff;
  border: 0;
  border-top: 1px solid var(--ui-divider);
  cursor: pointer;
  transition: background 150ms ease;
}
.admin-task-board > header + .admin-task-row { border-top: 0; }
.admin-task-row:hover { background: #faf9f7; }
.admin-task-mark { display: grid; width: 34px; height: 34px; place-items: center; color: var(--ui-accent); font: 700 8px/1 "SF Mono", monospace; background: #fff4ef; border-radius: 11px; }
.admin-task-copy strong,
.admin-task-copy small { display: block; }
.admin-task-copy strong { font-size: 11px; font-weight: 650; }
.admin-task-copy strong i { margin-left: 7px; padding: 3px 7px; color: var(--ui-text-secondary); font-size: 8px; font-style: normal; font-weight: 500; background: #f2f2f0; border-radius: 999px; }
.admin-task-copy small { margin-top: 6px; color: var(--ui-text-tertiary); font-size: 9px; }
.admin-task-action { display: inline-flex; align-items: center; gap: 7px; color: var(--ui-text-secondary); font-size: 9px; }
.admin-task-action > i { width: 5px; height: 5px; background: var(--ui-accent); border-radius: 50%; }
.admin-task-action b { color: var(--ui-text-tertiary); font-size: 16px; font-weight: 400; }
.admin-task-empty { margin: 0; padding: 28px 21px; color: var(--ui-text-tertiary); font-size: 10px; text-align: center; }

.admin-permission-card { padding: 20px 21px; }
.admin-owner-identity { display: flex; align-items: center; gap: 12px; margin: 20px 0 17px; padding: 15px; background: #f7f7f5; border: 1px solid #eeeeeb; border-radius: 11px; }
.admin-owner-identity > span { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; color: #fff; font-size: 12px; font-weight: 700; background: var(--ui-ink); border-radius: 50%; }
.admin-owner-identity small,
.admin-owner-identity strong,
.admin-owner-identity em { display: block; }
.admin-owner-identity small { color: var(--ui-text-tertiary); font-size: 8px; }
.admin-owner-identity strong { display: inline; margin-top: 3px; font-size: 17px; letter-spacing: -.03em; }
.admin-owner-identity em { display: inline; margin-left: 6px; color: var(--ui-text-secondary); font-size: 8px; font-style: normal; }
.admin-permission-card ul { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.admin-permission-card li { display: flex; align-items: flex-start; gap: 8px; color: var(--ui-text-secondary); font-size: 9px; line-height: 1.5; }
.admin-permission-card li i { display: grid; width: 16px; height: 16px; flex: 0 0 auto; place-items: center; color: var(--ui-success); font-size: 8px; font-style: normal; border: 1px solid #d9eee0; border-radius: 50%; }
.admin-permission-card > button { width: 100%; height: 35px; margin-top: 21px; color: #fff; font: inherit; font-size: 10px; font-weight: 600; background: var(--ui-ink); border: 0; border-radius: 9px; cursor: pointer; }
.admin-permission-card > button:hover { background: #313133; }

.admin-recent-activity { margin-top: 18px; }
.admin-recent-activity > header > button { color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: none; border: 0; cursor: pointer; }
.admin-activity-head,
.admin-activity-row { display: grid; grid-template-columns: 190px 150px minmax(0, 1fr) 80px; align-items: center; min-height: 40px; padding: 0 21px; }
.admin-activity-head { color: var(--ui-text-tertiary); font-size: 8px; background: #fafaf9; }
.admin-activity-row { font-size: 9px; border-top: 1px solid var(--ui-divider); }
.admin-activity-row time { color: var(--ui-text-secondary); }
.admin-activity-row strong { font-weight: 550; }
.activity-success { display: inline-flex; align-items: center; gap: 6px; color: var(--ui-success); }
.activity-success i { width: 6px; height: 6px; background: var(--ui-success); border-radius: 50%; }

.admin-quick-links { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 18px; overflow: hidden; background: #fff; border: 1px solid var(--ui-divider); border-radius: 12px; }
.admin-quick-links button { display: flex; min-height: 50px; align-items: center; justify-content: center; gap: 12px; color: var(--ui-text-secondary); font: inherit; font-size: 9px; background: #fff; border: 0; border-left: 1px solid var(--ui-divider); cursor: pointer; }
.admin-quick-links button:first-child { border-left: 0; }
.admin-quick-links button:hover { color: var(--ui-ink); background: #fafaf9; }
.admin-quick-links span { font-size: 15px; }

.admin-section-stack { display: grid; gap: 18px; animation: admin-view-enter 220ms ease-out both; }
.admin-log-switcher { display: inline-flex; width: fit-content; padding: 3px; background: #eeeef0; border-radius: 10px; }
.admin-log-switcher button { height: 32px; padding: 0 13px; color: var(--ui-text-secondary); font: inherit; font-size: 10px; background: transparent; border: 0; border-radius: 8px; cursor: pointer; }
.admin-log-switcher button.active { color: #fff; background: var(--ui-ink); }
.admin-log-switcher span { margin-left: 4px; opacity: .7; }
.admin-audit-bottom { margin-top: 0; }

/* System management uses white structure and reserves orange for navigation and state signals. */
.admin-center {
  --ui-fill: #fff;
  --ui-surface: #fff;
}

.admin-navigation nav button:hover,
.admin-navigation nav button.active {
  background: #fff;
  transform: none;
}

.admin-navigation nav button:hover {
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--ui-accent) 42%, transparent);
}

.admin-navigation nav button.active {
  box-shadow: inset 3px 0 0 var(--ui-accent);
}

.invite-created,
.config-release {
  background: #fff;
  border-color: var(--ui-divider);
  box-shadow: inset 3px 0 0 var(--ui-accent);
}

.role-chip,
.audit-action,
.config-version,
.dimension-filters input,
.dimension-filters select,
.dimension-filters > button,
.dimension-editor,
.dimension-fields input,
.dimension-table-wrap,
.dimension-pagination-summary select,
.config-release-actions input,
.config-discard,
.config-audit-list,
.config-audit-detail,
.config-audit-row-head,
.admin-owner-identity,
.admin-activity-head,
.admin-task-copy strong i,
.health-icon {
  background: #fff;
}

.dimension-type:hover,
.dimension-type.active {
  background: #fff;
}

.dimension-type.active {
  border-color: var(--ui-divider);
  box-shadow: inset 3px 0 0 var(--ui-accent);
}

.config-audit-scope,
.admin-log-switcher {
  background: #fff;
  border: 1px solid var(--ui-control-border);
}

.config-audit-scope button.active {
  color: #fff;
  background: var(--ui-ink);
  box-shadow: inset 2px 0 0 var(--ui-accent);
}

.config-audit-entry.expanded,
.config-audit-entry-button:hover,
.admin-task-row:hover,
.admin-quick-links button:hover,
.plan-folder-head:hover {
  background: #fff;
}

.config-audit-entry.expanded,
.plan-folder-head:hover {
  box-shadow: inset 2px 0 0 var(--ui-accent);
}

.admin-task-mark {
  color: var(--ui-accent);
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ui-accent) 35%, var(--ui-divider));
}

@keyframes admin-view-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1200px) {
  .admin-shell { grid-template-columns: 198px minmax(0, 1fr); }
  .admin-workspace { padding-right: 24px; padding-left: 24px; }
  .admin-management-surface { grid-template-columns: minmax(275px, 310px) minmax(0, 1fr); }
  .settings-fields { grid-template-columns: 1fr 1fr; }
  .settings-status-field { grid-column: 1 / -1; }
  .security-actions { grid-template-columns: 1fr 1fr; }
  .security-actions label { grid-column: 1 / -1; }
  .plan-table-head,
  .plan-solution-row { grid-template-columns: minmax(180px, 1.5fr) 48px 62px 100px minmax(170px, auto); gap: 8px; }
  .admin-dashboard-grid { grid-template-columns: 1fr; }
  .admin-health-strip { grid-template-columns: repeat(3, 1fr); }
  .admin-health-strip time { grid-column: 1 / -1; justify-self: stretch; padding: 9px 18px; text-align: right; border-top: 1px solid var(--ui-divider); }
  .admin-panels { grid-template-columns: 1fr; }
  .config-release { align-items: center; flex-direction: column; }
  .config-release-actions { width: 100%; justify-content: center; }
  .config-note-field { width: auto; flex: 1; }
  .config-release-actions input { width: 100%; }
}

@media (max-width: 700px) {
  .admin-shell { display: block; }
  .admin-navigation { position: static; min-height: 0; height: auto; padding: 12px 15px; border-right: 0; border-bottom: 1px solid var(--ui-divider); }
  .admin-navigation-title,
  .admin-navigation-foot { display: none; }
  .admin-navigation nav { display: flex; overflow-x: auto; scrollbar-width: none; }
  .admin-navigation nav::-webkit-scrollbar { display: none; }
  .admin-navigation nav button { display: flex; min-width: max-content; min-height: 35px; gap: 7px; padding: 0 10px; }
  .admin-workspace { padding: 22px 15px 45px; }
  .admin-health-strip { grid-template-columns: 1fr; }
  .admin-health-strip > div { border-right: 0; border-bottom: 1px solid var(--ui-divider); }
  .admin-health-strip time { grid-column: auto; text-align: left; }
  .admin-activity-head,
  .admin-activity-row { grid-template-columns: 1fr 1fr; gap: 5px 14px; padding-top: 9px; padding-bottom: 9px; }
  .admin-activity-head { display: none; }
  .admin-quick-links { grid-template-columns: 1fr; }
  .admin-quick-links button { border-top: 1px solid var(--ui-divider); border-left: 0; }
  .admin-quick-links button:first-child { border-top: 0; }
  .admin-hero { align-items: flex-start; flex-direction: column; }
  .admin-refresh { align-self: flex-start; }
  .admin-management-surface { grid-template-columns: 1fr; min-height: 0; }
  .management-directory { max-height: 340px; border-right: 0; border-bottom: 1px solid var(--ui-divider); }
  .management-detail-empty { min-height: 240px; }
  .management-detail-head,
  .plan-data-head { align-items: flex-start; flex-direction: column; }
  .role-options,
  .security-summary { grid-template-columns: 1fr; }
  .security-summary > div { border-top: 1px solid var(--ui-divider); border-left: 0; }
  .security-summary > div:first-child { border-top: 0; }
  .inline-delete-zone { align-items: flex-start; flex-direction: column; }
  .plan-count-summary { flex-wrap: wrap; }
  .plan-table-head { display: none; }
  .plan-folder-rows { padding-left: 0; }
  .plan-solution-row { grid-template-columns: 1fr auto auto; }
  .plan-solution-row > div:first-child { grid-column: 1 / -1; }
  .plan-solution-row time { justify-self: end; }
  .plan-row-actions { grid-column: 1 / -1; justify-content: flex-start; }
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
  .dimension-toolbar-actions { align-self: flex-start; }
  .dimension-import-backdrop { padding: 12px; }
  .dimension-import-dialog { max-height: calc(100vh - 24px); border-radius: 16px; }
  .dimension-import-head,
  .dimension-import-body,
  .dimension-import-actions { padding-right: 18px; padding-left: 18px; }
  .dimension-import-schema { grid-template-columns: 1fr; gap: 10px; }
  .dimension-import-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dimension-import-metrics article:nth-child(3) { border-top: 1px solid var(--ui-divider); border-left: 0; }
  .dimension-import-metrics article:nth-child(4) { border-top: 1px solid var(--ui-divider); }
  .dimension-import-skipped-table { overflow-x: auto; }
  .dimension-import-skipped-head,
  .dimension-import-skipped-row { min-width: 690px; }
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
  .account-delete-zone,
  .managed-solution-actions { align-items: stretch; flex-direction: column; }
  .account-delete-button,
  .managed-solution-actions button { width: 100%; }
  .solution-preview-backdrop { padding: 12px; }
  .solution-preview-dialog { max-height: calc(100vh - 24px); border-radius: 17px; }
  .solution-preview-head,
  .solution-review-section,
  .solution-promotion-bar { padding-right: 19px; padding-left: 19px; }
  .solution-promotion-bar { align-items: stretch; flex-direction: column; }
  .solution-promotion-bar > div:not(.solution-promotion-complete) { align-items: stretch; }
  .solution-promotion-bar button { width: 100%; }
  .admin-audit-head { align-items: flex-start; flex-direction: column; gap: 16px; }
  .admin-audit-controls { justify-content: space-between; width: 100%; }
}

@media (max-width: 520px) {
  .admin-center { padding: 0; }
  .admin-hero h1 { font-size: 32px; }
  .invite-form { grid-template-columns: 1fr; }
  .admin-primary-button { grid-column: auto; }
  .dimension-filters { grid-template-columns: 1fr; }
  .dimension-fields { grid-template-columns: 1fr; }
  .dimension-toolbar-actions { width: 100%; }
  .dimension-toolbar-actions > button { flex: 1; min-width: 0; }
  .dimension-import-target { align-items: flex-start; flex-direction: column; gap: 10px; }
  .dimension-import-dropzone { grid-template-columns: 42px minmax(0, 1fr); }
  .dimension-import-dropzone i { display: none; }
  .dimension-import-checks { grid-template-columns: 1fr; }
  .dimension-import-actions { grid-template-columns: 1fr 1fr; }
  .dimension-import-actions > div { grid-column: 1 / -1; }
  .dimension-import-actions .admin-primary-button { min-width: 0; }
  .config-release-actions input { width: 100%; flex-basis: 100%; }
  .invite-link-row { align-items: stretch; flex-direction: column; }
  .invite-link-row button { align-self: flex-start; }
  .account-meta-grid,
  .account-stat-grid { grid-template-columns: 1fr; }
  .account-toolbar { justify-content: stretch; }
  .account-toolbar input { width: 100%; }
  .temporary-password { align-items: flex-start; flex-direction: column; }
  .directory-user { grid-template-columns: 34px minmax(0, 1fr) auto; }
  .directory-user-role { display: none; }
  .settings-fields,
  .security-actions { grid-template-columns: 1fr; }
  .settings-status-field,
  .security-actions label { grid-column: auto; }
  .security-actions button { width: 100%; }
  .account-settings-footer { align-items: stretch; flex-direction: column; }
  .account-settings-footer button { width: 100%; }
  .plan-data-tabs { overflow-x: auto; }
  .plan-data-tabs button { flex: 0 0 auto; }
  .task-data-list article { grid-template-columns: 24px minmax(0, 1fr); }
  .task-status,
  .task-data-list time { grid-column: 2; }
}
</style>
