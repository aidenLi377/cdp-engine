const STORAGE_KEY = 'cdp.ai.category-preferences.v1'
const MAX_PREFERENCES = 50

const GROUPS = [
  { id: 'beauty', label: '美妆护肤', short: '美', pattern: /美容护肤|美体|精油|彩妆|香水|面部护理|乳液|面霜/ },
  { id: 'maternity', label: '母婴护理', short: '婴', pattern: /孕|母婴|婴童|婴儿|宝宝|儿童/ },
  { id: 'personal', label: '个护清洁', short: '护', pattern: /洗护清洁|个护|卫生巾|纸|香薰|家庭清洁|口腔护理|身体清洁/ },
  { id: 'other', label: '其他类目', short: '其', pattern: null },
]

export function aiCategoryOptionLabel(option) {
  if (typeof option === 'string' || typeof option === 'number') return String(option)
  if (!option || typeof option !== 'object') return ''
  return String(option.label || option.value || '')
}

export function aiCategoryOptionValue(option) {
  if (typeof option === 'string' || typeof option === 'number') return String(option)
  if (!option || typeof option !== 'object') return ''
  return String(option.value || option.label || '')
}

export function isAiCategoryQuestion(question) {
  return ['leafCates', 'cate', 'categories'].includes(String(question?.field || ''))
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function questionQuery(question) {
  const actionQuery = String(question?.action?.query || '').trim()
  if (actionQuery) return actionQuery
  return String(question?.prompt || '').match(/[“"]([^”"]+)[”"]/)?.[1] || ''
}

function semanticField(question) {
  return isAiCategoryQuestion(question) ? 'category' : String(question?.field || '')
}

function categoryLeaf(option) {
  return aiCategoryOptionLabel(option).split('>').at(-1)?.trim() || ''
}

export function categoryOptionGroup(option) {
  const label = aiCategoryOptionLabel(option)
  const root = label.split('>')[0] || label
  // Root-path matches win so “孕产妇护肤”不会被归到普通美妆。
  for (const id of ['maternity', 'personal', 'beauty']) {
    const group = GROUPS.find(item => item.id === id)
    if (group.pattern.test(root)) return id
  }
  for (const id of ['maternity', 'personal', 'beauty']) {
    const group = GROUPS.find(item => item.id === id)
    if (group.pattern.test(label)) return id
  }
  return 'other'
}

function desiredGroup(question, conversationText = '') {
  const context = `${questionQuery(question)} ${conversationText}`
  if (GROUPS[1].pattern.test(context)) return 'maternity'
  if (GROUPS[2].pattern.test(context)) return 'personal'
  return 'beauty'
}

function optionScore(option, question, conversationText) {
  const label = aiCategoryOptionLabel(option)
  const root = label.split('>')[0] || label
  const queryKey = normalize(questionQuery(question))
  const leafKey = normalize(categoryLeaf(option))
  const group = categoryOptionGroup(option)
  let score = group === desiredGroup(question, conversationText) ? 500 : 0
  if (queryKey && leafKey === queryKey) score += 180
  else if (queryKey && (leafKey.includes(queryKey) || queryKey.includes(leafKey))) score += 90
  if (GROUPS.find(item => item.id === group)?.pattern?.test(root)) score += 70
  const contextSpecificity = [
    [/婴儿|婴童|宝宝/, /婴儿|婴童|宝宝/],
    [/孕妇|孕产/, /孕妇|孕产/],
    [/儿童|小孩/, /儿童|小孩/],
  ]
  for (const [contextPattern, optionPattern] of contextSpecificity) {
    if (contextPattern.test(conversationText) && optionPattern.test(label)) score += 150
  }
  score += Math.max(0, 30 - label.split('>').length * 6)
  if (/旅行购物|其他/.test(root)) score -= 35
  return score
}

export function groupAiCategoryOptions(question, conversationText = '') {
  const options = Array.isArray(question?.options) ? [...question.options] : []
  const preferredGroup = desiredGroup(question, conversationText)
  const groupOrder = [preferredGroup, ...GROUPS.map(item => item.id).filter(id => id !== preferredGroup)]
  return groupOrder.flatMap(id => {
    const meta = GROUPS.find(item => item.id === id)
    const matches = options
      .filter(option => categoryOptionGroup(option) === id)
      .sort((left, right) => optionScore(right, question, conversationText) - optionScore(left, question, conversationText))
    return matches.length ? [{ ...meta, options: matches }] : []
  })
}

export function loadAiCategoryPreferences(storage = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return []
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.filter(item => item && typeof item === 'object').slice(0, MAX_PREFERENCES) : []
  } catch {
    return []
  }
}

export function cacheAiCategoryPreferences(
  preferences = [],
  storage = typeof window === 'undefined' ? null : window.localStorage,
) {
  const next = Array.isArray(preferences)
    ? preferences.filter(item => item && typeof item === 'object').slice(0, MAX_PREFERENCES)
    : []
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Browser storage is only a fallback; account-level storage remains authoritative.
  }
  return next
}

export function chooseAiCategoryOption(question, preferences = [], conversationText = '') {
  const options = Array.isArray(question?.options) ? question.options : []
  const field = semanticField(question)
  const queryKey = normalize(questionQuery(question))
  const availableByValue = new Map(options.map(option => [aiCategoryOptionValue(option), option]))
  const remembered = [...preferences]
    .filter(item => item.field === field && availableByValue.has(String(item.value || '')))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .find(item => item.queryKey === queryKey || (
      queryKey && item.leafKey && (item.leafKey.includes(queryKey) || queryKey.includes(item.leafKey))
    ))
  if (remembered) {
    return { option: availableByValue.get(String(remembered.value)), source: 'remembered' }
  }
  const option = groupAiCategoryOptions(question, conversationText).flatMap(group => group.options)[0] || options[0] || null
  return { option, source: option ? 'recommended' : 'none' }
}

export function rememberAiCategoryOption(
  question,
  option,
  preferences = [],
  storage = typeof window === 'undefined' ? null : window.localStorage,
) {
  const queryKey = normalize(questionQuery(question))
  const record = {
    field: semanticField(question),
    query: questionQuery(question),
    queryKey,
    leafKey: normalize(categoryLeaf(option)),
    value: aiCategoryOptionValue(option),
    label: aiCategoryOptionLabel(option),
    updatedAt: new Date().toISOString(),
  }
  const next = [
    record,
    ...preferences.filter(item => !(item.field === record.field && item.queryKey === queryKey)),
  ].slice(0, MAX_PREFERENCES)
  return cacheAiCategoryPreferences(next, storage)
}

export function aiCategoryQueryLabel(question) {
  return questionQuery(question) || '这个业务词'
}
