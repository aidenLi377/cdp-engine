<template>
  <el-dialog
    :model-value="modelValue"
    :title="customField?.name || '编辑自定义字段'"
    width="520px"
    :destroy-on-close="true"
    class="intercom-dialog"
    @close="$emit('update:modelValue', false)"
  >
    <div v-if="!customField" class="display-body-light" style="text-align:center;padding:20px">
      未选择字段
    </div>

    <template v-else>
      <div class="cf-edit-dialog-body">
        <!-- 编辑区 -->
        <div class="cf-edit-section">
          <div class="cf-edit-value-header">
            <div>
              <span class="display-body strong">编辑值</span>
              <small v-if="showBatchAction">可单次修改，也可按 Excel 行批量建包</small>
            </div>
            <button
              v-if="showBatchAction"
              type="button"
              class="cf-edit-batch-action"
              @click="emit('batch')"
            >
              <span aria-hidden="true"></span>
              Excel 批量
            </button>
          </div>

          <!-- 日期 -->
          <template v-if="isDateType">
            <el-radio-group v-model="editMode" size="small" class="intercom-radio-group" style="margin-bottom:10px">
              <el-radio-button value="recent">过去 N 天</el-radio-button>
              <DateQuickRangePopover @select="applyQuickDateRange">
                <el-radio-button value="range">固定日期</el-radio-button>
              </DateQuickRangePopover>
            </el-radio-group>
            <div v-if="editMode === 'recent'" style="display:flex;align-items:center;gap:8px">
              <el-input-number v-model="editValue.days" :min="1" :max="366" size="small" controls-position="right" class="intercom-input" style="width:120px" />
              <span class="display-body">天</span>
            </div>
            <div v-if="editMode === 'range'">
              <el-date-picker
                v-model="editValue.dateRange"
                type="daterange" range-separator="至"
                start-placeholder="开始日期" end-placeholder="结束日期"
                format="YYYY-MM-DD" value-format="YYYYMMDD"
                size="small" class="intercom-input" style="width:260px"
              />
            </div>
          </template>

          <!-- 数值 -->
          <template v-else-if="isNumberType">
            <el-radio-group v-model="editMode" size="small" class="intercom-radio-group" style="margin-bottom:10px">
              <el-radio-button value="unlimited">不限</el-radio-button>
              <el-radio-button value="min">≥ 最小值</el-radio-button>
              <el-radio-button value="range">自定义区间</el-radio-button>
            </el-radio-group>
            <div style="display:flex;align-items:center;gap:8px" v-if="editMode !== 'unlimited'">
              <el-input-number v-model="editValue.min" :min="0" :controls="false" placeholder="最小值" size="small" class="intercom-input" style="width:140px" />
              <span v-if="editMode === 'range'" class="display-body">—</span>
              <el-input-number v-if="editMode === 'range'" v-model="editValue.max" :min="0" :controls="false" placeholder="最大值" size="small" class="intercom-input" style="width:140px" />
            </div>
          </template>

          <!-- 搜索多选 -->
          <template v-else-if="isMultiSelect">
            <el-select-v2
              ref="tutorialSelectRef"
              v-model="editValue"
              :options="formattedOptions"
              multiple filterable clearable
              :placeholder="'搜索并选择' + customField.name"
              class="flex-1 intercom-input"
              style="width:100%"
              :popper-class="getTutorialSelectPopperClass()"
              :data-tutorial-target="getTutorialEditTarget()"
              @change="handleTutorialValueChange"
              @visible-change="handleTutorialSelectVisibleChange"
            />
          </template>

          <!-- 搜索单选 -->
          <template v-else-if="customField.type === '搜索单选'">
            <el-select-v2
              ref="tutorialSelectRef"
              v-model="editValue"
              :options="formattedOptions"
              filterable clearable
              :placeholder="'搜索并选择' + customField.name"
              class="flex-1 intercom-input"
              style="width:100%"
              :popper-class="getTutorialSelectPopperClass()"
              :data-tutorial-target="getTutorialEditTarget()"
              @change="handleTutorialValueChange"
              @visible-change="handleTutorialSelectVisibleChange"
            />
          </template>

          <!-- 复选组 -->
          <template v-else-if="customField.type === '复选组'">
            <el-checkbox-group v-model="editValue" class="custom-checkbox-group">
              <el-checkbox v-for="opt in formattedOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</el-checkbox>
            </el-checkbox-group>
          </template>

          <!-- 普通输入 -->
          <template v-else>
            <el-input v-model="editValue" class="intercom-input" :placeholder="'请输入' + customField.name" />
          </template>
        </div>

        <!-- 影响范围 -->
        <div class="cf-edit-section">
          <div class="cf-section-header">
            <div>
              <span class="display-body strong">影响范围</span>
              <span class="display-mono" style="margin-left:8px">{{ boundNodes.length }} 个组件</span>
            </div>
            <el-button
              v-if="onWriteBack"
              class="intercom-btn-outlined btn-small"
              :loading="writingBack"
              @click="writeBack"
            >
              同步到当前圈包画布
            </el-button>
          </div>
          <div class="cf-bound-list">
            <div v-for="bn in boundNodes" :key="bn.nodeId + bn.fieldKey" class="cf-bound-item">
              <span class="display-mono cf-bound-node-label">{{ getNodeLabel(bn.nodeId) }}</span>
              <span class="display-body">{{ bn.packageType }}</span>
              <span class="cf-bound-arrow">→</span>
              <span class="display-body-light">{{ bn.fieldLabel }}</span>
              <span class="cf-bound-value">{{ formatBoundValue(bn) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <el-button class="intercom-btn-outlined" @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button class="intercom-btn-primary" :data-tutorial-target="getTutorialSaveTarget()" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatCfDisplayValue } from '../utils/display.js'
import { getNodeDisplayNameById } from '../utils/solutionState.js'
import DateQuickRangePopover from './DateQuickRangePopover.vue'
import { useGuidedTutorial } from '../composables/useGuidedTutorial.js'
import {
  SOLUTION_REUSE_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_VALUES,
} from '../utils/guidedTutorialConfig.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  customField: { type: Object, default: null },
  boundNodes: { type: Array, default: () => [] },
  currentValue: { type: [String, Number, Array, Object], default: null },
  nodeList: { type: Array, default: () => [] },
  onWriteBack: { type: Function, default: null },
  showBatchAction: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'save', 'batch'])

