const MULTI_VALUE_WIDGETS = new Set([
  '搜索多选',
  '列表输入',
  '下拉多选',
  '复选组',
])

function normalizeCell(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}
function normalizeOptionValue(option) {
  if (option && typeof option === 'object') {
    return normalizeCell(option.value ?? option.label)
  }
  return normalizeCell(option)
}

function rowFingerprint(values) {
  return [...values].sort((a, b) => a.localeCompare(b, 'zh-CN')).join('\u001f')
}

function compactNameValue(value) {
  const parts = normalizeCell(value).split(/[>/]/).filter(Boolean)
  return parts.at(-1) || normalizeCell(value)
}

function buildDefaultCrowdName(baseName, values, index) {
  const base = normalizeCell(baseName) || '人群包'
  const suffix = values.slice(0, 3).map(compactNameValue).join('+')
  const overflow = values.length > 3 ? `+${values.length - 3}` : ''
  const proposed = `${base}_${suffix || String(index + 1).padStart(2, '0')}${overflow}`
  return proposed.slice(0, 80)
}

export function isDateBatchParameterSection(section) {
  const bindings = Array.isArray(section?.bindings) ? section.bindings : []
  return normalizeCell(section?.type).includes('日期')
    && bindings.length > 0
    && bindings.every((binding) => normalizeCell(binding?.widgetType).includes('日期'))
}

export function isBatchableParameterSection(section) {
  const types = [
    section?.type,
    ...(Array.isArray(section?.bindings)
      ? section.bindings.map((binding) => binding?.widgetType)
      : []),
  ]
  return isDateBatchParameterSection(section)
    || types.some((type) => MULTI_VALUE_WIDGETS.has(normalizeCell(type)))
}

