const LEGACY_TITLE_OPTIONS = [
  '任意商品标题关键字',
  '指定商品标题关键字',
]

function optionParts(option) {
  if (option && typeof option === 'object') {
    const value = option.value ?? option.label ?? ''
    return { value, label: String(option.label ?? value) }
  }
  return { value: option, label: String(option ?? '') }
}

export function getSingleChoiceOptions(field = {}) {
  const configured = Array.isArray(field.options) ? field.options : []
  const source = configured.length > 0
    ? configured
    : (['title_type', 'keywords_type'].includes(field.key) ? LEGACY_TITLE_OPTIONS : [])
  return source.map(optionParts).filter(option => option.value !== '')
}

export function getSingleChoiceDefault(field = {}) {
  const options = getSingleChoiceOptions(field)
  const uiConfig = field?.uiConfig || {}
  const hasConfiguredDefault = Object.prototype.hasOwnProperty.call(uiConfig, 'defaultValue')
  const configuredDefault = uiConfig.defaultValue
  if (hasConfiguredDefault && (configuredDefault === null || configuredDefault === '')) {
    return ''
  }
  if (hasConfiguredDefault) {
    const match = options.find(option => String(option.value) === String(configuredDefault))
    if (match) return match.value
  }
  return options[0]?.value ?? ''
}

export function getFieldUiLabel(field, key, fallback) {
  const value = field?.uiConfig?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function usesPlainRadios(field) {
  return field?.uiConfig?.display === 'radio'
}

export function getNumericMinimum(field) {
  const value = Number(field?.uiConfig?.minimum)
  return Number.isFinite(value) ? value : 0
}

export function getNumericPrecision(field) {
  const value = Number(field?.uiConfig?.precision)
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

export function getDateDefaultDays(field) {
  const value = Number(field?.uiConfig?.defaultDays)
  return Number.isInteger(value) && value >= 1 && value <= 366 ? value : 30
}

export function getNumericSummaryPrefix(field) {
  return getFieldUiLabel(field, 'minSummaryPrefix', '≥')
}

export function getDependentOptions(field = {}, node = {}) {
  const sourceKey = field?.uiConfig?.optionSourceKey
  const sourceValue = sourceKey ? node?.formData?.[sourceKey] : undefined
  const optionsByValue = field?.optionsByValue
  if (sourceKey && !sourceValue) return []
  if (
    sourceKey
    && optionsByValue
    && typeof optionsByValue === 'object'
    && Array.isArray(optionsByValue[sourceValue])
  ) {
    return optionsByValue[sourceValue]
  }
  return Array.isArray(field?.options) ? field.options : []
}

export function getDependentMultiDisplay(field = {}, node = {}) {
  const sourceKey = field?.uiConfig?.optionSourceKey
  const sourceValue = sourceKey ? node?.formData?.[sourceKey] : undefined
  const configured = field?.uiConfig?.displayByValue?.[sourceValue]
  return configured === 'checkbox' ? 'checkbox' : 'select'
}
