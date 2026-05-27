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
          <div class="display-body strong" style="margin-bottom:12px">编辑值</div>

          <!-- 日期 -->
          <template v-if="isDateType">
            <el-radio-group v-model="editMode" size="small" class="intercom-radio-group" style="margin-bottom:10px">
              <el-radio-button value="recent">过去 N 天</el-radio-button>
              <el-radio-button value="range">固定日期</el-radio-button>
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
              v-model="editValue"
              :options="formattedOptions"
              multiple filterable clearable
              :placeholder="'搜索并选择' + customField.name"
              class="flex-1 intercom-input"
              style="width:100%"
            />
          </template>

          <!-- 搜索单选 -->
          <template v-else-if="customField.type === '搜索单选'">
            <el-select-v2
              v-model="editValue"
              :options="formattedOptions"
              filterable clearable
              :placeholder="'搜索并选择' + customField.name"
              class="flex-1 intercom-input"
              style="width:100%"
            />
          </template>

          <!-- 复选组 -->
          <template v-else-if="customField.type === '复选组'">
            <el-checkbox-group v-model="editValue" class="custom-checkbox-group">
              <el-checkbox v-for="opt in formattedOptions" :key="opt.value" :label="opt.value">{{ opt.label }}</el-checkbox>
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
              同步到当前工作台
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
      <el-button class="intercom-btn-primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { formatCfDisplayValue } from '../utils/display.js'
import { getNodeDisplayNameById } from '../utils/solutionState.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  customField: { type: Object, default: null },
  boundNodes: { type: Array, default: () => [] },
  currentValue: { type: [String, Number, Array, Object], default: null },
  nodeList: { type: Array, default: () => [] },
  onWriteBack: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue', 'save'])

const editValue = ref(null)
const editMode = ref('recent')
const writingBack = ref(false)

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
  color: #ff6b4a;
  font-weight: 500;
}
</style>
