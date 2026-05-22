<template>
  <el-drawer
    :model-value="modelValue"
    title="工作台使用预览"
    size="520px"
    :destroy-on-close="true"
    class="intercom-drawer"
    @close="$emit('update:modelValue', false)"
  >
    <div class="drawer-container solution-preview-drawer">
      <div class="drawer-notice intercom-card">
        <span class="display-body">
          <strong class="display-mono">{{ solutionName || '当前方案' }}</strong>
          发布后在工作台中按下方自定义字段使用，每个字段可控制多个组件。
        </span>
      </div>

      <div v-if="customFieldSections.length === 0" class="empty-state solution-preview-empty">
        <div class="empty-icon">&#8991;</div>
        <div class="display-body-light">当前还没有创建任何自定义字段。</div>
        <div class="display-body-light" style="margin-top:8px">创建一对多自定义字段后，这里将展示工作台使用效果预览。</div>
      </div>

      <div v-else class="drawer-scroll">
        <!-- 模拟工作台字段卡片横排 -->
        <div class="preview-cf-bar">
          <div
            v-for="section in customFieldSections"
            :key="section.customFieldId"
            class="preview-cf-card"
          >
            <span class="cf-type-indicator" :class="getCfTypeClass(section.type)"></span>
            <div class="preview-cf-card-info">
              <span class="display-body strong">{{ section.name }}</span>
              <span class="display-body-light preview-cf-card-value">{{ getDefaultSummary(section) }}</span>
            </div>
            <span class="display-mono preview-cf-card-count">{{ section.bindings.length }}</span>
          </div>
        </div>

        <div class="preview-section-label display-body-light" style="margin:16px 0 8px">
          字段详情与绑定关系
        </div>

        <TransitionGroup name="preview-stagger">
        <div
          v-for="(section, index) in customFieldSections"
          :key="section.customFieldId"
          class="intercom-card drawer-form-card solution-preview-card cascade-enter"
          :style="{ animationDelay: `${index * 60}ms` }"
        >
          <div class="drawer-form-title solution-preview-title">
            <div>
              <div class="display-feature-title">
                <span class="cf-type-indicator" :class="getCfTypeClass(section.type)" style="margin-right:8px"></span>
                {{ section.name }}
              </div>
              <div class="display-body-light">{{ section.type }}</div>
              <div v-if="section.group" class="display-mono" style="margin-top:2px">{{ section.group }}</div>
            </div>
          </div>

          <div v-if="hasDefaultValue(section)" class="preview-default-row">
            <span class="display-body-light">默认值：</span>
            <span class="display-body strong">{{ getDefaultSummary(section) }}</span>
          </div>

          <div class="preview-bindings">
            <div class="display-body-light" style="margin-bottom:8px">
              影响 {{ section.bindings.length }} 个组件字段：
            </div>
            <div
              v-for="binding in section.bindings"
              :key="binding.nodeId + binding.fieldKey"
              class="preview-binding-item"
            >
              <span class="display-mono preview-binding-pkg">{{ binding.packageType }}</span>
              <span class="preview-binding-arrow">→</span>
              <span class="display-body">{{ binding.fieldLabel }}</span>
              <span v-if="binding.widgetType" class="display-mono preview-binding-widget">{{ binding.widgetType }}</span>
            </div>
          </div>
        </div>
        </TransitionGroup>

        <div class="preview-empty-hint display-body-light" style="margin-top:24px">
          以上为工作台使用该方案时用户将看到的界面结构与字段绑定关系。
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { getCfTypeClass } from '../utils/display.js'

defineProps({
  modelValue: { type: Boolean, default: false },
  customFieldSections: { type: Array, default: () => [] },
  solutionName: { type: String, default: '' },
})

defineEmits(['update:modelValue'])

function hasDefaultValue(section) {
  const dv = section.defaultValue
  if (dv === undefined || dv === null) return false
  if (typeof dv === 'object' && !Array.isArray(dv) && Object.keys(dv).length === 0) return false
  if (Array.isArray(dv) && dv.length === 0) return false
  return true
}

function getDefaultSummary(section) {
  const dv = section.defaultValue
  if (dv === undefined || dv === null) return '(未设默认值)'
  if (Array.isArray(dv)) return dv.length > 0 ? dv.slice(0, 3).join('、') + (dv.length > 3 ? '…' : '') : '(空数组)'
  if (typeof dv === 'object') {
    if (dv.days !== undefined) return `过去 ${dv.days} 天`
    if (dv.dateRange && Array.isArray(dv.dateRange) && dv.dateRange.length === 2) return `${dv.dateRange[0]} ~ ${dv.dateRange[1]}`
    if (dv.min !== undefined) {
      if (dv.mode === 'unlimited') return '不限'
      if (dv.mode === 'range') return `${dv.min ?? '?'} — ${dv.max ?? '?'}`
      return `≥ ${dv.min ?? '?'}`
    }
    return JSON.stringify(dv)
  }
  return String(dv)
}
</script>

<style scoped>
.preview-cf-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  background: rgba(0,0,0,0.02);
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.05);
}
.preview-cf-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.85);
}
.preview-cf-card-info {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.preview-cf-card-value {
  font-size: 11px;
}
.preview-cf-card-count {
  background: rgba(0,0,0,0.04);
  padding: 1px 6px;
  border-radius: 99px;
  font-size: 10px;
  flex-shrink: 0;
}
.preview-default-row {
  padding: 10px 14px;
  margin: 12px 0;
  background: rgba(255,107,74,0.04);
  border-left: 3px solid #ff6b4a;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-bindings {
  margin-top: 8px;
}
.preview-binding-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
.preview-binding-pkg {
  background: rgba(0,0,0,0.04);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  flex-shrink: 0;
}
.preview-binding-arrow {
  color: #c7c7cc;
  font-size: 12px;
}
.preview-binding-widget {
  margin-left: auto;
  font-size: 10px;
  color: #a1a1a6;
}
.preview-section-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.preview-empty-hint {
  text-align: center;
  font-size: 12px;
  color: #a1a1a6;
}
</style>
