const CONFIG_AUDIT_ACTION_LABELS = {
  DIMENSION_ROW_CREATED: '新增记录',
  DIMENSION_ROW_UPDATED: '编辑字段',
  DIMENSION_ROW_STATUS_CHANGED: '变更状态',
  DIMENSION_ROW_DELETED: '删除记录',
  DIMENSION_ROWS_IMPORTED: '批量导入',
  CONFIG_PUBLISHED: '发布配置',
  CONFIG_ROLLED_BACK: '回滚配置',
  CONFIG_DRAFT_DISCARDED: '放弃草稿',
}

const CONFIG_AUDIT_OPERATION_LABELS = {
  created: '新增',
  updated: '修改',
  status_changed: '状态',
  deleted: '删除',
}

const CONFIG_AUDIT_CHANGE_LABELS = {
  added: '新增',
  changed: '修改',
  removed: '删除',
}

function configAuditActionLabel(action) {
  return CONFIG_AUDIT_ACTION_LABELS[action] || action || '配置变更'
}

function configAuditOperationLabel(operation) {
  return CONFIG_AUDIT_OPERATION_LABELS[operation] || '变更'
}

function configAuditChangeLabel(kind) {
  return CONFIG_AUDIT_CHANGE_LABELS[kind] || '修改'
}

function entryOperation(entry) {
  return {
    DIMENSION_ROW_CREATED: 'created',
    DIMENSION_ROW_UPDATED: 'updated',
    DIMENSION_ROW_STATUS_CHANGED: 'status_changed',
    DIMENSION_ROW_DELETED: 'deleted',
  }[entry?.action] || 'updated'
}

function configAuditGroups(entry) {
  const details = entry?.details || {}
  if (Array.isArray(details.tables)) {
    return details.tables.map((table) => ({
      dimensionFile: table.dimensionFile || entry?.dimensionFile || '',
      rows: Array.isArray(table.rows) ? table.rows : [],
    }))
  }
  if (Array.isArray(details.rows)) {
    return [{
      dimensionFile: entry?.dimensionFile || '',
      rows: details.rows,
    }]
  }
  if (Array.isArray(details.changes)) {
    return [{
      dimensionFile: entry?.dimensionFile || '',
      rows: [{
        rowId: entry?.rowId || '',
        rowName: entry?.rowName || '',
        operation: entryOperation(entry),
        changes: details.changes,
      }],
    }]
  }
  return []
}

function configAuditChangeCount(entry) {
  const groups = configAuditGroups(entry)
  const count = groups.reduce((total, group) => total + group.rows.reduce(
    (rowTotal, row) => rowTotal + (Array.isArray(row.changes) ? row.changes.length : 0),
    0,
  ), 0)
  return count || Number(entry?.details?.changeCount || entry?.details?.total || 0)
}

function formatConfigAuditValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export {
  configAuditActionLabel,
  configAuditOperationLabel,
  configAuditChangeLabel,
  configAuditGroups,
  configAuditChangeCount,
  formatConfigAuditValue,
}
