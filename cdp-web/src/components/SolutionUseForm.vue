<template>
  <div class="solution-use-shell">
    <div v-if="customFieldSections.length === 0" class="solution-use-empty">
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
          <div>
            <div class="display-feature-title">{{ section.name }}</div>
            <div class="display-body-light">{{ section.type }}</div>
          </div>
          <div class="solution-use-tags">
            <span
              v-for="binding in section.bindings"
              :key="binding.nodeId + binding.fieldKey"
              class="badge-mono"
            >
              {{ binding.packageType }} &middot; {{ binding.fieldLabel }}
            </span>
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
                      :min="1"
                      :max="366"
                      size="small"
                      controls-position="right"
                      class="intercom-input"
                      style="width:120px"
                      @change="onCfValueChange(section)"
                    />
                    <span class="display-body">天</span>
                  </div>
                  <div v-if="cfValueModes[section.customFieldId] === 'range'" class="range-inputs">
                    <el-date-picker
                      v-model="cfValues[section.customFieldId].dateRange"
                      type="daterange"
                      range-separator="至"
                      start-placeholder="开始日期"
                      end-placeholder="结束日期"
                      format="YYYY-MM-DD"
                      value-format="YYYYMMDD"
                      size="small"
                      class="intercom-input"
                      style="width:260px"
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
                    size="small"
                    class="intercom-radio-group"
                    @change="onCfValueChange(section)"
                  >
                    <el-radio-button value="unlimited">不限</el-radio-button>
                    <el-radio-button value="min">≥ 最小值</el-radio-button>
                    <el-radio-button value="range">自定义区间</el-radio-button>
                  </el-radio-group>
                  <div class="range-inputs" v-if="cfValueModes[section.customFieldId] !== 'unlimited'">
                    <el-input-number
                      v-model="cfValues[section.customFieldId].min"
                      :min="0"
                      :controls="false"
                      placeholder="最小值"
                      size="small"
                      class="intercom-input"
                      style="width:140px"
                      @change="onCfValueChange(section)"
                    />
                    <span v-if="cfValueModes[section.customFieldId] === 'range'" class="display-body range-sep">—</span>
                    <el-input-number
                      v-if="cfValueModes[section.customFieldId] === 'range'"
                      v-model="cfValues[section.customFieldId].max"
                      :min="0"
                      :controls="false"
                      placeholder="最大值"
                      size="small"
                      class="intercom-input"
                      style="width:140px"
                      @change="onCfValueChange(section)"
                    />
                  </div>
                </div>
              </template>

              <!-- fallback: 普通输入 -->
              <template v-else>
                <el-input
                  v-model="cfValues[section.customFieldId]"
                  class="intercom-input"
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

function initCfValues() {
  props.customFieldSections.forEach((section) => {
    const id = section.customFieldId
    const dv = section.defaultValue || {}

    if (section.type && section.type.includes('日期')) {
      cfValues[id] = {
        days: dv.days || 30,
        dateRange: dv.dateRange || [],
      }
      cfValueModes[id] = dv.mode || 'recent'
    } else if (section.type && section.type.includes('数值')) {
      cfValues[id] = {
        min: dv.min ?? null,
        max: dv.max ?? null,
      }
      cfValueModes[id] = dv.mode || 'unlimited'
    } else {
      cfValues[id] = dv
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
  border-color: #ff6b4a !important;
  box-shadow: 0 0 0 3px rgba(255, 107, 74, 0.15) !important;
  transition: all 0.2s ease;
}
</style>
