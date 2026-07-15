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
    getReadyTagIds,
    buildRequest,
    finalizeRows,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
