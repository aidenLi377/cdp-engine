<template>
  <article class="combination-lesson">
    <span>拉力方案组 · 第 4 课</span>
    <h1>以后分析更多竞品，不用重复搭建</h1>
    <p>复用你已完成的三个拉力方案。竞争品牌字段通过同名聚合、按各方案自己的绑定关系生效；输入三行品牌即可准备九个人群包。</p>
    <ol><li>打开已有拉力文件夹的三方案组合</li><li>编辑竞争品牌，点击 Excel 批量并粘贴三行名单</li><li>展开预览，核对每个品牌对应的三个人群包</li><li>生成九个任务，选择圈完全部人群包</li></ol>
    <p><strong>前置条件：</strong>已发布的三方案组，三份方案均有名称、类型一致的“竞争品牌”自定义字段。</p>
    <p>操作约两分钟，平台执行时间另计。结束后可重新打开同一方案组，换成自己的竞品名单。</p>
    <button type="button" data-tutorial-start @click="$emit('start')">开始 2 分钟多竞品实操 →</button>
  </article>
</template>
<script setup>defineEmits(['start'])</script>
<style scoped>
.combination-lesson { max-width: 1000px; margin: 24px auto; padding: 24px; color: #172b45; }
h1 { font-size: clamp(24px, 3vw, 36px); } p, li { font-size: 14px; line-height: 1.9; } li { padding: 8px; } span { font-size: 12px; color: #2376d9; }
button { padding: 12px 22px; background: #172b45; color: white; border: 0; border-radius: 8px; cursor: pointer; }
</style>
