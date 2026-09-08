import { PARAMETER_BATCH_TUTORIAL_VALUES } from './guidedTutorialConfig.js'

// Each distinct brand must occupy one row; Excel row ordering is not a prerequisite.
export function matchesTutorialBrandColumn(rows) {
  const expected = PARAMETER_BATCH_TUTORIAL_VALUES.brands
  return Array.isArray(rows)
    && rows.length === expected.length
    && rows.every(row => Array.isArray(row) && row.length === 1 && expected.includes(row[0]))
    && new Set(rows.map(row => row[0])).size === expected.length
}

export function getParameterTutorialProgress(entries, { batchKind, running = false, errorMessage = '' } = {}) {
  const succeeded = entries.filter(entry => entry.automationStatus === 'success')
  const failed = entries.filter(entry => entry.automationStatus === 'failed')
  const validBatch = batchKind === 'parameter'
    && matchesTutorialBrandColumn(entries.map(entry => entry.parameterBatchValues))
  const complete = validBatch && succeeded.length === PARAMETER_BATCH_TUTORIAL_VALUES.brands.length
  const status = complete ? 'completed'
    : running ? 'running'
      : failed.length ? (succeeded.length ? 'partial' : 'failed') : 'idle'
  return {
    parameterBatchStatus: status,
    parameterBatchCompletedCount: succeeded.length,
    parameterBatchFailedNames: failed.map(entry => entry.crowdName || '未命名人群包'),
    parameterBatchError: complete ? '' : errorMessage,
    parameterBatchPackageNames: entries.map(entry => entry.crowdName || ''),
  }
}
