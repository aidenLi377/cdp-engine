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
          将按下方分组暴露给工作台使用，未勾选的字段不会进入方案使用态表单。
        </span>
      </div>

      <div v-if="sections.length === 0" class="empty-state solution-preview-empty">
        <div class="empty-icon">⌁</div>
        <div class="display-body-light">当前还没有勾选任何工作台可编辑字段。</div>
      </div>

      <div v-else class="drawer-scroll">
        <div
          v-for="section in sections"
          :key="section.nodeId"
          class="intercom-card drawer-form-card solution-preview-card"
        >
          <div class="drawer-form-title solution-preview-title">
            <div>
              <div class="display-feature-title">节点 {{ section.index + 1 }}</div>
              <div class="display-body-light">{{ section.node.packageType }}</div>
            </div>
            <div class="solution-preview-tags">
              <span v-for="field in section.fields" :key="field.key" class="badge-mono">
                {{ field.Label || field.label || field.key }}
              </span>
            </div>
          </div>

          <div class="solution-readonly-surface solution-preview-surface">
            <DynamicForm :node="section.node" />
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import DynamicForm from './DynamicForm.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  sections: { type: Array, default: () => [] },
  solutionName: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>
