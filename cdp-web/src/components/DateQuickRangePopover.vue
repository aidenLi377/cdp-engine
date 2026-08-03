<template>
  <el-popover
    v-model:visible="visible"
    placement="right-start"
    :width="312"
    trigger="click"
    :disabled="disabled"
    :teleported="true"
    popper-class="date-quick-range-popper"
    @show="refreshRanges"
  >
    <template #reference>
      <slot />
    </template>

    <div class="date-quick-range-panel" aria-label="快捷选择固定日期">
      <div class="date-quick-range-header">
        <strong>快捷选择</strong>
        <span>自动填入固定日期</span>
      </div>

      <section
        v-for="group in rangeGroups"
        :key="group.label"
        class="date-quick-range-group"
        :aria-label="group.label"
      >
        <div class="date-quick-range-group-label">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="item.key"
          type="button"
          class="date-quick-range-option"
          @click="selectRange(item.dateRange)"
        >
          <span class="date-quick-range-option-label">{{ item.label }}</span>
          <span class="date-quick-range-option-value">{{ formatRange(item.dateRange) }}</span>
        </button>
      </section>

      <div class="date-quick-range-note">日周期不含今天，月周期不含本月</div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref } from 'vue'
import { createQuickDateRangeGroups } from '../utils/dateQuickRanges.js'

defineProps({
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])
const visible = ref(false)
const rangeGroups = ref(createQuickDateRangeGroups())

function refreshRanges() {
  rangeGroups.value = createQuickDateRangeGroups()
}

function formatRange(dateRange) {
  return dateRange
    .map(value => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`)
    .join(' 至 ')
}

function selectRange(dateRange) {
  emit('select', [...dateRange])
  visible.value = false
}
</script>

<style scoped>
.date-quick-range-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.date-quick-range-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ui-border, rgba(0, 0, 0, 0.08));
}

.date-quick-range-header strong {
  color: var(--ui-ink, #1d1d1f);
  font-size: 14px;
  font-weight: 600;
}

.date-quick-range-header span,
.date-quick-range-note {
  color: var(--ui-text-secondary, #86868b);
  font-size: 11px;
}

.date-quick-range-group {
  display: grid;
  gap: 6px;
}

.date-quick-range-group-label {
  color: var(--ui-text-secondary, #86868b);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.date-quick-range-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--ui-fill, #f5f5f7);
  color: var(--ui-ink, #1d1d1f);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.date-quick-range-option:hover,
.date-quick-range-option:focus-visible {
  border-color: var(--ui-control-border, rgba(0, 0, 0, 0.14));
  background: var(--ui-surface, #ffffff);
  outline: none;
  transform: translateX(2px);
}

.date-quick-range-option-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 550;
}

.date-quick-range-option-value {
  color: var(--ui-text-secondary, #86868b);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  white-space: nowrap;
}

.date-quick-range-note {
  padding-top: 2px;
  line-height: 1.5;
}
</style>
