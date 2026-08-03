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
  assert.match(adminCenterVue, /\.users-table \{ min-width: 610px; \}/)
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
