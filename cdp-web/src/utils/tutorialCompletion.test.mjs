import test from 'node:test'
import assert from 'node:assert/strict'
import { completedTutorialIds } from './tutorialCatalog.js'
import { startGuidedTutorial, finishGuidedTutorial, goToGuidedTutorialStep, updateGuidedTutorialContext, stopGuidedTutorial } from '../composables/useGuidedTutorial.js'
import { PARAMETER_BATCH_TUTORIAL_ID } from './guidedTutorialConfig.js'

test('visited or started entries never count as completed', () => {
  assert.deepEqual([...completedTutorialIds([
    { tutorialId: 'visited' },
    { tutorialId: 'started', completedAt: null },
    { tutorialId: 'invalid', completedAt: 'invalid' },
    { tutorialId: 'done', completedAt: '2026-09-07T03:00:31Z' },
  ])], ['done'])
})

test('entering a tutorial or reaching the final card without four successful packages cannot record completion', () => {
  startGuidedTutorial(PARAMETER_BATCH_TUTORIAL_ID)
  assert.equal(finishGuidedTutorial(), false)
  goToGuidedTutorialStep('parameter-batch-complete')
  assert.equal(finishGuidedTutorial(), false)
  updateGuidedTutorialContext({ parameterBatchStatus: 'partial', parameterBatchCompletedCount: 3 })
  assert.equal(finishGuidedTutorial(), false)
  stopGuidedTutorial()
  assert.equal(finishGuidedTutorial(), false)
})
