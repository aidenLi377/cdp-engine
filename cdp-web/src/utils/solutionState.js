const FIELD_TOKEN_SEPARATOR = ':'

function cloneSerializableValue(value) {
  if (value == null) return value
  if (Array.isArray(value)) {
    return value
      .map((item) => cloneSerializableValue(item))
      .filter((item) => item !== undefined)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    const result = {}
    for (const [key, entry] of Object.entries(value)) {
      const cloned = cloneSerializableValue(entry)
      if (cloned !== undefined) {
        result[key] = cloned
      }
    }
    return result
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return value
  }
  return undefined
}

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
    displayName: typeof node?.displayName === 'string' ? node.displayName : '',
    packageType: node?.packageType ?? null,
    operator: node?.operator ?? null,
    formData: node?.formData ?? {},
    modeData: node?.modeData ?? {},
  }))
}

export function getNodeDisplayName(node, index = 0) {
  const displayName = String(node?.displayName || '').trim()
  if (displayName) return displayName
  return `节点 ${index + 1}`
}

export function getNodeDisplayNameById(nodeList, nodeId) {
  const nodes = Array.isArray(nodeList) ? nodeList : []
  const index = nodes.findIndex((node) => node?.id === nodeId)
  if (index < 0) return ''
  return getNodeDisplayName(nodes[index], index)
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
        displayName: typeof node?.displayName === 'string' ? node.displayName : '',
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

export function serializeCustomFieldsForSolution(customFields) {
  const fieldList = Array.isArray(customFields) ? customFields : []

  return fieldList.map((cf) => ({
    id: cf?.id ?? null,
    name: cf?.name ?? '',
    type: cf?.type ?? '',
    group: cf?.group ?? '',
    defaultValue: cloneSerializableValue(cf?.defaultValue) ?? {},
    bindings: (Array.isArray(cf?.bindings) ? cf.bindings : [])
      .map((binding) => ({
        nodeId: binding?.nodeId ?? null,
        fieldKey: binding?.fieldKey ?? null,
      }))
      .filter((binding) => binding.nodeId && binding.fieldKey),
  }))
}

// --- Custom Fields (1:N mapping) ---

/**
 * Build usage sections from custom fields list.
 * Each custom field becomes a section with bound node info for highlighting.
 */
export function buildCustomFieldSections(customFields, nodes) {
  const fieldList = Array.isArray(customFields) ? customFields : []
  if (fieldList.length === 0) return []

  const nodeMap = new Map()
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    nodeMap.set(String(node?.id), node)
  })

  return fieldList.map((cf) => {
    const boundNodes = []
    ;(Array.isArray(cf.bindings) ? cf.bindings : []).forEach((binding) => {
      const node = nodeMap.get(String(binding.nodeId))
      if (!node) return
      const field = (Array.isArray(node.schema) ? node.schema : []).find(
        (f) => f.key === binding.fieldKey
      )
      if (!field) return
      boundNodes.push({
        nodeId: node.id,
        nodeDisplayName: getNodeDisplayNameById(nodes, node.id),
        packageType: node.packageType,
        fieldKey: field.key,
        fieldLabel: field.Label || field.label || field.key,
        widgetType: field.Widget_Type,
        options: field.options || [],
      })
    })

    return {
      customFieldId: cf.id,
      name: cf.name,
      type: cf.type,
      group: cf.group || '',
      defaultValue: cf.defaultValue || {},
      bindings: boundNodes,
    }
  })
}

/**
 * Sync a custom field's value to all bound nodes' formData/modeData.
 * Mutates nodes in place. Returns nodes for chaining.
 */
export function syncCustomFieldValue(nodes, customFieldId, customFields, newValue) {
  const cfs = Array.isArray(customFields) ? customFields : []
  const cf = cfs.find((c) => c.id === customFieldId)
  if (!cf) return nodes

  const nodeMap = new Map()
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    nodeMap.set(String(node?.id), node)
  })

  ;(Array.isArray(cf.bindings) ? cf.bindings : []).forEach((binding) => {
    const node = nodeMap.get(String(binding.nodeId))
    if (!node) return

    if (!node.formData) node.formData = {}
    if (Array.isArray(newValue)) {
      node.formData[binding.fieldKey] = [...newValue]
    } else if (typeof newValue === 'object' && newValue !== null) {
      // Spread-existing merge so we don't lose other properties
      node.formData[binding.fieldKey] = { ...(node.formData[binding.fieldKey] || {}), ...newValue }
      // Clean up mode property — it belongs in modeData only
      if ('mode' in node.formData[binding.fieldKey]) {
        delete node.formData[binding.fieldKey].mode
      }
    } else {
      node.formData[binding.fieldKey] = newValue
    }

    // If value contains a mode property, sync it to modeData
    if (newValue && typeof newValue === 'object' && newValue.mode !== undefined) {
      if (!node.modeData) node.modeData = {}
      node.modeData[binding.fieldKey] = newValue.mode
    }
  })

  return nodes
}

/**
 * Get the set of fieldKeys bound by a specific custom field for a given node.
 * Used for highlight detection: call per node to check which fields should glow.
 */
export function getNodeBindingFieldKeys(customFieldId, customFields) {
  const cfs = Array.isArray(customFields) ? customFields : []
  const cf = cfs.find((c) => c.id === customFieldId)
  if (!cf) return []

  return (Array.isArray(cf.bindings) ? cf.bindings : []).map((b) => b)
}
