import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesTutorialBrandColumn, getParameterTutorialProgress } from './parameterBatchTutorial.js'
import { buildParameterBatchRows } from './parameterBatch.js'
import { PARAMETER_BATCH_TUTORIAL_VALUES as values, PARAMETER_BATCH_TUTORIAL_ID, PARAMETER_BATCH_TUTORIAL_STEPS, GUIDED_TUTORIAL_STEPS } from './guidedTutorialConfig.js'
import { TUTORIAL_CATALOG, TUTORIAL_MILESTONE_TOTAL, countCompletedMilestones, nextTutorialId } from './tutorialCatalog.js'

const makeEntries = () => buildParameterBatchRows(values.brands.join('\r\n'), {
  allowedValues: values.brands, baseName: values.defaultCrowdName,
}).map(row => ({ parameterBatchValues: row.values, crowdName: row.crowdName, automationStatus: 'idle' }))

test('four Excel rows map to four distinct brand packages without CPB leaking into other names', () => {
  const entries = makeEntries()
  assert.equal(entries.length, 4)
  assert.equal(new Set(entries.map(entry => entry.crowdName)).size, 4)
  assert.equal(matchesTutorialBrandColumn(entries.map(entry => entry.parameterBatchValues)), true)
  entries.forEach((entry, index) => {
    assert.equal(entry.crowdName, `${values.defaultCrowdName}_${values.brands[index].split('/').at(-1)}`)
  })
})

test('brand input accepts reordered columns but rejects a header, duplicates, missing rows and multi-brand rows', () => {
  const column = values.brands.map(brand => [brand])
  assert.equal(matchesTutorialBrandColumn([...column].reverse()), true)
  assert.equal(matchesTutorialBrandColumn([['竞争品牌'], ...column]), false)
  assert.equal(matchesTutorialBrandColumn(column.slice(1)), false)
  assert.equal(matchesTutorialBrandColumn([column[0], column[0], ...column.slice(2)]), false)
  assert.equal(matchesTutorialBrandColumn([[...values.brands]]), false)
  assert.equal(matchesTutorialBrandColumn([['未知品牌'], ...column.slice(1)]), false)
})

test('queue reports running until remaining brands finish; only four real successes unlock completion', () => {
  const entries = makeEntries()
  const read = options => getParameterTutorialProgress(entries, { batchKind: 'parameter', ...options })
  assert.equal(read().parameterBatchStatus, 'idle')
  entries[0].automationStatus = 'failed'
  assert.equal(read({ running: true }).parameterBatchStatus, 'running')
  entries.slice(1).forEach(entry => { entry.automationStatus = 'success' })
  const partial = read({ errorMessage: '请检查登录' })
  assert.equal(partial.parameterBatchStatus, 'partial')
  assert.equal(partial.parameterBatchCompletedCount, 3)
  assert.deepEqual(partial.parameterBatchFailedNames, [entries[0].crowdName])
  entries[0].automationStatus = 'success'
  assert.equal(read({ errorMessage: '旧的失败信息' }).parameterBatchStatus, 'completed')
  assert.equal(read({ errorMessage: '旧的失败信息' }).parameterBatchError, '')
  assert.equal(getParameterTutorialProgress(entries, { batchKind: 'folder' }).parameterBatchStatus, 'idle')
  entries[0].parameterBatchValues = ['其他品牌']
  assert.notEqual(read().parameterBatchStatus, 'completed')
})

test('single-parameter batch lesson is a formal core skill and contributes one account milestone', () => {
  assert.equal(GUIDED_TUTORIAL_STEPS[PARAMETER_BATCH_TUTORIAL_ID], PARAMETER_BATCH_TUTORIAL_STEPS)
  const catalogItem = TUTORIAL_CATALOG.find(item => item.id === PARAMETER_BATCH_TUTORIAL_ID)
  assert.equal(catalogItem?.track, 'quick')
  assert.equal(catalogItem?.sequence, '03')
  assert.match(catalogItem?.businessProblem || '', /一行一个品牌批量生成人群包/)
  const ids = PARAMETER_BATCH_TUTORIAL_STEPS.map(step => step.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.indexOf('parameter-create-tasks') < ids.indexOf('parameter-confirm-run'))
  assert.equal(PARAMETER_BATCH_TUTORIAL_STEPS.find(step => step.id === 'parameter-wait-automation').nonBlocking, true)
  assert.equal(ids.at(-1), 'parameter-batch-complete')
  const prior = TUTORIAL_CATALOG
    .filter(item => item.id !== PARAMETER_BATCH_TUTORIAL_ID)
    .map(item => ({ tutorialId: item.id, completedAt: '2026-09-08T00:00:00Z' }))
  assert.equal(nextTutorialId(prior), PARAMETER_BATCH_TUTORIAL_ID)
  assert.equal(countCompletedMilestones(prior), TUTORIAL_MILESTONE_TOTAL - 1)
  assert.equal(
    countCompletedMilestones([
      ...prior,
      { tutorialId: PARAMETER_BATCH_TUTORIAL_ID, completedAt: '2026-09-08T00:00:00Z' },
    ]),
    TUTORIAL_MILESTONE_TOTAL,
  )
  assert.doesNotMatch(PARAMETER_BATCH_TUTORIAL_STEPS.map(step => `${step.eyebrow || ''}${step.title || ''}`).join('\n'), /番外篇/)
})
