const QUICK_RANGE_DEFINITIONS = [
  {
    label: '日维度',
    items: [
      { key: 'recent180Days', label: '最近180天' },
      { key: 'previous180Days', label: '上一个180天' },
    ],
  },
  {
    label: '月维度',
    items: [
      { key: 'recent6Months', label: '最近6个完整月' },
      { key: 'previous6Months', label: '上一个6个月' },
    ],
  },
]

function startOfLocalDay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('快捷日期周期需要有效的基准日期')
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addCalendarDays(value, amount) {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

export function formatQuickDateValue(value) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function getQuickRangeSelectableStart(referenceDate = new Date()) {
  const today = startOfLocalDay(referenceDate)
  const rollingYearStart = addCalendarDays(today, -366)
  const completeMonthsStart = new Date(today.getFullYear(), today.getMonth() - 12, 1)
  return completeMonthsStart < rollingYearStart ? completeMonthsStart : rollingYearStart
}

export function getQuickDateRange(preset, referenceDate = new Date()) {
  const today = startOfLocalDay(referenceDate)
  let start
  let end

  if (preset === 'recent180Days') {
    end = addCalendarDays(today, -1)
    start = addCalendarDays(end, -179)
  } else if (preset === 'previous180Days') {
    end = addCalendarDays(today, -181)
    start = addCalendarDays(end, -179)
  } else if (preset === 'recent6Months') {
    start = new Date(today.getFullYear(), today.getMonth() - 6, 1)
    end = new Date(today.getFullYear(), today.getMonth(), 0)
  } else if (preset === 'previous6Months') {
    start = new Date(today.getFullYear(), today.getMonth() - 12, 1)
    end = new Date(today.getFullYear(), today.getMonth() - 6, 0)
  } else {
    throw new TypeError(`未知的快捷日期周期：${preset}`)
  }

  return [formatQuickDateValue(start), formatQuickDateValue(end)]
}

export function createQuickDateRangeGroups(referenceDate = new Date()) {
  return QUICK_RANGE_DEFINITIONS.map(group => ({
    label: group.label,
    items: group.items.map(item => ({
      ...item,
      dateRange: getQuickDateRange(item.key, referenceDate),
    })),
  }))
}
