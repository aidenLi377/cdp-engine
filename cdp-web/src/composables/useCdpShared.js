// 共享 composable — 模块级单例，NormalMode 和 BatchMode 共享同一份缓存
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

// ---- 模块级单例 (所有调用者共享) ----
const schemaCache = ref({})
const logicMatrixCache = ref({})

// ---- 纯工具函数 ----
function getArray(val) { return Array.isArray(val) ? val : (val ? [val] : []) }

function formatOptions(options) {
  if (!options) return []
  if (options.length > 0 && typeof options[0] === 'object') return options
  return options.map(opt => ({ value: opt, label: String(opt) }))
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDynamicStyle(field) { return field.Description_Style }
function getDynamicDescription(field) { return field.Widget_Type === '日期_切换' ? "" : field.Description }

// ---- 表单可见性逻辑 ----
function isVisible(field, node) {
  if (field.key === 'item' && node.packageType === '商品行为') {
    return node.formData.selectedGoodsType === '指定商品ID'
  }
  if ((field.key === 'title_type' || field.key === 'keywords_type') && ['类目公域行为', '商品行为'].includes(node.packageType)) {
    const hasCate = getArray(node.formData.leafCates).length > 0 || getArray(node.formData.cate).length > 0
    if (!hasCate) return false
  }
  if ((field.key === 'title' || field.key === 'keywords') && ['类目公域行为', '商品行为'].includes(node.packageType)) {
    const switchVal = node.formData.title_type || node.formData.keywords_type
    if (switchVal !== '指定商品标题关键字') return false
  }
  if (field.isDefault) return true

  const matrixKeys = Object.keys(node.logicMatrix || {})
  if (matrixKeys.length === 0) return false

  const is2D = matrixKeys.some(k => k.includes('|'))
  let triggerCombinations = []

  if (is2D) {
    const channels = getArray(node.formData['channel'])
    const behaviors = getArray(node.formData['bhv'])
    if (channels.length === 0 || behaviors.length === 0) return false
    for (const ch of channels) {
      for (const bhv of behaviors) {
        triggerCombinations.push(`${ch}|${bhv}`)
      }
    }
  } else {
    if (matrixKeys.includes('DEFAULT')) {
      triggerCombinations = ['DEFAULT']
    } else {
      triggerCombinations = getArray(node.formData['bhv']).length > 0
        ? getArray(node.formData['bhv'])
        : getArray(node.formData['types'])
    }
    if (triggerCombinations.length === 0) return false
  }

  for (const comboKey of triggerCombinations) {
    const visibleFields = (node.logicMatrix || {})[comboKey] || []
    if (!visibleFields.includes(field.key)) return false
  }
  return true
}

// ---- 复选框/Channel 互斥逻辑 ----
function isCheckboxDisabled(field, opt, node) {
  if (field.key === 'channel') {
    const selectedVals = node.formData[field.key] || []
    if (selectedVals.includes('所有销售渠道')) return opt !== '所有销售渠道'
  }
  return false
}

function handleCheckboxChange(field, currentVals, node) {
  if (field.key === 'channel') {
    if (currentVals.includes('所有销售渠道') && currentVals.length > 1) {
      node.formData[field.key] = ['所有销售渠道']
    }
  }
}

// ---- 多选/列表数量提示 ----
function getSelectionCountHint(field, node) {
  if (['搜索多选', '列表输入', '复选组'].includes(field.Widget_Type)) {
    if (['channel', 'bhv'].includes(field.key)) return null
    const vals = node.formData[field.key]
    if (Array.isArray(vals) && vals.length > 0) {
      if (field.Widget_Type === '列表输入') {
        if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
          if (node.packageType === '类目公域行为') return `已输入 ${vals.length}/10`
          if (node.packageType === '商品行为') return `已输入 ${vals.length}/5`
        }
        if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
          if (node.packageType === '商品行为') return `已输入 ${vals.length}/50`
        }
        return `已输入 ${vals.length} 个`
      }
      const isLimited = ['leafCates', 'stdBrand', 'cate'].includes(field.key) || field.Label.includes('类目') || field.Label.includes('品牌')
      return isLimited ? `已选 ${vals.length}/10` : `已选 ${vals.length}`
    }
  }
  return null
}

function getListLimit(field, node) {
  if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
    if (node.packageType === '类目公域行为') return 10
    if (node.packageType === '商品行为') return 5
  }
  if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
    if (node.packageType === '商品行为') return 50
  }
  if (['leafCates', 'stdBrand', 'cate'].includes(field.key) || field.Label.includes('类目') || field.Label.includes('品牌')) {
    return 10
  }
  return 0
}

