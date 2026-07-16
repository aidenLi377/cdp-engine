<template>
  <div class="solution-use-shell">
    <div v-if="customFieldSections.length === 0" class="solution-use-empty">
      <div class="empty-state-illustration use">⌁</div>
      <div class="display-sub">当前方案暂无自定义字段</div>
      <div class="display-body-light">
        {{ solutionName || '当前方案' }} 尚未配置自定义字段，请在方案中心创建后再使用。
      </div>
    </div>

    <div v-else class="solution-use-scroll">
      <div
        v-for="section in customFieldSections"
        :key="section.customFieldId"
        class="intercom-card solution-use-card"
        :class="{ 'use-card-highlighted': highlightedCfId === section.customFieldId }"
        @click="emit('highlightCf', section.customFieldId)"
        @mouseenter="emit('highlightCf', section.customFieldId)"
        @mouseleave="emit('highlightCf', null)"
      >
        <div class="solution-use-card-head">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="cf-type-indicator" :class="getUseCfTypeClass(section.type)"></span>
            <div>
              <div class="display-feature-title">{{ section.name }}</div>
              <div class="display-body-light">{{ section.type }}</div>
            </div>
          </div>
          <div class="solution-use-tags">
            <template v-for="(binding, bi) in section.bindings" :key="binding.nodeId + binding.fieldKey">
              <span v-if="bi < 4" class="badge-mono">
                {{ binding.nodeDisplayName || binding.packageType }} &middot; {{ binding.fieldLabel }}
              </span>
            </template>
            <span v-if="section.bindings.length > 4" class="tag-more">+{{ section.bindings.length - 4 }}</span>
          </div>
        </div>

        <div class="solution-use-card-body">
          <el-form label-position="top" size="large">
            <el-form-item>
              <template #label>
                <span class="display-body strong">{{ section.name }}</span>
              </template>

              <!-- 日期_切换 -->
              <template v-if="section.type && section.type.includes('日期')">
                <div class="range-block">
                  <el-radio-group
                    v-model="cfValueModes[section.customFieldId]"
                    size="small"
                    class="intercom-radio-group"
                    @change="onCfValueChange(section)"
                  >
                    <el-radio-button value="recent">过去 N 天</el-radio-button>
                    <el-radio-button value="range">固定日期</el-radio-button>
                  </el-radio-group>
                  <div v-if="cfValueModes[section.customFieldId] === 'recent'" class="range-inputs">
                    <el-input-number
                      v-model="cfValues[section.customFieldId].days"
                      :min="1" :max="366"
                      size="small" controls-position="right"
                      class="intercom-input" style="width:120px"
                      @change="onCfValueChange(section)"
                    />
                    <span class="display-body">天</span>
                  </div>
                  <div v-if="cfValueModes[section.customFieldId] === 'range'" class="range-inputs">
                    <el-date-picker
                      v-model="cfValues[section.customFieldId].dateRange"
                      type="daterange" range-separator="至"
                      start-placeholder="开始日期" end-placeholder="结束日期"
                      format="YYYY-MM-DD" value-format="YYYYMMDD"
                      size="small" class="intercom-input" style="width:260px"
                      @change="onCfValueChange(section)"
                    />
                  </div>
                </div>
              </template>

              <!-- 数值_切换 -->
              <template v-else-if="section.type && section.type.includes('数值')">
                <div class="range-block">
                  <el-radio-group
                    v-model="cfValueModes[section.customFieldId]"
                    size="small" class="intercom-radio-group"
                    @change="onCfValueChange(section)"
                  >
                    <el-radio-button value="unlimited">不限</el-radio-button>
                    <el-radio-button value="min">≥ 最小值</el-radio-button>
                    <el-radio-button value="range">自定义区间</el-radio-button>
                  </el-radio-group>
                  <div class="range-inputs" v-if="cfValueModes[section.customFieldId] !== 'unlimited'">
                    <el-input-number
                      v-model="cfValues[section.customFieldId].min"
                      :min="0" :controls="false" placeholder="最小值"
                      size="small" class="intercom-input" style="width:140px"
                      @change="onCfValueChange(section)"
                    />
                    <span v-if="cfValueModes[section.customFieldId] === 'range'" class="display-body range-sep">—</span>
                    <el-input-number
                      v-if="cfValueModes[section.customFieldId] === 'range'"
                      v-model="cfValues[section.customFieldId].max"
                      :min="0" :controls="false" placeholder="最大值"
                      size="small" class="intercom-input" style="width:140px"
                      @change="onCfValueChange(section)"
                    />
                  </div>
                </div>
              </template>

              <!-- 搜索多选 / 列表输入 -->
              <template v-else-if="isMultiSelectType(section.type)">
                <el-select-v2
                  v-model="cfValues[section.customFieldId]"
                  :options="getSectionOptions(section)"
                  multiple filterable clearable
                  :placeholder="'请搜索并选择' + section.name"
                  class="flex-1 intercom-input select-auto-height"
                  @change="onCfValueChange(section)"
                />
              </template>

              <!-- 搜索单选 -->
              <template v-else-if="section.type === '搜索单选'">
                <el-select-v2
                  v-model="cfValues[section.customFieldId]"
                  :options="getSectionOptions(section)"
                  filterable clearable
                  :placeholder="'请搜索并选择' + section.name"
                  class="flex-1 intercom-input"
                  @change="onCfValueChange(section)"
                />
              </template>

              <!-- 复选组 -->
              <template v-else-if="section.type === '复选组'">
                <el-checkbox-group
                  v-model="cfValues[section.customFieldId]"
                  class="custom-checkbox-group"
                  @change="onCfValueChange(section)"
                >
                  <el-checkbox v-for="opt in getSectionOptions(section)" :key="opt.value" :label="opt.value">
                    {{ opt.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </template>

              <!-- 单选组 -->
              <template v-else-if="section.type === '单选组'">
                <el-radio-group
                  v-model="cfValues[section.customFieldId]"
                  class="intercom-radio-group"
                  @change="onCfValueChange(section)"
                >
                  <el-radio-button v-for="opt in getSectionOptions(section)" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </el-radio-button>
                </el-radio-group>
              </template>

              <!-- 普通输入框 -->
              <template v-else>
                <el-input
                  v-model="cfValues[section.customFieldId]"
                  class="intercom-input"
                  :placeholder="'请输入' + section.name"
                  @input="onCfValueChange(section)"
                />
              </template>

            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch, onMounted } from 'vue'

const props = defineProps({
  customFieldSections: { type: Array, default: () => [] },
  solutionName: { type: String, default: '' },
  highlightedCfId: { type: String, default: null },
})

const emit = defineEmits(['highlightCf', 'cfValueChange'])

const cfValues = reactive({})
const cfValueModes = reactive({})

function getUseCfTypeClass(type) {
  if (!type) return 'text'
  if (type.includes('日期')) return 'date'
  if (type.includes('数值')) return 'number'
  if (type.includes('搜索') || type.includes('下拉')) return 'select'
  return 'text'
}

function isMultiSelectType(type) {
  return type === '搜索多选' || type === '列表输入' || type === '下拉多选'
}

function formatOptions(options) {
  if (!options || options.length === 0) return []
  if (typeof options[0] === 'object') return options
  return options.map(opt => ({ value: opt, label: String(opt) }))
}

function getSectionOptions(section) {
  const allOptions = []
  const seen = new Set()
  ;(section.bindings || []).forEach(binding => {
    formatOptions(binding.options || []).forEach(opt => {
      const key = typeof opt === 'object' ? opt.value : opt
      if (!seen.has(key)) {
        seen.add(key)
        allOptions.push(opt)
      }
    })
  })
  return allOptions
}

function getInitialValue(section) {
  const dv = section.defaultValue || {}

  if (section.type && section.type.includes('日期')) {
    return {
      days: dv.days || 30,
      dateRange: dv.dateRange || [],
    }
  }
  if (section.type && section.type.includes('数值')) {
    return {
      min: dv.min ?? null,
      max: dv.max ?? null,
    }
  }
  // 多选类型初始化为数组
  if (isMultiSelectType(section.type) || section.type === '复选组') {
    return Array.isArray(dv) ? [...dv] : (dv != null && dv !== '' ? [dv] : [])
  }
  // 单选/输入类型初始化为字符串
  return typeof dv === 'string' ? dv : (dv != null && dv !== '' ? String(dv) : '')
}

function initCfValues() {
  // Clean up stale entries for custom fields no longer present
  const currentIds = new Set(props.customFieldSections.map(s => s.customFieldId))
  Object.keys(cfValues).forEach(key => {
    if (!currentIds.has(key)) {
      delete cfValues[key]
      delete cfValueModes[key]
    }
  })

  props.customFieldSections.forEach((section) => {
    const id = section.customFieldId

    if (section.type && section.type.includes('日期')) {
      const dv = section.defaultValue || {}
      cfValues[id] = { days: dv.days || 30, dateRange: dv.dateRange || [] }
      cfValueModes[id] = dv.mode || 'recent'
    } else if (section.type && section.type.includes('数值')) {
      const dv = section.defaultValue || {}
      cfValues[id] = { min: dv.min ?? null, max: dv.max ?? null }
      cfValueModes[id] = dv.mode || 'unlimited'
    } else {
      cfValues[id] = getInitialValue(section)
    }
  })
}

function onCfValueChange(section) {
  const id = section.customFieldId
  const value = cfValues[id]
  const mode = cfValueModes[id]

  let payload = value
  if (section.type && (section.type.includes('日期') || section.type.includes('数值'))) {
    payload = { ...value, mode }
  }

  emit('cfValueChange', { customFieldId: id, value: payload })
}

onMounted(() => { initCfValues() })
watch(() => props.customFieldSections, initCfValues, { deep: true })
</script>

<style scoped>
.use-card-highlighted {
  border-color: var(--ui-accent) !important;
  background: var(--ui-surface) !important;
  box-shadow: 0 0 0 3px var(--ui-accent-ring) !important;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
</style>
