function normalizeSearchText(value) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function getOptionLabel(option) {
  if (option && typeof option === 'object') return option.label ?? option.value ?? ''
  return option ?? ''
}

function getCategoryMatch(label, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return null

  const segments = String(label ?? '')
    .split('>')
    .map(segment => normalizeSearchText(segment))

  // 保留原来可直接粘贴完整类目路径搜索的能力。
  if (normalizedQuery.includes('>')) {
    const normalizedPath = segments.join('>')
    const normalizedPathQuery = normalizedQuery
      .split('>')
      .map(segment => normalizeSearchText(segment))
      .join('>')
    const position = normalizedPath.indexOf(normalizedPathQuery)
    if (position < 0) return null
    return {
      levelIndex: segments.length - 1,
      isLeaf: true,
      matchType: normalizedPath === normalizedPathQuery ? 0 : (position === 0 ? 1 : 2),
      position,
    }
  }

  let bestMatch = null
  segments.forEach((segment, levelIndex) => {
    const position = segment.indexOf(normalizedQuery)
    if (position < 0) return

    const candidate = {
      // 类目层级越深越优先：三级 > 二级 > 一级。
      levelIndex,
      isLeaf: levelIndex === segments.length - 1,
      matchType: segment === normalizedQuery ? 0 : (position === 0 ? 1 : 2),
      position,
    }

    if (
      !bestMatch
      || candidate.levelIndex > bestMatch.levelIndex
      || (
        candidate.levelIndex === bestMatch.levelIndex
        && Number(candidate.isLeaf) > Number(bestMatch.isLeaf)
      )
      || (
        candidate.levelIndex === bestMatch.levelIndex
        && candidate.isLeaf === bestMatch.isLeaf
        && candidate.matchType < bestMatch.matchType
      )
      || (
        candidate.levelIndex === bestMatch.levelIndex
        && candidate.isLeaf === bestMatch.isLeaf
        && candidate.matchType === bestMatch.matchType
        && candidate.position < bestMatch.position
      )
    ) {
      bestMatch = candidate
    }
  })

  return bestMatch
}

/**
 * 搜索类目时优先展示关键词命中更深层级的选项。
 * 同一层级内依次按：叶子类目、完全匹配、前缀匹配、普通包含匹配排序。
 */
export function rankCategoryOptions(options, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return options
  const isFullPathQuery = normalizedQuery.includes('>')

  return options
    .map((option, originalIndex) => ({
      option,
      originalIndex,
      match: getCategoryMatch(getOptionLabel(option), normalizedQuery),
    }))
    .filter(item => item.match)
    .sort((left, right) => {
      if (isFullPathQuery) {
        return left.match.matchType - right.match.matchType
          || left.match.position - right.match.position
          || right.match.levelIndex - left.match.levelIndex
          || left.originalIndex - right.originalIndex
      }
      return right.match.levelIndex - left.match.levelIndex
        || Number(right.match.isLeaf) - Number(left.match.isLeaf)
        || left.match.matchType - right.match.matchType
        || left.match.position - right.match.position
        || left.originalIndex - right.originalIndex
    })
    .map(item => item.option)
}
