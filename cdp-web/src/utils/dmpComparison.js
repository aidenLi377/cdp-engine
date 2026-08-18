export const DMP_COMPARISON_FIXED_COLUMNS = ['标签名称', '特征明细']

export const DMP_COMPARISON_METRICS = [
  '人群占比',
  '覆盖人数',
  'Rebase',
  'Rebase后人数',
  'CTR',
  'PPC',
]

function normalizedText(value) {
  return String(value ?? '').trim()
}

export function buildTagNameFrequency(rows) {
  const frequency = new Map()
  let emptyCount = 0

  for (const row of Array.isArray(rows) ? rows : []) {
    const labelName = normalizedText(row?.['标签名称'])
    if (!labelName) {
      emptyCount += 1
      continue
    }
    frequency.set(labelName, (frequency.get(labelName) || 0) + 1)
  }

  return {
    frequency,
    emptyCount,
    rowCount: Array.isArray(rows) ? rows.length : 0,
  }
}

export function buildDefaultLabelOrder(rows) {
  const order = []
  const seen = new Set()

  for (const row of Array.isArray(rows) ? rows : []) {
    const labelName = normalizedText(row?.['标签名称'])
    if (!labelName || seen.has(labelName)) continue
    seen.add(labelName)
    order.push(labelName)
  }

  return order
}

export function buildLabelStructureFingerprint(rows) {
  const { frequency, emptyCount, rowCount } = buildTagNameFrequency(rows)
  return JSON.stringify({
    labels: [...frequency.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')),
    emptyCount,
    rowCount,
  })
}

export function reconcileLabelOrder(order, rows) {
  const defaults = buildDefaultLabelOrder(rows)
  const available = new Set(defaults)
  const seen = new Set()
  const next = []

  for (const rawLabelName of Array.isArray(order) ? order : []) {
    const labelName = normalizedText(rawLabelName)
    if (!labelName || !available.has(labelName) || seen.has(labelName)) continue
    seen.add(labelName)
    next.push(labelName)
  }

  for (const labelName of defaults) {
    if (seen.has(labelName)) continue
    seen.add(labelName)
    next.push(labelName)
  }

  return next
}

export function compareTagNameStructures(baseRows, candidateRows) {
  const base = buildTagNameFrequency(baseRows)
  const candidate = buildTagNameFrequency(candidateRows)
  const names = [...new Set([...base.frequency.keys(), ...candidate.frequency.keys()])]
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
  const differences = names
    .map((labelName) => ({
      labelName,
      baseCount: base.frequency.get(labelName) || 0,
      candidateCount: candidate.frequency.get(labelName) || 0,
    }))
    .filter((item) => item.baseCount !== item.candidateCount)

  if (base.rowCount === 0 || candidate.rowCount === 0) {
    return {
      compatible: false,
      reason: '人群包没有可用于对比的标签数据',
      differences,
      baseRowCount: base.rowCount,
      candidateRowCount: candidate.rowCount,
    }
  }

  if (base.emptyCount > 0 || candidate.emptyCount > 0) {
    return {
      compatible: false,
      reason: '人群包中存在标签名称为空的数据',
      differences,
      baseRowCount: base.rowCount,
      candidateRowCount: candidate.rowCount,
    }
  }

  return {
    compatible: differences.length === 0 && base.rowCount === candidate.rowCount,
    reason: differences.length === 0 && base.rowCount === candidate.rowCount
      ? ''
      : '标签名称或标签数量与基准人群包不一致',
    differences,
    baseRowCount: base.rowCount,
    candidateRowCount: candidate.rowCount,
  }
}

function taskComparisonKey(task, index) {
  return String(task?.comparisonKey || task?.id || task?.runId || `${task?.name || '人群包'}-${index}`)
}

function rowIdentity(row, occurrences) {
  const labelName = normalizedText(row?.['标签名称'])
  const featureDetail = normalizedText(row?.['特征明细'])
  const baseKey = `${labelName}\u0000${featureDetail}`
  const occurrence = occurrences.get(baseKey) || 0
  occurrences.set(baseKey, occurrence + 1)
  return `${baseKey}\u0000${occurrence}`
}

export function buildDmpComparisonMatrix(tasks, selectedMetrics, labelOrder = []) {
  const metrics = DMP_COMPARISON_METRICS.filter((metric) => selectedMetrics?.includes(metric))
  const normalizedTasks = (Array.isArray(tasks) ? tasks : []).map((task, index) => ({
    key: taskComparisonKey(task, index),
    name: normalizedText(task?.crowdName || task?.name) || `人群包 ${index + 1}`,
    results: Array.isArray(task?.results) ? task.results : [],
  }))
  const rowMap = new Map()
  const rowOrder = []

  normalizedTasks.forEach((task) => {
    const occurrences = new Map()
    task.results.forEach((row) => {
      const identity = rowIdentity(row, occurrences)
      if (!rowMap.has(identity)) {
        rowMap.set(identity, {
          identity,
          labelName: normalizedText(row?.['标签名称']),
          featureDetail: normalizedText(row?.['特征明细']),
          values: {},
        })
        rowOrder.push(identity)
      }
      rowMap.get(identity).values[task.key] = Object.fromEntries(
        metrics.map((metric) => [metric, row?.[metric] ?? '—']),
      )
    })
  })

  const rows = rowOrder.map((identity) => rowMap.get(identity))
  const resolvedLabelOrder = reconcileLabelOrder(labelOrder, normalizedTasks[0]?.results)
  const labelOrderIndex = new Map(resolvedLabelOrder.map((labelName, index) => [labelName, index]))
  const originalRowIndex = new Map(rows.map((row, index) => [row.identity, index]))
  rows.sort((left, right) => {
    const leftIndex = labelOrderIndex.get(left.labelName) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = labelOrderIndex.get(right.labelName) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
      || originalRowIndex.get(left.identity) - originalRowIndex.get(right.identity)
  })

  return {
    fixedColumns: [...DMP_COMPARISON_FIXED_COLUMNS],
    metrics,
    tasks: normalizedTasks,
    labelOrder: resolvedLabelOrder,
    rows,
  }
}

export function comparisonExportGrid(matrix) {
  const metrics = Array.isArray(matrix?.metrics) ? matrix.metrics : []
  const tasks = Array.isArray(matrix?.tasks) ? matrix.tasks : []
  const headers = [
    ...DMP_COMPARISON_FIXED_COLUMNS,
    ...tasks.flatMap((task) => metrics.map((metric) => `${task.name}｜${metric}`)),
  ]
  const rows = (Array.isArray(matrix?.rows) ? matrix.rows : []).map((row) => [
    row.labelName,
    row.featureDetail,
    ...tasks.flatMap((task) => metrics.map((metric) => row.values?.[task.key]?.[metric] ?? '—')),
  ])
  return { headers, rows }
}

function tsvCell(value) {
  return String(value ?? '—').replace(/[\t\r\n]+/g, ' ')
}

function csvCell(value) {
  return `"${String(value ?? '—').replace(/"/g, '""')}"`
}

export function comparisonToTsv(matrix) {
  const grid = comparisonExportGrid(matrix)
  return [grid.headers, ...grid.rows].map((row) => row.map(tsvCell).join('\t')).join('\n')
}

export function comparisonToCsv(matrix) {
  const grid = comparisonExportGrid(matrix)
  return [grid.headers, ...grid.rows].map((row) => row.map(csvCell).join(',')).join('\n')
}
