import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMBINATION_BATCH_TUTORIAL_ID,
  DMP_BATCH_TUTORIAL_ID,
  PULL_ANALYSIS_GROUP_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_ID,
} from './guidedTutorialConfig.js'
import {
  TUTORIAL_CATALOG,
  becameAllTutorialsComplete,
  isTutorialUnlocked,
  nextTutorialId,
} from './tutorialCatalog.js'

test('DMP batch tutorial is the first card and default next tutorial', () => {
  assert.equal(TUTORIAL_CATALOG[0].id, DMP_BATCH_TUTORIAL_ID)
  assert.equal(TUTORIAL_CATALOG[0].sequence, '01')
  assert.equal(nextTutorialId([]), DMP_BATCH_TUTORIAL_ID)
})

test('pull analysis lessons unlock only after their prerequisite tutorial is complete', () => {
  const completed = (tutorialId) => ({ tutorialId, completedAt: '2026-09-08T08:00:00.000Z' })

  assert.equal(isTutorialUnlocked(SOLUTION_REUSE_TUTORIAL_ID, []), true)
  assert.equal(isTutorialUnlocked(PULL_ANALYSIS_GROUP_TUTORIAL_ID, []), false)
  assert.equal(isTutorialUnlocked(COMBINATION_BATCH_TUTORIAL_ID, []), false)

  assert.equal(
    isTutorialUnlocked(PULL_ANALYSIS_GROUP_TUTORIAL_ID, [completed(SOLUTION_REUSE_TUTORIAL_ID)]),
    true,
  )
  assert.equal(
    isTutorialUnlocked(COMBINATION_BATCH_TUTORIAL_ID, [completed(PULL_ANALYSIS_GROUP_TUTORIAL_ID)]),
    true,
  )
})

test('celebration triggers only on the transition into all milestones complete', () => {
  const completed = (tutorialId) => ({ tutorialId, completedAt: '2026-09-08T08:00:00.000Z' })
  const allItems = TUTORIAL_CATALOG.map((item) => completed(item.id))
  const beforeFinal = allItems.filter((item) => item.tutorialId !== COMBINATION_BATCH_TUTORIAL_ID)

  assert.equal(becameAllTutorialsComplete(beforeFinal, allItems), true)
  assert.equal(becameAllTutorialsComplete(allItems, allItems), false)
  assert.equal(becameAllTutorialsComplete([], beforeFinal), false)
})
