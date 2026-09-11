import { computed, reactive } from 'vue'
import {
  CATEGORY_ITEM_TUTORIAL_ID,
  CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
  DMP_BATCH_TUTORIAL_TAGS,
  GUIDED_TUTORIAL_STEPS,
  PARAMETER_BATCH_TUTORIAL_VALUES,
  PULL_ANALYSIS_GROUP_TUTORIAL_VALUES,
  SOLUTION_REUSE_TUTORIAL_VALUES,
} from '../utils/guidedTutorialConfig.js'
import {
  captureTutorialSessionSnapshot,
  clearTutorialCheckpoint,
  recordTutorialCheckpoint,
  recordTutorialCompletion,
  tutorialSnapshotAppMode,
} from '../utils/tutorialProgress.js'

const tutorialState = reactive({
  active: false,
  taskId: '',
  stepIndex: 0,
  resumed: false,
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
    pullBaseSolutionId: '',
    pullOwnDraftId: '',
    pullOwnSolutionId: '',
    pullCompetitorDraftId: '',
    pullCompetitorSolutionId: '',
    pullFolderId: '',
    pullFolderMemberIds: [],
    pullNodeCount: 0,
    pullOperators: [],
    pullBatchStatus: 'idle',
    pullBatchCompletedCount: 0,
    pullBatchFailedNames: [],
    pullBatchError: '',
    pullBatchCategoryApplied: false,
    pullBatchCompetitorApplied: false,
    pullBatchCompatibility: [],
    pullBatchPackageNames: [],
    pullVisitedPackageIndexes: [],
    pullBatchRound: '',
    pullBaselineStatus: 'idle',
    pullBaselineCompletedCount: 0,
    pullBaselineFailedNames: [],
    pullBaselineError: '',
    pullSecondStatus: 'idle',
    pullSecondCompletedCount: 0,
    pullSecondFailedNames: [],
    pullSecondError: '',
    parameterBatchRows: [],
    parameterBatchPackageNames: [],
    parameterBatchStatus: 'idle',
    parameterBatchCompletedCount: 0,
    parameterBatchFailedNames: [],
    parameterBatchError: '',
    comboCompletedCount: 0,
    comboError: '',
  },
})

const steps = computed(() => GUIDED_TUTORIAL_STEPS[tutorialState.taskId] || [])
const currentStep = computed(() => steps.value[tutorialState.stepIndex] || null)
let checkpointTimer = 0

function cloneSerializable(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function persistCurrentCheckpoint({ immediate = false } = {}) {
  if (typeof window === 'undefined' || !tutorialState.active || !tutorialState.taskId || !currentStep.value) return
  window.clearTimeout(checkpointTimer)
  const save = () => {
    if (!tutorialState.active || !tutorialState.taskId || !currentStep.value) return
    const sessionSnapshot = captureTutorialSessionSnapshot()
    const stepCheckpoint = {
      stepId: currentStep.value.id,
      stepIndex: tutorialState.stepIndex,
      stepTitle: currentStep.value.title || '',
      appMode: tutorialSnapshotAppMode(sessionSnapshot, 'workbench'),
      context: cloneSerializable(tutorialState.context),
      sessionSnapshot,
    }
    void recordTutorialCheckpoint(tutorialState.taskId, stepCheckpoint).catch(() => {
      // A temporary sync error must never block the interactive tutorial.
    })
  }
  if (immediate) save()
  else checkpointTimer = window.setTimeout(save, 360)
}

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
    pullBaseSolutionId: '',
    pullOwnDraftId: '',
    pullOwnSolutionId: '',
    pullCompetitorDraftId: '',
    pullCompetitorSolutionId: '',
    pullFolderId: '',
    pullFolderMemberIds: [],
    pullNodeCount: 0,
    pullOperators: [],
    pullBatchStatus: 'idle',
    pullBatchCompletedCount: 0,
    pullBatchFailedNames: [],
    pullBatchError: '',
    pullBatchCategoryApplied: false,
    pullBatchCompetitorApplied: false,
    pullBatchCompatibility: [],
    pullBatchPackageNames: [],
    pullVisitedPackageIndexes: [],
    pullBatchRound: '',
    pullBaselineStatus: 'idle',
    pullBaselineCompletedCount: 0,
    pullBaselineFailedNames: [],
    pullBaselineError: '',
    pullSecondStatus: 'idle',
    pullSecondCompletedCount: 0,
    pullSecondFailedNames: [],
    pullSecondError: '',
    parameterBatchRows: [],
    parameterBatchPackageNames: [],
    parameterBatchStatus: 'idle',
    parameterBatchCompletedCount: 0,
    parameterBatchFailedNames: [],
    parameterBatchError: '',
    comboCompletedCount: 0,
    comboError: '',
  })
}

