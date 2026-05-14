<template>
  <aside class="right-panel nm-inspector" :class="{ 'nm-inspector-collapsed': !expanded }">
    <div class="panel-toolbar nm-inspector-toolbar">
      <span class="display-feature-title">结果与摘要</span>
      <el-button text size="small" @click="$emit('toggle-expanded')">
        {{ expanded ? '收起' : '展开' }}
      </el-button>
    </div>

    <div v-if="expanded" class="nm-inspector-body">
      <div class="panel-name-area nm-inspector-section">
        <slot name="header" />
      </div>

      <div class="json-area nm-inspector-section">
        <div class="json-toolbar nm-inspector-controls">
          <slot name="tabs" />
        </div>
        <div class="nm-inspector-content">
          <slot />
        </div>
      </div>
    </div>

    <div v-else class="nm-inspector-collapsed-body">
      <slot name="collapsed">Inspector</slot>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  expanded: {
    type: Boolean,
    default: true,
  },
})

defineEmits(['toggle-expanded'])
</script>

<style scoped>
.nm-inspector {
  min-width: 0;
  overflow: hidden;
}

.nm-inspector-collapsed {
  width: 88px;
  padding: 20px 12px;
}

.nm-inspector-body {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

.nm-inspector-section {
  min-width: 0;
}

.nm-inspector-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.nm-inspector-collapsed-body {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12px;
  color: rgba(0, 0, 0, 0.48);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  word-break: break-word;
}

@media (max-width: 960px) {
  .nm-inspector-collapsed {
    width: auto;
    padding: 20px;
  }

  .nm-inspector-collapsed-body {
    justify-content: flex-start;
    padding-top: 0;
  }
}
</style>
