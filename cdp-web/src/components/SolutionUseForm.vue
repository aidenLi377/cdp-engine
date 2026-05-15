<template>
  <div class="solution-use-shell">
    <div v-if="sections.length === 0" class="solution-use-empty">
      <div class="display-sub">当前方案暂无工作台字段</div>
      <div class="display-body-light">
        {{ solutionName || '当前方案' }} 尚未配置可在工作台填写的字段，右侧仍可查看当前生成结果。
      </div>
    </div>

    <div v-else class="solution-use-scroll">
      <div
        v-for="section in sections"
        :key="section.nodeId"
        class="intercom-card solution-use-card"
      >
        <div class="solution-use-card-head">
          <div>
            <div class="display-feature-title">节点 {{ section.index + 1 }}</div>
            <div class="display-body-light">{{ section.node.packageType }}</div>
          </div>

          <div class="solution-use-tags">
            <span v-for="field in section.fields" :key="field.key" class="badge-mono">
              {{ field.Label || field.label || field.key }}
            </span>
          </div>
        </div>

        <div class="solution-use-card-body">
          <DynamicForm :node="section.node" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import DynamicForm from './DynamicForm.vue'

defineProps({
  sections: { type: Array, default: () => [] },
  solutionName: { type: String, default: '' },
})
</script>