export function startGuidedTutorial(taskId = CATEGORY_ITEM_TUTORIAL_ID, options = {}) {
  if (!GUIDED_TUTORIAL_STEPS[taskId]) return false
  resetContext()
  tutorialState.taskId = taskId
  const requestedStepId = String(options?.stepId || '')
  const requestedIndex = GUIDED_TUTORIAL_STEPS[taskId].findIndex(step => step.id === requestedStepId)
  const fallbackIndex = Number.isInteger(options?.stepIndex) ? options.stepIndex : 0
  tutorialState.stepIndex = Math.min(
    Math.max(requestedIndex >= 0 ? requestedIndex : fallbackIndex, 0),
    GUIDED_TUTORIAL_STEPS[taskId].length - 1,
  )
  if (options?.context && typeof options.context === 'object') {
    Object.assign(tutorialState.context, cloneSerializable(options.context))
  }
  tutorialState.resumed = options?.resume === true
  tutorialState.active = true
  persistCurrentCheckpoint({ immediate: true })
  return true
}

export function stopGuidedTutorial({ saveCheckpoint = true } = {}) {
  if (saveCheckpoint) persistCurrentCheckpoint({ immediate: true })
  else if (typeof window !== 'undefined') window.clearTimeout(checkpointTimer)
  tutorialState.active = false
  tutorialState.taskId = ''
  tutorialState.stepIndex = 0
  tutorialState.resumed = false
  resetContext()
}

export function completeGuidedTutorialStep(stepId) {
  if (!tutorialState.active || currentStep.value?.id !== stepId) return false
  if (tutorialState.stepIndex < steps.value.length - 1) {
    tutorialState.stepIndex += 1
  }
  persistCurrentCheckpoint()
  return true
}

export function goToGuidedTutorialStep(stepId) {
  if (!tutorialState.active) return false
  const index = steps.value.findIndex((step) => step.id === stepId)
  if (index < 0) return false
  tutorialState.stepIndex = index
  persistCurrentCheckpoint()
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
  if (!tutorialState.active || tutorialState.stepIndex !== steps.value.length - 1) return false
  const context = tutorialState.context
  const resultChecks = {
    'tutorial-complete': context.automationStatus === 'success',
    'dmp-tutorial-complete': context.batchStatus === 'completed' && context.comparisonCopied === true,
    'solution-tutorial-complete': context.firstAutomationStatus === 'success' && context.secondAutomationStatus === 'success',
    'pull-group-complete': context.pullBaselineStatus === 'completed' && context.pullBaselineCompletedCount === 3
      && context.pullSecondStatus === 'completed' && context.pullSecondCompletedCount === 3,
    'parameter-batch-complete': context.parameterBatchStatus === 'completed' && context.parameterBatchCompletedCount === 4,
    'combo-complete': context.comboCompletedCount === 9 && !context.comboError,
  }
  if (resultChecks[currentStep.value?.id] !== true) return false
  const completedTaskId = tutorialState.taskId
  if (completedTaskId) {
    void recordTutorialCompletion(completedTaskId).catch(() => {
      // Progress synchronization must never prevent the user from finishing the tutorial.
    })
    void clearTutorialCheckpoint(completedTaskId).catch(() => {})
  }
  stopGuidedTutorial({ saveCheckpoint: false })
  return true
}

export function useGuidedTutorial() {
  return {
    state: tutorialState,
    currentStep,
    steps,
    productIds: CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS,
    dmpTags: DMP_BATCH_TUTORIAL_TAGS,
    solutionValues: SOLUTION_REUSE_TUTORIAL_VALUES,
    pullAnalysisValues: PULL_ANALYSIS_GROUP_TUTORIAL_VALUES,
    parameterBatchValues: PARAMETER_BATCH_TUTORIAL_VALUES,
    start: startGuidedTutorial,
    stop: stopGuidedTutorial,
    finish: finishGuidedTutorial,
    completeStep: completeGuidedTutorialStep,
    goToStep: goToGuidedTutorialStep,
    isStep: isGuidedTutorialStep,
    updateContext: updateGuidedTutorialContext,
  }
}
