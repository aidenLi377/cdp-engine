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
          将按下方自定义字段暴露给工作台使用，每个字段可控制多个原始组件。
        </span>
      </div>

      <div v-if="customFieldSections.length === 0" class="empty-state solution-preview-empty">
        <div class="empty-icon">&#8991;</div>
        <div class="display-body-light">当前还没有创建任何自定义字段。</div>
      </div>

      <div v-else class="drawer-scroll">
        <div
          v-for="section in customFieldSections"
          :key="section.customFieldId"
          class="intercom-card drawer-form-card solution-preview-card"
        >
          <div class="drawer-form-title solution-preview-title">
            <div>
              <div class="display-feature-title">{{ section.name }}</div>
              <div class="display-body-light">{{ section.type }}</div>
            </div>
            <div class="solution-preview-tags">
              <span
                v-for="binding in section.bindings"
                :key="binding.nodeId + binding.fieldKey"
                class="badge-mono"
              >
                {{ binding.packageType }} &middot; {{ binding.fieldLabel }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  customFieldSections: { type: Array, default: () => [] },
  solutionName: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>
