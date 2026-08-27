import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const adminCenterVue = readFileSync(join(currentDir, 'AdminCenter.vue'), 'utf8')
const dataSafetyVue = readFileSync(join(currentDir, 'DataSafetyPanel.vue'), 'utf8')
const feedbackAdminVue = readFileSync(join(currentDir, 'FeedbackAdminPanel.vue'), 'utf8')
const feedbackDrawerVue = readFileSync(join(currentDir, 'FeedbackDrawer.vue'), 'utf8')

test('system management exposes direct functional sections without a task dashboard', () => {
  assert.match(adminCenterVue, /id: 'safety'[\s\S]*label: '数据安全'/)
  assert.match(adminCenterVue, /id: 'users'[\s\S]*label: '用户与权限'/)
  assert.match(adminCenterVue, /id: 'invites'[\s\S]*label: '邀请管理'/)
  assert.match(adminCenterVue, /id: 'plans'[\s\S]*label: '用户方案数据'/)
  assert.match(adminCenterVue, /id: 'config'[\s\S]*label: '维表与配置'/)
  assert.match(adminCenterVue, /id: 'releases'[\s\S]*label: '配置发布记录'/)
  assert.match(adminCenterVue, /id: 'logs'[\s\S]*label: '操作日志'/)
  assert.match(adminCenterVue, /id: 'feedback'[\s\S]*label: '用户反馈'/)
  assert.match(adminCenterVue, /request\('\/api\/admin\/data-safety'/)
  assert.match(adminCenterVue, /request\('\/api\/admin\/feedback'/)
  assert.match(adminCenterVue, /v-if="isSystemOwner && activeSection === 'feedback'"/)
  assert.doesNotMatch(adminCenterVue, /管理首页|今日待处理|权限提醒/)
  assert.doesNotMatch(adminCenterVue, /admin · 总管理员|系统总管理员|仅 admin/)
  assert.doesNotMatch(dataSafetyVue, /ROOT ONLY|总管理员/)
  assert.doesNotMatch(feedbackAdminVue, /ROOT ONLY|总管理员/)
  assert.doesNotMatch(feedbackDrawerVue, /ROOT ONLY|总管理员|仅 admin/)
})

test('dimension pagination exposes page size, item total, and total pages', () => {
  assert.match(adminCenterVue, /const DIMENSION_PAGE_SIZES = \[20, 30, 50, 100\]/)
  assert.match(adminCenterVue, /const dimensionPageSize = ref\(30\)/)
  assert.match(adminCenterVue, /v-model\.number="dimensionPageSize"/)
  assert.match(adminCenterVue, /共 \{\{ dimensionTotalPages \}\} 页/)
  assert.match(adminCenterVue, /Math\.ceil\(dimensionTotal\.value \/ dimensionPageSize\.value\)/)
})

test('account, invitation, and plan sections use the full content width without overflowing tables', () => {
  assert.match(
    adminCenterVue,
    /class="admin-panels single-panel"/,
  )
  assert.match(adminCenterVue, /\.users-table \{[^}]*min-width: 0;[^}]*table-layout: fixed;/s)
  assert.doesNotMatch(adminCenterVue, /\.users-table \{ min-width: 610px; \}/)
})

test('release controls keep status and note actions vertically centered', () => {
  assert.match(adminCenterVue, /class="config-note-field"/)
  assert.match(adminCenterVue, /class="config-release-buttons"/)
  assert.match(adminCenterVue, /\.config-release \{[^}]*align-items: center;/s)
  assert.match(adminCenterVue, /\.config-release-actions \{[^}]*align-items: center;/s)
  assert.match(adminCenterVue, /aria-label="发布说明"/)
  assert.doesNotMatch(adminCenterVue, /<span>发布说明<\/span>/)
  assert.match(adminCenterVue, /\.config-discard \{[^}]*height: 34px;/s)
})

test('dimension headers stay visible while the table body scrolls', () => {
  assert.match(adminCenterVue, /\.dimension-table thead th \{[^}]*position: sticky;[^}]*top: 0;/s)
  assert.match(adminCenterVue, /dimension-table-wrap/)
})

