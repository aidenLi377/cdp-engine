import { computed, reactive } from 'vue'
import {
  CATEGORY_ITEM_TUTORIAL_ID,
  CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
  DMP_BATCH_TUTORIAL_TAGS,
  GUIDED_TUTORIAL_STEPS,
  SOLUTION_REUSE_TUTORIAL_VALUES,
} from '../utils/guidedTutorialConfig.js'

const tutorialState = reactive({
  active: false,
  taskId: '',
  stepIndex: 0,
  context: {
    nodeCount: 0,
    behaviors: [],
    recentDays: null,
    dateMode: '',
    dateRange: [],
    audienceName: '',
    pastedIdCount: 0,
    pasteError: '',
    copyError: '',
    automationStatus: 'idle',
    automationError: '',
    selectedTagIds: [],
    audienceNames: [],
    audienceCount: 0,
    batchStatus: 'idle',
    batchCompletedCount: 0,
    batchFailedNames: [],
    batchError: '',
    comparisonSelectedCount: 0,
    comparisonMetrics: [],
    labelOrderFirst: '',
    labelOrderDraftFirst: '',
    labelOrderAutoMoved: false,
    audienceOrder: [],
    audienceOrderChanged: false,
    comparisonCopied: false,
    workbenchDraftId: '',
    workbenchDraftSyncStatus: 'idle',
    workbenchDraftSyncError: '',
    solutionId: '',
    solutionName: '',
    defaultCrowdName: '',
    customFieldName: '',
    customFields: [],
    firstAutomationStatus: 'idle',
    firstAutomationError: '',
    firstAutomationSnapshot: null,
    secondAutomationStatus: 'idle',
    secondAutomationError: '',
    secondAutomationSnapshot: null,
    solutionNodeCount: 0,
    solutionStructureChanged: false,
    copiedNodeId: '',
    solutionOperator: '',
  },
})

const steps = computed(() => GUIDED_TUTORIAL_STEPS[tutorialState.taskId] || [])
const currentStep = computed(() => steps.value[tutorialState.stepIndex] || null)

function resetContext() {
  Object.assign(tutorialState.context, {
    nodeCount: 0,
    behaviors: [],
    recentDays: null,
    dateMode: '',
    dateRange: [],
    audienceName: '',
    pastedIdCount: 0,
    pasteError: '',
    copyError: '',
    automationStatus: 'idle',
    automationError: '',
    selectedTagIds: [],
    audienceNames: [],
    audienceCount: 0,
    batchStatus: 'idle',
    batchCompletedCount: 0,
    batchFailedNames: [],
    batchError: '',
    comparisonSelectedCount: 0,
    comparisonMetrics: [],
    labelOrderFirst: '',
    labelOrderDraftFirst: '',
    labelOrderAutoMoved: false,
    audienceOrder: [],
    audienceOrderChanged: false,
    comparisonCopied: false,
    workbenchDraftId: '',
    workbenchDraftSyncStatus: 'idle',
    workbenchDraftSyncError: '',
    solutionId: '',
    solutionName: '',
    defaultCrowdName: '',
    customFieldName: '',
    customFields: [],
    firstAutomationStatus: 'idle',
    firstAutomationError: '',
    firstAutomationSnapshot: null,
    secondAutomationStatus: 'idle',
    secondAutomationError: '',
    secondAutomationSnapshot: null,
    solutionNodeCount: 0,
    solutionStructureChanged: false,
    copiedNodeId: '',
    solutionOperator: '',
  })
}

export function startGuidedTutorial(taskId = CATEGORY_ITEM_TUTORIAL_ID) {
  if (!GUIDED_TUTORIAL_STEPS[taskId]) return false
  resetContext()
  tutorialState.taskId = taskId
  tutorialState.stepIndex = 0
  tutorialState.active = true
  return true
}

export function stopGuidedTutorial() {
  tutorialState.active = false
  tutorialState.taskId = ''
  tutorialState.stepIndex = 0
  resetContext()
}

export function completeGuidedTutorialStep(stepId) {
  if (!tutorialState.active || currentStep.value?.id !== stepId) return false
  if (tutorialState.stepIndex < steps.value.length - 1) {
    tutorialState.stepIndex += 1
  }
  return true
}

export function goToGuidedTutorialStep(stepId) {
  if (!tutorialState.active) return false
  const index = steps.value.findIndex((step) => step.id === stepId)
  if (index < 0) return false
  tutorialState.stepIndex = index
  return true
}

export function isGuidedTutorialStep(stepId) {
  return tutorialState.active && currentStep.value?.id === stepId
}

export function updateGuidedTutorialContext(patch) {
  if (!patch || typeof patch !== 'object') return
  Object.assign(tutorialState.context, patch)
}

export function finishGuidedTutorial() {
  const completedTaskId = tutorialState.taskId
  try {
    window.localStorage.setItem(
      `guided-tutorial.completed.${completedTaskId}`,
      new Date().toISOString(),
    )
  } catch {
    // Completion tracking is optional; the tutorial itself must still finish.
  }
  stopGuidedTutorial()
}

export function useGuidedTutorial() {
  return {
    state: tutorialState,
    currentStep,
    steps,
    productIds: CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
    dmpTags: DMP_BATCH_TUTORIAL_TAGS,
    solutionValues: SOLUTION_REUSE_TUTORIAL_VALUES,
    start: startGuidedTutorial,
    stop: stopGuidedTutorial,
    finish: finishGuidedTutorial,
    completeStep: completeGuidedTutorialStep,
    goToStep: goToGuidedTutorialStep,
    isStep: isGuidedTutorialStep,
    updateContext: updateGuidedTutorialContext,
  }
}
