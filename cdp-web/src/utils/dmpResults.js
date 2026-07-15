export const DMP_RESULT_COLUMNS = [
  '所属大类',
  '标签类型',
  '标签名称',
  '特征明细',
  '人群占比',
  '覆盖人数',
  'Rebase',
  'Rebase后人数',
  'CTR',
  'PPC',
]

export function defaultColumnVisibility() {
  return Object.fromEntries(DMP_RESULT_COLUMNS.map((column) => [column, true]))
}

export function normalizeDmpSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {}
  const columnVisibility = defaultColumnVisibility()
  for (const column of DMP_RESULT_COLUMNS) {
    if (source.columnVisibility?.[column] === false) columnVisibility[column] = false
  }
  return {
    readyTagIds: [...new Set((Array.isArray(source.readyTagIds) ? source.readyTagIds : []).map(String))],
    columnVisibility,
    rebaseExcludedTagIds: [...new Set((Array.isArray(source.rebaseExcludedTagIds) ? source.rebaseExcludedTagIds : []).map(String))],
  }
}

export function isConditionalTagReady(tag, readyTagIds) {
  if (!tag?.needCondition) return true
  return new Set((readyTagIds || []).map(String)).has(String(tag.tagId))
}

export function formatPercentageForDisplay(value) {
  const text = String(value ?? '')
  if (!text.endsWith('%')) return value ?? '-'
  const percentage = Number.parseFloat(text)
  return Number.isFinite(percentage) ? `${percentage.toFixed(2)}%` : text
}

export function normalizeResultRow(row) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ...source,
    CTR: source.CTR ?? source['点击TGI'] ?? '-',
    PPC: source.PPC ?? source['转化TGI'] ?? '-',
  }
}

export function visibleResultColumns(_rows, visibility) {
  const columnVisibility = visibility || defaultColumnVisibility()
  return DMP_RESULT_COLUMNS.filter((column) => columnVisibility[column] !== false)
}
