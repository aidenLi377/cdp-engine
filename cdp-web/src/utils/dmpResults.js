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

export function orderTagIdsByDictionary(tagIds, dictionary) {
  const selectedIds = Array.isArray(tagIds) ? tagIds.map(String) : []
  const selectedSet = new Set(selectedIds)
  const orderedIds = []
  const addedIds = new Set()

  for (const tag of Array.isArray(dictionary) ? dictionary : []) {
    const tagId = String(tag?.tagId ?? '')
    if (!tagId || !selectedSet.has(tagId) || addedIds.has(tagId)) continue
    orderedIds.push(tagId)
    addedIds.add(tagId)
  }

  for (const tagId of selectedIds) {
    if (addedIds.has(tagId)) continue
    orderedIds.push(tagId)
    addedIds.add(tagId)
  }

  return orderedIds
}

export function orderResultRowsByDictionary(rows, dictionary) {
  const sourceRows = Array.isArray(rows) ? rows : []
  const tagOrder = new Map()

  for (const tag of Array.isArray(dictionary) ? dictionary : []) {
    const tagName = String(tag?.tagName ?? '')
    if (tagName && !tagOrder.has(tagName)) tagOrder.set(tagName, tagOrder.size)
  }

  return sourceRows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = tagOrder.get(String(left.row?.['标签名称'] ?? ''))
      const rightOrder = tagOrder.get(String(right.row?.['标签名称'] ?? ''))
      const leftKnown = leftOrder !== undefined
      const rightKnown = rightOrder !== undefined

      if (leftKnown && rightKnown && leftOrder !== rightOrder) return leftOrder - rightOrder
      if (leftKnown !== rightKnown) return leftKnown ? -1 : 1
      return left.sourceIndex - right.sourceIndex
    })
    .map(({ row }) => row)
}

export function visibleResultColumns(_rows, visibility) {
  const columnVisibility = visibility || defaultColumnVisibility()
  return DMP_RESULT_COLUMNS.filter((column) => columnVisibility[column] !== false)
}
