// Expand each Excel row across all source solutions. Bind by name, then by
// each solution's own field id; ids are never shared between solutions.
export function expandCombinationParameterRows(sources, rows, fieldName, syncValue, nonce = Date.now()) {
  const name = String(fieldName || '').trim()
  if (!sources.length || !rows.length || sources.length * rows.length > 100) throw new Error('单次最多生成 100 个人群包')
  if (sources.some(source => !(source.record?.customFields || []).some(field => String(field.name || '').trim() === name))) {
    throw new Error('该字段未覆盖全部方案，批量展开会产生条件重复的包；请先补齐各方案的同名字段绑定')
  }
  return rows.flatMap((row, rowIndex) => sources.map((source, sourceIndex) => {
    const record = structuredClone(source.record)
    const nodes = structuredClone(source.nodes)
    const fields = record.customFields.filter(field => String(field.name || '').trim() === name)
    fields.forEach(field => {
      syncValue(nodes, field.id, record.customFields, structuredClone(row.values))
      field.defaultValue = structuredClone(row.values)
    })
    const prefix = String(row.crowdName || row.values.join('+')).slice(0, 45)
    record.defaultCrowdName = `${prefix}｜${sourceIndex + 1}·${record.name || '方案'}`.slice(0, 80)
    return {
      id: `combination_parameter_${nonce}_${rowIndex}_${sourceIndex}`,
      solutionName: record.name || '未命名方案', crowdName: record.defaultCrowdName,
      record, nodes, sourceRecord: structuredClone(record), sourceNodes: structuredClone(nodes),
      generatedJson: null, automationStatus: 'idle',
      parameterBatchValues: structuredClone(row.values), parameterBatchSourceRow: row.sourceRow,
    }
  }))
}
