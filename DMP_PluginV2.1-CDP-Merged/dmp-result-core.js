(function attachDmpResultCore(root) {
  'use strict'

  const ALL_COLUMNS = [
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

  const LEGACY_COVERAGE_XPATH = '/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div/div[1]/div[3]/div[2]/strong'
  const COVERAGE_LABELS = ['覆盖人数', '人群人数', '人群规模', '覆盖用户数', '预计覆盖']
  const EXTENSION_ROOT_SELECTOR = '#dmp-copilot-root, #dmp-copilot-mini-btn, #coverageValue'

  function normalizeDomText(value) {
    const raw = String(value ?? '')
    const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFKC') : raw
    return normalized
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function parseCoverageCount(value) {
    const normalized = normalizeDomText(value).replace(/[，,]/g, '')
    if (!normalized || /^(?:--?|暂无|无数据|未计算)$/.test(normalized)) return null

    const match = normalized.match(/(\d+(?:\.\d+)?)\s*(亿|万|[kKmM])?/)
    if (!match) return null

    const trailingText = normalized.slice((match.index || 0) + match[0].length).trimStart()
    if (trailingText.startsWith('%')) return null

    const unit = String(match[2] || '').toLowerCase()
    const multiplier = unit === '亿'
      ? 100000000
      : unit === '万'
        ? 10000
        : unit === 'k'
          ? 1000
          : unit === 'm'
            ? 1000000
            : 1
    const count = Math.round(Number.parseFloat(match[1]) * multiplier)
    return Number.isFinite(count) && count > 0 ? count : null
  }

  function normalizeCrowdName(value) {
    return normalizeDomText(value)
  }

  function compactCrowdName(value) {
    return normalizeCrowdName(value).replace(/\s+/g, '')
  }

  function isExtensionNode(node) {
    try {
      return Boolean(node?.closest?.(EXTENSION_ROOT_SELECTOR))
    } catch {
      return false
    }
  }

  function readCoverageFromNode(node, requireLabel) {
    if (!node || isExtensionNode(node)) return null
    let text = normalizeDomText(node.textContent)
    if (!text) return null

    if (requireLabel) {
      const matchedLabels = COVERAGE_LABELS.filter((label) => text.includes(label))
      if (matchedLabels.length === 0) return null
      for (const label of matchedLabels) text = text.replaceAll(label, ' ')
    }
    return parseCoverageCount(text)
  }

  function findCoverageCount(rootDocument) {
    const doc = rootDocument || root.document
    if (!doc) return null

    // Keep the original locator first so existing DMP layouts behave exactly as before.
    try {
      const xpathType = doc.defaultView?.XPathResult?.FIRST_ORDERED_NODE_TYPE
        ?? root.XPathResult?.FIRST_ORDERED_NODE_TYPE
        ?? 9
      const legacyNode = doc.evaluate?.(LEGACY_COVERAGE_XPATH, doc, null, xpathType, null)?.singleNodeValue
      const legacyCount = readCoverageFromNode(legacyNode, false)
      if (legacyCount) return legacyCount
    } catch {
      // Continue with semantic locators when the old absolute XPath is unavailable.
    }

    const semanticSelector = [
      '[data-testid*="coverage"]',
      '[data-testid*="crowd-count"]',
      '[class*="coverage-count"]',
      '[class*="coverageCount"]',
      '[class*="crowd-count"]',
      '[class*="crowdCount"]',
    ].join(', ')
    try {
      for (const node of Array.from(doc.querySelectorAll?.(semanticSelector) || [])) {
        const count = readCoverageFromNode(node, false)
        if (count) return count
      }
    } catch {
      // A selector mismatch must not prevent the label-based fallback below.
    }

    let labelNodes = []
    try {
      labelNodes = Array.from(doc.querySelectorAll?.('span, div, label, p, dt, dd, th, td') || [])
        .filter((node) => {
          if (isExtensionNode(node)) return false
          const text = normalizeDomText(node.textContent)
          return text.length <= 100 && COVERAGE_LABELS.some((label) => text.includes(label))
        })
        .sort((left, right) => normalizeDomText(left.textContent).length - normalizeDomText(right.textContent).length)
    } catch {
      return null
    }

    for (const labelNode of labelNodes) {
      const directCount = readCoverageFromNode(labelNode, true)
      if (directCount) return directCount

      const nearbyNodes = [
        labelNode.nextElementSibling,
        labelNode.previousElementSibling,
        labelNode.parentElement?.nextElementSibling,
      ]
      for (const nearbyNode of nearbyNodes) {
        const nearbyCount = readCoverageFromNode(nearbyNode, false)
        if (nearbyCount) return nearbyCount
      }

      let ancestor = labelNode.parentElement
      for (let depth = 0; ancestor && depth < 2; depth += 1, ancestor = ancestor.parentElement) {
        const ancestorText = normalizeDomText(ancestor.textContent)
        if (ancestorText.length > 180) break
        const ancestorCount = readCoverageFromNode(ancestor, true)
        if (ancestorCount) return ancestorCount
      }
    }

    return null
  }

  function getCrowdRowTexts(row) {
    const nodes = [row]
    try {
      nodes.push(...Array.from(row?.querySelectorAll?.('td, td *') || []))
    } catch {
      // The row text itself remains a valid fallback.
    }

    const values = []
    for (const node of nodes) {
      const text = normalizeCrowdName(node?.textContent)
      if (text) values.push(text)
      const title = normalizeCrowdName(node?.getAttribute?.('title'))
      if (title) values.push(title)
    }
    return [...new Set(values)]
  }

  function findCrowdRowByName(rows, targetName) {
    const target = compactCrowdName(targetName)
    if (!target) return null

    const exactMatches = []
    const partialMatches = []
    for (const row of Array.from(rows || [])) {
      const candidates = getCrowdRowTexts(row).map(compactCrowdName).filter(Boolean)
      if (candidates.some((candidate) => candidate === target)) {
        exactMatches.push(row)
        continue
      }
      if (target.length >= 3 && candidates.some((candidate) => candidate.includes(target))) {
        partialMatches.push(row)
      }
    }

    if (exactMatches.length > 0) return exactMatches[0]
    return partialMatches.length === 1 ? partialMatches[0] : null
  }

  function getReadyTagIds(conditionCache) {
    return Object.entries(conditionCache || {})
      .filter(([, options]) => Array.isArray(options) && options.length > 0)
      .map(([tagId]) => String(tagId))
  }

  function buildRequest(payload, tagId, tagInfo, conditionCache) {
    const body = JSON.parse(JSON.stringify(payload?.payload || {}))
    delete body.multiGroupOptions

    if (tagInfo?.needCondition === true) {
      const options = conditionCache?.[String(tagId)]
      if (!Array.isArray(options) || options.length === 0) {
        return { ok: false, error: '未配置下钻条件' }
      }
      body.multiGroupOptions = JSON.parse(JSON.stringify(options))
    }

    const id = String(tagId)
    let url = String(payload?.url || '')
    if (/\/tag\/\d+/.test(url)) url = url.replace(/\/tag\/\d+/, `/tag/${id}`)
    if (/tagId=\d+/.test(url)) url = url.replace(/tagId=\d+/, `tagId=${id}`)
    if (/\/analysis\/\d+/.test(url)) url = url.replace(/\/analysis\/\d+/, `/analysis/${id}`)
    if (body.tagId !== undefined) body.tagId = Number.parseInt(id, 10)

    return { ok: true, url, body }
  }

  function isValidResultRow(row) {
    const detail = String(row?.['特征明细'] || '')
    const percentage = row?.['人群占比'] === '-' ? Number.NaN : Number.parseFloat(row?.['人群占比'])
    return !detail.includes('⚠️') && !detail.includes('❌') && Number.isFinite(percentage)
  }

  function finalizeRows(rawRows, totalCoverageCount, excludedTagIds) {
    const rows = Array.isArray(rawRows) ? rawRows : []
    const totalCoverage = Number(totalCoverageCount) > 0 ? Number(totalCoverageCount) : 0
    const excluded = new Set((excludedTagIds || []).map(String))
    const sumMap = {}

    for (const row of rows) {
      if (!isValidResultRow(row)) continue
      const tagName = row['标签名称']
      const percentage = Number.parseFloat(row['人群占比'])
      sumMap[tagName] = (sumMap[tagName] || 0) + percentage
    }

    return rows.map((row) => {
      const valid = isValidResultRow(row)
      const percentage = valid ? Number.parseFloat(row['人群占比']) : Number.NaN
      const tagId = String(row._dictTagId || '')
      const isExcluded = tagId !== '' && excluded.has(tagId)
      const totalPercentage = sumMap[row['标签名称']] || 0

      const coverageValue = totalCoverage > 0 && Number.isFinite(percentage)
        ? Math.round(totalCoverage * percentage / 100)
        : 0
      const coverageCount = coverageValue > 0 ? String(coverageValue) : '-'

      let rebaseValue = '-'
      if (Number.isFinite(percentage)) {
        if (isExcluded) {
          rebaseValue = row['人群占比']
        } else if (totalPercentage > 0) {
          rebaseValue = `${(percentage / totalPercentage) * 100}%`
        } else {
          rebaseValue = '0%'
        }
      }

      let rebaseCount = '-'
      if (isExcluded && coverageCount !== '-') {
        rebaseCount = coverageCount
      } else if (rebaseValue !== '-' && totalCoverage > 0) {
        const rebasePercentage = Number.parseFloat(rebaseValue)
        if (Number.isFinite(rebasePercentage)) {
          rebaseCount = String(Math.round(totalCoverage * rebasePercentage / 100))
        }
      }

      return {
        '所属大类': row['所属大类'] || '未知大类',
        '标签类型': row['标签类型'] || '未知类型',
        '标签名称': row['标签名称'] || '-',
        '特征明细': row['特征明细'] || '-',
        '人群占比': row['人群占比'] || '-',
        '覆盖人数': coverageCount,
        'Rebase': rebaseValue,
        'Rebase后人数': rebaseCount,
        'CTR': row.CTR || '-',
        'PPC': row.PPC || '-',
      }
    })
  }

  root.DmpResultCore = {
    ALL_COLUMNS,
    normalizeDomText,
    parseCoverageCount,
    findCoverageCount,
    normalizeCrowdName,
    findCrowdRowByName,
    getReadyTagIds,
    buildRequest,
    finalizeRows,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
