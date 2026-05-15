const FIELD_TOKEN_SEPARATOR = ':'

export function fieldToken(nodeId, fieldKey) {
  return `${String(nodeId)}${FIELD_TOKEN_SEPARATOR}${String(fieldKey)}`
}

function parseFieldToken(token) {
  if (typeof token !== 'string') return null
  const separatorIndex = token.indexOf(FIELD_TOKEN_SEPARATOR)
  if (separatorIndex <= 0) return null

  return {
    nodeId: token.slice(0, separatorIndex),
    fieldKey: token.slice(separatorIndex + FIELD_TOKEN_SEPARATOR.length),
  }
}

function getSchemaKeys(node) {
  const schema = Array.isArray(node?.schema) ? node.schema : []
  return new Set(
    schema
      .map((field) => field?.key)
      .filter((key) => typeof key === 'string' && key.length > 0),
  )
}

export function serializeNodesForSolution(nodeList) {
  const nodes = Array.isArray(nodeList) ? nodeList : []

  return nodes.map((node) => ({
    id: node?.id ?? null,
    packageType: node?.packageType ?? null,
    operator: node?.operator ?? null,
    formData: node?.formData ?? {},
    modeData: node?.modeData ?? {},
  }))
}

export function cleanWorkbenchFieldIds(workbenchFieldIds, nodes) {
  const fieldIds = Array.isArray(workbenchFieldIds) ? workbenchFieldIds : []
  const nodeList = Array.isArray(nodes) ? nodes : []
  const schemaByNodeId = new Map(
    nodeList.map((node) => [String(node?.id), getSchemaKeys(node)]),
  )

  return fieldIds.filter((token) => {
    const parsed = parseFieldToken(token)
    if (!parsed) return false

    const schemaKeys = schemaByNodeId.get(parsed.nodeId)
    if (!schemaKeys) return false

    return schemaKeys.has(parsed.fieldKey)
  })
}

export function buildUsageSections(nodes, workbenchFieldIds) {
  const cleanedFieldIds = cleanWorkbenchFieldIds(workbenchFieldIds, nodes)
  if (cleanedFieldIds.length === 0) return []

  const selectedByNodeId = new Map()
  for (const token of cleanedFieldIds) {
    const parsed = parseFieldToken(token)
    if (!parsed) continue

    if (!selectedByNodeId.has(parsed.nodeId)) {
      selectedByNodeId.set(parsed.nodeId, new Set())
    }

    selectedByNodeId.get(parsed.nodeId).add(parsed.fieldKey)
  }

  const nodeList = Array.isArray(nodes) ? nodes : []
  const sections = []

  for (const node of nodeList) {
    const nodeId = String(node?.id)
    const selectedFieldKeys = selectedByNodeId.get(nodeId)
    if (!selectedFieldKeys || selectedFieldKeys.size === 0) continue

    const schema = Array.isArray(node?.schema) ? node.schema : []
    const fields = schema.filter((field) => selectedFieldKeys.has(field?.key))

    if (fields.length === 0) continue

    sections.push({
      index: sections.length,
      nodeId,
      node: {
        id: node?.id ?? null,
        packageType: node?.packageType ?? null,
        operator: node?.operator ?? null,
        formData: node?.formData ?? {},
        modeData: node?.modeData ?? {},
        schema: fields,
      },
      fields,
    })
  }

  return sections
}

export function isWorkbenchStructureLocked(solutionRecord) {
  return solutionRecord?.status === 'published'
}