function handleListInput(key, node) {
  const currentVal = node.formData[key]
  if (!Array.isArray(currentVal)) return
  const finalArr = []
  currentVal.forEach(item => {
    if (item.includes(',')) finalArr.push(...item.split(',').filter(i => i.trim() !== ''))
    else finalArr.push(item)
  })
  let uniqueArr = [...new Set(finalArr)]
  const field = node.schema.find(f => f.key === key)
  if (field) {
    const limit = getListLimit(field, node)
    if (limit > 0 && uniqueArr.length > limit) {
      uniqueArr = uniqueArr.slice(0, limit)
      ElMessage.warning(`最多只能输入 ${limit} 个！`)
    }
  }
  node.formData[key] = uniqueArr
}

function handleMultiSelectChange(key, node) {
  const vals = node.formData[key]
  if (!Array.isArray(vals)) return
  let newVals = [...vals]
  if (newVals.length > 1 && newVals.includes('全部')) {
    if (newVals[newVals.length - 1] === '全部') newVals = ['全部']
    else newVals = newVals.filter(v => v !== '全部')
  }
  const field = node.schema.find(f => f.key === key)
  if (field) {
    const limit = getListLimit(field, node)
    if (limit > 0 && newVals.length > limit) {
      newVals = newVals.slice(0, limit)
      ElMessage.warning(`最多只能选择 ${limit} 个！`)
    }
  }
  node.formData[key] = newVals
}

// ---- 动态选项 ----
function getDynamicOptions(field, node) {
  if (node.packageType !== '商品行为') return field.options || []
  const channels = getArray(node.formData.channel)
  if (field.key === 'shop') {
    const isTmall = channels.includes('天猫')
    if (!isTmall) return ['全淘宝天猫']
    return field.options || []
  }
  if (field.key === 'selectedGoodsType') {
    const isTmallGlobal = channels.includes('天猫国际直营')
    if ((node.formData.shop === '全淘宝天猫' || !node.formData.shop) && !isTmallGlobal) {
      return ['任意品牌商品']
    }
    return field.options || []
  }
  return field.options || []
}

// ---- 日期辅助 ----
function getExactDateRangeHint(node) {
  const behaviors = getArray(node.formData.bhv)
  const isCategoryPackage = node.packageType === '类目公域行为'
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1
  const isTwoYears = isCategoryPackage && isOnlyPurchase
  const today = new Date()
  const minDate = new Date()
  if (isTwoYears) minDate.setFullYear(minDate.getFullYear() - 2)
  else minDate.setDate(minDate.getDate() - 366)
  return `可选范围：${formatDate(minDate)} 至 ${formatDate(today)} (最大跨度366天)`
}

function handleCalendarChange(val, node) {
  if (val && val.length === 2 && val[0] && !val[1]) {
    let dateObj = val[0]
    if (typeof dateObj === 'string' && dateObj.length === 8 && !dateObj.includes('-')) {
      const y = dateObj.substring(0, 4), m = dateObj.substring(4, 6), d = dateObj.substring(6, 8)
      dateObj = new Date(`${y}-${m}-${d}`)
    } else if (typeof dateObj === 'string') {
      dateObj = new Date(dateObj)
    }
    node.selectedFirstDate = dateObj
  } else {
    node.selectedFirstDate = null
  }
}

function disabledDate(time, node) {
  const behaviors = getArray(node.formData.bhv)
  const isCategoryPackage = node.packageType === '类目公域行为'
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1
  const isTwoYears = isCategoryPackage && isOnlyPurchase
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const minDate = new Date()
  if (isTwoYears) minDate.setFullYear(minDate.getFullYear() - 2)
  else minDate.setDate(minDate.getDate() - 366)
  minDate.setHours(0, 0, 0, 0)
  if (time.getTime() > today.getTime() || time.getTime() < minDate.getTime()) return true
  if (node.selectedFirstDate) {
    const oneDay = 24 * 3600 * 1000
    const diffDays = Math.abs((time.getTime() - node.selectedFirstDate.getTime()) / oneDay)
    if (diffDays > 366) return true
  }
  return false
}

// ---- 导出 ----
export function useCdpShared() {
  return {
    schemaCache, logicMatrixCache,
    getArray, formatOptions, formatDate,
    getDynamicStyle, getDynamicDescription,
    isVisible, isCheckboxDisabled, handleCheckboxChange,
    getSelectionCountHint, getListLimit, handleListInput, handleMultiSelectChange,
    getDynamicOptions,
    getExactDateRangeHint, handleCalendarChange, disabledDate
  }
}
