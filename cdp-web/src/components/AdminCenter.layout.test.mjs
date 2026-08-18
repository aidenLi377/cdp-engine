import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const adminCenterVue = readFileSync(join(currentDir, 'AdminCenter.vue'), 'utf8')

test('dimension pagination exposes page size, item total, and total pages', () => {
  assert.match(adminCenterVue, /const DIMENSION_PAGE_SIZES = \[20, 30, 50, 100\]/)
  assert.match(adminCenterVue, /const dimensionPageSize = ref\(30\)/)
  assert.match(adminCenterVue, /v-model\.number="dimensionPageSize"/)
  assert.match(adminCenterVue, /共 \{\{ dimensionTotalPages \}\} 页/)
  assert.match(adminCenterVue, /Math\.ceil\(dimensionTotal\.value \/ dimensionPageSize\.value\)/)
})

test('account panel receives more width than invitations without overflowing its table', () => {
  assert.match(
    adminCenterVue,
    /\.admin-panels \{[^}]*grid-template-columns: minmax\(0, 0\.92fr\) minmax\(0, 1\.08fr\);/s,
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

test('account management reviews user plans as workbench summaries before promotion', () => {
  assert.match(adminCenterVue, />用户方案与数据</)
  assert.match(adminCenterVue, /solution\.nodes\.slice\(0, 5\)/)
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
  assert.match(adminCenterVue, />注销这个账号</)
  assert.match(adminCenterVue, /window\.prompt/)
  assert.match(adminCenterVue, /confirmation !== username/)
  assert.match(adminCenterVue, /method: 'DELETE'/)
})