function parseCalendarDate(value) {
  const match = normalizeCell(value).match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  const key = `${yearText}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
  return { dayIndex: Date.UTC(year, month - 1, day) / 86400000, key, label: `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

function parseDateBatchCells(cells, { minimumDate, maximumDate } = {}) {
  const source = cells.length === 1 ? cells[0] : cells.join(' 至 ')
  const recent = cells.length === 1 && cells[0].match(/^(?:(?:过去|最近|近)\s*)?(\d{1,3})\s*天?$/)
  if (recent) {
    const days = Number(recent[1])
    if (days >= 1 && days <= 366) {
      return { label: `过去 ${days} 天`, value: { days, dateRange: [], mode: 'recent' } }
    }
    return { label: source, issue: '过去天数请填写 1～366 天' }
  }

  const pair = cells.length === 2
    ? cells
    : cells.length === 1
      ? cells[0].split(/\s*(?:至|到|~|～)\s*/)
      : []
  if (pair.length !== 2 || !pair[0] || !pair[1]) {
    return { label: source, issue: '每行填“过去 30 天”，或填写开始日期和结束日期两列' }
  }
  const start = parseCalendarDate(pair[0])
  const end = parseCalendarDate(pair[1])
  if (!start || !end) return { label: source, issue: '日期格式应为 YYYY-MM-DD（也支持 YYYYMMDD）' }
  const label = `${start.label} 至 ${end.label}`
  if (start.key > end.key) return { label, issue: '开始日期不能晚于结束日期' }
  if (end.dayIndex - start.dayIndex > 366) return { label, issue: '开始与结束日期最多相隔 366 天' }
  if (minimumDate && start.key < minimumDate) return { label, issue: `开始日期不能早于 ${minimumDate}` }
  if (maximumDate && end.key > maximumDate) return { label, issue: `结束日期不能晚于 ${maximumDate}` }
  return { label, value: { dateRange: [start.key, end.key], mode: 'range' } }
}

export function buildDateParameterBatchRows(text, { baseName = '人群包', minimumDate, maximumDate } = {}) {
  const seenRows = new Map()
  return String(text ?? '').replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((line, index) => ({ sourceRow: index + 1, sourceText: line, cells: line.split('\t').map(normalizeCell) }))
    .filter((row) => row.cells.some(Boolean))
    .map((row, index) => {
      const parsed = parseDateBatchCells(row.cells, { minimumDate, maximumDate })
      const fingerprint = parsed.value ? JSON.stringify(parsed.value) : row.cells.join('\u001f')
      const duplicateOf = seenRows.get(fingerprint) || 0
      if (!duplicateOf) seenRows.set(fingerprint, row.sourceRow)
      const issues = [parsed.issue, duplicateOf ? `与第 ${duplicateOf} 行重复` : ''].filter(Boolean)
      return {
        id: `parameter_batch_${row.sourceRow}_${index}`,
        sourceRow: row.sourceRow,
        sourceText: row.sourceText,
        values: [parsed.label],
        parameterValue: parsed.value || null,
        crowdName: buildDefaultCrowdName(baseName, [parsed.label], index),
        invalidValues: parsed.issue ? [parsed.label] : [],
        overLimit: false,
        duplicateOf,
        issues,
        valid: issues.length === 0,
      }
    })
}

export function buildDatedParameterCrowdName(entry, dateSuffix, index = 0) {
  const currentName = normalizeCell(entry?.crowdName)
  const previousSuffix = entry?.runDateSuffix ? `_${entry.runDateSuffix}` : ''
  const inferredBase = previousSuffix && currentName.endsWith(previousSuffix)
    ? currentName.slice(0, -previousSuffix.length)
    : currentName
  const baseName = normalizeCell(entry?.baseCrowdName || inferredBase || entry?.solutionName || `人群包${index + 1}`)
  const crowdName = `${baseName}_${dateSuffix}`
  return { baseName, crowdName }
}

export function collectBatchAllowedValues(section) {
  const optionSets = (Array.isArray(section?.bindings) ? section.bindings : [])
    .map((binding) => (
      Array.isArray(binding?.options)
        ? binding.options.map(normalizeOptionValue).filter(Boolean)
        : []
    ))
    .filter((values) => values.length > 0)

  if (!optionSets.length) return []
  const remaining = new Set(optionSets[0])
  optionSets.slice(1).forEach((values) => {
    const available = new Set(values)
    ;[...remaining].forEach((value) => {
      if (!available.has(value)) remaining.delete(value)
    })
  })
  return [...remaining]
}

export function parseExcelParameterMatrix(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  if (!source.trim()) return []

  return source
    .split(/\r\n|\n|\r/)
    .map((line, lineIndex) => {
      const seen = new Set()
      const values = []
      line.split('\t').forEach((cell) => {
        const value = normalizeCell(cell)
        if (!value || seen.has(value)) return
        seen.add(value)
        values.push(value)
      })
      return {
        sourceRow: lineIndex + 1,
        values,
      }
    })
    .filter((row) => row.values.length > 0)
}

export function buildParameterBatchRows(
  text,
  {
    allowedValues = [],
    maxItems = 0,
    baseName = '人群包',
  } = {},
) {
  const allowed = new Set(
    (Array.isArray(allowedValues) ? allowedValues : [])
      .map(normalizeOptionValue)
      .filter(Boolean),
  )
  const seenRows = new Map()

  return parseExcelParameterMatrix(text).map((row, index) => {
    const fingerprint = rowFingerprint(row.values)
    const duplicateOf = seenRows.get(fingerprint) || 0
    if (!duplicateOf) seenRows.set(fingerprint, row.sourceRow)
    const invalidValues = allowed.size
      ? row.values.filter((value) => !allowed.has(value))
      : []
    const overLimit = Number(maxItems) > 0 && row.values.length > Number(maxItems)
    const issues = []
    if (invalidValues.length) issues.push(`${invalidValues.length} 个值未匹配`)
    if (overLimit) issues.push(`超过每行 ${maxItems} 项限制`)
    if (duplicateOf) issues.push(`与第 ${duplicateOf} 行重复`)

    return {
      id: `parameter_batch_${row.sourceRow}_${index}`,
      sourceRow: row.sourceRow,
      values: row.values,
      crowdName: buildDefaultCrowdName(baseName, row.values, index),
      invalidValues,
      overLimit,
      duplicateOf,
      issues,
      valid: issues.length === 0,
    }
  })
}
