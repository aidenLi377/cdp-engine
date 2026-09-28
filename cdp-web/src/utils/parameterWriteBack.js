function valuesById(items, keys) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [
    String(item?.id || ''),
    Object.fromEntries(keys.map((key) => [key, item?.[key]])),
  ]))
}

export function buildParameterWriteBackChanges(entries) {
  const changes = []
  for (const entry of Array.isArray(entries) ? entries : []) {
    const source = entry?.sourceRecord
    const record = entry?.record
    if (!source?.id || source.visibility !== 'private') continue
    const sourceNodes = valuesById(entry.sourceNodes, ['formData', 'modeData'])
    const nextNodes = valuesById(entry.nodes, ['formData', 'modeData'])
    const sourceFields = valuesById(source.customFields, ['defaultValue'])
    const nextFields = valuesById(record?.customFields, ['defaultValue'])
    if (sourceNodes.size !== nextNodes.size || sourceFields.size !== nextFields.size
      || [...sourceNodes.keys()].some((id) => !nextNodes.has(id))
      || [...sourceFields.keys()].some((id) => !nextFields.has(id))) {
      throw new Error(`“${source.name || '未命名方案'}”的结构已变化，无法只写回参数`)
    }
    const nodesChanged = [...sourceNodes].some(([id, values]) =>
      JSON.stringify(values) !== JSON.stringify(nextNodes.get(id)))
    const fieldsChanged = [...sourceFields].some(([id, values]) =>
      JSON.stringify(values) !== JSON.stringify(nextFields.get(id)))
    if (!nodesChanged && !fieldsChanged) continue
    changes.push({
      id: source.id,
      expectedVersion: source._version,
      nodes: entry.nodes.map((node) => ({
        id: String(node.id),
        formData: node.formData || {},
        modeData: node.modeData || {},
      })),
      customFields: (record?.customFields || []).map((field) => ({
        id: String(field.id),
        ...(Object.hasOwn(field, 'defaultValue') ? { defaultValue: field.defaultValue } : {}),
      })),
    })
  }
  return changes
}
