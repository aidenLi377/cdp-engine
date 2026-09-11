import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
  const guidedTutorial = readFileSync(join(currentDir, '..', 'composables', 'useGuidedTutorial.js'), 'utf8')
const tutorialCenter = readFileSync(join(currentDir, 'TutorialCenter.vue'), 'utf8')
const taskCenter = readFileSync(join(currentDir, 'TaskCenter.vue'), 'utf8')
const solutionCenter = readFileSync(join(currentDir, 'SolutionCenter.vue'), 'utf8')
const overlay = readFileSync(join(currentDir, 'GuidedTutorialOverlay.vue'), 'utf8')

test('guided tutorials keep an independent restorable snapshot for every reached step', () => {
  assert.match(guidedTutorial, /recordTutorialCheckpoint\(tutorialState\.taskId, stepCheckpoint\)/)
  assert.match(tutorialCenter, /latestCheckpoint\?\.stepCheckpoints/)
  assert.match(tutorialCenter, /history\[options\.stepId\]/)
  assert.match(tutorialCenter, /选择一个已走过的步骤继续/)
})

test('completed tutorials can also resume an interrupted repeat practice', () => {
  assert.match(tutorialCenter, /<section v-if="selectedCheckpoint" class="tutorial-resume">/)
  assert.doesNotMatch(tutorialCenter, /selectedCheckpoint && !isCompleted\(selectedId\)/)
  assert.match(tutorialCenter, /本次重新练习已保存/)
  assert.match(tutorialCenter, /继续本次练习/)
})

test('tutorial overview reassures users that interruptions never require restarting', () => {
  assert.match(tutorialCenter, /class="tutorial-hero__recovery-note"/)
  assert.match(tutorialCenter, /中断不用重来/)
  assert.match(tutorialCenter, /返回对应教程即可选择上次步骤继续/)
})

test('finishing a tutorial cannot recreate the checkpoint that completion just deleted', () => {
  assert.match(guidedTutorial, /stopGuidedTutorial\(\{ saveCheckpoint: false \}\)/)
  assert.match(guidedTutorial, /if \(saveCheckpoint\) persistCurrentCheckpoint/)
})

test('restoring a tutorial rebuilds live state in all three work areas', () => {
  assert.match(taskCenter, /function restoreDmpTutorialWorkspace\(\)/)
  assert.match(taskCenter, /guidedTutorialState\.resumed/)
  assert.match(solutionCenter, /const isResuming = tutorialSessionChanged && guidedTutorialState\.resumed/)
  assert.match(solutionCenter, /await restoreSolutionSession\(stored\)/)
})

test('overlay tracks every scroll container and repositions when the guide card changes size', () => {
  assert.match(overlay, /function getScrollableAncestors/)
  assert.match(overlay, /getScrollableAncestors\(element\)\.forEach/)
  assert.match(overlay, /window\.scrollBy/)
  assert.match(overlay, /watch\(cardRef/)
  assert.match(overlay, /cardResizeObserver\?\.observe/)
})
