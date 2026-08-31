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

export function isBatchableParameterSection(section) {
  const types = [
    section?.type,
    ...(Array.isArray(section?.bindings)
      ? section.bindings.map((binding) => binding?.widgetType)
      : []),
  ]
  return types.some((type) => MULTI_VALUE_WIDGETS.has(normalizeCell(type)))
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
