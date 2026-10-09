// Imported official JSON may carry node-specific output choices that cannot
// currently be inferred from the package configuration (notably fromPoolId).
export function applyImportedEngineJsonFields(item, node, fallbackPoolId, preserveGeneratedPoolId) {
  const imported = node?.engineJsonImport
  if (Number.isInteger(imported?.fromPoolId) && imported.fromPoolId >= 0) {
    item.fromPoolId = imported.fromPoolId
  } else if (!preserveGeneratedPoolId) {
    item.fromPoolId = fallbackPoolId
  }

  const relativeDate = imported?.relativeDateValue
  if (
    node?.packageType === '单媒体智投'
    && item?.selectionLv3?.dateType === 'RELATIVE_RANGE'
    && relativeDate
  ) {
    const days = Number(node?.formData?.time?.days)
    if (
      Number.isInteger(days)
      && days >= 1
      && days <= 366
      && (relativeDate.present === true || days !== relativeDate.initialDays)
    ) {
      item.selectionLv3.dateValue = String(days)
    }
  }
  return item
}