const editValue = ref(null)
const editMode = ref('recent')
const writingBack = ref(false)
const tutorialSelectRef = ref(null)
let pendingTutorialStep = ''
let tutorialSelectCloseTimer = null
const {
  state: guidedTutorialState,
  completeStep: completeGuidedTutorialStep,
  isStep: isGuidedTutorialStep,
} = useGuidedTutorial()

const isDateType = computed(() => props.customField?.type?.includes('日期'))
const isNumberType = computed(() => props.customField?.type?.includes('数值'))
const isMultiSelect = computed(() =>
  ['搜索多选', '列表输入', '下拉多选'].includes(props.customField?.type)
)

const formattedOptions = computed(() => {
  const raw = props.boundNodes[0]?.options || []
  if (!raw.length) return []
  if (typeof raw[0] === 'object') return raw
  return raw.map(opt => ({ value: opt, label: String(opt) }))
})

function getTutorialEditTarget() {
  if (!guidedTutorialState.active || guidedTutorialState.taskId !== SOLUTION_REUSE_TUTORIAL_ID) return undefined
  if (props.customField?.name === '分析类目') return 'edit-analysis-value'
  if (props.customField?.name === '竞争品牌') return 'edit-competitor-value'
  return undefined
}

function getTutorialSelectPopperClass() {
  const isAnalysisStep = props.customField?.name === '分析类目'
    && isGuidedTutorialStep('change-analysis-category')
  const isCompetitorStep = props.customField?.name === '竞争品牌'
    && isGuidedTutorialStep('change-competitor-brand')
  return isAnalysisStep || isCompetitorStep ? 'guided-tutorial-select-popper' : undefined
}

function finishPendingTutorialStep() {
  if (!pendingTutorialStep) return
  const stepId = pendingTutorialStep
  pendingTutorialStep = ''
  if (tutorialSelectCloseTimer) window.clearTimeout(tutorialSelectCloseTimer)
  tutorialSelectCloseTimer = null
  if (isGuidedTutorialStep(stepId)) completeGuidedTutorialStep(stepId)
}

function handleTutorialSelectVisibleChange(visible) {
  if (!visible) finishPendingTutorialStep()
}

function completeTutorialStepAfterSelectClose(stepId) {
  pendingTutorialStep = stepId
  tutorialSelectRef.value?.blur?.()
  tutorialSelectRef.value?.$el?.querySelector?.('input')?.blur?.()
  if (tutorialSelectCloseTimer) window.clearTimeout(tutorialSelectCloseTimer)
  tutorialSelectCloseTimer = window.setTimeout(finishPendingTutorialStep, 180)
}

