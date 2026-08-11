import test from 'node:test'
import assert from 'node:assert/strict'

import {
  configAuditActionLabel,
  configAuditChangeCount,
  configAuditChangeLabel,
  configAuditGroups,
  formatConfigAuditValue,
} from './configAudit.js'

test('single row audit becomes one dimension and one row group', () => {
  const entry = {
    action: 'DIMENSION_ROW_UPDATED',
    dimensionFile: '品牌维表.csv',
    rowId: 'row-1',
    rowName: '测试品牌',
    details: {
      changes: [
        { field: '品牌名称', kind: 'changed', before: '旧品牌', after: '新品牌' },
        { field: '备注', kind: 'removed', before: '旧备注', after: null },
      ],
    },
  }

  const groups = configAuditGroups(entry)
  assert.equal(groups[0].dimensionFile, '品牌维表.csv')
  assert.equal(groups[0].rows[0].rowName, '测试品牌')
  assert.equal(groups[0].rows[0].operation, 'updated')
  assert.equal(configAuditChangeCount(entry), 2)
})

test('published audit keeps table and row hierarchy', () => {
  const entry = {
    action: 'CONFIG_PUBLISHED',
    details: {
      changeCount: 2,
      tables: [
        {
          dimensionFile: '类目维表.csv',
          rows: [{ rowId: 'row-2', rowName: '食品', operation: 'created', changes: [] }],
        },
      ],
    },
  }

  assert.equal(configAuditGroups(entry)[0].rows[0].operation, 'created')
  assert.equal(configAuditChangeCount(entry), 2)
  assert.equal(configAuditActionLabel(entry.action), '发布配置')
})

test('audit labels and values keep deletions explicit and readable', () => {
  assert.equal(configAuditChangeLabel('removed'), '删除')
  assert.equal(formatConfigAuditValue(null), '—')
  assert.equal(formatConfigAuditValue(false), '否')
  assert.equal(formatConfigAuditValue({ id: 1 }), '{\n  "id": 1\n}')
})
