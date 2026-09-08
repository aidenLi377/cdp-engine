function normalizeParameterName(value) {
  return String(value || '').trim()
}

export function collectUniqueCustomFieldNames(solutions) {
  const names = new Set()
  ;(Array.isArray(solutions) ? solutions : []).forEach((solution) => {
    ;(Array.isArray(solution?.customFields) ? solution.customFields : []).forEach((field) => {
      const name = normalizeParameterName(field?.name)
      if (name) names.add(name)
    })
  })
  return [...names]
}

export function analyzeBatchCustomFieldCompatibility(solutions) {
  const source = Array.isArray(solutions) ? solutions : []
  const groups = new Map()

  source.forEach((solution) => {
    const solutionId = String(solution?.id || solution?.name || '')
    ;(Array.isArray(solution?.customFields) ? solution.customFields : []).forEach((field) => {
      const name = normalizeParameterName(field?.name)
      if (!name) return
      if (!groups.has(name)) {
        groups.set(name, {
          name,
          types: new Set(),
          solutionIds: new Set(),
          bindingCount: 0,
        })
      }
      const group = groups.get(name)
      const type = normalizeParameterName(field?.type)
      if (type) group.types.add(type)
      if (solutionId) group.solutionIds.add(solutionId)
      group.bindingCount += Array.isArray(field?.bindings) ? field.bindings.length : 0
    })
  })

  return [...groups.values()].map((group) => {
    const types = [...group.types]
    return {
      name: group.name,
      type: types.length === 1 ? types[0] : types.join(' / '),
      types,
      compatible: types.length <= 1,
      solutionCount: group.solutionIds.size,
      totalSolutionCount: source.length,
      coverageComplete: source.length > 0 && group.solutionIds.size === source.length,
      bindingCount: group.bindingCount,
    }
  })
}

export function buildBatchCustomFieldSections(entries, buildSections) {
  const sectionMap = new Map()

  ;(Array.isArray(entries) ? entries : []).forEach((entry) => {
    const sections = buildSections(
      entry?.record?.customFields || [],
      entry?.nodes || [],
    )

    sections.forEach((section) => {
      const name = normalizeParameterName(section?.name)
      if (!name) return

      if (!sectionMap.has(name)) {
        sectionMap.set(name, {
          ...section,
          customFieldId: `batch:${name}`,
          bindings: [],
          entryIds: new Set(),
        })
      }

      const merged = sectionMap.get(name)
      merged.entryIds.add(entry.id)
      merged.bindings.push(
        ...(section.bindings || []).map((binding) => ({
          ...binding,
          entryId: entry.id,
          crowdName: entry.crowdName,
          sourceSolutionName: entry.solutionName,
        })),
      )
    })
  })

  return [...sectionMap.values()].map((section) => ({
    ...section,
    entryCount: section.entryIds.size,
    entryIds: undefined,
  }))
}