test('dimension table uses a structured high-contrast header with explicit action labels', () => {
  assert.match(adminCenterVue, /class="dimension-header-cell"/)
  assert.match(adminCenterVue, /class="dimension-header-index"/)
  assert.match(adminCenterVue, /dimension-key-header': column === '适用的包'/)
  assert.match(adminCenterVue, /class="dimension-action-header"[\s\S]*?>操作</)
  assert.match(adminCenterVue, /\.dimension-table thead th \{[^}]*height: 46px;[^}]*background: #202124;/s)
  assert.match(adminCenterVue, /\.dimension-table-wrap \{[^}]*border-radius: 12px;/s)
})

test('audit deletion is visible only to super admins and uses the guarded API action', () => {
  assert.match(adminCenterVue, /const canDeleteAuditLogs = computed\(\(\) => props\.currentUserRole === 'super_admin'\)/)
  assert.match(adminCenterVue, /v-if="canDeleteAuditLogs" class="admin-table-action"/)
  assert.match(adminCenterVue, /@click="deleteAuditLog\(entry\)"/)
  assert.match(adminCenterVue, /\/api\/admin\/audit-logs\/\$\{encodeURIComponent\(entry\.id\)\}/)
  assert.match(adminCenterVue, /操作记录已删除/)
})

test('administrator audit trail sits at the page bottom and is collapsed by default', () => {
  const configAuditIndex = adminCenterVue.indexOf('id="config-audit-title"')
  const adminAuditIndex = adminCenterVue.indexOf('class="admin-panel audit-panel admin-audit-bottom"')

  assert.ok(configAuditIndex >= 0 && adminAuditIndex > configAuditIndex)
  assert.match(adminCenterVue, /const auditPanelExpanded = ref\(false\)/)
  assert.match(adminCenterVue, /:aria-expanded="auditPanelExpanded"/)
  assert.match(adminCenterVue, /aria-controls="admin-audit-records"/)
  assert.match(adminCenterVue, /v-if="auditPanelExpanded" id="admin-audit-records"/)
  assert.match(adminCenterVue, /auditPanelExpanded \? '收起记录' : '展开记录'/)
})

test('config audit trail exposes immutable expandable field-level details', () => {
  assert.match(adminCenterVue, /id="config-audit-title">配置修改记录/)
  assert.match(adminCenterVue, /记录只读，不提供删除入口/)
  assert.match(adminCenterVue, /\/api\/admin\/config\/audit-logs/)
  assert.match(adminCenterVue, /expandedConfigAuditId === entry\.id/)
  assert.match(adminCenterVue, /configAuditGroups\(entry\)/)
  assert.match(adminCenterVue, />字段<\/span><span>变更<\/span><span>修改前<\/span><span>修改后</)
  assert.match(adminCenterVue, /configAuditChangeLabel\(change\.kind\)/)
  assert.match(adminCenterVue, /formatConfigAuditValue\(change\.before\)/)
  assert.match(adminCenterVue, /formatConfigAuditValue\(change\.after\)/)
  assert.match(adminCenterVue, /config-audit-kind\.removed/)
  assert.match(adminCenterVue, /config-audit-diff-row code\.before/)
  assert.match(adminCenterVue, /config-audit-diff-row code\.after/)
})

test('account and plan management use distinct master-detail surfaces', () => {
  assert.match(adminCenterVue, /activeSection === 'users'[\s\S]*account-management-surface/)
  assert.match(adminCenterVue, /@click="selectAccountUser\(user\)"/)
  assert.match(adminCenterVue, />账号资料</)
  assert.match(adminCenterVue, />权限范围</)
  assert.match(adminCenterVue, />登录安全</)
  assert.match(adminCenterVue, /v-for="permission in permissionRows"/)
  assert.match(adminCenterVue, /@submit\.prevent="saveManagedUser"/)
  assert.match(adminCenterVue, /activeSection === 'plans'[\s\S]*plan-management-surface/)
  assert.match(adminCenterVue, /@click="selectPlanUser\(user\)"/)
  assert.match(adminCenterVue, /managedSolutionGroups/)
  assert.match(adminCenterVue, /activePlanTab === 'solutions'/)
  assert.match(adminCenterVue, /activePlanTab === 'folders'/)
  assert.match(adminCenterVue, /managedUserData\.tasks/)
  assert.doesNotMatch(adminCenterVue, /\['users', 'plans'\]\.includes\(activeSection\)/)
})

test('account permissions use crisp black and white states without grey disabled checkboxes', () => {
  assert.match(adminCenterVue, /class="permission-access"/)
  assert.match(adminCenterVue, /<Check v-if="selectedRolePermissions\.includes\(permission\.key\)"/)
  assert.match(adminCenterVue, /<Close v-else/)
  assert.doesNotMatch(adminCenterVue, /<input type="checkbox" :checked="selectedRolePermissions/)
  assert.match(adminCenterVue, /\.role-options \{[^}]*background: #fff;[^}]*border: 1px solid var\(--ui-ink\);/s)
  assert.match(adminCenterVue, /\.role-options label\.active \{[^}]*color: #fff;[^}]*background: var\(--ui-ink\);/s)
  assert.match(adminCenterVue, /\.permission-list \{[^}]*background: #fff;[^}]*border: 1px solid var\(--ui-ink\);/s)
  assert.match(adminCenterVue, /\.settings-fields input,[\s\S]*?background: #fff;/)
})

test('all system management sections use white surfaces with restrained orange signals', () => {
  assert.match(adminCenterVue, /System management uses white structure/)
  assert.match(adminCenterVue, /\.admin-center \{[\s\S]*?--ui-fill: #fff;[\s\S]*?--ui-surface: #fff;/)
  assert.match(adminCenterVue, /\.admin-navigation nav button\.active \{[\s\S]*?box-shadow: inset 3px 0 0 var\(--ui-accent\);/)
  assert.match(adminCenterVue, /\.invite-created,[\s\S]*?\.config-release \{[\s\S]*?background: #fff;[\s\S]*?box-shadow: inset 3px 0 0 var\(--ui-accent\);/)
  assert.match(adminCenterVue, /\.dimension-type\.active \{[\s\S]*?box-shadow: inset 3px 0 0 var\(--ui-accent\);/)
  assert.match(adminCenterVue, /\.admin-log-switcher \{[\s\S]*?background: #fff;[\s\S]*?border: 1px solid var\(--ui-control-border\);/)
  assert.match(dataSafetyVue, /\.data-safety-overview \{[^}]*background: #fff;/)
  assert.match(dataSafetyVue, /<component :is="item\.icon"/)
  assert.match(dataSafetyVue, /icon: User/)
  assert.match(dataSafetyVue, /icon: Collection/)
  assert.match(dataSafetyVue, /icon: FolderOpened/)
  assert.match(dataSafetyVue, /icon: Tickets/)
  assert.match(dataSafetyVue, /\.data-count-icon \{[^}]*color: var\(--ui-ink\);[^}]*background: #fff;/)
  assert.match(dataSafetyVue, /\.data-count-icon::after \{[^}]*background: var\(--safety-orange\);/)
  assert.match(dataSafetyVue, /\.database-card code \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/)
  assert.match(feedbackAdminVue, /:class="`feedback-\$\{item\.status\}`"/)
  assert.match(feedbackAdminVue, /\.feedback-category \{[^}]*color: var\(--ui-accent\);[^}]*background: #fff;/)
  assert.match(feedbackDrawerVue, /\.feedback-upload-section \{[^}]*background: #fff;/)
  assert.match(feedbackDrawerVue, /\.feedback-actions button \{[^}]*background: var\(--ui-ink\);[^}]*box-shadow: inset 3px 0 0 var\(--ui-accent\);/)
})

test('user plan review keeps workbench summaries and guarded promotion', () => {
  assert.match(adminCenterVue, />查看详情</)
  assert.match(adminCenterVue, /v-if="previewedSolution"/)
  assert.match(adminCenterVue, />方案概述</)
  assert.match(adminCenterVue, /class="summary-node"/)
  assert.match(adminCenterVue, /getNodeSummaryDisplayName\(node, index\)/)
  assert.match(adminCenterVue, /solutionOverviewRows\(node\)/)
  assert.match(adminCenterVue, /await hydrateNodes\(solution\?\.nodes \|\| \[\]\)/)
  assert.match(adminCenterVue, />自定义字段绑定</)
  assert.match(adminCenterVue, /solutionFieldBindings\(field\)/)
  assert.match(adminCenterVue, /binding\.fieldLabel/)
  assert.match(adminCenterVue, /binding\.fieldKey/)
  assert.doesNotMatch(adminCenterVue, /solutionParameterEntries/)
  assert.doesNotMatch(adminCenterVue, />查看完整原始配置</)
  assert.match(adminCenterVue, /v-model="promotionDestination"/)
  assert.match(adminCenterVue, />公共方案库 \/ 根目录</)
  assert.match(adminCenterVue, /!promotionDestination \|\| promotingSolutionId/)
  assert.match(adminCenterVue, /\/solutions\/\$\{solution\.id\}\/promote/)
  assert.match(adminCenterVue, /JSON\.stringify\(\{ folderId \}\)/)
  assert.match(adminCenterVue, /用户的私人原件会保留/)
})

test('account deletion is explicit and guarded by username confirmation', () => {
  assert.match(adminCenterVue, />注销账号</)
  assert.match(adminCenterVue, /window\.prompt/)
  assert.match(adminCenterVue, /confirmation !== username/)
  assert.match(adminCenterVue, /method: 'DELETE'/)
})
