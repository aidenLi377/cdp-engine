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
