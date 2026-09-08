<template>
  <section v-if="content" class="operation-comparison" aria-label="人工操作与 X-Data 操作对比">
    <header><span>同一个业务任务</span><h2>{{ content.task }}</h2></header>
    <div class="operation-comparison__columns">
      <article><h3>人工在平台上操作</h3><ol><li v-for="text in content.manual" :key="text">{{ text }}</li></ol></article>
      <article class="operation-comparison__product"><h3>使用 X-Data</h3><ol><li v-for="text in content.product" :key="text">{{ text }}</li></ol></article>
    </div>
    <p><strong>提效在哪里</strong>{{ content.value }}</p>
    <small>对比的是配置、整理与提交操作；平台实际圈人和取数仍需要执行时间。</small>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { TUTORIAL_OPERATION_COMPARISONS } from '../utils/tutorialComparisons.js'
const props = defineProps({ tutorialId: String })
const content = computed(() => TUTORIAL_OPERATION_COMPARISONS[props.tutorialId])
</script>
<style scoped>
.operation-comparison { max-width: 1000px; margin: 24px auto; padding: 24px; border: 1px solid #dce4ed; border-radius: 14px; color: #172b45; background: #fff; }
header > span { color: #65778d; font-size: 11px; } h2 { margin: 8px 0 20px; font-size: 20px; line-height: 1.5; }
.operation-comparison__columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
article { padding: 16px; border-left: 2px solid #dce4ed; } .operation-comparison__product { border-color: #2376d9; background: #f5f9ff; }
h3 { margin: 0 0 12px; font-size: 13px; } ol { margin: 0; padding-left: 18px; } li { padding: 4px 0; font-size: 13px; line-height: 1.65; }
p { margin: 20px 0 8px; font-size: 13px; line-height: 1.7; } p strong { margin-right: 12px; } small { color: #738296; font-size: 11px; }
@media(max-width: 640px) { .operation-comparison__columns { grid-template-columns: 1fr; gap: 12px; } .operation-comparison { margin: 16px; padding: 18px; } }
</style>
