export function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function getCfTypeClass(type) {
  if (!type) return 'text'
  if (type.includes('日期')) return 'date'
  if (type.includes('数值')) return 'number'
  if (type.includes('搜索') || type.includes('下拉')) return 'select'
  return 'text'
}

/**
 * Format a custom field value for display.
 * Used by card summaries, collapsed focus view, edit dialog, and right panel summary.
 */
export function formatCfDisplayValue(value, mode, widgetType) {
  if (value === undefined || value === null) return '(未设置)'
  if (Array.isArray(value)) return value.length > 0 ? value.join('、') : '(空)'

  if (typeof value === 'object') {
    if (widgetType?.includes('日期')) {
      if (value.days !== undefined && mode !== 'range') return `过去 ${value.days} 天`
      if (mode === 'range' && Array.isArray(value.dateRange) && value.dateRange.length === 2) {
        return `${value.dateRange[0]} ~ ${value.dateRange[1]}`
      }
    }

    if (widgetType?.includes('数值')) {
      if (mode === 'unlimited') return '不限'
      if (mode === 'range') return `${value.min ?? '?'} - ${value.max ?? '?'}`
      if (mode === 'min') return `≥ ${value.min ?? '?'}`
    }

    if (value.days !== undefined && mode !== 'range') return `过去 ${value.days} 天`
    return JSON.stringify(value)
  }

  return String(value) || '(空)'
}

export function summarizeCfDisplayValue(value, mode, widgetType) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)

    if (normalized.length === 0) {
      return {
        primaryText: '(空)',
        overflowCount: 0,
        overflowText: '',
      }
    }

    return {
      primaryText: normalized[0],
      overflowCount: Math.max(0, normalized.length - 1),
      overflowText: normalized.slice(1).join('\n'),
    }
  }

  return {
    primaryText: formatCfDisplayValue(value, mode, widgetType),
    overflowCount: 0,
    overflowText: '',
  }
}

export function statusText(status) {
  if (status === 'draft') return '草稿'
  if (status === 'published') return '已发布'
  return status || '未知'
}
