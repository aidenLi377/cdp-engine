import { computed, reactive } from 'vue'
import {
  CATEGORY_ITEM_TUTORIAL_ID,
  CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
  CATEGORY_ITEM_TUTORIAL_STEPS,
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
  },
})

const currentStep = computed(() => CATEGORY_ITEM_TUTORIAL_STEPS[tutorialState.stepIndex] || null)

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
  })
}

export function startGuidedTutorial(taskId = CATEGORY_ITEM_TUTORIAL_ID) {
  if (taskId !== CATEGORY_ITEM_TUTORIAL_ID) return false
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
  if (tutorialState.stepIndex < CATEGORY_ITEM_TUTORIAL_STEPS.length - 1) {
    tutorialState.stepIndex += 1
  }
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
  try {
    window.localStorage.setItem(
      `guided-tutorial.completed.${CATEGORY_ITEM_TUTORIAL_ID}`,
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
    steps: CATEGORY_ITEM_TUTORIAL_STEPS,
    productIds: CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
    start: startGuidedTutorial,
    stop: stopGuidedTutorial,
    finish: finishGuidedTutorial,
    completeStep: completeGuidedTutorialStep,
    isStep: isGuidedTutorialStep,
    updateContext: updateGuidedTutorialContext,
  }
}