function getTutorialSaveTarget() {
  if (
    isGuidedTutorialStep('save-analysis-category')
    || isGuidedTutorialStep('save-competitor-brand')
  ) return 'save-custom-field-value'
  return undefined
}

function handleTutorialValueChange(value) {
  const values = (Array.isArray(value) ? value : [value]).map(item => String(item || '').trim())
  if (
    props.customField?.name === '分析类目'
    && isGuidedTutorialStep('change-analysis-category')
    && values.includes(SOLUTION_REUSE_TUTORIAL_VALUES.secondCategory)
  ) {
    completeTutorialStepAfterSelectClose('change-analysis-category')
  }
  if (
    props.customField?.name === '竞争品牌'
    && isGuidedTutorialStep('change-competitor-brand')
    && values.includes(SOLUTION_REUSE_TUTORIAL_VALUES.secondCompetitorBrand)
  ) {
    completeTutorialStepAfterSelectClose('change-competitor-brand')
  }
}

function initEditState() {
  const v = props.currentValue
  if (isDateType.value) {
    editValue.value = { days: v?.days || 30, dateRange: v?.dateRange || [] }
    editMode.value = v?.mode || 'recent'
  } else if (isNumberType.value) {
    editValue.value = { min: v?.min ?? null, max: v?.max ?? null }
    editMode.value = v?.mode || 'unlimited'
  } else if (Array.isArray(v)) {
    editValue.value = [...v]
  } else {
    editValue.value = v ?? ''
  }
  writingBack.value = false
}

function applyQuickDateRange(dateRange) {
  if (!editValue.value || typeof editValue.value !== 'object') {
    editValue.value = { days: 30, dateRange: [] }
  }
  editMode.value = 'range'
  editValue.value.dateRange = [...dateRange]
}

function getNodeLabel(nodeId) {
  return getNodeDisplayNameById(props.nodeList || [], nodeId)
}

function formatBoundValue(binding) {
  const node = (props.nodeList || []).find(n => n.id === binding.nodeId)
  if (!node) return ''
  const value = node.formData?.[binding.fieldKey]
  const mode = node.modeData?.[binding.fieldKey]
  return formatCfDisplayValue(value, mode, props.customField?.type)
}

async function writeBack() {
  if (!props.onWriteBack) return
  let payload = editValue.value
  if (isDateType.value || isNumberType.value) {
    payload = { ...editValue.value, mode: editMode.value }
  }
  writingBack.value = true
  try {
    await props.onWriteBack({ customFieldId: props.customField?.customFieldId, value: payload })
  } finally {
    writingBack.value = false
  }
}

function save() {
  let payload = editValue.value
  if (isDateType.value || isNumberType.value) {
    payload = { ...editValue.value, mode: editMode.value }
  }
  emit('save', { customFieldId: props.customField?.customFieldId, value: payload })
  emit('update:modelValue', false)
}

watch(() => props.modelValue, (val) => {
  if (val) initEditState()
})

onBeforeUnmount(() => {
  if (tutorialSelectCloseTimer) window.clearTimeout(tutorialSelectCloseTimer)
})
</script>

<style scoped>
.cf-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.cf-edit-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.cf-edit-value-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.cf-edit-value-header > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cf-edit-value-header small {
  color: #989398;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.4;
}
.cf-edit-batch-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 30px;
  flex-shrink: 0;
  padding: 0 11px;
  color: #343134;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  border: 1px solid rgba(29,29,31,0.14);
  border-radius: 9px;
  background: #fff;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.cf-edit-batch-action > span {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--ui-accent);
}
.cf-edit-batch-action:hover {
  color: #171717;
  border-color: var(--ui-accent);
  transform: translateY(-1px);
}
.cf-edit-batch-action:focus-visible {
  outline: 2px solid var(--ui-accent-ring);
  outline-offset: 2px;
}
.cf-edit-section {
  padding: 16px;
  background: rgba(0,0,0,0.015);
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.04);
}
.cf-bound-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cf-bound-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.70);
  border-radius: 8px;
  font-size: 13px;
}
.cf-bound-node-label {
  background: rgba(0,0,0,0.04);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  flex-shrink: 0;
}
.cf-bound-arrow {
  color: #c7c7cc;
  font-size: 12px;
}
.cf-bound-value {
  margin-left: auto;
  font-size: 12px;
  color: var(--ui-accent);
  font-weight: 500;
}
</style>
